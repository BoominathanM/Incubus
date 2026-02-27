const Retailer = require('../models/Retailer')
const WebhookMessage = require('../models/WebhookMessage.model')

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

function toDigits(str) {
  return (str || '').replace(/\D/g, '')
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

  console.log('[RetailerWebhook] Incoming payload:', JSON.stringify(body, null, 2))

  const stored = []
  const errors = []

  try {
    const entries = Array.isArray(body?.entry) ? body.entry : []

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

        // Extract catalogId from payload if present (order/catalog messages)
        const catalogId =
          value?.catalog_id ||
          value?.catalogId ||
          body?.catalog_id ||
          body?.catalogId ||
          null

        for (const msg of messages) {
          const from = toDigits(msg.from)

          // Contact display name
          const contact = contacts.find((c) => toDigits(c.wa_id) === from)
          const fromName = contact?.profile?.name || ''

          // Message type & body
          const messageType = msg.type || 'text'
          const messageBody =
            msg.text?.body ||
            msg.image?.caption ||
            msg.document?.caption ||
            msg.video?.caption ||
            msg.caption ||
            ''

          // Timestamp
          const timestamp = msg.timestamp
            ? new Date(parseInt(msg.timestamp, 10) * 1000)
            : new Date()

          // ── Active retailer lookup (informational only — stored regardless) ─
          const activeRetailer = from
            ? await findActiveRetailer(from)
            : null

          try {
            const record = await WebhookMessage.create({
              companyId,
              messageId:       msg.id || '',
              from:            from || 'unknown',
              fromName,
              messageType,
              messageBody,
              timestamp,
              retailer:        activeRetailer?._id || null,
              retailerMatched: !!activeRetailer,
              rawPayload:      body,
            })

            // Populate retailer so response has full data
            const populated = await WebhookMessage.findById(record._id)
              .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
              .lean()

            stored.push({
              id:              populated._id,
              from:            from || 'unknown',
              fromName,
              messageType,
              messageBody,
              timestamp,
              catalogId:       catalogId || null,
              displayPhone:    metadata?.display_phone_number || '',
              phoneNumberId:   metadata?.phone_number_id || '',
              retailerMatched: !!activeRetailer,
              retailer:        populated.retailer || null,
              savedAt:         populated.createdAt,
            })

            console.log(
              `[RetailerWebhook] Stored | from: +${from} | retailer: ${activeRetailer?.businessName || 'none'} | msg: "${messageBody}"`
            )
          } catch (saveErr) {
            console.error('[RetailerWebhook] Save error:', saveErr.message)
            errors.push({ from, error: saveErr.message })
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
