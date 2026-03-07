const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { authenticate } = require('../middleware/auth')

router.post('/login', authController.login)
router.post('/logout', authController.logout)
router.post('/change-password-by-email', authController.changePasswordByEmail)
router.post('/change-password', authenticate, authController.changePassword)

module.exports = router
