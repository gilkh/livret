"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminTemplatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateChangeLog_1 = require("../models/TemplateChangeLog");
const TemplateSignature_1 = require("../models/TemplateSignature");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
const Enrollment_1 = require("../models/Enrollment");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const RoleScope_1 = require("../models/RoleScope");
const SchoolYear_1 = require("../models/SchoolYear");
const auditLogger_1 = require("../utils/auditLogger");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const dir = path_1.default.join(__dirname, '../../public/uploads/signatures');
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const userId = req.user.userId;
        const ext = path_1.default.extname(file.originalname);
        cb(null, `signature-${userId}-${Date.now()}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
exports.subAdminTemplatesRouter = (0, express_1.Router)();
// Sub-admin: Get signature
exports.subAdminTemplatesRouter.get('/signature', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        let user = await User_1.User.findById(subAdminId).lean();
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
        }
        if (!user || !user.signatureUrl) {
            return res.status(404).json({ error: 'no_signature' });
        }
        res.json({ signatureUrl: user.signatureUrl });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Upload signature
exports.subAdminTemplatesRouter.post('/signature/upload', (0, auth_1.requireAuth)(['SUBADMIN']), upload.single('file'), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        if (!req.file) {
            return res.status(400).json({ error: 'no_file' });
        }
        const signatureUrl = `/uploads/signatures/${req.file.filename}`;
        // Delete old signature file if exists
        let user = await User_1.User.findById(subAdminId).lean();
        let isOutlook = false;
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
            isOutlook = true;
        }
        if (user?.signatureUrl) {
            const oldPath = path_1.default.join(__dirname, '../../public', user.signatureUrl);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        // Update user with new signature URL
        if (isOutlook) {
            await OutlookUser_1.OutlookUser.findByIdAndUpdate(subAdminId, { signatureUrl });
        }
        else {
            await User_1.User.findByIdAndUpdate(subAdminId, { signatureUrl });
        }
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'UPLOAD_SIGNATURE',
            details: { signatureUrl },
            req,
        });
        res.json({ signatureUrl: `http://localhost:4000${signatureUrl}` });
    }
    catch (e) {
        res.status(500).json({ error: 'upload_failed', message: e.message });
    }
});
// Sub-admin: Delete signature
exports.subAdminTemplatesRouter.delete('/signature', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        let user = await User_1.User.findById(subAdminId).lean();
        let isOutlook = false;
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
            isOutlook = true;
        }
        if (user?.signatureUrl) {
            const oldPath = path_1.default.join(__dirname, '../../public', user.signatureUrl);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        if (isOutlook) {
            await OutlookUser_1.OutlookUser.findByIdAndUpdate(subAdminId, { $unset: { signatureUrl: 1 } });
        }
        else {
            await User_1.User.findByIdAndUpdate(subAdminId, { $unset: { signatureUrl: 1 } });
        }
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'DELETE_SIGNATURE',
            details: {},
            req,
        });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Sub-admin: Get classes with pending signatures
exports.subAdminTemplatesRouter.get('/classes', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ teacherId: { $in: teacherIds } }).lean();
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        // Check RoleScope for level assignments
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({ level: { $in: roleScope.levels } }).lean();
            const levelClassIds = levelClasses.map(c => String(c._id));
            relevantClassIds = [...new Set([...relevantClassIds, ...levelClassIds])];
        }
        // Get students in these classes
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: relevantClassIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Get template assignments for these students
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean();
        // Get unique class IDs and their details
        const classIds = [...new Set(enrollments.map(e => e.classId))];
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        // For each class, count pending signatures
        const classesWithStats = await Promise.all(classes.map(async (cls) => {
            const classEnrollments = enrollments.filter(e => String(e.classId) === String(cls._id));
            const classStudentIds = classEnrollments.map(e => e.studentId);
            const classAssignments = templateAssignments.filter(a => classStudentIds.includes(a.studentId));
            const assignmentIds = classAssignments.map(a => String(a._id));
            const signatures = await TemplateSignature_1.TemplateSignature.find({
                templateAssignmentId: { $in: assignmentIds }
            }).lean();
            const signedCount = signatures.length;
            const totalCount = classAssignments.length;
            return {
                ...cls,
                pendingSignatures: totalCount - signedCount,
                totalAssignments: totalCount,
                signedAssignments: signedCount,
            };
        }));
        res.json(classesWithStats);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get assigned teachers
