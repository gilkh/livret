import { Schema, model } from 'mongoose'

const schoolYearSchema = new Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  active: { type: Boolean, default: true },
  activeSemester: { type: Number, default: 1 },
  sequence: { type: Number }, // Sequential identifier for ordering
})

export const SchoolYear = model('SchoolYear', schoolYearSchema)
