"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherTemplatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateChangeLog_1 = require("../models/TemplateChangeLog");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const auditLogger_1 = require("../utils/auditLogger");
exports.teacherTemplatesRouter = (0, express_1.Router)();
// Teacher: Get classes assigned to logged-in teacher
exports.teacherTemplatesRouter.get('/classes', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { schoolYearId } = req.query;
        const assignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ teacherId }).lean();
        const classIds = assignments.map(a => a.classId);
        const query = { _id: { $in: classIds } };
        if (schoolYearId) {
            query.schoolYearId = schoolYearId;
        }
        else {
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (activeYear) {
                query.schoolYearId = String(activeYear._id);
            }
        }
        const classes = await Class_1.ClassModel.find(query).lean();
        res.json(classes);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Get students in assigned class
exports.teacherTemplatesRouter.get('/classes/:classId/students', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { classId } = req.params;
        // Verify teacher is assigned to this class
        const assignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({ teacherId, classId }).lean();
        if (!assignment)
            return res.status(403).json({ error: 'not_assigned_to_class' });
        // Get students in class
        const enrollments = await Enrollment_1.Enrollment.find({ classId }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
        res.json(students);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Get templates for a student
exports.teacherTemplatesRouter.get('/students/:studentId/templates', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { studentId } = req.params;
        // Get template assignments where this teacher is assigned
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId,
            assignedTeachers: teacherId,
        }).lean();
        // Fetch template details
        const templateIds = assignments.map(a => a.templateId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId);
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            return {
                ...assignment,
                template,
                isMyWorkCompleted: !!myCompletion?.completed
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Get specific template assignment for editing
exports.teacherTemplatesRouter.get('/template-assignments/:assignmentId', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Get the template
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        // Get the specific version if available in history, otherwise use current
        let versionedTemplate = template;
        if (assignment.templateVersion && assignment.templateVersion !== template.currentVersion) {
            const versionData = template.versionHistory?.find(v => v.version === assignment.templateVersion);
            if (versionData) {
                // Use the versioned data but keep the template ID and metadata
                versionedTemplate = {
                    ...template,
                    pages: versionData.pages,
                    variables: versionData.variables || {},
                    watermark: versionData.watermark,
                    _versionUsed: assignment.templateVersion,
                    _isOldVersion: assignment.templateVersion < (template.currentVersion || 1)
                };
            }
        }
        // Merge assignment data into template (language toggles, dropdowns, etc.)
        if (assignment.data) {
            versionedTemplate = JSON.parse(JSON.stringify(versionedTemplate));
            for (const [key, value] of Object.entries(assignment.data)) {
                if (key.startsWith('language_toggle_')) {
                    const parts = key.split('_');
                    const pageIdx = parseInt(parts[2]);
                    const blockIdx = parseInt(parts[3]);
                    if (versionedTemplate.pages[pageIdx]?.blocks[blockIdx]?.type === 'language_toggle') {
                        versionedTemplate.pages[pageIdx].blocks[blockIdx].props.items = value;
                    }
                }
            }
        }
        // Get the student
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        // Get student level and verify teacher class assignment
        let level = '';
        let className = '';
        let allowedLanguages = [];
        // Try to find enrollment in active year first
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        let enrollment = null;
        if (activeYear) {
            enrollment = await Enrollment_1.Enrollment.findOne({
                studentId: assignment.studentId,
                schoolYearId: String(activeYear._id)
            }).lean();
        }
        // Fallback to most recent enrollment if not found in active year
        if (!enrollment) {
            enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId })
                .sort({ _id: -1 })
                .lean();
        }
        if (!enrollment) {
            return res.status(403).json({ error: 'student_not_enrolled' });
        }
        if (enrollment && enrollment.classId) {
            const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
            if (classDoc) {
                level = classDoc.level || '';
                className = classDoc.name;
            }
            // Strict check: Teacher MUST be assigned to this class
            const teacherClassAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({
                teacherId,
                classId: enrollment.classId
            }).lean();
            if (!teacherClassAssignment) {
                return res.status(403).json({ error: 'not_assigned_to_class' });
            }
            allowedLanguages = teacherClassAssignment.languages || [];
        }
        // Determine if teacher can edit
        // Since we enforce class assignment above, if they reach here, they can edit.
        const canEdit = true;
        const isProfPolyvalent = (enrollment && enrollment.classId)
            ? (await TeacherClassAssignment_1.TeacherClassAssignment.findOne({ teacherId, classId: enrollment.classId }).lean())?.isProfPolyvalent
            : false;
        // Check my completion status
        const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
        const isMyWorkCompleted = !!myCompletion?.completed;
        // Get active semester from the active school year
        const activeSemester = activeYear?.activeSemester || 1;
        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level, className },
            canEdit,
            allowedLanguages,
            isProfPolyvalent,
            isMyWorkCompleted,
            activeSemester
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Edit only language_toggle in template
exports.teacherTemplatesRouter.patch('/template-assignments/:assignmentId/language-toggle', (0, auth_1.requireAuth)(['TEACHER']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { assignmentId } = req.params;
        const { pageIndex, blockIndex, items } = req.body;
        if (pageIndex === undefined || blockIndex === undefined || !items) {
            return res.status(400).json({ error: 'missing_payload' });
        }
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Get the template to verify the block
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        // Verify the block is a language_toggle
        const page = template.pages[pageIndex];
        if (!page)
            return res.status(400).json({ error: 'invalid_page_index' });
        const block = page.blocks[blockIndex];
        if (!block)
            return res.status(400).json({ error: 'invalid_block_index' });
        if (block.type !== 'language_toggle') {
            return res.status(403).json({ error: 'can_only_edit_language_toggle' });
        }
        // Verify language permissions
        const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        if (enrollment && enrollment.classId) {
            const teacherClassAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({
                teacherId,
                classId: enrollment.classId
            }).lean();
            const allowedLanguages = teacherClassAssignment?.languages || [];
            if (allowedLanguages.length > 0) {
                const currentData = assignment.data || {};
                const key = `language_toggle_${pageIndex}_${blockIndex}`;
                // Get previous state: either from assignment data or default from block props
                const previousItems = currentData[key] || block.props.items || [];
                // Check each item for changes
                for (let i = 0; i < items.length; i++) {
                    const newItem = items[i];
                    const oldItem = previousItems[i] || (block.props.items && block.props.items[i]);
                    // If state changed
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        // Check if language is allowed
                        // Use code from block props to be safe (source of truth)
                        const langCode = block.props.items && block.props.items[i]?.code;
                        if (langCode && !allowedLanguages.includes(langCode)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                        }
                    }
                }
            }
        }
        // Store language toggle state in assignment data with unique key
        const key = `language_toggle_${pageIndex}_${blockIndex}`;
        const currentData = assignment.data || {};
        const before = currentData[key];
        // Update assignment data (NOT the global template)
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            $set: {
                [`data.${key}`]: items,
                status: assignment.status === 'draft' ? 'in_progress' : assignment.status
            }
        }, { new: true });
        // Log the change
        await TemplateChangeLog_1.TemplateChangeLog.create({
            templateAssignmentId: assignmentId,
            teacherId,
            changeType: 'language_toggle',
            pageIndex,
            blockIndex,
            before: before || block.props.items,
            after: items,
            timestamp: new Date(),
        });
        res.json({ success: true, assignment: updated });
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Teacher: Mark assignment as done
exports.teacherTemplatesRouter.post('/templates/:assignmentId/mark-done', (0, auth_1.requireAuth)(['TEACHER']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Update teacher completion
        let teacherCompletions = assignment.teacherCompletions || [];
        // Remove existing entry for this teacher if any
        teacherCompletions = teacherCompletions.filter((tc) => tc.teacherId !== teacherId);
        // Add new entry
        teacherCompletions.push({
            teacherId,
            completed: true,
            completedAt: new Date()
        });
        // Check if all teachers have completed
        const allCompleted = assignment.assignedTeachers.every((tid) => teacherCompletions.some((tc) => tc.teacherId === tid && tc.completed));
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            teacherCompletions,
            status: allCompleted ? 'completed' : 'in_progress',
            isCompleted: allCompleted,
            completedAt: allCompleted ? new Date() : undefined,
            completedBy: allCompleted ? teacherId : undefined,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: teacherId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Teacher: Unmark assignment as done
exports.teacherTemplatesRouter.post('/templates/:assignmentId/unmark-done', (0, auth_1.requireAuth)(['TEACHER']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Update teacher completion
        let teacherCompletions = assignment.teacherCompletions || [];
        // Remove existing entry for this teacher if any
        teacherCompletions = teacherCompletions.filter((tc) => tc.teacherId !== teacherId);
        // Add new entry (completed: false)
        teacherCompletions.push({
            teacherId,
            completed: false,
            completedAt: new Date()
        });
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            teacherCompletions,
            status: 'in_progress',
            isCompleted: false,
            completedAt: null,
            completedBy: null,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: teacherId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Teacher: Get all template assignments for a class with completion stats
exports.teacherTemplatesRouter.get('/classes/:classId/assignments', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { classId } = req.params;
        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({ teacherId, classId }).lean();
        if (!classAssignment)
            return res.status(403).json({ error: 'not_assigned_to_class' });
        // Get students in class
        const enrollments = await Enrollment_1.Enrollment.find({ classId }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).lean();
        // Enrich with template and student data
        const enriched = await Promise.all(assignments.map(async (assignment) => {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            // Calculate "isCompleted" for THIS teacher
            // The global assignment.isCompleted is only true if ALL teachers are done
            // But for the list view, we want to show if THIS teacher is done
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            const isMyWorkCompleted = !!myCompletion?.completed;
            return {
                ...assignment,
                isCompleted: isMyWorkCompleted, // Override for frontend
                isGlobalCompleted: assignment.isCompleted, // Keep original just in case
                template,
                student,
            };
        }));
        res.json(enriched);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Get completion statistics for a class
exports.teacherTemplatesRouter.get('/classes/:classId/completion-stats', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { classId } = req.params;
        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({ teacherId, classId }).lean();
        if (!classAssignment)
            return res.status(403).json({ error: 'not_assigned_to_class' });
        // Get students in class
        const enrollments = await Enrollment_1.Enrollment.find({ classId }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).lean();
        // Calculate stats per template
        const templateStats = new Map();
        for (const assignment of assignments) {
            const key = assignment.templateId;
            if (!templateStats.has(key)) {
                const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
                templateStats.set(key, {
                    templateId: assignment.templateId,
                    templateName: template?.name || 'Unknown',
                    total: 0,
                    completed: 0,
                });
            }
            const stats = templateStats.get(key);
            stats.total++;
            // Check specific teacher completion
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            if (myCompletion?.completed) {
                stats.completed++;
            }
        }
        // Calculate overall stats
        const totalAssignments = assignments.length;
        // Count completions for this teacher
        const completedAssignments = assignments.filter(a => {
            const myCompletion = a.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            return myCompletion?.completed;
        }).length;
        const completionPercentage = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0;
        res.json({
            totalAssignments,
            completedAssignments,
            completionPercentage,
            byTemplate: Array.from(templateStats.values()),
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Teacher: Update assignment data (e.g. dropdowns)
exports.teacherTemplatesRouter.patch('/template-assignments/:assignmentId/data', (0, auth_1.requireAuth)(['TEACHER']), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const { assignmentId } = req.params;
        const { data } = req.body;
        if (!data)
            return res.status(400).json({ error: 'missing_payload' });
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            $set: { data: { ...assignment.data, ...data } },
            status: assignment.status === 'draft' ? 'in_progress' : assignment.status
        }, { new: true });
        // Sync promotion status to Enrollment if present
        if (data.promotions && Array.isArray(data.promotions) && data.promotions.length > 0) {
            const lastPromo = data.promotions[data.promotions.length - 1];
            // Map the unstructured decision to our enum
            // Assuming lastPromo has a 'decision' or similar field, or we infer it.
            // Since I don't know the exact structure of 'promotions' in the JSON blob, 
            // I will assume it might have a 'decision' field. 
            // If not, I'll default to 'promoted' if it exists.
            let status = 'pending';
            const decision = lastPromo.decision?.toLowerCase() || '';
            if (decision.includes('admis') || decision.includes('promoted'))
                status = 'promoted';
            else if (decision.includes('maintien') || decision.includes('retained'))
                status = 'retained';
            else if (decision.includes('essai') || decision.includes('conditional'))
                status = 'conditional';
            else if (decision.includes('ete') || decision.includes('summer'))
                status = 'summer_school';
            else if (decision.includes('quitte') || decision.includes('left'))
                status = 'left';
            else
                status = 'promoted'; // Default if entry exists but no clear keyword
            await Enrollment_1.Enrollment.findOneAndUpdate({ studentId: assignment.studentId, status: 'active' }, // Only update active enrollment
            { $set: { promotionStatus: status } });
        }
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
