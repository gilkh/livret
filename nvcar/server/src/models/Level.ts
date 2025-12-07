import { Schema, model } from 'mongoose'

const levelSchema = new Schema({
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true, unique: true },
  isExitLevel: { type: Boolean, default: false },
})

export const Level = model('Level', levelSchema)
