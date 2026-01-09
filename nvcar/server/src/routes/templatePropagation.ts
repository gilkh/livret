import { Router } from 'express'
import { requireAuth } from '../auth'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { ClassModel } from '../models/Class'
import { Enrollment } from '../models/Enrollment'
import { SchoolYear } from '../models/SchoolYear'
import { ensureStableBlockIds, ensureStableExpandedTableRowIds } from '../utils/templateUtils'
import { clearCache } from '../utils/cache'

export const templatePropagationRouter = Router()

interface AssignmentInfo {
    _id: string
    studentId: string
    studentName: string
    classId: string
    className: string
    level: string
    schoolYearId: string
    schoolYearName: string
    templateVersion: number
    hasData: boolean
    status: string
}

/**
 * Get all assignments for a template, grouped by school year and class
 * This is used to show the admin which gradebooks will be affected by a template change
 */
templatePropagationRouter.get('/:templateId/assignments', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params

        // Get the template
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' })
        }

        // Get all assignments for this template
        const assignments = await TemplateAssignment.find({ templateId }).lean()

        if (assignments.length === 0) {
            return res.json({
                template: {
                    _id: template._id,
                    name: template.name,
                    currentVersion: template.currentVersion || 1
                },
                assignments: [],
                groupedByYear: {},
                totalCount: 0
            })
        }

        // Get all student IDs
        const studentIds = [...new Set(assignments.map(a => a.studentId))]

        // Fetch students
        const students = await Student.find({ _id: { $in: studentIds } }).lean()
        const studentMap = new Map(students.map(s => [String(s._id), s]))

        // Get all unique class IDs from enrollments for these students
        const enrollments = await Enrollment.find({
            studentId: { $in: studentIds },
            status: { $ne: 'archived' }
        }).lean()

        // Get most recent enrollment per student
        const latestEnrollmentByStudent = new Map<string, any>()
        for (const e of enrollments) {
            const sid = String(e.studentId)
            const current = latestEnrollmentByStudent.get(sid)
            const eCreatedAt = (e as any).createdAt
            const curCreatedAt = current ? (current as any).createdAt : null
            if (!current || (eCreatedAt && curCreatedAt && new Date(eCreatedAt) > new Date(curCreatedAt))) {
                latestEnrollmentByStudent.set(sid, e)
            }
        }

        const classIds = [...new Set(Array.from(latestEnrollmentByStudent.values()).map(e => e.classId))]
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        const classMap = new Map(classes.map(c => [String(c._id), c]))

        // Get all school years
        const schoolYearIds = [...new Set(assignments.map(a => a.completionSchoolYearId).filter(Boolean) as string[])]
        const schoolYears = await SchoolYear.find({ _id: { $in: schoolYearIds } }).lean()
        const yearMap = new Map(schoolYears.map(y => [String(y._id), y]))

        // Build assignment info
        const assignmentInfos: AssignmentInfo[] = assignments.map(assignment => {
            const student = studentMap.get(assignment.studentId)
            const enrollment = latestEnrollmentByStudent.get(assignment.studentId)
            const cls = enrollment ? classMap.get(String(enrollment.classId)) : null
            const year = yearMap.get(assignment.completionSchoolYearId || '')

            return {
                _id: String(assignment._id),
                studentId: assignment.studentId,
                studentName: student ? `${(student as any).firstName} ${(student as any).lastName}` : 'Inconnu',
                classId: enrollment ? String(enrollment.classId) : '',
                className: cls ? (cls as any).name : 'Non assigné',
                level: cls ? (cls as any).level : (student as any)?.level || '',
                schoolYearId: assignment.completionSchoolYearId || '',
                schoolYearName: year ? (year as any).name : 'Non défini',
                templateVersion: assignment.templateVersion || 1,
                hasData: !!(assignment.data && Object.keys(assignment.data).length > 0),
                status: assignment.status || 'draft'
            }
        })

        // Group by school year then by class
        const groupedByYear: Record<string, {
            yearName: string
            classes: Record<string, {
                className: string
                level: string
                assignments: AssignmentInfo[]
            }>
        }> = {}

        for (const info of assignmentInfos) {
            const yearKey = info.schoolYearId || 'unknown'
            if (!groupedByYear[yearKey]) {
                groupedByYear[yearKey] = {
                    yearName: info.schoolYearName,
                    classes: {}
                }
            }

            const classKey = info.classId || 'unassigned'
            if (!groupedByYear[yearKey].classes[classKey]) {
                groupedByYear[yearKey].classes[classKey] = {
                    className: info.className,
                    level: info.level,
                    assignments: []
                }
            }

            groupedByYear[yearKey].classes[classKey].assignments.push(info)
        }

        // Sort assignments within each class by student name
        for (const yearData of Object.values(groupedByYear)) {
            for (const classData of Object.values(yearData.classes)) {
                classData.assignments.sort((a, b) => a.studentName.localeCompare(b.studentName))
            }
        }

        res.json({
            template: {
                _id: template._id,
                name: template.name,
                currentVersion: template.currentVersion || 1,
                versionCount: (template.versionHistory || []).length
            },
            assignments: assignmentInfos,
            groupedByYear,
            totalCount: assignmentInfos.length,
            versionsInUse: [...new Set(assignmentInfos.map(a => a.templateVersion))].sort((a, b) => a - b)
        })
    } catch (e: any) {
        console.error('[templatePropagation] Error fetching assignments:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

/**
 * Save template with selective propagation
 * This endpoint allows saving template changes and selectively propagating to assignments
 */
templatePropagationRouter.patch('/:templateId', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params
        const {
            templateData,
            propagateToAssignmentIds,
            changeDescription,
            saveType
        } = req.body

        const userId = (req as any).user.actualUserId || (req as any).user.userId

        // Get the current template
        const currentTemplate = await GradebookTemplate.findById(templateId)
        if (!currentTemplate) {
            return res.status(404).json({ error: 'template_not_found' })
        }

        // Extract fields that should not be overwritten from request
        const { _id, __v, createdBy, updatedAt, shareId, versions, comments, versionHistory, currentVersion, ...rest } = templateData || {}

        // Process pages with stable block IDs
        const previousPages = Array.isArray((currentTemplate as any).pages) ? (currentTemplate as any).pages : []
        const hasIncomingPages = Object.prototype.hasOwnProperty.call(rest, 'pages')
        const incomingPages = hasIncomingPages ? (Array.isArray((rest as any).pages) ? (rest as any).pages : []) : undefined
        const pagesWithBlockIds = hasIncomingPages ? ensureStableBlockIds(previousPages, incomingPages) : undefined
        const pagesWithRowIds = hasIncomingPages ? ensureStableExpandedTableRowIds(previousPages, pagesWithBlockIds) : undefined

        // Check if this is a significant change
        const hasSignificantChange = rest.pages || rest.variables !== undefined || rest.watermark !== undefined

        // Check for existing assignments
        const existingAssignments = await TemplateAssignment.find({ templateId }).lean()
        const hasActiveAssignments = existingAssignments.length > 0

        let newVersion = currentTemplate.currentVersion || 1

        // If there are active assignments and significant changes, create a new version
        if (hasActiveAssignments && hasSignificantChange) {
            newVersion = (currentTemplate.currentVersion || 1) + 1

            // Add current state to version history
            const newHistoryEntry = {
                version: newVersion,
                pages: hasIncomingPages ? pagesWithRowIds : currentTemplate.pages,
                variables: rest.variables !== undefined ? rest.variables : currentTemplate.variables,
                watermark: rest.watermark !== undefined ? rest.watermark : currentTemplate.watermark,
                createdAt: new Date(),
                createdBy: userId,
                changeDescription: changeDescription || `Version ${newVersion}`,
                saveType: saveType || 'manual'
            }

            currentTemplate.versionHistory.push(newHistoryEntry)
            currentTemplate.currentVersion = newVersion
        }

        // Update the template
        const data: any = { ...rest, updatedAt: new Date() }
        if (hasIncomingPages) data.pages = pagesWithRowIds
        if (hasActiveAssignments && hasSignificantChange) {
            data.versionHistory = currentTemplate.versionHistory
            data.currentVersion = currentTemplate.currentVersion
        }

        const updatedTemplate = await GradebookTemplate.findByIdAndUpdate(templateId, data, { new: true })

        // Selectively update assignments based on the provided list
        let propagatedCount = 0
        let skippedCount = 0

        if (hasActiveAssignments && hasSignificantChange && updatedTemplate) {
            if (propagateToAssignmentIds && Array.isArray(propagateToAssignmentIds) && propagateToAssignmentIds.length > 0) {
                // Only update selected assignments
                const result = await TemplateAssignment.updateMany(
                    {
                        templateId,
                        _id: { $in: propagateToAssignmentIds }
                    },
                    { $set: { templateVersion: updatedTemplate.currentVersion } }
                )
                propagatedCount = result.modifiedCount
                skippedCount = existingAssignments.length - propagatedCount
            } else if (propagateToAssignmentIds === 'all') {
                // Update all assignments
                const result = await TemplateAssignment.updateMany(
                    { templateId },
                    { $set: { templateVersion: updatedTemplate.currentVersion } }
                )
                propagatedCount = result.modifiedCount
            } else if (propagateToAssignmentIds === 'none' || (Array.isArray(propagateToAssignmentIds) && propagateToAssignmentIds.length === 0)) {
                // Don't update any assignments - they keep their current version
                skippedCount = existingAssignments.length
            } else {
                // Default: update all (backward compatibility)
                const result = await TemplateAssignment.updateMany(
                    { templateId },
                    { $set: { templateVersion: updatedTemplate.currentVersion } }
                )
                propagatedCount = result.modifiedCount
            }
        }

        clearCache('templates')

        res.json({
            template: updatedTemplate,
            propagation: {
                newVersion,
                totalAssignments: existingAssignments.length,
                propagatedCount,
                skippedCount,
                hasSignificantChange
            }
        })
    } catch (e: any) {
        console.error('[templatePropagation] Error saving template:', e)
        res.status(500).json({ error: 'save_failed', message: e.message })
    }
})

