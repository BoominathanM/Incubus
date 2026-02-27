const mongoose = require('mongoose')

const askevaCatalogSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true },
    catalogId: { type: String, required: true },
    name: { type: String, default: '' },
    status: { type: String, default: 'active' },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

askevaCatalogSchema.index({ companyId: 1, catalogId: 1 }, { unique: true })

module.exports = mongoose.model('AskevaCatalog', askevaCatalogSchema)
