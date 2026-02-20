"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminTemplatesRouter = void 0;
const express_1 = require("express");
const signatureService_1 = require("../services/signatureService");
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
const Level_1 = require("../models/Level");
const Setting_1 = require("../models/Setting");
const SavedGradebook_1 = require("../models/SavedGradebook");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const auditLogger_1 = require("../utils/auditLogger");
const readinessUtils_1 = require("../utils/readinessUtils");
const signatureSnapshot_1 = require("../utils/signatureSnapshot");
const mongoose_1 = __importDefault(require("mongoose"));
const templateUtils_1 = require("../utils/templateUtils");
const cache_1 = require("../utils/cache");
const rolloverService_1 = require("../services/rolloverService");
const assignmentMetadata_1 = require("../utils/assignmentMetadata");
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
// DEBUG: Get all signatures for a template assignment
exports.subAdminTemplatesRouter.get('/templates/:templateAssignmentId/debug-signatures', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE', 'ADMIN']), async (req, res) => {
    try {
        const { templateAssignmentId } = req.params;
        const allSignatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId }).lean();
        const activeSchoolYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
        const previousYear = activeSchoolYear
            ? await (0, cache_1.withCache)(`school-year-before-${activeSchoolYear.startDate}`, () => SchoolYear_1.SchoolYear.findOne({ endDate: { $lt: activeSchoolYear.startDate } }).sort({ endDate: -1 }).lean())
            : null;
        res.json({
            totalSignatures: allSignatures.length,
            signatures: allSignatures,
            activeSchoolYear: activeSchoolYear ? {
                id: activeSchoolYear._id,
                name: activeSchoolYear.name,
                startDate: activeSchoolYear.startDate,
                endDate: activeSchoolYear.endDate
            } : null,
            previousYear: previousYear ? {
                id: previousYear._id,
                name: previousYear.name,
                endDate: previousYear.endDate
            } : null,
            currentDate: new Date()
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Sub-admin: Get signature
exports.subAdminTemplatesRouter.get('/signature', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
exports.subAdminTemplatesRouter.post('/signature/upload', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), upload.single('file'), async (req, res) => {
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
        res.json({ signatureUrl });
    }
    catch (e) {
        res.status(500).json({ error: 'upload_failed', message: e.message });
    }
});
// Sub-admin: Delete signature
exports.subAdminTemplatesRouter.delete('/signature', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
// Sub-admin: Get promoted students not yet assigned to a class
exports.subAdminTemplatesRouter.get('/promoted-students', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get active school year
        const activeSchoolYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
        if (!activeSchoolYear)
            return res.json([]);
        const activeSchoolYearId = String(activeSchoolYear._id);
        // Find students promoted by this sub-admin
        const students = await Student_1.Student.find({
            promotions: { $elemMatch: { promotedBy: subAdminId, schoolYearId: activeSchoolYearId } }
        }).lean();
        const studentIds = students.map(s => String(s._id));
        if (studentIds.length === 0)
            return res.json([]);
        const assignedEnrollments = await Enrollment_1.Enrollment.find({
            studentId: { $in: studentIds },
            schoolYearId: activeSchoolYearId,
            status: 'active',
            classId: { $exists: true, $ne: null },
        }).select({ studentId: 1 }).lean();
        const assignedSet = new Set(assignedEnrollments.map(e => String(e.studentId)));
        const latestAssignments = await TemplateAssignment_1.TemplateAssignment.aggregate([
            { $match: { studentId: { $in: studentIds } } },
            { $sort: { assignedAt: -1 } },
            { $group: { _id: '$studentId', assignmentId: { $first: '$_id' } } },
        ]);
        const assignmentByStudent = new Map(latestAssignments.map((a) => [String(a._id), a.assignmentId ? String(a.assignmentId) : '']));
        const promotedStudents = [];
        for (const student of students) {
            const sid = String(student._id);
            if (assignedSet.has(sid))
                continue;
            const promotions = student.promotions || [];
            let lastPromotion = null;
            for (const p of promotions) {
                if (p?.promotedBy !== subAdminId)
                    continue;
                if (String(p?.schoolYearId) !== activeSchoolYearId)
                    continue;
                if (!lastPromotion) {
                    lastPromotion = p;
                    continue;
                }
                const pDate = p?.date ? new Date(p.date).getTime() : 0;
                const lastDate = lastPromotion?.date ? new Date(lastPromotion.date).getTime() : 0;
                if (pDate > lastDate)
                    lastPromotion = p;
            }
            if (!lastPromotion)
                continue;
            const assignmentId = assignmentByStudent.get(sid) || null;
            promotedStudents.push({
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                avatarUrl: student.avatarUrl,
                fromLevel: lastPromotion.fromLevel,
                toLevel: lastPromotion.toLevel,
                date: lastPromotion.date,
                assignmentId,
            });
        }
        res.json(promotedStudents);
    }
    catch (e) {
        console.error('Error in /subadmin/promoted-students:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get classes with pending signatures
exports.subAdminTemplatesRouter.get('/classes', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get active school year
        const activeSchoolYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
        if (!activeSchoolYear)
            return res.json([]);
        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean();
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        // Check RoleScope for level assignments
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear._id
            }).lean();
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
        // Pre-compute maps for fast aggregation
        const classIds = [...new Set(enrollments.map(e => e.classId))];
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const studentToClass = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]));
        const allAssignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: allAssignmentIds } }).lean();
        const signedSet = new Set(signatures.map(s => String(s.templateAssignmentId)));
        // Aggregate counts per class in one pass
        const counts = new Map();
        for (const a of templateAssignments) {
            const clsId = studentToClass.get(String(a.studentId));
            if (!clsId)
                continue;
            const entry = counts.get(clsId) || { total: 0, signed: 0 };
            entry.total++;
            if (signedSet.has(String(a._id)))
                entry.signed++;
            counts.set(clsId, entry);
        }
        const classesWithStats = classes.map((cls) => {
            const c = counts.get(String(cls._id)) || { total: 0, signed: 0 };
            return {
                ...cls,
                pendingSignatures: c.total - c.signed,
                totalAssignments: c.total,
                signedAssignments: c.signed,
            };
        });
        res.json(classesWithStats);
    }
    catch (e) {
        console.error('Error in /subadmin/classes:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get assigned teachers
exports.subAdminTemplatesRouter.get('/teachers', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } })
            .select('_id email displayName')
            .lean();
        res.json(teachers);
    }
    catch (e) {
        console.error('Error in /subadmin/teachers:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get template changes by a teacher
exports.subAdminTemplatesRouter.get('/teachers/:teacherId/changes', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
            const template = await (0, cache_1.withCache)(`template-${templateAssignment.templateId}`, () => GradebookTemplate_1.GradebookTemplate.findById(templateAssignment.templateId).lean());
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
exports.subAdminTemplatesRouter.get('/pending-signatures', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get active school year
        const activeSchoolYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
        if (!activeSchoolYear) {
            return res.json([]);
        }
        const standardPeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(String(activeSchoolYear._id), 'sem1');
        const endOfYearPeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(String(activeSchoolYear._id), 'end_of_year');
        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean();
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))];
        // Check RoleScope for level assignments
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (roleScope?.levels?.length) {
            const levelClasses = await Class_1.ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear?._id
            }).lean();
            const levelClassIds = levelClasses.map(c => String(c._id));
            classIds = [...new Set([...classIds, ...levelClassIds])];
        }
        // Get students in these classes
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: classIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Get class details for mapping
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]));
        // Get ALL template assignments for these students (including signed ones)
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed', 'signed'] },
        }).lean();
        // Get signature information for all assignments
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } })
            .sort({ signedAt: -1 })
            .lean();
        const signatureMap = new Map();
        signatures.forEach(s => {
            const key = String(s.templateAssignmentId);
            if (!signatureMap.has(key))
                signatureMap.set(key, []);
            signatureMap.get(key)?.push(s);
        });
        const templateIds = [...new Set(templateAssignments.map(a => a.templateId))];
        const validTemplateIds = templateIds.filter(id => /^[a-fA-F0-9]{24}$/.test(String(id)));
        const validStudentIds = studentIds.filter(id => /^[a-fA-F0-9]{24}$/.test(String(id)));
        const [templates, students] = await Promise.all([
            validTemplateIds.length ? GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: validTemplateIds } }).lean() : Promise.resolve([]),
            validStudentIds.length ? Student_1.Student.find({ _id: { $in: validStudentIds } }).lean() : Promise.resolve([])
        ]);
        const templateMap = new Map(templates.map(t => [String(t._id), t]));
        const studentMap = new Map(students.map(s => [String(s._id), s]));
        const promotionDateMap = new Map();
        students.forEach(s => {
            if (Array.isArray(s.promotions)) {
                const relevantPromotions = s.promotions.filter(p => {
                    const promotionYearId = String(p.schoolYearId);
                    const activeYearId = String(activeSchoolYear?._id);
                    return promotionYearId === activeYearId;
                });
                if (relevantPromotions.length > 0) {
                    const latest = relevantPromotions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                    if (latest && latest.date) {
                        promotionDateMap.set(String(s._id), new Date(latest.date));
                    }
                }
            }
        });
        const enrichedAssignments = templateAssignments.map((assignment) => {
            const template = templateMap.get(String(assignment.templateId));
            const student = studentMap.get(String(assignment.studentId));
            const classId = studentClassMap.get(String(assignment.studentId));
            const classInfo = classId ? classMap.get(classId) : null;
            const level = classInfo?.level;
            const assignmentSignatures = signatureMap.get(String(assignment._id)) || [];
            // Helper to find relevant signature
            const findSig = (type) => {
                return assignmentSignatures.find(s => {
                    // Type check
                    if (type === 'standard') {
                        if (s.type && s.type !== 'standard')
                            return false;
                    }
                    else {
                        if (s.type !== type)
                            return false;
                    }
                    // Level check
                    if (s.level && level && s.level !== level)
                        return false;
                    if (type === 'standard') {
                        if (s.signaturePeriodId && s.signaturePeriodId !== standardPeriodId)
                            return false;
                    }
                    if (type === 'end_of_year') {
                        if (s.signaturePeriodId && s.signaturePeriodId !== endOfYearPeriodId)
                            return false;
                    }
                    return true;
                });
            };
            const standardSig = findSig('standard');
            const finalSig = findSig('end_of_year');
            const isPromoted = promotionDateMap.has(String(assignment.studentId));
            return {
                _id: assignment._id,
                studentId: assignment.studentId,
                status: assignment.status,
                isCompleted: assignment.isCompleted,
                completedAt: assignment.completedAt,
                template: template ? { name: template.name } : undefined,
                student: student ? { firstName: student.firstName, lastName: student.lastName, avatarUrl: student.avatarUrl } : undefined,
                signatures: {
                    standard: standardSig ? { signedAt: standardSig.signedAt, subAdminId: standardSig.subAdminId } : null,
                    final: finalSig ? { signedAt: finalSig.signedAt, subAdminId: finalSig.subAdminId } : null
                },
                className: classInfo?.name,
                level: classInfo?.level,
                isPromoted
            };
        });
        const finalAssignments = enrichedAssignments;
        res.json(finalAssignments);
    }
    catch (e) {
        console.error('Error in /subadmin/pending-signatures:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Promote student
exports.subAdminTemplatesRouter.post('/templates/:templateAssignmentId/promote', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        const { nextLevel } = req.body;
        // Check if signed by this sub-admin (End of Year signature required for promotion)
        const periodInfo = await (0, readinessUtils_1.resolveEndOfYearSignaturePeriod)().catch(() => null);
        const signatureQuery = {
            templateAssignmentId,
            subAdminId,
            type: 'end_of_year'
        };
        if (periodInfo?.signaturePeriodId)
            signatureQuery.signaturePeriodId = periodInfo.signaturePeriodId;
        const signature = await TemplateSignature_1.TemplateSignature.findOne(signatureQuery).lean();
        if (!signature) {
            return res.status(403).json({ error: 'not_signed_by_you', message: 'You must sign the carnet (End of Year) before promoting the student' });
        }
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
        // Additional authorization: if this sub-admin promoted the student in the active year, allow signing
        if (!authorized) {
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            const activeSchoolYearForAuth = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (student && activeSchoolYearForAuth && Array.isArray(student.promotions)) {
                const promotedThisYear = student.promotions.some((p) => String(p.schoolYearId) === String(activeSchoolYearForAuth._id) && String(p.promotedBy) === String(subAdminId));
                if (promotedThisYear) {
                    authorized = true;
                }
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const student = await Student_1.Student.findById(assignment.studentId);
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        // Get current enrollment to find school year
        // Handle missing status field by treating it as active
        const enrollment = await Enrollment_1.Enrollment.findOne({
            studentId: assignment.studentId,
            ...(activeSchoolYear ? { schoolYearId: String(activeSchoolYear._id) } : {}),
            $or: [{ status: 'active' }, { status: 'promoted' }, { status: { $exists: false } }]
        }).lean();
        let yearName = activeSchoolYear?.name || '';
        let currentLevel = student.level || '';
        let currentSchoolYearId = activeSchoolYear ? String(activeSchoolYear._id) : '';
        let currentSchoolYearSequence = activeSchoolYear?.sequence || 0;
        if (enrollment) {
            if (enrollment.classId) {
                const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (cls) {
                    currentLevel = cls.level || '';
                    if (!currentSchoolYearId)
                        currentSchoolYearId = cls.schoolYearId;
                }
            }
            // Fallback to enrollment's schoolYearId if class lookup failed or no class
            if (!currentSchoolYearId && enrollment.schoolYearId) {
                currentSchoolYearId = enrollment.schoolYearId;
            }
            if (currentSchoolYearId) {
                const sy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
                if (sy) {
                    yearName = sy.name || yearName;
                    if (!currentSchoolYearSequence)
                        currentSchoolYearSequence = sy.sequence || 0;
                }
            }
        }
        // If we could not determine the school's year context, fail explicitly
        if (!currentSchoolYearId) {
            return res.status(400).json({ error: 'current_school_year_unknown', message: 'Current school year could not be determined for promotion' });
        }
        // Check if already promoted in current school year
        const alreadyPromoted = student.promotions?.some(p => p.schoolYearId === currentSchoolYearId);
        if (alreadyPromoted) {
            return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' });
        }
        // Calculate Next Level dynamically
        const currentLevelDoc = await (0, cache_1.withCache)(`level-name-${currentLevel}`, () => Level_1.Level.findOne({ name: currentLevel }).lean());
        let calculatedNextLevel = '';
        if (currentLevelDoc) {
            const nextLevelDoc = await (0, cache_1.withCache)(`level-order-${currentLevelDoc.order + 1}`, () => Level_1.Level.findOne({ order: currentLevelDoc.order + 1 }).lean());
            if (nextLevelDoc) {
                calculatedNextLevel = nextLevelDoc.name;
            }
        }
        // Fallback if levels not populated or not found
        if (!calculatedNextLevel)
            calculatedNextLevel = nextLevel;
        if (!calculatedNextLevel)
            return res.status(400).json({ error: 'cannot_determine_next_level' });
        // Find next school year by sequence
        let nextSy = null;
        if (currentSchoolYearSequence > 0) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean();
        }
        let currentSy = null;
        if (!nextSy && currentSchoolYearId) {
            currentSy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
            if (currentSy && currentSy.name) {
                const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/);
                if (match) {
                    const startYear = parseInt(match[1]);
                    const separator = match[2];
                    const endYear = parseInt(match[3]);
                    const nextName = `${startYear + 1}${separator}${endYear + 1}`;
                    nextSy = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
                }
            }
        }
        if (!nextSy && currentSchoolYearId) {
            if (!currentSy)
                currentSy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
            if (currentSy?.endDate) {
                nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gte: currentSy.endDate } }).sort({ startDate: 1 }).lean();
            }
            if (!nextSy && currentSy?.startDate) {
                nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gt: currentSy.startDate } }).sort({ startDate: 1 }).lean();
            }
        }
        if (!nextSy?._id) {
            return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' });
        }
        const nextSchoolYearId = String(nextSy._id);
        // Create Gradebook Snapshot
        // We'll perform the snapshot creation and all following updates in a transaction when possible
        const session = await mongoose_1.default.startSession();
        let usedTransaction = true;
        try {
            try {
                session.startTransaction();
            }
            catch (e) {
                usedTransaction = false;
            }
            const snapshotMeta = { templateVersion: assignment.templateVersion || null, dataVersion: assignment.dataVersion || null };
            // Keep track of side effects for non-transactional rollback
            let createdSavedGradebookId = null;
            let originalEnrollmentStatus = null;
            let createdNextEnrollmentId = null;
            let studentPromotionsBefore = Array.isArray(student.promotions) ? JSON.parse(JSON.stringify(student.promotions)) : [];
            let assignmentDataBefore = assignment.data ? JSON.parse(JSON.stringify(assignment.data)) : undefined;
            const doCreateSnapshot = async () => {
                const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: student._id }).lean();
                // Get Class Name for Snapshot
                let snapshotClassName = '';
                if (enrollment && enrollment.classId) {
                    const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (cls)
                        snapshotClassName = cls.name;
                }
                // Include any stored signatures (so saved snapshots contain signature images/URLs)
                const signatures = assignment && assignment._id ? await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean() : [];
                const snapshotData = {
                    student: student.toObject ? student.toObject() : student,
                    enrollment: enrollment,
                    statuses: statuses,
                    assignment: assignment,
                    className: snapshotClassName,
                    signatures: signatures,
                    signature: signatures.find((s) => s.type === 'standard') || null,
                    finalSignature: signatures.find((s) => s.type === 'end_of_year') || null,
                };
                const saved = await (0, rolloverService_1.createAssignmentSnapshot)(assignment, 'promotion', {
                    schoolYearId: currentSchoolYearId,
                    level: currentLevel || 'Sans niveau',
                    classId: enrollment?.classId || undefined,
                    data: snapshotData,
                    session: session
                });
                if (saved && saved._id)
                    createdSavedGradebookId = String(saved._id);
            };
            const runNonTransactionalFlow = async () => {
                try {
                    await doCreateSnapshot();
                    if (enrollment) {
                        if (enrollment.status !== 'promoted') {
                            originalEnrollmentStatus = enrollment.status || null;
                            await Enrollment_1.Enrollment.findByIdAndUpdate(enrollment._id, { status: 'promoted' });
                        }
                    }
                    const existingNextEnrollment = await Enrollment_1.Enrollment.findOne({ studentId: String(student._id), schoolYearId: nextSchoolYearId }).lean();
                    if (!existingNextEnrollment) {
                        const nextEnr = await Enrollment_1.Enrollment.create({ studentId: student._id, schoolYearId: nextSchoolYearId, status: 'active' });
                        createdNextEnrollmentId = String(nextEnr._id);
                    }
                    const promotion = {
                        schoolYearId: currentSchoolYearId,
                        date: new Date(),
                        fromLevel: currentLevel,
                        toLevel: calculatedNextLevel,
                        promotedBy: subAdminId
                    };
                    await Student_1.Student.findByIdAndUpdate(student._id, { $push: { promotions: promotion }, $set: { nextLevel: calculatedNextLevel } });
                    const promotionData = {
                        from: currentLevel,
                        to: calculatedNextLevel,
                        date: new Date(),
                        year: yearName,
                        class: '',
                        by: subAdminId
                    };
                    // Note: Do NOT call getRolloverUpdate here. The teacher progress should remain
                    // visible for the current year until the admin advances to the next school year.
                    // Rollover will happen via checkAndAssignTemplates when the school year changes.
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                        $push: { 'data.promotions': promotionData },
                        $inc: { dataVersion: 1 }
                    }, (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true }));
                }
                catch (err) {
                    // Attempt rollback of side effects
                    try {
                        if (createdSavedGradebookId) {
                            try {
                                await SavedGradebook_1.SavedGradebook.deleteOne({ _id: createdSavedGradebookId });
                            }
                            catch (e) {
                                console.error('Rollback: failed to delete saved gradebook', e);
                            }
                        }
                        if (createdNextEnrollmentId) {
                            try {
                                await Enrollment_1.Enrollment.deleteOne({ _id: createdNextEnrollmentId });
                            }
                            catch (e) {
                                console.error('Rollback: failed to delete created next enrollment', e);
                            }
                        }
                        if (originalEnrollmentStatus !== null && enrollment && enrollment._id) {
                            try {
                                await Enrollment_1.Enrollment.findByIdAndUpdate(enrollment._id, { status: originalEnrollmentStatus });
                            }
                            catch (e) {
                                console.error('Rollback: failed to restore enrollment status', e);
                            }
                        }
                        // Restore student promotions and nextLevel
                        try {
                            await Student_1.Student.findByIdAndUpdate(student._id, { $set: { promotions: studentPromotionsBefore || [], nextLevel: student.nextLevel || '' } });
                        }
                        catch (e) {
                            console.error('Rollback: failed to restore student promotions', e);
                        }
                        // Restore assignment data
                        try {
                            await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { $set: { data: assignmentDataBefore } }, (0, assignmentMetadata_1.assignmentUpdateOptions)());
                        }
                        catch (e) {
                            console.error('Rollback: failed to restore assignment data', e);
                        }
                    }
                    catch (e) {
                        console.error('Rollback attempt failed:', e);
                    }
                    throw err;
                }
            };
            if (usedTransaction) {
                try {
                    await doCreateSnapshot();
                    // Update Enrollment Status (Destructive Fix)
                    if (enrollment) {
                        if (enrollment.status !== 'promoted') {
                            originalEnrollmentStatus = enrollment.status || null;
                            await Enrollment_1.Enrollment.findByIdAndUpdate(enrollment._id, { status: 'promoted' }, { session });
                        }
                    }
                    // Create new Enrollment for next year
                    const existingNextEnrollment = await Enrollment_1.Enrollment.findOne({ studentId: String(student._id), schoolYearId: nextSchoolYearId }).session(session).lean();
                    if (!existingNextEnrollment) {
                        const nextEnr = await Enrollment_1.Enrollment.create([{ studentId: student._id, schoolYearId: nextSchoolYearId, status: 'active' }], { session });
                        if (Array.isArray(nextEnr) && nextEnr[0] && nextEnr[0]._id)
                            createdNextEnrollmentId = String(nextEnr[0]._id);
                    }
                    // Add promotion record to student
                    const promotion = {
                        schoolYearId: currentSchoolYearId,
                        date: new Date(),
                        fromLevel: currentLevel,
                        toLevel: calculatedNextLevel,
                        promotedBy: subAdminId
                    };
                    await Student_1.Student.findByIdAndUpdate(student._id, { $push: { promotions: promotion }, $set: { nextLevel: calculatedNextLevel } }, { session });
                    // Record promotion in assignment data
                    const promotionData = {
                        from: currentLevel,
                        to: calculatedNextLevel,
                        date: new Date(),
                        year: yearName,
                        class: '',
                        by: subAdminId
                    };
                    // Note: Do NOT call getRolloverUpdate here. The teacher progress should remain
                    // visible for the current year until the admin advances to the next school year.
                    // Rollover will happen via checkAndAssignTemplates when the school year changes.
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                        $push: { 'data.promotions': promotionData },
                        $inc: { dataVersion: 1 }
                    }, (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true, session }));
                    await session.commitTransaction();
                }
                catch (e) {
                    const msg = String(e?.message || '');
                    if (msg.includes('Transaction numbers are only allowed')) {
                        try {
                            await session.abortTransaction();
                        }
                        catch (err) { }
                        // Fallback to non-transactional flow
                        await runNonTransactionalFlow();
                    }
                    else {
                        try {
                            await session.abortTransaction();
                        }
                        catch (err) { }
                        throw e;
                    }
                }
            }
            else {
                await runNonTransactionalFlow();
            }
        }
        catch (e) {
            console.error('Promotion error:', e);
            return res.status(500).json({ error: 'promotion_failed', message: e.message });
        }
        finally {
            try {
                if (typeof session !== 'undefined')
                    session.endSession();
            }
            catch (e) { }
        }
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'PROMOTE_STUDENT',
            details: {
                studentId: student._id,
                from: currentLevel,
                to: calculatedNextLevel,
                templateAssignmentId
            },
            req,
        });
        // Return updated data to avoid client reload issues
        const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        const updatedStudent = await Student_1.Student.findById(student._id).lean();
        // Re-fetch template to ensure consistency (though it shouldn't change)
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const versionedTemplate = (0, templateUtils_1.mergeAssignmentDataIntoTemplate)(template, updatedAssignment);
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
exports.subAdminTemplatesRouter.post('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const { type = 'standard', signaturePeriodId, signatureSchoolYearId } = req.body;
        const bypassScopes = req.user.bypassScopes || [];
        // Check granular bypass permissions
        let canBypass = false;
        if (bypassScopes.some((s) => s.type === 'ALL')) {
            canBypass = true;
        }
        else {
            // Check specific scopes
            const enrollments = await Enrollment_1.Enrollment.find({ studentId: assignment.studentId }).lean();
            const classIds = enrollments.map(e => String(e.classId));
            // Check STUDENT scope
            if (bypassScopes.some((s) => s.type === 'STUDENT' && s.value === assignment.studentId)) {
                canBypass = true;
            }
            // Check CLASS scope
            if (!canBypass && bypassScopes.some((s) => s.type === 'CLASS' && classIds.includes(s.value))) {
                canBypass = true;
            }
            // Check LEVEL scope
            if (!canBypass) {
                const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
                const levels = classes.map(c => c.level).filter(Boolean);
                if (bypassScopes.some((s) => s.type === 'LEVEL' && levels.includes(s.value))) {
                    canBypass = true;
                }
            }
        }
        // Apply Settings-based Restrictions
        const settings = await Setting_1.Setting.find({
            key: {
                $in: [
                    'subadmin_restriction_enabled',
                    'subadmin_restriction_exempt_standard',
                    'subadmin_restriction_exempt_final'
                ]
            }
        }).lean();
        const settingsMap = {};
        settings.forEach(s => settingsMap[s.key] = s.value);
        const restrictionsEnabled = settingsMap.subadmin_restriction_enabled !== false; // Default true
        const exemptStandard = settingsMap.subadmin_restriction_exempt_standard === true;
        const exemptFinal = settingsMap.subadmin_restriction_exempt_final === true;
        if (!restrictionsEnabled) {
            canBypass = true;
        }
        else {
            if (type === 'standard' && exemptStandard)
                canBypass = true;
            if (type === 'end_of_year' && exemptFinal)
                canBypass = true;
        }
        if (!canBypass) {
            if (assignment.status !== 'completed' && assignment.status !== 'signed') {
                const enrollments = await Enrollment_1.Enrollment.find({ studentId: assignment.studentId }).lean();
                // Prioritize enrollments with classId, preferring 'promoted' or 'active' status
                const enrollmentsWithClass = enrollments.filter(e => e.classId);
                // Sort to prefer promoted (most recent class assignment) then active
                enrollmentsWithClass.sort((a, b) => {
                    const statusOrder = { 'promoted': 0, 'active': 1 };
                    return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
                });
                const classIds = enrollmentsWithClass.map(e => String(e.classId)).filter(Boolean);
                let clsId = classIds[0];
                let cls = null;
                if (clsId)
                    cls = await Class_1.ClassModel.findById(clsId).lean();
                const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
                const teacherCompletions = assignment.teacherCompletions || [];
                const assignmentData = assignment.data || {};
                const teacherAssignments = clsId ? await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: clsId }).lean() : [];
                const level = cls?.level || '';
                const categoriesRequired = new Set();
                if (template && Array.isArray(template.pages)) {
                    for (let p = 0; p < template.pages.length; p++) {
                        const page = template.pages[p];
                        for (let b = 0; b < (page.blocks || []).length; b++) {
                            const block = page.blocks[b];
                            if (block.type === 'language_toggle') {
                                const key = `language_toggle_${p}_${b}`;
                                const overrideItems = assignmentData[key];
                                const items = overrideItems || block.props?.items || [];
                                for (const item of items) {
                                    let isAssigned = true;
                                    if (item?.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                        if (!level || !item.levels.includes(level))
                                            isAssigned = false;
                                    }
                                    if (!isAssigned)
                                        continue;
                                    const raw = String(item.type || item.label || '');
                                    const code = String(item.code || '').toLowerCase();
                                    const l = raw.toLowerCase();
                                    if (code === 'ar' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية'))
                                        categoriesRequired.add('ar');
                                    else if (code === 'en' || l.includes('anglais') || l.includes('english'))
                                        categoriesRequired.add('en');
                                    else
                                        categoriesRequired.add('poly');
                                }
                            }
                        }
                    }
                }
                const isCatCompleted = (cat) => {
                    let responsible = (teacherAssignments || [])
                        .filter((ta) => String(ta.classId) === String(clsId))
                        .filter((ta) => {
                        const langs = (ta.languages || []).map((x) => x.toLowerCase());
                        if (cat === 'ar') {
                            if (langs.length === 0)
                                return !ta.isProfPolyvalent;
                            return langs.some((v) => v === 'ar' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'));
                        }
                        if (cat === 'en') {
                            if (langs.length === 0)
                                return !ta.isProfPolyvalent;
                            return langs.some((v) => v === 'en' || v.includes('anglais') || v.includes('english'));
                        }
                        return ta.isProfPolyvalent;
                    })
                        .map((ta) => String(ta.teacherId));
                    if (responsible.length === 0)
                        responsible = (assignment.assignedTeachers || []).map((id) => String(id));
                    // Semester-aware completion: end_of_year requires sem2; standard requires sem1.
                    // Fallback to legacy tc.completed when semester-specific flag is missing.
                    const needsSem2 = type === 'end_of_year';
                    return responsible.some((tid) => (teacherCompletions || []).some((tc) => {
                        if (String(tc.teacherId) !== String(tid))
                            return false;
                        if (needsSem2)
                            return !!tc.completedSem2 || !!tc.completed;
                        return !!tc.completedSem1 || !!tc.completed;
                    }));
                };
                let eligible = true;
                for (const cat of categoriesRequired) {
                    if (!isCatCompleted(cat)) {
                        eligible = false;
                        break;
                    }
                }
                if (!eligible) {
                    return res.status(400).json({ error: 'not_completed', message: 'Teacher must mark assignment as done before signing' });
                }
            }
        }
        // Verify authorization via class enrollment (scoped to the relevant school year)
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const authYearId = String(signatureSchoolYearId || activeSchoolYear?._id || '');
        const authorized = await (0, signatureService_1.validateSignatureAuthorization)(subAdminId, assignment, authYearId || undefined);
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Check for Semester 2 requirement for end_of_year signature
        if (type === 'end_of_year' && !canBypass) {
            if (!activeSchoolYear || activeSchoolYear.activeSemester !== 2) {
                return res.status(400).json({ error: 'semester_2_required', message: 'Semester 2 must be active to sign end of year' });
            }
        }
        // Get student level for signature scoping
        let signatureLevel = '';
        const studentForSig = await Student_1.Student.findById(assignment.studentId).lean();
        if (studentForSig) {
            signatureLevel = studentForSig.level || '';
            // Try to refine with class level
            if (activeSchoolYear) {
                const enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean();
                if (enrollment && enrollment.classId) {
                    const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (cls && cls.level)
                        signatureLevel = cls.level;
                }
            }
        }
        try {
            // Fetch sub-admin's uploaded signature URL if available
            let user = await User_1.User.findById(subAdminId).lean();
            if (!user) {
                user = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
            }
            let sigUrl = undefined;
            if (user?.signatureUrl) {
                if (String(user.signatureUrl).startsWith('http')) {
                    sigUrl = user.signatureUrl;
                }
                else {
                    const base = `${req.protocol}://${req.get('host')}`;
                    sigUrl = `${base}${user.signatureUrl}`;
                }
            }
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const signatureData = await (0, signatureSnapshot_1.buildSignatureSnapshot)(sigUrl, baseUrl);
            const signature = await (0, signatureService_1.signTemplateAssignment)({
                templateAssignmentId,
                signerId: subAdminId,
                type: type,
                signatureUrl: sigUrl,
                signatureData,
                req,
                level: signatureLevel || undefined,
                signaturePeriodId,
                signatureSchoolYearId
            });
            // Create SavedGradebook snapshot after S1 signing only
            // S2/promotion snapshot is created during the promotion step
            if (type === 'standard') {
                try {
                    const snapshotReason = 'sem1';
                    const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
                    if (updatedAssignment) {
                        const student = await Student_1.Student.findById(updatedAssignment.studentId).lean();
                        const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: updatedAssignment.studentId }).lean();
                        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId }).lean();
                        // Get enrollment and class info
                        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
                        const schoolYearId = signatureSchoolYearId || (activeSchoolYear ? String(activeSchoolYear._id) : '');
                        let enrollment = null;
                        let className = '';
                        if (schoolYearId) {
                            enrollment = await Enrollment_1.Enrollment.findOne({ studentId: updatedAssignment.studentId, schoolYearId }).lean();
                            if (enrollment?.classId) {
                                const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                                if (cls)
                                    className = cls.name || '';
                            }
                        }
                        const snapshotData = {
                            student,
                            enrollment,
                            statuses,
                            assignment: updatedAssignment,
                            className,
                            signatures,
                            signature: signature || signatures.find((s) => s.type === 'standard') || null,
                            finalSignature: null,
                        };
                        await (0, rolloverService_1.createAssignmentSnapshot)(updatedAssignment, snapshotReason, {
                            schoolYearId,
                            level: signatureLevel || 'Sans niveau',
                            classId: enrollment?.classId || undefined,
                            data: snapshotData
                        });
                    }
                }
                catch (snapshotError) {
                    console.error('Failed to create snapshot after signing:', snapshotError);
                }
            }
            // Return created signature so client can update without extra fetch
            return res.json({ signature });
        }
        catch (e) {
            if (e.message === 'already_signed')
                return res.status(400).json({ error: 'already_signed' });
            if (e.message === 'not_found')
                return res.status(404).json({ error: 'not_found' });
            throw e;
        }
    }
    catch (e) {
        res.status(500).json({ error: 'sign_failed', message: e.message });
    }
});
// Sub-admin: Unsign a template
exports.subAdminTemplatesRouter.delete('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const authYearId = activeSchoolYear ? String(activeSchoolYear._id) : undefined;
        const authorized = await (0, signatureService_1.validateSignatureAuthorization)(subAdminId, assignment, authYearId);
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        const type = req.body.type || req.query.type || 'standard';
        // Get student level for signature scoping
        let signatureLevel = '';
        const studentForSig = await Student_1.Student.findById(assignment.studentId).lean();
        if (studentForSig) {
            signatureLevel = studentForSig.level || '';
            // Try to refine with class level
            if (activeSchoolYear) {
                const enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean();
                if (enrollment && enrollment.classId) {
                    const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (cls && cls.level)
                        signatureLevel = cls.level;
                }
            }
        }
        try {
            await (0, signatureService_1.unsignTemplateAssignment)({
                templateAssignmentId,
                signerId: subAdminId,
                type,
                req,
                level: signatureLevel || undefined
            });
        }
        catch (e) {
            if (e.message === 'not_found')
                return res.status(404).json({ error: 'not_found' });
            throw e;
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'unsign_failed', message: e.message });
    }
});
// Sub-admin: Get template assignment for review
exports.subAdminTemplatesRouter.get('/templates/:templateAssignmentId/review', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const authYearId = activeSchoolYear ? String(activeSchoolYear._id) : undefined;
        const authorized = await (0, signatureService_1.validateSignatureAuthorization)(subAdminId, assignment, authYearId);
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Get template and signature (no change history for sub-admin)
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        let signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId })
            .sort({ signedAt: -1 })
            .lean();
        const allSignatures = [...signatures];
        // Get student level and class name (Moved up for signature filtering)
        let level = student?.level || '';
        let className = '';
        let classId = null;
        if (student) {
            // Get active school year to ensure we get the CURRENT enrollment
            if (activeSchoolYear) {
                const enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean();
                if (enrollment && enrollment.classId) {
                    classId = String(enrollment.classId);
                    const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (classDoc) {
                        level = classDoc.level || student.level || '';
                        className = classDoc.name || '';
                    }
                }
            }
        }
        // Calculate level start date from promotions to filter out signatures from previous levels
        let levelStartDate = null;
        if (student && Array.isArray(student.promotions) && level) {
            // Find the promotion that put the student in the current level
            // We sort by date desc to get the latest promotion to this level (though usually unique)
            const relevantPromo = student.promotions
                .filter((p) => p.toLevel === level)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if (relevantPromo && relevantPromo.date) {
                levelStartDate = new Date(relevantPromo.date);
                console.log(`[/review] Found promotion to ${level} at ${levelStartDate}`);
            }
        }
        console.log('[/review] All signatures for assignment:', templateAssignmentId, signatures.map(s => ({
            id: s._id, type: s.type, signedAt: s.signedAt, subAdminId: s.subAdminId, level: s.level
        })));
        const allSchoolYears = await SchoolYear_1.SchoolYear.find({}).lean();
        const computeYearNameFromRange = (name, offset) => {
            const match = String(name || '').match(/(\d{4})([-/.])(\d{4})/);
            if (!match)
                return '';
            const startYear = parseInt(match[1], 10);
            const sep = match[2];
            const endYear = parseInt(match[3], 10);
            if (Number.isNaN(startYear) || Number.isNaN(endYear))
                return '';
            return `${startYear + offset}${sep}${endYear + offset}`;
        };
        const resolveSchoolYearForDate = (date) => {
            if (!date)
                return null;
            const d = new Date(date);
            if (!Number.isFinite(d.getTime()))
                return null;
            if (allSchoolYears && allSchoolYears.length > 0) {
                const match = allSchoolYears.find(y => {
                    if (!y.startDate || !y.endDate)
                        return false;
                    const start = new Date(y.startDate).getTime();
                    const end = new Date(y.endDate).getTime();
                    const t = d.getTime();
                    return t >= start && t <= end;
                });
                if (match)
                    return match;
            }
            return null;
        };
        const resolveSchoolYearName = (date) => {
            const match = resolveSchoolYearForDate(date);
            if (match?.name)
                return String(match.name);
            return '';
        };
        const resolveSignatureSchoolYearName = (sig) => {
            const t = String(sig?.type || 'standard');
            // 1. Get the year and next year from the date-based context
            const dateYearName = resolveSchoolYearName(sig?.signedAt);
            const nextDateYearName = dateYearName ? computeYearNameFromRange(dateYearName, 1) : '';
            // 2. Get the pinned year name from schoolYearId if it exists
            let pinnedYearName = '';
            if (sig?.schoolYearId) {
                const match = allSchoolYears.find(y => String(y._id) === String(sig.schoolYearId));
                if (match?.name)
                    pinnedYearName = String(match.name);
            }
            // Normalization: If it's a legacy end_of_year signature with pinnedYearName pointing 
            // to exactly 1 year after the signature date, revert it to the date (Source Year).
            if (t === 'end_of_year' && pinnedYearName && pinnedYearName === nextDateYearName) {
                return dateYearName;
            }
            return pinnedYearName || dateYearName || '';
        };
        const existingDataSignatures = Array.isArray(assignment.data?.signatures)
            ? [...assignment.data.signatures]
            : [];
        const mergedDataSignatures = [...existingDataSignatures];
        allSignatures.forEach(sig => {
            const already = mergedDataSignatures.some((s) => {
                const sameSubAdmin = String(s.subAdminId) === String(sig.subAdminId);
                const sameType = String(s.type || 'standard') === String(sig.type || 'standard');
                const sa = s.signedAt ? new Date(s.signedAt).getTime() : 0;
                const sb = sig.signedAt ? new Date(sig.signedAt).getTime() : 0;
                return sameSubAdmin && sameType && sa === sb;
            });
            if (already)
                return;
            mergedDataSignatures.push({
                type: sig.type,
                signedAt: sig.signedAt,
                subAdminId: sig.subAdminId,
                schoolYearId: undefined,
                schoolYearName: resolveSignatureSchoolYearName(sig),
                level: sig.level,
                signatureUrl: sig.signatureUrl, // Include stored signature image URL
                signatureData: sig.signatureData,
            });
        });
        assignment.data = assignment.data || {};
        assignment.data.signatures = mergedDataSignatures;
        const activeSchoolYearForSig = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const standardPeriodId = activeSchoolYearForSig ? (0, readinessUtils_1.computeSignaturePeriodId)(String(activeSchoolYearForSig._id), 'sem1') : null;
        const endOfYearPeriodId = activeSchoolYearForSig ? (0, readinessUtils_1.computeSignaturePeriodId)(String(activeSchoolYearForSig._id), 'end_of_year') : null;
        signatures = signatures.filter(s => {
            if (s.level && level && s.level !== level)
                return false;
            if (levelStartDate && s.signedAt) {
                const sigDate = new Date(s.signedAt).getTime();
                if (sigDate < levelStartDate.getTime())
                    return false;
            }
            return true;
        });
        const signature = signatures.find(s => {
            if (!(s.type === 'standard' || !s.type))
                return false;
            if (!standardPeriodId)
                return true;
            if (!s.signaturePeriodId)
                return true;
            return s.signaturePeriodId === standardPeriodId;
        });
        const finalSignature = signatures.find(s => {
            if (s.type !== 'end_of_year')
                return false;
            if (!endOfYearPeriodId)
                return true;
            if (!s.signaturePeriodId)
                return true;
            return s.signaturePeriodId === endOfYearPeriodId;
        });
        console.log('[/review] signature:', signature ? { id: signature._id, type: signature.type } : 'none');
        console.log('[/review] finalSignature:', finalSignature ? { id: finalSignature._id, type: finalSignature.type } : 'none');
        const isSignedByMe = signature && signature.subAdminId === subAdminId;
        // Level and className already calculated above
        // Use centralized helper for versioning and data merging
        const versionedTemplate = (0, templateUtils_1.mergeAssignmentDataIntoTemplate)(template, assignment);
        const canEdit = authorized && req.user.role !== 'AEFE';
        // Reuse previously fetched activeSchoolYear (declared above)
        // const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        const isPromoted = student?.promotions?.some((p) => p.schoolYearId === String(activeSchoolYear?._id));
        const activeSemester = activeSchoolYear?.activeSemester || 1;
        let eligibleForSign = assignment.status === 'completed' || assignment.status === 'signed';
        if (!eligibleForSign) {
            // First try to find an active enrollment with a classId
            let enrollment = activeSchoolYear ? await Enrollment_1.Enrollment.findOne({
                studentId: assignment.studentId,
                schoolYearId: activeSchoolYear._id,
                status: 'active',
                classId: { $exists: true, $ne: null }
            }).lean() : null;
            // If no active enrollment with class found, check for 'promoted' status enrollment
            // This handles promoted students who still need their previous class info
            if (!enrollment || !enrollment.classId) {
                enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    status: 'promoted',
                    classId: { $exists: true, $ne: null }
                }).sort({ updatedAt: -1 }).lean();
            }
            // Also fallback to any enrollment with a classId for the student
            if (!enrollment || !enrollment.classId) {
                enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    classId: { $exists: true, $ne: null }
                }).sort({ updatedAt: -1 }).lean();
            }
            const clsId = enrollment?.classId ? String(enrollment.classId) : undefined;
            const teacherAssignments = clsId ? await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: clsId }).lean() : [];
            const teacherCompletions = assignment.teacherCompletions || [];
            const categoriesRequired = new Set();
            if (versionedTemplate && Array.isArray(versionedTemplate.pages)) {
                for (let p = 0; p < versionedTemplate.pages.length; p++) {
                    const page = versionedTemplate.pages[p];
                    for (let b = 0; b < (page.blocks || []).length; b++) {
                        const block = page.blocks[b];
                        if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                            const items = block.props?.items || [];
                            for (const item of items) {
                                let isAssigned = true;
                                if (item?.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level))
                                        isAssigned = false;
                                }
                                if (!isAssigned)
                                    continue;
                                const raw = String(item.type || item.label || '');
                                const code = String(item.code || '').toLowerCase();
                                const l = raw.toLowerCase();
                                if (code === 'ar' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية'))
                                    categoriesRequired.add('ar');
                                else if (code === 'en' || l.includes('anglais') || l.includes('english'))
                                    categoriesRequired.add('en');
                                else
                                    categoriesRequired.add('poly');
                            }
                        }
                    }
                }
            }
            const isCatCompleted = (cat) => {
                let responsible = (teacherAssignments || [])
                    .filter((ta) => String(ta.classId) === String(clsId))
                    .filter((ta) => {
                    const langs = (ta.languages || []).map((x) => x.toLowerCase());
                    if (cat === 'ar') {
                        if (langs.length === 0)
                            return !ta.isProfPolyvalent;
                        return langs.some((v) => v === 'ar' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'));
                    }
                    if (cat === 'en') {
                        if (langs.length === 0)
                            return !ta.isProfPolyvalent;
                        return langs.some((v) => v === 'en' || v.includes('anglais') || v.includes('english'));
                    }
                    // Polyvalent: teachers explicitly marked as such OR teachers with no languages (and not explicitly polyvalent)
                    return ta.isProfPolyvalent || (langs.length === 0 && !ta.isProfPolyvalent);
                })
                    .map((ta) => String(ta.teacherId));
                if (responsible.length === 0)
                    responsible = (assignment.assignedTeachers || []).map((id) => String(id));
                return responsible.some((tid) => (teacherCompletions || []).some((tc) => String(tc.teacherId) === String(tid) && tc.completed));
            };
            let ok = true;
            for (const cat of categoriesRequired) {
                if (!isCatCompleted(cat)) {
                    ok = false;
                    break;
                }
            }
            eligibleForSign = ok;
        }
        let resolvedClassId = classId;
        if (!resolvedClassId) {
            const fallbackEnrollmentQuery = (q) => Enrollment_1.Enrollment.findOne(q).sort({ updatedAt: -1 }).lean();
            let enrollment = activeSchoolYear
                ? await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active',
                    classId: { $exists: true, $ne: null }
                })
                : null;
            if (!enrollment || !enrollment.classId) {
                enrollment = await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    status: 'promoted',
                    classId: { $exists: true, $ne: null }
                });
            }
            if (!enrollment || !enrollment.classId) {
                enrollment = await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    classId: { $exists: true, $ne: null }
                });
            }
            resolvedClassId = enrollment?.classId ? String(enrollment.classId) : null;
        }
        const teacherCompletions = assignment.teacherCompletions || [];
        const languageCompletions = assignment.languageCompletions || [];
        const languageCompletionMap = {};
        (Array.isArray(languageCompletions) ? languageCompletions : []).forEach((entry) => {
            const codeRaw = String(entry?.code || '').toLowerCase();
            const normalized = codeRaw === 'lb' || codeRaw === 'ar' ? 'ar' : (codeRaw === 'en' || codeRaw === 'uk' || codeRaw === 'gb') ? 'en' : codeRaw === 'fr' ? 'fr' : codeRaw;
            if (!normalized)
                return;
            languageCompletionMap[normalized] = { ...(entry || {}), code: normalized };
        });
        const teacherAssignments = resolvedClassId
            ? await TeacherClassAssignment_1.TeacherClassAssignment.find({
                classId: resolvedClassId,
                ...(activeSchoolYear?._id ? { schoolYearId: String(activeSchoolYear._id) } : {})
            }).lean()
            : [];
        const teacherIds = [...new Set((teacherAssignments || []).map((ta) => String(ta.teacherId)))];
        const [teachers, outlookTeachers] = teacherIds.length
            ? await Promise.all([
                User_1.User.find({ _id: { $in: teacherIds } }).lean(),
                OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean()
            ])
            : [[], []];
        const toTitleCase = (value) => value
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        const normalizeTeacherName = (teacher) => {
            const displayName = String(teacher?.displayName || '').trim();
            const email = String(teacher?.email || '').trim();
            if (displayName && displayName.toLowerCase() !== email.toLowerCase())
                return displayName;
            if (!email)
                return 'Unknown';
            const localPart = email.split('@')[0] || '';
            const cleaned = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
            return cleaned ? toTitleCase(cleaned) : email;
        };
        const teacherMap = new Map([...teachers, ...outlookTeachers].map((t) => [
            String(t._id),
            normalizeTeacherName(t)
        ]));
        const getTeacherName = (teacherId) => teacherMap.get(String(teacherId)) || 'Unknown';
        const langMatch = (langs, needles) => {
            const normalized = (langs || []).map(l => String(l || '').toLowerCase());
            return needles.some(n => normalized.some(v => v === n || v.includes(n)));
        };
        const isResponsibleTeacherFor = (ta, category) => {
            const langs = (ta.languages || []).map((x) => String(x || '').toLowerCase());
            if (category === 'poly')
                return ta.isProfPolyvalent || (langs.length === 0 && !ta.isProfPolyvalent);
            if (langs.length === 0)
                return !ta.isProfPolyvalent;
            if (category === 'ar')
                return langMatch(langs, ['ar', 'arabe', 'arabic', 'العربية']);
            return langMatch(langs, ['en', 'uk', 'gb', 'anglais', 'english']);
        };
        const arabicTeacherIds = (teacherAssignments || [])
            .filter((ta) => isResponsibleTeacherFor(ta, 'ar'))
            .map((ta) => String(ta.teacherId));
        const englishTeacherIds = (teacherAssignments || [])
            .filter((ta) => isResponsibleTeacherFor(ta, 'en'))
            .map((ta) => String(ta.teacherId));
        const polyvalentTeacherIds = (teacherAssignments || [])
            .filter((ta) => isResponsibleTeacherFor(ta, 'poly'))
            .map((ta) => String(ta.teacherId));
        const isLanguageDone = (langCode, semester, teacherIds) => {
            const entry = languageCompletionMap[langCode];
            if (entry) {
                if (semester === 1)
                    return !!(entry.completedSem1 || entry.completed);
                return !!entry.completedSem2;
            }
            const uniqueIds = [...new Set(teacherIds)];
            if (semester === 1) {
                return uniqueIds.some(tid => (teacherCompletions || []).some((tc) => String(tc.teacherId) === String(tid) && (tc.completedSem1 || tc.completed)));
            }
            return uniqueIds.some(tid => (teacherCompletions || []).some((tc) => String(tc.teacherId) === String(tid) && tc.completedSem2));
        };
        const groupStatus = (ids, langCode) => {
            const uniqueIds = [...new Set(ids)];
            const doneSem1 = isLanguageDone(langCode, 1, uniqueIds);
            const doneSem2 = isLanguageDone(langCode, 2, uniqueIds);
            const doneOverall = doneSem1 || doneSem2;
            return {
                teachers: uniqueIds.map(id => ({ id, name: getTeacherName(id) })),
                doneSem1,
                doneSem2,
                doneOverall
            };
        };
        const teacherStatus = {
            arabic: groupStatus(arabicTeacherIds, 'ar'),
            english: groupStatus(englishTeacherIds, 'en'),
            polyvalent: groupStatus(polyvalentTeacherIds, 'fr')
        };
        if (!assignment.data)
            assignment.data = {};
        assignment.data.signatures = mergedDataSignatures;
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        const subadminAssignedLevels = roleScope?.levels || [];
        // Get student's enrollments to allow fallback to last known class info
        const enrollments = await Enrollment_1.Enrollment.find({ studentId: assignment.studentId }).sort({ updatedAt: 1 }).lean();
        // Ensure level and className are populated from resolvedClassId or fallback to last known enrollment/student
        try {
            if ((!level || !className) && resolvedClassId) {
                const clsDoc = await Class_1.ClassModel.findById(resolvedClassId).lean();
                if (clsDoc) {
                    level = level || clsDoc.level || (student?.level || '');
                    className = className || clsDoc.name || (student?.className || '');
                }
            }
            if ((!level || !className) && enrollments && enrollments.length > 0) {
                const lastEnrollment = enrollments[enrollments.length - 1];
                level = level || lastEnrollment.level || (student?.level || '');
                className = className || lastEnrollment.className || (student?.className || '');
            }
        }
        catch (err) {
            console.warn('[/review] Error resolving class info for student:', err);
        }
        // Populate signatures into assignment.data.signatures for visibility checks
        const populatedAssignment = await (0, signatureService_1.populateSignatures)(assignment);
        res.json({
            assignment: populatedAssignment,
            template: versionedTemplate,
            student: { ...student, level, className },
            signature: signature || null,
            finalSignature: finalSignature || null,
            isSignedByMe: isSignedByMe || false,
            canEdit,
            isPromoted,
            activeSemester,
            eligibleForSign,
            teacherStatus,
            classId: resolvedClassId,
            subadminAssignedLevels
        });
    }
    catch (e) {
        console.error('[/review] Error:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Sign all templates for a class
exports.subAdminTemplatesRouter.post('/templates/sign-class/:classId', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
        const bypassScopes = req.user.bypassScopes || [];
        let canBypass = false;
        if (bypassScopes.some((s) => s.type === 'ALL')) {
            canBypass = true;
        }
        else if (bypassScopes.some((s) => s.type === 'CLASS' && s.value === classId)) {
            canBypass = true;
        }
        else {
            // Check LEVEL
            const cls = await Class_1.ClassModel.findById(classId).lean();
            if (cls && cls.level && bypassScopes.some((s) => s.type === 'LEVEL' && s.value === cls.level)) {
                canBypass = true;
            }
        }
        const activeYearForBulk = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const activeYearIdForBulk = activeYearForBulk ? String(activeYearForBulk._id) : '';
        const signaturePeriodIdForBulk = activeYearIdForBulk ? (0, readinessUtils_1.computeSignaturePeriodId)(activeYearIdForBulk, 'sem1') : '';
        const query = {
            studentId: { $in: studentIds },
            ...(activeYearIdForBulk ? { completionSchoolYearId: activeYearIdForBulk } : {})
        };
        if (!canBypass) {
            query.status = 'completed';
        }
        // Get all template assignments for these students
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find(query).lean();
        // Filter out those already signed for the CURRENT period
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const existingSignatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean();
        const signedIds = new Set(existingSignatures
            .filter((s) => {
            if (s.type && s.type !== 'standard')
                return false;
            if (!signaturePeriodIdForBulk)
                return true;
            return String(s.signaturePeriodId || '') === signaturePeriodIdForBulk;
        })
            .map((s) => String(s.templateAssignmentId)));
        const toSign = templateAssignments.filter(a => !signedIds.has(String(a._id)));
        // Create signatures for all unsigned assignments
        const signatures = await Promise.all(toSign.map(async (assignment) => {
            const type = 'standard';
            const signaturePeriodId = signaturePeriodIdForBulk;
            let signature = null;
            try {
                signature = await TemplateSignature_1.TemplateSignature.create({
                    templateAssignmentId: String(assignment._id),
                    subAdminId,
                    signedAt: new Date(),
                    status: 'signed',
                    type,
                    signaturePeriodId,
                    schoolYearId: activeYearIdForBulk || undefined
                });
            }
            catch (err) {
                const msg = String(err?.message || '');
                if (msg.includes('E11000') || msg.includes('duplicate key')) {
                    // Already signed by someone else concurrently; ignore for bulk
                    return null;
                }
                throw err;
            }
            // Update assignment status
            (0, assignmentMetadata_1.warnOnInvalidStatusTransition)(assignment.status, 'signed', 'subAdminTemplates.signClass');
            await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignment._id, (0, assignmentMetadata_1.normalizeAssignmentMetadataPatch)({ status: 'signed' }), (0, assignmentMetadata_1.assignmentUpdateOptions)());
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
            // Create SavedGradebook snapshot
            try {
                const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(assignment._id).lean();
                if (updatedAssignment && student) {
                    const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: assignment.studentId }).lean();
                    const allSigs = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean();
                    const enrollment = enrollments.find(e => String(e.studentId) === String(assignment.studentId));
                    const cls = await Class_1.ClassModel.findById(classId).lean();
                    const snapshotData = {
                        student,
                        enrollment,
                        statuses,
                        assignment: updatedAssignment,
                        className: cls?.name || '',
                        signatures: allSigs,
                        signature: allSigs.find((s) => s.type === 'standard') || null,
                        finalSignature: allSigs.find((s) => s.type === 'end_of_year') || null,
                    };
                    await (0, rolloverService_1.createAssignmentSnapshot)(updatedAssignment, 'sem1', {
                        schoolYearId: activeYearIdForBulk,
                        level: cls?.level || 'Sans niveau',
                        classId,
                        data: snapshotData
                    });
                }
            }
            catch (snapshotErr) {
                console.error('Failed to create snapshot in sign-class:', snapshotErr);
            }
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
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/mark-done', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, (0, assignmentMetadata_1.normalizeAssignmentMetadataPatch)({
            isCompleted: true,
            completedAt: new Date(),
            completedBy: subAdminId,
        }), (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true }));
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
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/unmark-done', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
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
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, (0, assignmentMetadata_1.normalizeAssignmentMetadataPatch)({
            isCompleted: false,
            completedAt: null,
            completedBy: null,
        }), (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true }));
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
// Sub-admin: Update template data (e.g. language toggles or scoped data)
exports.subAdminTemplatesRouter.patch('/templates/:assignmentId/data', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        const { type, pageIndex, blockIndex, items, data } = req.body;
        if (!type && !data)
            return res.status(400).json({ error: 'missing_payload' });
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify authorization
        // Check if sub-admin is assigned to any teacher of the student's class
        const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId }).lean();
        if (!enrollment)
            return res.status(403).json({ error: 'student_not_enrolled' });
        let authorized = false;
        if (enrollment.classId) {
            const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollment.classId }).lean();
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
                    const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true;
                    }
                }
            }
        }
        else {
            // If no class (e.g. promoted), check direct assignment to teachers?
            // Or maybe check if sub-admin is assigned to the student's *previous* teachers?
            // For now, if no class, we might rely on direct assignment check if implemented, 
            // but here we only check class-based authorization.
            // Let's check if the assignment has assignedTeachers (direct assignment)
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean();
                if (subAdminAssignments.length > 0)
                    authorized = true;
            }
        }
        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Prevent AEFE/RPP users from making direct edits here — they can only make suggestions
        const userRole = req.user.role;
        if (userRole === 'AEFE') {
            return res.status(403).json({ error: 'not_authorized_to_edit', message: 'AEFE users may only suggest changes' });
        }
        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' });
            }
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).select('pages').lean();
            const block = template?.pages?.[pageIndex]?.blocks?.[blockIndex];
            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
            const keyStable = blockId ? `language_toggle_${blockId}` : `language_toggle_${pageIndex}_${blockIndex}`;
            // Update assignment data
            const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
                $set: {
                    [`data.${keyStable}`]: items
                }
            }, (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true }));
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
        else if (data) {
            const currentData = assignment.data || {};
            // Use optimistic concurrency if client provides expectedDataVersion
            const { expectedDataVersion } = req.body;
            const { generateChangeId } = require('../utils/changeId');
            const changeId = generateChangeId();
            const filter = { _id: assignmentId };
            if (typeof expectedDataVersion === 'number')
                filter.dataVersion = expectedDataVersion;
            // Build targeted $set operations for each top-level key in the incoming data patch
            const setOps = {};
            for (const k of Object.keys(data || {})) {
                setOps[`data.${k}`] = data[k];
            }
            // Ensure we preserve other data keys and mark status
            const updated = await TemplateAssignment_1.TemplateAssignment.findOneAndUpdate(filter, {
                $set: {
                    ...setOps,
                    status: assignment.status === 'draft' ? 'in_progress' : assignment.status
                },
                $inc: { dataVersion: 1 }
            }, (0, assignmentMetadata_1.assignmentUpdateOptions)({ new: true }));
            (0, assignmentMetadata_1.warnOnInvalidStatusTransition)(assignment.status, assignment.status === 'draft' ? 'in_progress' : assignment.status, 'subAdminTemplates.dataPatch');
            if (!updated) {
                const current = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
                return res.status(409).json({ error: 'conflict', message: 'data_version_mismatch', current });
            }
            await (0, auditLogger_1.logAudit)({
                userId: subAdminId,
                action: 'UPDATE_TEMPLATE_DATA',
                details: {
                    assignmentId,
                    type: type || 'generic',
                    data
                },
                req,
            });
            // Persist change log entry
            await TemplateChangeLog_1.TemplateChangeLog.create({
                templateAssignmentId: assignmentId,
                teacherId: subAdminId,
                changeType: type || 'generic',
                pageIndex: typeof pageIndex === 'number' ? pageIndex : -1,
                blockIndex: typeof blockIndex === 'number' ? blockIndex : -1,
                before: currentData,
                after: updated.data,
                changeId,
                dataVersion: updated.dataVersion,
                userId: subAdminId,
                timestamp: new Date(),
            });
            res.json({ success: true, assignment: updated, changeId, dataVersion: updated.dataVersion });
        }
        else {
            res.status(400).json({ error: 'unsupported_type' });
        }
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Sub-admin: Get students in assigned levels
exports.subAdminTemplatesRouter.get('/students', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get active school year
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeSchoolYear)
            return res.json([]);
        // Get RoleScope for levels
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        const levels = roleScope?.levels || [];
        if (levels.length === 0) {
            return res.json([]);
        }
        // Get classes in these levels
        const classes = await Class_1.ClassModel.find({
            level: { $in: levels },
            schoolYearId: activeSchoolYear._id
        }).lean();
        const classIds = classes.map(c => String(c._id));
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        // Get enrollments in these classes
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: activeSchoolYear._id
        }).lean();
        const enrolledStudentIds = enrollments.map(e => e.studentId);
        const enrollmentMap = new Map(enrollments.map(e => [e.studentId, e]));
        // Get students by enrollment only (do not include unassigned students by level)
        const studentsByEnrollment = await Student_1.Student.find({ _id: { $in: enrolledStudentIds } }).lean();
        // Merge and deduplicate
        const allStudents = [...studentsByEnrollment];
        const uniqueStudents = Array.from(new Map(allStudents.map(s => [String(s._id), s])).values());
        // Attach class info
        const result = uniqueStudents.map(s => {
            const enrollment = enrollmentMap.get(String(s._id));
            const cls = (enrollment && enrollment.classId) ? classMap.get(enrollment.classId) : null;
            return {
                ...s,
                classId: cls ? String(cls._id) : undefined,
                className: cls ? cls.name : undefined,
                level: cls ? cls.level : s.level
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Assign student to class
exports.subAdminTemplatesRouter.post('/assign-student', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { studentId, classId } = req.body;
        if (!studentId || !classId)
            return res.status(400).json({ error: 'missing_params' });
        // Verify class is allowed
        const cls = await Class_1.ClassModel.findById(classId).lean();
        if (!cls)
            return res.status(404).json({ error: 'class_not_found' });
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        const levels = roleScope?.levels || [];
        if (!cls.level || !levels.includes(cls.level)) {
            return res.status(403).json({ error: 'not_authorized_for_level' });
        }
        // Get active school year
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeSchoolYear)
            return res.status(400).json({ error: 'no_active_year' });
        if (String(cls.schoolYearId) !== String(activeSchoolYear._id)) {
            return res.status(400).json({ error: 'class_wrong_year' });
        }
        // Update/Create enrollment
        const existing = await Enrollment_1.Enrollment.findOne({
            studentId,
            schoolYearId: activeSchoolYear._id
        });
        if (existing) {
            existing.classId = classId;
            await existing.save();
            if (cls && cls.level) {
                await (0, templateUtils_1.checkAndAssignTemplates)(studentId, cls.level, String(activeSchoolYear._id), classId, req.user.userId);
            }
        }
        else {
            await Enrollment_1.Enrollment.create({
                studentId,
                classId,
                schoolYearId: activeSchoolYear._id
            });
            if (cls && cls.level) {
                await (0, templateUtils_1.checkAndAssignTemplates)(studentId, cls.level, String(activeSchoolYear._id), classId, req.user.userId);
            }
        }
        // Update student level to match class level
        await Student_1.Student.findByIdAndUpdate(studentId, { level: cls.level });
        // Update template assignments
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId }).lean();
        const teacherIds = teacherAssignments.map(t => t.teacherId);
        await TemplateAssignment_1.TemplateAssignment.updateMany({
            studentId,
            status: { $in: ['draft', 'in_progress'] }
        }, { $set: { assignedTeachers: teacherIds } }, (0, assignmentMetadata_1.assignmentUpdateOptions)());
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'assign_failed', message: e.message });
    }
});
