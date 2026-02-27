const AskevaConfig = require('../models/AskevaConfig.model')
const AskevaTemplate = require('../models/AskevaTemplate.model')
const EventTemplateMapping = require('../models/EventTemplateMapping.model')
const askevaService = require('../services/askeva.service')
const productSyncService = require('../services/productSync.service')
const { encrypt, decrypt } = require('../utils/encryption.util')

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

function getCompanyId(req) {
  return req.user?.companyId ?? COMPANY_ID
}

function normalizeUrl(url) {
  if (!url) return 'https://backend.askeva.io'
  try {
    const u = new URL(String(url).trim())
    return `${u.protocol}//${u.host}`
  } catch {
    const m = String(url).trim().match(/^(https?:\/\/[^/]+)/)
    return m ? m[1] : 'https://backend.askeva.io'
  }
}

exports.getConfig = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
      .select('-apiKey -webhookSecret')
      .lean()

    // Fallback: search for any existing config if specific one not found
    if (!config) {
      config = await AskevaConfig.findOne().select('-apiKey -webhookSecret').lean()
    }

    if (!config) {
      return res.json({ success: true, data: { config: null } })
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    const webhookUrl =
      config.webhookUrl || askevaService.generateWebhookUrl(companyId, baseUrl)

    res.json({
      success: true,
      data: {
        config: {
          ...config,
          webhookUrl,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch configuration' },
    })
  }
}

exports.getCredentials = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const config = await AskevaConfig.findOne({ companyId })
      .select('+apiKey')
      .lean()

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { message: 'Configuration not found' },
      })
    }

    const decryptedApiKey = config.apiKey ? decrypt(config.apiKey) : ''

    res.json({
      success: true,
      data: {
        companyId: config.companyId,
        apiKey: decryptedApiKey,
        backendUrl: config.backendUrl || 'https://backend.askeva.io',
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch credentials' },
    })
  }
}

exports.saveConfig = async (req, res) => {
  try {
    const { backendUrl, apiKey, companyId: bodyCompanyId } = req.body
    const companyId = bodyCompanyId || getCompanyId(req)

    if (!apiKey || !backendUrl) {
      return res.status(400).json({
        success: false,
        error: { message: 'Backend URL and API Key are required' },
      })
    }

    const normalizedBackendUrl = normalizeUrl(backendUrl)
    const encryptedApiKey = encrypt(apiKey.trim())

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    const webhookUrl = askevaService.generateWebhookUrl(companyId, baseUrl)

    // Flexible lookup: 
    // 1. Try bodyCompanyId
    // 2. Try 'default' if bodyCompanyId is different
    // 3. Try any existing config
    let existingConfig = await AskevaConfig.findOne({ companyId }).select('+apiKey +webhookSecret')
    if (!existingConfig && companyId !== 'default') {
      existingConfig = await AskevaConfig.findOne({ companyId: 'default' }).select('+apiKey +webhookSecret')
    }
    if (!existingConfig) {
      existingConfig = await AskevaConfig.findOne().select('+apiKey +webhookSecret')
    }

    const updateData = {
      companyId,
      providerName: 'AskEVA',
      backendUrl: normalizedBackendUrl,
      webhookUrl,
      isEnabled: true,
      updatedBy: req.user?.id,
    }

    if (apiKey && apiKey.trim()) {
      updateData.apiKey = encryptedApiKey
    } else if (existingConfig) {
      updateData.apiKey = existingConfig.apiKey
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'API Key is required for new configuration' },
      })
    }

    if (existingConfig?.webhookSecret) {
      updateData.webhookSecret = existingConfig.webhookSecret
    }
    if (!existingConfig && req.user?.id) {
      updateData.createdBy = req.user.id
    }

    const filter = existingConfig ? { _id: existingConfig._id } : { companyId }
    const config = await AskevaConfig.findOneAndUpdate(
      filter,
      updateData,
      { upsert: true, new: true, runValidators: true }
    )

    res.json({
      success: true,
      data: {
        config: {
          id: config._id,
          companyId: config.companyId,
          providerName: config.providerName,
          backendUrl: config.backendUrl,
          webhookUrl: config.webhookUrl,
          isEnabled: config.isEnabled,
          isConnected: config.isConnected,
          lastVerifiedAt: config.lastVerifiedAt,
          lastSyncedAt: config.lastSyncedAt,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to save configuration' },
    })
  }
}

