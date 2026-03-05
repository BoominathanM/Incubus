/**
 * services/retailerFromFlow.js
 *
 * Single source of truth for:
 *  - Detecting flow_token in WhatsApp webhook payloads
 *  - Parsing retailer onboarding form fields
 *  - Creating / updating Retailer documents from flow submissions
 *
 * Exports consumed by retailerWebhookController.js:
 *   responseJsonHasRetailerFormCopy(rawPayload) → boolean
 *   getFlowTokenFromResponseJson(rawPayload)     → string
 *   verifyWebhookFlowFromRaw(rawPayload)         → { isRetailerFlow, isOrderFlow, flowToken }
 *   FLOW_TOKEN_RETAILER                          → 'retailer_form_copy'
 *   FLOW_TOKEN_DELIVERY                          → 'delivery_address_copy'
 *
 * Additional export consumed by retailerController.js:
 *   ensureRetailerFromWebhookMessage(webhookMessageId) → Retailer | null
 */

const Retailer = require('../models/Retailer')
const { generateRetailerId } = require('../utils/retailerId')

// ─── Constants ─────────────────────────────────────────────────────────────────

const FLOW_TOKEN_RETAILER = 'retailer_form_copy'
const FLOW_TOKEN_DELIVERY  = 'delivery_address_copy'

// ─── Payload traversal ─────────────────────────────────────────────────────────

/**
 * Walk the standard Meta path:
 *   entry[].changes[].value.messages[].interactive.nfm_reply.response_json
 * and return the parsed response_json object, or null.
 */
function extractResponseJsonObject(rawPayload) {
  try {
    for (const entry of (rawPayload?.entry || [])) {
      for (const change of (entry?.changes || [])) {
        for (const msg of (change?.value?.messages || [])) {
          const raw = msg?.interactive?.nfm_reply?.response_json
          if (raw == null) continue
          return typeof raw === 'string' ? JSON.parse(raw) : raw
        }
      }
    }
  } catch (_) {}
  return null
}

/**
 * Extract flow_token from a payload. Accepts THREE forms:
 *   a) Full raw WhatsApp body  (entry[].changes[].value.messages[].interactive.nfm_reply.response_json)
 *   b) Already-parsed response_json object  { "flow_token": "retailer_form_copy", ... }
 *   c) response_json as a raw JSON string   '{"flow_token":"retailer_form_copy",...}'
 *
 * Returns lowercase-trimmed string, or '' if not found.
 * Called by retailerWebhookController with all three forms, so we must handle each.
 */
function getFlowTokenFromResponseJson(rawPayload) {
  if (!rawPayload) return ''

  // ── Form (b): already a parsed object that directly contains flow_token ──────
  // Detected when the object has no "entry" key (not a full Meta body)
  // but has keys matching flow form fields or flow_token itself.
  if (typeof rawPayload === 'object' && !Array.isArray(rawPayload) && !rawPayload.entry) {
    try {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
      for (const k of Object.keys(rawPayload)) {
        if (norm(k) === 'flowtoken') {
          const v = String(rawPayload[k] ?? '').trim().toLowerCase()
          if (v) return v
        }
      }
    } catch (_) {}
  }

  // ── Form (a): full Meta raw body — walk entry[].changes[].messages[].nfm_reply ──
  try {
    const rj = extractResponseJsonObject(rawPayload)
    if (rj && typeof rj === 'object') {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
      for (const k of Object.keys(rj)) {
        if (norm(k) === 'flowtoken') {
          const v = String(rj[k] ?? '').trim().toLowerCase()
          if (v) return v
        }
      }
    }
  } catch (_) {}

  // ── Form (c) + fallback regex: handles JSON strings and doubly-escaped BSP payloads ──
  try {
    const str = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload)
    // Prefer exact key match in string form
    const match = str.match(/"flow_token"\s*:\s*"([^"]+)"/i)
    if (match) return match[1].trim().toLowerCase()
    // Broad regex fallback
    if (/retailer_form_copy/i.test(str)) return FLOW_TOKEN_RETAILER
    if (/delivery_address_copy/i.test(str)) return FLOW_TOKEN_DELIVERY
  } catch (_) {}

  return ''
}

