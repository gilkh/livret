import { Schema, model } from 'mongoose'

const teacherClassAssignmentSchema = new Schema({
    teacherId: { type: String, required: true },
    classId: { type: String, required: true },
    schoolYearId: { type: String, required: true },
    languages: { type: [String], default: [] },
    isProfPolyvalent: { type: Boolean, default: false },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
})

// Create compound index to prevent duplicate assignments
teacherClassAssignmentSchema.index({ teacherId: 1, classId: 1 }, { unique: true })

export const TeacherClassAssignment = model('TeacherClassAssignment', teacherClassAssignmentSchema)
