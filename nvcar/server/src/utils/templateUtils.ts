import { ClassModel } from '../models/Class'
import { Enrollment } from '../models/Enrollment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'

export async function checkAndAssignTemplates(studentId: string, level: string, schoolYearId: string, classId: string, userId: string) {
  try {
    // 1. Find other students in the same level for this school year
    const classesInLevel = await ClassModel.find({ level, schoolYearId }).lean()
    const classIdsInLevel = classesInLevel.map(c => String(c._id))

    if (classIdsInLevel.length === 0) return

    // Find enrollments in these classes (excluding the current student)
    const enrollments = await Enrollment.find({
      classId: { $in: classIdsInLevel },
      studentId: { $ne: studentId }
    }).lean()

    if (enrollments.length === 0) return

    const otherStudentIds = enrollments.map(e => e.studentId)

    // 2. Find templates assigned to these students
    const assignments = await TemplateAssignment.find({
      studentId: { $in: otherStudentIds }
    }).lean()

    const templateIds = [...new Set(assignments.map(a => a.templateId))]

    if (templateIds.length === 0) {
      // 2a. Check for Default Templates for this Level
      const defaultTemplates = await GradebookTemplate.find({ defaultForLevels: level }).lean()
      if (defaultTemplates.length > 0) {
        templateIds.push(...defaultTemplates.map(t => String(t._id)))
      }
    }

    if (templateIds.length === 0) return

    // 3. Assign these templates to the new student
    const teacherAssignments = await TeacherClassAssignment.find({ classId }).lean()
    const teacherIds = teacherAssignments.map(t => t.teacherId)

    for (const templateId of templateIds) {
      // Check if already assigned
      const exists = await TemplateAssignment.findOne({ studentId, templateId })
      const template = await GradebookTemplate.findById(templateId).lean()

      if (!template) continue

      if (!exists) {
        // NEW: Check for previous year assignment data to copy over
        // We look for a "SavedGradebook" or a previous "TemplateAssignment" for the PREVIOUS level/year.
        // However, we want the data to persist.
        // If we find a previous assignment for this student (regardless of template ID? or maybe same template ID if it persists?),
        // we should copy the `data` field.

        // Actually, the user requirement is: "modified on the same one that was worked on in the previous years"
        // This implies the data should carry over.
        
        let initialData = {};
        
        // Find the most recent assignment for this student (any template, or matching template?)
        // If the template changes between years (e.g. EB4 -> EB5), the structure might be different.
        // But usually, teachers want to keep comments or specific tracking data.
        
        // Let's try to find the MOST RECENT assignment for this student
        const lastAssignment = await TemplateAssignment.findOne({ studentId })
          .sort({ assignedAt: -1 })
          .lean();

        if (lastAssignment && lastAssignment.data) {
           initialData = lastAssignment.data;
           // We might need to clear specific fields that are year-specific?
           // For now, we copy everything as requested.
        }

        await TemplateAssignment.create({
          templateId,
          templateVersion: template.currentVersion || 1,
          studentId,
          assignedTeachers: teacherIds,
          assignedBy: userId,
          assignedAt: new Date(),
          status: 'draft',
          data: initialData // Initialize with previous data
        })
      } else {
        // Update existing assignment to ensure it's ready for the new year
        const updates: any = {}

        // Update version if needed
        if (exists.templateVersion !== template.currentVersion) {
          updates.templateVersion = template.currentVersion
        }

        // Reset status if it was completed/signed in previous years
        if (['completed', 'signed'].includes(exists.status)) {
          updates.status = 'in_progress'
          updates.isCompleted = false
          updates.completedAt = null
          updates.completedBy = null
          updates.teacherCompletions = []
        }

        // Always update teachers to the new class teachers
        updates.assignedTeachers = teacherIds

        await TemplateAssignment.updateOne({ _id: exists._id }, { $set: updates })
      }
    }
  } catch (err) {
    console.error('Error in checkAndAssignTemplates:', err)
  }
}
