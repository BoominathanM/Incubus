const AskevaConfig = require('../models/AskevaConfig.model')
const AskevaTemplate = require('../models/AskevaTemplate.model')
const { decrypt } = require('../utils/encryption.util')
const crypto = require('crypto')

const DEFAULT_BACKEND = 'https://backend.askeva.io'

function normalizeBaseUrl(url) {
  if (!url) return DEFAULT_BACKEND
  try {
    const u = new URL(String(url).trim())
    return `${u.protocol}//${u.host}`
  } catch {
    const m = String(url).trim().match(/^(https?:\/\/[^/]+)/)
    return m ? m[1] : DEFAULT_BACKEND
  }
}

function withToken(baseUrl, path, token) {
  const sep = path.includes('?') ? '&' : '?'
  return `${normalizeBaseUrl(baseUrl)}${path}${sep}token=${encodeURIComponent(token)}`
}

/**
 * Get decrypted config for a company (includes apiKey).
 */
async function getConfigForCompany(companyId) {
  const config = await AskevaConfig.findOne({ companyId }).select('+apiKey +webhookSecret').lean()
  if (!config || !config.apiKey) return null
  return {
    ...config,
    apiKey: decrypt(config.apiKey),
  }
}

/**
 * Test connection to Askeva backend using token.
 * Tries GET /v1/templates first; if not available, tries GET /v1/me or similar.
 */
async function testConnection(companyId, { apiKey, backendUrl }) {
  const base = normalizeBaseUrl(backendUrl)
  const token = (apiKey || '').trim()
  if (!token) {
    return { success: false, error: 'API Key is required' }
  }

  const urlsToTry = [
    `${base}/v1/templates?token=${encodeURIComponent(token)}`,
    `${base}/v1/message/templates?token=${encodeURIComponent(token)}`,
    `${base}/v1/me?token=${encodeURIComponent(token)}`,
    `${base}/v1/account?token=${encodeURIComponent(token)}`,
  ]

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      if (res.ok) {
        return { success: true }
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'Invalid API key or access denied' }
      }
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        data = {}
      }
      if (res.status >= 400 && res.status < 500) {
        return { success: false, error: data.message || data.error || `Request failed: ${res.status}` }
      }
    } catch (err) {
      if (err.cause?.code === 'ENOTFOUND' || err.code === 'ENOTFOUND') {
        return { success: false, error: 'Could not reach Askeva backend. Check backend URL.' }
      }
      return { success: false, error: err.message || 'Connection failed' }
    }
  }

  return { success: false, error: 'Could not verify connection. Check API key and backend URL.' }
}

/**
 * Sync templates from Askeva into AskevaTemplate collection.
 * Tries GET /v1/templates and GET /v1/message/templates.
 */
async function syncTemplates(companyId) {
  const config = await getConfigForCompany(companyId)
  if (!config) {
    return { success: false, error: 'WhatsApp configuration not found. Please save API key and backend URL first.' }
  }

  const base = normalizeBaseUrl(config.backendUrl)
  const token = config.apiKey
  const urlsToTry = [
    `${base}/v1/templates?token=${encodeURIComponent(token)}`,
    `${base}/v1/message/templates?token=${encodeURIComponent(token)}`,
  ]

  let templates = []
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data)) {
        templates = data
        break
      }
      if (data && Array.isArray(data.data)) {
        templates = data.data
        break
      }
      if (data && Array.isArray(data.templates)) {
        templates = data.templates
        break
      }
      if (data && data.waba_templates && Array.isArray(data.waba_templates)) {
        templates = data.waba_templates
        break
      }
    } catch {
      continue
    }
  }

  if (templates.length === 0) {
    await AskevaConfig.updateOne(
      { companyId },
      { lastSyncedAt: new Date() }
    )
    return { success: true, synced: 0, message: 'No templates returned from API (or endpoint not available).' }
  }

  const now = new Date()
  let synced = 0
  for (const t of templates) {
    const name = t.name || t.template_name || t.templateName || t.id || 'unknown'
    const id = t.id || t.template_id || name
    const language = (t.language || t.lang || 'EN').toUpperCase().slice(0, 10)
    const category = (t.category || 'MARKETING').toUpperCase().slice(0, 50)
    const status = (t.status || 'APPROVED').toUpperCase().slice(0, 20)
    const components = t.components || t.component_types || []
    const compNames = Array.isArray(components)
      ? components.map((c) => (typeof c === 'string' ? c : c.type || c.name)).filter(Boolean)
      : []

    await AskevaTemplate.findOneAndUpdate(
      { companyId, templateId: id },
      {
        companyId,
        templateId: id,
        templateName: name,
        language,
        category,
        status,
        components: compNames.length ? compNames : [].concat(components || []),
        lastSyncedAt: now,
      },
      { upsert: true, new: true }
    )
    synced++
  }

  await AskevaConfig.updateOne(
    { companyId },
    { lastSyncedAt: now }
  )

  return { success: true, synced }
}

/**
 * Send WhatsApp message via Askeva.
 */
async function sendMessage({ companyId, triggeredBy, module, candidateId, payload, documentUrl, documentExpiry }) {
  const config = await getConfigForCompany(companyId)
  if (!config) {
    return { success: false, error: 'WhatsApp configuration not found' }
  }

  const base = normalizeBaseUrl(config.backendUrl)
  const token = config.apiKey
  const url = `${base}/v1/message/send-message?token=${encodeURIComponent(token)}`

  const body = {
    to: payload.to,
    template_name: payload.templateName || payload.template_name,
    language: payload.language || 'en',
    parameters: payload.parameters || {},
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data = {}
    try {
      data = JSON.parse(text)
    } catch {}

    if (!res.ok) {
      return {
        success: false,
        error: data.message || data.error || text || `Request failed: ${res.status}`,
      }
    }

    return {
      success: true,
      messageId: data.message_id || data.id || data.messageId,
    }
  } catch (err) {
    return { success: false, error: err.message || 'Failed to send message' }
  }
}

function generateWebhookUrl(companyId, baseUrl) {
  const base = (baseUrl || '').replace(/\/+$/, '')
  return `${base}/api/askeva/webhook/${companyId}`
}

function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

async function processWebhook(companyId, eventType, body) {
  // Optional: persist webhook log, update message status, etc.
  return
}

module.exports = {
  normalizeBaseUrl,
  getConfigForCompany,
  testConnection,
  syncTemplates,
  sendMessage,
  generateWebhookUrl,
  verifyWebhookSignature,
  processWebhook,
}
