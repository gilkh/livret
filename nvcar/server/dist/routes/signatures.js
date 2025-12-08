"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signaturesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const StudentSignature_1 = require("../models/StudentSignature");
const AdminSignature_1 = require("../models/AdminSignature");
exports.signaturesRouter = (0, express_1.Router)();
// Admin Signature Routes
exports.signaturesRouter.get('/admin', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const sigs = await AdminSignature_1.AdminSignature.find().sort({ createdAt: -1 }).lean();
    res.json(sigs);
});
exports.signaturesRouter.post('/admin', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { name, dataUrl } = req.body;
    const newSig = await AdminSignature_1.AdminSignature.create({
        name,
        dataUrl,
        isActive: false // Default to false
    });
    res.json(newSig);
});
exports.signaturesRouter.delete('/admin/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    await AdminSignature_1.AdminSignature.findByIdAndDelete(id);
    res.json({ success: true });
});
exports.signaturesRouter.post('/admin/:id/activate', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    // Deactivate all others
    await AdminSignature_1.AdminSignature.updateMany({}, { isActive: false });
    // Activate selected
    const updated = await AdminSignature_1.AdminSignature.findByIdAndUpdate(id, { isActive: true }, { new: true });
    res.json(updated);
});
// Student Signature Routes
exports.signaturesRouter.get('/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { studentId } = req.params;
    const s = await StudentSignature_1.StudentSignature.findOne({ studentId }).lean();
    res.json(s || { studentId, items: [] });
});
exports.signaturesRouter.post('/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { studentId } = req.params;
    const { items } = req.body;
    const updated = await StudentSignature_1.StudentSignature.findOneAndUpdate({ studentId }, { items, updatedAt: new Date() }, { upsert: true, new: true });
    res.json(updated);
});
