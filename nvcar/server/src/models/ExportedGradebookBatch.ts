import { Schema, model } from 'mongoose'

const exportedGradebookFileSchema = new Schema({
  assignmentId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  yearName: { type: String, default: '' },
  level: { type: String, default: '' },
  className: { type: String, default: '' },
  fileName: { type: String, required: true },
  relativePath: { type: String, required: true },
  emails: {
    father: { type: String, default: '' },
    mother: { type: String, default: '' },
    student: { type: String, default: '' },
  },
  exportedAt: { type: Date, default: Date.now },
}, { _id: true })

const exportedGradebookBatchSchema = new Schema({
  createdBy: { type: String, required: true, index: true },
  creatorRole: { type: String, enum: ['ADMIN', 'SUBADMIN', 'AEFE'], required: true },
  groupLabel: { type: String, default: '' },
  archiveFileName: { type: String, required: true },
  totalAssignmentsRequested: { type: Number, required: true, default: 0 },
  exportedCount: { type: Number, required: true, default: 0 },
  failedCount: { type: Number, required: true, default: 0 },
  files: { type: [exportedGradebookFileSchema], default: [] },
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false })

export const ExportedGradebookBatch = model('ExportedGradebookBatch', exportedGradebookBatchSchema)
