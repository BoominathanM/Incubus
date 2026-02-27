const AskevaConfig = require('../models/AskevaConfig.model')
const AskevaTemplate = require('../models/AskevaTemplate.model')
const EventTemplateMapping = require('../models/EventTemplateMapping.model')
const WebhookMessage = require('../models/WebhookMessage.model')
const AskevaCatalog = require('../models/AskevaCatalog.model')
const Product = require('../models/Product.model')
const Retailer = require('../models/Retailer')
const askevaService = require('../services/askeva.service')
const productSyncService = require('../services/productSync.service')
const { encrypt, decrypt } = require('../utils/encryption.util')

/** Normalize a phone number to digits only (strip + and spaces). */
function normalizePhone(countryCode, number) {
  const cc = (countryCode || '').replace(/\D/g, '')
  const num = (number || '').replace(/\D/g, '')
  return cc + num
}

/**
 * Find an active retailer whose WhatsApp number matches the webhook sender.
 * fromNumber is the raw wa_id from the webhook (digits only, e.g. "919876543210").
 */
async function findActiveRetailerByPhone(fromNumber) {
  const digits = (fromNumber || '').replace(/\D/g, '')
  if (!digits) return null
  // Load all active retailers and compare normalized numbers
  const retailers = await Retailer.find(
    { status: 'active' },
    'businessName storeName contactPerson whatsappCountryCode whatsappNumber'
  ).lean()
  return retailers.find((r) => {
    const full = normalizePhone(r.whatsappCountryCode, r.whatsappNumber)
    return full === digits || r.whatsappNumber.replace(/\D/g, '') === digits
  }) || null
}

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
      // Trigger product sync in background after successful connection
      const syncCompanyId = config ? config.companyId : companyId
      productSyncService.syncProducts(syncCompanyId).catch((e) =>
        console.error('[Sync] Post-connection product sync failed:', e.message)
      )
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
          catalogCount: result.catalogCount,
          productCount: result.productCount,
          message: `Synced ${result.catalogCount} catalog(s) and ${result.productCount} product(s)`,
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

    // Optional signature verification — only if webhookSecret is stored
    const config = await AskevaConfig.findOne({ companyId }).select('+webhookSecret').lean()
    if (config?.webhookSecret) {
      const signature = req.headers['x-hub-signature-256']
      const payload = JSON.stringify(req.body)
      const secret = decrypt(config.webhookSecret)
      const isValid = askevaService.verifyWebhookSignature(payload, signature || '', secret)
      if (!isValid) {
        return res.status(401).json({ success: false, error: { message: 'Invalid webhook signature' } })
      }
    }

    // Acknowledge immediately — WhatsApp requires fast response
    res.status(200).json({ success: true })

    // Process asynchronously
    processWebhookPayload(companyId, req.body).catch((e) =>
      console.error('[Webhook] Processing error:', e.message)
    )
  } catch (err) {
    console.error('[Webhook] Error:', err)
    res.status(500).json({ success: false, error: { message: 'Webhook processing failed' } })
  }
}

async function processWebhookPayload(companyId, body) {
  const entries = body?.entry || []
  for (const entry of entries) {
    const changes = entry?.changes || []
    for (const change of changes) {
      const value = change?.value || {}
      const messages = value?.messages || []
      const contacts = value?.contacts || []

      for (const msg of messages) {
        const fromNumber = (msg.from || '').replace(/\D/g, '')
        if (!fromNumber) continue

        // Get sender display name from contacts array
        const contact = contacts.find((c) => (c.wa_id || '').replace(/\D/g, '') === fromNumber)
        const fromName = contact?.profile?.name || ''

        // Determine message type and body
        const messageType = msg.type || 'text'
        let messageBody = ''
        if (msg.text?.body) messageBody = msg.text.body
        else if (msg.caption) messageBody = msg.caption
        else if (msg.image?.caption) messageBody = msg.image.caption
        else if (msg.document?.caption) messageBody = msg.document.caption

        // Timestamp from WhatsApp (Unix seconds)
        const ts = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date()

        // Look up active retailer by WhatsApp number
        const retailer = await findActiveRetailerByPhone(fromNumber)

        await WebhookMessage.create({
          companyId,
          messageId: msg.id || '',
          from: fromNumber,
          fromName,
          messageType,
          messageBody,
          timestamp: ts,
          retailer: retailer?._id || null,
          retailerMatched: !!retailer,
          rawPayload: { entry: body.entry },
        })

        console.log(
          `[Webhook] Stored message from ${fromNumber} — Retailer: ${retailer?.businessName || 'unmatched'}`
        )
      }

      // Also handle status updates (delivery receipts etc.) — just log them
      const statuses = value?.statuses || []
      if (statuses.length) {
        console.log(`[Webhook] ${statuses.length} status update(s) received`)
      }
    }
  }
}

