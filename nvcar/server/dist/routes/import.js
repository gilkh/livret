"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Class_1 = require("../models/Class");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const CsvImportJob_1 = require("../models/CsvImportJob");
const SchoolYear_1 = require("../models/SchoolYear");
const sync_1 = require("csv-parse/sync");
const templateUtils_1 = require("../utils/templateUtils");
const transactionUtils_1 = require("../utils/transactionUtils");
exports.importRouter = (0, express_1.Router)();
exports.importRouter.post('/students', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { csv, schoolYearId, dryRun, mapping } = req.body;
    if (!csv || !schoolYearId)
        return res.status(400).json({ error: 'missing_payload' });
    const records = (0, sync_1.parse)(csv, { columns: true, skip_empty_lines: true, trim: true });
    // Get the join year from the school year
    let joinYear = new Date().getFullYear().toString();
    const schoolYear = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
    if (schoolYear && schoolYear.name) {
        const match = schoolYear.name.match(/(\d{4})/);
        if (match)
            joinYear = match[1];
    }
    // For dry run, just validate without transaction
    if (dryRun) {
        let added = 0, updated = 0, errorCount = 0;
        const report = [];
        for (const r of records) {
            try {
                const col = (k, def) => r[(mapping && mapping[k]) || def];
                const firstName = col('firstName', 'FirstName');
                const lastName = col('lastName', 'LastName');
                const dob = new Date(col('dateOfBirth', 'DateOfBirth'));
                const className = col('className', 'ClassName');
                // Check for existing student by name pattern (any year)
                const baseKeyPattern = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_`;
                const existing = await Student_1.Student.findOne({
                    logicalKey: { $regex: `^${baseKeyPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
                });
                if (existing) {
                    updated += 1;
                    report.push({ status: 'would_update', studentId: String(existing._id) });
                }
                else {
                    added += 1;
                    report.push({ status: 'would_add', firstName, lastName });
                }
            }
            catch (e) {
                errorCount++;
                report.push({ status: 'error', message: e.message });
            }
        }
        const summary = `${added} élèves à ajouter — ${updated} à mettre à jour — ${errorCount} en erreur`;
        return res.json({ added, updated, errorCount, report, summary, dryRun: true });
    }
    // Execute the import within a transaction for atomicity
    const result = await (0, transactionUtils_1.withTransaction)(async (session) => {
        let added = 0, updated = 0, errorCount = 0;
        const report = [];
        const userId = req.user.userId;
        for (const r of records) {
            try {
                const col = (k, def) => r[(mapping && mapping[k]) || def];
                const firstName = col('firstName', 'FirstName');
                const lastName = col('lastName', 'LastName');
                const dob = new Date(col('dateOfBirth', 'DateOfBirth'));
                const className = col('className', 'ClassName');
                const parentName = col('parentName', 'ParentName');
                const parentPhone = col('parentPhone', 'ParentPhone');
                // Check for existing student by name pattern (any year)
                const baseKeyPattern = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_`;
                const existing = await Student_1.Student.findOne({
                    logicalKey: { $regex: `^${baseKeyPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
                }).session(session);
                let student;
                if (existing) {
                    student = await Student_1.Student.findByIdAndUpdate(existing._id, { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, { new: true, session });
                    updated += 1;
                }
                else {
                    // Generate logicalKey as firstName_lastName_yearJoined with suffix for duplicates
                    const baseKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${joinYear}`;
                    let key = baseKey;
                    let suffix = 1;
                    let keyExists = await Student_1.Student.findOne({ logicalKey: key }).session(session);
                    while (keyExists) {
                        suffix++;
                        key = `${baseKey}_${suffix}`;
                        keyExists = await Student_1.Student.findOne({ logicalKey: key }).session(session);
                    }
                    const created = await Student_1.Student.create([{
                            logicalKey: key,
                            firstName,
                            lastName,
                            dateOfBirth: dob,
                            parentName,
                            parentPhone
                        }], { session });
                    student = created[0];
                    added += 1;
                }
                // Find or create class
                let cls = await Class_1.ClassModel.findOne({ name: className, schoolYearId }).session(session);
                if (!cls) {
                    // Extract level from class name (e.g., "PS A" -> "PS", "MS B" -> "MS", "GS C" -> "GS")
                    let classLevel;
                    const levelMatch = className.match(/^(PS|MS|GS)/i);
                    if (levelMatch) {
                        classLevel = levelMatch[1].toUpperCase();
                    }
                    const created = await Class_1.ClassModel.create([{
                            name: className,
                            schoolYearId,
                            level: classLevel
                        }], { session });
                    cls = created[0];
                }
                // Create enrollment if not exists
                const enrollmentExists = await Enrollment_1.Enrollment.findOne({
                    studentId: String(student._id),
                    classId: String(cls._id),
                    schoolYearId
                }).session(session);
                if (!enrollmentExists) {
                    await Enrollment_1.Enrollment.create([{
                            studentId: String(student._id),
                            classId: String(cls._id),
                            schoolYearId
                        }], { session });
                    // Auto-assign templates based on level
                    if (cls && cls.level) {
                        await (0, templateUtils_1.checkAndAssignTemplates)(String(student._id), cls.level, schoolYearId, String(cls._id), userId);
                    }
                }
                report.push({
                    status: existing ? 'updated' : 'added',
                    studentId: String(student._id),
                    classId: String(cls._id)
                });
            }
            catch (e) {
                errorCount++;
                report.push({ status: 'error', message: e.message });
                // In a transaction, we might want to fail fast on errors
                // For now, we continue to collect all errors
            }
        }
        // If there were errors, we might want to abort
        // For now, we allow partial success within the transaction
        // The transaction ensures all successful operations are atomic
        return { added, updated, errorCount, report };
    });
    if (!result.success) {
        return res.status(500).json({
            error: 'import_failed',
            message: result.error,
            transactionUsed: result.usedTransaction
        });
    }
    const { added, updated, errorCount, report } = result.data;
    const summary = `${added} élèves ajoutés — ${updated} mis à jour — ${errorCount} en erreur`;
    // Log the import job
    await CsvImportJob_1.CsvImportJob.create({
        addedCount: added,
        updatedCount: updated,
        errorCount,
        reportJson: JSON.stringify(report),
        transactionUsed: result.usedTransaction
    });
    res.json({ added, updated, errorCount, report, summary, transactionUsed: result.usedTransaction });
});
