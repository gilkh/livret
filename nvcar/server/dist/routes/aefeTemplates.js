"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aefeTemplatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
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
exports.aefeTemplatesRouter = (0, express_1.Router)();
// AEFE: Get signature
exports.aefeTemplatesRouter.get('/signature', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        let user = await User_1.User.findById(aefeId).lean();
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(aefeId).lean();
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
// AEFE: Upload signature
exports.aefeTemplatesRouter.post('/signature/upload', (0, auth_1.requireAuth)(['AEFE']), upload.single('file'), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        if (!req.file) {
            return res.status(400).json({ error: 'no_file' });
        }
        const signatureUrl = `/uploads/signatures/${req.file.filename}`;
        // Delete old signature file if exists
        let user = await User_1.User.findById(aefeId).lean();
        let isOutlook = false;
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(aefeId).lean();
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
            await OutlookUser_1.OutlookUser.findByIdAndUpdate(aefeId, { signatureUrl });
        }
        else {
            await User_1.User.findByIdAndUpdate(aefeId, { signatureUrl });
        }
        await (0, auditLogger_1.logAudit)({
            userId: aefeId,
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
// AEFE: Delete signature
exports.aefeTemplatesRouter.delete('/signature', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        let user = await User_1.User.findById(aefeId).lean();
        let isOutlook = false;
        if (!user) {
            user = await OutlookUser_1.OutlookUser.findById(aefeId).lean();
            isOutlook = true;
        }
        if (user?.signatureUrl) {
            const oldPath = path_1.default.join(__dirname, '../../public', user.signatureUrl);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        if (isOutlook) {
            await OutlookUser_1.OutlookUser.findByIdAndUpdate(aefeId, { $unset: { signatureUrl: 1 } });
        }
        else {
            await User_1.User.findByIdAndUpdate(aefeId, { $unset: { signatureUrl: 1 } });
        }
        await (0, auditLogger_1.logAudit)({
            userId: aefeId,
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
// AEFE: Get promoted students not yet assigned to a class
exports.aefeTemplatesRouter.get('/promoted-students', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        // Get active school year
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        // Find students promoted by this AEFE user
        const students = await Student_1.Student.find({
            'promotions.promotedBy': aefeId
        }).lean();
        const promotedStudents = [];
        for (const student of students) {
            const assignedEnrollment = await Enrollment_1.Enrollment.findOne({
                studentId: student._id,
                status: 'active',
                classId: { $exists: true, $ne: null }
            }).lean();
            if (assignedEnrollment)
                continue;
            const promotions = student.promotions || [];
            const lastPromotion = promotions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if (lastPromotion && lastPromotion.promotedBy === aefeId && String(lastPromotion.schoolYearId) === String(activeSchoolYear?._id)) {
                const assignment = await TemplateAssignment_1.TemplateAssignment.findOne({ studentId: student._id })
                    .sort({ assignedAt: -1 })
                    .lean();
                promotedStudents.push({
                    _id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    fromLevel: lastPromotion.fromLevel,
                    toLevel: lastPromotion.toLevel,
                    date: lastPromotion.date,
                    assignmentId: assignment ? assignment._id : null
                });
            }
        }
        res.json(promotedStudents);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// AEFE: Get classes with pending signatures
exports.aefeTemplatesRouter.get('/classes', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeSchoolYear)
            return res.json([]);
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId: aefeId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean();
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: aefeId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear._id
            }).lean();
            const levelClassIds = levelClasses.map(c => String(c._id));
            relevantClassIds = [...new Set([...relevantClassIds, ...levelClassIds])];
        }
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: relevantClassIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean();
        const classIds = [...new Set(enrollments.map(e => e.classId))];
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
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
// AEFE: Get assigned teachers
exports.aefeTemplatesRouter.get('/teachers', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId: aefeId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        res.json(teachers);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// AEFE: Get pending signatures (templates awaiting signature)
exports.aefeTemplatesRouter.get('/pending-signatures', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeSchoolYear) {
            return res.json([]);
        }
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId: aefeId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean();
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: aefeId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear?._id
            }).lean();
            const levelClassIds = levelClasses.map(c => String(c._id));
            classIds = [...new Set([...classIds, ...levelClassIds])];
        }
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: classIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]));
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed', 'signed'] },
        }).lean();
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean();
        const signatureMap = new Map(signatures.map(s => [s.templateAssignmentId, s]));
        const enrichedAssignments = await Promise.all(templateAssignments.map(async (assignment) => {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            const signature = signatureMap.get(String(assignment._id));
            const classId = studentClassMap.get(String(assignment.studentId));
            const classInfo = classId ? classMap.get(classId) : null;
            const isPromoted = student?.promotions?.some((p) => p.schoolYearId === String(activeSchoolYear?._id));
            return {
                ...assignment,
                template,
                student,
                signature,
                className: classInfo?.name,
                level: classInfo?.level,
                isPromoted
            };
        }));
        const finalAssignments = enrichedAssignments.filter(a => !a.isPromoted);
        res.json(finalAssignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// AEFE: Get template assignment for review (READ-ONLY - no editing allowed)
exports.aefeTemplatesRouter.get('/templates/:templateAssignmentId/review', (0, auth_1.requireAuth)(['AEFE']), async (req, res) => {
    try {
        const aefeId = req.user.userId;
        const { templateAssignmentId } = req.params;
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        const enrollments = await Enrollment_1.Enrollment.find({ studentId: assignment.studentId }).lean();
        let authorized = false;
        if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
            const aefeAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                subAdminId: aefeId,
                teacherId: { $in: assignment.assignedTeachers },
            }).lean();
            if (aefeAssignments.length > 0) {
                authorized = true;
            }
        }
        if (!authorized && enrollments.length > 0) {
            const classIds = enrollments.map(e => e.classId).filter(Boolean);
            const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: { $in: classIds } }).lean();
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId);
            const aefeAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                subAdminId: aefeId,
                teacherId: { $in: classTeacherIds },
            }).lean();
            if (aefeAssignments.length > 0) {
                authorized = true;
            }
            if (!authorized) {
                const roleScope = await RoleScope_1.RoleScope.findOne({ userId: aefeId }).lean();
                if (roleScope?.levels?.length) {
                    const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
                    if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                        authorized = true;
                    }
                }
            }
        }
        if (!authorized && student && student.promotions) {
            const lastPromotion = student.promotions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if (lastPromotion && lastPromotion.promotedBy === aefeId) {
                authorized = true;
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId }).lean();
        const signature = signatures.find(s => s.type === 'standard' || !s.type);
        const finalSignature = signatures.find(s => s.type === 'end_of_year');
        const isSignedByMe = signature && signature.subAdminId === aefeId;
        let level = student?.level || '';
        if (student) {
            const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
            if (enrollment && enrollment.classId) {
                const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (classDoc)
                    level = classDoc.level || '';
            }
        }
        const versionedTemplate = JSON.parse(JSON.stringify(template));
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
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
        // AEFE users cannot edit
        const canEdit = false;
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const isPromoted = student?.promotions?.some((p) => p.schoolYearId === String(activeSchoolYear?._id));
        const activeSemester = activeSchoolYear?.activeSemester || 1;
        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level },
            signature,
            finalSignature,
            isSignedByMe,
            canEdit, // Always false for AEFE
            isPromoted,
            activeSemester
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
