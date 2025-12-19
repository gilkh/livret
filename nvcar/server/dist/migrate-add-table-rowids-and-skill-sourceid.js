"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const GradebookTemplate_1 = require("./models/GradebookTemplate");
const StudentAcquiredSkill_1 = require("./models/StudentAcquiredSkill");
const TemplateAssignment_1 = require("./models/TemplateAssignment");
const templateUtils_1 = require("./utils/templateUtils");
function getVersionedPages(template, templateVersion) {
    if (!templateVersion || templateVersion === template.currentVersion)
        return template.pages;
    const versionData = template.versionHistory?.find((v) => v.version === templateVersion);
    if (!versionData)
        return template.pages;
    return versionData.pages;
}
async function migrateTemplatesRowIds() {
    const templates = await GradebookTemplate_1.GradebookTemplate.find({}).lean();
    let updatedCount = 0;
    for (const template of templates) {
        const templateId = String(template._id);
        const pages = Array.isArray(template.pages) ? template.pages : [];
        const pagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(pages, pages);
        const nextPages = (0, templateUtils_1.ensureStableExpandedTableRowIds)(pages, pagesWithBlockIds);
        const versionHistory = Array.isArray(template.versionHistory) ? template.versionHistory : [];
        const nextVersionHistory = versionHistory.map((entry) => {
            const entryPages = Array.isArray(entry?.pages) ? entry.pages : [];
            const entryPagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(entryPages, entryPages);
            return {
                ...entry,
                pages: (0, templateUtils_1.ensureStableExpandedTableRowIds)(entryPages, entryPagesWithBlockIds)
            };
        });
        const pagesChanged = JSON.stringify(pages) !== JSON.stringify(nextPages);
        const versionHistoryChanged = JSON.stringify(versionHistory) !== JSON.stringify(nextVersionHistory);
        if (pagesChanged || versionHistoryChanged) {
            await GradebookTemplate_1.GradebookTemplate.updateOne({ _id: templateId }, { $set: { pages: nextPages, versionHistory: nextVersionHistory, updatedAt: new Date() } });
            updatedCount++;
        }
    }
    return { updatedCount, total: templates.length };
}
async function migrateAcquiredSkillsSourceId() {
    const cursor = StudentAcquiredSkill_1.StudentAcquiredSkill.find({
        sourceKey: { $exists: true, $ne: null },
        $or: [{ sourceId: { $exists: false } }, { sourceId: null }]
    })
        .select('_id studentId templateId assignmentId skillText sourceKey recordedAt')
        .lean()
        .cursor();
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    for await (const doc of cursor) {
        processed++;
        const sourceKey = String(doc.sourceKey || '');
        const match = sourceKey.match(/^table_(\d+)_(\d+)_row_(\d+)$/);
        if (!match) {
            skipped++;
            continue;
        }
        const pageIdx = parseInt(match[1]);
        const blockIdx = parseInt(match[2]);
        const rowIdx = parseInt(match[3]);
        const template = await GradebookTemplate_1.GradebookTemplate.findById(doc.templateId).lean();
        if (!template) {
            skipped++;
            continue;
        }
        let templateVersion = undefined;
        if (doc.assignmentId) {
            const assignment = await TemplateAssignment_1.TemplateAssignment.findById(doc.assignmentId).select('templateVersion').lean();
            templateVersion = assignment?.templateVersion;
        }
        const pages = getVersionedPages(template, templateVersion);
        const pagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(pages, pages);
        const normalizedPages = (0, templateUtils_1.ensureStableExpandedTableRowIds)(pages, pagesWithBlockIds);
        const page = normalizedPages?.[pageIdx];
        const block = page?.blocks?.[blockIdx];
        const rowId = Array.isArray(block?.props?.rowIds) ? block.props.rowIds[rowIdx] : undefined;
        const sourceId = typeof rowId === 'string' && rowId.trim() ? rowId : null;
        if (!sourceId) {
            skipped++;
            continue;
        }
        await StudentAcquiredSkill_1.StudentAcquiredSkill.updateOne({ _id: doc._id }, { $set: { sourceId } });
        updated++;
    }
    return { processed, updated, skipped };
}
async function dedupeAcquiredSkillsBySourceId() {
    const groups = await StudentAcquiredSkill_1.StudentAcquiredSkill.aggregate([
        { $match: { sourceId: { $exists: true, $ne: null } } },
        {
            $group: {
                _id: { studentId: '$studentId', templateId: '$templateId', sourceId: '$sourceId' },
                ids: { $push: '$_id' },
                count: { $sum: 1 }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]);
    let deleted = 0;
    for (const g of groups) {
        const ids = g.ids || [];
        const docs = await StudentAcquiredSkill_1.StudentAcquiredSkill.find({ _id: { $in: ids } })
            .select('_id recordedAt')
            .sort({ recordedAt: -1, _id: -1 })
            .lean();
        const toDelete = docs.slice(1).map(d => d._id);
        if (toDelete.length > 0) {
            await StudentAcquiredSkill_1.StudentAcquiredSkill.deleteMany({ _id: { $in: toDelete } });
            deleted += toDelete.length;
        }
    }
    return { duplicateGroups: groups.length, deleted };
}
async function main() {
    await (0, db_1.connectDb)();
    const templateRes = await migrateTemplatesRowIds();
    console.log('templates_rowids', templateRes);
    const skillsRes = await migrateAcquiredSkillsSourceId();
    console.log('skills_sourceid', skillsRes);
    const dedupeRes = await dedupeAcquiredSkillsBySourceId();
    console.log('skills_dedupe', dedupeRes);
    process.exit(0);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
