import { Schema, model } from 'mongoose'

const systemAlertSchema = new Schema({
  message: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
})

export const SystemAlert = model('SystemAlert', systemAlertSchema)
