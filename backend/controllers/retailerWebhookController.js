const Retailer = require('../models/Retailer')
const WebhookMessage = require('../models/WebhookMessage.model')
const { createOrderFromWebhook, updatePendingOrderDelivery, updatePendingOrderPayment } = require('./orderController')
const { generateRetailerId } = require('../utils/retailerId')
const { responseJsonHasRetailerFormCopy, responseJsonStrHasRetailerFormCopy, responseJsonStringHasRetailerFormCopy, extractResponseJsonObject, getFlowTokenFromResponseJson, verifyWebhookFlowFromRaw, FLOW_TOKEN_RETAILER, FLOW_TOKEN_DELIVERY } = require('../services/retailerFromFlow')

function parseFlowItems(flowData) {
  const raw = flowData.items || flowData.products || flowData.order_items || flowData.product || ''
  const items = []
  for (const part of String(raw).split(',')) {
    const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
    if (match) items.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
  }
  return items
}

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

function toDigits(str) {
  return (str || '').replace(/\D/g, '')
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function extractFlowToken(flowData) {
  if (!flowData || typeof flowData !== 'object') return ''
  const targetKey = 'flowtoken' // normalized
  for (const k of Object.keys(flowData)) {
    if (normalizeKey(k) === targetKey) {
      const v = flowData[k]
      return String(v != null ? v : '').trim().toLowerCase()
    }
  }
  return ''
}

function findFlowTokenRecursive(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return ''
  for (const k of Object.keys(obj)) {
    if (normalizeKey(k) === 'flowtoken') {
      const v = obj[k]
      const s = String(v != null ? v : '').trim().toLowerCase()
      if (s) return s
    }
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      const found = findFlowTokenRecursive(obj[k], depth + 1)
      if (found) return found
    }
  }
  return ''
}

function parseFlowTokenFromResponseJson(rawJson) {
  if (!rawJson) return ''
  const rawStr = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson || {})
  if (/retailer_form_copy/i.test(rawStr)) return 'retailer_form_copy'
  if (/delivery_address_copy/i.test(rawStr)) return 'delivery_address_copy'
  let flowData = {}
  try {
    flowData = typeof rawJson === 'string' ? JSON.parse(rawJson || '{}') : (rawJson || {})
  } catch (_) { return '' }
  let tok = extractFlowToken(flowData)
  if (tok) return tok
  if (flowData.data && typeof flowData.data === 'object') tok = extractFlowToken(flowData.data)
  if (tok) return tok
  if (flowData.response && typeof flowData.response === 'object') tok = extractFlowToken(flowData.response)
  if (tok) return tok
  return findFlowTokenRecursive(flowData) || ''
}

function findFlowResponseInObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return null
  const keys = Object.keys(obj)
  for (const k of keys) {
    const lower = k.toLowerCase()
    if ((lower === 'response_json' || lower === 'responsejson' || lower === 'response') && obj[k]) {
      return obj[k]
    }
    if ((lower === 'nfm_reply' || lower === 'nfmreply' || lower === 'flow_response' || lower === 'flow_response_data') && obj[k]) {
      const v = obj[k]
      if (typeof v === 'string') return v
      if (typeof v === 'object' && v !== null) {
        const inner = v.response_json || v.responseJson || v.response || v.data
        if (inner != null) return typeof inner === 'string' ? inner : JSON.stringify(inner)
        if (/retailer_form_copy|flow_token/i.test(JSON.stringify(v))) return JSON.stringify(v)
      }
    }
  }
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'object' && v !== null) {
      const found = findFlowResponseInObject(v, depth + 1)
      if (found) return found
    }
  }
  return null
}

function extractFlowDataFromBodyString(bodyStr) {
  if (!bodyStr || typeof bodyStr !== 'string') return null
  if (!/retailer_form_copy/i.test(bodyStr)) return null
  const re = /"(?:response_json|responseJson|response)"\s*:\s*"((?:\\.|[^"\\])+)"/i
  const m = bodyStr.match(re)
  if (m && m[1]) {
    try {
      let raw = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    } catch (_) {
      try {
        const parsed = JSON.parse(m[1])
        if (parsed && typeof parsed === 'object') return parsed
      } catch (_2) {}
    }
  }
  return null
}

function looksLikeRetailerForm(rawOrObj) {
  const str = typeof rawOrObj === 'string' ? rawOrObj : JSON.stringify(rawOrObj || {})
  if (/retailer_form_copy/i.test(str)) return true
  const norm = str.toLowerCase()
  const retailerKeys = ['business name', 'store name', 'gst number', 'pan number', 'businessname', 'storename']
  const hit = retailerKeys.filter((k) => norm.includes(k)).length
  return hit >= 2
}

function payloadContainsRetailerFormCopy(messages, fullBody = null) {
  const payload = fullBody || (messages && messages.length ? { entry: [{ changes: [{ value: { messages } }] }] } : null)
  return getFlowTokenFromResponseJson(payload) === FLOW_TOKEN_RETAILER
}

function getFlowValue(flowData, keys) {
  if (!flowData || typeof flowData !== 'object') return ''
  const sources = [flowData]
  if (flowData.data && typeof flowData.data === 'object') sources.push(flowData.data)
  if (flowData.response && typeof flowData.response === 'object') sources.push(flowData.response)
  for (const src of sources) {
    const keyMap = new Map(Object.keys(src).map((k) => [normalizeKey(k), k]))
    for (const rawKey of keys) {
      const original = keyMap.get(normalizeKey(rawKey))
      if (!original) continue
      let value = src[original]
      if (value == null) continue
      if (typeof value === 'object' && value !== null && 'payload' in value) value = value.payload
      if (value == null) continue
      if (typeof value === 'string') return value.trim()
      if (typeof value === 'number') return String(value)
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (Array.isArray(value)) return value.length ? String(value[0]) : ''
      if (typeof value === 'object') return JSON.stringify(value)
    }
  }
  return ''
}

