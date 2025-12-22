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

// When a TeacherClassAssignment is created or updated, optionally sync assigned teachers
// into existing next-year TemplateAssignments that are missing assignedTeachers (policy: if_missing)
teacherClassAssignmentSchema.post('save', async function(doc: any) {
    try {
        const Setting = require('./Setting').Setting
        const inheritSetting = await Setting.findOne({ key: 'assignment_inherit_assigned_teachers_on_promotion' }).lean()
        const inheritPolicy = (inheritSetting && inheritSetting.value) ? String(inheritSetting.value) : 'if_missing'
        if (inheritPolicy === 'never') return

        const TemplateAssignment = require('./TemplateAssignment').TemplateAssignment
        const Enrollment = require('./Enrollment').Enrollment
        const TeacherClassAssignment = require('./TeacherClassAssignment').TeacherClassAssignment

        // Find all teacher ids for this class/schoolYear
        const tcas = await TeacherClassAssignment.find({ classId: doc.classId, schoolYearId: doc.schoolYearId }).lean()
        const teacherIds = tcas.map((t: any) => String(t.teacherId))
        if (!teacherIds || teacherIds.length === 0) return

        // Find students in this class for that school year
        const enrollments = await Enrollment.find({ classId: doc.classId, schoolYearId: doc.schoolYearId }).lean()
        const studentIds = enrollments.map((e: any) => String(e.studentId))
        if (!studentIds || studentIds.length === 0) return

        console.log('TeacherClassAssignment post-save', { classId: doc.classId, schoolYearId: doc.schoolYearId, teacherIds, studentIds })

        // Update assignments that are missing assignedTeachers (respect 'if_missing')
        const res = await TemplateAssignment.updateMany(
            { studentId: { $in: studentIds }, completionSchoolYearId: doc.schoolYearId, $or: [{ assignedTeachers: { $exists: false } }, { assignedTeachers: { $size: 0 } }] },
            { $set: { assignedTeachers: teacherIds } }
        )
        console.log('TeacherClassAssignment post-save updated assignments', res && (res as any).modifiedCount ? (res as any).modifiedCount : res)
    } catch (e: any) {
        // Do not crash on listener errors; log for debugging
        console.error('TeacherClassAssignment post-save listener error:', e?.message || e)
    }
})

export const TeacherClassAssignment = model('TeacherClassAssignment', teacherClassAssignmentSchema)
