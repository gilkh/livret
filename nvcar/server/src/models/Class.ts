import { Schema, model } from 'mongoose'

const classSchema = new Schema({
  name: { type: String, required: true },
  level: { type: String },
  schoolYearId: { type: String, required: true },
})

export const ClassModel = model('Class', classSchema)
