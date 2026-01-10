"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templatePropagationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const Class_1 = require("../models/Class");
const Enrollment_1 = require("../models/Enrollment");
const SchoolYear_1 = require("../models/SchoolYear");
const templateUtils_1 = require("../utils/templateUtils");
const cache_1 = require("../utils/cache");
exports.templatePropagationRouter = (0, express_1.Router)();
/**
 * Get all assignments for a template, grouped by school year and class
 * This is used to show the admin which gradebooks will be affected by a template change
 */
exports.templatePropagationRouter.get('/:templateId/assignments', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params;
        // Get the template
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' });
        }
        // Get all assignments for this template
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ templateId }).lean();
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
            });
        }
        // Get all student IDs
        const studentIds = [...new Set(assignments.map(a => a.studentId))];
        // Fetch students
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
        const studentMap = new Map(students.map(s => [String(s._id), s]));
        // Get all unique class IDs from enrollments for these students
        const enrollments = await Enrollment_1.Enrollment.find({
            studentId: { $in: studentIds },
            status: { $ne: 'archived' }
        }).lean();
        // Get most recent enrollment per student
        const latestEnrollmentByStudent = new Map();
        for (const e of enrollments) {
            const sid = String(e.studentId);
            const current = latestEnrollmentByStudent.get(sid);
            const eCreatedAt = e.createdAt;
            const curCreatedAt = current ? current.createdAt : null;
            if (!current || (eCreatedAt && curCreatedAt && new Date(eCreatedAt) > new Date(curCreatedAt))) {
                latestEnrollmentByStudent.set(sid, e);
            }
        }
        const classIds = [...new Set(Array.from(latestEnrollmentByStudent.values()).map(e => e.classId))];
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        // Get all school years
        const schoolYearIds = [...new Set(assignments.map(a => a.completionSchoolYearId).filter(Boolean))];
        const schoolYears = await SchoolYear_1.SchoolYear.find({ _id: { $in: schoolYearIds } }).lean();
        const yearMap = new Map(schoolYears.map(y => [String(y._id), y]));
        // Build assignment info
        const assignmentInfos = assignments.map(assignment => {
            const student = studentMap.get(assignment.studentId);
            const enrollment = latestEnrollmentByStudent.get(assignment.studentId);
            const cls = enrollment ? classMap.get(String(enrollment.classId)) : null;
            const year = yearMap.get(assignment.completionSchoolYearId || '');
            return {
                _id: String(assignment._id),
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Inconnu',
                classId: enrollment ? String(enrollment.classId) : '',
                className: cls ? cls.name : 'Non assigné',
                level: cls ? cls.level : student?.level || '',
                schoolYearId: assignment.completionSchoolYearId || '',
                schoolYearName: year ? year.name : 'Non défini',
                templateVersion: assignment.templateVersion || 1,
                hasData: !!(assignment.data && Object.keys(assignment.data).length > 0),
                status: assignment.status || 'draft'
            };
        });
        // Group by school year then by class
        const groupedByYear = {};
        for (const info of assignmentInfos) {
            const yearKey = info.schoolYearId || 'unknown';
            if (!groupedByYear[yearKey]) {
                groupedByYear[yearKey] = {
                    yearName: info.schoolYearName,
                    classes: {}
                };
            }
            const classKey = info.classId || 'unassigned';
            if (!groupedByYear[yearKey].classes[classKey]) {
                groupedByYear[yearKey].classes[classKey] = {
                    className: info.className,
                    level: info.level,
                    assignments: []
                };
            }
            groupedByYear[yearKey].classes[classKey].assignments.push(info);
        }
        // Sort assignments within each class by student name
        for (const yearData of Object.values(groupedByYear)) {
            for (const classData of Object.values(yearData.classes)) {
                classData.assignments.sort((a, b) => a.studentName.localeCompare(b.studentName));
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
        });
    }
    catch (e) {
        console.error('[templatePropagation] Error fetching assignments:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
/**
 * Save template with selective propagation
 * This endpoint allows saving template changes and selectively propagating to assignments
 */
exports.templatePropagationRouter.patch('/:templateId', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params;
        const { templateData, propagateToAssignmentIds, changeDescription, saveType } = req.body;
        const userId = req.user.actualUserId || req.user.userId;
        // Get the current template
        const currentTemplate = await GradebookTemplate_1.GradebookTemplate.findById(templateId);
        if (!currentTemplate) {
            return res.status(404).json({ error: 'template_not_found' });
        }
        // Extract fields that should not be overwritten from request
        const { _id, __v, createdBy, updatedAt, shareId, versions, comments, versionHistory, currentVersion, ...rest } = templateData || {};
        // Process pages with stable block IDs
        const previousPages = Array.isArray(currentTemplate.pages) ? currentTemplate.pages : [];
        const hasIncomingPages = Object.prototype.hasOwnProperty.call(rest, 'pages');
        const incomingPages = hasIncomingPages ? (Array.isArray(rest.pages) ? rest.pages : []) : undefined;
        const pagesWithBlockIds = hasIncomingPages ? (0, templateUtils_1.ensureStableBlockIds)(previousPages, incomingPages) : undefined;
        const pagesWithRowIds = hasIncomingPages ? (0, templateUtils_1.ensureStableExpandedTableRowIds)(previousPages, pagesWithBlockIds) : undefined;
        // Check if this is a significant change
        const hasSignificantChange = rest.pages || rest.variables !== undefined || rest.watermark !== undefined;
        // Check for existing assignments
        const existingAssignments = await TemplateAssignment_1.TemplateAssignment.find({ templateId }).lean();
        const hasActiveAssignments = existingAssignments.length > 0;
        let newVersion = currentTemplate.currentVersion || 1;
        // If there are active assignments and significant changes, create a new version
        if (hasActiveAssignments && hasSignificantChange) {
            newVersion = (currentTemplate.currentVersion || 1) + 1;
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
            };
            currentTemplate.versionHistory.push(newHistoryEntry);
            currentTemplate.currentVersion = newVersion;
        }
        // Update the template
        const data = { ...rest, updatedAt: new Date() };
        if (hasIncomingPages)
            data.pages = pagesWithRowIds;
        if (hasActiveAssignments && hasSignificantChange) {
            data.versionHistory = currentTemplate.versionHistory;
            data.currentVersion = currentTemplate.currentVersion;
        }
        const updatedTemplate = await GradebookTemplate_1.GradebookTemplate.findByIdAndUpdate(templateId, data, { new: true });
        // Selectively update assignments based on the provided list
        let propagatedCount = 0;
        let skippedCount = 0;
        if (hasActiveAssignments && hasSignificantChange && updatedTemplate) {
            if (propagateToAssignmentIds && Array.isArray(propagateToAssignmentIds) && propagateToAssignmentIds.length > 0) {
                // Only update selected assignments
                const result = await TemplateAssignment_1.TemplateAssignment.updateMany({
                    templateId,
                    _id: { $in: propagateToAssignmentIds }
                }, { $set: { templateVersion: updatedTemplate.currentVersion } });
                propagatedCount = result.modifiedCount;
                skippedCount = existingAssignments.length - propagatedCount;
            }
            else if (propagateToAssignmentIds === 'all') {
                // Update all assignments
                const result = await TemplateAssignment_1.TemplateAssignment.updateMany({ templateId }, { $set: { templateVersion: updatedTemplate.currentVersion } });
                propagatedCount = result.modifiedCount;
            }
            else if (propagateToAssignmentIds === 'none' || (Array.isArray(propagateToAssignmentIds) && propagateToAssignmentIds.length === 0)) {
                // Don't update any assignments - they keep their current version
                skippedCount = existingAssignments.length;
            }
            else {
                // Default: update all (backward compatibility)
                const result = await TemplateAssignment_1.TemplateAssignment.updateMany({ templateId }, { $set: { templateVersion: updatedTemplate.currentVersion } });
                propagatedCount = result.modifiedCount;
            }
        }
        (0, cache_1.clearCache)('templates');
        res.json({
            template: updatedTemplate,
            propagation: {
                newVersion,
                totalAssignments: existingAssignments.length,
                propagatedCount,
                skippedCount,
                hasSignificantChange
            }
        });
    }
    catch (e) {
        console.error('[templatePropagation] Error saving template:', e);
        res.status(500).json({ error: 'save_failed', message: e.message });
    }
});
/**
 * Propagate template version to specific assignments
 * This allows updating assignments after the fact (e.g., if admin changes their mind)
 */
