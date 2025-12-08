"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Class_1 = require("../models/Class");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const CsvImportJob_1 = require("../models/CsvImportJob");
const sync_1 = require("csv-parse/sync");
const templateUtils_1 = require("../utils/templateUtils");
exports.importRouter = (0, express_1.Router)();
exports.importRouter.post('/students', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { csv, schoolYearId, dryRun, mapping } = req.body;
    if (!csv || !schoolYearId)
        return res.status(400).json({ error: 'missing_payload' });
    const records = (0, sync_1.parse)(csv, { columns: true, skip_empty_lines: true, trim: true });
    let added = 0, updated = 0, errorCount = 0;
    const report = [];
    for (const r of records) {
        try {
            const col = (k, def) => r[(mapping && mapping[k]) || def];
            const firstName = col('firstName', 'FirstName');
            const lastName = col('lastName', 'LastName');
            const dob = new Date(col('dateOfBirth', 'DateOfBirth'));
            const className = col('className', 'ClassName');
            const parentName = col('parentName', 'ParentName');
            const parentPhone = col('parentPhone', 'ParentPhone');
            const key = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${dob.toISOString().slice(0, 10)}`;
            const existing = await Student_1.Student.findOne({ logicalKey: key });
            let student;
            if (existing) {
                student = await Student_1.Student.findByIdAndUpdate(existing._id, { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, { new: true });
                updated += 1;
            }
            else {
                student = await Student_1.Student.create({ logicalKey: key, firstName, lastName, dateOfBirth: dob, parentName, parentPhone });
                added += 1;
            }
            let cls = await Class_1.ClassModel.findOne({ name: className, schoolYearId });
            if (!cls) {
                cls = await Class_1.ClassModel.create({ name: className, schoolYearId });
            }
            const enrollmentExists = await Enrollment_1.Enrollment.findOne({ studentId: String(student._id), classId: String(cls._id), schoolYearId });
            if (!enrollmentExists) {
                await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId });
                if (cls && cls.level) {
                    await (0, templateUtils_1.checkAndAssignTemplates)(String(student._id), cls.level, schoolYearId, String(cls._id), req.user.userId);
                }
            }
            report.push({ status: existing ? 'updated' : 'added', studentId: String(student._id), classId: String(cls._id) });
        }
        catch (e) {
            errorCount++;
            report.push({ status: 'error', message: e.message });
        }
    }
    const summary = `${added} élèves ajoutés — ${updated} mis à jour — ${errorCount} en erreur`;
    if (!dryRun) {
        await CsvImportJob_1.CsvImportJob.create({ addedCount: added, updatedCount: updated, errorCount, reportJson: JSON.stringify(report) });
    }
    res.json({ added, updated, errorCount, report, summary });
});
