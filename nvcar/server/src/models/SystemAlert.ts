import { Schema, model } from 'mongoose'

const systemAlertSchema = new Schema({
  message: { type: String, required: true },
  type: { type: String, enum: ['warning', 'success'], default: 'warning' },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
})

export const SystemAlert = model('SystemAlert', systemAlertSchema)
