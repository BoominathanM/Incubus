/**
 * Fetch WhatsApp media via Askeva get-media API.
 * Used when retailer flow form includes GST/PAN document uploads.
 *
 * Flow response format: "GST document": [{ id, mime_type, sha256, file_name }]
 * Askeva API: GET /v1/message/get-media?token=...&id={media_id}&mime_type=...&link=true
 * Returns permanent mediaUrl (e.g. DigitalOcean Spaces CDN).
 */

const { getConfigForCompany } = require('./askeva.service')

const DEFAULT_MIME = 'application/pdf'

/**
 * Fetch media URL from Askeva get-media endpoint.
 * Askeva fetches from WhatsApp and returns a permanent CDN URL.
 *
 * @param {string|number} mediaId - WhatsApp media ID from flow response
 * @param {string} mimeType - e.g. application/pdf
 * @param {string} companyId
 * @returns {Promise<string|null>} Permanent media URL or null
 */
async function fetchMediaUrlFromAskeva(mediaId, mimeType, companyId) {
  if (!mediaId) return null
  const id = String(mediaId).trim()
  if (!id) return null

  let config
  try {
    config = await getConfigForCompany(companyId || 'default')
  } catch (_) {}
  if (!config?.apiKey || !config?.backendUrl) {
    console.warn('[WhatsAppMedia] Askeva config not found — configure API key and backend URL in Askeva settings')
    return null
  }

  const base = config.backendUrl.replace(/\/+$/, '')
  const mime = (mimeType || DEFAULT_MIME).trim() || DEFAULT_MIME
  const url = `${base}/v1/message/get-media?token=${encodeURIComponent(config.apiKey)}&id=${encodeURIComponent(id)}&mime_type=${encodeURIComponent(mime)}&link=true`

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await res.json().catch(() => ({}))
    const mediaUrl = data?.data?.mediaUrl
    if (mediaUrl) return mediaUrl
    if (data?.message) {
      console.warn('[WhatsAppMedia] Askeva get-media:', data.message)
    } else if (!res.ok) {
      console.warn('[WhatsAppMedia] Askeva get-media failed:', res.status, data?.message || data?.error || '')
    }
  } catch (err) {
    console.warn('[WhatsAppMedia] fetchMediaUrlFromAskeva failed:', err?.message || err)
  }
  return null
}

/**
 * Fetch media URL from Askeva for use as gstAttachmentUrl / panAttachmentUrl.
 * Wrapper that accepts mediaDoc object { id, mime_type }.
 *
 * @param {{ id: string|number, mime_type?: string }} mediaDoc - First item from "GST document" or "PAN document" array
 * @param {string} companyId
 * @returns {Promise<string|null>}
 */
async function fetchAndGetMediaUrl(mediaDoc, companyId) {
  if (!mediaDoc || (mediaDoc.id == null)) return null
  return fetchMediaUrlFromAskeva(mediaDoc.id, mediaDoc.mime_type, companyId)
}

/**
 * Extract first media document from flow document field.
 * Flow format: "GST document": [{ id: 123, mime_type: "application/pdf", file_name }]
 *
 * @param {object} flowData - Parsed flow response
 * @param {string[]} keys - Possible keys e.g. ['GST document', 'GST Document']
 * @returns {{ id: string|number, mime_type?: string }|null}
 */
function extractFirstMediaDoc(flowData, keys) {
  if (!flowData || typeof flowData !== 'object') return null
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const key of keys) {
    const found = Object.keys(flowData).find((k) => norm(k) === norm(key))
    if (!found) continue
    const val = flowData[found]
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0]
      if (first && typeof first === 'object' && (first.id != null)) {
        return {
          id: first.id,
          mime_type: first.mime_type || DEFAULT_MIME,
        }
      }
    }
    if (val && typeof val === 'object' && val.id != null) {
      return {
        id: val.id,
        mime_type: val.mime_type || DEFAULT_MIME,
      }
    }
  }
  return null
}

/** @deprecated Use extractFirstMediaDoc. Kept for backward compat. */
function extractFirstMediaId(flowData, keys) {
  const doc = extractFirstMediaDoc(flowData, keys)
  return doc ? doc.id : null
}

module.exports = {
  fetchMediaUrlFromAskeva,
  fetchAndGetMediaUrl,
  extractFirstMediaDoc,
  extractFirstMediaId,
}
