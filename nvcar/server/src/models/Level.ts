import { Schema, model } from 'mongoose'

const levelSchema = new Schema({
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true, unique: true },
})

export const Level = model('Level', levelSchema)