exports.getWebhookMessages = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const skip = (page - 1) * limit
    const { retailerMatched, isRead } = req.query

    const query = { companyId }
    if (retailerMatched === 'true') query.retailerMatched = true
    if (retailerMatched === 'false') query.retailerMatched = false
    if (isRead === 'true') query.isRead = true
    if (isRead === 'false') query.isRead = false

    const [messages, total, unreadCount] = await Promise.all([
      WebhookMessage.find(query)
        .populate('retailer', 'retailerId businessName storeName contactPerson whatsappNumber whatsappCountryCode status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookMessage.countDocuments(query),
      WebhookMessage.countDocuments({ companyId, isRead: false }),
    ])

    res.json({
      success: true,
      data: {
        messages,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        unreadCount,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to fetch webhook messages' } })
  }
}

exports.getWebhookMessageById = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { id } = req.params
    const msg = await WebhookMessage.findOne({ _id: id, companyId })
      .populate('retailer', 'retailerId businessName storeName contactPerson whatsappNumber whatsappCountryCode status city state')
      .lean()
    if (!msg) {
      return res.status(404).json({ success: false, error: { message: 'Message not found' } })
    }
    // Mark as read when viewed
    await WebhookMessage.updateOne({ _id: id }, { isRead: true })
    res.json({ success: true, data: { message: { ...msg, isRead: true } } })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to fetch message' } })
  }
}

exports.markWebhookMessagesRead = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { ids } = req.body // array of message IDs, or empty to mark all
    const filter = { companyId }
    if (Array.isArray(ids) && ids.length) filter._id = { $in: ids }
    await WebhookMessage.updateMany(filter, { isRead: true })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to mark messages read' } })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG WEBHOOK  (Webhook Report Configurations in Askeva panel)
// URL: POST /api/askeva/webhook-catalog/:companyId
// ─────────────────────────────────────────────────────────────────────────────

exports.handleCatalogWebhook = async (req, res) => {
  // Acknowledge immediately so Askeva doesn't timeout
  res.status(200).json({ success: true })

  const { companyId } = req.params
  const body = req.body

  console.log('[CatalogWebhook] Received payload for company:', companyId)
  console.log('[CatalogWebhook] Raw body:', JSON.stringify(body, null, 2))

  processCatalogPayload(companyId, body).catch((e) =>
    console.error('[CatalogWebhook] Processing error:', e.message)
  )
}

async function processCatalogPayload(companyId, body) {
  // Askeva catalog webhook can arrive in multiple shapes — handle all of them

  // ── Shape 1: { catalogs: [...] } ─────────────────────────────────────────
  // ── Shape 2: { catalog: {...}, products: [...] } ──────────────────────────
  // ── Shape 3: { data: { catalogs: [...] } } ───────────────────────────────
  // ── Shape 4: flat single catalog object { catalogId, name, products: [...] }

  const root = body?.data || body

  // Collect all catalog objects from the payload
  let catalogs = []
  if (Array.isArray(root?.catalogs)) catalogs = root.catalogs
  else if (Array.isArray(root)) catalogs = root
  else if (root?.catalogId || root?.catalog_id || root?.id) catalogs = [root]
  else if (root?.catalog) catalogs = [root.catalog]

  // Also handle a flat products-only payload (no explicit catalog wrapper)
  // In this case we create/update a "default" catalog entry
  const flatProducts = Array.isArray(root?.products) && catalogs.length === 0
    ? root.products
    : []

  let catalogCount = 0
  let productCount = 0

  for (const c of catalogs) {
    const cid = String(c.catalogId || c.catalog_id || c.id || c._id || '').trim()
    if (!cid) continue

    // Upsert catalog
    await AskevaCatalog.findOneAndUpdate(
      { companyId, catalogId: cid },
      {
        companyId,
        catalogId: cid,
        name: c.name || c.title || '',
        status: c.status || 'active',
        rawResponse: c,
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    )
    catalogCount++
    console.log(`[CatalogWebhook] Upserted catalog: ${cid}`)

    // Upsert products inside this catalog
    const products = Array.isArray(c.products) ? c.products
      : Array.isArray(c.items) ? c.items
      : []

    for (const p of products) {
      const pid = String(p.id || p.product_id || p.productId || p.item_id || p._id || '').trim()
      if (!pid) continue
      await upsertProduct(companyId, cid, pid, p)
      productCount++
    }
  }

  // Handle flat products payload
  if (flatProducts.length) {
    const fallbackCatalogId = String(root?.catalogId || root?.catalog_id || 'default')
    for (const p of flatProducts) {
      const pid = String(p.id || p.product_id || p.productId || p.item_id || p._id || '').trim()
      if (!pid) continue
      await upsertProduct(companyId, fallbackCatalogId, pid, p)
      productCount++
    }
  }

  console.log(
    `[CatalogWebhook] Done — ${catalogCount} catalog(s), ${productCount} product(s) stored for company ${companyId}`
  )
}

async function upsertProduct(companyId, catalogId, productId, p) {
  await Product.findOneAndUpdate(
    { companyId, productId },
    {
      companyId,
      catalogId,
      productId,
      name: p.name || p.title || 'No Name',
      description: p.description || p.desc || '',
      price: p.price || p.sale_price || p.retailer_price || 0,
      category: p.category || p.category_name || p.type || 'General',
      imageUrl: p.image_url || p.imageUrl || p.thumb || p.defaultImage || '',
      sku: p.sku || '',
      isAvailable: p.is_available !== false && p.stock !== 0,
      rawResponse: p,
      lastSyncedAt: new Date(),
    },
    { upsert: true, new: true }
  )
  console.log(`[CatalogWebhook]   Upserted product: ${productId}`)
}
