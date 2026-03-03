const mongoose = require('mongoose')

const orderItemSchema = new mongoose.Schema(
  {
    productRetailerId: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
  },
  { _id: false }
)

const orderManagementSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true }, // ORD-2026-001
    companyId: { type: String, required: true },

    // Source webhook reference
    webhookMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookMessage', default: null },

    // Customer type: retailer if retailerMatched === true, else enduser
    type: { type: String, enum: ['retailer', 'enduser'], required: true },

    // Sender info (from webhook)
    from: { type: String, default: '' }, // wa_id (phone with country code, no +)
    fromName: { type: String, default: '' },

    // Retailer reference (if matched)
    retailer: { type: mongoose.Schema.Types.ObjectId, ref: 'Retailer', default: null },

    // Order items (from WhatsApp catalog order)
    items: { type: [orderItemSchema], default: [] },
    catalogId: { type: String, default: '' },
    messageBody: { type: String, default: '' }, // "SKU-001 x5, SKU-002 x3"

    // Contact / delivery info (editable by admin)
    contactName: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },

    // Payment
    amount: { type: Number, default: 0 },
    paymentStatus: { type: String, default: 'Pending' }, // Pending | Success | Failed
    paymentMode: { type: String, default: '' },          // UPI | PhonePe | Google Pay | Credit Card | Debit Card
    transactionId: { type: String, default: '' },
    paymentDate: { type: Date, default: null },

    // Billing (billing agent)
    billingVerified: { type: Boolean, default: false },
    billingVerifiedBy: { type: String, default: '' },
    billingVerifiedAt: { type: Date, default: null },
    notifyBillingVerification: { type: Boolean, default: false },
    billingStatus: { type: String, default: 'Pending' },   // Pending | Completed
    invoiceNumber: { type: String, default: '' },
    billingTime: { type: Date, default: null },
    notifyBilling: { type: Boolean, default: false },

    // Warehouse (warehouse agent)
    warehouseStatus: { type: String, default: 'Preparing' }, // Preparing | Ready
    warehouseTime: { type: Date, default: null },
    dispatchStatus: { type: String, default: 'Pending' },    // Pending | Dispatched
    dispatchTime: { type: Date, default: null },
    notifyDispatch: { type: Boolean, default: false },

    // Delivery (warehouse agent)
    deliveryType: { type: String, default: '' }, // warehouse_agent | porter | courier_service
    deliveryStatus: { type: String, default: 'Pending' }, // Pending | In Transit | Delivered
    deliveryTime: { type: Date, default: null },
    notifyDelivery: { type: Boolean, default: false },
    trackingUrl: { type: String, default: '' },
    courier: { type: String, default: '' },
    awb: { type: String, default: '' },

    // Warehouse agent delivery-type specific
    deliveryTypeWarehouseStatus: { type: String, default: 'Pending' }, // Pending | Out for Delivery

    // Porter delivery-type specific
    porterPhone: { type: String, default: '' },
    porterVehicleNumber: { type: String, default: '' },
    porterName: { type: String, default: '' },
    porterTrackingUrl: { type: String, default: '' },

    // Courier service delivery-type specific
    courierDocumentNumber: { type: String, default: '' },
    courierAgent: { type: String, default: '' }, // Jaydeep Logistics | DTDC
    courierLastTrackingUrl: { type: String, default: '' },

    // Final
    finalStatus: { type: String, default: 'Open' }, // Open | Closed
  },
  { timestamps: true }
)

orderManagementSchema.index({ companyId: 1, createdAt: -1 })
orderManagementSchema.index({ orderId: 1 })
orderManagementSchema.index({ type: 1 })
orderManagementSchema.index({ retailer: 1 })
orderManagementSchema.index({ paymentStatus: 1 })
orderManagementSchema.index({ finalStatus: 1 })

module.exports = mongoose.model('OrderManagement', orderManagementSchema, 'ordersmanagement')
