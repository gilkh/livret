import { Schema, model } from 'mongoose'

const templateChangeLogSchema = new Schema({
    templateAssignmentId: { type: String, required: true },
    teacherId: { type: String, required: true },
    changeType: { type: String, default: 'language_toggle' },
    blockIndex: { type: Number, required: true },
    pageIndex: { type: Number, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: () => new Date() },
})

// Index for quick lookup of changes by assignment
templateChangeLogSchema.index({ templateAssignmentId: 1, timestamp: -1 })

export const TemplateChangeLog = model('TemplateChangeLog', templateChangeLogSchema)
