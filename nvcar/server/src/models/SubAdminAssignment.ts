import { Schema, model } from 'mongoose'

const subAdminAssignmentSchema = new Schema({
    subAdminId: { type: String, required: true },
    teacherId: { type: String, required: true },
    schoolYearId: { type: String }, // Optional - if not set, applies to all years
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
})

// Create compound index - unique per subAdmin/teacher/year combination
subAdminAssignmentSchema.index({ subAdminId: 1, teacherId: 1, schoolYearId: 1 }, { unique: true })
subAdminAssignmentSchema.index({ schoolYearId: 1 })

export const SubAdminAssignment = model('SubAdminAssignment', subAdminAssignmentSchema)