/**
 * Propagate template version to specific assignments
 * This allows updating assignments after the fact (e.g., if admin changes their mind)
 */
templatePropagationRouter.post('/:templateId/propagate', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params
        const { assignmentIds, targetVersion } = req.body

        if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' })
        }

        // Get the template to verify version exists
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' })
        }

        // Determine target version
        const version = targetVersion || template.currentVersion || 1

        // Verify version exists in history or is current
        if (version !== template.currentVersion) {
            const versionExists = (template.versionHistory || []).some((v: any) => v.version === version)
            if (!versionExists) {
                return res.status(400).json({ error: 'version_not_found', message: `Version ${version} does not exist` })
            }
        }

        // Update the specified assignments
        const result = await TemplateAssignment.updateMany(
            {
                templateId,
                _id: { $in: assignmentIds }
            },
            { $set: { templateVersion: version } }
        )

        res.json({
            success: true,
            updatedCount: result.modifiedCount,
            targetVersion: version
        })
    } catch (e: any) {
        console.error('[templatePropagation] Error propagating version:', e)
        res.status(500).json({ error: 'propagate_failed', message: e.message })
    }
})

/**
 * Rollback specific assignments to a previous template version
 */
templatePropagationRouter.post('/:templateId/rollback', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params
        const { assignmentIds, targetVersion } = req.body

        if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' })
        }

        if (typeof targetVersion !== 'number') {
            return res.status(400).json({ error: 'missing_target_version' })
        }

        // Get the template to verify version exists
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' })
        }

        // Verify version exists
        if (targetVersion !== template.currentVersion) {
            const versionExists = (template.versionHistory || []).some((v: any) => v.version === targetVersion)
            if (!versionExists) {
                return res.status(400).json({ error: 'version_not_found', message: `Version ${targetVersion} does not exist` })
            }
        }

        // Update the specified assignments
        const result = await TemplateAssignment.updateMany(
            {
                templateId,
                _id: { $in: assignmentIds }
            },
            { $set: { templateVersion: targetVersion } }
        )

        res.json({
            success: true,
            rolledBackCount: result.modifiedCount,
            targetVersion
        })
    } catch (e: any) {
        console.error('[templatePropagation] Error rolling back version:', e)
        res.status(500).json({ error: 'rollback_failed', message: e.message })
    }
})

