const mongoose = require('mongoose')

const ALLOWED_STATUS = ['pending_approval', 'approved', 'rejected', 'active', 'disabled']

const retailerSchema = new mongoose.Schema(
  {
    retailerId: { type: String, trim: true },
    businessName: { type: String, required: true },
    storeName: { type: String, default: '' },
    contactPerson: { type: String, required: true },
    email: { type: String, default: '', lowercase: true },
    whatsappCountryCode: { type: String, default: '+91' },
    whatsappNumber: { type: String, required: true },
    altContactCountryCode: { type: String, default: '' },
    altContactNumber: { type: String, default: '' },
    gst: { type: String, required: true },
    pan: { type: String, required: true },
    gstAttachmentUrl: { type: String, default: '' },
    panAttachmentUrl: { type: String, default: '' },
    street1: { type: String, required: true },
    street2: { type: String, default: '' },
    city: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    branches: { type: Number, default: 1 },
    status: { type: String, enum: ALLOWED_STATUS, default: 'pending_approval' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedReason: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

retailerSchema.index({ status: 1 })
retailerSchema.index({ createdBy: 1, status: 1 })
retailerSchema.index({ email: 1 })
retailerSchema.index({ whatsappCountryCode: 1, whatsappNumber: 1 })
retailerSchema.index({ retailerId: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('Retailer', retailerSchema)
module.exports.ALLOWED_STATUS = ALLOWED_STATUS
