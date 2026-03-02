const express = require('express')
const router = express.Router()
const { authenticate, requireAdminOrSuperadmin, requireRole } = require('../middleware/auth')
const ctrl = require('../controllers/orderController')

// All order routes require authentication
router.use(authenticate)

// All roles that have order management can view orders
const canViewOrders = requireRole(['admin', 'superadmin', 'billing', 'warehouse'])

router.post('/backfill', requireAdminOrSuperadmin, ctrl.backfillOrdersFromWebhooks)
router.post('/reset-counter', requireAdminOrSuperadmin, ctrl.resetOrderCounter)
router.get('/stats', canViewOrders, ctrl.getOrderStats)
router.get('/', canViewOrders, ctrl.getOrders)
router.get('/:orderId', canViewOrders, ctrl.getOrderById)
router.post('/', requireAdminOrSuperadmin, ctrl.createOrder)
router.patch('/:orderId', canViewOrders, ctrl.updateOrder)

module.exports = router