/**
 * Get template version history with assignment distribution
 * Shows which gradebooks are using each version, organized by school year and class
 */
templatePropagationRouter.get('/:templateId/history', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params

        // Get the template with version history
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' })
        }

        // Get all assignments for this template
        const assignments = await TemplateAssignment.find({ templateId }).lean()

        // Get student IDs
        const studentIds = [...new Set(assignments.map(a => a.studentId))]

        // Fetch students
        const students = await Student.find({ _id: { $in: studentIds } }).lean()
        const studentMap = new Map(students.map(s => [String(s._id), s]))

        // Get enrollments for class info
        const enrollments = await Enrollment.find({
            studentId: { $in: studentIds },
            status: { $ne: 'archived' }
        }).lean()

        // Get most recent enrollment per student
        const latestEnrollmentByStudent = new Map<string, any>()
        for (const e of enrollments) {
            const sid = String(e.studentId)
            const current = latestEnrollmentByStudent.get(sid)
            const eCreatedAt = (e as any).createdAt
            const curCreatedAt = current ? (current as any).createdAt : null
            if (!current || (eCreatedAt && curCreatedAt && new Date(eCreatedAt) > new Date(curCreatedAt))) {
                latestEnrollmentByStudent.set(sid, e)
            }
        }

        const classIds = [...new Set(Array.from(latestEnrollmentByStudent.values()).map(e => e.classId))]
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        const classMap = new Map(classes.map(c => [String(c._id), c]))

        // Get all school years
        const schoolYearIds = [...new Set(assignments.map(a => a.completionSchoolYearId).filter(Boolean) as string[])]
        const schoolYears = await SchoolYear.find({ _id: { $in: schoolYearIds } }).lean()
        const yearMap = new Map(schoolYears.map(y => [String(y._id), y]))

        // Build version history with assignment distribution
        const versionHistory = ((template as any).versionHistory || []).map((version: any) => {
            // Find assignments using this version
            const versionAssignments = assignments.filter(a => a.templateVersion === version.version)

            // Group by school year and class
            const distribution: Record<string, {
                yearName: string
                classes: Record<string, {
                    className: string
                    level: string
                    count: number
                    students: string[]
                }>
            }> = {}

            for (const assignment of versionAssignments) {
                const student = studentMap.get(assignment.studentId)
                const enrollment = latestEnrollmentByStudent.get(assignment.studentId)
                const cls = enrollment ? classMap.get(String(enrollment.classId)) : null
                const year = yearMap.get(assignment.completionSchoolYearId || '')

                const yearKey = assignment.completionSchoolYearId || 'unknown'
                const yearName = year ? (year as any).name : 'Non défini'
                const classKey = enrollment ? String(enrollment.classId) : 'unassigned'
                const className = cls ? (cls as any).name : 'Non assigné'
                const level = cls ? (cls as any).level : ''
                const studentName = student ? `${(student as any).firstName} ${(student as any).lastName}` : 'Inconnu'

                if (!distribution[yearKey]) {
                    distribution[yearKey] = { yearName, classes: {} }
                }
                if (!distribution[yearKey].classes[classKey]) {
                    distribution[yearKey].classes[classKey] = { className, level, count: 0, students: [] }
                }
                distribution[yearKey].classes[classKey].count++
                distribution[yearKey].classes[classKey].students.push(studentName)
            }

            return {
                version: version.version,
                createdAt: version.createdAt,
                createdBy: version.createdBy,
                changeDescription: version.changeDescription || `Version ${version.version}`,
                assignmentCount: versionAssignments.length,
                distribution
            }
        }).reverse() // Most recent first

        // Also show current version info
        const currentVersionAssignments = assignments.filter(a => a.templateVersion === (template as any).currentVersion)
        const currentDistribution: Record<string, any> = {}

        for (const assignment of currentVersionAssignments) {
            const student = studentMap.get(assignment.studentId)
            const enrollment = latestEnrollmentByStudent.get(assignment.studentId)
            const cls = enrollment ? classMap.get(String(enrollment.classId)) : null
            const year = yearMap.get(assignment.completionSchoolYearId || '')

            const yearKey = assignment.completionSchoolYearId || 'unknown'
            const yearName = year ? (year as any).name : 'Non défini'
            const classKey = enrollment ? String(enrollment.classId) : 'unassigned'
            const className = cls ? (cls as any).name : 'Non assigné'
            const level = cls ? (cls as any).level : ''
            const studentName = student ? `${(student as any).firstName} ${(student as any).lastName}` : 'Inconnu'

            if (!currentDistribution[yearKey]) {
                currentDistribution[yearKey] = { yearName, classes: {} }
            }
            if (!currentDistribution[yearKey].classes[classKey]) {
                currentDistribution[yearKey].classes[classKey] = { className, level, count: 0, students: [] }
            }
            currentDistribution[yearKey].classes[classKey].count++
            currentDistribution[yearKey].classes[classKey].students.push(studentName)
        }

        res.json({
            template: {
                _id: template._id,
                name: (template as any).name,
                currentVersion: (template as any).currentVersion || 1,
                createdBy: (template as any).createdBy,
                updatedAt: (template as any).updatedAt
            },
            currentVersionInfo: {
                version: (template as any).currentVersion || 1,
                assignmentCount: currentVersionAssignments.length,
                distribution: currentDistribution
            },
            versionHistory,
            totalAssignments: assignments.length,
            versionsInUse: [...new Set(assignments.map(a => a.templateVersion))].sort((a, b) => b - a)
        })
    } catch (e: any) {
        console.error('[templatePropagation] Error fetching history:', e)
        res.status(500).json({ error: 'fetch_history_failed', message: e.message })
    }
})
