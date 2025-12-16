"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Class_1 = require("../models/Class");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const AuditLog_1 = require("../models/AuditLog");
const StudentAcquiredSkill_1 = require("../models/StudentAcquiredSkill");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
exports.analyticsRouter = (0, express_1.Router)();
exports.analyticsRouter.get('/', async (req, res) => {
    try {
        const [userCount, classCount, studentCount, usersByRole, assignmentsByStatus, recentActivity] = await Promise.all([
            User_1.User.countDocuments(),
            Class_1.ClassModel.countDocuments(),
            Student_1.Student.countDocuments(),
            User_1.User.aggregate([
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]),
            TemplateAssignment_1.TemplateAssignment.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            AuditLog_1.AuditLog.find().sort({ timestamp: -1 }).limit(10).lean()
        ]);
        const formatDistribution = (agg) => agg.reduce((acc, curr) => ({ ...acc, [curr._id || 'unknown']: curr.count }), {});
        res.json({
            counts: {
                users: userCount,
                classes: classCount,
                students: studentCount
            },
            distribution: {
                usersByRole: formatDistribution(usersByRole),
                assignmentsByStatus: formatDistribution(assignmentsByStatus)
            },
            recentActivity
        });
    }
    catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});
exports.analyticsRouter.get('/skills/:templateId', async (req, res) => {
    try {
        const { templateId } = req.params;
        const { yearId, level, classId } = req.query;
        // Get full template to find all potential skills
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'Template not found' });
        // Determine Filtered Student IDs
        let studentQuery = {};
        if (yearId || level || classId) {
            let enrollmentQuery = {};
            if (yearId)
                enrollmentQuery.schoolYearId = yearId;
            if (classId)
                enrollmentQuery.classId = classId;
            // If level is provided but not classId, find all classes in that level
            if (level && !classId) {
                const classes = await Class_1.ClassModel.find({ level, ...(yearId ? { schoolYearId: yearId } : {}) }).select('_id');
                const classIds = classes.map(c => c._id.toString());
                enrollmentQuery.classId = { $in: classIds };
            }
            const enrollments = await Enrollment_1.Enrollment.find(enrollmentQuery).distinct('studentId');
            studentQuery.studentId = { $in: enrollments };
        }
        // Get total assignments count for this template (denominator)
        const totalAssigned = await TemplateAssignment_1.TemplateAssignment.countDocuments({
            templateId,
            ...(Object.keys(studentQuery).length > 0 ? { studentId: studentQuery.studentId } : {})
        });
        // Initialize stats for all skills defined in the template
        const skillStats = {};
        // Scan template for skills (extended tables)
        if (template.pages && Array.isArray(template.pages)) {
            template.pages.forEach((page) => {
                if (page.blocks && Array.isArray(page.blocks)) {
                    page.blocks.forEach((block) => {
                        // Look for tables with expanded rows (where skills are defined)
                        if (block.type === 'table' && block.props?.expandedRows) {
                            const cells = block.props.cells || [];
                            const rowLanguages = block.props.rowLanguages || [];
                            const expandedLanguages = block.props.expandedLanguages || [];
                            cells.forEach((row, ri) => {
                                // Assuming skill text is in the first cell of the row
                                const text = row[0]?.text;
                                if (text && typeof text === 'string' && text.trim()) {
                                    const trimmed = text.trim();
                                    // Determine allowed languages for this specific row
                                    // Logic matches TemplateBuilder: rowLanguages[ri] || expandedLanguages
                                    const rowLangs = rowLanguages[ri] || expandedLanguages;
                                    const allowedCodes = rowLangs ? rowLangs.map((l) => l.code) : [];
                                    if (!skillStats[trimmed]) {
                                        skillStats[trimmed] = {
                                            skillText: trimmed,
                                            totalStudents: 0,
                                            allowedLanguages: allowedCodes,
                                            languages: {}
                                        };
                                    }
                                    else {
                                        // If duplicate skill text exists, ensure allowedLanguages is set
                                        if (!skillStats[trimmed].allowedLanguages) {
                                            skillStats[trimmed].allowedLanguages = allowedCodes;
                                        }
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
        // Fetch all acquired skills for this template
        // Only fetch records where at least one language is acquired (languages array not empty)
        const records = await StudentAcquiredSkill_1.StudentAcquiredSkill.find({
            templateId,
            languages: { $exists: true, $not: { $size: 0 } },
            ...(Object.keys(studentQuery).length > 0 ? { studentId: studentQuery.studentId } : {})
        }).lean();
        // Process records
        for (const record of records) {
            const text = record.skillText ? record.skillText.trim() : '';
            if (!text)
                continue;
            if (!skillStats[text]) {
                // This handles cases where a skill was recorded but might have been removed from the template later
                // Or if the template parsing missed it. We show it anyway.
                skillStats[text] = {
                    skillText: text,
                    totalStudents: 0,
                    languages: {}
                };
            }
            skillStats[text].totalStudents++;
            for (const lang of record.languages) {
                if (!skillStats[text].languages[lang]) {
                    skillStats[text].languages[lang] = 0;
                }
                skillStats[text].languages[lang]++;
            }
        }
        res.json({ templateName: template.name, totalAssigned, stats: Object.values(skillStats) });
    }
    catch (error) {
        console.error('Error fetching skill analytics:', error);
        res.status(500).json({ error: 'Failed to fetch skill analytics' });
    }
});