function detectRetailerOnboardingFlow(flowData) {
  const businessName = getFlowValue(flowData, ['Business Name (GST)', 'Business Name', 'businessName'])
  const storeName = getFlowValue(flowData, ['Store Name', 'storeName'])
  const gst = getFlowValue(flowData, ['GST Number', 'GST', 'gst'])
  const pan = getFlowValue(flowData, ['PAN Number', 'PAN', 'pan'])
  const street1 = getFlowValue(flowData, ['Street Name 1', 'Street1', 'street1'])
  const city = getFlowValue(flowData, ['City Name', 'City', 'city'])

  if (businessName && storeName) return true
  if (storeName && (gst || pan)) return true
  if (businessName && gst && pan && (street1 || city)) return true

  const fieldChecks = [
    businessName || getFlowValue(flowData, ['Business Name (GST)', 'Business Name', 'businessName']),
    storeName || getFlowValue(flowData, ['Store Name', 'storeName']),
    getFlowValue(flowData, ['Name', 'Contact Person', 'contactPerson']),
    getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob']),
    getFlowValue(flowData, ['Email ID', 'Email', 'email']),
    getFlowValue(flowData, ['GST Number', 'GST', 'gst']),
    getFlowValue(flowData, ['PAN Number', 'PAN', 'pan']),
    getFlowValue(flowData, ['Street Name 1', 'Street1', 'street1']),
    getFlowValue(flowData, ['City Name', 'City', 'city']),
    getFlowValue(flowData, ['District Name', 'District', 'district']),
    getFlowValue(flowData, ['State', 'state']),
    getFlowValue(flowData, ['Pin Code', 'Pincode', 'postalCode', 'zip']),
  ]
  const presentCount = fieldChecks.filter((v) => String(v || '').trim() !== '').length
  const hasBusinessFields = !!(businessName || gst || pan)
  return hasBusinessFields && presentCount >= 4
}

function splitPhoneFromWaId(waIdDigits) {
  const digits = String(waIdDigits || '').replace(/\D/g, '')
  if (!digits) return { countryCode: '+91', number: '' }
  if (digits.length <= 10) return { countryCode: '+91', number: digits }
  const number = digits.slice(-10)
  const countryCode = `+${digits.slice(0, -10)}`
  return { countryCode, number }
}

function normalizeBranchCount(value) {
  const n = parseInt(String(value || '').trim(), 10)
  return Number.isNaN(n) || n < 1 ? 1 : n
}

async function upsertRetailerFromFlow({ fromNumber, fromName, flowData }) {
  const formMobile = toDigits(getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']))
  const primaryPhone = formMobile.length >= 10 ? formMobile : (fromNumber || '')
  const { countryCode, number } = splitPhoneFromWaId(primaryPhone || fromNumber)

  const businessName = getFlowValue(flowData, ['Business Name (GST)', 'Business Name', 'businessName'])
  const storeName = getFlowValue(flowData, ['Store Name', 'storeName'])
  const contactPerson = getFlowValue(flowData, ['Name', 'Contact Person', 'contactPerson']) || fromName || businessName
  const email = (getFlowValue(flowData, ['Email ID', 'Email', 'email']) || '').toLowerCase()
  const gst = getFlowValue(flowData, ['GST Number', 'GST', 'gst'])
  const pan = getFlowValue(flowData, ['PAN Number', 'PAN', 'pan'])
  const street1 = getFlowValue(flowData, ['Street Name 1', 'Street1', 'street1'])
  const street2 = getFlowValue(flowData, ['Street Name 2', 'Street2', 'street2'])
  const city = getFlowValue(flowData, ['City Name', 'City', 'city'])
  const district = getFlowValue(flowData, ['District Name', 'District', 'district'])
  const state = getFlowValue(flowData, ['State', 'state'])
  const pincode = getFlowValue(flowData, ['Pin Code', 'Pincode', 'postalCode', 'zip'])
  const altContactNumberRaw = getFlowValue(flowData, ['Alternate Number', 'Alternative Number', 'Alt Number', 'alternateNumber'])
  const branchesRaw = getFlowValue(flowData, ['Number of Branches', 'Branches', 'numberOfBranches'])

  const altDigits = String(altContactNumberRaw || '').replace(/\D/g, '')
  const altContactNumber = altDigits.length > 10 ? altDigits.slice(-10) : altDigits
  const altContactCountryCode = altDigits.length > 10 ? `+${altDigits.slice(0, -10)}` : (altContactNumber ? countryCode : '')

  const existingByWhatsApp = await Retailer.findOne({
    whatsappCountryCode: countryCode,
    whatsappNumber: number,
  })

  if (existingByWhatsApp) {
    if (['active', 'approved', 'disabled'].includes(existingByWhatsApp.status)) return existingByWhatsApp
    if (!existingByWhatsApp.retailerId) {
      existingByWhatsApp.retailerId = await generateRetailerId()
    }
    existingByWhatsApp.businessName = businessName || existingByWhatsApp.businessName
    existingByWhatsApp.storeName = storeName || existingByWhatsApp.storeName
    existingByWhatsApp.contactPerson = contactPerson || existingByWhatsApp.contactPerson
    existingByWhatsApp.email = email || existingByWhatsApp.email
    existingByWhatsApp.gst = gst || existingByWhatsApp.gst
    existingByWhatsApp.pan = pan || existingByWhatsApp.pan
    existingByWhatsApp.street1 = street1 || existingByWhatsApp.street1
    existingByWhatsApp.street2 = street2 || existingByWhatsApp.street2
    existingByWhatsApp.city = city || existingByWhatsApp.city
    existingByWhatsApp.district = district || existingByWhatsApp.district
    existingByWhatsApp.state = state || existingByWhatsApp.state
    existingByWhatsApp.pincode = pincode || existingByWhatsApp.pincode
    existingByWhatsApp.altContactCountryCode = altContactCountryCode || existingByWhatsApp.altContactCountryCode
    existingByWhatsApp.altContactNumber = altContactNumber || existingByWhatsApp.altContactNumber
    existingByWhatsApp.branches = branchesRaw ? normalizeBranchCount(branchesRaw) : existingByWhatsApp.branches
    existingByWhatsApp.status = 'pending_approval'
    existingByWhatsApp.rejectedReason = ''
    existingByWhatsApp.rejectedAt = null
    await existingByWhatsApp.save()
    return existingByWhatsApp
  }

  const doc = await Retailer.create({
    retailerId: await generateRetailerId(),
    businessName: businessName || contactPerson || `Retailer ${number}`,
    storeName: storeName || '',
    contactPerson: contactPerson || businessName || 'Retailer',
    email: email || '',
    whatsappCountryCode: countryCode,
    whatsappNumber: number,
    altContactCountryCode: altContactCountryCode || '',
    altContactNumber: altContactNumber || '',
    gst: gst || 'NA',
    pan: pan || 'NA',
    street1: street1 || 'NA',
    street2: street2 || '',
    city: city || 'NA',
    district: district || 'NA',
    state: state || 'NA',
    pincode: pincode || 'NA',
    branches: normalizeBranchCount(branchesRaw),
    status: 'pending_approval',
  })
  return doc
}

/**
 * GET /api/retailer-webhook/receive/:companyId
 * Webhook verification — Meta/WhatsApp and some providers send GET with hub.mode, hub.verify_token, hub.challenge.
 */
exports.handleWebhookVerification = (req, res) => {
  try {
    const q = req.query || {}
    const mode = q.hub_mode ?? q['hub.mode'] ?? q.mode ?? ''
    const token = q.hub_verify_token ?? q['hub.verify_token'] ?? q.verify_token ?? q.token ?? ''
    const challenge = q.hub_challenge ?? q['hub.challenge'] ?? q.challenge ?? ''

    if (String(mode).toLowerCase() === 'subscribe' && challenge) {
      const verifyToken = (process.env.WEBHOOK_VERIFY_TOKEN || 'askeva_webhook_verify').trim()
      const tokenStr = String(token || '').trim()
      if (!verifyToken || !tokenStr || tokenStr === verifyToken) {
        console.log('[RetailerWebhook] Verification successful')
        return res.type('text/plain').status(200).send(String(challenge))
      }
    }
    console.warn('[RetailerWebhook] Verification failed — mode:', mode, 'challenge present:', !!challenge, 'token present:', !!token)
    return res.status(403).send('Verification failed')
  } catch (err) {
    console.error('[RetailerWebhook] Verification error:', err)
    return res.status(500).send('Verification error')
  }
}

/**
 * POST /api/retailer-webhook/receive/:companyId
 *
 * NEW FLOW (strict — only two flow_tokens drive actions):
 * 1. Webhook received → store raw payload in WebhookMessage first (rawPayload = full body).
 * 2. Extract response_json from rawPayload.entry[].changes[].value.messages[].interactive.nfm_reply.response_json
 * 3. Check flow_token in response_json (direct string check).
 * 4. Route ONLY by flow_token:
 *    - "flow_token":"retailer_form_copy" → Retailers collection only (onboard). NO order. Strict.
 *    - "flow_token":"delivery_address_copy" → OrderManagement collection only (create order via session).
 *    - Everything else (no response_json, other token, catalog, payment, text) → SKIP (no retailer, no order).
 */
function extractWebhookBody(req) {
  let body = req.body && typeof req.body === 'object' ? req.body : {}
  // Fallback: parse req.rawBody when req.body is empty (raw webhook middleware sets rawBody)
  if (Object.keys(body || {}).length === 0 && req.rawBody && typeof req.rawBody === 'string' && req.rawBody.trim()) {
    try {
      body = JSON.parse(req.rawBody)
    } catch (_) {
      try {
        const qs = require('querystring')
        const p = qs.parse(req.rawBody)
        if (p.payload && typeof p.payload === 'string') body = JSON.parse(p.payload)
        else if (p && Object.keys(p).length) body = p
      } catch (_) {}
    }
  }

  // Form-urlencoded: JSON may be in a field (payload, data, body, etc.)
  const candidates = ['payload', 'data', 'body', 'webhook', 'message', 'value', 'event']
  for (const k of candidates) {
    const v = body?.[k]
    if (v != null && (typeof v === 'string' ? v.trim().startsWith('{') || v.trim().startsWith('[') : typeof v === 'object')) {
      const parsed = typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch (_) { return null } })() : v
      if (parsed && typeof parsed === 'object' && (parsed.entry || parsed.object || parsed.messages)) {
        body = parsed
        break
      }
      if (Array.isArray(parsed) && parsed[0]?.changes) {
        body = { entry: parsed }
        break
      }
    }
  }
  return body || {}
}

