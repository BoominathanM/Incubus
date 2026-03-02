const Retailer = require('../models/Retailer')
const WebhookMessage = require('../models/WebhookMessage.model')
const { handleWebhookOrderEvent } = require('./orderController')

function parseFlowItems(flowData) {
  const raw = flowData.items || flowData.products || flowData.order_items || flowData.product || ''
  const items = []
  for (const part of String(raw).split(',')) {
    const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
    if (match) items.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
  }
  return items
}

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

function toDigits(str) {
  return (str || '').replace(/\D/g, '')
}

/**
 * GET /api/retailer-webhook/receive/:companyId
 * Webhook verification — Meta/WhatsApp and some providers send GET with hub.mode, hub.verify_token, hub.challenge.
 */
exports.handleWebhookVerification = (req, res) => {
  try {
    const { hub_mode, hub_verify_token, hub_challenge } = req.query
    const mode = hub_mode || req.query['hub.mode']
    const token = hub_verify_token || req.query['hub.verify_token']
    const challenge = hub_challenge || req.query['hub.challenge']

    if (mode === 'subscribe' && challenge) {
      const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'askeva_webhook_verify'
      if (!token || token === verifyToken) {
        console.log('[RetailerWebhook] Verification successful')
        return res.type('text/plain').status(200).send(String(challenge))
      }
    }
    console.warn('[RetailerWebhook] Verification failed — mode:', mode, 'token present:', !!token)
    return res.status(403).send('Verification failed')
  } catch (err) {
    console.error('[RetailerWebhook] Verification error:', err)
    return res.status(500).send('Verification error')
  }
}

/**
 * POST /api/retailer-webhook/receive/:companyId
 *
 * Receives webhook payload from Askeva panel.
 * - Stores ALL messages (no filtering/comparison)
 * - Extracts catalogId if present in payload
 * - Returns every stored record in the response
 */
