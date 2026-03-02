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
const cron = require('node-cron')
const { syncAllCompanies } = require('./services/productSync.service')

const app = express()
const PORT = process.env.PORT || 7000

const allowedOrigins = [
  'http://localhost:7001',
  'http://localhost:5173',
  'http://127.0.0.1:7001',
  'http://127.0.0.1:5173',
  'https://incubus.vercel.app',
]
const corsOrigin = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...allowedOrigins]
  : allowedOrigins
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/country-codes', countryCodesRoutes)
// Public webhook routes — must be registered BEFORE authenticated askevaRoutes
app.get('/api/askeva/webhook/:companyId', askevaController.handleWebhookVerification)
app.post('/api/askeva/webhook/:companyId', askevaController.handleWebhook)
app.post('/api/askeva/webhook-catalog/:companyId', askevaController.handleCatalogWebhook)
app.use('/api/askeva', askevaRoutes)
app.use('/api/retailers', retailerRoutes)
app.use('/api/retailer-webhook', retailerWebhookRoutes)
app.use('/api/orders', orderRoutes)

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
    for (const msg of toCreate) {
      try {
        // Parse items from rawPayload
        const rawItems = []
        const entries = msg.rawPayload?.entry || []
        for (const entry of entries) {
          for (const change of (entry.changes || [])) {
            for (const rawMsg of (change.value?.messages || [])) {
              if (rawMsg.type === 'order' && Array.isArray(rawMsg.order?.product_items)) {
                for (const pi of rawMsg.order.product_items) {
                  rawItems.push({ productRetailerId: pi.product_retailer_id || '', quantity: Number(pi.quantity) || 1 })
                }
              }
            }
          }
        }

        // Fallback: parse from messageBody "SKU x1, SKU2 x3"
        const bodyItems = []
        if (rawItems.length === 0 && msg.messageBody) {
          for (const part of msg.messageBody.split(',')) {
            const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
            if (match) bodyItems.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
          }
        }

        await createOrderFromWebhook({
          companyId: msg.companyId,
          webhookMessageId: msg._id,
          from: msg.from,
          fromName: msg.fromName,
          retailerMatched: msg.retailerMatched,
          retailer: msg.retailer || null,
          items: rawItems.length > 0 ? rawItems : bodyItems,
          catalogId: '',
          messageBody: msg.messageBody,
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