exports.receiveRetailerWebhook = async (req, res) => {
  const contentType = req.get('content-type') || 'none'
  console.log('[RetailerWebhook] POST received | path:', req.originalUrl || req.url, '| Content-Type:', contentType)
  const sendOk = () => {
    if (!res.headersSent) res.status(200).json({ success: true, message: 'Webhook received' })
  }
  // Respond 200 immediately so provider (Meta/WhatsApp) does not timeout — they require 200 within ~20s
  sendOk()

  let body = {}
  let companyId = COMPANY_ID
  try {
    const rawCompanyId = req.params.companyId || ''
    companyId = (rawCompanyId && !rawCompanyId.startsWith(':')) ? rawCompanyId : COMPANY_ID
    body = extractWebhookBody(req)
    // Fallback: use req.body directly when extractWebhookBody returns empty (e.g. different structure)
    if (Object.keys(body || {}).length === 0 && req.body && typeof req.body === 'object' && Object.keys(req.body || {}).length > 0) {
      body = req.body
    }
    if (Object.keys(body || {}).length === 0 && req.rawBody && typeof req.rawBody === 'string' && req.rawBody.trim()) {
      try { body = JSON.parse(req.rawBody) } catch (_) {
        try { const qs = require('querystring'); const p = qs.parse(req.rawBody); body = (p.payload && typeof p.payload === 'string') ? JSON.parse(p.payload) : p } catch (_) {}
      }
    }
    if (Object.keys(body || {}).length === 0) {
      console.warn('[RetailerWebhook] Body empty — req.body keys:', Object.keys(req.body || {}).join(',') || '(empty)', '| rawBody len:', typeof req.rawBody === 'string' ? req.rawBody.length : 0)
    }
  } catch (e) {
    console.warn('[RetailerWebhook] Error reading request:', e?.message)
    return
  }
  console.log('[RetailerWebhook] IDENTIFY | company:', companyId, '| bodyKeys:', Object.keys(body).join(','), '| entries:', body?.entry?.length ?? 0)
  console.log('[RetailerWebhook] Full received body:', JSON.stringify(body, null, 2))
  if (process.env.DEBUG_WEBHOOK === '1') {
    console.log('[RetailerWebhook] DEBUG body sample:', JSON.stringify(body).slice(0, 1500))
  }

  const stored = []
  const errors = []

  try {
    // Normalise form-encoded payload (entry or payload as JSON string)
    if (typeof body.entry === 'string') {
      try { body.entry = JSON.parse(body.entry) } catch (_) {}
    }
    if (body?.data && typeof body.data.entry === 'string') {
      try { body.data.entry = JSON.parse(body.data.entry) } catch (_) {}
    }
    if (typeof body.payload === 'string') {
      try {
        const parsed = JSON.parse(body.payload)
        if (parsed && (Array.isArray(parsed.entry) || parsed.entry)) body.entry = parsed.entry
      } catch (_) {}
    }
    // Support multiple payload structures (Meta, AskEva, BSPs)
    const entries = Array.isArray(body?.entry)
      ? body.entry
      : Array.isArray(body?.data?.entry)
        ? body.data.entry
        : Array.isArray(body?.data) && body.data[0]?.changes
          ? body.data
          : (body?.messages ? [{ changes: [{ value: body }] }] : [])

    if (entries.length === 0 && body && Object.keys(body).length > 0) {
      console.log('[RetailerWebhook] No entry in payload — body keys:', Object.keys(body), '| sample:', JSON.stringify(body).slice(0, 400))
    }

    // ── If NO entries — check for flat response_json with retailer_form_copy; ALWAYS store payload ──
    if (entries.length === 0) {
      const directFlowToken = parseFlowTokenFromResponseJson(body) || getFlowTokenFromResponseJson(body) || ''
      const flatPayloadToStore = (body && Object.keys(body).length > 0) ? body : (req.rawBody ? { _raw: String(req.rawBody).slice(0, 50000) } : {})

      const fromNumber = toDigits(getFlowValue(body, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']))
      const fromName = getFlowValue(body, ['Name', 'Contact Person', 'contactPerson']) || ''
      const isRetailerFormWithPhone = directFlowToken === 'retailer_form_copy' && fromNumber

      if (isRetailerFormWithPhone) {
        try {
          const retailer = await upsertRetailerFromFlow({ fromNumber, fromName, flowData: body })
          console.log('[RetailerWebhook] Retailer onboarded (flat retailer_form_copy):', retailer?.retailerId, '| status:', retailer?.status)
          await WebhookMessage.create({
            companyId,
            messageId: '',
            from: fromNumber,
            fromName,
            messageType: 'interactive',
            messageBody: `Retailer onboarding (retailer_form_copy) from ${fromName || fromNumber}`,
            flowToken: 'retailer_form_copy',
            flowResponseData: body,
            timestamp: new Date(),
            retailer: retailer?._id || null,
            retailerMatched: true,
            rawPayload: flatPayloadToStore,
          }).catch((e) => {
            if (e?.code !== 11000) console.error('[RetailerWebhook] WebhookMessage.create (flat payload) error:', e.message)
          })
        } catch (err) {
          console.error('[RetailerWebhook] upsertRetailerFromFlow (flat payload) failed:', err.message)
        }
      } else if (directFlowToken === 'retailer_form_copy' && !fromNumber) {
        console.warn('[RetailerWebhook] retailer_form_copy flat payload but no phone — cannot create retailer')
      }

      // ALWAYS store when we have payload and didn't store above — never lose incoming data
      if (Object.keys(flatPayloadToStore).length > 0 && !isRetailerFormWithPhone) {
        await WebhookMessage.create({
          companyId,
          messageId: '',
          from: 'unknown',
          fromName: '',
          messageType: 'unknown',
          messageBody: '',
          flowToken: directFlowToken || '',
          timestamp: new Date(),
          retailer: null,
          retailerMatched: false,
          rawPayload: flatPayloadToStore,
        }).catch((e) => {
          if (e?.code !== 11000) console.error('[RetailerWebhook] WebhookMessage.create (no-entries fallback) error:', e.message)
        })
        console.log('[RetailerWebhook] Stored payload (no standard entries) — rawPayload saved')
      }
      return
    }

    // Pre-scan the full body once — determines routing for ALL messages/changes in this request
    const verified = verifyWebhookFlowFromRaw(body || {})
    const isRetailerFormPayload = verified.isRetailerFlow || getFlowTokenFromResponseJson(body || {}) === FLOW_TOKEN_RETAILER
    if (verified.isRetailerFlow) {
      console.log('[RetailerWebhook] Verified from raw: flow_token=retailer_form_copy → Retailer collection only, NO order')
    }
    if (verified.isOrderFlow) {
      console.log('[RetailerWebhook] Verified from raw: flow_token=delivery_address_copy → Order flow only')
    }

    // EARLY: When response_json has "flow_token":"retailer_form_copy" — INSERT into retailers IMMEDIATELY (no condition should block this)
    const bodyHasRetailerFormCopy = responseJsonStringHasRetailerFormCopy(body) || isRetailerFormPayload || (() => {
      const s = typeof body === 'string' ? body : JSON.stringify(body || '')
      return /retailer_form_copy/i.test(s) && /flow_token/i.test(s)
    })()
    if (bodyHasRetailerFormCopy && entries.length > 0) {
      try {
        const flowRaw = extractResponseJsonObject(body) || findFlowResponseInObject(body) || extractFlowDataFromBodyString(JSON.stringify(body || {})) || (body && !body.entry ? body : null)
        const flowData = flowRaw ? (typeof flowRaw === 'string' ? (() => { try { return JSON.parse(flowRaw || '{}') } catch (_) { return {} } })() : flowRaw) : {}
        const firstEntry = entries[0]
        const firstChange = Array.isArray(firstEntry?.changes) ? firstEntry.changes[0] : firstEntry?.value || firstEntry
        const firstValue = firstChange?.value || firstChange || {}
        let msgs = firstValue?.messages || firstValue?.message || []
        if (!Array.isArray(msgs) && msgs && typeof msgs === 'object') msgs = [msgs]
        const firstMsg = Array.isArray(msgs) ? msgs[0] : null
        const contactsList = firstValue?.contacts || []
        const firstContact = contactsList.find((c) => c?.wa_id) || contactsList[0]
        let earlyFrom = toDigits(firstMsg?.from || firstMsg?.sender_id || firstMsg?.wa_id || firstContact?.wa_id || '')
        if (!earlyFrom) earlyFrom = toDigits(getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone', 'contactNumber']))
        const earlyFromName = firstContact?.profile?.name || getFlowValue(flowData, ['Name', 'Contact Person']) || ''
        if (earlyFrom) {
          const retailer = await upsertRetailerFromFlow({ fromNumber: earlyFrom, fromName: earlyFromName, flowData })
          console.log('[RetailerWebhook] EARLY retailer INSERT (flow_token retailer_form_copy):', retailer?.retailerId, '| status:', retailer?.status)
        }
      } catch (earlyErr) {
        console.error('[RetailerWebhook] EARLY retailer insert failed:', earlyErr.message, earlyErr.stack)
      }
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : (entry?.value ? [entry] : [])

      for (const change of changes) {
        const value = change?.value || change || {}
        let messages = Array.isArray(value?.messages)
          ? value.messages
          : Array.isArray(value?.message)
            ? value.message
            : Array.isArray(value)
              ? value
              : []
        // Single message object (some BSPs send message not messages)
        if (messages.length === 0 && value?.message && typeof value.message === 'object') {
          messages = [value.message]
        }
        // Top-level body.messages fallback
        if (messages.length === 0 && Array.isArray(body?.messages)) {
          messages = body.messages
        }
        if (messages.length === 0 && body?.data?.messages) {
          messages = Array.isArray(body.data.messages) ? body.data.messages : [body.data.messages]
        }
        if (messages.length === 0 && value?.metadata) {
          console.log('[RetailerWebhook] Change has metadata but no messages — value keys:', Object.keys(value))
        }
        const contacts  = Array.isArray(value?.contacts) ? value.contacts : []
        const metadata  = value?.metadata || {}

        // ── Process all messages ──────────────────────────────────────────────
        for (const msg of messages) {
          let from = toDigits(msg.from || msg.sender_id || msg.senderId || msg.wa_id || contacts[0]?.wa_id || '')
          const contact = contacts.find((c) => toDigits(c.wa_id) === from)
          const fromName = contact?.profile?.name || ''
          const msgType = msg.type || 'text'
          const msgId = msg.id || msg.message_id || '(no-id)'
          const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date()
          const activeRetailer = from ? await findActiveRetailer(from) : null
          console.log('[RetailerWebhook] IDENTIFY | message | from:', from, '| msgType:', msgType, '| messageId:', msgId)

          // ── STEP 2: Store raw payload in WebhookMessage first (before extract/route) ───────────
          let record
          try {
            // Pre-scan flow_token from body so it's stored immediately (guards in orderController depend on it)
            const preScannedFlowToken = getFlowTokenFromResponseJson(body || {}) || ''
            // Ensure rawPayload is never empty when we have data (fallback to req.rawBody)
            const payloadToStore = (body && Object.keys(body).length > 0)
              ? body
              : (req.rawBody && typeof req.rawBody === 'string' && req.rawBody.trim())
                ? (() => { try { return JSON.parse(req.rawBody) } catch (_) { return { _raw: req.rawBody } } })()
                : {}
            record = await WebhookMessage.create({
              companyId,
              messageId:       msg.id || '',
              from:            from || 'unknown',
              fromName,
              messageType:     msgType,
              messageBody:     '',
              flowToken:       preScannedFlowToken,
              timestamp,
              retailer:        null,
              retailerMatched: false,
              rawPayload:      payloadToStore,
            })
            console.log('[RetailerWebhook] IDENTIFY | Step 2: raw payload stored in WebhookMessage | id:', record._id?.toString(), '| from:', from)
          } catch (createErr) {
            if (createErr.code === 11000) {
              // Duplicate messageId — WhatsApp retry. Find existing record and continue processing.
              console.warn('[RetailerWebhook] Duplicate messageId — WhatsApp retry | msgId:', msg.id)
              record = await WebhookMessage.findOne({ messageId: msg.id || '' }).lean()
              if (!record) {
                console.error('[RetailerWebhook] Could not find existing record for duplicate messageId — skipping')
                continue
              }
            } else {
              console.error('[RetailerWebhook] WebhookMessage.create failed:', createErr.message)
              continue
            }
          }

          // ── STEP 3 & 4: Extract response_json, check flow_token; STEP 5: Route ───────────
          let messageBody = ''
          let orderItems = []
          let catalogId = msg?.order?.catalog_id || value?.catalog_id || body?.catalog_id || ''
          let extraFields = {}
          let shouldCreateOrder = false
          let flowToken = ''
          let flowResponseData = null
          /** When flow_token is retailer_form_copy, retailer created/updated from this message (link to WebhookMessage) */
          let retailerFromFlow = null
          /** Direct check on current message's response_json string — set in interactive block */
          let currentMessageHasRetailerFormCopy = false
          let currentMessageHasDeliveryFormCopy = false

          if (msgType === 'order' && msg.order) {
            orderItems = (msg.order.product_items || []).map((i) => ({
              productRetailerId: i.product_retailer_id || '',
              quantity: Number(i.quantity) || 1,
              productName: i.product_name || i.name || '',
              itemPrice: Number(i.item_price || i.price) || 0,
            }))
            messageBody = orderItems.map((i) =>
              (i.productName ? `${i.productName} x${i.quantity}` : `${i.productRetailerId} x${i.quantity}`)
            ).join(', ') || `Catalog order: ${catalogId}`

            if (orderItems.length > 0) {
              try {
                const catalogReferenceId = (msg.order && (msg.order.reference_id || msg.order.referenceId)) ? String(msg.order.reference_id || msg.order.referenceId).trim() : ''
                const order = await createOrderFromWebhook({
                  companyId,
                  webhookMessageId: record._id,
                  from,
                  fromName,
                  retailerMatched: !!activeRetailer,
                  retailer: activeRetailer?._id || null,
                  items: orderItems,
                  catalogId: catalogId || '',
                  messageBody,
                  extraFields: {
                    paymentStatus: 'Pending',
                    ...(catalogReferenceId && { referenceId: catalogReferenceId }),
                  },
                })
                if (order) {
                  console.log('[RetailerWebhook] Pending order created in OrderManagement:', order.orderId, '| from:', from)
                }
              } catch (orderErr) {
                console.warn('[RetailerWebhook] createOrderFromWebhook failed:', orderErr.message)
              }
            }
            console.log('[RetailerWebhook] IDENTIFY | catalog order → OrderManagement (pending) | from:', from)
          } else if (msgType === 'interactive' || (msg.interactive && (msg.interactive?.nfm_reply || msg.interactive?.nfmReply)) || (isRetailerFormPayload && findFlowResponseInObject(msg))) {
            try {
              const nfmReply = msg.interactive?.nfm_reply || msg.interactive?.nfmReply || msg.interactive?.data?.nfm_reply || {}
              let rawJson = nfmReply?.response_json || nfmReply?.responseJson || nfmReply?.response || ''
              if (!rawJson) {
                const found = findFlowResponseInObject(msg)
                if (found) rawJson = typeof found === 'string' ? found : JSON.stringify(found)
              }
              // STEP 3: Extract response_json from message (path: interactive.nfm_reply.response_json)
              // STEP 4: Check flow_token in response_json (handles normal and escaped "flow_token":"retailer_form_copy")
              let responseJsonStr = ''
              try {
                responseJsonStr = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson || '')
                currentMessageHasRetailerFormCopy = responseJsonStrHasRetailerFormCopy(responseJsonStr)
                currentMessageHasDeliveryFormCopy = /"flow_token"\s*:\s*"delivery_address_copy"/i.test(responseJsonStr) || /"flow_token"\s*:\s*'delivery_address_copy'/.test(responseJsonStr)
              } catch (e) {
                const rawStr = String(rawJson || '')
                currentMessageHasRetailerFormCopy = responseJsonStrHasRetailerFormCopy(rawStr)
                currentMessageHasDeliveryFormCopy = /"flow_token"\s*:\s*"delivery_address_copy"|flow_token["\s]*:["\s]*delivery_address_copy/i.test(rawStr)
              }
              console.log('[RetailerWebhook] IDENTIFY | Step 3–4: response_json extracted, flow_token check | retailer_form_copy:', currentMessageHasRetailerFormCopy, '| delivery_address_copy:', currentMessageHasDeliveryFormCopy, '| from:', from)

              let flowData = {}
              try {
                flowData = typeof rawJson === 'string' ? JSON.parse(rawJson || '{}') : (rawJson || {})
                flowResponseData = flowData
              } catch (_) {
                flowData = {}
                flowResponseData = { _raw: String(rawJson || '').slice(0, 1000) }
              }
              // Only two flow_token values: retailer_form_copy → Retailer; delivery_address_copy → order (trust direct string check first)
              flowToken = currentMessageHasRetailerFormCopy ? FLOW_TOKEN_RETAILER : (currentMessageHasDeliveryFormCopy ? FLOW_TOKEN_DELIVERY : (getFlowTokenFromResponseJson(flowData) || getFlowTokenFromResponseJson(rawJson) || ''))
              const isRetailerToken = flowToken === FLOW_TOKEN_RETAILER || currentMessageHasRetailerFormCopy
              const isDeliveryToken = flowToken === FLOW_TOKEN_DELIVERY || currentMessageHasDeliveryFormCopy

              if (currentMessageHasRetailerFormCopy) {
                console.log('[RetailerWebhook] IDENTIFY | flow_token=retailer_form_copy (from response_json string) → route=RETAILER only, NO order | from:', from)
              }
              if (currentMessageHasDeliveryFormCopy) {
                console.log('[RetailerWebhook] IDENTIFY | flow_token=delivery_address_copy (from response_json string) → route=ORDER flow | from:', from)
              }
              if (!currentMessageHasRetailerFormCopy && !currentMessageHasDeliveryFormCopy && flowToken) {
                console.log('[RetailerWebhook] IDENTIFY | flow_token (parsed):', flowToken, '| from:', from)
              }
              if (!currentMessageHasRetailerFormCopy && !currentMessageHasDeliveryFormCopy && !flowToken) {
                console.log('[RetailerWebhook] IDENTIFY | flow_token: (empty/other) → no retailer, no order | from:', from)
              }

              if (isRetailerToken) {
                // STEP 5a: flow_token === retailer_form_copy → Retailers collection only (ALWAYS create when response present)
                console.log('[RetailerWebhook] IDENTIFY | Step 5a: route → Retailers collection (retailer_form_copy) | from:', from)
                const fromForRetailer = from || toDigits(getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']))
                if (fromForRetailer) {
                  try {
                    const retailer = await upsertRetailerFromFlow({ fromNumber: fromForRetailer, fromName, flowData })
                    retailerFromFlow = retailer
                    console.log('[RetailerWebhook] IDENTIFY | RETAILER created/updated | retailerId:', retailer?.retailerId, '| status:', retailer?.status, '| from:', from)
                  } catch (err) {
                    console.error('[RetailerWebhook] upsertRetailerFromFlow failed:', err.message, err.stack)
                  }
                } else {
                  // Use contact/body fallback when message.from is missing
                  const fallbackFrom = toDigits(contacts[0]?.wa_id || getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile']))
                  if (fallbackFrom) {
                    try {
                      const retailer = await upsertRetailerFromFlow({ fromNumber: fallbackFrom, fromName: fromName || getFlowValue(flowData, ['Name', 'Contact Person']) || '', flowData })
                      retailerFromFlow = retailer
                      console.log('[RetailerWebhook] IDENTIFY | RETAILER created (fallback phone) | retailerId:', retailer?.retailerId, '| from:', fallbackFrom)
                    } catch (err) {
                      console.error('[RetailerWebhook] upsertRetailerFromFlow (fallback) failed:', err.message)
                    }
                  } else {
                    console.warn('[RetailerWebhook] retailer_form_copy but no phone in message or form — cannot create retailer')
                  }
                }
                messageBody = `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || from}`
                shouldCreateOrder = false
              } else if (isDeliveryToken) {
                console.log('[RetailerWebhook] IDENTIFY | Step 5b: route → OrderManagement (delivery_address_copy) | from:', from)
                const referenceId = (msg.interactive?.reference_id || msg.interactive?.referenceId || '').trim()
                const addr = getFlowValue(flowData, ['Delivery Address', 'Address', 'delivery_address', 'shipping_address', 'address'])
                const s1 = getFlowValue(flowData, ['Street Name', 'Street Name 1', 'Street1', 'street1'])
                const s2 = getFlowValue(flowData, ['Street Name 2', 'Street2', 'street2'])
                const city = getFlowValue(flowData, ['City', 'City Name', 'city'])
                const state = getFlowValue(flowData, ['State', 'state'])
                const pin = getFlowValue(flowData, ['PIN Code', 'Pin Code', 'Pincode', 'postalCode', 'zip'])
                const deliveryAddress = addr || [s1, s2, city, state, pin].filter(Boolean).join(', ')
                const storeName = getFlowValue(flowData, ['Store Name', 'storeName'])
                const customerName = getFlowValue(flowData, ['Customer Name', 'Name', 'Contact Name', 'Contact Person', 'contactName', 'full_name', 'name']) || fromName
                const mobileNum = getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'phone', 'contactNumber']) || from
                const altNum = getFlowValue(flowData, ['Alternate Number', 'Alternative Number', 'Alt Number', 'alternateNumber'])
                const landmark = getFlowValue(flowData, ['Landmark', 'landmark'])
                extraFields = {
                  referenceId,
                  contactName: customerName,
                  contactNumber: mobileNum,
                  deliveryAddress,
                  deliveryStoreName: storeName,
                  deliveryCustomerName: customerName,
                  deliveryStreetName: s1,
                  deliveryLandmark: landmark,
                  deliveryCity: city,
                  deliveryState: state,
                  deliveryPincode: pin,
                  deliveryMobileNumber: mobileNum,
                  deliveryAlternateNumber: altNum,
                }

                const updatedOrder = await updatePendingOrderDelivery(companyId, from, extraFields)
                if (updatedOrder) {
                  console.log('[RetailerWebhook] Updated pending order delivery:', updatedOrder.orderId, '| from:', from)
                }
                messageBody = `Delivery form (${flowToken}) from ${fromName || from}`
                shouldCreateOrder = false
                console.log('[RetailerWebhook] IDENTIFY | delivery_address_copy → OrderManagement updated | from:', from)
              } else {
                // Only retailer_form_copy and delivery_address_copy are used; other/empty token → no retailer, no order
                messageBody = `Flow submission from ${fromName || from}`
                shouldCreateOrder = false
              }
            } catch (_) {
              messageBody = `Flow submission from ${fromName || from}`
              shouldCreateOrder = false
            }
          } else if (msgType === 'payment' && msg.payment) {
            const pay = msg.payment
            const paymentReferenceId = (pay.reference_id || msg.interactive?.reference_id || msg.context?.id || '').trim()
            extraFields = {
              referenceId: paymentReferenceId || undefined,
              paymentStatus:  pay.status === 'captured' ? 'Success' : 'Pending',
              transactionId:  pay.transaction_id || pay.reference_id || '',
              paymentMode:    'WhatsApp Pay',
              paymentDate:    pay.status === 'captured' ? new Date() : null,
              amount:        pay.amount ? Number(pay.amount) : 0,
            }
            messageBody = `Payment ${pay.status || ''} - txn: ${pay.transaction_id || pay.reference_id || ''}`

            const updatedOrder = await updatePendingOrderPayment(companyId, from, extraFields)
            if (updatedOrder) {
              console.log('[RetailerWebhook] Payment applied to pending order:', updatedOrder.orderId, '| from:', from)
            }
            console.log('[RetailerWebhook] IDENTIFY | payment → OrderManagement updated by orderId (from) | from:', from)

          } else {
            messageBody = msg.text?.body || msg.image?.caption || msg.document?.caption || msg.video?.caption || msg.caption || ''
          }

          try {
            // STEP 5 complete: update WebhookMessage with extracted flow_token and route result (strict: only retailer_form_copy or delivery_address_copy)
            const storedFlowToken = flowToken || getFlowTokenFromResponseJson(body || {}) || (flowResponseData && getFlowTokenFromResponseJson(flowResponseData))
            const finalMessageBody = (currentMessageHasRetailerFormCopy && !messageBody) ? `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || from}` : messageBody
            const routeSummary = currentMessageHasRetailerFormCopy ? 'RETAILER' : (currentMessageHasDeliveryFormCopy ? 'ORDER' : 'SKIP')
            await WebhookMessage.updateOne(
              { _id: record._id },
              {
                $set: {
                  flowToken:       storedFlowToken,
                  messageBody:     finalMessageBody,
                  flowResponseData: flowResponseData || undefined,
                  retailer:        retailerFromFlow?._id || activeRetailer?._id || null,
                  retailerMatched: !!(retailerFromFlow || activeRetailer),
                },
              }
            )
            console.log('[RetailerWebhook] IDENTIFY | Step 5: WebhookMessage updated | id:', record._id?.toString(), '| flowToken:', storedFlowToken || '(none)', '| route:', routeSummary, '| from:', from)

            const populated = await WebhookMessage.findById(record._id)
              .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
              .lean()

            stored.push({
              id:              populated._id,
              from:            from || 'unknown',
              fromName,
              messageType:     msgType,
              messageBody:     populated.messageBody || messageBody,
              flowToken:       storedFlowToken || populated.flowToken || flowToken || null,
              flowResponseData: flowResponseData ?? populated.flowResponseData ?? null,
              timestamp,
              catalogId:       catalogId || null,
              displayPhone:    metadata?.display_phone_number || '',
              phoneNumberId:   metadata?.phone_number_id || '',
              retailerMatched: !!activeRetailer,
              retailer:        populated.retailer || null,
              savedAt:         populated.createdAt,
            })

            // NEW FLOW: Only response_json flow_token drives route (RETAILER | ORDER | SKIP).
            console.log('[RetailerWebhook] IDENTIFY | message end | from: +' + from + ' | msgType: ' + msgType + ' | route: ' + routeSummary + ' | webhookMsgId: ' + (record._id?.toString() || ''))
          } catch (saveErr) {
            console.error('[RetailerWebhook] Save error:', saveErr.message)
            errors.push({ from, error: saveErr.message })
          }
        }

        // ── Fallback: whenever response_json has flow_token retailer_form_copy — ALWAYS create retailer (no condition should block this) ──
        let bodyHasRetailerFormCopy = false
        try {
          bodyHasRetailerFormCopy = responseJsonStringHasRetailerFormCopy(body)
        } catch (_) {
          bodyHasRetailerFormCopy = verified.isRetailerFlow || (getFlowTokenFromResponseJson(body || {}) === FLOW_TOKEN_RETAILER)
        }
        if (!bodyHasRetailerFormCopy) {
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body || '')
          bodyHasRetailerFormCopy = /retailer_form_copy/i.test(bodyStr) && /flow_token/i.test(bodyStr)
        }
        if (bodyHasRetailerFormCopy && messages.length > 0) {
          let flowRaw = extractResponseJsonObject(body) || findFlowResponseInObject(body) || (() => {
            for (const m of messages) {
              const f = findFlowResponseInObject(m)
              if (f) return f
            }
            return null
          })()
          if (!flowRaw) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body || {})
            flowRaw = extractFlowDataFromBodyString(bodyStr)
          }
          if (!flowRaw && body && typeof body === 'object' && !body.entry) flowRaw = body
          const firstMsg = messages[0]
          let fallbackFrom = toDigits(firstMsg?.from || firstMsg?.sender_id || firstMsg?.senderId || firstMsg?.wa_id || '')
          const firstContact = contacts.find((c) => c?.wa_id) || contacts[0]
          const fallbackName = firstContact?.profile?.name || ''
          const flowData = flowRaw
            ? (typeof flowRaw === 'string' ? (() => { try { return JSON.parse(flowRaw || '{}') } catch (_) { return {} } })() : flowRaw)
            : {}
          if (!fallbackFrom) fallbackFrom = toDigits(getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone', 'contactNumber']))
          if (fallbackFrom) {
            try {
              const r = await upsertRetailerFromFlow({ fromNumber: fallbackFrom, fromName: fallbackName, flowData })
              console.log('[RetailerWebhook] Retailer onboarded (retailer_form_copy):', r?.retailerId, '| status:', r?.status)
              const msgIds = stored.filter((s) => (s.from && toDigits(s.from) === fallbackFrom)).map((s) => s.id)
              if (r && msgIds.length > 0) {
                await WebhookMessage.updateMany({ _id: { $in: msgIds } }, { $set: { retailer: r._id, retailerMatched: true } })
              }
            } catch (err) {
              console.error('[RetailerWebhook] Fallback upsertRetailerFromFlow failed:', err.message, err.stack)
            }
          } else {
            console.warn('[RetailerWebhook] retailer_form_copy in payload but no phone (from, contacts, or flow data) — cannot create retailer')
          }
        }

        // ── No messages in this change — store as catalog/notification event ──
        // This covers catalog updates, status changes, and Askeva test events
        if (messages.length === 0) {
          const firstContact = contacts[0]
          const from = firstContact ? toDigits(firstContact.wa_id) : ''
          const fromName = firstContact?.profile?.name || ''
          const catalogId =
            value?.catalog_id || value?.catalogId ||
            body?.catalog_id || body?.catalogId || null

          const activeRetailer = from ? await findActiveRetailer(from) : null

          try {
            const catalogPayloadToStore = (body && Object.keys(body).length > 0) ? body : (req.rawBody ? { _raw: String(req.rawBody).slice(0, 50000) } : {})
            const record = await WebhookMessage.create({
              companyId,
              messageId:       '',
              from:            from || 'catalog_event',
              fromName,
              messageType:     'catalog_notification',
              messageBody:     '',
              timestamp:       new Date(),
              retailer:        activeRetailer?._id || null,
              retailerMatched: !!activeRetailer,
              rawPayload:      catalogPayloadToStore,
            })

            const populated = await WebhookMessage.findById(record._id)
              .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
              .lean()

            stored.push({
              id:              populated._id,
              from:            from || 'catalog_event',
              fromName,
              messageType:     'catalog_notification',
              messageBody:     '',
              timestamp:       populated.timestamp,
              catalogId:       catalogId || null,
              displayPhone:    metadata?.display_phone_number || '',
              phoneNumberId:   metadata?.phone_number_id || '',
              retailerMatched: !!activeRetailer,
              retailer:        populated.retailer || null,
              savedAt:         populated.createdAt,
            })

            console.log(
              `[RetailerWebhook] Stored catalog event | from: ${from || 'catalog_event'} | catalogId: ${catalogId || 'none'}`
            )
          } catch (saveErr) {
            console.error('[RetailerWebhook] Catalog event save error:', saveErr.message)
            errors.push({ from: from || 'catalog_event', error: saveErr.message })
          }
        }
      }
    }

    if (stored.length) {
      console.log(`[RetailerWebhook] Stored ${stored.length} message(s)`)
    }
    if (errors.length) {
      console.warn('[RetailerWebhook] Errors:', errors)
    }
  } catch (err) {
    console.error('[RetailerWebhook] Fatal error:', err.message, err.stack)
  }
}

