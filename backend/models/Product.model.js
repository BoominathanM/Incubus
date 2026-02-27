const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true },
    productId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, default: 0 },
    category: { type: String, default: 'General' },
    imageUrl: { type: String, default: '' },
    sku: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true },
    rawResponse: { type: mongoose.Schema.Types.Mixed }, // Store original payload for future use
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// Index for fast lookup and uniqueness per company
productSchema.index({ companyId: 1, productId: 1 }, { unique: true })

module.exports = mongoose.model('Product', productSchema)