exports.testConnection = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    const { apiKey, backendUrl } = req.body

    let config = await AskevaConfig.findOne({ companyId })
      .select('+apiKey')
      .lean()

    // Fallback search
    if (!config) {
      config = await AskevaConfig.findOne().select('+apiKey').lean()
    }

    const testConfig = {
      apiKey: apiKey || (config?.apiKey ? decrypt(config.apiKey) : ''),
      backendUrl: normalizeUrl(backendUrl || config?.backendUrl || 'https://backend.askeva.io'),
    }

    if (!testConfig.apiKey) {
      return res.status(400).json({
        success: false,
        error: { message: 'API Key is required' },
      })
    }

    const result = await askevaService.testConnection(companyId, testConfig)

    const updateFilter = config ? { _id: config._id } : { companyId }
    await AskevaConfig.updateOne(
      updateFilter,
      {
        isConnected: result.success,
        lastVerifiedAt: new Date(),
        connectionError: result.error || null,
      }
    )

    if (result.success) {
      res.json({ success: true, message: 'Connection successful' })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Connection failed' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to test connection' },
    })
  }
}

exports.disconnect = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const config = await AskevaConfig.findOne({ companyId })
    const cid = config ? config.companyId : companyId

    await AskevaConfig.deleteMany({}) // Remove all as we support only one active integration usually
    await AskevaTemplate.deleteMany({}) // Remove all templates
    await EventTemplateMapping.deleteMany({}) // Remove all event mappings

    // Also remove all products on disconnect
    const Product = require('../models/Product.model')
    await Product.deleteMany({})

    res.json({ success: true, message: 'ASKEVA disconnected successfully. All templates, products and event mappings have been cleared.' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to disconnect' },
    })
  }
}

exports.syncTemplates = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
    if (!config) {
      config = await AskevaConfig.findOne()
      if (config) companyId = config.companyId
    }
    const result = await askevaService.syncTemplates(companyId)

    if (result.success) {
      res.json({
        success: true,
        data: {
          synced: result.synced,
          message: result.message || `Successfully synced ${result.synced} templates`,
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to sync templates' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to sync templates' },
    })
  }
}

exports.syncProducts = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
    if (!config) {
      config = await AskevaConfig.findOne()
      if (config) companyId = config.companyId
    }
    const result = await productSyncService.syncProducts(companyId)

    if (result.success) {
      res.json({
        success: true,
        data: {
          count: result.count,
          message: `Successfully synced ${result.count} products`,
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to sync products' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to sync products' },
    })
  }
}

exports.getTemplates = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    // Keep template listing aligned with sync behavior when auth/user company is unavailable.
    if (!req.user?.companyId) {
      const config = await AskevaConfig.findOne({ companyId }).select('companyId').lean()
      if (!config) {
        const fallbackConfig = await AskevaConfig.findOne().select('companyId').lean()
        if (fallbackConfig?.companyId) companyId = fallbackConfig.companyId
      }
    }
    const requestedLimit = parseInt(req.query.limit, 10)
    const isGetAll = requestedLimit >= 1000
    const page = isGetAll ? 1 : Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = isGetAll ? 10000 : Math.max(1, Math.min(100, requestedLimit || 10))
    const skip = isGetAll ? 0 : (page - 1) * limit
    const status = req.query.status
    const category = req.query.category
    const search = req.query.search

    const query = { companyId }
    if (status) query.status = status.toUpperCase()
    if (category) query.category = category.toUpperCase()
    if (search) {
      query.$or = [
        { templateName: { $regex: search, $options: 'i' } },
        { templateId: { $regex: search, $options: 'i' } },
      ]
    }

    const [templates, total] = await Promise.all([
      AskevaTemplate.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AskevaTemplate.countDocuments(query),
    ])

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch templates' },
    })
  }
}

exports.mapTemplateToEvents = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { templateId, eventTypes } = req.body
    if (!companyId || !templateId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Template ID is required' },
      })
    }
    await AskevaTemplate.updateOne(
      { companyId, templateId },
      { mappedEventTypes: eventTypes || [] }
    )
    res.json({ success: true, message: 'Template mapping updated successfully' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to update template mapping' },
    })
  }
}

exports.getEventTemplateMappings = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const mappings = await EventTemplateMapping.find({ companyId })
      .populate('templateId', 'templateName templateId language status')
      .sort({ createdAt: -1 })
      .lean()
    res.json({ success: true, data: { mappings } })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch event template mappings' },
    })
  }
}

