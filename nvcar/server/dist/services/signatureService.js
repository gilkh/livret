"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsignTemplateAssignment = exports.signTemplateAssignment = void 0;
exports.populateSignatures = populateSignatures;
exports.validateSignatureAuthorization = validateSignatureAuthorization;
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Student_1 = require("../models/Student");
const SchoolYear_1 = require("../models/SchoolYear");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const auditLogger_1 = require("../utils/auditLogger");
const TemplateChangeLog_1 = require("../models/TemplateChangeLog");
const changeId_1 = require("../utils/changeId");
const readinessUtils_1 = require("../utils/readinessUtils");
const Level_1 = require("../models/Level");
const mongoose_1 = __importDefault(require("mongoose"));
// Auth imports
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const Enrollment_1 = require("../models/Enrollment");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const RoleScope_1 = require("../models/RoleScope");
/**
 * Check if an error is a MongoDB duplicate key error (code 11000).
 * This happens when the unique compound index prevents duplicate signatures.
 */
function isDuplicateKeyError(err) {
    if (!err)
        return false;
    // MongoDB duplicate key error code
    if (err.code === 11000)
        return true;
    // Check for WriteError with duplicate key
    if (err.writeErrors && err.writeErrors.some((e) => e.code === 11000))
        return true;
    // Check message for E11000 (MongoDB error format)
    if (typeof err.message === 'string' && err.message.includes('E11000'))
        return true;
    return false;
}
/**
 * Handle duplicate key error by reading the existing signature (read-on-conflict).
 * Returns the existing signature if found, throws otherwise.
 */
async function handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level) {
    // Read the existing signature that caused the conflict
    const query = { templateAssignmentId, type, signaturePeriodId };
    if (level)
        query.level = level;
    const existingSignature = await TemplateSignature_1.TemplateSignature.findOne(query).lean();
    if (existingSignature) {
        // Signature already exists - throw friendly error
        throw new Error('already_signed');
    }
    // Edge case: signature was deleted between insert and read
    throw new Error('signature_conflict');
}
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
/**
 * Resolve signature school year and signaturePeriodId
 * Uses centralized readiness utils for consistency
 */
const resolveSignatureSchoolYearWithPeriod = async (activeYear, type, now) => {
    // If no active year, we cannot reliably determine signaturePeriodId
    if (!activeYear) {
        return { schoolYearId: undefined, schoolYearName: '', signaturePeriodId: '' };
    }
    const activeYearId = String(activeYear._id);
    const schoolYearName = String(activeYear.name || '');
    // For both standard and end_of_year, the signature belongs to the active school year session.
    // The signaturePeriodId (e.g. '...-sem1' vs '...-end_of_year') distinguishes them.
    const periodType = type === 'end_of_year' ? 'end_of_year' : 'sem1';
    const signaturePeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(activeYearId, periodType);
    return {
        schoolYearId: activeYearId,
        schoolYearName,
        signaturePeriodId
    };
};
const getNextLevel = async (current) => {
    if (!current)
        return null;
    // Try to find by DB order
    try {
        const currentDoc = await Level_1.Level.findOne({ name: current }).lean();
        if (currentDoc) {
            const nextDoc = await Level_1.Level.findOne({ order: currentDoc.order + 1 }).lean();
            if (nextDoc)
                return nextDoc.name;
        }
    }
    catch (e) {
        console.error('Error calculating next level:', e);
    }
    // Fallback legacy logic
    const c = current.toUpperCase();
    if (c === 'TPS')
        return 'PS';
    if (c === 'PS')
        return 'MS';
    if (c === 'MS')
        return 'GS';
    if (c === 'GS')
        return 'EB1';
    if (c === 'KG1')
        return 'KG2';
    if (c === 'KG2')
        return 'KG3';
    if (c === 'KG3')
        return 'EB1';
    return null;
};
/**
 * Populate signatures into assignment.data.signatures from TemplateSignature collection.
 * This is the read-side fix for the Data Consistency Crisis.
 */