/**
 * GET /api/retailer-webhook/messages
 *
 * Fetch all stored webhook messages.
 * Query params:
 *   ?matched=true|false     — filter by retailer match
 *   ?catalogId=xxx          — filter by catalog ID in rawPayload
 *   ?from=919876543210      — filter by sender number
 *   ?retailerId=<objectId>  — filter by retailer
 *   ?page=1&limit=20
 */
exports.getRetailerWebhookMessages = async (req, res) => {
  try {
    const companyId = req.query.companyId || COMPANY_ID
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20)
    const skip  = (page - 1) * limit

    const filter = { companyId }

    if (req.query.matched === 'true')  filter.retailerMatched = true
    if (req.query.matched === 'false') filter.retailerMatched = false
    if (req.query.from)        filter.from = req.query.from
    if (req.query.retailerId)  filter.retailer = req.query.retailerId

    // catalogId filter — search inside rawPayload
    if (req.query.catalogId) {
      filter.$or = [
        { 'rawPayload.catalog_id':                       req.query.catalogId },
        { 'rawPayload.catalogId':                        req.query.catalogId },
        { 'rawPayload.entry.changes.value.catalog_id':   req.query.catalogId },
      ]
    }

    const [messages, total, unread] = await Promise.all([
      WebhookMessage.find(filter)
        .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookMessage.countDocuments(filter),
      WebhookMessage.countDocuments({ companyId, isRead: false }),
    ])

    return res.json({
      success: true,
      data: {
        messages,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        unread,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch messages' })
  }
}

/**
 * GET /api/retailer-webhook/messages/:id
 * Single message detail — auto-marks as read.
 */
exports.getRetailerWebhookMessageById = async (req, res) => {
  try {
    const msg = await WebhookMessage.findById(req.params.id)
      .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status approvedAt')
      .lean()

    if (!msg) {
      return res.status(404).json({ success: false, message: 'Message not found' })
    }

    await WebhookMessage.updateOne({ _id: req.params.id }, { isRead: true })

    return res.json({ success: true, data: { message: { ...msg, isRead: true } } })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch message' })
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────
async function findActiveRetailer(from) {
  const incoming = toDigits(from)
  if (!incoming) return null
  const number10 = incoming.slice(-10)
  return Retailer.findOne(
    { status: 'active', $or: [{ whatsappNumber: incoming }, { whatsappNumber: number10 }] },
    'retailerId businessName storeName contactPerson email whatsappCountryCode whatsappNumber city state status'
  ).lean()
}

/**
 * POST /api/retailer-webhook/test-retailer
 * Test endpoint: POST a raw webhook body (same format as Meta) with response_json containing
 * "flow_token":"retailer_form_copy" → creates retailer in retailers collection.
 * Use to verify workflow when response_json has flow_token retailer_form_copy.
 * Protected: admin/superadmin only.
 */
exports.testRetailerWebhook = async (req, res) => {
  try {
    let body = req.body && typeof req.body === 'object' ? req.body : {}
    if (typeof body.rawPayload === 'object') body = body.rawPayload
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch (_) { return res.status(400).json({ success: false, message: 'Invalid JSON body' }) }
    }
    if (!responseJsonStringHasRetailerFormCopy(body)) {
      return res.status(400).json({
        success: false,
        message: 'Body does not contain response_json with flow_token retailer_form_copy',
        hint: 'Expected: entry[].changes[].value.messages[].interactive.nfm_reply.response_json with "flow_token":"retailer_form_copy"',
      })
    }
    const flowRaw = extractResponseJsonObject(body) || findFlowResponseInObject(body) || (() => {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body || {})
      return extractFlowDataFromBodyString(bodyStr)
    })()
    const flowData = flowRaw ? (typeof flowRaw === 'string' ? (() => { try { return JSON.parse(flowRaw || '{}') } catch (_) { return {} } })() : flowRaw) : {}
    const messages = (body?.entry?.[0]?.changes?.[0]?.value?.messages || body?.entry?.[0]?.changes?.[0]?.value?.message) || []
    const firstMsg = Array.isArray(messages) ? messages[0] : messages
    const contacts = body?.entry?.[0]?.changes?.[0]?.value?.contacts || []
    const firstContact = contacts.find((c) => c?.wa_id) || contacts[0]
    let from = toDigits(firstMsg?.from || firstMsg?.sender_id || firstMsg?.wa_id || '')
    if (!from) from = toDigits(getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone', 'contactNumber']))
    const fromName = firstContact?.profile?.name || getFlowValue(flowData, ['Name', 'Contact Person']) || ''
    if (!from) {
      return res.status(400).json({ success: false, message: 'Could not extract phone (from or Mobile Number) from payload' })
    }
    const companyId = req.params.companyId || COMPANY_ID
    const retailer = await upsertRetailerFromFlow({ fromNumber: from, fromName, flowData })
    const webhookMessageId = req.body?.webhookMessageId || req.query?.webhookMessageId
    if (webhookMessageId && retailer) {
      await WebhookMessage.updateOne(
        { _id: webhookMessageId },
        { $set: { retailer: retailer._id, retailerMatched: true, flowToken: FLOW_TOKEN_RETAILER, messageBody: `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || from}` } }
      )
    }
    return res.status(200).json({
      success: true,
      message: 'Retailer created/updated from webhook test',
      data: { retailerId: retailer?.retailerId, status: retailer?.status, _id: retailer?._id },
    })
  } catch (err) {
    console.error('[RetailerWebhook] testRetailerWebhook error:', err.message, err.stack)
    return res.status(500).json({ success: false, message: err.message || 'Test failed' })
  }
}