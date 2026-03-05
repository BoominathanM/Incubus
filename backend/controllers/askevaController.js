const AskevaConfig = require('../models/AskevaConfig.model')
const AskevaTemplate = require('../models/AskevaTemplate.model')
const EventTemplateMapping = require('../models/EventTemplateMapping.model')
const WebhookMessage = require('../models/WebhookMessage.model')
const AskevaCatalog = require('../models/AskevaCatalog.model')
const Product = require('../models/Product.model')
const Retailer = require('../models/Retailer')
const askevaService = require('../services/askeva.service')
const productSyncService = require('../services/productSync.service')
const { encrypt, decrypt } = require('../utils/encryption.util')
const { generateRetailerId } = require('../utils/retailerId')
const { responseJsonHasRetailerFormCopy, getFlowTokenFromResponseJson, verifyWebhookFlowFromRaw, FLOW_TOKEN_RETAILER, FLOW_TOKEN_DELIVERY } = require('../services/retailerFromFlow')

/** Normalize a phone number to digits only (strip + and spaces). */
function normalizePhone(countryCode, number) {
  const cc = (countryCode || '').replace(/\D/g, '')
  const num = (number || '').replace(/\D/g, '')
  return cc + num
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Extract flow_token from flowData — checks all keys case-insensitively */
function extractFlowToken(flowData) {
  if (!flowData || typeof flowData !== 'object') return ''
  const targetKey = 'flowtoken'
  for (const k of Object.keys(flowData)) {
    if (normalizeKey(k) === targetKey) {
      const v = flowData[k]
      return String(v != null ? v : '').trim().toLowerCase()
    }
  }
  return ''
}

/** Recursively search object for flow_token (any nesting, e.g. at end of JSON) */
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

/** Parse response_json and extract flow_token — supports nested, anywhere in JSON, or raw string match */
function parseFlowTokenFromResponseJson(rawJson) {
  if (!rawJson) return ''
  const rawStr = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson || {})
  if (/retailer_form_copy/i.test(rawStr)) return 'retailer_form_copy'
  if (/delivery_address_copy/i.test(rawStr)) return 'delivery_address_copy'
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
  for (const k of Object.keys(obj)) {
    const lower = k.toLowerCase()
    if ((lower === 'response_json' || lower === 'responsejson' || lower === 'response') && obj[k]) return obj[k]
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
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === 'object' && v !== null) {
      const found = findFlowResponseInObject(v, depth + 1)
      if (found) return found
    }
  }
  return null
}
/** Extract flow JSON from raw body string when retailer_form_copy is present */
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

/** Pre-scan: true ONLY when response_json flow_token is retailer_form_copy. Single source of truth. */
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

  // Strong signal: "Business Name (GST)" + "Store Name" = retailer onboarding
  if (businessName && storeName) return true
  if (storeName && (gst || pan)) return true
  if (businessName && gst && pan && (street1 || city)) return true

  // Fallback: 4+ onboarding-like fields present
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
  // Prefer form's Mobile Number for retailer identity when present (business contact)
  const formMobile = (getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']) || '').replace(/\D/g, '')
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
    if (['active', 'approved', 'disabled'].includes(existingByWhatsApp.status)) {
      return existingByWhatsApp
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
 * Find an active retailer whose WhatsApp number matches the webhook sender.
 * fromNumber is the raw wa_id from the webhook (digits only, e.g. "919876543210").
 */
async function findActiveRetailerByPhone(fromNumber) {
  const digits = (fromNumber || '').replace(/\D/g, '')
  if (!digits) return null
  // Load all active retailers and compare normalized numbers
  const retailers = await Retailer.find(
    { status: 'active' },
    'businessName storeName contactPerson whatsappCountryCode whatsappNumber'
  ).lean()
  return retailers.find((r) => {
    const full = normalizePhone(r.whatsappCountryCode, r.whatsappNumber)
    return full === digits || r.whatsappNumber.replace(/\D/g, '') === digits
  }) || null
}

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

function getCompanyId(req) {
  return req.user?.companyId ?? COMPANY_ID
}

function normalizeUrl(url) {
  if (!url) return 'https://backend.askeva.io'
  try {
    const u = new URL(String(url).trim())
    return `${u.protocol}//${u.host}`
  } catch {
    const m = String(url).trim().match(/^(https?:\/\/[^/]+)/)
    return m ? m[1] : 'https://backend.askeva.io'
  }
}

exports.getConfig = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
      .select('-apiKey -webhookSecret')
      .lean()

    // Fallback: search for any existing config if specific one not found
    if (!config) {
      config = await AskevaConfig.findOne().select('-apiKey -webhookSecret').lean()
    }

    if (!config) {
      return res.json({ success: true, data: { config: null } })
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    const webhookUrl =
      config.webhookUrl || askevaService.generateWebhookUrl(companyId, baseUrl)

    res.json({
      success: true,
      data: {
        config: {
          ...config,
          webhookUrl,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch configuration' },
    })
  }
}

exports.getCredentials = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const config = await AskevaConfig.findOne({ companyId })
      .select('+apiKey')
      .lean()

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { message: 'Configuration not found' },
      })
    }

    const decryptedApiKey = config.apiKey ? decrypt(config.apiKey) : ''

    res.json({
      success: true,
      data: {
        companyId: config.companyId,
        apiKey: decryptedApiKey,
        backendUrl: config.backendUrl || 'https://backend.askeva.io',
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch credentials' },
    })
  }
}

