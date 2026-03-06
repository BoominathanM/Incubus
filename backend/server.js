require('dotenv').config()
console.log('Starting server...')
const express = require('express')
const cors = require('cors')
const connectDB = require('./config/db')
const seedSuperAdmin = require('./scripts/seed')
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const countryCodesRoutes = require('./routes/countryCodes')
const askevaRoutes = require('./routes/askeva')
const askevaController = require('./controllers/askevaController')
const retailerRoutes = require('./routes/retailers')
const retailerWebhookRoutes = require('./routes/retailerWebhook')
const orderRoutes = require('./routes/orders')
const notificationRoutes = require('./routes/notifications')
const cron = require('node-cron')
const { syncAllCompanies } = require('./services/productSync.service')

const app = express()
const PORT = process.env.PORT || 8000
const allowedOrigins = [
  'http://localhost:7001',
  'http://localhost:8000',
  'http://localhost:5173',
  'http://127.0.0.1:7001',
  'http://127.0.0.1:5173',
  'https://incubus.vercel.app',
]
const corsOrigin = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...allowedOrigins]
  : allowedOrigins
app.use(cors({ origin: corsOrigin, credentials: true }))
// Webhook routes: use raw + manual parse (never throw) so we always capture payload
const isWebhookPost = (req) => {
  const url = (req.originalUrl || req.path || '').split('?')[0]
  return req.method === 'POST' && (
    url.includes('/retailer-webhook/receive') ||
    url.includes('/askeva/webhook/') ||
    url.includes('/askeva/webhook-catalog/')
  )
}
app.use((req, res, next) => {
  if (!isWebhookPost(req)) return next()
  express.raw({ type: '*/*', limit: '1gb' })(req, res, (err) => {
    if (err) return next(err)
    const str = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
    req.rawBody = str
    try {
      req.body = str ? JSON.parse(str) : {}
    } catch (_) {
      try {
        const qs = require('querystring')
        const p = qs.parse(str)
        req.body = (p.payload && typeof p.payload === 'string')
          ? (() => { try { return JSON.parse(p.payload) } catch (_) { return p } })()
          : (p && Object.keys(p).length ? p : {})
      } catch (_) { req.body = {} }
    }
    next()
  })
})
// Allow larger webhook payloads (Meta/WhatsApp can send big JSON); some providers send form-encoded
app.use((req, res, next) => {
  if (isWebhookPost(req)) return next() // already parsed above
  express.json({ limit: '1gb' })(req, res, next)
})
app.use((req, res, next) => {
  if (isWebhookPost(req)) return next()
  express.urlencoded({ extended: true, limit: '1gb' })(req, res, next)
})

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl}`)
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/country-codes', countryCodesRoutes)
// Public webhook routes — must be registered BEFORE authenticated askevaRoutes
app.get('/api/askeva/webhook/:companyId', askevaController.handleWebhookVerification)
app.post('/api/askeva/webhook/:companyId', askevaController.handleWebhook)
app.post('/api/askeva/webhook-catalog/:companyId', askevaController.handleCatalogWebhook)
app.use('/api/askeva', askevaRoutes)
// Public endpoint for chatbot — no auth required
app.get('/api/retailers/active', require('./controllers/retailerController').getActiveRetailers)
app.use('/api/retailers', retailerRoutes)
app.use('/api/retailer-webhook', retailerWebhookRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/notifications', notificationRoutes)

// Webhook endpoints must return 200 even on body parse failure so provider (Meta/WhatsApp) does not retry
app.use((err, req, res, next) => {
  const url = (req.originalUrl || req.url || req.path || '').split('?')[0]
  const isWebhookPost = req.method === 'POST' && (
    url.includes('/retailer-webhook/receive') ||
    url.includes('/askeva/webhook/') ||
    url.includes('/askeva/webhook-catalog/')
  )
  const isParseError = err.status === 400 || err.type === 'entity.parse.failed' || (err.message && /json|body|parse/i.test(err.message))
  if (isWebhookPost && isParseError && !res.headersSent) {
    console.warn('[Webhook] Body parse error — responding 200 to avoid provider retries:', err.message?.slice(0, 100))
    return res.status(200).json({ success: true, message: 'Webhook received' })
  }
  next(err)
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

async function backfillOrdersOnStartup() {
  try {
    const OrderManagement = require('./models/OrderManagement.model')
    const WebhookMessage = require('./models/WebhookMessage.model')
    const { createOrderFromWebhook } = require('./controllers/orderController')

    const existingCount = await OrderManagement.countDocuments()
    const pendingMessages = await WebhookMessage.find({ messageType: 'order' })
      .populate('retailer', '_id businessName')
      .lean()

    if (pendingMessages.length === 0) return

    // Find which webhook messages already have an order
    const linkedIds = new Set(
      (await OrderManagement.find(
        { webhookMessageId: { $in: pendingMessages.map((m) => m._id) } },
        'webhookMessageId'
      ).lean()).map((o) => String(o.webhookMessageId))
    )

    const toCreate = pendingMessages.filter((m) => !linkedIds.has(String(m._id)))
    if (toCreate.length === 0) {
      console.log(`[Startup] Order backfill: all ${pendingMessages.length} webhook order(s) already linked`)
      return
    }

    console.log(`[Startup] Order backfill: creating ${toCreate.length} missing order(s)...`)
    let created = 0
    const { mustBlockOrderCreation } = require('./services/retailerFromFlow')
    for (const msg of toCreate) {
      try {
        // STRICT: Skip if response_json contains flow_token retailer_form_copy — retailers/onboard only
        if (mustBlockOrderCreation(msg) || (msg.flowToken || '').toString().toLowerCase() === 'retailer_form_copy') {
          continue
        }
        const entries = msg.rawPayload?.entry || msg.rawPayload?.data?.entry || []
        let backfillReferenceId = ''
        const rawItems = []
        for (const entry of entries) {
          for (const change of (entry.changes || [])) {
            for (const rawMsg of (change.value?.messages || [])) {
              if (rawMsg.type === 'order' && rawMsg.order) {
                if (rawMsg.order.reference_id || rawMsg.order.referenceId) {
                  backfillReferenceId = String(rawMsg.order.reference_id || rawMsg.order.referenceId).trim()
                }
                if (Array.isArray(rawMsg.order.product_items)) {
                  for (const pi of rawMsg.order.product_items) {
                    rawItems.push({
                      productRetailerId: pi.product_retailer_id || '',
                      quantity: Number(pi.quantity) || 1,
                      productName: pi.product_name || pi.name || '',
                      itemPrice: Number(pi.item_price || pi.price) || 0,
                    })
                  }
                }
              }
            }
          }
        }

        const bodyItems = []
        if (rawItems.length === 0 && msg.messageBody) {
          for (const part of msg.messageBody.split(',')) {
            const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
            if (match) bodyItems.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
          }
        }

        const finalItems = rawItems.length > 0 ? rawItems : bodyItems
        if (finalItems.length === 0) {
          continue
        }

        await createOrderFromWebhook({
          companyId: msg.companyId,
          webhookMessageId: msg._id,
          from: msg.from,
          fromName: msg.fromName,
          retailerMatched: msg.retailerMatched,
          retailer: msg.retailer || null,
          items: finalItems,
          catalogId: '',
          messageBody: msg.messageBody,
          extraFields: {
            paymentStatus: 'Pending',
            ...(backfillReferenceId && { referenceId: backfillReferenceId }),
          },
        })
        created++
      } catch (e) {
        console.error(`[Startup] Backfill failed for msg ${msg._id}:`, e.message)
      }
    }
    console.log(`[Startup] Order backfill complete: ${created}/${toCreate.length} created`)
  } catch (e) {
    console.error('[Startup] Order backfill error:', e.message)
  }
}

async function start() {
  await connectDB()
  await seedSuperAdmin()

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })

  // Backfill any existing webhook order messages that don't yet have an order record
  backfillOrdersOnStartup()

  // Start Product Sync Cron Job (Every 5 minutes)
  cron.schedule('*/5 * * * *', () => {
    console.log('[Cron] Starting scheduled product synchronization...')
    syncAllCompanies().catch(err => console.error('[Cron] Product sync failed:', err))
  })

  // Also run once on startup for immediate sync
  console.log('[Startup] Triggering initial product synchronization...')
  syncAllCompanies().catch(err => console.error('[Startup] Initial product sync failed:', err))
}

start().catch((err) => {
  console.error('Startup error:', err)
  process.exit(1)
})
