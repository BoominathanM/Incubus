const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const SALT_LENGTH = 64

function getKey(secret) {
  const envSecret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'incubus-secret'
  const salt = (envSecret + 'askeva-salt').slice(0, SALT_LENGTH)
  return crypto.scryptSync(secret || envSecret, salt, KEY_LENGTH)
}

/**
 * Encrypt a string. Uses ENCRYPTION_SECRET or JWT_SECRET from env.
 */
function encrypt(text) {
  if (!text) return ''
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(String(text), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a string encrypted with encrypt().
 */
function decrypt(encrypted) {
  if (!encrypted) return ''
  const key = getKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) return ''
  const [ivHex, tagHex, data] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

module.exports = { encrypt, decrypt }
