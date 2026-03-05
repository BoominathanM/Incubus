const express = require('express')
const multer = require('multer')
const router = express.Router()
const retailerController = require('../controllers/retailerController')
const { authenticate, requireAdminOrSuperadmin, requireRole } = require('../middleware/auth')

// Max file size: 25MB (configurable via env UPLOAD_MAX_FILE_SIZE_MB)
const maxSizeMB = parseInt(process.env.UPLOAD_MAX_FILE_SIZE_MB, 10) || 25
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
})

function handleMulterError(err, req, res, next) {
  if (!err) return next()
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: `File too large. Maximum size is ${maxSizeMB}MB.` })
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Unexpected file field. Use field name "file".' })
  }
  if (err.message) {
    return res.status(400).json({ success: false, message: err.message })
  }
  next(err)
}

// Wrapper so multer errors are always caught and returned as JSON (multer may throw or call next(err))
function uploadSingle(fieldName) {
  const mw = upload.single(fieldName)
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next)
      next()
    })
  }
}

router.use(authenticate)

router.get('/', retailerController.list)
router.get('/stats', retailerController.stats)
router.get('/stats/by-date', retailerController.statsByDate)
router.get('/export', retailerController.exportRetailers)
router.get('/import/sample', retailerController.importSample)
router.post('/upload', requireRole(['admin', 'superadmin', 'executive']), uploadSingle('file'), retailerController.upload)
router.post('/import', requireRole(['admin', 'superadmin', 'executive']), uploadSingle('file'), retailerController.importRetailers)
router.post('/onboard-from-webhook', requireRole(['admin', 'superadmin']), retailerController.onboardFromWebhookMessage)
router.post('/', requireRole(['admin', 'superadmin', 'executive']), retailerController.create)
router.get('/:id', retailerController.getById)
router.put('/:id', retailerController.update)
router.delete('/:id', retailerController.remove)
router.post('/:id/approve', requireAdminOrSuperadmin, retailerController.approve)
router.post('/:id/reject', requireAdminOrSuperadmin, retailerController.reject)
router.patch('/:id/status', requireAdminOrSuperadmin, retailerController.setStatus)

module.exports = router
