"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savedGradebooksRouter = void 0;
const express_1 = require("express");
const SavedGradebook_1 = require("../models/SavedGradebook");
const SchoolYear_1 = require("../models/SchoolYear");
const RoleScope_1 = require("../models/RoleScope");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const auth_1 = require("../auth");
exports.savedGradebooksRouter = (0, express_1.Router)();
// List years
exports.savedGradebooksRouter.get('/years', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const yearIds = await SavedGradebook_1.SavedGradebook.distinct('schoolYearId');
    const years = await SchoolYear_1.SchoolYear.find({ _id: { $in: yearIds } })
        .select('name')
        .sort({ name: -1 })
        .lean();
    res.json(years);
});
// List levels for a year
exports.savedGradebooksRouter.get('/years/:yearId/levels', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const { yearId } = req.params;
    const user = req.user;
    let allowedLevels = null;
    if (user.role === 'SUBADMIN') {
        const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
        allowedLevels = scope?.levels || [];
    }
    const levels = await SavedGradebook_1.SavedGradebook.distinct('level', { schoolYearId: yearId });
    // Normalize empty levels to 'Sans niveau' and deduplicate
    let normalizedLevels = Array.from(new Set(levels.map(l => l || 'Sans niveau')));
    if (allowedLevels !== null) {
        normalizedLevels = normalizedLevels.filter(l => allowedLevels.includes(l));
    }
    res.json(normalizedLevels.sort());
});
// List students for a year and level
exports.savedGradebooksRouter.get('/years/:yearId/levels/:level/students', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const { yearId, level } = req.params;
    const user = req.user;
    if (user.role === 'SUBADMIN') {
        const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
        const allowedLevels = scope?.levels || [];
        if (!allowedLevels.includes(level)) {
            return res.json([]);
        }
    }
    // Handle 'Sans niveau' mapping to empty string or 'Sans niveau'
    const levelQuery = level === 'Sans niveau' ? { $in: ['', 'Sans niveau'] } : level;
    const students = await SavedGradebook_1.SavedGradebook.find({ schoolYearId: yearId, level: levelQuery })
        .select('studentId data.student.firstName data.student.lastName createdAt')
        .lean();
    // Map to a simpler structure
    const result = students.map(s => ({
        _id: s._id,
        studentId: s.studentId,
        firstName: s.data.student.firstName,
        lastName: s.data.student.lastName,
        createdAt: s.createdAt
    }));
    res.json(result);
});
// Get a specific saved gradebook
exports.savedGradebooksRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const saved = await SavedGradebook_1.SavedGradebook.findById(id).lean();
    if (!saved)
        return res.status(404).json({ error: 'not_found' });
    // Fix for missing assignment data in snapshot (Promote case)
    if (saved.data && saved.data.assignment && (!saved.data.assignment.data || Object.keys(saved.data.assignment.data).length === 0)) {
        console.log(`[SavedGradebook] Patching missing data for ${id}. Student: ${saved.studentId}, Template: ${saved.templateId}`);
        try {
            let liveAssignment = null;
            // Try to find by ID first if available in snapshot
            if (saved.data.assignment._id) {
                console.log(`[SavedGradebook] Looking up live assignment by ID: ${saved.data.assignment._id}`);
                liveAssignment = await TemplateAssignment_1.TemplateAssignment.findById(saved.data.assignment._id).lean();
            }
            // Fallback to student/template lookup if not found by ID
            if (!liveAssignment) {
                console.log(`[SavedGradebook] Looking up live assignment by Student/Template`);
                liveAssignment = await TemplateAssignment_1.TemplateAssignment.findOne({
                    studentId: saved.studentId,
                    templateId: saved.templateId
                }).lean();
            }
            if (liveAssignment) {
                console.log(`[SavedGradebook] Live assignment found. Has data: ${!!liveAssignment.data}`);
                if (liveAssignment.data) {
                    saved.data.assignment.data = liveAssignment.data;
                    console.log(`[SavedGradebook] Data patched successfully. Keys: ${Object.keys(liveAssignment.data).length}`);
                }
            }
            else {
                console.log(`[SavedGradebook] Live assignment NOT found.`);
            }
        }
        catch (e) {
            console.error('Error patching saved gradebook data:', e);
        }
    }
    else {
        console.log(`[SavedGradebook] Data present in snapshot. Keys: ${saved.data?.assignment?.data ? Object.keys(saved.data.assignment.data).length : 'None'}`);
    }
    res.json(saved);
});
