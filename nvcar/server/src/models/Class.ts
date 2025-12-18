import { Schema, model } from 'mongoose'

const classSchema = new Schema({
  name: { type: String, required: true },
  level: { type: String },
  schoolYearId: { type: String, required: true },
})

classSchema.index({ schoolYearId: 1, name: 1 })

export const ClassModel = model('Class', classSchema)
