"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRouter = void 0;
const express_1 = require("express");
const Category_1 = require("../models/Category");
const Competency_1 = require("../models/Competency");
const auth_1 = require("../auth");
const cache_1 = require("../utils/cache");
exports.categoriesRouter = (0, express_1.Router)();
exports.categoriesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const result = await (0, cache_1.withCache)('categories-all-grouped', async () => {
        const cats = await Category_1.Category.find({ active: true }).sort({ order: 1 }).lean();
        const catIds = cats.map(c => String(c._id));
        const comps = await Competency_1.Competency.find({ categoryId: { $in: catIds }, active: true }).sort({ order: 1 }).lean();
        const grouped = {};
        for (const comp of comps) {
            const cid = comp.categoryId;
            (grouped[cid] || (grouped[cid] = [])).push(comp);
        }
        return cats.map(c => ({ ...c, competencies: grouped[String(c._id)] || [] }));
    });
    res.json(result);
});
exports.categoriesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { name, order, active } = req.body;
    (0, cache_1.clearCache)('categories');
    const cat = await Category_1.Category.create({ name, order: order ?? 0, active: active ?? true });
    res.json(cat);
});
exports.categoriesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    (0, cache_1.clearCache)('categories');
    const cat = await Category_1.Category.findByIdAndUpdate(id, req.body, { new: true });
    res.json(cat);
});
exports.categoriesRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    (0, cache_1.clearCache)('categories');
    await Category_1.Category.findByIdAndDelete(id);
    res.json({ ok: true });
});
// Competencies
exports.categoriesRouter.post('/:id/competencies', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const { label, order, active } = req.body;
    (0, cache_1.clearCache)('categories');
    const comp = await Competency_1.Competency.create({ categoryId: id, label, order: order ?? 0, active: active ?? true });
    res.json(comp);
});
exports.categoriesRouter.patch('/competencies/:compId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { compId } = req.params;
    (0, cache_1.clearCache)('categories');
    const comp = await Competency_1.Competency.findByIdAndUpdate(compId, req.body, { new: true });
    res.json(comp);
});
exports.categoriesRouter.delete('/competencies/:compId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { compId } = req.params;
    (0, cache_1.clearCache)('categories');
    await Competency_1.Competency.findByIdAndDelete(compId);
    res.json({ ok: true });
});