exports.templatePropagationRouter.post('/:templateId/propagate', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params;
        const { assignmentIds, targetVersion } = req.body;
        if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' });
        }
        // Get the template to verify version exists
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' });
        }
        // Determine target version
        const version = targetVersion || template.currentVersion || 1;
        // Verify version exists in history or is current
        if (version !== template.currentVersion) {
            const versionExists = (template.versionHistory || []).some((v) => v.version === version);
            if (!versionExists) {
                return res.status(400).json({ error: 'version_not_found', message: `Version ${version} does not exist` });
            }
        }
        // Update the specified assignments
        const result = await TemplateAssignment_1.TemplateAssignment.updateMany({
            templateId,
            _id: { $in: assignmentIds }
        }, { $set: { templateVersion: version } });
        res.json({
            success: true,
            updatedCount: result.modifiedCount,
            targetVersion: version
        });
    }
    catch (e) {
        console.error('[templatePropagation] Error propagating version:', e);
        res.status(500).json({ error: 'propagate_failed', message: e.message });
    }
});
/**
 * Rollback specific assignments to a previous template version
 */
exports.templatePropagationRouter.post('/:templateId/rollback', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params;
        const { assignmentIds, targetVersion } = req.body;
        if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' });
        }
        if (typeof targetVersion !== 'number') {
            return res.status(400).json({ error: 'missing_target_version' });
        }
        // Get the template to verify version exists
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' });
        }
        // Verify version exists
        if (targetVersion !== template.currentVersion) {
            const versionExists = (template.versionHistory || []).some((v) => v.version === targetVersion);
            if (!versionExists) {
                return res.status(400).json({ error: 'version_not_found', message: `Version ${targetVersion} does not exist` });
            }
        }
        // Update the specified assignments
        const result = await TemplateAssignment_1.TemplateAssignment.updateMany({
            templateId,
            _id: { $in: assignmentIds }
        }, { $set: { templateVersion: targetVersion } });
        res.json({
            success: true,
            rolledBackCount: result.modifiedCount,
            targetVersion
        });
    }
    catch (e) {
        console.error('[templatePropagation] Error rolling back version:', e);
        res.status(500).json({ error: 'rollback_failed', message: e.message });
    }
});
/**
 * Get template version history with assignment distribution
 * Shows which gradebooks are using each version, organized by school year and class
 */
