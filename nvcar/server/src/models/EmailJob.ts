import { Schema, model, Document, Types } from 'mongoose'

export interface IEmailJobItem {
  fileId: string
  studentId: string
  studentName: string
  recipients: string[]
  status: 'pending' | 'sent' | 'skipped' | 'failed'
  error?: string
}

export interface IEmailJob extends Document {
  batchId: Types.ObjectId
  createdBy: Types.ObjectId
  creatorName?: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  totalItems: number
  processedItems: number
  sentItems: number
  skippedItems: number
  failedItems: number
  startedAt: Date
  updatedAt: Date
  completedAt?: Date
  options: {
    includeFather: boolean
    includeMother: boolean
    includeStudent: boolean
    customMessage: string
    selectedFileIds: string[]
  }
  items: IEmailJobItem[]
  error?: string
}

const emailJobSchema = new Schema<IEmailJob>({
  batchId: { type: Schema.Types.ObjectId, ref: 'ExportedGradebookBatch', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  creatorName: { type: String },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
  totalItems: { type: Number, default: 0 },
  processedItems: { type: Number, default: 0 },
  sentItems: { type: Number, default: 0 },
  skippedItems: { type: Number, default: 0 },
  failedItems: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  options: {
    includeFather: { type: Boolean, default: true },
    includeMother: { type: Boolean, default: true },
    includeStudent: { type: Boolean, default: true },
    customMessage: { type: String },
    selectedFileIds: [{ type: String }]
  },
  items: [{
    fileId: { type: String },
    studentId: { type: String },
    studentName: { type: String },
    recipients: [{ type: String }],
    status: { type: String, enum: ['pending', 'sent', 'skipped', 'failed'], default: 'pending' },
    error: { type: String }
  }],
  error: { type: String }
}, {
  timestamps: true
})

export const EmailJob = model<IEmailJob>('EmailJob', emailJobSchema)
