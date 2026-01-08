"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherTemplatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateChangeLog_1 = require("../models/TemplateChangeLog");
const TemplateSignature_1 = require("../models/TemplateSignature");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const StudentAcquiredSkill_1 = require("../models/StudentAcquiredSkill");
const auditLogger_1 = require("../utils/auditLogger");
const templateUtils_1 = require("../utils/templateUtils");
const cache_1 = require("../utils/cache");
exports.teacherTemplatesRouter = (0, express_1.Router)();
const normalizeLevel = (v) => String(v || '').trim().toUpperCase();
const getBlockLevel = (block) => {
    const direct = block?.props?.level;
    if (direct)
        return normalizeLevel(direct);
    const label = String(block?.props?.label || '').toUpperCase();
    if (/\bTPS\b/.test(label))
        return 'TPS';
    if (/\bPS\b/.test(label))
        return 'PS';
    if (/\bMS\b/.test(label))
        return 'MS';
    if (/\bGS\b/.test(label))
        return 'GS';
    if (/\bEB1\b/.test(label))
        return 'EB1';
    if (/\bKG1\b/.test(label))
        return 'KG1';
    if (/\bKG2\b/.test(label))
        return 'KG2';
    if (/\bKG3\b/.test(label))
        return 'KG3';
    return null;
};
const isLanguageAllowedForTeacher = (code, allowedLanguages, isProfPolyvalent) => {
    const c = String(code || '').toLowerCase();
    const langs = Array.isArray(allowedLanguages) ? allowedLanguages.map((v) => String(v || '').toLowerCase()) : [];
    if (isProfPolyvalent)
        return c === 'fr';
    if (langs.length === 0)
        return true;
    if (!c)
        return false;
    if (langs.includes(c))
        return true;
    if ((c === 'lb' || c === 'ar') && langs.includes('ar'))
        return true;
    if ((c === 'uk' || c === 'gb') && langs.includes('en'))
        return true;
    return false;
};
const findEnrollmentForStudent = async (studentId) => {
    const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
    let enrollment = null;
    if (activeYear) {
        enrollment = await Enrollment_1.Enrollment.findOne({
            studentId,
            schoolYearId: String(activeYear._id),
        }).lean();
    }
    if (!enrollment) {
        enrollment = await Enrollment_1.Enrollment.findOne({ studentId }).sort({ _id: -1 }).lean();
    }
    return { enrollment, activeYear };
};
/**
 * Check if the assignment is currently locked due to signatures.
 *
 * The locking logic is semester-aware:
 * - In Semester 1: Teachers cannot edit after the Sem1 signature is applied
 * - In Semester 2: Teachers can edit again (Sem1 signature is ignored) until the end_of_year signature
 * - After end_of_year signature: Teachers cannot edit permanently
 *
 * Note: We only consider signatures from the CURRENT school year.
 * Legacy signatures without signaturePeriodId are also checked for backwards compatibility.
 */
