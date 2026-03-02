const express = require('express')
const router = express.Router()
const { authenticate, requireAdminOrSuperadmin } = require('../middleware/auth')
const ctrl = require('../controllers/retailerWebhookController')

// ── Public — no auth (called by Askeva panel externally) ──────────────────────
router.post('/receive/:companyId', ctrl.receiveRetailerWebhook)

// ── Protected — admin only ────────────────────────────────────────────────────
router.use(authenticate)
router.use(requireAdminOrSuperadmin)

router.get('/messages',     ctrl.getRetailerWebhookMessages)
router.get('/messages/:id', ctrl.getRetailerWebhookMessageById)

module.exports = router
