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
 * Falls back to any available config if companyId-specific one is not found.
 */
async function getConfigForCompany(companyId) {
  let config = await AskevaConfig.findOne({ companyId }).select('+apiKey +webhookSecret').lean()
  if (!config || !config.apiKey) {
    // Fallback: find any configured integration (single-tenant setup)
    config = await AskevaConfig.findOne({ apiKey: { $exists: true, $ne: null } }).select('+apiKey +webhookSecret').lean()
  }
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
 * Extract template array from API response (various shapes).
 */
function extractTemplatesFromResponse(data) {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.templates)) return data.templates
  if (data.waba_templates && Array.isArray(data.waba_templates)) return data.waba_templates
  return []
}

/**
 * Fetch one page of templates from a URL (with optional query params).
 */
async function fetchTemplatesPage(url, extraParams = {}) {
  const u = new URL(url)
  Object.entries(extraParams).forEach(([k, v]) => {
    if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
  })
  const res = await fetch(u.toString(), { method: 'GET', headers: { Accept: 'application/json' } })
  if (!res.ok) return { ok: false, data: null }
  const data = await res.json()
  return { ok: true, data }
}

/**
 * Sync templates from Askeva into AskevaTemplate collection.
 * Tries GET /v1/templates and GET /v1/message/templates.
 * Uses pagination to fetch ALL templates (page, limit, offset, or paging.next).
 */
