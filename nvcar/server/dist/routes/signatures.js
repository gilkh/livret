"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signaturesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const StudentSignature_1 = require("../models/StudentSignature");
exports.signaturesRouter = (0, express_1.Router)();
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
