import { Schema, model } from 'mongoose'

const enrollmentSchema = new Schema({
  studentId: { type: String, required: true },
  classId: { type: String, required: true },
  schoolYearId: { type: String, required: true },
})

export const Enrollment = model('Enrollment', enrollmentSchema)
