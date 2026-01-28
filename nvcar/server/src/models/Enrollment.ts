import { Schema, model } from 'mongoose'

const enrollmentSchema = new Schema({
  studentId: { type: String, required: true },
  classId: { type: String }, // Optional for promoted students not yet assigned
  schoolYearId: { type: String, required: true },
  status: { type: String, enum: ['active', 'promoted', 'archived', 'left'], default: 'active' },
  promotionStatus: { type: String, enum: ['promoted', 'retained', 'conditional', 'summer_school', 'left', 'pending'], default: 'pending' },
})

// Add indexes for performance
enrollmentSchema.index({ studentId: 1 })
enrollmentSchema.index({ schoolYearId: 1 })
enrollmentSchema.index({ classId: 1 })
enrollmentSchema.index({ studentId: 1, schoolYearId: 1 }) // Compound index for common lookup
enrollmentSchema.index({ schoolYearId: 1, studentId: 1 })
enrollmentSchema.index({ schoolYearId: 1, classId: 1 })

export const Enrollment = model('Enrollment', enrollmentSchema)