/**
 * Returns true when the payload's response_json flow_token is retailer_form_copy.
 */
function responseJsonHasRetailerFormCopy(rawPayload) {
  return getFlowTokenFromResponseJson(rawPayload) === FLOW_TOKEN_RETAILER
}

/**
 * Extract the response_json string from Meta webhook rawPayload:
 *   entry[].changes[].value.messages[].interactive.nfm_reply.response_json
 * Use this to verify flow_token BEFORE creating an order.
 */
function getResponseJsonStringFromRawPayload(rawPayload) {
  if (!rawPayload) return null
  try {
    for (const entry of (rawPayload?.entry || [])) {
      for (const change of (entry?.changes || [])) {
        for (const msg of (change?.value?.messages || [])) {
          const nfm = msg?.interactive?.nfm_reply || msg?.interactive?.nfmReply || msg?.interactive?.data?.nfm_reply
          const raw = nfm?.response_json ?? nfm?.responseJson ?? nfm?.response
          if (raw == null) continue
          return typeof raw === 'string' ? raw : JSON.stringify(raw)
        }
      }
    }
  } catch (_) {}
  return null
}

/** All patterns that indicate response_json flow_token is retailer_form_copy (normal, escaped, mixed). */
const RETAILER_FORM_COPY_PATTERNS = [
  /"flow_token"\s*:\s*"retailer_form_copy"/i,
  /\\"flow_token\\"\s*:\s*\\"retailer_form_copy\\"/i,
  /flow_token\\"\s*:\s*\\"retailer_form_copy/i,
  /flow_token"\s*:\s*"retailer_form_copy/i,
  /"flow_token\\"\s*:\s*\\"retailer_form_copy/i,
  /flow_token\s*[=:]\s*["']?retailer_form_copy/i,
  /flow_token\s*:\s*["']?retailer_form_copy/i,
]

function hasRetailerFormCopyInString(str) {
  if (!str || typeof str !== 'string') return false
  for (const re of RETAILER_FORM_COPY_PATTERNS) {
    if (re.test(str)) return true
  }
  return /retailer_form_copy/i.test(str) && /flow_token/i.test(str)
}

/**
 * Returns true if the response_json string contains flow_token retailer_form_copy.
 * Use when you have the raw response_json string (e.g. from nfm_reply.response_json).
 * STRICT: catches "flow_token":"retailer_form_copy", \"flow_token\":\"retailer_form_copy\", flow_token":"retailer_form_copy, etc.
 */
function responseJsonStrHasRetailerFormCopy(responseJsonStr) {
  try {
    if (!responseJsonStr) return false
    const str = typeof responseJsonStr === 'string' ? responseJsonStr : JSON.stringify(responseJsonStr || '')
    return hasRetailerFormCopyInString(str)
  } catch (_) {
    return false
  }
}

/**
 * Returns true if the payload's response_json contains flow_token retailer_form_copy.
 * Checks the actual response_json string from Meta path first, then full payload string.
 * Call this BEFORE creating an order to ensure we never create order for retailer onboarding.
 * STRICT: catches all variants including flow_token\":\"retailer_form_copy\"
 */
function responseJsonStringHasRetailerFormCopy(rawPayload) {
  try {
    if (!rawPayload) return false
    const responseStr = getResponseJsonStringFromRawPayload(rawPayload)
    if (responseStr && hasRetailerFormCopyInString(responseStr)) return true
    const fullStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload || '')
    if (hasRetailerFormCopyInString(fullStr)) return true
  } catch (_) {}
  return false
}

/**
 * STRICT: Returns true if we MUST NOT create order — response_json has flow_token retailer_form_copy.
 * Single source of truth. Call before ANY OrderManagement.create.
 * Handles: rawPayload object, WebhookMessage doc, or response_json string.
 * Catches all variants: "flow_token":"retailer_form_copy", flow_token\":\"retailer_form_copy\", etc.
 */
function mustBlockOrderCreation(payloadOrWm) {
  if (!payloadOrWm) return false
  if ((payloadOrWm.flowToken || '').toString().trim().toLowerCase() === 'retailer_form_copy') return true
  const raw = payloadOrWm?.rawPayload ?? payloadOrWm
  if (!raw) return false
  const responseStr = getResponseJsonStringFromRawPayload(raw)
  if (responseStr && hasRetailerFormCopyInString(responseStr)) return true
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw || '')
  return hasRetailerFormCopyInString(str)
}

