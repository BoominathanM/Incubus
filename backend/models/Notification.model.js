const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: [
        'retailer_webhook',
        'retailer_executive',
        'retailer_approve',
        'retailer_reject',
        'order_webhook',
        'retailer_webhook_executive',
        'order_new',
        'billing_done',
        'delivery',
      ],
      default: 'order_new',
    },
    referenceId: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
)

notificationSchema.index({ userId: 1, createdAt: -1 })
notificationSchema.index({ userId: 1, read: 1 })

module.exports = mongoose.model('Notification', notificationSchema)
