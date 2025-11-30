import { Schema, model } from 'mongoose'

const settingSchema = new Schema({
  key: { type: String, unique: true, required: true },
  value: { type: Schema.Types.Mixed, required: true },
})

export const Setting = model('Setting', settingSchema)