exports.saveConfig = async (req, res) => {
  try {
    const { backendUrl, apiKey, companyId: bodyCompanyId } = req.body
    const companyId = bodyCompanyId || getCompanyId(req)

    if (!apiKey || !backendUrl) {
      return res.status(400).json({
        success: false,
        error: { message: 'Backend URL and API Key are required' },
      })
    }

    const normalizedBackendUrl = normalizeUrl(backendUrl)
    const encryptedApiKey = encrypt(apiKey.trim())

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    const webhookUrl = askevaService.generateWebhookUrl(companyId, baseUrl)

    // Flexible lookup: 
    // 1. Try bodyCompanyId
    // 2. Try 'default' if bodyCompanyId is different
    // 3. Try any existing config
    let existingConfig = await AskevaConfig.findOne({ companyId }).select('+apiKey +webhookSecret')
    if (!existingConfig && companyId !== 'default') {
      existingConfig = await AskevaConfig.findOne({ companyId: 'default' }).select('+apiKey +webhookSecret')
    }
    if (!existingConfig) {
      existingConfig = await AskevaConfig.findOne().select('+apiKey +webhookSecret')
    }

    const updateData = {
      companyId,
      providerName: 'AskEVA',
      backendUrl: normalizedBackendUrl,
      webhookUrl,
      isEnabled: true,
      updatedBy: req.user?.id,
    }

    if (apiKey && apiKey.trim()) {
      updateData.apiKey = encryptedApiKey
    } else if (existingConfig) {
      updateData.apiKey = existingConfig.apiKey
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'API Key is required for new configuration' },
      })
    }

    if (existingConfig?.webhookSecret) {
      updateData.webhookSecret = existingConfig.webhookSecret
    }
    if (!existingConfig && req.user?.id) {
      updateData.createdBy = req.user.id
    }

    const filter = existingConfig ? { _id: existingConfig._id } : { companyId }
    const config = await AskevaConfig.findOneAndUpdate(
      filter,
      updateData,
      { upsert: true, new: true, runValidators: true }
    )

    res.json({
      success: true,
      data: {
        config: {
          id: config._id,
          companyId: config.companyId,
          providerName: config.providerName,
          backendUrl: config.backendUrl,
          webhookUrl: config.webhookUrl,
          isEnabled: config.isEnabled,
          isConnected: config.isConnected,
          lastVerifiedAt: config.lastVerifiedAt,
          lastSyncedAt: config.lastSyncedAt,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to save configuration' },
    })
  }
}

exports.testConnection = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    const { apiKey, backendUrl } = req.body

    let config = await AskevaConfig.findOne({ companyId })
      .select('+apiKey')
      .lean()

    // Fallback search
    if (!config) {
      config = await AskevaConfig.findOne().select('+apiKey').lean()
    }

    const testConfig = {
      apiKey: apiKey || (config?.apiKey ? decrypt(config.apiKey) : ''),
      backendUrl: normalizeUrl(backendUrl || config?.backendUrl || 'https://backend.askeva.io'),
    }

    if (!testConfig.apiKey) {
      return res.status(400).json({
        success: false,
        error: { message: 'API Key is required' },
      })
    }

    const result = await askevaService.testConnection(companyId, testConfig)

    const updateFilter = config ? { _id: config._id } : { companyId }
    await AskevaConfig.updateOne(
      updateFilter,
      {
        isConnected: result.success,
        lastVerifiedAt: new Date(),
        connectionError: result.error || null,
      }
    )

    if (result.success) {
      // Trigger product sync in background after successful connection
      const syncCompanyId = config ? config.companyId : companyId
      productSyncService.syncProducts(syncCompanyId).catch((e) =>
        console.error('[Sync] Post-connection product sync failed:', e.message)
      )
      res.json({ success: true, message: 'Connection successful' })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Connection failed' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to test connection' },
    })
  }
}

exports.disconnect = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const config = await AskevaConfig.findOne({ companyId })
    const cid = config ? config.companyId : companyId

    await AskevaConfig.deleteMany({}) // Remove all as we support only one active integration usually
    await AskevaTemplate.deleteMany({}) // Remove all templates
    await EventTemplateMapping.deleteMany({}) // Remove all event mappings

    // Also remove all products on disconnect
    const Product = require('../models/Product.model')
    await Product.deleteMany({})

    res.json({ success: true, message: 'ASKEVA disconnected successfully. All templates, products and event mappings have been cleared.' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to disconnect' },
    })
  }
}

