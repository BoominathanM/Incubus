const OrderManagement = require('../models/OrderManagement.model')
const WebhookMessage = require('../models/WebhookMessage.model')
const mongoose = require('mongoose')
const User = require('../models/User')

// Dedicated counter collection — avoids index conflicts with the legacy 'counters' collection
const _orderCounterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false, collection: 'ordercounters' }
)
const OrderCounter = mongoose.models.OrderCounter ||
  mongoose.model('OrderCounter', _orderCounterSchema)

const COMPANY_ID = process.env.ASKEVA_COMPANY_ID || 'default'

// ─── Role permission maps ─────────────────────────────────────────────────────

const BILLING_FIELDS = new Set([
  'billingVerified', 'billingVerifiedBy', 'billingVerifiedAt',
  'billingStatus', 'invoiceNumber', 'billingTime', 'notifyBilling',
])

const WAREHOUSE_FIELDS = new Set([
  'warehouseStatus', 'warehouseTime',
  'dispatchStatus', 'dispatchTime', 'notifyDispatch',
  'deliveryType', 'deliveryStatus', 'deliveryTime',
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

/**
 * Core order-creation helper. Defined as a named function so it can be called
 * from within this same module (backfill) AND exported for external callers
 * (retailerWebhookController).
 * Idempotent: if webhookMessageId already linked to an order, returns that order.
 */
async function createOrderFromWebhook({
  companyId, webhookMessageId, from, fromName,
  retailerMatched, retailer, items, catalogId, messageBody,
  extraFields = {},
}) {
  // Idempotency: same webhook message must not create duplicate orders
  if (webhookMessageId) {
    const existing = await OrderManagement.findOne({ webhookMessageId }).lean()
    if (existing) return existing
  }

  const orderId = await generateOrderId()
  const order = await OrderManagement.create({
    orderId,
    companyId,
    webhookMessageId: webhookMessageId || null,
    type: retailerMatched ? 'retailer' : 'enduser',
    from: from || '',
    fromName: fromName || '',
    retailer: retailer?._id || null,
    items: items || [],
    catalogId: catalogId || '',
    messageBody: messageBody || '',
    contactName: fromName || '',
    contactNumber: from || '',
    ...extraFields,
    paymentStatus: extraFields.paymentStatus || 'Pending',
    billingStatus: 'Pending',
    warehouseStatus: 'Preparing',
    dispatchStatus: 'Pending',
    deliveryStatus: 'Pending',
    finalStatus: 'Open',
  })
  return order
}

/**
 * Handle webhook order event: create ONE order per user flow.
 * - order (catalog): CREATE new order (canonical order placement)
 * - interactive (nfm_reply): UPDATE existing order with flow data, or CREATE if none found
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
}) {
  const normalizedFrom = String(from || '').replace(/\D/g, '')

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

  // INTERACTIVE (flow form): Update existing order or create if none
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
    // No existing order (flow came first) — create
    return createOrderFromWebhook({
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
    })
  }

  // ORDER (catalog): Create new order — or update if flow created one first
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
    })
    console.log(`[OrderController] Created order ${order?.orderId} for ${normalizedFrom}`)
    return order
  } catch (e) {
    console.error('[OrderController] createOrderFromWebhook failed:', e.message)
    throw e
  }
}

// Export for retailerWebhookController
exports.createOrderFromWebhook = createOrderFromWebhook
exports.handleWebhookOrderEvent = handleWebhookOrderEvent

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/orders/backfill
 * Admin only. Reads all existing WebhookMessage records with messageType 'order'
 * and creates OrderManagement records for any that are not yet linked.
 */
exports.backfillOrdersFromWebhooks = async (req, res) => {
  try {
    const messages = await WebhookMessage.find({ messageType: 'order' })
      .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state status')
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
 */
exports.createOrder = async (req, res) => {
  try {
    const companyId = req.query.companyId || COMPANY_ID
    const orderId = await generateOrderId()
    const order = await OrderManagement.create({
      ...req.body,
      orderId,
      companyId,
      type: req.body.type || 'enduser',
    })
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
        .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state')
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
      .populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state')
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
    ).populate('retailer', 'retailerId businessName storeName contactPerson email whatsappNumber whatsappCountryCode city state').lean()

    return res.json({ success: true, data: updated })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
