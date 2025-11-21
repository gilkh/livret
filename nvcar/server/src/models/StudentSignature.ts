import { Schema, model } from 'mongoose'

const itemSchema = new Schema({
  label: { type: String, required: true },
  dataUrl: { type: String },
  url: { type: String },
})

const sigSchema = new Schema({
  studentId: { type: String, required: true, unique: true },
  items: { type: [itemSchema], default: [] },
  updatedAt: { type: Date, default: () => new Date() },
})

export const StudentSignature = model('StudentSignature', sigSchema)