exports.syncTemplates = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
    if (!config) {
      config = await AskevaConfig.findOne()
      if (config) companyId = config.companyId
    }
    const result = await askevaService.syncTemplates(companyId)

    if (result.success) {
      res.json({
        success: true,
        data: {
          synced: result.synced,
          message: result.message || `Successfully synced ${result.synced} templates`,
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to sync templates' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to sync templates' },
    })
  }
}

exports.syncProducts = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    let config = await AskevaConfig.findOne({ companyId })
    if (!config) {
      config = await AskevaConfig.findOne()
      if (config) companyId = config.companyId
    }
    const result = await productSyncService.syncProducts(companyId)

    if (result.success) {
      res.json({
        success: true,
        data: {
          catalogCount: result.catalogCount,
          productCount: result.productCount,
          message: `Synced ${result.catalogCount} catalog(s) and ${result.productCount} product(s)`,
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to sync products' },
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to sync products' },
    })
  }
}

exports.getTemplates = async (req, res) => {
  try {
    let companyId = getCompanyId(req)
    // Keep template listing aligned with sync behavior when auth/user company is unavailable.
    if (!req.user?.companyId) {
      const config = await AskevaConfig.findOne({ companyId }).select('companyId').lean()
      if (!config) {
        const fallbackConfig = await AskevaConfig.findOne().select('companyId').lean()
        if (fallbackConfig?.companyId) companyId = fallbackConfig.companyId
      }
    }
    const requestedLimit = parseInt(req.query.limit, 10)
    const isGetAll = requestedLimit >= 1000
    const page = isGetAll ? 1 : Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = isGetAll ? 10000 : Math.max(1, Math.min(100, requestedLimit || 10))
    const skip = isGetAll ? 0 : (page - 1) * limit
    const status = req.query.status
    const category = req.query.category
    const search = req.query.search

    const query = { companyId }
    if (status) query.status = status.toUpperCase()
    if (category) query.category = category.toUpperCase()
    if (search) {
      query.$or = [
        { templateName: { $regex: search, $options: 'i' } },
        { templateId: { $regex: search, $options: 'i' } },
      ]
    }

    const [templates, total] = await Promise.all([
      AskevaTemplate.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AskevaTemplate.countDocuments(query),
    ])

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch templates' },
    })
  }
}

exports.mapTemplateToEvents = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { templateId, eventTypes } = req.body
    if (!companyId || !templateId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Template ID is required' },
      })
    }
    await AskevaTemplate.updateOne(
      { companyId, templateId },
      { mappedEventTypes: eventTypes || [] }
    )
    res.json({ success: true, message: 'Template mapping updated successfully' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to update template mapping' },
    })
  }
}

exports.getEventTemplateMappings = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const mappings = await EventTemplateMapping.find({ companyId })
      .populate('templateId', 'templateName templateId language status')
      .sort({ createdAt: -1 })
      .lean()
    res.json({ success: true, data: { mappings } })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch event template mappings' },
    })
  }
}

exports.getEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { id } = req.params
    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Mapping ID is required' },
      })
    }
    const mapping = await EventTemplateMapping.findOne({ _id: id, companyId })
      .populate('templateId', 'templateName templateId language status components')
      .lean()
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event template mapping not found' },
      })
    }
    res.json({ success: true, data: { mapping } })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to fetch event template mapping' },
    })
  }
}

exports.saveEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const userId = req.user?.id
    const id = req.params.id || req.body.id
    const { hrmsEventType, templateId, templateName, isEnabled, variables } = req.body

    if (!companyId || !hrmsEventType || !templateId || !variables || !Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Event type, template ID, and variables are required' },
      })
    }

    for (const v of variables) {
      if (!v.templateVariable || !v.hrmsField) {
        return res.status(400).json({
          success: false,
          error: { message: 'Each variable must have templateVariable and hrmsField' },
        })
      }
    }

    const template = await AskevaTemplate.findOne({
      companyId,
      _id: templateId,
    }).lean()

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { message: 'Template not found' },
      })
    }

    const mappingData = {
      companyId,
      hrmsEventType,
      templateId,
      templateName: templateName || template.templateName,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      variables,
      updatedBy: userId,
    }

    let mapping
    if (id) {
      mapping = await EventTemplateMapping.findOneAndUpdate(
        { _id: id, companyId },
        mappingData,
        { new: true, runValidators: true }
      )
        .populate('templateId', 'templateName templateId language status')
        .lean()

      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: { message: 'Event template mapping not found' },
        })
      }
    } else {
      mapping = await EventTemplateMapping.findOneAndUpdate(
        { companyId, hrmsEventType },
        { $set: mappingData, $setOnInsert: { createdBy: userId } },
        { new: true, upsert: true, runValidators: true }
      )
        .populate('templateId', 'templateName templateId language status')
        .lean()
    }

    res.json({
      success: true,
      data: { mapping },
      message: id ? 'Event template mapping updated successfully' : 'Event template mapping saved successfully',
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to save event template mapping' },
    })
  }
}