exports.getEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { id } = req.params
    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Mapping ID is required' },
      })
    }
    const mapping = await EventTemplateMapping.findOne({ _id: id, companyId })
      .populate('templateId', 'templateName templateId language status components')
      .lean()
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event template mapping not found' },
      })
    }
    res.json({ success: true, data: { mapping } })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch event template mapping' },
    })
  }
}

exports.saveEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const userId = req.user?.id
    const id = req.params.id || req.body.id
    const { hrmsEventType, templateId, templateName, isEnabled, variables } = req.body

    if (!companyId || !hrmsEventType || !templateId || !variables || !Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Event type, template ID, and variables are required' },
      })
    }

    for (const v of variables) {
      if (!v.templateVariable || !v.hrmsField) {
        return res.status(400).json({
          success: false,
          error: { message: 'Each variable must have templateVariable and hrmsField' },
        })
      }
    }

    const template = await AskevaTemplate.findOne({
      companyId,
      _id: templateId,
    }).lean()

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { message: 'Template not found' },
      })
    }

    const mappingData = {
      companyId,
      hrmsEventType,
      templateId,
      templateName: templateName || template.templateName,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      variables,
      updatedBy: userId,
    }

    let mapping
    if (id) {
      mapping = await EventTemplateMapping.findOneAndUpdate(
        { _id: id, companyId },
        mappingData,
        { new: true, runValidators: true }
      )
        .populate('templateId', 'templateName templateId language status')
        .lean()

      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: { message: 'Event template mapping not found' },
        })
      }
    } else {
      mappingData.createdBy = userId
      mapping = await EventTemplateMapping.create(mappingData)
      mapping = await EventTemplateMapping.findById(mapping._id)
        .populate('templateId', 'templateName templateId language status')
        .lean()
    }

    res.json({
      success: true,
      data: { mapping },
      message: id ? 'Event template mapping updated successfully' : 'Event template mapping created successfully',
    })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: { message: 'A mapping already exists for this event type' },
      })
    }
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to save event template mapping' },
    })
  }
}

exports.deleteEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { id } = req.params
    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Mapping ID is required' },
      })
    }
    const mapping = await EventTemplateMapping.findOneAndDelete({ _id: id, companyId })
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event template mapping not found' },
      })
    }
    res.json({ success: true, message: 'Event template mapping deleted successfully' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to delete event template mapping' },
    })
  }
}

exports.sendMessage = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const userId = req.user?.id
    const {
      to,
      templateName,
      language,
      parameters,
      module,
      candidateId,
      documentUrl,
      documentExpiry,
      recipientEmail,
    } = req.body

    if (!companyId || !to || !templateName) {
      return res.status(400).json({
        success: false,
        error: { message: 'Recipient phone number and template name are required' },
      })
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { message: 'User ID is required' },
      })
    }

    const result = await askevaService.sendMessage({
      companyId,
      triggeredBy: userId.toString(),
      module: module || 'other',
      candidateId: candidateId ? candidateId.toString() : undefined,
      payload: { to, templateName, language, parameters: parameters || {} },
      documentUrl,
      documentExpiry: documentExpiry ? new Date(documentExpiry) : undefined,
    })

    if (result.success) {
      res.json({
        success: true,
        data: {
          messageId: result.messageId,
          message: 'WhatsApp message sent successfully',
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to send message' },
        ...(recipientEmail && { fallbackUsed: true }),
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to send message' },
    })
  }
}

exports.handleWebhook = async (req, res) => {
  try {
    const { companyId } = req.params
    const signature = req.headers['x-hub-signature-256']
    const payload = JSON.stringify(req.body)

    const config = await AskevaConfig.findOne({ companyId }).select('+webhookSecret').lean()
    if (!config) {
      return res.status(404).json({ success: false, error: { message: 'Configuration not found' } })
    }
    if (!config.webhookSecret) {
      return res.status(400).json({
        success: false,
        error: { message: 'Webhook secret not configured' },
      })
    }

    const secret = decrypt(config.webhookSecret)
    const isValid = askevaService.verifyWebhookSignature(payload, signature || '', secret)
    if (!isValid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid webhook signature' } })
    }

    const eventType = req.body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status
      ? 'message_status'
      : req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
        ? 'message_received'
        : 'unknown'

    askevaService.processWebhook(companyId, eventType, req.body).catch((e) => console.error('Webhook process error:', e))
    res.status(200).json({ success: true })
  } catch (err) {
    console.error('Webhook error:', err)
    res.status(500).json({
      success: false,
      error: { message: 'Webhook processing failed' },
    })
  }
}
