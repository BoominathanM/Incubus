const mongoose = require('mongoose')

const askevaTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    templateId: { type: String, required: true },
    templateName: { type: String, required: true },
    language: { type: String, default: 'EN' },
    category: { type: String, default: 'MARKETING' },
    status: { type: String, default: 'APPROVED' },
    components: { type: mongoose.Schema.Types.Mixed, default: [] },
    componentsDetail: { type: mongoose.Schema.Types.Mixed, default: null },
    variablePlaceholders: [{ type: String }],
    mappedEventTypes: [{ type: String }],
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

askevaTemplateSchema.index({ companyId: 1, templateId: 1 }, { unique: true })

module.exports = mongoose.model('AskevaTemplate', askevaTemplateSchema)