exports.receiveRetailerWebhook = async (req, res) => {
  const companyId = req.params.companyId || COMPANY_ID
  const body = req.body

  console.log('[RetailerWebhook] Incoming payload for company:', companyId, '| body keys:', Object.keys(body || {}))

  const stored = []
  const errors = []

  try {
    // Support both direct Meta payload and wrapped payloads (e.g. { data: { entry: [...] } })
    const entries = Array.isArray(body?.entry) ? body.entry : (Array.isArray(body?.data?.entry) ? body.data.entry : [])

    // ── If NO entries at all (e.g. ping / test run with empty body) ───────────
    if (entries.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Webhook received (no messages in payload)',
        rawBody: body,
        stored: [],
      })
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : []

      for (const change of changes) {
        const value = change?.value || {}
        const messages = Array.isArray(value?.messages) ? value.messages : []
        const contacts  = Array.isArray(value?.contacts) ? value.contacts : []
        const metadata  = value?.metadata || {}

        // ── Process all messages ──────────────────────────────────────────────
        for (const msg of messages) {
          const from = toDigits(msg.from)
          const contact = contacts.find((c) => toDigits(c.wa_id) === from)
          const fromName = contact?.profile?.name || ''
          const msgType = msg.type || 'text'
          const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date()
          const activeRetailer = from ? await findActiveRetailer(from) : null

          // ── Parse content and decide if an order should be created ───────────
          let messageBody = ''
          let orderItems = []
          let catalogId = msg?.order?.catalog_id || value?.catalog_id || body?.catalog_id || ''
          let extraFields = {}
          let shouldCreateOrder = false

          if (msgType === 'order' && msg.order) {
            // WhatsApp catalog order
            orderItems = (msg.order.product_items || []).map((i) => ({
              productRetailerId: i.product_retailer_id || '',
              quantity: Number(i.quantity) || 1,
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
                contactNumber:   flowData.phone || flowData.phone_number || flowData.mobile || from || '',
                deliveryAddress: flowData.address || flowData.delivery_address || flowData.shipping_address || '',
              }
              messageBody = `Flow order from ${fromName || from}`
              shouldCreateOrder = true
            } catch (_) { /* malformed JSON */ }

          } else if (msgType === 'payment' && msg.payment) {
            // WhatsApp Pay notification
            const pay = msg.payment
            extraFields = {
              paymentStatus: pay.status === 'captured' ? 'Success' : 'Pending',
              transactionId: pay.transaction_id || pay.reference_id || '',
              paymentMode:   'WhatsApp Pay',
            }
            messageBody = `Payment ${pay.status || ''} - txn: ${pay.transaction_id || pay.reference_id || ''}`
            shouldCreateOrder = true

          } else {
            messageBody = msg.text?.body || msg.image?.caption || msg.document?.caption || msg.video?.caption || msg.caption || ''
          }

          try {
            const record = await WebhookMessage.create({
              companyId,
              messageId:       msg.id || '',
              from:            from || 'unknown',
              fromName,
              messageType:     msgType,
              messageBody,
              timestamp,
              retailer:        activeRetailer?._id || null,
              retailerMatched: !!activeRetailer,
              rawPayload:      body,
            })

            const populated = await WebhookMessage.findById(record._id)
              .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
              .lean()

            stored.push({
              id:              populated._id,
              from:            from || 'unknown',
              fromName,
              messageType:     msgType,
              messageBody,
              timestamp,
              catalogId:       catalogId || null,
              displayPhone:    metadata?.display_phone_number || '',
              phoneNumberId:   metadata?.phone_number_id || '',
              retailerMatched: !!activeRetailer,
              retailer:        populated.retailer || null,
              savedAt:         populated.createdAt,
            })

            if (shouldCreateOrder) {
              handleWebhookOrderEvent({
                msgType,
                companyId,
                webhookMessageId: record._id,
                from:             from || '',
                fromName,
                retailerMatched:  !!activeRetailer,
                retailer:         activeRetailer || null,
                items:            orderItems,
                catalogId:        catalogId || '',
                messageBody,
                extraFields,
              }).catch((e) => console.error('[RetailerWebhook] Order creation/update failed:', e.message))
            }

            console.log(`[RetailerWebhook] from: +${from} | type: ${msgType} | order: ${shouldCreateOrder} | retailer: ${activeRetailer?.businessName || 'none'}`)
          } catch (saveErr) {
            console.error('[RetailerWebhook] Save error:', saveErr.message)
            errors.push({ from, error: saveErr.message })
          }
        }

        // ── No messages in this change — store as catalog/notification event ──
        // This covers catalog updates, status changes, and Askeva test events
        if (messages.length === 0) {
          const firstContact = contacts[0]
          const from = firstContact ? toDigits(firstContact.wa_id) : ''
          const fromName = firstContact?.profile?.name || ''
          const catalogId =
            value?.catalog_id || value?.catalogId ||
            body?.catalog_id || body?.catalogId || null

          const activeRetailer = from ? await findActiveRetailer(from) : null

          try {
            const record = await WebhookMessage.create({
              companyId,
              messageId:       '',
              from:            from || 'catalog_event',
              fromName,
              messageType:     'catalog_notification',
              messageBody:     '',
              timestamp:       new Date(),
              retailer:        activeRetailer?._id || null,
              retailerMatched: !!activeRetailer,
              rawPayload:      body,
            })

            const populated = await WebhookMessage.findById(record._id)
              .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
              .lean()

            stored.push({
              id:              populated._id,
              from:            from || 'catalog_event',
              fromName,
              messageType:     'catalog_notification',
              messageBody:     '',
              timestamp:       populated.timestamp,
              catalogId:       catalogId || null,
              displayPhone:    metadata?.display_phone_number || '',
              phoneNumberId:   metadata?.phone_number_id || '',
              retailerMatched: !!activeRetailer,
              retailer:        populated.retailer || null,
              savedAt:         populated.createdAt,
            })

            console.log(
              `[RetailerWebhook] Stored catalog event | from: ${from || 'catalog_event'} | catalogId: ${catalogId || 'none'}`
            )
          } catch (saveErr) {
            console.error('[RetailerWebhook] Catalog event save error:', saveErr.message)
            errors.push({ from: from || 'catalog_event', error: saveErr.message })
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Stored ${stored.length} message(s)`,
      stored,
      ...(errors.length ? { errors } : {}),
    })

  } catch (err) {
    console.error('[RetailerWebhook] Fatal error:', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/retailer-webhook/messages
 *
 * Fetch all stored webhook messages.
 * Query params:
 *   ?matched=true|false     — filter by retailer match
 *   ?catalogId=xxx          — filter by catalog ID in rawPayload
 *   ?from=919876543210      — filter by sender number
 *   ?retailerId=<objectId>  — filter by retailer
 *   ?page=1&limit=20
 */
exports.getRetailerWebhookMessages = async (req, res) => {
  try {
    const companyId = req.query.companyId || COMPANY_ID
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20)
    const skip  = (page - 1) * limit

    const filter = { companyId }

    if (req.query.matched === 'true')  filter.retailerMatched = true
    if (req.query.matched === 'false') filter.retailerMatched = false
    if (req.query.from)        filter.from = req.query.from
    if (req.query.retailerId)  filter.retailer = req.query.retailerId

    // catalogId filter — search inside rawPayload
    if (req.query.catalogId) {
      filter.$or = [
        { 'rawPayload.catalog_id':                       req.query.catalogId },
        { 'rawPayload.catalogId':                        req.query.catalogId },
        { 'rawPayload.entry.changes.value.catalog_id':   req.query.catalogId },
      ]
    }

    const [messages, total, unread] = await Promise.all([
      WebhookMessage.find(filter)
        .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookMessage.countDocuments(filter),
      WebhookMessage.countDocuments({ companyId, isRead: false }),
    ])

    return res.json({
      success: true,
      data: {
        messages,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        unread,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch messages' })
  }
}

/**
 * GET /api/retailer-webhook/messages/:id
 * Single message detail — auto-marks as read.
 */
exports.getRetailerWebhookMessageById = async (req, res) => {
  try {
    const msg = await WebhookMessage.findById(req.params.id)
      .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status approvedAt')
      .lean()

    if (!msg) {
      return res.status(404).json({ success: false, message: 'Message not found' })
    }

    await WebhookMessage.updateOne({ _id: req.params.id }, { isRead: true })

    return res.json({ success: true, data: { message: { ...msg, isRead: true } } })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch message' })
  }
}

// ── helper ─────────────────────────────────────────────────────────────────────
async function findActiveRetailer(from) {
  const incoming = toDigits(from)
  if (!incoming) return null
  const retailers = await Retailer.find(
    { status: 'active' },
    'retailerId businessName storeName contactPerson email whatsappCountryCode whatsappNumber city state status'
  ).lean()
  return retailers.find((r) => {
    const full = toDigits(r.whatsappCountryCode) + toDigits(r.whatsappNumber)
    return full === incoming || toDigits(r.whatsappNumber) === incoming
  }) || null
}
