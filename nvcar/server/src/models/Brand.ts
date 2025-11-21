import { Schema, model } from 'mongoose'

const brandSchema = new Schema({
  name: { type: String, required: true },
  logoUrl: { type: String },
  colors: { type: [String], default: [] },
  fonts: { type: [String], default: [] },
})

export const Brand = model('Brand', brandSchema)
