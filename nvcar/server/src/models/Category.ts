import { Schema, model } from 'mongoose'

const categorySchema = new Schema({
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
})

export const Category = model('Category', categorySchema)
