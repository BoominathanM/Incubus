const express = require('express')
const router = express.Router()
const { authenticate, requireAdminOrSuperadmin } = require('../middleware/auth')
const ctrl = require('../controllers/retailerWebhookController')

// ── Public — no auth (called by Askeva panel externally) ──────────────────────
router.get('/receive/:companyId', ctrl.handleWebhookVerification)
router.post('/receive/:companyId', ctrl.receiveRetailerWebhook)
// Ping — test webhook reachability: POST /api/retailer-webhook/ping with JSON body
router.post('/ping', (req, res) => {
  const body = req.body || {}
  const rawLen = typeof req.rawBody === 'string' ? req.rawBody.length : 0
  res.json({ ok: true, received: true, bodyKeys: Object.keys(body), rawBodyLen: rawLen })
})

// ── Protected — admin only ────────────────────────────────────────────────────
router.use(authenticate)
router.use(requireAdminOrSuperadmin)

router.get('/messages',     ctrl.getRetailerWebhookMessages)
router.get('/messages/:id', ctrl.getRetailerWebhookMessageById)
router.post('/test-retailer', ctrl.testRetailerWebhook)
router.post('/test-retailer/:companyId', ctrl.testRetailerWebhook)

module.exports = router