exports.subAdminTemplatesRouter.get('/teachers', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        res.json(teachers);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get template changes by a teacher
exports.subAdminTemplatesRouter.get('/teachers/:teacherId/changes', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { teacherId } = req.params;
        // Verify this teacher is assigned to this sub-admin
        const assignment = await SubAdminAssignment_1.SubAdminAssignment.findOne({ subAdminId, teacherId }).lean();
        if (!assignment)
            return res.status(403).json({ error: 'not_assigned_to_teacher' });
        // Get all template assignments for this teacher
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({ assignedTeachers: teacherId }).lean();
        const assignmentIds = templateAssignments.map(a => String(a._id));
        // Get all changes for these assignments
        const changes = await TemplateChangeLog_1.TemplateChangeLog.find({
            templateAssignmentId: { $in: assignmentIds },
            teacherId,
        }).sort({ timestamp: -1 }).lean();
        // Enrich with template and student data
        const enrichedChanges = await Promise.all(changes.map(async (change) => {
            const templateAssignment = templateAssignments.find(a => String(a._id) === change.templateAssignmentId);
            if (!templateAssignment)
                return change;
            const template = await GradebookTemplate_1.GradebookTemplate.findById(templateAssignment.templateId).lean();
            const student = await Student_1.Student.findById(templateAssignment.studentId).lean();
            return {
                ...change,
                templateName: template?.name,
                studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
            };
        }));
        res.json(enrichedChanges);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get pending signatures (templates awaiting signature)
exports.subAdminTemplatesRouter.get('/pending-signatures', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ teacherId: { $in: teacherIds } }).lean();
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        // Check RoleScope for level assignments
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({ level: { $in: roleScope.levels } }).lean();
            const levelClassIds = levelClasses.map(c => String(c._id));
            classIds = [...new Set([...classIds, ...levelClassIds])];
        }
        // Get students in these classes
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: classIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Get ALL template assignments for these students (including signed ones)
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed', 'signed'] },
        }).lean();
        // Get signature information for all assignments
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean();
        const signatureMap = new Map(signatures.map(s => [s.templateAssignmentId, s]));
        // Enrich with template and student data, including signature info
        const enrichedAssignments = await Promise.all(templateAssignments.map(async (assignment) => {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            const signature = signatureMap.get(String(assignment._id));
            return {
                ...assignment,
                template,
                student,
                signature,
            };
        }));
        res.json(enrichedAssignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Promote student
exports.subAdminTemplatesRouter.post('/templates/:templateAssignmentId/promote', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        const { nextLevel } = req.body;
        if (!nextLevel)
            return res.status(400).json({ error: 'missing_level' });
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        if (!enrollmentCheck)
            return res.status(403).json({ error: 'student_not_enrolled' });
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean();
        const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: classTeacherIds },
        }).lean();
        let authorized = subAdminAssignments.length > 0;
        if (!authorized) {
            // Check RoleScope
            const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
            if (roleScope?.levels?.length) {
                const cls = await Class_1.ClassModel.findById(enrollmentCheck.classId).lean();
                if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        const student = await Student_1.Student.findById(assignment.studentId);
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        // Get current enrollment to find school year
        const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        let yearName = new Date().getFullYear().toString();
        let currentLevel = student.level || '';
        let currentSchoolYearId = '';
        if (enrollment) {
            const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
            if (cls) {
                currentLevel = cls.level || '';
                currentSchoolYearId = cls.schoolYearId;
                const sy = await SchoolYear_1.SchoolYear.findById(cls.schoolYearId).lean();
                if (sy)
                    yearName = sy.name;
            }
            // Remove from class
            await Enrollment_1.Enrollment.findByIdAndDelete(enrollment._id);
        }
        // Find next school year
        let nextSchoolYearId = '';
        if (currentSchoolYearId) {
            const currentSy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
            if (currentSy) {
                // Strategy 1: Name matching
                if (currentSy.name) {
                    const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/);
                    if (match) {
                        const startYear = parseInt(match[1]);
                        const separator = match[2];
                        const endYear = parseInt(match[3]);
                        const nextName = `${startYear + 1}${separator}${endYear + 1}`;
                        const nextSy = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
                        if (nextSy) {
                            nextSchoolYearId = String(nextSy._id);
                        }
                    }
                }
                // Strategy 2: Date based (if name matching failed)
                if (!nextSchoolYearId && currentSy.endDate) {
                    // Find a school year that starts after this one ends (within 6 months)
                    const nextSy = await SchoolYear_1.SchoolYear.findOne({
                        startDate: { $gte: currentSy.endDate },
                        active: true
                    }).sort({ startDate: 1 }).lean();
                    if (nextSy) {
                        nextSchoolYearId = String(nextSy._id);
                    }
                }
            }
        }
        // Update student level
        student.level = nextLevel;
        if (nextSchoolYearId) {
            student.schoolYearId = nextSchoolYearId;
        }
        await student.save();
        // Record promotion in assignment data
        const promotionData = {
            from: currentLevel,
            to: nextLevel,
            date: new Date(),
            year: yearName
        };
        // Use findById and save to handle Mixed type safely
        const assignmentDoc = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
        if (assignmentDoc) {
            const data = assignmentDoc.data || {};
            const promotions = Array.isArray(data.promotions) ? data.promotions : [];
            promotions.push(promotionData);
            data.promotions = promotions;
            assignmentDoc.data = data;
            assignmentDoc.markModified('data');
            await assignmentDoc.save();
        }
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'PROMOTE_STUDENT',
            details: {
                studentId: student._id,
                from: currentLevel,
                to: nextLevel,
                templateAssignmentId
            },
            req,
        });
        // Return updated data to avoid client reload issues
        const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        const updatedStudent = await Student_1.Student.findById(student._id).lean();
        // Re-fetch template to ensure consistency (though it shouldn't change)
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const versionedTemplate = JSON.parse(JSON.stringify(template));
        if (updatedAssignment && updatedAssignment.data) {
            for (const [key, value] of Object.entries(updatedAssignment.data)) {
                if (key.startsWith('language_toggle_')) {
                    const [, , pageIdx, blockIdx] = key.split('_');
                    const pageIndex = parseInt(pageIdx);
                    const blockIndex = parseInt(blockIdx);
                    if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                        versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value;
                    }
                }
            }
        }
        res.json({
            ok: true,
            assignment: updatedAssignment,
            student: updatedStudent,
            template: versionedTemplate
        });
    }
    catch (e) {
        console.error('Promotion error:', e);
        res.status(500).json({ error: 'promotion_failed', message: e.message });
    }
});
// Sub-admin: Sign a template
exports.subAdminTemplatesRouter.post('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        let authorized = false;
        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean();
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
            const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean();
            authorized = subAdminAssignments.length > 0;
            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
                if (roleScope?.levels?.length) {
                    const cls = await Class_1.ClassModel.findById(enrollmentCheck.classId).lean();
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true;
                    }
                }
            }
        }
        else {
            // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean();
                if (subAdminAssignments.length > 0) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Check if already signed
        const existing = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId }).lean();
        if (existing) {
            return res.status(400).json({ error: 'already_signed' });
        }
        // Create signature
        const signature = await TemplateSignature_1.TemplateSignature.create({
            templateAssignmentId,
            subAdminId,
            signedAt: new Date(),
            status: 'signed',
        });
        // Update assignment status
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'signed' });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'SIGN_TEMPLATE',
            details: {
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(signature);
    }
    catch (e) {
        res.status(500).json({ error: 'sign_failed', message: e.message });
    }
});
// Sub-admin: Unsign a template
exports.subAdminTemplatesRouter.delete('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        let authorized = false;
        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean();
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
            const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean();
            authorized = subAdminAssignments.length > 0;
            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
                if (roleScope?.levels?.length) {
                    const cls = await Class_1.ClassModel.findById(enrollmentCheck.classId).lean();
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true;
                    }
                }
            }
        }
        else {
            // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean();
                if (subAdminAssignments.length > 0) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Check if signed
        const existing = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId }).lean();
        if (!existing) {
            return res.status(400).json({ error: 'not_signed' });
        }
        // Delete signature
        await TemplateSignature_1.TemplateSignature.deleteOne({ templateAssignmentId });
        // Update assignment status back to completed
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed' });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'UNSIGN_TEMPLATE',
            details: {
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'unsign_failed', message: e.message });
    }
});
// Sub-admin: Get template assignment for review
exports.subAdminTemplatesRouter.get('/templates/:templateAssignmentId/review', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        let authorized = false;
        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean();
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
            const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean();
            authorized = subAdminAssignments.length > 0;
            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
                if (roleScope?.levels?.length) {
                    const cls = await Class_1.ClassModel.findById(enrollmentCheck.classId).lean();
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true;
                    }
                }
            }
        }
        else {
            // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean();
                if (subAdminAssignments.length > 0) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Get template, student, and signature (no change history for sub-admin)
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        const signature = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId }).lean();
        // Get student level
        let level = student?.level || '';
        if (student) {
            const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
            if (enrollment && enrollment.classId) {
                const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (classDoc)
                    level = classDoc.level || '';
            }
        }
        // Merge assignment data into template (for language toggles, dropdowns, etc.)
        const versionedTemplate = JSON.parse(JSON.stringify(template));
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
                // Handle language_toggle_X_Y format
                if (key.startsWith('language_toggle_')) {
                    const [, , pageIdx, blockIdx] = key.split('_');
                    const pageIndex = parseInt(pageIdx);
                    const blockIndex = parseInt(blockIdx);
                    if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                        versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value;
                    }
                }
                // Add other data merging patterns here if needed
            }
        }
        // Determine if sub-admin can edit (authorized via level or teacher assignment)
        // We already checked 'authorized' variable above for access.
        // If they are authorized to view, can they edit?
        // The requirement says: "edit mode ... to be able to edit also all the toggle and drop down only of the level they were assigned to"
        // So yes, if authorized, they can edit (subject to level constraints in frontend).
        const canEdit = authorized;
        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level },
            signature,
            canEdit,
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Sign all templates for a class
exports.subAdminTemplatesRouter.post('/templates/sign-class/:classId', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { classId } = req.params;
        // Get all students in this class
        const enrollments = await Enrollment_1.Enrollment.find({ classId }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Verify authorization: Sub-admin must be assigned to at least one teacher of this class
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId }).lean();
        const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: classTeacherIds },
        }).lean();
        let authorized = subAdminAssignments.length > 0;
        if (!authorized) {
            // Check RoleScope
            const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
            if (roleScope?.levels?.length) {
                const cls = await Class_1.ClassModel.findById(classId).lean();
                if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Get all template assignments for these students
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean();
        // Filter out those already signed
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const existingSignatures = await TemplateSignature_1.TemplateSignature.find({
            templateAssignmentId: { $in: assignmentIds }
        }).lean();
        const signedIds = new Set(existingSignatures.map(s => s.templateAssignmentId));
        const toSign = templateAssignments.filter(a => !signedIds.has(String(a._id)));
        // Create signatures for all unsigned assignments
        const signatures = await Promise.all(toSign.map(async (assignment) => {
            const signature = await TemplateSignature_1.TemplateSignature.create({
                templateAssignmentId: String(assignment._id),
                subAdminId,
                signedAt: new Date(),
                status: 'signed',
            });
            // Update assignment status
            await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignment._id, { status: 'signed' });
            // Log audit
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            await (0, auditLogger_1.logAudit)({
                userId: subAdminId,
                action: 'SIGN_TEMPLATE',
                details: {
                    templateId: assignment.templateId,
                    templateName: template?.name,
                    studentId: assignment.studentId,
                    studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
                    classId,
                },
                req,
            });
            return signature;
        }));
        res.json({
            signed: signatures.length,
            alreadySigned: templateAssignments.length - toSign.length,
            total: templateAssignments.length
        });
    }
    catch (e) {
        res.status(500).json({ error: 'sign_failed', message: e.message });
    }
});
// Sub-admin: Mark assignment as done
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/mark-done', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            isCompleted: true,
            completedAt: new Date(),
            completedBy: subAdminId,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
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
// Sub-admin: Unmark assignment as done
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/unmark-done', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            isCompleted: false,
            completedAt: null,
            completedBy: null,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
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
// Sub-admin: Update template data (e.g. language toggles)
exports.subAdminTemplatesRouter.patch('/templates/:assignmentId/data', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        const { type, pageIndex, blockIndex, items } = req.body;
        if (!type)
            return res.status(400).json({ error: 'missing_type' });
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization
        // Check if sub-admin is assigned to any teacher of the student's class
        const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        if (!enrollment)
            return res.status(403).json({ error: 'student_not_enrolled' });
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollment.classId }).lean();
        const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: classTeacherIds },
        }).lean();
        let authorized = subAdminAssignments.length > 0;
        if (!authorized) {
            // Check RoleScope
            const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
            if (roleScope?.levels?.length) {
                const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' });
            }
            const key = `language_toggle_${pageIndex}_${blockIndex}`;
            // Update assignment data
            const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
                $set: {
                    [`data.${key}`]: items
                }
            }, { new: true });
            // Log audit
            await (0, auditLogger_1.logAudit)({
                userId: subAdminId,
                action: 'UPDATE_TEMPLATE_DATA',
                details: {
                    assignmentId,
                    type,
                    pageIndex,
                    blockIndex,
                    items
                },
                req,
            });
            res.json({ success: true, assignment: updated });
        }
        else {
            res.status(400).json({ error: 'unsupported_type' });
        }
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