/**
 * Returns true when the payload's response_json flow_token is delivery_address_copy
 * (or the alias delivery_address_copy).
 */
function responseJsonHasDeliveryFormCopy(rawPayload) {
  const ft = getFlowTokenFromResponseJson(rawPayload)
  return ft === FLOW_TOKEN_DELIVERY || ft === 'delivery_address_copy'
}

/**
 * Inspect a raw webhook payload and return a routing verdict.
 * Used by retailerWebhookController to gate the full body before
 * processing individual messages.
 *
 * @param  {object} rawPayload  Full req.body
 * @returns {{ isRetailerFlow: boolean, isOrderFlow: boolean, flowToken: string }}
 */
function verifyWebhookFlowFromRaw(rawPayload) {
  const flowToken = getFlowTokenFromResponseJson(rawPayload)
  return {
    isRetailerFlow: flowToken === FLOW_TOKEN_RETAILER,
    isOrderFlow:    flowToken === FLOW_TOKEN_DELIVERY || flowToken === 'delivery_address_copy',
    flowToken,
  }
}

// ─── Retailer upsert (shared logic) ───────────────────────────────────────────

/**
 * Given a parsed response_json object (rj), sender digits, and name,
 * create or update a Retailer document.
 * - Active/approved retailers are never overwritten.
 * - Rejected/pending retailers get their fields refreshed and status reset to pending_approval.
 */
