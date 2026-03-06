const express = require('express')
const router = express.Router()
const notificationController = require('../controllers/notificationController')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

router.get('/', notificationController.list)
router.get('/unread-count', notificationController.unreadCount)
router.post('/mark-all-read', notificationController.markAllRead)
router.delete('/clear-all', notificationController.clearAll)
router.patch('/:id/read', notificationController.markRead)
router.delete('/:id', notificationController.deleteOne)

module.exports = router
