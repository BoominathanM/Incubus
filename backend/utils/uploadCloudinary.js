const path = require('path')
const cloudinary = require('../config/cloudinary')

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
])
const ALLOWED_EXT = new Set(['.pdf', '.jpeg', '.jpg', '.png'])

function validateFileType(file) {
  if (!file || !file.mimetype) return { valid: false, message: 'Invalid file' }
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED_MIMES.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    return { valid: false, message: 'Only PDF, JPEG, JPG and PNG files are allowed' }
  }
  return { valid: true }
}

function uploadToCloudinary(buffer, folder, publicIdPrefix) {
  return new Promise((resolve, reject) => {
    const opts = {
      folder: folder || 'incubus',
      resource_type: 'auto',
    }
    if (publicIdPrefix) opts.public_id = publicIdPrefix
    cloudinary.uploader
      .upload_stream(opts, (err, result) => {
        if (err) return reject(err)
        resolve(result?.secure_url)
      })
      .end(buffer)
  })
}

module.exports = { validateFileType, uploadToCloudinary, ALLOWED_MIMES, ALLOWED_EXT }
