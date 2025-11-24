import { Schema, model } from 'mongoose'

const subAdminAssignmentSchema = new Schema({
    subAdminId: { type: String, required: true },
    teacherId: { type: String, required: true },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
})

// Create compound index to prevent duplicate assignments
subAdminAssignmentSchema.index({ subAdminId: 1, teacherId: 1 }, { unique: true })

export const SubAdminAssignment = model('SubAdminAssignment', subAdminAssignmentSchema)
