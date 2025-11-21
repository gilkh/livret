import { Schema, model } from 'mongoose'

const competencySchema = new Schema({
  categoryId: { type: String, required: true },
  label: { type: String, required: true },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
})

export const Competency = model('Competency', competencySchema)
