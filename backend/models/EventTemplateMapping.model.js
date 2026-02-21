const mongoose = require('mongoose')

const variableMappingSchema = new mongoose.Schema(
  {
    templateVariable: { type: String, required: true },
    hrmsField: { type: String, required: true },
    defaultValue: { type: String, default: '' },
  },
  { _id: false }
)

const eventTemplateMappingSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    hrmsEventType: { type: String, required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'AskevaTemplate', required: true },
    templateName: { type: String, default: '' },
    isEnabled: { type: Boolean, default: true },
    variables: [variableMappingSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

eventTemplateMappingSchema.index({ companyId: 1, hrmsEventType: 1 }, { unique: true })

module.exports = mongoose.model('EventTemplateMapping', eventTemplateMappingSchema)