const isAssignmentSigned = async (assignmentId) => {
    // Get the active school year to determine current semester
    const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
    if (!activeYear) {
        // If no active year, fall back to checking for any signature
        const anySignature = await TemplateSignature_1.TemplateSignature.findOne({
            templateAssignmentId: assignmentId
        }).lean();
        return !!anySignature;
    }
    const activeSemester = activeYear.activeSemester || 1;
    const schoolYearId = String(activeYear._id);
    // Always check for end_of_year signature first - if it exists for current year, permanently locked
    const endOfYearPeriodId = `${schoolYearId}_end_of_year`;
    const endOfYearSignature = await TemplateSignature_1.TemplateSignature.findOne({
        templateAssignmentId: assignmentId,
        $or: [
            { signaturePeriodId: endOfYearPeriodId },
            // Legacy: signatures with type 'end_of_year' and matching schoolYearId
            { type: 'end_of_year', schoolYearId: schoolYearId },
            // Legacy: signatures with type 'end_of_year' and no schoolYearId (from before period tracking)
            { type: 'end_of_year', schoolYearId: { $exists: false } }
        ]
    }).lean();
    if (endOfYearSignature) {
        return true; // Permanently locked after end_of_year signature
    }
    // In Semester 1: Check for sem1 signature for the current year
    if (activeSemester === 1) {
        const sem1PeriodId = `${schoolYearId}_sem1`;
        const sem1Signature = await TemplateSignature_1.TemplateSignature.findOne({
            templateAssignmentId: assignmentId,
            $or: [
                { signaturePeriodId: sem1PeriodId },
                // Legacy: 'standard' signatures with matching schoolYearId
                { type: 'standard', schoolYearId: schoolYearId },
                // Legacy: 'standard' signatures with no schoolYearId (from before period tracking)
                { type: 'standard', schoolYearId: { $exists: false } }
            ]
        }).lean();
        return !!sem1Signature; // Locked in Sem1 if sem1 signature exists
    }
    // In Semester 2: Only locked if end_of_year exists (already checked above)
    // Sem1 signature does NOT lock the gradebook in Semester 2
    return false;
};
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
            const activeSchoolYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
            if (activeSchoolYear) {
                query.schoolYearId = String(activeSchoolYear._id);
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
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).select('firstName lastName avatarUrl dateOfBirth').lean();
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
        const templates = await Promise.all(templateIds.map(id => (0, cache_1.withCache)(`template-${id}`, () => GradebookTemplate_1.GradebookTemplate.findById(id).lean())));
        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => t && String(t._id) === assignment.templateId);
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            return {
                ...assignment,
                template,
                isMyWorkCompleted: !!myCompletion?.completed,
                isMyWorkCompletedSem1: !!myCompletion?.completedSem1,
                isMyWorkCompletedSem2: !!myCompletion?.completedSem2
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
        const template = await (0, cache_1.withCache)(`template-${assignment.templateId}`, () => GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean());
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        // Use centralized helper for versioning and data merging
        const versionedTemplate = (0, templateUtils_1.mergeAssignmentDataIntoTemplate)(template, assignment);
        if (assignment.data && versionedTemplate?.pages) {
            const normalizedData = { ...(assignment.data || {}) };
            const pages = Array.isArray(versionedTemplate.pages) ? versionedTemplate.pages : [];
            const blocksById = (0, templateUtils_1.buildBlocksById)(pages);
            pages.forEach((page, pageIdx) => {
                ;
                (page?.blocks || []).forEach((block, blockIdx) => {
                    if (['language_toggle', 'language_toggle_v2'].includes(block?.type)) {
                        const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                        // REQUIRE stable blockId - skip blocks without it
                        if (!blockId) {
                            console.warn(`[teacherTemplates] Block at page ${pageIdx}, index ${blockIdx} has no blockId. Skipping normalization.`);
                            return;
                        }
                        const keyStable = `language_toggle_${blockId}`;
                        const keyLegacy = `language_toggle_${pageIdx}_${blockIdx}`;
                        const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : [];
                        // Read from stable key first, fall back to legacy for migration
                        const savedRaw = Array.isArray(assignment.data?.[keyStable])
                            ? assignment.data[keyStable]
                            : Array.isArray(assignment.data?.[keyLegacy])
                                ? assignment.data[keyLegacy]
                                : null;
                        if (Array.isArray(savedRaw) && sourceItems.length > 0) {
                            const merged = sourceItems.map((src, i) => ({ ...src, active: !!savedRaw?.[i]?.active }));
                            normalizedData[keyStable] = merged;
                            // Remove legacy key if it exists (migration)
                            if (keyLegacy !== keyStable && normalizedData[keyLegacy]) {
                                delete normalizedData[keyLegacy];
                            }
                        }
                        else if (Array.isArray(savedRaw)) {
                            normalizedData[keyStable] = savedRaw;
                            // Remove legacy key if it exists (migration)
                            if (keyLegacy !== keyStable && normalizedData[keyLegacy]) {
                                delete normalizedData[keyLegacy];
                            }
                        }
                    }
                    if (block?.type !== 'table' || !block?.props?.expandedRows)
                        return;
                    const cells = block?.props?.cells || [];
                    const expandedLanguages = block?.props?.expandedLanguages || [];
                    const rowLanguages = block?.props?.rowLanguages || {};
                    const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
                    const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                    // REQUIRE stable blockId for tables
                    if (!blockId) {
                        console.warn(`[teacherTemplates] Table block at page ${pageIdx}, index ${blockIdx} has no blockId. Skipping normalization.`);
                        return;
                    }
                    for (let rowIdx = 0; rowIdx < (cells.length || 0); rowIdx++) {
                        const rowId = typeof rowIds?.[rowIdx] === 'string' && rowIds[rowIdx].trim() ? rowIds[rowIdx].trim() : null;
                        // REQUIRE stable rowId
                        if (!rowId) {
                            console.warn(`[teacherTemplates] Table row at page ${pageIdx}, block ${blockIdx}, row ${rowIdx} has no rowId. Skipping.`);
                            continue;
                        }
                        const keyStable = `table_${blockId}_row_${rowId}`;
                        const keyLegacy1 = `table_${pageIdx}_${blockIdx}_row_${rowIdx}`;
                        const keyLegacy2 = `table_${blockIdx}_row_${rowIdx}`;
                        const source = rowLanguages?.[rowIdx] || expandedLanguages;
                        if (!Array.isArray(source) || source.length === 0)
                            continue;
                        // Read from stable key first, fall back to legacy for migration
                        const saved = Array.isArray(assignment.data?.[keyStable])
                            ? assignment.data[keyStable]
                            : Array.isArray(assignment.data?.[keyLegacy1])
                                ? assignment.data[keyLegacy1]
                                : Array.isArray(assignment.data?.[keyLegacy2])
                                    ? assignment.data[keyLegacy2]
                                    : null;
                        if (!Array.isArray(saved))
                            continue;
                        const merged = source.map((src, i) => {
                            const active = !!saved?.[i]?.active;
                            return { ...src, active };
                        });
                        normalizedData[keyStable] = merged;
                        // Remove legacy keys if they exist (migration)
                        if (normalizedData[keyLegacy1])
                            delete normalizedData[keyLegacy1];
                        if (normalizedData[keyLegacy2])
                            delete normalizedData[keyLegacy2];
                    }
                });
            });
            assignment.data = normalizedData;
        }
        // Get the student
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        // Get student level and verify teacher class assignment
        let level = '';
        let className = '';
        let allowedLanguages = [];
        // Try to find enrollment in active year first
        const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
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
        // UNLESS the gradebook has been signed by a subadmin
        const isSigned = await isAssignmentSigned(assignmentId);
        const canEdit = !isSigned; // Teachers cannot edit signed gradebooks
        const isProfPolyvalent = (enrollment && enrollment.classId)
            ? (await TeacherClassAssignment_1.TeacherClassAssignment.findOne({ teacherId, classId: enrollment.classId }).lean())?.isProfPolyvalent
            : false;
        // Check my completion status
        const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
        const isMyWorkCompleted = !!myCompletion?.completed;
        const isMyWorkCompletedSem1 = !!myCompletion?.completedSem1;
        const isMyWorkCompletedSem2 = !!myCompletion?.completedSem2;
        // Get active semester from the active school year
        const activeSemester = activeYear?.activeSemester || 1;
        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level, className },
            canEdit,
            isSigned,
            allowedLanguages,
            isProfPolyvalent,
            isMyWorkCompleted,
            isMyWorkCompletedSem1,
            isMyWorkCompletedSem2,
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
        const { pageIndex, blockIndex, blockId: incomingBlockId, items } = req.body;
        if ((pageIndex === undefined || blockIndex === undefined) && !incomingBlockId) {
            return res.status(400).json({ error: 'missing_payload' });
        }
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'missing_payload' });
        }
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Check if the assignment has been signed - teachers cannot edit signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot edit a signed gradebook' });
        }
        // Get the template to verify the block
        const template = await (0, cache_1.withCache)(`template-${assignment.templateId}`, () => GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean());
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        const versionedTemplate = (0, templateUtils_1.getVersionedTemplate)(template, assignment.templateVersion);
        // Find the block
        let targetBlock = null;
        let actualPageIndex = pageIndex;
        let actualBlockIndex = blockIndex;
        if (incomingBlockId) {
            const blocksById = (0, templateUtils_1.buildBlocksById)(versionedTemplate.pages || []);
            const found = blocksById.get(incomingBlockId);
            if (found) {
                targetBlock = found.block;
                actualPageIndex = found.pageIdx;
                actualBlockIndex = found.blockIdx;
            }
        }
        if (!targetBlock && pageIndex !== undefined && blockIndex !== undefined) {
            targetBlock = versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex];
        }
        if (!targetBlock)
            return res.status(400).json({ error: 'block_not_found' });
        const { enrollment } = await findEnrollmentForStudent(assignment.studentId);
        if (!enrollment || !enrollment.classId) {
            return res.status(403).json({ error: 'student_not_enrolled' });
        }
        const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
        const studentLevel = normalizeLevel(classDoc?.level || '');
        // Verify the block is a language_toggle
        if (!['language_toggle', 'language_toggle_v2'].includes(targetBlock.type)) {
            return res.status(403).json({ error: 'can_only_edit_language_toggle' });
        }
        const blockLevel = getBlockLevel(targetBlock);
        if (blockLevel && studentLevel && blockLevel !== studentLevel) {
            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } });
        }
        const teacherClassAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({
            teacherId,
            classId: enrollment.classId,
        }).lean();
        if (!teacherClassAssignment) {
            return res.status(403).json({ error: 'not_assigned_to_class' });
        }
        const allowedLanguages = teacherClassAssignment?.languages || [];
        const isProfPolyvalent = !!teacherClassAssignment?.isProfPolyvalent;
        const sourceItems = Array.isArray(targetBlock?.props?.items) ? targetBlock.props.items : [];
        const sanitizedItems = sourceItems.length > 0
            ? sourceItems.map((src, i) => ({ ...src, active: !!items?.[i]?.active }))
            : items;
        const currentData = assignment.data || {};
        const blockId = typeof targetBlock?.props?.blockId === 'string' && targetBlock.props.blockId.trim() ? targetBlock.props.blockId.trim() : null;
        // REQUIRE stable blockId - no fallback to legacy format
        if (!blockId) {
            return res.status(400).json({
                error: 'block_missing_id',
                message: 'Block does not have a stable blockId. Please run the migration script to fix template data.',
                pageIndex: actualPageIndex,
                blockIndex: actualBlockIndex
            });
        }
        const keyStable = `language_toggle_${blockId}`;
        // Also check legacy key for reading previous data (for backwards compatibility during migration)
        const keyLegacy = `language_toggle_${actualPageIndex}_${actualBlockIndex}`;
        const previousItems = currentData[keyStable] || currentData[keyLegacy] || sourceItems || [];
        for (let i = 0; i < sanitizedItems.length; i++) {
            const newItem = sanitizedItems[i];
            const oldItem = previousItems[i] || sourceItems[i];
            if (newItem && oldItem && newItem.active !== oldItem.active) {
                const langCode = sourceItems?.[i]?.code;
                if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                    return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                }
            }
        }
        const before = currentData[keyStable] || currentData[keyLegacy];
        // Update assignment data (NOT the global template)
        // Use optimistic concurrency with expectedDataVersion if supplied
        const { expectedDataVersion } = req.body;
        const { generateChangeId } = require('../utils/changeId');
        const changeId = generateChangeId();
        const filter = { _id: assignmentId };
        if (typeof expectedDataVersion === 'number')
            filter.dataVersion = expectedDataVersion;
        const updated = await TemplateAssignment_1.TemplateAssignment.findOneAndUpdate(filter, {
            $set: {
                [`data.${keyStable}`]: sanitizedItems,
                status: assignment.status === 'draft' ? 'in_progress' : assignment.status
            },
            $inc: { dataVersion: 1 }
        }, { new: true });
        if (!updated) {
            // Conflict: return current assignment + dataVersion so client can fetch/merge
            const current = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
            return res.status(409).json({ error: 'conflict', message: 'data_version_mismatch', current });
        }
        // Log the change with metadata
        await TemplateChangeLog_1.TemplateChangeLog.create({
            templateAssignmentId: assignmentId,
            teacherId,
            changeType: 'language_toggle',
            pageIndex: actualPageIndex,
            blockIndex: actualBlockIndex,
            before: before || targetBlock.props.items,
            after: sanitizedItems,
            changeId,
            dataVersion: updated.dataVersion,
            userId: teacherId,
            timestamp: new Date(),
        });
        res.json({ success: true, assignment: updated, changeId, dataVersion: updated.dataVersion });
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
        const { semester } = req.body; // 1 or 2
        const targetSemester = semester === 2 ? 2 : 1;
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Check if the assignment has been signed - teachers cannot modify signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot modify a signed gradebook' });
        }
        // Update teacher completion
        let teacherCompletions = assignment.teacherCompletions || [];
        // Find existing entry or create new
        let entryIndex = teacherCompletions.findIndex((tc) => tc.teacherId === teacherId);
        if (entryIndex === -1) {
            teacherCompletions.push({ teacherId });
            entryIndex = teacherCompletions.length - 1;
        }
        // Update specific semester
        if (targetSemester === 1) {
            teacherCompletions[entryIndex].completedSem1 = true;
            teacherCompletions[entryIndex].completedAtSem1 = new Date();
            // Legacy/Backward compatibility
            teacherCompletions[entryIndex].completed = true;
            teacherCompletions[entryIndex].completedAt = new Date();
        }
        else {
            teacherCompletions[entryIndex].completedSem2 = true;
            teacherCompletions[entryIndex].completedAtSem2 = new Date();
        }
        // Check if all teachers have completed THIS semester
        const allCompletedSem = assignment.assignedTeachers.every((tid) => teacherCompletions.some((tc) => tc.teacherId === tid && (targetSemester === 1 ? tc.completedSem1 : tc.completedSem2)));
        const updateData = {
            teacherCompletions,
        };
        if (targetSemester === 1) {
            updateData.isCompletedSem1 = allCompletedSem;
            if (allCompletedSem)
                updateData.completedAtSem1 = new Date();
            // Legacy behavior: if sem1 is done, mark main as done/completed? 
            // Or should main status depend on both? 
            // For now, let's link legacy 'isCompleted' to Sem1 as it was the only semester before.
            updateData.isCompleted = allCompletedSem;
            updateData.completedAt = allCompletedSem ? new Date() : undefined;
            updateData.completedBy = allCompletedSem ? teacherId : undefined; // Approximate
            updateData.status = allCompletedSem ? 'completed' : 'in_progress';
        }
        else {
            updateData.isCompletedSem2 = allCompletedSem;
            if (allCompletedSem)
                updateData.completedAtSem2 = new Date();
            // Don't change main status for Sem2 yet, unless we want a new status
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, updateData, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: teacherId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                semester: targetSemester,
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
        const { semester } = req.body; // 1 or 2
        const targetSemester = semester === 2 ? 2 : 1;
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Check if the assignment has been signed - teachers cannot modify signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot modify a signed gradebook' });
        }
        // Update teacher completion
        let teacherCompletions = assignment.teacherCompletions || [];
        let entryIndex = teacherCompletions.findIndex((tc) => tc.teacherId === teacherId);
        if (entryIndex === -1) {
            teacherCompletions.push({ teacherId });
            entryIndex = teacherCompletions.length - 1;
        }
        if (targetSemester === 1) {
            teacherCompletions[entryIndex].completedSem1 = false;
            teacherCompletions[entryIndex].completedAtSem1 = null;
            // Legacy
            teacherCompletions[entryIndex].completed = false;
            teacherCompletions[entryIndex].completedAt = null;
        }
        else {
            teacherCompletions[entryIndex].completedSem2 = false;
            teacherCompletions[entryIndex].completedAtSem2 = null;
        }
        const updateData = {
            teacherCompletions,
        };
        if (targetSemester === 1) {
            updateData.isCompletedSem1 = false;
            updateData.completedAtSem1 = null;
            // Legacy
            updateData.isCompleted = false;
            updateData.completedAt = null;
            updateData.status = 'in_progress';
        }
        else {
            updateData.isCompletedSem2 = false;
            updateData.completedAtSem2 = null;
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, updateData, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: teacherId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                semester: targetSemester,
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
        }).select('-data').lean();
        const templateIds = Array.from(new Set(assignments.map(a => a.templateId).filter(Boolean)));
        const [templates, students] = await Promise.all([
            templateIds.length
                ? GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
                : [],
            studentIds.length
                ? Student_1.Student.find({ _id: { $in: studentIds } }).select('firstName lastName avatarUrl').lean()
                : [],
        ]);
        const templateMap = new Map();
        templates.forEach(t => {
            templateMap.set(String(t._id), t);
        });
        const studentMap = new Map();
        students.forEach(s => {
            studentMap.set(String(s._id), s);
        });
        const enriched = assignments.map(assignment => {
            const template = templateMap.get(assignment.templateId);
            const student = studentMap.get(assignment.studentId);
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            const isMyWorkCompleted = !!myCompletion?.completed;
            const isMyWorkCompletedSem1 = !!myCompletion?.completedSem1;
            const isMyWorkCompletedSem2 = !!myCompletion?.completedSem2;
            return {
                ...assignment,
                isCompleted: isMyWorkCompleted,
                isCompletedSem1: isMyWorkCompletedSem1,
                isCompletedSem2: isMyWorkCompletedSem2,
                isGlobalCompleted: assignment.isCompleted,
                template,
                student,
            };
        });
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
        }).select('-data').lean();
        const semester = Number(req.query.semester) === 2 ? 2 : 1;
        const templateIds = Array.from(new Set(assignments.map(a => a.templateId).filter(Boolean)));
        const templates = templateIds.length
            ? await Promise.all(templateIds.map(id => (0, cache_1.withCache)(`template-summary-${id}`, () => GradebookTemplate_1.GradebookTemplate.findById(id).select('name').lean())))
            : [];
        const templateMap = new Map();
        templates.forEach(t => {
            templateMap.set(String(t._id), t);
        });
        const templateStats = new Map();
        const isCompletedForSemester = (assignment) => {
            const myCompletion = assignment.teacherCompletions?.find((tc) => tc.teacherId === teacherId);
            if (!myCompletion)
                return false;
            if (semester === 2) {
                return !!myCompletion.completedSem2;
            }
            return !!myCompletion.completedSem1 || !!myCompletion.completed;
        };
        for (const assignment of assignments) {
            const key = assignment.templateId;
            if (!templateStats.has(key)) {
                const template = templateMap.get(assignment.templateId);
                templateStats.set(key, {
                    templateId: assignment.templateId,
                    templateName: template?.name || 'Unknown',
                    total: 0,
                    completed: 0,
                });
            }
            const stats = templateStats.get(key);
            stats.total++;
            if (isCompletedForSemester(assignment)) {
                stats.completed++;
            }
        }
        const totalAssignments = assignments.length;
        const completedAssignments = assignments.filter(a => isCompletedForSemester(a)).length;
        const completionPercentage = totalAssignments > 0
            ? Math.round((completedAssignments / totalAssignments) * 100)
            : 0;
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
        if (!data || typeof data !== 'object')
            return res.status(400).json({ error: 'missing_payload' });
        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' });
        }
        // Check if the assignment has been signed - teachers cannot edit signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot edit a signed gradebook' });
        }
        const { enrollment, activeYear } = await findEnrollmentForStudent(assignment.studentId);
        if (!enrollment || !enrollment.classId) {
            return res.status(403).json({ error: 'student_not_enrolled' });
        }
        const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
        const studentLevel = normalizeLevel(classDoc?.level || '');
        const teacherClassAssignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOne({
            teacherId,
            classId: enrollment.classId,
        }).lean();
        if (!teacherClassAssignment) {
            return res.status(403).json({ error: 'not_assigned_to_class' });
        }
        const allowedLanguages = teacherClassAssignment?.languages || [];
        const isProfPolyvalent = !!teacherClassAssignment?.isProfPolyvalent;
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        const versionedTemplate = (0, templateUtils_1.getVersionedTemplate)(template, assignment.templateVersion);
        const sanitizedPatch = {};
        const activeSemester = activeYear?.activeSemester || 1;
        const blocksById = (0, templateUtils_1.buildBlocksById)(versionedTemplate?.pages || []);
        for (const [key, value] of Object.entries(data)) {
            const langToggleMatch = key.match(/^language_toggle_(\d+)_(\d+)$/);
            if (langToggleMatch) {
                const pageIdx = parseInt(langToggleMatch[1]);
                const blockIdx = parseInt(langToggleMatch[2]);
                const page = versionedTemplate.pages?.[pageIdx];
                const block = page?.blocks?.[blockIdx];
                if (!page || !block || !['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    return res.status(400).json({ error: 'invalid_language_toggle_key', details: key });
                }
                const blockLevel = getBlockLevel(block);
                if (blockLevel && studentLevel && blockLevel !== studentLevel) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } });
                }
                const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : [];
                if (!Array.isArray(value))
                    return res.status(400).json({ error: 'invalid_language_toggle_payload', details: key });
                const nextItems = sourceItems.length > 0
                    ? sourceItems.map((src, i) => ({ ...src, active: !!value?.[i]?.active }))
                    : value;
                const previousItems = assignment.data?.[key] || sourceItems || [];
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i];
                    const oldItem = previousItems[i] || sourceItems[i];
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const langCode = sourceItems?.[i]?.code;
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                        }
                    }
                }
                const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                const stableKey = blockId ? `language_toggle_${blockId}` : key;
                sanitizedPatch[stableKey] = nextItems;
                continue;
            }
            const langToggleStableMatch = key.match(/^language_toggle_(.+)$/);
            if (langToggleStableMatch) {
                const blockId = String(langToggleStableMatch[1] || '').trim();
                const found = blockId ? blocksById.get(blockId) : null;
                const block = found?.block;
                if (!found || !block || !['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    return res.status(400).json({ error: 'invalid_language_toggle_key', details: key });
                }
                const blockLevel = getBlockLevel(block);
                if (blockLevel && studentLevel && blockLevel !== studentLevel) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } });
                }
                const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : [];
                if (!Array.isArray(value))
                    return res.status(400).json({ error: 'invalid_language_toggle_payload', details: key });
                const nextItems = sourceItems.length > 0
                    ? sourceItems.map((src, i) => ({ ...src, active: !!value?.[i]?.active }))
                    : value;
                const previousItems = assignment.data?.[key] || sourceItems || [];
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i];
                    const oldItem = previousItems[i] || sourceItems[i];
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const langCode = sourceItems?.[i]?.code;
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                        }
                    }
                }
                sanitizedPatch[key] = nextItems;
                continue;
            }
            const tableMatch = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/);
            if (tableMatch) {
                const pageIdx = parseInt(tableMatch[1]);
                const blockIdx = parseInt(tableMatch[2]);
                const rowIdx = parseInt(tableMatch[3]);
                const page = versionedTemplate.pages?.[pageIdx];
                const block = page?.blocks?.[blockIdx];
                if (!page || !block || block.type !== 'table' || !block?.props?.expandedRows) {
                    return res.status(400).json({ error: 'invalid_table_key', details: key });
                }
                const blockLevel = getBlockLevel(block);
                if (blockLevel && studentLevel && blockLevel !== studentLevel) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } });
                }
                const expandedLanguages = block?.props?.expandedLanguages || [];
                const rowLanguages = block?.props?.rowLanguages || {};
                const sourceItems = rowLanguages?.[rowIdx] || expandedLanguages;
                if (!Array.isArray(sourceItems))
                    return res.status(400).json({ error: 'invalid_table_source', details: key });
                if (!Array.isArray(value))
                    return res.status(400).json({ error: 'invalid_table_payload', details: key });
                const nextItems = sourceItems.map((src, i) => ({ ...src, active: !!value?.[i]?.active }));
                const previousItems = assignment.data?.[key] || sourceItems;
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i];
                    const oldItem = previousItems?.[i] || sourceItems[i];
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const itemLevel = normalizeLevel(sourceItems?.[i]?.level);
                        if (itemLevel && studentLevel && itemLevel !== studentLevel) {
                            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, itemLevel } });
                        }
                        const langCode = sourceItems?.[i]?.code;
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                        }
                    }
                }
                const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
                const rowId = typeof rowIds?.[rowIdx] === 'string' && rowIds[rowIdx].trim() ? rowIds[rowIdx].trim() : null;
                const stableKey = blockId && rowId ? `table_${blockId}_row_${rowId}` : key;
                sanitizedPatch[stableKey] = nextItems;
                continue;
            }
            const tableStableMatch = key.match(/^table_(.+)_row_(.+)$/);
            if (tableStableMatch) {
                const blockId = String(tableStableMatch[1] || '').trim();
                const rowId = String(tableStableMatch[2] || '').trim();
                const found = blockId ? blocksById.get(blockId) : null;
                const block = found?.block;
                if (!found || !block || block.type !== 'table' || !block?.props?.expandedRows) {
                    return res.status(400).json({ error: 'invalid_table_key', details: key });
                }
                const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
                const rowIdx = rowIds.findIndex((v) => typeof v === 'string' && v.trim() === rowId);
                if (rowIdx < 0)
                    return res.status(400).json({ error: 'invalid_table_key', details: key });
                const blockLevel = getBlockLevel(block);
                if (blockLevel && studentLevel && blockLevel !== studentLevel) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } });
                }
                const expandedLanguages = block?.props?.expandedLanguages || [];
                const rowLanguages = block?.props?.rowLanguages || {};
                const sourceItems = rowLanguages?.[rowIdx] || expandedLanguages;
                if (!Array.isArray(sourceItems))
                    return res.status(400).json({ error: 'invalid_table_source', details: key });
                if (!Array.isArray(value))
                    return res.status(400).json({ error: 'invalid_table_payload', details: key });
                const nextItems = sourceItems.map((src, i) => ({ ...src, active: !!value?.[i]?.active }));
                const previousItems = assignment.data?.[key] || sourceItems;
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i];
                    const oldItem = previousItems?.[i] || sourceItems[i];
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const itemLevel = normalizeLevel(sourceItems?.[i]?.level);
                        if (itemLevel && studentLevel && itemLevel !== studentLevel) {
                            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, itemLevel } });
                        }
                        const langCode = sourceItems?.[i]?.code;
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode });
                        }
                    }
                }
                sanitizedPatch[key] = nextItems;
                continue;
            }
            const dropdownNumMatch = key.match(/^dropdown_(\d+)$/);
            if (dropdownNumMatch) {
                const dropdownNumber = parseInt(dropdownNumMatch[1]);
                const dropdownBlocks = [];
                (versionedTemplate.pages || []).forEach((p) => {
                    ;
                    (p?.blocks || []).forEach((b) => {
                        if (b?.type === 'dropdown' && b?.props?.dropdownNumber === dropdownNumber)
                            dropdownBlocks.push(b);
                    });
                });
                const dropdownBlock = dropdownBlocks.length === 1 ? dropdownBlocks[0] : null;
                if (dropdownBlock) {
                    const allowedLevels = Array.isArray(dropdownBlock?.props?.levels) ? dropdownBlock.props.levels.map((v) => normalizeLevel(v)) : [];
                    if (allowedLevels.length > 0 && (!studentLevel || !allowedLevels.includes(studentLevel))) {
                        return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, allowedLevels } });
                    }
                    const allowedSemesters = Array.isArray(dropdownBlock?.props?.semesters) ? dropdownBlock.props.semesters : [];
                    if (allowedSemesters.length > 0 && !allowedSemesters.includes(activeSemester)) {
                        return res.status(403).json({ error: 'semester_mismatch', details: { activeSemester, allowedSemesters } });
                    }
                }
                sanitizedPatch[key] = value;
                continue;
            }
            const variableNameBlocks = [];
            (versionedTemplate.pages || []).forEach((p) => {
                ;
                (p?.blocks || []).forEach((b) => {
                    if (b?.type === 'dropdown' && b?.props?.variableName === key)
                        variableNameBlocks.push(b);
                });
            });
            const variableBlock = variableNameBlocks.length === 1 ? variableNameBlocks[0] : null;
            if (variableBlock) {
                const allowedLevels = Array.isArray(variableBlock?.props?.levels) ? variableBlock.props.levels.map((v) => normalizeLevel(v)) : [];
                if (allowedLevels.length > 0 && (!studentLevel || !allowedLevels.includes(studentLevel))) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, allowedLevels } });
                }
                const allowedSemesters = Array.isArray(variableBlock?.props?.semesters) ? variableBlock.props.semesters : [];
                if (allowedSemesters.length > 0 && !allowedSemesters.includes(activeSemester)) {
                    return res.status(403).json({ error: 'semester_mismatch', details: { activeSemester, allowedSemesters } });
                }
            }
            sanitizedPatch[key] = value;
        }
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            $set: { data: { ...(assignment.data || {}), ...sanitizedPatch } },
            status: assignment.status === 'draft' ? 'in_progress' : assignment.status,
        }, { new: true });
        // Sync promotion status to Enrollment if present
        if (sanitizedPatch.promotions && Array.isArray(sanitizedPatch.promotions) && sanitizedPatch.promotions.length > 0) {
            const lastPromo = sanitizedPatch.promotions[sanitizedPatch.promotions.length - 1];
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
        // SNAPSHOT LOGIC: Save acquired skills to reliable storage
        // Check if any updated keys relate to expanded tables (format: table_PAGE_BLOCK_row_ROW)
        if (Object.keys(sanitizedPatch).some(k => k.startsWith('table_'))) {
            try {
                if (template) {
                    const blocksByIdForSnapshot = (0, templateUtils_1.buildBlocksById)(versionedTemplate?.pages || []);
                    for (const [key, value] of Object.entries(sanitizedPatch)) {
                        // Key format: table_{pageIdx}_{blockIdx}_row_{rowIdx}
                        // Regex to parse: table_(\d+)_(\d+)_row_(\d+)
                        if (!Array.isArray(value))
                            continue;
                        let cellText = undefined;
                        let sourceId = undefined;
                        const legacyMatch = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/);
                        if (legacyMatch) {
                            const pageIdx = parseInt(legacyMatch[1]);
                            const blockIdx = parseInt(legacyMatch[2]);
                            const rowIdx = parseInt(legacyMatch[3]);
                            const page = versionedTemplate.pages?.[pageIdx];
                            const block = page?.blocks?.[blockIdx];
                            const row = block?.props?.cells?.[rowIdx];
                            cellText = row?.[0]?.text;
                            const rowId = Array.isArray(block?.props?.rowIds) ? block.props.rowIds[rowIdx] : undefined;
                            sourceId = typeof rowId === 'string' && rowId.trim() ? rowId : undefined;
                        }
                        else {
                            const stableMatch = key.match(/^table_(.+)_row_(.+)$/);
                            if (!stableMatch)
                                continue;
                            const blockId = String(stableMatch[1] || '').trim();
                            const rowId = String(stableMatch[2] || '').trim();
                            if (!blockId || !rowId)
                                continue;
                            const found = blocksByIdForSnapshot.get(blockId);
                            const block = found?.block;
                            if (!block || block.type !== 'table' || !block?.props?.expandedRows)
                                continue;
                            const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
                            const rowIdx = rowIds.findIndex((v) => typeof v === 'string' && v.trim() === rowId);
                            if (rowIdx < 0)
                                continue;
                            const row = block?.props?.cells?.[rowIdx];
                            cellText = row?.[0]?.text;
                            sourceId = rowId;
                        }
                        if (!cellText)
                            continue;
                        const activeLangs = value
                            .filter((v) => v && v.active)
                            .map((v) => v.code);
                        const updateDoc = {
                            studentId: assignment.studentId,
                            templateId: assignment.templateId,
                            assignmentId: assignment._id,
                            skillText: cellText,
                            languages: activeLangs,
                            sourceKey: key,
                            sourceId,
                            recordedAt: new Date(),
                            recordedBy: teacherId
                        };
                        if (sourceId) {
                            let updated = await StudentAcquiredSkill_1.StudentAcquiredSkill.findOneAndUpdate({
                                studentId: assignment.studentId,
                                templateId: assignment.templateId,
                                sourceId
                            }, updateDoc, { new: true });
                            if (!updated) {
                                updated = await StudentAcquiredSkill_1.StudentAcquiredSkill.findOneAndUpdate({
                                    studentId: assignment.studentId,
                                    templateId: assignment.templateId,
                                    assignmentId: assignment._id,
                                    skillText: cellText
                                }, updateDoc, { new: true });
                            }
                            if (!updated) {
                                await StudentAcquiredSkill_1.StudentAcquiredSkill.findOneAndUpdate({
                                    studentId: assignment.studentId,
                                    templateId: assignment.templateId,
                                    sourceId
                                }, updateDoc, { upsert: true });
                            }
                        }
                        else {
                            await StudentAcquiredSkill_1.StudentAcquiredSkill.findOneAndUpdate({
                                studentId: assignment.studentId,
                                templateId: assignment.templateId,
                                sourceKey: key
                            }, updateDoc, { upsert: true });
                        }
                    }
                }
            }
            catch (err) {
                console.error('Error saving skill snapshot:', err);
                // Do not fail the request if snapshot fails, just log it
            }
        }
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
