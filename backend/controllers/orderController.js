const OrderManagement = require('../models/OrderManagement.model')
const WebhookMessage = require('../models/WebhookMessage.model')
const Product = require('../models/Product.model')
const Retailer = require('../models/Retailer')
const EventTemplateMapping = require('../models/EventTemplateMapping.model')
const askevaService = require('../services/askeva.service')
const { responseJsonHasRetailerFormCopy, responseJsonHasDeliveryFormCopy, getFlowTokenFromResponseJson, responseJsonStringHasRetailerFormCopy, mustBlockOrderCreation, FLOW_TOKEN_DELIVERY } = require('../services/retailerFromFlow')
const { notifyWarehouseAgents, notifyAdminAndSuperAdmin, notifyBillingAgents } = require('../services/notificationService')
const mongoose = require('mongoose')
const User = require('../models/User')

function toDigits(str) {
  return (str || '').replace(/\D/g, '')
}

async function findActiveRetailerByPhone(phone) {
  const incoming = toDigits(phone)
  if (!incoming) return null
  const retailers = await Retailer.find(
    { status: 'active' },
    '_id retailerId businessName whatsappCountryCode whatsappNumber'
  ).lean()
  return retailers.find((r) => {
    const full = toDigits(r.whatsappCountryCode) + toDigits(r.whatsappNumber)
    return full === incoming || toDigits(r.whatsappNumber) === incoming
  }) || null
}

/** Returns retailer if phone has pending_approval or rejected — blocks order creation until approved */
async function findPendingRetailerByPhone(phone) {
  const incoming = toDigits(phone)
  if (!incoming) return null
  const retailers = await Retailer.find(
    { status: { $in: ['pending_approval', 'rejected'] } },
    'retailerId businessName status whatsappCountryCode whatsappNumber'
  ).lean()
  return retailers.find((r) => {
    const full = toDigits(r.whatsappCountryCode) + toDigits(r.whatsappNumber)
    return full === incoming || toDigits(r.whatsappNumber) === incoming
  }) || null
}

// Dedicated counter collection — avoids index conflicts with the legacy 'counters' collection
const _orderCounterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false, collection: 'ordercounters' }
)
const OrderCounter = mongoose.models.OrderCounter ||
  mongoose.model('OrderCounter', _orderCounterSchema)

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'
const RETAILER_POPULATE_FIELDS = 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode altContactCountryCode altContactNumber gst pan street1 street2 city district state pincode branches status'

// ─── Role permission maps ─────────────────────────────────────────────────────

const BILLING_FIELDS = new Set([
  'billingVerified', 'billingVerifiedBy', 'billingVerifiedAt', 'notifyBillingVerification',
  'billingStatus', 'invoiceNumber', 'billingTime', 'notifyBilling',
])

const WAREHOUSE_FIELDS = new Set([
  'warehouseStatus', 'warehouseTime',
  'dispatchStatus', 'dispatchTime', 'notifyDispatch',
  'deliveryType', 'deliveryStatus', 'deliveryTime', 'notifyDelivery',
  'trackingUrl', 'courier', 'awb', 'deliveryTypeWarehouseStatus',
  'porterPhone', 'porterVehicleNumber', 'porterName', 'porterTrackingUrl',
  'courierDocumentNumber', 'courierAgent', 'courierLastTrackingUrl',
])

const ADMIN_FIELDS = new Set([
  'contactName', 'contactNumber', 'contactEmail', 'deliveryAddress',
  'amount', 'finalStatus',
  'paymentStatus', 'paymentMode', 'transactionId', 'paymentDate',
  ...BILLING_FIELDS,
  ...WAREHOUSE_FIELDS,
])

// ─── Pure helpers (hoisted, accessible everywhere in this module) ─────────────