exports.templatePropagationRouter.get('/:templateId/history', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId } = req.params;
        // Get the template with version history
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template) {
            return res.status(404).json({ error: 'template_not_found' });
        }
        // Get all assignments for this template
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ templateId }).lean();
        // Get student IDs
        const studentIds = [...new Set(assignments.map(a => a.studentId))];
        // Fetch students
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
        const studentMap = new Map(students.map(s => [String(s._id), s]));
        // Get enrollments for class info
        const enrollments = await Enrollment_1.Enrollment.find({
            studentId: { $in: studentIds },
            status: { $ne: 'archived' }
        }).lean();
        // Get most recent enrollment per student
        const latestEnrollmentByStudent = new Map();
        for (const e of enrollments) {
            const sid = String(e.studentId);
            const current = latestEnrollmentByStudent.get(sid);
            const eCreatedAt = e.createdAt;
            const curCreatedAt = current ? current.createdAt : null;
            if (!current || (eCreatedAt && curCreatedAt && new Date(eCreatedAt) > new Date(curCreatedAt))) {
                latestEnrollmentByStudent.set(sid, e);
            }
        }
        const classIds = [...new Set(Array.from(latestEnrollmentByStudent.values()).map(e => e.classId))];
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        // Get all school years
        const schoolYearIds = [...new Set(assignments.map(a => a.completionSchoolYearId).filter(Boolean))];
        const schoolYears = await SchoolYear_1.SchoolYear.find({ _id: { $in: schoolYearIds } }).lean();
        const yearMap = new Map(schoolYears.map(y => [String(y._id), y]));
        // Build version history with assignment distribution
        const versionHistory = (template.versionHistory || []).map((version) => {
            // Find assignments using this version
            const versionAssignments = assignments.filter(a => a.templateVersion === version.version);
            // Group by school year and class
            const distribution = {};
            for (const assignment of versionAssignments) {
                const student = studentMap.get(assignment.studentId);
                const enrollment = latestEnrollmentByStudent.get(assignment.studentId);
                const cls = enrollment ? classMap.get(String(enrollment.classId)) : null;
                const year = yearMap.get(assignment.completionSchoolYearId || '');
                const yearKey = assignment.completionSchoolYearId || 'unknown';
                const yearName = year ? year.name : 'Non défini';
                const classKey = enrollment ? String(enrollment.classId) : 'unassigned';
                const className = cls ? cls.name : 'Non assigné';
                const level = cls ? cls.level : '';
                const studentName = student ? `${student.firstName} ${student.lastName}` : 'Inconnu';
                if (!distribution[yearKey]) {
                    distribution[yearKey] = { yearName, classes: {} };
                }
                if (!distribution[yearKey].classes[classKey]) {
                    distribution[yearKey].classes[classKey] = { className, level, count: 0, students: [] };
                }
                distribution[yearKey].classes[classKey].count++;
                distribution[yearKey].classes[classKey].students.push(studentName);
            }
            return {
                version: version.version,
                createdAt: version.createdAt,
                createdBy: version.createdBy,
                changeDescription: version.changeDescription || `Version ${version.version}`,
                assignmentCount: versionAssignments.length,
                distribution
            };
        }).reverse(); // Most recent first
        // Also show current version info
        const currentVersionAssignments = assignments.filter(a => a.templateVersion === template.currentVersion);
        const currentDistribution = {};
        for (const assignment of currentVersionAssignments) {
            const student = studentMap.get(assignment.studentId);
            const enrollment = latestEnrollmentByStudent.get(assignment.studentId);
            const cls = enrollment ? classMap.get(String(enrollment.classId)) : null;
            const year = yearMap.get(assignment.completionSchoolYearId || '');
            const yearKey = assignment.completionSchoolYearId || 'unknown';
            const yearName = year ? year.name : 'Non défini';
            const classKey = enrollment ? String(enrollment.classId) : 'unassigned';
            const className = cls ? cls.name : 'Non assigné';
            const level = cls ? cls.level : '';
            const studentName = student ? `${student.firstName} ${student.lastName}` : 'Inconnu';
            if (!currentDistribution[yearKey]) {
                currentDistribution[yearKey] = { yearName, classes: {} };
            }
            if (!currentDistribution[yearKey].classes[classKey]) {
                currentDistribution[yearKey].classes[classKey] = { className, level, count: 0, students: [] };
            }
            currentDistribution[yearKey].classes[classKey].count++;
            currentDistribution[yearKey].classes[classKey].students.push(studentName);
        }
        res.json({
            template: {
                _id: template._id,
                name: template.name,
                currentVersion: template.currentVersion || 1,
                createdBy: template.createdBy,
                updatedAt: template.updatedAt
            },
            currentVersionInfo: {
                version: template.currentVersion || 1,
                assignmentCount: currentVersionAssignments.length,
                distribution: currentDistribution
            },
            versionHistory,
            totalAssignments: assignments.length,
            versionsInUse: [...new Set(assignments.map(a => a.templateVersion))].sort((a, b) => b - a)
        });
    }
    catch (e) {
        console.error('[templatePropagation] Error fetching history:', e);
        res.status(500).json({ error: 'fetch_history_failed', message: e.message });
    }
});
