const mongoose = require('mongoose')

const askevaConfigSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, unique: true },
    providerName: { type: String, default: 'AskEVA' },
    backendUrl: { type: String, default: 'https://backend.askeva.io' },
    apiKey: { type: String, required: true, select: false },
    webhookUrl: { type: String, default: null },
    webhookSecret: { type: String, default: null, select: false },
    isEnabled: { type: Boolean, default: true },
    isConnected: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    connectionError: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

module.exports = mongoose.model('AskevaConfig', askevaConfigSchema)
