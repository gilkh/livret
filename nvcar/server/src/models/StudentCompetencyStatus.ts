import { Schema, model } from 'mongoose'

const statusSchema = new Schema({
  studentId: { type: String, required: true },
  competencyId: { type: String, required: true },
  en: { type: Boolean, default: false },
  fr: { type: Boolean, default: false },
  ar: { type: Boolean, default: false },
  note: { type: String },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, required: true },
})
statusSchema.index({ studentId: 1, competencyId: 1 }, { unique: true })

export const StudentCompetencyStatus = model('StudentCompetencyStatus', statusSchema)
