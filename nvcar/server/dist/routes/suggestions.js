"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestionsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TemplateChangeSuggestion_1 = require("../models/TemplateChangeSuggestion");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const SchoolYear_1 = require("../models/SchoolYear");
const User_1 = require("../models/User");
exports.suggestionsRouter = (0, express_1.Router)();
const findBlockById = (pages, blockId) => {
    const id = String(blockId || '').trim();
    if (!id)
        return null;
    for (const page of Array.isArray(pages) ? pages : []) {
        const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
        for (const block of blocks) {
            const raw = block?.props?.blockId;
            const bid = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
            if (bid && bid === id)
                return block;
        }
    }
    return null;
};
// Create a suggestion (SubAdmin)
exports.suggestionsRouter.post('/', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const { type = 'template_edit', templateId, templateVersion: incomingTemplateVersion, pageIndex, blockIndex, blockId: incomingBlockId, originalText, suggestedText } = req.body;
        const subAdminId = req.user.userId;
        let templateVersion = typeof incomingTemplateVersion === 'number' ? incomingTemplateVersion : undefined;
        let blockId = typeof incomingBlockId === 'string' && incomingBlockId.trim() ? incomingBlockId.trim() : undefined;
        if (type === 'template_edit' && templateId) {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).select('pages versionHistory currentVersion').lean();
            if (template) {
                if (templateVersion === undefined)
                    templateVersion = template.currentVersion;
                const pagesTarget = typeof templateVersion === 'number' && template.currentVersion !== templateVersion
                    ? template.versionHistory?.find((v) => v.version === templateVersion)?.pages
                    : template.pages;
                if (!blockId && typeof pageIndex === 'number' && typeof blockIndex === 'number') {
                    const block = pagesTarget?.[pageIndex]?.blocks?.[blockIndex];
                    const raw = block?.props?.blockId;
                    blockId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
                }
            }
        }
        // If this is a semester request, ensure it's only allowed once per active school year
        if (type === 'semester_request') {
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (!activeYear)
                return res.status(400).json({ error: 'no_active_year', message: 'Aucune année scolaire active.' });
            if (activeYear.activeSemester !== 1)
                return res.status(400).json({ error: 'not_in_semester_1', message: 'La demande est autorisée uniquement pendant le Semestre 1.' });
            const already = await TemplateChangeSuggestion_1.TemplateChangeSuggestion.findOne({
                subAdminId,
                type: 'semester_request',
                createdAt: { $gte: activeYear.startDate, $lte: activeYear.endDate }
            }).lean();
            if (already)
                return res.status(400).json({ error: 'already_requested', message: 'Vous avez déjà demandé le passage pour cette année scolaire.' });
        }
        const suggestion = await TemplateChangeSuggestion_1.TemplateChangeSuggestion.create({
            subAdminId,
            type,
            templateId,
            templateVersion,
            pageIndex,
            blockIndex,
            blockId,
            originalText,
            suggestedText
        });
        res.json(suggestion);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Get all suggestions (Admin)
exports.suggestionsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const suggestions = await TemplateChangeSuggestion_1.TemplateChangeSuggestion.find()
            .sort({ createdAt: -1 })
            .lean();
        // Populate subAdmin details manually or via populate if schema allowed ref
        const subAdminIds = [...new Set(suggestions.map(s => s.subAdminId))];
        const subAdmins = await User_1.User.find({ _id: { $in: subAdminIds } }).lean();
        const subAdminMap = subAdmins.reduce((acc, curr) => ({ ...acc, [String(curr._id)]: curr }), {});
        // Populate template names
        const templateIds = [...new Set(suggestions.map(s => s.templateId).filter(Boolean))];
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).select('name').lean();
        const templateMap = templates.reduce((acc, curr) => ({ ...acc, [String(curr._id)]: curr }), {});
        const enriched = suggestions.map(s => ({
            ...s,
            subAdmin: s.subAdminId ? subAdminMap[s.subAdminId] : undefined,
            template: s.templateId ? templateMap[s.templateId] : undefined
        }));
        res.json(enriched);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Update suggestion status (Admin)
exports.suggestionsRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        const suggestion = await TemplateChangeSuggestion_1.TemplateChangeSuggestion.findById(req.params.id);
        if (!suggestion)
            return res.status(404).json({ error: 'not_found' });
        if (status === 'approved' && suggestion.type === 'template_edit' && suggestion.templateId) {
            // Apply change to template
            const template = (await GradebookTemplate_1.GradebookTemplate.findById(suggestion.templateId));
            if (!template)
                return res.status(404).json({ error: 'template_not_found' });
            const blockId = suggestion.blockId;
            const desiredVersion = suggestion.templateVersion;
            const applyChangeToBlock = (b, text) => {
                if (b.type === 'dropdown') {
                    b.props.options = text.split('\n').map((s) => s.trim()).filter(Boolean);
                }
                else if (b.props && typeof b.props.content === 'string') {
                    b.props.content = text;
                }
                else if (b.props && typeof b.props.text === 'string') {
                    b.props.text = text;
                }
                else {
                    b.props = { ...b.props, content: text };
                }
            };
            // 1. Try to apply to current pages (prioritize stable blockId)
            let appliedToCurrent = false;
            if (blockId) {
                const blockInCurrent = findBlockById(template.pages, blockId);
                if (blockInCurrent) {
                    applyChangeToBlock(blockInCurrent, suggestion.suggestedText);
                    template.markModified('pages');
                    appliedToCurrent = true;
                }
            }
            // 2. Also apply to version history if specifically requested and it's an old version
            if (typeof desiredVersion === 'number' && template.currentVersion !== desiredVersion) {
                const versionEntry = template.versionHistory?.find((v) => v.version === desiredVersion);
                if (versionEntry && versionEntry.pages) {
                    const blockInVersion = blockId ? findBlockById(versionEntry.pages, blockId) : versionEntry.pages[suggestion.pageIndex]?.blocks?.[suggestion.blockIndex];
                    if (blockInVersion) {
                        applyChangeToBlock(blockInVersion, suggestion.suggestedText);
                        template.markModified('versionHistory');
                    }
                }
            }
            // 3. Fallback: if blockId wasn't found in current (maybe it's a new block or indices changed too much), 
            // but we didn't apply to current yet, try indices on current pages
            if (!appliedToCurrent && typeof suggestion.pageIndex === 'number' && typeof suggestion.blockIndex === 'number') {
                const fallbackBlock = template.pages?.[suggestion.pageIndex]?.blocks?.[suggestion.blockIndex];
                if (fallbackBlock) {
                    applyChangeToBlock(fallbackBlock, suggestion.suggestedText);
                    template.markModified('pages');
                }
            }
            await template.save();
        }
        // If admin approves a semester_request, advance the active semester for the active school year
        if (status === 'approved' && suggestion.type === 'semester_request') {
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true });
            if (activeYear) {
                if (activeYear.activeSemester !== 2) {
                    activeYear.activeSemester = 2;
                    await activeYear.save();
                }
            }
        }
        suggestion.status = status;
        if (adminComment)
            suggestion.adminComment = adminComment;
        suggestion.updatedAt = new Date();
        await suggestion.save();
        res.json(suggestion);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