async function syncTemplates(companyId) {
  const config = await getConfigForCompany(companyId)
  if (!config) {
    return { success: false, error: 'WhatsApp configuration not found. Please save API key and backend URL first.' }
  }

  const base = normalizeBaseUrl(config.backendUrl)
  const token = config.apiKey
  const baseUrls = [
    `${base}/v1/templates?token=${encodeURIComponent(token)}`,
    `${base}/v1/message/templates?token=${encodeURIComponent(token)}`,
  ]

  let allTemplates = []

  for (const url of baseUrls) {
    try {
      // First request: try with a large limit to get as many as the API allows
      const first = await fetchTemplatesPage(url, { limit: 500, per_page: 500, page: 1 })
      if (!first.ok) continue

      const data = first.data
      const firstBatch = extractTemplatesFromResponse(data)
      if (firstBatch.length > 0) {
        allTemplates = [...firstBatch]

        // Pagination: check for total / next page
        const total = data.total ?? data.total_count ?? data.totalCount ?? (data.pagination && data.pagination.total)
        const totalPages = data.total_pages ?? data.totalPages ?? (total != null && data.per_page ? Math.ceil(total / data.per_page) : null) ?? (total != null && data.limit ? Math.ceil(total / data.limit) : null)
        const perPage = data.per_page ?? data.limit ?? firstBatch.length
        const hasNextUrl = data.paging?.next ?? data.next_page_url ?? data.nextPageUrl

        if (hasNextUrl) {
          let nextUrl = hasNextUrl
          while (nextUrl) {
            try {
              const res = await fetch(nextUrl, { method: 'GET', headers: { Accept: 'application/json' } })
              if (!res.ok) break
              const nextData = await res.json()
              const nextBatch = extractTemplatesFromResponse(nextData)
              if (nextBatch.length === 0) break
              allTemplates = allTemplates.concat(nextBatch)
              nextUrl = nextData.paging?.next ?? nextData.next_page_url ?? nextData.nextPageUrl ?? null
            } catch {
              break
            }
          }
        } else if (totalPages > 1) {
          for (let page = 2; page <= totalPages; page++) {
            const next = await fetchTemplatesPage(url, { page, limit: perPage, per_page: perPage })
            if (!next.ok) break
            const nextBatch = extractTemplatesFromResponse(next.data)
            if (nextBatch.length === 0) break
            allTemplates = allTemplates.concat(nextBatch)
          }
        } else {
          // No total; try page-based until empty/smaller page (API often returns 25 per page)
          const pageSize = perPage || firstBatch.length || 25
          let page = 2
          let batch
          do {
            const next = await fetchTemplatesPage(url, { page, limit: pageSize, per_page: pageSize })
            if (!next.ok) break
            batch = extractTemplatesFromResponse(next.data)
            if (batch.length > 0) allTemplates = allTemplates.concat(batch)
            page++
          } while (batch && batch.length >= pageSize && page <= 50)
          // If page param didn't add more (API may use offset), try offset-based pagination
          if (allTemplates.length <= firstBatch.length) {
            let offset = pageSize
            for (let i = 0; i < 50; i++) {
              const next = await fetchTemplatesPage(url, { offset, limit: pageSize, per_page: pageSize })
              if (!next.ok) break
              const offsetBatch = extractTemplatesFromResponse(next.data)
              if (offsetBatch.length === 0) break
              allTemplates = allTemplates.concat(offsetBatch)
              offset += pageSize
              if (offsetBatch.length < pageSize) break
            }
          }
        }
        break
      }
    } catch {
      continue
    }
  }

  if (allTemplates.length === 0) {
    await AskevaConfig.updateOne(
      { companyId },
      { lastSyncedAt: new Date() }
    )
    return { success: true, synced: 0, message: 'No templates returned from API (or endpoint not available).' }
  }

  // Deduplicate by template id (in case API returns same item on multiple pages)
  const seen = new Set()
  allTemplates = allTemplates.filter((t) => {
    const id = t.id || t.template_id || t.name || t.template_name || t.templateName
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })


  function extractVariablePlaceholders(template) {
    const placeholders = new Set()
    function scan(obj) {
      if (!obj) return
      if (typeof obj === 'string') {
        const matches = obj.match(/\{\{(\d+)\}\}/g)
        if (matches) matches.forEach((m) => placeholders.add(parseInt(m.replace(/\D/g, ''), 10)))
        return
      }
      if (Array.isArray(obj)) {
        obj.forEach(scan)
        return
      }
      if (typeof obj === 'object') {
        Object.values(obj).forEach(scan)
      }
    }
    scan(template)
    return Array.from(placeholders)
      .sort((a, b) => a - b)
      .map((n) => `{{${n}}}`)
  }

  const now = new Date()
  let synced = 0
  for (const t of allTemplates) {
    const name = t.name || t.template_name || t.templateName || t.id || 'unknown'
    const id = t.id || t.template_id || name
    const language = (t.language || t.lang || 'EN').toUpperCase().slice(0, 10)
    const category = (t.category || 'MARKETING').toUpperCase().slice(0, 50)
    const status = (t.status || 'APPROVED').toUpperCase().slice(0, 20)
    const components = t.components || t.component_types || []
    const compNames = Array.isArray(components)
      ? components.map((c) => (typeof c === 'string' ? c : c.type || c.name)).filter(Boolean)
      : []
    const variablePlaceholders = extractVariablePlaceholders(t)
    const componentsDetail = Array.isArray(components) && components.length > 0 ? components : null

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
        componentsDetail,
        variablePlaceholders,
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

  // Convert parameters object { "1": "val1", "2": "val2" } → positional array ["val1", "val2"]
  const paramsObj = payload.parameters || {}
  const paramsArray = Object.keys(paramsObj)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => paramsObj[k])
    .filter(v => v != null && v !== '')

  const templateName = payload.templateName || payload.template_name
  const langCode = (payload.language || 'en').toLowerCase()

  // Build Meta WhatsApp Cloud API template object
  // Askeva wraps Meta WABA — confirmed by numeric templateIds (e.g. "626756667162738")
  const templateObj = {
    name: templateName,
    language: { code: langCode },
  }
  // Variables go as body component parameters: [{ type: "text", text: "value" }, ...]
  if (paramsArray.length > 0) {
    templateObj.components = [
      {
        type: 'body',
        parameters: paramsArray.map(v => ({ type: 'text', text: String(v) })),
      },
    ]
  }

  const body = {
    to: payload.to,
    type: 'template',
    template: templateObj,
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
