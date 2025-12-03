"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.levelsRouter = void 0;
const express_1 = require("express");
const Level_1 = require("../models/Level");
const auth_1 = require("../auth");
exports.levelsRouter = (0, express_1.Router)();
exports.levelsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const levels = await Level_1.Level.find({}).sort({ order: 1 }).lean();
    res.json(levels);
});