async function populateSignatures(assignments) {
    if (!assignments)
        return assignments;
    const isArray = Array.isArray(assignments);
    const list = isArray ? assignments : [assignments];
    if (list.length === 0)
        return assignments;
    const ids = list.map((a) => String(a._id));
    const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: ids } }).lean();
    const sigMap = new Map();
    signatures.forEach(s => {
        const key = String(s.templateAssignmentId);
        if (!sigMap.has(key))
            sigMap.set(key, []);
        sigMap.get(key)?.push(s);
    });
    list.forEach((a) => {
        if (!a.data)
            a.data = {};
        // Overwrite or set data.signatures from the single source of truth
        a.data.signatures = sigMap.get(String(a._id)) || [];
    });
    return assignments;
}
/**
 * Centralized authorization logic for SubAdmins.
 * Fixes Authorization Logic Vulnerabilities.
 */
async function validateSignatureAuthorization(subAdminId, assignment, schoolYearId) {
    // 1. Direct assignment check
    if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
        const direct = await SubAdminAssignment_1.SubAdminAssignment.exists({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers }
        });
        if (direct)
            return true;
    }
    // 2. Enrollment/Class based check
    const enrollments = await Enrollment_1.Enrollment.find({
        studentId: assignment.studentId,
        ...(schoolYearId ? { schoolYearId } : {})
    }).lean();
    const classIds = enrollments.map(e => e.classId).filter(Boolean);
    if (classIds.length > 0) {
        // Check if subadmin manages any teacher of these classes
        const teacherClassAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            classId: { $in: classIds },
            ...(schoolYearId ? { schoolYearId } : {})
        }).select('teacherId').lean();
        const teacherIds = teacherClassAssignments.map(t => t.teacherId);
        if (teacherIds.length > 0) {
            const classMatch = await SubAdminAssignment_1.SubAdminAssignment.exists({
                subAdminId,
                teacherId: { $in: teacherIds }
            });
            if (classMatch)
                return true;
        }
        // Check RoleScope (Level based)
        const roleScope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (roleScope?.levels?.length) {
            const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).select('level').lean();
            if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                return true;
            }
        }
    }
    // 3. Promotion check (Fallback)
    // If user promoted the student recently, they might have access
    const student = await Student_1.Student.findById(assignment.studentId).select('promotions').lean();
    if (student && Array.isArray(student.promotions) && student.promotions.length > 0) {
        const lastPromotion = student.promotions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        if (lastPromotion &&
            String(lastPromotion.promotedBy) === String(subAdminId) &&
            (!schoolYearId || String(lastPromotion.schoolYearId || '') === String(schoolYearId))) {
            return true;
        }
    }
    return false;
}
const signTemplateAssignment = async ({ templateAssignmentId, signerId, type = 'standard', signatureUrl, req, level, signaturePeriodId: explicitSignaturePeriodId, signatureSchoolYearId: explicitSchoolYearId }) => {
    // Get the template assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    // Prefer an explicit signaturePeriodId if provided; otherwise resolve from current school year and type
    const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
    if (!explicitSignaturePeriodId) {
        const resolved = await resolveSignatureSchoolYearWithPeriod(activeYear, type, new Date());
        explicitSignaturePeriodId = resolved.signaturePeriodId;
        if (!explicitSchoolYearId)
            explicitSchoolYearId = resolved.schoolYearId;
    }
    // Final guard
    if (!explicitSignaturePeriodId)
        throw new Error('cannot_resolve_signature_period');
    const existingQuery = (() => {
        const base = { templateAssignmentId, type, signaturePeriodId: explicitSignaturePeriodId };
        if (!level)
            return base;
        return {
            ...base,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        };
    })();
    const existing = await TemplateSignature_1.TemplateSignature.findOne(existingQuery).lean();
    if (existing)
        throw new Error('already_signed');
    // Check completion status for the requested semester
    // Unifies completion status logic (Task 4)
    const isCompletedSem1 = assignment.isCompletedSem1 || assignment.isCompleted || false;
    const isCompletedSem2 = assignment.isCompletedSem2 || false;
    if (type === 'standard') {
        if (!isCompletedSem1) {
            throw new Error('not_completed_sem1');
        }
    }
    else if (type === 'end_of_year') {
        if (!isCompletedSem2) {
            throw new Error('not_completed_sem2');
        }
    }
    // Create signature and persist metadata atomically using a transaction when possible
    const now = new Date();
    let signaturePeriodId = explicitSignaturePeriodId;
    let schoolYearId = explicitSchoolYearId;
    // Ensure we have a valid period id
    if (!signaturePeriodId) {
        throw new Error('cannot_resolve_signature_period');
    }
    let signature = null;
    const session = await mongoose_1.default.startSession();
    let usedTransaction = true;
    try {
        session.startTransaction();
    }
    catch (e) {
        // Transactions not supported in this environment
        usedTransaction = false;
    }
    try {
        // Standardized transaction handling (Task 3)
        // Fixes Data Consistency (Task 1) by NOT pushing to assignment.data.signatures
        if (usedTransaction) {
            try {
                // Double check existence inside transaction
                const doubleCheck = await TemplateSignature_1.TemplateSignature.findOne(existingQuery).session(session);
                if (doubleCheck)
                    throw new Error('already_signed');
                const createdSignature = await new TemplateSignature_1.TemplateSignature({
                    templateAssignmentId,
                    subAdminId: signerId,
                    signedAt: now,
                    status: 'signed',
                    type,
                    signatureUrl,
                    level,
                    signaturePeriodId,
                    schoolYearId
                }).save({ session });
                signature = createdSignature;
                const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                    $inc: { dataVersion: 1 },
                    $set: { status: 'signed' }
                }, { new: true, session });
                await TemplateChangeLog_1.TemplateChangeLog.create([
                    {
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'signature',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: undefined, // We don't store signatures in data anymore
                        changeId: (0, changeId_1.generateChangeId)(),
                        dataVersion: updatedAssignment ? updatedAssignment.dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    }
                ], { session });
                await session.commitTransaction();
            }
            catch (e) {
                const msg = String(e?.message || '');
                if (msg.includes('Transaction numbers are only allowed')) {
                    try {
                        await session.abortTransaction();
                    }
                    catch (err) { }
                    usedTransaction = false;
                }
                else {
                    if (isDuplicateKeyError(e) || msg.includes('already_signed')) {
                        try {
                            await session.abortTransaction();
                        }
                        catch (err) { }
                        await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level);
                    }
                    // If transaction failed but it wasn't a duplicate key, abort and rethrow
                    try {
                        await session.abortTransaction();
                    }
                    catch (err) { }
                    throw e;
                }
            }
        }
        if (!usedTransaction) {
            // Fallback: no transactions (for tests/local)
            // Still respecting single source of truth
            try {
                const createdSignature = await new TemplateSignature_1.TemplateSignature({
                    templateAssignmentId,
                    subAdminId: signerId,
                    signedAt: now,
                    status: 'signed',
                    type,
                    signatureUrl,
                    level,
                    signaturePeriodId,
                    schoolYearId
                }).save();
                signature = createdSignature;
                const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                    $inc: { dataVersion: 1 },
                    $set: { status: 'signed' }
                }, { new: true });
                try {
                    await TemplateChangeLog_1.TemplateChangeLog.create({
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'signature',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: undefined,
                        changeId: (0, changeId_1.generateChangeId)(),
                        dataVersion: updatedAssignment ? updatedAssignment.dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    });
                }
                catch (e) {
                    console.error('Failed to log signature change:', e);
                }
            }
            catch (e) {
                if (isDuplicateKeyError(e)) {
                    await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level);
                }
                // Cleanup if created but subsequent steps failed (unlikely here since we only create one doc now)
                if (signature) {
                    try {
                        await TemplateSignature_1.TemplateSignature.deleteOne({ _id: signature._id });
                    }
                    catch (err) { }
                }
                throw e;
            }
        }
    }
    finally {
        session.endSession();
    }
    // Log audit
    const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
    const student = await Student_1.Student.findById(assignment.studentId).lean();
    await (0, auditLogger_1.logAudit)({
        userId: signerId,
        action: 'SIGN_TEMPLATE',
        details: {
            templateId: assignment.templateId,
            templateName: template?.name,
            studentId: assignment.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            type
        },
        req,
    });
    return signature;
};
exports.signTemplateAssignment = signTemplateAssignment;
const unsignTemplateAssignment = async ({ templateAssignmentId, signerId, type, req, level, signaturePeriodId: explicitSignaturePeriodId }) => {
    // Get assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    let signaturePeriodId = explicitSignaturePeriodId;
    if (!signaturePeriodId && type) {
        if (type === 'end_of_year') {
            const periodInfo = await (0, readinessUtils_1.resolveEndOfYearSignaturePeriod)();
            signaturePeriodId = periodInfo.signaturePeriodId;
        }
        else {
            const periodInfo = await (0, readinessUtils_1.resolveCurrentSignaturePeriod)();
            signaturePeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(periodInfo.schoolYearId, 'sem1');
        }
    }
    const baseQuery = { templateAssignmentId };
    if (type)
        baseQuery.type = type;
    if (signaturePeriodId)
        baseQuery.signaturePeriodId = signaturePeriodId;
    const deleteQuery = (() => {
        if (!level)
            return baseQuery;
        return {
            ...baseQuery,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        };
    })();
    // Remove signatures & update assignment in a transaction if possible
    const session = await mongoose_1.default.startSession();
    let usedTransaction = true;
    try {
        try {
            session.startTransaction();
        }
        catch (e) {
            usedTransaction = false;
        }
        if (usedTransaction) {
            try {
                await TemplateSignature_1.TemplateSignature.deleteMany(deleteQuery).session(session);
                if (type === 'end_of_year') {
                    if (assignment.data && assignment.data.promotions) {
                        const updatedPromotions = assignment.data.promotions.filter((p) => p.by !== signerId);
                        if (updatedPromotions.length !== assignment.data.promotions.length) {
                            assignment.data.promotions = updatedPromotions;
                            assignment.markModified('data');
                            await assignment.save({ session });
                        }
                    }
                }
                const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                    // No need to pull from data.signatures as we don't store it there anymore
                    $inc: { dataVersion: 1 }
                }, { new: true, session });
                const remaining = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId }).session(session);
                if (remaining === 0) {
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed', $inc: { dataVersion: 1 } }, { session });
                }
                try {
                    await TemplateChangeLog_1.TemplateChangeLog.create([{
                            templateAssignmentId,
                            teacherId: signerId,
                            changeType: 'unsign',
                            pageIndex: -1,
                            blockIndex: -1,
                            before: assignment.data && (assignment.data.signatures || []),
                            after: undefined,
                            changeId: (0, changeId_1.generateChangeId)(),
                            dataVersion: updatedAssignment ? updatedAssignment.dataVersion : -1,
                            userId: signerId,
                            timestamp: new Date(),
                        }], { session });
                }
                catch (e) {
                    console.error('Failed to log unsign change:', e);
                }
                await session.commitTransaction();
            }
            catch (e) {
                if (e.message && e.message.includes('Transaction numbers are only allowed')) {
                    try {
                        await session.abortTransaction();
                    }
                    catch (err) { }
                    usedTransaction = false;
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
        if (!usedTransaction) {
            // Fallback: no transactions
            try {
                await TemplateSignature_1.TemplateSignature.deleteMany(deleteQuery);
                if (type === 'end_of_year') {
                    if (assignment.data && assignment.data.promotions) {
                        const updatedPromotions = assignment.data.promotions.filter((p) => p.by !== signerId);
                        if (updatedPromotions.length !== assignment.data.promotions.length) {
                            assignment.data.promotions = updatedPromotions;
                            assignment.markModified('data');
                            await assignment.save();
                        }
                    }
                }
                const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                    $inc: { dataVersion: 1 }
                }, { new: true });
                const remaining = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId });
                if (remaining === 0) {
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed', $inc: { dataVersion: 1 } });
                }
                try {
                    await TemplateChangeLog_1.TemplateChangeLog.create({
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'unsign',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: undefined,
                        changeId: (0, changeId_1.generateChangeId)(),
                        dataVersion: updatedAssignment ? updatedAssignment.dataVersion : -1,
                        userId: signerId,
                        timestamp: new Date(),
                    });
                }
                catch (e) {
                    console.error('Failed to log unsign change:', e);
                }
            }
            catch (e) {
                throw e;
            }
        }
    }
    finally {
        session.endSession();
    }
    // Log audit
    const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
    const student = await Student_1.Student.findById(assignment.studentId).lean();
    await (0, auditLogger_1.logAudit)({
        userId: signerId,
        action: 'UNSIGN_TEMPLATE',
        details: {
            templateId: assignment.templateId,
            templateName: template?.name,
            studentId: assignment.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            type
        },
        req,
    });
    return { success: true };
};
exports.unsignTemplateAssignment = unsignTemplateAssignment;
