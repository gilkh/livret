"use strict";
/**
 * Migration Script: Ensure Stable BlockIds
 *
 * This migration ensures all templates have stable blockIds on every block,
 * and migrates any legacy assignment data keys to the new stable format.
 *
 * Run this migration once to fix existing data:
 * npx ts-node src/migrations/migrateBlockIds.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
const mongoose_1 = __importDefault(require("mongoose"));
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const templateUtils_1 = require("../utils/templateUtils");
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/nvcar';
async function migrateTemplates(stats) {
    console.log('\n=== Migrating Templates ===');
    const templates = await GradebookTemplate_1.GradebookTemplate.find({}).lean();
    console.log(`Found ${templates.length} templates to process`);
    for (const template of templates) {
        stats.templatesProcessed++;
        let needsUpdate = false;
        let blocksFixedInTemplate = 0;
        const pages = Array.isArray(template.pages) ? template.pages : [];
        // Check if any blocks are missing blockIds
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
            for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
                const block = blocks[blockIdx];
                if (!block)
                    continue;
                const blockId = block?.props?.blockId;
                if (!blockId || typeof blockId !== 'string' || !blockId.trim()) {
                    needsUpdate = true;
                    blocksFixedInTemplate++;
                }
            }
        }
        if (needsUpdate) {
            try {
                // Apply ensureStableBlockIds to fix missing blockIds
                const fixedPages = (0, templateUtils_1.ensureStableBlockIds)(undefined, pages);
                const fixedPagesWithRowIds = (0, templateUtils_1.ensureStableExpandedTableRowIds)(undefined, fixedPages);
                // Update the template
                await GradebookTemplate_1.GradebookTemplate.findByIdAndUpdate(template._id, {
                    $set: { pages: fixedPagesWithRowIds }
                });
                // Also update version history if present
                if (Array.isArray(template.versionHistory) && template.versionHistory.length > 0) {
                    const updatedHistory = template.versionHistory.map((version) => {
                        if (Array.isArray(version.pages)) {
                            const fixedVersionPages = (0, templateUtils_1.ensureStableBlockIds)(undefined, version.pages);
                            const fixedVersionPagesWithRowIds = (0, templateUtils_1.ensureStableExpandedTableRowIds)(undefined, fixedVersionPages);
                            return { ...version, pages: fixedVersionPagesWithRowIds };
                        }
                        return version;
                    });
                    await GradebookTemplate_1.GradebookTemplate.findByIdAndUpdate(template._id, {
                        $set: { versionHistory: updatedHistory }
                    });
                }
                stats.templatesFixed++;
                stats.blocksFixed += blocksFixedInTemplate;
                console.log(`  Fixed template "${template.name}" (${blocksFixedInTemplate} blocks)`);
            }
            catch (error) {
                stats.errors.push(`Template ${template._id}: ${error.message}`);
                console.error(`  Error fixing template "${template.name}":`, error.message);
            }
        }
    }
}
async function migrateAssignmentData(stats) {
    console.log('\n=== Migrating Assignment Data ===');
    // Build a map of template pages for reference
    const templates = await GradebookTemplate_1.GradebookTemplate.find({}).lean();
    const templateMap = new Map();
    for (const t of templates) {
        templateMap.set(String(t._id), t);
    }
    const assignments = await TemplateAssignment_1.TemplateAssignment.find({}).lean();
    console.log(`Found ${assignments.length} assignments to process`);
    for (const assignment of assignments) {
        stats.assignmentsProcessed++;
        if (!assignment.data || typeof assignment.data !== 'object')
            continue;
        const template = templateMap.get(assignment.templateId);
        if (!template)
            continue;
        const pages = Array.isArray(template.pages) ? template.pages : [];
        const blocksById = (0, templateUtils_1.buildBlocksById)(pages);
        let needsUpdate = false;
        const newData = {};
        let keysMigrated = 0;
        for (const [key, value] of Object.entries(assignment.data)) {
            // Check for legacy language_toggle keys (format: language_toggle_X_Y where X and Y are numbers)
            const legacyLangMatch = key.match(/^language_toggle_(\d+)_(\d+)$/);
            if (legacyLangMatch) {
                const pageIdx = parseInt(legacyLangMatch[1]);
                const blockIdx = parseInt(legacyLangMatch[2]);
                const block = pages[pageIdx]?.blocks?.[blockIdx];
                if (block && ['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    const stableBlockId = block?.props?.blockId;
                    if (stableBlockId && typeof stableBlockId === 'string' && stableBlockId.trim()) {
                        // Migrate to stable key
                        const newKey = `language_toggle_${stableBlockId}`;
                        newData[newKey] = value;
                        needsUpdate = true;
                        keysMigrated++;
                        continue;
                    }
                }
            }
            // Check for legacy table row keys (format: table_X_Y_row_Z where X, Y, Z are numbers)
            const legacyTableMatch = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/);
            if (legacyTableMatch) {
                const pageIdx = parseInt(legacyTableMatch[1]);
                const blockIdx = parseInt(legacyTableMatch[2]);
                const rowIdx = parseInt(legacyTableMatch[3]);
                const block = pages[pageIdx]?.blocks?.[blockIdx];
                if (block && block.type === 'table' && block.props?.expandedRows) {
                    const stableBlockId = block?.props?.blockId;
                    const rowIds = Array.isArray(block.props.rowIds) ? block.props.rowIds : [];
                    const stableRowId = rowIds[rowIdx];
                    if (stableBlockId && stableRowId &&
                        typeof stableBlockId === 'string' && stableBlockId.trim() &&
                        typeof stableRowId === 'string' && stableRowId.trim()) {
                        // Migrate to stable key
                        const newKey = `table_${stableBlockId}_row_${stableRowId}`;
                        newData[newKey] = value;
                        needsUpdate = true;
                        keysMigrated++;
                        continue;
                    }
                }
            }
            // Keep non-legacy keys as-is
            newData[key] = value;
        }
        if (needsUpdate) {
            try {
                await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignment._id, {
                    $set: { data: newData },
                    $inc: { dataVersion: 1 }
                });
                stats.assignmentsFixed++;
                stats.dataKeysMigrated += keysMigrated;
                console.log(`  Migrated assignment ${assignment._id} (${keysMigrated} keys)`);
            }
            catch (error) {
                stats.errors.push(`Assignment ${assignment._id}: ${error.message}`);
                console.error(`  Error migrating assignment ${assignment._id}:`, error.message);
            }
        }
    }
}
async function runMigration() {
    console.log('Starting BlockId Migration...');
    console.log(`Connecting to: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    await mongoose_1.default.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    const stats = {
        templatesProcessed: 0,
        templatesFixed: 0,
        blocksFixed: 0,
        assignmentsProcessed: 0,
        assignmentsFixed: 0,
        dataKeysMigrated: 0,
        errors: []
    };
    try {
        await migrateTemplates(stats);
        await migrateAssignmentData(stats);
        console.log('\n=== Migration Complete ===');
        console.log(`Templates processed: ${stats.templatesProcessed}`);
        console.log(`Templates fixed: ${stats.templatesFixed}`);
        console.log(`Blocks fixed: ${stats.blocksFixed}`);
        console.log(`Assignments processed: ${stats.assignmentsProcessed}`);
        console.log(`Assignments fixed: ${stats.assignmentsFixed}`);
        console.log(`Data keys migrated: ${stats.dataKeysMigrated}`);
        if (stats.errors.length > 0) {
            console.log(`\nErrors (${stats.errors.length}):`);
            stats.errors.forEach(e => console.log(`  - ${e}`));
        }
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}
// Run if executed directly
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}
