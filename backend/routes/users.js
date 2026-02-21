const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const { authenticate, requireAdminOrSuperadmin } = require('../middleware/auth')

router.use(authenticate)
router.use(requireAdminOrSuperadmin)

router.get('/', userController.listUsers)
router.post('/', userController.createUser)
router.put('/:id', userController.updateUser)
router.patch('/:id/status', userController.updateUserStatus)
router.delete('/:id', userController.deleteUser)

module.exports = router
