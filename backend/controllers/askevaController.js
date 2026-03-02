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

/**
 * GET /api/askeva/webhook/:companyId
 * Webhook verification — Meta/WhatsApp and some providers send GET with hub.mode, hub.verify_token, hub.challenge.
 * Must return hub.challenge to complete verification.
 */
exports.handleWebhookVerification = async (req, res) => {
  try {
    const { hub_mode, hub_verify_token, hub_challenge } = req.query
    const mode = hub_mode || req.query['hub.mode']
    const token = hub_verify_token || req.query['hub.verify_token']
    const challenge = hub_challenge || req.query['hub.challenge']

    if (mode === 'subscribe' && challenge) {
      const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'askeva_webhook_verify'
      if (!token || token === verifyToken) {
        console.log('[Webhook] Verification successful')
        return res.type('text/plain').status(200).send(String(challenge))
      }
    }
    console.warn('[Webhook] Verification failed — mode:', mode, 'token present:', !!token)
    return res.status(403).send('Verification failed')
  } catch (err) {
    console.error('[Webhook] Verification error:', err)
    return res.status(500).send('Verification error')
  }
}

exports.handleWebhook = async (req, res) => {
  try {
    const { companyId } = req.params

    console.log('[Webhook] POST received for company:', companyId, '| body keys:', Object.keys(req.body || {}))

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
  const { handleWebhookOrderEvent } = require('./orderController')

  // Support both direct Meta payload and wrapped payloads (e.g. { data: { entry: [...] } })
  const entries = body?.entry || body?.data?.entry || []
  if (entries.length === 0 && Object.keys(body || {}).length > 0) {
    console.log('[Webhook] No entry in payload — raw body sample:', JSON.stringify(body).slice(0, 300))
  }

  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const value = change.value || {}
      const contacts = value.contacts || []

      for (const msg of (value.messages || [])) {
        const fromNumber = (msg.from || '').replace(/\D/g, '')
        if (!fromNumber) continue

        const contact = contacts.find((c) => (c.wa_id || '').replace(/\D/g, '') === fromNumber)
        const fromName = contact?.profile?.name || ''
        const msgType = msg.type || 'text'
        const ts = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date()
        const retailer = await findActiveRetailerByPhone(fromNumber)

        // ── Parse content per message type ───────────────────────────────────
        let messageBody = ''
        let orderItems = []
        let catalogId = ''
        let extraFields = {}
        let shouldCreateOrder = false

        if (msgType === 'order' && msg.order) {
          // WhatsApp catalog order
          catalogId = msg.order.catalog_id || ''
          orderItems = (msg.order.product_items || []).map((pi) => ({
            productRetailerId: pi.product_retailer_id || '',
            quantity: Number(pi.quantity) || 1,
          }))
          messageBody = orderItems.map((i) => `${i.productRetailerId} x${i.quantity}`).join(', ')
            || `Catalog order: ${catalogId}`
          shouldCreateOrder = true

        } else if (msgType === 'interactive' && msg.interactive?.type === 'nfm_reply') {
          // WhatsApp Flow form submission
          try {
            const flowData = JSON.parse(msg.interactive.nfm_reply?.response_json || '{}')
            orderItems = parseFlowItems(flowData)
            extraFields = {
              contactName:     flowData.name || flowData.full_name || flowData.contact_name || fromName || '',
              contactNumber:   flowData.phone || flowData.phone_number || flowData.mobile || fromNumber || '',
              deliveryAddress: flowData.address || flowData.delivery_address || flowData.shipping_address || '',
            }
            messageBody = `Flow order from ${fromName || fromNumber}`
            shouldCreateOrder = true
          } catch (_) { /* malformed JSON — skip order creation */ }

        } else if (msgType === 'payment' && msg.payment) {
          // WhatsApp Pay notification
          const pay = msg.payment
          extraFields = {
            paymentStatus:  pay.status === 'captured' ? 'Success' : 'Pending',
            transactionId:  pay.transaction_id || pay.reference_id || '',
            paymentMode:    'WhatsApp Pay',
          }
          messageBody = `Payment ${pay.status || ''} - txn: ${pay.transaction_id || pay.reference_id || ''}`
          shouldCreateOrder = true

        } else {
          messageBody = msg.text?.body || msg.caption || msg.image?.caption || msg.document?.caption || ''
        }

        // ── Store in WebhookMessage ───────────────────────────────────────────
        const savedMsg = await WebhookMessage.create({
          companyId,
          messageId:       msg.id || '',
          from:            fromNumber,
          fromName,
          messageType:     msgType,
          messageBody,
          timestamp:       ts,
          retailer:        retailer?._id || null,
          retailerMatched: !!retailer,
          rawPayload:      { entry: body.entry },
        })

        console.log(`[Webhook] from: ${fromNumber} | type: ${msgType} | retailer: ${retailer?.businessName || 'none'} | stored msg _id: ${savedMsg._id}`)

        // ── Auto-create/update order (one order per user flow) ──────────────────
        if (shouldCreateOrder) {
          handleWebhookOrderEvent({
            msgType,
            companyId,
            webhookMessageId: savedMsg._id,
            from:             fromNumber,
            fromName,
            retailerMatched:  !!retailer,
            retailer:         retailer || null,
            items:            orderItems,
            catalogId,
            messageBody,
            extraFields,
          }).catch((e) => console.error('[Webhook] Order creation/update failed:', e.message))
        }
      }

      if (value.statuses?.length) {
        console.log(`[Webhook] ${value.statuses.length} status update(s) received`)
      }
    }
  }
}

function parseFlowItems(flowData) {
  const raw = flowData.items || flowData.products || flowData.order_items || flowData.product || ''
  const items = []
  for (const part of String(raw).split(',')) {
    const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
    if (match) items.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
  }
  return items
}

exports.getWebhookMessages = async (req, res) => {
  try {
    // Support companyId from query; superadmin can pass companyId=all to see all companies
    const queryCompanyId = req.query.companyId
    let companyId = queryCompanyId || getCompanyId(req)
    const isSuperAdmin = req.user?.role === 'superadmin'
    const userHasNoCompany = !req.user?.companyId

    // Fallback: when no companyId in query and user has none, use any config's companyId
    if (!queryCompanyId && (isSuperAdmin || userHasNoCompany)) {
      const anyConfig = await AskevaConfig.findOne().select('companyId').lean()
      if (anyConfig?.companyId) companyId = anyConfig.companyId
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const skip = (page - 1) * limit
    const { retailerMatched, isRead } = req.query

    const query = {}
    if (companyId && companyId !== 'all') query.companyId = companyId
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
      WebhookMessage.countDocuments(
        companyId && companyId !== 'all' ? { companyId, isRead: false } : { isRead: false }
      ),
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
    const companyId = req.query.companyId === 'all' ? null : (req.query.companyId || getCompanyId(req))
    const { id } = req.params
    const filter = companyId ? { _id: id, companyId } : { _id: id }
    const msg = await WebhookMessage.findOne(filter)
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