async function generateOrderId() {
  const year = new Date().getFullYear()
  const counterKey = `order_${year}`
  let seq = 1
  try {
    const counter = await OrderCounter.findOneAndUpdate(
      { _id: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    seq = counter?.seq || 1
  } catch (err) {
    // Fallback: count existing orders for this year to derive the next number
    console.error('[generateOrderId] Counter error, falling back to count:', err.message)
    seq = (await OrderManagement.countDocuments({ orderId: { $regex: `^ORD-${year}-` } })) + 1
  }
  return `ORD-${year}-${String(seq).padStart(3, '0')}`
}

function getAllowedFields(role, payload) {
  let allowed
  if (role === 'admin' || role === 'superadmin') {
    allowed = ADMIN_FIELDS
  } else if (role === 'billing') {
    allowed = BILLING_FIELDS
  } else if (role === 'warehouse') {
    allowed = WAREHOUSE_FIELDS
  } else {
    return {}
  }
  const filtered = {}
  for (const key of Object.keys(payload)) {
    if (allowed.has(key)) filtered[key] = payload[key]
  }
  return filtered
}

// Time windows for correlating webhook messages to same order (milliseconds)
const ORDER_CORRELATION_WINDOW_MS = 30 * 60 * 1000 // 30 min for payment to find order
const ORDER_UPDATE_WINDOW_MS = 10 * 60 * 1000      // 10 min for interactive to find order

/**
 * Find existing order from same user that can be updated (not yet paid).
 * Used to correlate payment/interactive messages with the main catalog order.
 */
async function findRecentPendingOrder(companyId, from) {
  const cutoff = new Date(Date.now() - ORDER_CORRELATION_WINDOW_MS)
  return OrderManagement.findOne({
    companyId,
    from: String(from || '').replace(/\D/g, ''),
    paymentStatus: 'Pending',
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .lean()
}

/**
 * Find existing order from same user for flow form update (within shorter window).
 */
async function findRecentOrderForFlowUpdate(companyId, from) {
  const cutoff = new Date(Date.now() - ORDER_UPDATE_WINDOW_MS)
  return OrderManagement.findOne({
    companyId,
    from: String(from || '').replace(/\D/g, ''),
    paymentStatus: 'Pending',
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .lean()
}

/** Strict check: if response_json in rawPayload contains flow_token retailer_form_copy → never create order */
function webhookHasRetailerFormCopy(wm) {
  if (!wm) return false
  if ((wm.flowToken || '').toString().trim().toLowerCase() === 'retailer_form_copy') return true
  if (responseJsonStringHasRetailerFormCopy(wm?.rawPayload)) return true
  if (mustBlockOrderCreation(wm)) return true
  return false
}

/**
 * Core order-creation helper. Only creates orders for catalog order flow (order form + payment).
 * If response_json contains flow_token retailer_form_copy → NEVER create order (create retailer instead).
 */
async function createOrderFromWebhook({
  companyId, webhookMessageId, from, fromName,
  retailerMatched, retailer, items, catalogId, messageBody,
  extraFields = {},
  rawPayload: rawPayloadArg,
}) {
  const { skipBillingNotification, ...persistExtraFields } = extraFields || {}
  // VERIFY response_json flow_token BEFORE any order logic: never create order for retailer_form_copy
  if (webhookMessageId) {
    const wm = await WebhookMessage.findById(webhookMessageId).select('rawPayload flowToken messageType').lean()
    if (webhookHasRetailerFormCopy(wm)) {
      console.log('[OrderController] BLOCK order: webhook message has flow_token retailer_form_copy (verify before create)')
      return null
    }
    if (wm?.rawPayload && responseJsonStringHasRetailerFormCopy(wm.rawPayload)) {
      console.log('[OrderController] BLOCK order: webhook message response_json has flow_token retailer_form_copy (verify before create)')
      return null
    }
  }
  if (rawPayloadArg && responseJsonStringHasRetailerFormCopy(rawPayloadArg)) {
    console.log('[OrderController] BLOCK order: rawPayload response_json has flow_token retailer_form_copy (verify before create)')
    return null
  }

  // GUARD 1: Never create order with no catalog items (prevents retailer-form or flow-order from creating orders)
  if (!Array.isArray(items) || items.length === 0) {
    console.log('[OrderController] Skipping order: no catalog items', { webhookMessageId: webhookMessageId || null, from })
    return null
  }

  const enrichedItems = await enrichItemsWithProductDetails(companyId, catalogId || '', items)
  const amount = (enrichedItems || []).reduce((sum, it) => sum + (Number(it.itemPrice) || 0) * (Number(it.quantity) || 1), 0)

  // GUARD 2: If rawPayload passed (from webhook), never create order for retailer form
  if (rawPayloadArg && responseJsonHasRetailerFormCopy(rawPayloadArg)) {
    console.log('[OrderController] Skipping order: rawPayload has flow_token retailer_form_copy')
    return null
  }
  // GUARD 2b: For flow payloads, only allow order when response_json has "flow_token":"delivery_address_copy"
  if (rawPayloadArg) {
    const token = getFlowTokenFromResponseJson(rawPayloadArg)
    if (token && token !== FLOW_TOKEN_DELIVERY && token !== 'delivery_address_copy') {
      console.log('[OrderController] Skipping order: rawPayload flow_token is not delivery_address_copy', { token })
      return null
    }
  }

  // GUARD 3: If webhookMessageId links to a message, verify it is NOT retailer_form_copy (by rawPayload and stored flowToken)
  if (webhookMessageId) {
    const wm = await WebhookMessage.findById(webhookMessageId).select('flowToken rawPayload messageBody messageType').lean()
    const storedToken = (wm?.flowToken || '').toString().trim().toLowerCase()
    if (storedToken === 'retailer_form_copy') {
      console.log('[OrderController] Skipping order: webhook message flowToken is retailer_form_copy')
      return null
    }
    if (webhookHasRetailerFormCopy(wm)) {
      console.log('[OrderController] Skipping order: response_json contains flow_token retailer_form_copy (create retailer instead)')
      return null
    }
    if (wm && (wm.messageType || '').toLowerCase() === 'interactive') {
      const mb = (wm.messageBody || '').toLowerCase()
      if (mb.includes('flow order') || mb.includes('retailer onboarding') || mb.includes('order flow form')) {
        console.log('[OrderController] Skipping order: interactive flow/onboarding message')
        return null
      }
    }
  }

  // Idempotency: same webhook message must not create duplicate orders
  if (webhookMessageId) {
    const existing = await OrderManagement.findOne({ webhookMessageId }).lean()
    if (existing) return existing
  }

  // Block: sender has retailer in pending_approval — no orders until approved
  const pendingRetailer = await findPendingRetailerByPhone(from)
  if (pendingRetailer) {
    console.log(`[OrderController] Skipping order: ${from} has retailer ${pendingRetailer.retailerId} in ${pendingRetailer.status} — awaiting approval`)
    return null
  }

  // NUCLEAR: Final block before OrderManagement.create — NEVER create when response_json has flow_token retailer_form_copy
  if (webhookMessageId) {
    const wm = await WebhookMessage.findById(webhookMessageId).select('rawPayload flowToken').lean()
    if (mustBlockOrderCreation(wm)) {
      console.log('[OrderController] NUCLEAR BLOCK: webhook', webhookMessageId, 'has flow_token retailer_form_copy — order NOT created')
      return null
    }
  }
  if (rawPayloadArg && mustBlockOrderCreation({ rawPayload: rawPayloadArg })) {
    console.log('[OrderController] NUCLEAR BLOCK: rawPayload has flow_token retailer_form_copy — order NOT created')
    return null
  }

  const orderId = await generateOrderId()
  const messageBodyResolved = messageBody || enrichedItems.map((i) => (i.productName ? `${i.productName} x${i.quantity}` : `${i.productRetailerId} x${i.quantity}`)).join(', ')
  const orderPayload = {
    orderId,
    companyId,
    webhookMessageId: webhookMessageId || null,
    referenceId: persistExtraFields.referenceId != null ? String(persistExtraFields.referenceId).trim() : '',
    type: retailerMatched ? 'retailer' : 'enduser',
    from: from || '',
    fromName: fromName || '',
    retailer: retailer?._id || null,
    items: enrichedItems,
    catalogId: catalogId || '',
    messageBody: messageBodyResolved || '',
    contactName: fromName || '',
    contactNumber: from || '',
    amount: amount || persistExtraFields.amount || 0,
    paymentStatus: persistExtraFields.paymentStatus || 'Pending',
    billingStatus: 'Pending',
    warehouseStatus: 'Preparing',
    dispatchStatus: 'Pending',
    deliveryStatus: 'Pending',
    finalStatus: 'Open',
  }
  const order = await OrderManagement.create({ ...orderPayload, ...persistExtraFields })
  if (!skipBillingNotification && order?.orderId) {
    notifyBillingAgents(
      'New order arrived – verify',
      `Order ${order.orderId} has been placed. Please verify.`,
      order.orderId
    ).catch((e) => console.warn('[OrderController] notifyBillingAgents failed:', e.message))
  }
  return order
}

const ORDER_CORRELATION_CUTOFF_MS = 30 * 60 * 1000

/**
 * Update the most recent pending order (by from) with delivery/contact and reference_id.
 * Used when delivery_address_copy webhook is received.
 */
async function updatePendingOrderDelivery(companyId, from, extraFields) {
  const normalizedFrom = String(from || '').replace(/\D/g, '')
  const cutoff = new Date(Date.now() - ORDER_CORRELATION_CUTOFF_MS)
  const order = await OrderManagement.findOne({
    companyId,
    from: normalizedFrom,
    paymentStatus: 'Pending',
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .lean()
  if (!order) return null
  const update = {}
  if (extraFields.referenceId != null) update.referenceId = String(extraFields.referenceId).trim()
  if (extraFields.contactName != null) update.contactName = extraFields.contactName
  if (extraFields.contactNumber != null) update.contactNumber = extraFields.contactNumber
  if (extraFields.deliveryAddress != null) update.deliveryAddress = extraFields.deliveryAddress
  if (extraFields.deliveryStoreName != null) update.deliveryStoreName = extraFields.deliveryStoreName
  if (extraFields.deliveryCustomerName != null) update.deliveryCustomerName = extraFields.deliveryCustomerName
  if (extraFields.deliveryStreetName != null) update.deliveryStreetName = extraFields.deliveryStreetName
  if (extraFields.deliveryLandmark != null) update.deliveryLandmark = extraFields.deliveryLandmark
  if (extraFields.deliveryCity != null) update.deliveryCity = extraFields.deliveryCity
  if (extraFields.deliveryState != null) update.deliveryState = extraFields.deliveryState
  if (extraFields.deliveryPincode != null) update.deliveryPincode = extraFields.deliveryPincode
  if (extraFields.deliveryMobileNumber != null) update.deliveryMobileNumber = extraFields.deliveryMobileNumber
  if (extraFields.deliveryAlternateNumber != null) update.deliveryAlternateNumber = extraFields.deliveryAlternateNumber
  if (Object.keys(update).length === 0) return order
  await OrderManagement.updateOne({ orderId: order.orderId }, { $set: update })
  return OrderManagement.findOne({ orderId: order.orderId }).lean()
}

/**
 * Update pending order with payment fields. Match by referenceId (from webhook) if provided, else by from + Pending.
 */
async function updatePendingOrderPayment(companyId, from, extraFields) {
  let order = null
  if (extraFields.referenceId && String(extraFields.referenceId).trim()) {
    order = await OrderManagement.findOne({
      companyId,
      referenceId: String(extraFields.referenceId).trim(),
      paymentStatus: 'Pending',
    }).sort({ createdAt: -1 }).lean()
  }
  if (!order) {
    const normalizedFrom = String(from || '').replace(/\D/g, '')
    const cutoff = new Date(Date.now() - ORDER_CORRELATION_CUTOFF_MS)
    order = await OrderManagement.findOne({
      companyId,
      from: normalizedFrom,
      paymentStatus: 'Pending',
      createdAt: { $gte: cutoff },
    })
      .sort({ createdAt: -1 })
      .lean()
  }
  if (!order) return null
  const update = {}
  if (extraFields.paymentStatus != null) update.paymentStatus = extraFields.paymentStatus
  if (extraFields.paymentMode != null) update.paymentMode = extraFields.paymentMode
  if (extraFields.transactionId != null) update.transactionId = extraFields.transactionId
  if (extraFields.paymentDate != null) update.paymentDate = extraFields.paymentDate
  if (extraFields.amount != null) update.amount = extraFields.amount
  if (Object.keys(update).length === 0) return order
  await OrderManagement.updateOne({ orderId: order.orderId }, { $set: update })
  return OrderManagement.findOne({ orderId: order.orderId }).lean()
}

/**
 * Handle webhook order event: create ONE order per user flow.
 * - order (catalog): CREATE new order (canonical order placement)
 * - interactive (nfm_reply): UPDATE existing order with flow data; NEVER create new order
 * - payment: UPDATE existing order with payment info, NEVER create
 */
async function handleWebhookOrderEvent({
  msgType,
  companyId,
  webhookMessageId,
  from,
  fromName,
  retailerMatched,
  retailer,
  items,
  catalogId,
  messageBody,
  extraFields = {},
  flowToken = '',
  rawPayload: rawPayloadArg,
}) {
  const normalizedFrom = String(from || '').replace(/\D/g, '')
  const ft = String(flowToken || '').trim().toLowerCase()
  if (ft === 'retailer_form_copy') {
    console.log('[OrderController] Skipping order — flow_token is retailer_form_copy')
    return null
  }
  // VERIFY response_json before any order path: never create when response_json has "flow_token":"retailer_form_copy"
  if (webhookMessageId) {
    const wm = await WebhookMessage.findById(webhookMessageId).select('rawPayload').lean()
    if (wm?.rawPayload && responseJsonStringHasRetailerFormCopy(wm.rawPayload)) {
      console.log('[OrderController] BLOCK order: webhook message response_json has flow_token retailer_form_copy (verify before create)')
      return null
    }
  }
  if (rawPayloadArg && responseJsonStringHasRetailerFormCopy(rawPayloadArg)) {
    console.log('[OrderController] BLOCK order: rawPayload response_json has flow_token retailer_form_copy')
    return null
  }
  // FINAL GUARD: If rawPayload passed, check first — never create order for retailer form
  if (rawPayloadArg && responseJsonHasRetailerFormCopy(rawPayloadArg)) {
    console.log('[OrderController] Skipping order — rawPayload has flow_token retailer_form_copy')
    return null
  }
  // STRICT: Verify linked webhook message does NOT have retailer form
  if (webhookMessageId) {
    const wm = await WebhookMessage.findById(webhookMessageId).select('flowToken rawPayload messageType').lean()
    if (webhookHasRetailerFormCopy(wm)) {
      console.log('[OrderController] Skipping order — webhook message has flow_token retailer_form_copy')
      return null
    }
    // For interactive messages, only allow order path when flow_token is delivery_address_copy
    if ((wm?.messageType || '').toLowerCase() === 'interactive') {
      const token = (wm?.flowToken || getFlowTokenFromResponseJson(wm?.rawPayload) || '').toString().trim().toLowerCase()
      // If token is retailer_form_copy → always block
      if (token === 'retailer_form_copy') {
        console.log('[OrderController] Skipping order — interactive webhook flow_token is retailer_form_copy')
        return null
      }
      // If token is non-empty and not a delivery token → block
      if (token && token !== FLOW_TOKEN_DELIVERY && token !== 'delivery_address_copy') {
        console.log('[OrderController] Skipping order — interactive webhook flow_token is not delivery_address_copy', { token })
        return null
      }
      // If token is EMPTY — rawPayload may not have been checked yet (flowToken stored as '' at create time)
      // Do a direct rawPayload check as final safety net
      if (!token && wm?.rawPayload && responseJsonHasRetailerFormCopy(wm.rawPayload)) {
        console.log('[OrderController] Skipping order — interactive webhook rawPayload contains retailer_form_copy (flowToken was empty)')
        return null
      }
    }
  }

  // PAYMENT: Always update existing order, never create
  if (msgType === 'payment') {
    const existing = await findRecentPendingOrder(companyId, normalizedFrom)
    if (existing) {
      await OrderManagement.updateOne(
        { orderId: existing.orderId },
        {
          $set: {
            paymentStatus: extraFields.paymentStatus || 'Success',
            paymentMode: extraFields.paymentMode || 'WhatsApp Pay',
            transactionId: extraFields.transactionId || '',
          },
          ...(extraFields.paymentDate && { paymentDate: extraFields.paymentDate }),
        }
      )
      return OrderManagement.findOne({ orderId: existing.orderId }).lean()
    }
    console.warn('[OrderController] Payment received but no pending order found for', normalizedFrom)
    return null
  }

  // INTERACTIVE: NEVER create orders — only update existing. Retailer form (flow_token retailer_form_copy) must not create/update orders.
  if (msgType === 'interactive') {
    const existing = await findRecentOrderForFlowUpdate(companyId, normalizedFrom)
    if (existing) {
      const update = {}
      if (extraFields.contactName) update.contactName = extraFields.contactName
      if (extraFields.contactNumber) update.contactNumber = extraFields.contactNumber
      if (extraFields.deliveryAddress) update.deliveryAddress = extraFields.deliveryAddress
      if (Object.keys(update).length > 0) {
        await OrderManagement.updateOne({ orderId: existing.orderId }, { $set: update })
      }
      return OrderManagement.findOne({ orderId: existing.orderId }).lean()
    }
    // No existing order for this flow; do not create from interactive payload
    console.log('[OrderController] Interactive flow received without existing order; skipping order creation for', normalizedFrom)
    return null
  }

  // ORDER (catalog): Create new order — or update if flow created one first
  // Never create with empty items (prevents flow/retailer form from creating orders)
  if (!Array.isArray(items) || items.length === 0) {
    console.log('[OrderController] Skipping order creation: no catalog items')
    return null
  }
  const existing = await findRecentOrderForFlowUpdate(companyId, normalizedFrom)
  if (existing && (existing.items?.length || 0) === 0) {
    // Flow created order first; update with catalog items
    await OrderManagement.updateOne(
      { orderId: existing.orderId },
      {
        $set: {
          items: items || [],
          catalogId: catalogId || '',
          messageBody: messageBody || '',
        },
      }
    )
    if (!extraFields?.skipBillingNotification) {
      notifyBillingAgents(
        'New order arrived – verify',
        `Order ${existing.orderId} has been placed. Please verify.`,
        existing.orderId
      ).catch((e) => console.warn('[OrderController] notifyBillingAgents failed:', e.message))
    }
    return OrderManagement.findOne({ orderId: existing.orderId }).lean()
  }
  try {
    const order = await createOrderFromWebhook({
      companyId,
      webhookMessageId,
      from,
      fromName,
      retailerMatched,
      retailer,
      items,
      catalogId,
      messageBody,
      extraFields,
      rawPayload: rawPayloadArg,
    })
    console.log(`[OrderController] Created order ${order?.orderId} for ${normalizedFrom}`)
    return order
  } catch (e) {
    console.error('[OrderController] createOrderFromWebhook failed:', e.message)
    throw e
  }
}

/**
 * Enrich order items with productName and itemPrice from Product catalog (by productRetailerId).
 * Preserves item_price from webhook (product_items[].item_price) when already set and > 0.
 */
async function enrichItemsWithProductDetails(companyId, catalogId, items) {
  if (!items?.length) return items
  const enriched = []
  for (const it of items) {
    let productName = it.productName || ''
    const webhookPrice = Number(it.itemPrice) || 0
    let itemPrice = webhookPrice
    if (!productName || (!itemPrice && itemPrice !== 0)) {
      try {
        const product = await Product.findOne({
          companyId,
          $or: [
            { productId: it.productRetailerId },
            { sku: it.productRetailerId },
          ],
        })
          .lean()
        if (product) {
          if (!productName) productName = product.name || ''
          if (itemPrice <= 0) itemPrice = Number(product.price) || 0
        }
      } catch (_) { /* ignore */ }
    }
    if (itemPrice <= 0 && webhookPrice > 0) itemPrice = webhookPrice
    enriched.push({
      productRetailerId: it.productRetailerId || '',
      quantity: Number(it.quantity) || 1,
      productName: productName || it.productRetailerId || '',
      itemPrice,
    })
  }
  return enriched
}

// Export for retailerWebhookController
exports.createOrderFromWebhook = createOrderFromWebhook
exports.handleWebhookOrderEvent = handleWebhookOrderEvent
exports.updatePendingOrderDelivery = updatePendingOrderDelivery
exports.updatePendingOrderPayment = updatePendingOrderPayment

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/orders/backfill
 * Admin only. Reads all existing WebhookMessage records with messageType 'order'
 * and creates OrderManagement records for any that are not yet linked.
 */
exports.backfillOrdersFromWebhooks = async (req, res) => {
  try {
    const messages = await WebhookMessage.find({ messageType: 'order' })
      .populate('retailer', RETAILER_POPULATE_FIELDS)
      .lean()

    if (messages.length === 0) {
      return res.json({
        success: true,
        message: 'No order-type webhook messages found in the database',
        created: 0,
        skipped: 0,
      })
    }

    // Check which webhook messages already have an order record
    const existingLinks = await OrderManagement.find(
      { webhookMessageId: { $in: messages.map((m) => m._id) } },
      'webhookMessageId'
    ).lean()
    const linkedSet = new Set(existingLinks.map((o) => String(o.webhookMessageId)))

    let created = 0
    let skipped = 0
    const errors = []

    for (const msg of messages) {
      if (linkedSet.has(String(msg._id))) {
        skipped++
        continue
      }

      try {
        // Try to parse product items from rawPayload first (most accurate)
        const rawItems = []
        try {
          const entries = msg.rawPayload?.entry || []
          for (const entry of entries) {
            for (const change of (entry.changes || [])) {
              for (const rawMsg of (change.value?.messages || [])) {
                if (rawMsg.type === 'order' && Array.isArray(rawMsg.order?.product_items)) {
                  for (const pi of rawMsg.order.product_items) {
                    rawItems.push({
                      productRetailerId: pi.product_retailer_id || '',
                      quantity: Number(pi.quantity) || 1,
                    })
                  }
                }
              }
            }
          }
        } catch (_) { /* ignore rawPayload parse errors */ }

        // Fallback: parse from messageBody text ("SKU-001 x5, SKU-002 x3")
        const bodyItems = []
        if (rawItems.length === 0 && msg.messageBody) {
          for (const part of msg.messageBody.split(',')) {
            const match = part.trim().match(/^(.+?)\s+x(\d+)$/i)
            if (match) {
              bodyItems.push({
                productRetailerId: match[1].trim(),
                quantity: parseInt(match[2], 10),
              })
            }
          }
        }

        const finalItems = rawItems.length > 0 ? rawItems : bodyItems
        if (finalItems.length === 0) {
          skipped++
          continue
        }

        // STRICT: Never create from retailer form — response_json contains flow_token retailer_form_copy
        if (mustBlockOrderCreation(msg) || (msg.flowToken || '').toString().toLowerCase() === 'retailer_form_copy') {
          skipped++
          continue
        }

        // createOrderFromWebhook is a local function — always in scope
        await createOrderFromWebhook({
          companyId: msg.companyId,
          webhookMessageId: msg._id,
          from: msg.from,
          fromName: msg.fromName,
          retailerMatched: msg.retailerMatched,
          retailer: msg.retailer || null,
          items: finalItems,
          catalogId: '',
          messageBody: msg.messageBody,
          extraFields: { skipBillingNotification: true },
        })
        created++
      } catch (e) {
        console.error('[Backfill] Error creating order for msg', msg._id, e.message)
        errors.push({ messageId: String(msg._id), error: e.message })
      }
    }

    return res.json({
      success: true,
      message: `Sync complete: ${created} order(s) created, ${skipped} already existed`,
      created,
      skipped,
      total: messages.length,
      ...(errors.length ? { errors } : {}),
    })
  } catch (err) {
    console.error('[Backfill] Fatal error:', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/orders/reset-counter
 * Admin only. Resets order numbering to start from ORD-{YEAR}-001.
 * Renumbers all existing orders for the current year and resets the counter.
 */
exports.resetOrderCounter = async (req, res) => {
  try {
    const year = new Date().getFullYear()
    const counterKey = `order_${year}`

    const existingOrders = await OrderManagement.find({ orderId: { $regex: `^ORD-${year}-` } })
      .sort({ createdAt: 1 })
      .lean()

    for (let i = 0; i < existingOrders.length; i++) {
      const newId = `ORD-${year}-${String(i + 1).padStart(3, '0')}`
      if (existingOrders[i].orderId !== newId) {
        await OrderManagement.updateOne(
          { _id: existingOrders[i]._id },
          { $set: { orderId: newId } }
        )
      }
    }

    await OrderCounter.findOneAndUpdate(
      { _id: counterKey },
      { $set: { seq: existingOrders.length } },
      { upsert: true }
    )

    return res.json({
      success: true,
      message: `Order counter reset. ${existingOrders.length} order(s) renumbered to start from ORD-${year}-001.`,
      renumbered: existingOrders.length,
      nextOrderId: `ORD-${year}-${String(existingOrders.length + 1).padStart(3, '0')}`,
    })
  } catch (err) {
    console.error('[resetOrderCounter] Error:', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/orders
 * Create a new order manually (admin/superadmin only).
 * Rejects if webhookMessageId points to a retailer-form message (flow_token retailer_form_copy).
 */
exports.createOrder = async (req, res) => {
  try {
    const companyId = req.query.companyId || COMPANY_ID
    const webhookMessageId = req.body?.webhookMessageId
    if (webhookMessageId) {
      const wm = await WebhookMessage.findById(webhookMessageId).select('rawPayload flowToken').lean()
      if (wm && (mustBlockOrderCreation(wm) || webhookHasRetailerFormCopy(wm))) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create order: webhook message is retailer onboarding (flow_token retailer_form_copy). Create retailer instead.',
        })
      }
    }
    const orderId = await generateOrderId()
    const order = await OrderManagement.create({
      ...req.body,
      orderId,
      companyId,
      type: req.body.type || 'enduser',
    })
    notifyAdminAndSuperAdmin(
      'New order created',
      `Order ${order.orderId} has been created. Please review.`,
      'order_webhook',
      order.orderId
    ).catch((e) => console.warn('[OrderController] notifyAdminAndSuperAdmin failed:', e.message))
    notifyBillingAgents(
      'New order arrived – verify',
      `Order ${order.orderId} has been placed. Please verify.`,
      order.orderId
    ).catch((e) => console.warn('[OrderController] notifyBillingAgents failed:', e.message))
    return res.status(201).json({ success: true, data: order })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/orders
 * List orders. All roles see all orders unless ?companyId= is passed.
 * Query: page, limit, tab (all|paid|pending|completed), search, startDate, endDate, type, companyId
 */
exports.getOrders = async (req, res) => {
  try {
    const role = req.user?.role
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20)
    const skip  = (page - 1) * limit

    // Admin/superadmin see all orders. Billing/warehouse also see all orders
    // (single-tenant; User model has no companyId — filtering was causing empty results)
    const filter = {}
    const isAdmin = role === 'admin' || role === 'superadmin'
    if (!isAdmin && req.query.companyId) {
      filter.companyId = req.query.companyId
    }

    const tab = req.query.tab
    if (tab === 'paid')      filter.paymentStatus = 'Success'
    if (tab === 'pending')   filter.paymentStatus = 'Pending'
    if (tab === 'completed') filter.finalStatus = 'Closed'

    if (req.query.type && ['retailer', 'enduser'].includes(req.query.type)) {
      filter.type = req.query.type
    }

    if (req.query.search) {
      const q = req.query.search.trim()
      filter.$or = [
        { orderId:     { $regex: q, $options: 'i' } },
        { fromName:    { $regex: q, $options: 'i' } },
        { contactName: { $regex: q, $options: 'i' } },
      ]
    }

    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {}
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate)
      if (req.query.endDate)   filter.createdAt.$lte = new Date(req.query.endDate)
    }

    const [orders, total] = await Promise.all([
      OrderManagement.find(filter)
        .populate('retailer', RETAILER_POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OrderManagement.countDocuments(filter),
    ])

    return res.json({
      success: true,
      data: {
        orders,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/orders/:orderId
 * Single order — all roles can view.
 */
exports.getOrderById = async (req, res) => {
  try {
    const order = await OrderManagement.findOne({ orderId: req.params.orderId })
      .populate('retailer', RETAILER_POPULATE_FIELDS)
      .lean()

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    return res.json({ success: true, data: order })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/orders/stats
 * Returns order aggregate stats. Supports optional ?startDate= &endDate= for date-range filtering.
 * All roles that can view orders can access this.
 */
exports.getOrderStats = async (req, res) => {
  try {
    const filter = {}
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {}
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate)
      if (req.query.endDate)   filter.createdAt.$lte = new Date(req.query.endDate)
    }

    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      totalOrdersPaid,
      invoicesProcessed,
      invoicesPending,
      ordersReadyForDispatch,
      ordersInTransit,
      ordersDelivered,
      revenueAgg,
    ] = await Promise.all([
      OrderManagement.countDocuments(filter),
      OrderManagement.countDocuments({ ...filter, finalStatus: 'Closed' }),
      OrderManagement.countDocuments({ ...filter, paymentStatus: 'Pending' }),
      OrderManagement.countDocuments({ ...filter, paymentStatus: 'Success' }),
      OrderManagement.countDocuments({ ...filter, billingStatus: 'Completed' }),
      OrderManagement.countDocuments({ ...filter, billingVerified: true, billingStatus: 'Pending' }),
      OrderManagement.countDocuments({ ...filter, warehouseStatus: 'Ready' }),
      OrderManagement.countDocuments({ ...filter, deliveryStatus: 'In Transit' }),
      OrderManagement.countDocuments({ ...filter, deliveryStatus: 'Delivered' }),
      OrderManagement.aggregate([
        { $match: { ...filter, paymentStatus: 'Success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ])

    return res.json({
      success: true,
      data: {
        totalOrders,
        completedOrders,
        pendingOrders,
        totalRevenue: revenueAgg[0]?.total || 0,
        totalOrdersPaid,
        invoicesProcessed,
        invoicesPending,
        ordersReadyForDispatch,
        ordersInTransit,
        ordersDelivered,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── Order notification helper ─────────────────────────────────────────────────

/**
 * GET /api/orders/stats/by-date
 * Returns per-day (or per-month) order counts: total, pending, completed.
 */
exports.getOrderStatsByDate = async (req, res) => {
  try {
    const group = (req.query.group || 'day').toLowerCase()
    const byMonth = group === 'month'

    const filter = {}
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {}
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate)
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate)
    }

    const dateExpr = byMonth
      ? { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
      : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }

    const rows = await OrderManagement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: dateExpr,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$finalStatus', 'Closed'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ])

    return res.json({
      success: true,
      data: rows.map((r) => ({
        date: r._id,
        total: r.total || 0,
        pending: r.pending || 0,
        completed: r.completed || 0,
      })),
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to get order stats by date' })
  }
}

/**
 * Resolve a hrmsField string to its value from the order document.
 */
function resolveOrderField(order, hrmsField) {
  const map = {
    'Order ID': order.orderId,
    'Contact Name': order.contactName || order.fromName,
    'Contact Number': order.contactNumber || order.from,
    'Amount': order.amount != null ? String(order.amount) : '',
    'Invoice Number': order.invoiceNumber,
    'Billing Status': order.billingStatus,
    'Dispatch Status': order.dispatchStatus,
    'Delivery Status': order.deliveryStatus,
    'Delivery Type': order.deliveryType,
    'Tracking URL': order.porterTrackingUrl || order.courierLastTrackingUrl || order.trackingUrl,
  }
  return map[hrmsField] ?? ''
}

/**
 * Send a WhatsApp order notification to:
 *   1. The customer (order.contactNumber or order.from)
 *   2. The matched retailer's WhatsApp number (if populated)
 * Looks up the EventTemplateMapping for the given eventType.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function sendOrderNotification(order, eventType, companyId) {
  try {
    // Look up event mapping — use $ne:false so old docs without the field are included
    let mapping = await EventTemplateMapping.findOne({
      companyId,
      hrmsEventType: eventType,
      isEnabled: { $ne: false },
    })
      .populate('templateId', 'templateName language')
      .lean()

    // Fallback: find the mapping under any companyId if not found under this one
    if (!mapping || !mapping.templateId) {
      mapping = await EventTemplateMapping.findOne({
        hrmsEventType: eventType,
        isEnabled: { $ne: false },
      })
        .populate('templateId', 'templateName language')
        .lean()
    }

    if (!mapping || !mapping.templateId) {
      console.log(`[OrderNotify] No active mapping for event '${eventType}' — skipping`)
      return
    }

    const resolvedCompanyId = mapping.companyId || companyId
    const templateName = mapping.templateName || mapping.templateId.templateName
    // Normalize language to lowercase (template stores 'EN', API expects 'en')
    const language = (mapping.templateId.language || 'en').toLowerCase()

    // Build parameters object — convert {{N}} keys to numeric string keys ("1", "2", ...)
    // which is the standard format accepted by most WhatsApp BSPs including Askeva
    const parameters = {}
    for (const v of (mapping.variables || [])) {
      const val = resolveOrderField(order, v.hrmsField) || v.defaultValue || ''
      // Strip {{ and }} to get the positional key: "{{1}}" → "1"
      const key = v.templateVariable.replace(/\{\{|\}\}/g, '').trim()
      parameters[key] = val
    }

    // Collect recipient phone numbers (deduplicated)
    // Prefer order.from — always the full WhatsApp wa_id (e.g. "916379171055") from webhook.
    // order.contactNumber may only store the local number without country code after admin edits.
    const recipients = new Set()
    const fromPhone = (order.from || '').replace(/\D/g, '')
    const contactPhone = (order.contactNumber || '').replace(/\D/g, '')
    // Use the longer/more complete number — full wa_id has country code (11-12 digits)
    const customerPhone = fromPhone.length >= contactPhone.length ? fromPhone : contactPhone
    if (customerPhone && customerPhone.length >= 10) recipients.add(customerPhone)

    if (order.retailer && order.retailer.whatsappNumber) {
      const cc = (order.retailer.whatsappCountryCode || '91').replace(/\D/g, '')
      const num = order.retailer.whatsappNumber.replace(/\D/g, '')
      const retailerPhone = cc + num
      if (retailerPhone) recipients.add(retailerPhone)
    }

    console.log(`[OrderNotify] Sending '${eventType}' for order ${order.orderId} | recipients: [${[...recipients].join(', ')}] | template: ${templateName} | params:`, parameters)

    for (const phone of recipients) {
      const result = await askevaService.sendMessage({
        companyId: resolvedCompanyId,
        module: 'order',
        payload: { to: phone, templateName, language, parameters },
      })
      if (result.success) {
        console.log(`[OrderNotify] ✓ Sent '${eventType}' to ${phone} for order ${order.orderId}`)
      } else {
        console.warn(`[OrderNotify] ✗ Failed to send '${eventType}' to ${phone}:`, result.error)
      }
    }
  } catch (err) {
    console.error(`[OrderNotify] Error sending '${eventType}' for order ${order?.orderId}:`, err.message)
  }
}

/**
 * PATCH /api/orders/:orderId
 * Update order with role-based field restrictions.
 */
exports.updateOrder = async (req, res) => {
  try {
    const role = req.user.role
    const order = await OrderManagement.findOne({ orderId: req.params.orderId })
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    const updateData = getAllowedFields(role, req.body)

    if (Object.keys(updateData).length === 0) {
      return res.status(403).json({ success: false, message: 'No permitted fields to update' })
    }

    // Enforce unique invoice number across orders (except current order).
    if (Object.prototype.hasOwnProperty.call(updateData, 'invoiceNumber')) {
      const invoiceNumber = String(updateData.invoiceNumber || '').trim()
      updateData.invoiceNumber = invoiceNumber
      if (invoiceNumber) {
        const duplicateInvoice = await OrderManagement.findOne({
          _id: { $ne: order._id },
          invoiceNumber: { $regex: `^${invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        }).select('_id orderId invoiceNumber').lean()
        if (duplicateInvoice) {
          return res.status(400).json({
            success: false,
            message: `Invoice number '${invoiceNumber}' already exists for order ${duplicateInvoice.orderId}.`,
          })
        }
      }
    }

    // Auto-set billing meta
    if (updateData.billingVerified === true && !updateData.billingVerifiedAt) {
      const u = await User.findById(req.user.id, 'name').lean()
      updateData.billingVerifiedBy = u?.name || req.user.email
      updateData.billingVerifiedAt = new Date()
    }
    if (updateData.billingStatus === 'Completed' && !order.billingTime && !updateData.billingTime) {
      updateData.billingTime = new Date()
    }

    // Auto-set warehouse timestamps
    if (updateData.warehouseStatus === 'Ready' && !order.warehouseTime && !updateData.warehouseTime) {
      updateData.warehouseTime = new Date()
    }
    if (updateData.dispatchStatus === 'Dispatched' && !order.dispatchTime && !updateData.dispatchTime) {
      updateData.dispatchTime = new Date()
    }
    if (updateData.deliveryStatus === 'Delivered' && !order.deliveryTime && !updateData.deliveryTime) {
      updateData.deliveryTime = new Date()
    }

    const updated = await OrderManagement.findOneAndUpdate(
      { orderId: req.params.orderId },
      { $set: updateData },
      { new: true }
    ).populate('retailer', RETAILER_POPULATE_FIELDS).lean()

    // Notify warehouse/delivery when billing is done (verify or completed)
    const billingJustDone = (updateData.billingVerified === true || updateData.billingStatus === 'Completed') &&
      !order.billingVerified && order.billingStatus !== 'Completed'
    if (billingJustDone && updated?.orderId) {
      notifyWarehouseAgents(
        'Billing done – ready for dispatch',
        `Order ${updated.orderId} verified. Please proceed with warehouse/delivery.`,
        updated.orderId
      ).catch((e) => console.warn('[OrderController] notifyWarehouseAgents failed:', e.message))
    }

    // Fire-and-forget WhatsApp notifications (non-blocking)
    if (updateData.notifyBillingVerification === true)
      sendOrderNotification(updated, 'Billing Verification', updated.companyId)
    if (updateData.notifyBilling === true)
      sendOrderNotification(updated, 'Billing Invoice Generate', updated.companyId)
    if (updateData.notifyDispatch === true)
      sendOrderNotification(updated, 'Dispatch Order', updated.companyId)
    if (updateData.notifyDelivery === true)
      sendOrderNotification(updated, 'Delivery Completed', updated.companyId)

    return res.json({ success: true, data: updated })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