async function upsertRetailerFromFlowData(fromDigits, fromName, rj) {
  // Case-insensitive field getter
  const get = (keys) => {
    for (const k of keys) {
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const found = Object.keys(rj).find((rk) => norm(rk) === norm(k))
      if (found && rj[found] != null) {
        const v = rj[found]
        // WhatsApp Flow: value may be { type, payload } — unwrap
        if (typeof v === 'object' && v !== null && 'payload' in v) return String(v.payload ?? '').trim()
        return String(v).trim()
      }
    }
    return ''
  }

  const toDigits  = (s) => (s || '').replace(/\D/g, '')
  const splitPhone = (raw) => {
    const d = toDigits(raw)
    if (!d) return { countryCode: '+91', number: '' }
    if (d.length <= 10) return { countryCode: '+91', number: d }
    return { countryCode: `+${d.slice(0, d.length - 10)}`, number: d.slice(-10) }
  }

  const rawMobile = toDigits(get(['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob']))
  const primary   = rawMobile.length >= 10 ? rawMobile : (fromDigits || '')
  const { countryCode, number } = splitPhone(primary)

  const altRaw    = toDigits(get(['Alternate Number', 'Alternative Number', 'Alt Number', 'alternateNumber']))
  const altNumber = altRaw.length > 10 ? altRaw.slice(-10) : altRaw
  const altCC     = altRaw.length > 10 ? `+${altRaw.slice(0, altRaw.length - 10)}` : (altNumber ? '+91' : '')

  const branchesRaw = get(['Number of Branches', 'Branches', 'numberOfBranches'])
  const branches    = Math.max(1, parseInt(branchesRaw, 10) || 1)

  const fields = {
    businessName:          get(['Business Name (GST)', 'Business Name', 'businessName']) || fromName || `Retailer ${number}`,
    storeName:             get(['Store Name', 'storeName']),
    contactPerson:         get(['Name', 'Contact Person', 'contactPerson']) || fromName,
    email:                 get(['Email ID', 'Email', 'email']).toLowerCase(),
    whatsappCountryCode:   countryCode,
    whatsappNumber:        number,
    altContactCountryCode: altCC,
    altContactNumber:      altNumber,
    gst:                   get(['GST Number', 'GST', 'gst']) || 'NA',
    pan:                   get(['PAN Number', 'PAN', 'pan']) || 'NA',
    street1:               get(['Street Name 1', 'Street1', 'street1']) || 'NA',
    street2:               get(['Street Name 2', 'Street2', 'street2']),
    city:                  get(['City Name', 'City', 'city']) || 'NA',
    district:              get(['District Name', 'District', 'district']) || 'NA',
    state:                 get(['State', 'state']) || 'NA',
    pincode:               get(['Pin Code', 'Pincode', 'postalCode', 'zip']) || 'NA',
    branches,
  }

  const existing = await Retailer.findOne({
    whatsappCountryCode: fields.whatsappCountryCode,
    whatsappNumber:      fields.whatsappNumber,
  })

  if (existing) {
    // Never overwrite active/approved/disabled retailers
    if (['active', 'approved', 'disabled'].includes(existing.status)) {
      console.log(`[retailerFromFlow] Retailer ${existing.retailerId} is ${existing.status} — skipping overwrite`)
      return existing
    }
    // Re-submission: refresh fields, reset status to pending_approval
    Object.assign(existing, fields, {
      status:         'pending_approval',
      rejectedReason: '',
      rejectedAt:     null,
    })
    if (!existing.retailerId) existing.retailerId = await generateRetailerId()
    await existing.save()
    console.log(`[retailerFromFlow] Updated retailer ${existing.retailerId} → pending_approval`)
    return existing
  }

  const retailer = await Retailer.create({
    ...fields,
    retailerId: await generateRetailerId(),
    status:     'pending_approval',
  })
  console.log(`[retailerFromFlow] Created retailer ${retailer.retailerId} for ${countryCode}${number}`)
  return retailer
}

// ─── Admin endpoint helper ─────────────────────────────────────────────────────

/**
 * Load a WebhookMessage by ID, verify it contains retailer_form_copy,
 * then create/update the Retailer.
 * Used by retailerController → POST /api/retailers/onboard-from-webhook
 *
 * @param  {string|ObjectId} webhookMessageId
 * @returns {object|null}  Retailer document or null
 */
async function ensureRetailerFromWebhookMessage(webhookMessageId) {
  const WebhookMessage = require('../models/WebhookMessage.model')
  const wm = await WebhookMessage.findById(webhookMessageId).lean()
  if (!wm) {
    console.warn('[retailerFromFlow] WebhookMessage not found:', webhookMessageId)
    return null
  }
  if (!responseJsonStringHasRetailerFormCopy(wm.rawPayload) && !responseJsonHasRetailerFormCopy(wm.rawPayload)) {
    console.warn('[retailerFromFlow] Not a retailer_form_copy message:', webhookMessageId)
    return null
  }
  const rj = extractResponseJsonObject(wm.rawPayload) || {}
  return upsertRetailerFromFlowData(wm.from, wm.fromName || '', rj)
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Token constants
  FLOW_TOKEN_RETAILER,
  FLOW_TOKEN_DELIVERY,

  // Payload detection (used by retailerWebhookController + orderController)
  getFlowTokenFromResponseJson,
  getResponseJsonStringFromRawPayload,
  responseJsonHasRetailerFormCopy,
  responseJsonHasDeliveryFormCopy,
  responseJsonStrHasRetailerFormCopy,
  responseJsonStringHasRetailerFormCopy,
  mustBlockOrderCreation,
  extractResponseJsonObject,

  // Routing verdict (used by retailerWebhookController)
  verifyWebhookFlowFromRaw,

  // Admin endpoint helper (used by retailerController.onboardFromWebhookMessage)
  ensureRetailerFromWebhookMessage,
}