exports.deleteEventTemplateMapping = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { id } = req.params
    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Mapping ID is required' },
      })
    }
    const mapping = await EventTemplateMapping.findOneAndDelete({ _id: id, companyId })
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event template mapping not found' },
      })
    }
    res.json({ success: true, message: 'Event template mapping deleted successfully' })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to delete event template mapping' },
    })
  }
}

exports.sendMessage = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const userId = req.user?.id
    const {
      to,
      templateName,
      language,
      parameters,
      module,
      candidateId,
      documentUrl,
      documentExpiry,
      recipientEmail,
    } = req.body

    if (!companyId || !to || !templateName) {
      return res.status(400).json({
        success: false,
        error: { message: 'Recipient phone number and template name are required' },
      })
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { message: 'User ID is required' },
      })
    }

    const result = await askevaService.sendMessage({
      companyId,
      triggeredBy: userId.toString(),
      module: module || 'other',
      candidateId: candidateId ? candidateId.toString() : undefined,
      payload: { to, templateName, language, parameters: parameters || {} },
      documentUrl,
      documentExpiry: documentExpiry ? new Date(documentExpiry) : undefined,
    })

    if (result.success) {
      res.json({
        success: true,
        data: {
          messageId: result.messageId,
          message: 'WhatsApp message sent successfully',
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: { message: result.error || 'Failed to send message' },
        ...(recipientEmail && { fallbackUsed: true }),
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to send message' },
    })
  }
}

/**
 * GET /api/askeva/webhook/:companyId
 * Webhook verification — Meta/WhatsApp and some providers send GET with hub.mode, hub.verify_token, hub.challenge.
 * Must return hub.challenge to complete verification.
 */
exports.handleWebhookVerification = async (req, res) => {
  console.log("oiiii4343")
  try {
    const { hub_mode, hub_verify_token, hub_challenge } = req.query
    const mode = hub_mode || req.query['hub.mode']
    const token = hub_verify_token || req.query['hub.verify_token']
    const challenge = hub_challenge || req.query['hub.challenge']

    if (mode === 'subscribe' && challenge) {
      const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'askeva_webhook_verify'
      if (!token || token === verifyToken) {
        console.log('[Webhook] Verification successful')
        return res.type('text/plain').status(200).send(String(challenge))
      }
    }
    console.warn('[Webhook] Verification failed — mode:', mode, 'token present:', !!token)
    return res.status(403).send('Verification failed')
  } catch (err) {
    console.error('[Webhook] Verification error:', err)
    return res.status(500).send('Verification error')
  }
}

exports.handleWebhook = async (req, res) => {
  try {
    const rawCompanyId = req.params.companyId || ''
    const companyId = (rawCompanyId && !rawCompanyId.startsWith(':'))
      ? rawCompanyId
      : (process.env.ASKEVA_COMPANY_ID || 'default')

    let body = req.body && typeof req.body === 'object' ? req.body : {}
    if (Object.keys(body || {}).length === 0 && req.rawBody && typeof req.rawBody === 'string' && req.rawBody.trim()) {
      try { body = JSON.parse(req.rawBody) } catch (_) {
        try { const qs = require('querystring'); const p = qs.parse(req.rawBody); body = (p.payload && typeof p.payload === 'string') ? JSON.parse(p.payload) : p } catch (_) {}
      }
    }
    console.log('[Webhook] POST received for company:', companyId, '| body keys:', Object.keys(body || {}))

    // Optional signature verification — only if webhookSecret is stored
    const config = await AskevaConfig.findOne({ companyId }).select('+webhookSecret').lean()
    if (config?.webhookSecret) {
      const signature = req.headers['x-hub-signature-256']
      const payload = req.rawBody && typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(body)
      const secret = decrypt(config.webhookSecret)
      const isValid = askevaService.verifyWebhookSignature(payload, signature || '', secret)
      if (!isValid) {
        return res.status(401).json({ success: false, error: { message: 'Invalid webhook signature' } })
      }
    }

    // Acknowledge immediately — WhatsApp requires fast response
    res.status(200).json({ success: true })

    // Process asynchronously
    processWebhookPayload(companyId, body).catch((e) =>
      console.error('[Webhook] Processing error:', e.message)
    )
  } catch (err) {
    console.error('[Webhook] Error:', err)
    res.status(500).json({ success: false, error: { message: 'Webhook processing failed' } })
  }
}

