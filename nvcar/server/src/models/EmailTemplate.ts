import mongoose, { Schema, Document } from 'mongoose'

export interface IEmailTemplate extends Document {
  name: string
  subject: string
  bodyHtml: string
  blocks: any[] | null
  linkedLevels: string[]
  linkedClasses: string[]
  createdAt: Date
  updatedAt: Date
}

const EmailTemplateSchema = new Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  bodyHtml: { type: String, required: true },
  blocks: { type: Schema.Types.Mixed, default: null },
  linkedLevels: [{ type: String }],
  linkedClasses: [{ type: String }],
}, { timestamps: true })

export const EmailTemplate = mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema)
