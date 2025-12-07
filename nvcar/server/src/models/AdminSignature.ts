import { Schema, model } from 'mongoose'

const adminSigSchema = new Schema({
  name: { type: String, required: true },
  dataUrl: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
})

export const AdminSignature = model('AdminSignature', adminSigSchema)