async function processWebhookPayload(companyId, body) {
  const { handleWebhookOrderEvent } = require('./orderController')

  // Support both direct Meta payload and wrapped payloads
  const entries = body?.entry || body?.data?.entry || (body?.messages ? [{ changes: [{ value: body }] }] : [])
  if (entries.length === 0 && Object.keys(body || {}).length > 0) {
    console.log('[Webhook] No entry in payload — raw body sample:', JSON.stringify(body).slice(0, 500))
  }

  for (const entry of entries) {
    const changes = entry.changes || (entry.value ? [entry] : [])
    for (const change of changes) {
      const value = change.value || change
      const contacts = value.contacts || []
      let messages = value.messages || value.message || (Array.isArray(value) ? value : [])
      if (!Array.isArray(messages)) messages = messages && typeof messages === 'object' ? [messages] : []
      // Verify from raw JSON: response_json flow_token → retailer_form_copy (retailer only) or delivery_address_copy (order only)
      const verified = verifyWebhookFlowFromRaw(body || {})
      const isRetailerFormPayload = verified.isRetailerFlow || payloadContainsRetailerFormCopy(messages, body)
      if (verified.isRetailerFlow) console.log('[Webhook] Verified from raw: flow_token=retailer_form_copy → Retailer only, NO order')
      if (verified.isOrderFlow) console.log('[Webhook] Verified from raw: flow_token=delivery_address_copy → Order flow only')

      for (const msg of messages) {
        try {
          const fromNumber = (msg.from || msg.sender_id || msg.senderId || msg.wa_id || contacts[0]?.wa_id || '').replace(/\D/g, '')
          if (!fromNumber) continue

          const contact = contacts.find((c) => (c.wa_id || '').replace(/\D/g, '') === fromNumber)
        const fromName = contact?.profile?.name || ''
        const msgType = msg.type || 'text'
        const ts = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date()
        const retailer = await findActiveRetailerByPhone(fromNumber)

        // ── Parse content per message type ───────────────────────────────────
        let messageBody = ''
        let orderItems = []
        let catalogId = ''
        let extraFields = {}
        let shouldCreateOrder = false
        let flowToken = ''
        let flowResponseData = null

        if (msgType === 'order' && msg.order) {
          // WhatsApp catalog order — skip if payload has retailer_form_copy (onboarding flow)
          if (isRetailerFormPayload) {
            shouldCreateOrder = false
          } else {
            catalogId = msg.order.catalog_id || ''
            orderItems = (msg.order.product_items || []).map((pi) => ({
              productRetailerId: pi.product_retailer_id || '',
              quantity: Number(pi.quantity) || 1,
            }))
            messageBody = orderItems.map((i) => `${i.productRetailerId} x${i.quantity}`).join(', ')
              || `Catalog order: ${catalogId}`
            shouldCreateOrder = orderItems.length > 0
          }

        } else if ((msgType === 'interactive' && (msg.interactive?.type === 'nfm_reply' || msg.interactive?.nfm_reply || msg.interactive?.nfmReply)) || (isRetailerFormPayload && findFlowResponseInObject(msg))) {
          const nfmReply = msg.interactive?.nfm_reply || msg.interactive?.nfmReply || msg.interactive?.data?.nfm_reply || {}
          let rawJson = nfmReply?.response_json || nfmReply?.responseJson || nfmReply?.response || ''
          if (!rawJson) {
            const found = findFlowResponseInObject(msg)
            if (found) rawJson = typeof found === 'string' ? found : JSON.stringify(found)
          }
          let flowData = {}
          try {
            flowData = typeof rawJson === 'string' ? JSON.parse(rawJson || '{}') : (rawJson || {})
            flowResponseData = flowData
          } catch (_) {
            flowData = {}
            flowResponseData = { _raw: String(rawJson || '').slice(0, 1000) }
          }
          // Only two flow_token values: retailer_form_copy → Retailer; delivery_address_copy → order
          flowToken = getFlowTokenFromResponseJson(flowData) || getFlowTokenFromResponseJson(rawJson) || ''
          const isRetailerToken = flowToken === FLOW_TOKEN_RETAILER
          const isDeliveryToken = flowToken === FLOW_TOKEN_DELIVERY
          console.log('[Webhook] interactive nfm_reply | flow_token:', flowToken || '(empty)', '| from:', fromNumber)

          if (isRetailerToken) {
            try {
              const retailer = await upsertRetailerFromFlow({ fromNumber, fromName, flowData })
              console.log('[Webhook] Retailer created (retailer_form_copy):', retailer?.retailerId, '| status:', retailer?.status)
            } catch (err) {
              console.error('[Webhook] upsertRetailerFromFlow failed:', err.message)
            }
            messageBody = `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || fromNumber}`
            shouldCreateOrder = false
          } else if (isDeliveryToken) {
            extraFields = {
              contactName:   getFlowValue(flowData, ['Name', 'Contact Name', 'contactName', 'full_name', 'name']) || fromName || '',
              contactNumber: getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']) || fromNumber || '',
              deliveryAddress: getFlowValue(flowData, ['Delivery Address', 'Address', 'delivery_address', 'shipping_address', 'address']) || '',
            }
            messageBody = `Delivery form (${flowToken}) from ${fromName || fromNumber}`
            shouldCreateOrder = true
          } else {
            messageBody = `Flow submission from ${fromName || fromNumber}`
            shouldCreateOrder = false
          }

        } else if (msgType === 'payment' && msg.payment) {
          const pay = msg.payment
          extraFields = {
            paymentStatus:  pay.status === 'captured' ? 'Success' : 'Pending',
            transactionId:  pay.transaction_id || pay.reference_id || '',
            paymentMode:    'WhatsApp Pay',
          }
          messageBody = `Payment ${pay.status || ''} - txn: ${pay.transaction_id || pay.reference_id || ''}`
          shouldCreateOrder = !isRetailerFormPayload

        } else {
          messageBody = msg.text?.body || msg.caption || msg.image?.caption || msg.document?.caption || ''
        }

        // ── Store in WebhookMessage ───────────────────────────────────────────
        const storedFlowToken = flowToken || getFlowTokenFromResponseJson(body || {})
        const savedMsg = await WebhookMessage.create({
          companyId,
          messageId:        msg.id || '',
          from:             fromNumber,
          fromName,
          messageType:      msgType,
          messageBody:      (isRetailerFormPayload && !messageBody) ? `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || fromNumber}` : messageBody,
          flowToken:        storedFlowToken,
          flowResponseData: flowResponseData || undefined,
          timestamp:        ts,
          retailer:         retailer?._id || null,
          retailerMatched:  !!retailer,
          rawPayload:       body,
        })

        console.log(`[Webhook] from: ${fromNumber} | type: ${msgType} | retailer: ${retailer?.businessName || 'none'} | shouldCreateOrder: ${shouldCreateOrder}`)

        // FINAL: Verify from raw — retailer_form_copy → retailer only; NEVER create order
        const verifiedFinal = verifyWebhookFlowFromRaw(body || {})
        const isRetailerFormPayloadFinal = verifiedFinal.isRetailerFlow || getFlowTokenFromResponseJson(body || {}) === FLOW_TOKEN_RETAILER || (() => {
          try {
            const { responseJsonStringHasRetailerFormCopy } = require('../services/retailerFromFlow')
            return responseJsonStringHasRetailerFormCopy(body || {})
          } catch (_) { return false }
        })()
        if (verifiedFinal.isRetailerFlow) shouldCreateOrder = false
        if (isRetailerFormPayloadFinal) shouldCreateOrder = false
        // STRICT: Only create/update order when response_json has delivery_address_copy (flow) OR catalog order OR payment — NEVER for retailer_form_copy
        const thisMessageAllowedForOrder = (msgType === 'order' && orderItems.length > 0) || (msgType === 'interactive' && flowToken === FLOW_TOKEN_DELIVERY) || msgType === 'payment'
        if (shouldCreateOrder && !isRetailerFormPayloadFinal && flowToken !== FLOW_TOKEN_RETAILER && !verifiedFinal.isRetailerFlow && thisMessageAllowedForOrder) {
          handleWebhookOrderEvent({
            msgType,
            companyId,
            webhookMessageId: savedMsg._id,
            flowToken: flowToken || '',
            from:             fromNumber,
            fromName,
            retailerMatched:  !!retailer,
            retailer:         retailer || null,
            items:            orderItems,
            catalogId,
            messageBody,
            extraFields,
            rawPayload:       body,
          })
            .then((order) => {
              if (order) console.log(`[Webhook] Order ${order.orderId || order._id} created/updated for ${fromNumber}`)
            })
            .catch((e) => console.error('[Webhook] Order creation/update failed:', e.message, e.stack))
        }
        } catch (msgErr) {
          console.error('[Webhook] Message processing error:', msgErr.message)
        }
      }

      // Fallback: only when verified from raw flow_token is retailer_form_copy — create retailer
      if (verified.isRetailerFlow && messages.length > 0) {
        let flowRaw = findFlowResponseInObject(body) || (() => { for (const m of messages) { const f = findFlowResponseInObject(m); if (f) return f } return null })()
        if (!flowRaw) {
          const extracted = extractFlowDataFromBodyString(JSON.stringify(body || {}))
          if (extracted) flowRaw = extracted
        }
        const firstMsg = messages[0]
        let fallbackFrom = (firstMsg?.from || firstMsg?.sender_id || firstMsg?.wa_id || '').replace(/\D/g, '')
        const firstContact = contacts.find((c) => c?.wa_id) || contacts[0]
        const fallbackName = firstContact?.profile?.name || ''
        const flowData = flowRaw ? (typeof flowRaw === 'string' ? (() => { try { return JSON.parse(flowRaw || '{}') } catch (_) { return {} } })() : flowRaw) : {}
        if (!fallbackFrom) fallbackFrom = (getFlowValue(flowData, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone', 'contactNumber']) || '').replace(/\D/g, '')
        if (fallbackFrom) {
          try {
            const r = await upsertRetailerFromFlow({ fromNumber: fallbackFrom, fromName: fallbackName, flowData })
            console.log('[Webhook] Retailer onboarded (retailer_form_copy):', r?.retailerId, '| status:', r?.status)
          } catch (err) {
            console.error('[Webhook] Fallback upsertRetailerFromFlow failed:', err.message, err.stack)
          }
        } else {
          console.warn('[Webhook] retailer_form_copy in payload but no phone (from or flow data) — cannot create retailer')
        }
      }

      if (value.statuses?.length) {
        console.log(`[Webhook] ${value.statuses.length} status update(s) received`)
      }
    }
  }

  // ── Fallback: body is a flat response_json object (no Meta entry wrapper) ──
  // Handles the case where the entire HTTP body IS the form data, e.g.:
  // { "Business Name (GST)": "...", ..., "flow_token": "retailer_form_copy" }
  if (!entries.length) {
    const directFlowToken = getFlowTokenFromResponseJson(body)
    if (directFlowToken === FLOW_TOKEN_RETAILER) {
      const fromNumber = (getFlowValue(body, ['Mobile Number', 'Phone', 'phone_number', 'mobile', 'Mob', 'phone']) || '').replace(/\D/g, '')
      const fromName = getFlowValue(body, ['Name', 'Contact Person', 'contactPerson']) || ''
      if (fromNumber) {
        try {
          const retailer = await upsertRetailerFromFlow({ fromNumber, fromName, flowData: body })
          console.log('[Webhook] Retailer onboarded (flat retailer_form_copy):', retailer?.retailerId, '| status:', retailer?.status)
          await WebhookMessage.create({
            companyId,
            messageId: '',
            from: fromNumber,
            fromName,
            messageType: 'interactive',
            messageBody: `Retailer onboarding (${FLOW_TOKEN_RETAILER}) from ${fromName || fromNumber}`,
            flowToken: FLOW_TOKEN_RETAILER,
            flowResponseData: body,
            timestamp: new Date(),
            retailer: retailer?._id || null,
            retailerMatched: true,
            rawPayload: body,
          }).catch((e) => {
            if (e?.code !== 11000) console.error('[Webhook] WebhookMessage.create (flat payload) error:', e.message)
          })
        } catch (err) {
          console.error('[Webhook] upsertRetailerFromFlow (flat payload) failed:', err.message, err.stack)
        }
      } else {
        console.warn('[Webhook] retailer_form_copy flat payload but no phone — cannot create retailer')
      }
    }
  }
}

function parseFlowItems(flowData) {
  const raw = flowData.items || flowData.products || flowData.order_items || flowData.product || ''
  const items = []
  for (const part of String(raw).split(',')) {
    const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
    if (match) items.push({ productRetailerId: match[1].trim(), quantity: parseInt(match[2], 10) })
  }
  return items
}

exports.getWebhookMessages = async (req, res) => {
  try {
    // Support companyId from query; superadmin can pass companyId=all to see all companies
    const queryCompanyId = req.query.companyId
    let companyId = queryCompanyId || getCompanyId(req)
    const isSuperAdmin = req.user?.role === 'superadmin'
    const userHasNoCompany = !req.user?.companyId

    // Fallback: when no companyId in query and user has none, use any config's companyId
    if (!queryCompanyId && (isSuperAdmin || userHasNoCompany)) {
      const anyConfig = await AskevaConfig.findOne().select('companyId').lean()
      if (anyConfig?.companyId) companyId = anyConfig.companyId
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
    const skip = (page - 1) * limit
    const { retailerMatched, isRead } = req.query

    const query = {}
    if (companyId && companyId !== 'all') query.companyId = companyId
    if (retailerMatched === 'true') query.retailerMatched = true
    if (retailerMatched === 'false') query.retailerMatched = false
    if (isRead === 'true') query.isRead = true
    if (isRead === 'false') query.isRead = false

    const [messages, total, unreadCount] = await Promise.all([
      WebhookMessage.find(query)
        .populate('retailer', 'retailerId businessName storeName contactPerson whatsappNumber whatsappCountryCode status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookMessage.countDocuments(query),
      WebhookMessage.countDocuments(
        companyId && companyId !== 'all' ? { companyId, isRead: false } : { isRead: false }
      ),
    ])

    res.json({
      success: true,
      data: {
        messages,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        unreadCount,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to fetch webhook messages' } })
  }
}

exports.getWebhookMessageById = async (req, res) => {
  try {
    const companyId = req.query.companyId === 'all' ? null : (req.query.companyId || getCompanyId(req))
    const { id } = req.params
    const filter = companyId ? { _id: id, companyId } : { _id: id }
    const msg = await WebhookMessage.findOne(filter)
      .populate('retailer', 'retailerId businessName storeName contactPerson whatsappNumber whatsappCountryCode status city state')
      .lean()
    if (!msg) {
      return res.status(404).json({ success: false, error: { message: 'Message not found' } })
    }
    // Mark as read when viewed
    await WebhookMessage.updateOne({ _id: id }, { isRead: true })
    res.json({ success: true, data: { message: { ...msg, isRead: true } } })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to fetch message' } })
  }
}

exports.markWebhookMessagesRead = async (req, res) => {
  try {
    const companyId = getCompanyId(req)
    const { ids } = req.body // array of message IDs, or empty to mark all
    const filter = { companyId }
    if (Array.isArray(ids) && ids.length) filter._id = { $in: ids }
    await WebhookMessage.updateMany(filter, { isRead: true })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to mark messages read' } })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG WEBHOOK  (Webhook Report Configurations in Askeva panel)
// URL: POST /api/askeva/webhook-catalog/:companyId
// ─────────────────────────────────────────────────────────────────────────────

exports.handleCatalogWebhook = async (req, res) => {
  // Acknowledge immediately so Askeva doesn't timeout
  res.status(200).json({ success: true })

  const { companyId } = req.params
  const body = req.body

  console.log('[CatalogWebhook] Received payload for company:', companyId)
  console.log('[CatalogWebhook] Raw body:', JSON.stringify(body, null, 2))

  processCatalogPayload(companyId, body).catch((e) =>
    console.error('[CatalogWebhook] Processing error:', e.message)
  )
}

async function processCatalogPayload(companyId, body) {
  // Askeva catalog webhook can arrive in multiple shapes — handle all of them

  // ── Shape 1: { catalogs: [...] } ─────────────────────────────────────────
  // ── Shape 2: { catalog: {...}, products: [...] } ──────────────────────────
  // ── Shape 3: { data: { catalogs: [...] } } ───────────────────────────────
  // ── Shape 4: flat single catalog object { catalogId, name, products: [...] }

  const root = body?.data || body

  // Collect all catalog objects from the payload
  let catalogs = []
  if (Array.isArray(root?.catalogs)) catalogs = root.catalogs
  else if (Array.isArray(root)) catalogs = root
  else if (root?.catalogId || root?.catalog_id || root?.id) catalogs = [root]
  else if (root?.catalog) catalogs = [root.catalog]

  // Also handle a flat products-only payload (no explicit catalog wrapper)
  // In this case we create/update a "default" catalog entry
  const flatProducts = Array.isArray(root?.products) && catalogs.length === 0
    ? root.products
    : []

  let catalogCount = 0
  let productCount = 0

  for (const c of catalogs) {
    const cid = String(c.catalogId || c.catalog_id || c.id || c._id || '').trim()
    if (!cid) continue

    // Upsert catalog
    await AskevaCatalog.findOneAndUpdate(
      { companyId, catalogId: cid },
      {
        companyId,
        catalogId: cid,
        name: c.name || c.title || '',
        status: c.status || 'active',
        rawResponse: c,
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    )
    catalogCount++
    console.log(`[CatalogWebhook] Upserted catalog: ${cid}`)

    // Upsert products inside this catalog
    const products = Array.isArray(c.products) ? c.products
      : Array.isArray(c.items) ? c.items
      : []

    for (const p of products) {
      const pid = String(p.id || p.product_id || p.productId || p.item_id || p._id || '').trim()
      if (!pid) continue
      await upsertProduct(companyId, cid, pid, p)
      productCount++
    }
  }

  // Handle flat products payload
  if (flatProducts.length) {
    const fallbackCatalogId = String(root?.catalogId || root?.catalog_id || 'default')
    for (const p of flatProducts) {
      const pid = String(p.id || p.product_id || p.productId || p.item_id || p._id || '').trim()
      if (!pid) continue
      await upsertProduct(companyId, fallbackCatalogId, pid, p)
      productCount++
    }
  }

  console.log(
    `[CatalogWebhook] Done — ${catalogCount} catalog(s), ${productCount} product(s) stored for company ${companyId}`
  )
}

async function upsertProduct(companyId, catalogId, productId, p) {
  await Product.findOneAndUpdate(
    { companyId, productId },
    {
      companyId,
      catalogId,
      productId,
      name: p.name || p.title || 'No Name',
      description: p.description || p.desc || '',
      price: p.price || p.sale_price || p.retailer_price || 0,
      category: p.category || p.category_name || p.type || 'General',
      imageUrl: p.image_url || p.imageUrl || p.thumb || p.defaultImage || '',
      sku: p.sku || '',
      isAvailable: p.is_available !== false && p.stock !== 0,
      rawResponse: p,
      lastSyncedAt: new Date(),
    },
    { upsert: true, new: true }
  )
  console.log(`[CatalogWebhook]   Upserted product: ${productId}`)
}
