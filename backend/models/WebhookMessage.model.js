const mongoose = require('mongoose')

const webhookMessageSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true },
    messageId: { type: String, default: '' },
    from: { type: String, required: true }, // sender's wa_id (phone with country code, no +)
    fromName: { type: String, default: '' }, // contact profile name from webhook
    messageType: { type: String, default: 'text' }, // text, image, audio, etc.
    messageBody: { type: String, default: '' }, // text body or caption
    flowToken: { type: String, default: '' }, // flow_token from nfm_reply (retailer_form_copy, etc.)
    flowResponseData: { type: mongoose.Schema.Types.Mixed }, // parsed response_json from flow
    timestamp: { type: Date, default: null }, // WhatsApp message timestamp
    retailer: { type: mongoose.Schema.Types.ObjectId, ref: 'Retailer', default: null },
    retailerMatched: { type: Boolean, default: false }, // true if an active retailer was found
    isRead: { type: Boolean, default: false },
    rawPayload: { type: mongoose.Schema.Types.Mixed }, // full webhook entry payload
  },
  { timestamps: true }
)

webhookMessageSchema.index({ companyId: 1, createdAt: -1 })
webhookMessageSchema.index({ from: 1 })
webhookMessageSchema.index({ retailer: 1 })
webhookMessageSchema.index({ isRead: 1 })
// Deduplicate WhatsApp retries — only applies when messageId is a non-empty string
webhookMessageSchema.index(
  { messageId: 1 },
  { unique: true, partialFilterExpression: { messageId: { $gt: '' } } }
)

module.exports = mongoose.model('WebhookMessage', webhookMessageSchema,)
