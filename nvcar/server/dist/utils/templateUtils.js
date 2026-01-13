"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBlocksById = void 0;
exports.getVersionedTemplate = getVersionedTemplate;
exports.mergeAssignmentDataIntoTemplate = mergeAssignmentDataIntoTemplate;
exports.checkAndAssignTemplates = checkAndAssignTemplates;
exports.ensureStableBlockIds = ensureStableBlockIds;
exports.ensureStableExpandedTableRowIds = ensureStableExpandedTableRowIds;
const Class_1 = require("../models/Class");
const Enrollment_1 = require("../models/Enrollment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const SchoolYear_1 = require("../models/SchoolYear");
const crypto_1 = require("crypto");
function getVersionedTemplate(template, templateVersion) {
    if (!templateVersion || templateVersion === template.currentVersion)
        return template;
    const versionData = template.versionHistory?.find((v) => v.version === templateVersion);
    if (!versionData)
        return template;
    return {
        ...template,
        pages: versionData.pages,
        variables: versionData.variables || {},
        watermark: versionData.watermark,
        _versionUsed: templateVersion,
        _isOldVersion: templateVersion < (template.currentVersion || 1),
    };
}
/**
 * Build a map of blocks indexed by their stable blockId.
 *
 * IMPORTANT: Every block MUST have a blockId. Blocks without blockIds are skipped
 * and should be fixed by running ensureStableBlockIds on the template.
 */
const buildBlocksById = (pages) => {
    const map = new Map();
    (Array.isArray(pages) ? pages : []).forEach((page, pageIdx) => {
        ;
        (Array.isArray(page?.blocks) ? page.blocks : []).forEach((block, blockIdx) => {
            const raw = block?.props?.blockId;
            const id = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
            if (!id) {
                // Log warning for blocks without blockId - these should be fixed
                console.warn(`[buildBlocksById] Block at page ${pageIdx}, index ${blockIdx} has no blockId. Run ensureStableBlockIds to fix.`);
                return;
            }
            map.set(id, { block, pageIdx, blockIdx });
        });
    });
    return map;
};
exports.buildBlocksById = buildBlocksById;
/**
 * Merge assignment data into a template, using ONLY stable blockIds.
 *
 * This function no longer supports legacy pageIndex_blockIndex keys.
 * All data keys must use the stable blockId format:
 * - language_toggle_{blockId}
 * - table_{blockId}_row_{rowId}
 */
function mergeAssignmentDataIntoTemplate(template, assignment) {
    if (!template)
        return null;
    const templateVersion = assignment?.templateVersion;
    let versionedTemplate = getVersionedTemplate(template, templateVersion);
    // Deep clone to avoid mutating the original template object (especially if it came from cache)
    versionedTemplate = JSON.parse(JSON.stringify(versionedTemplate));
    if (assignment?.data) {
        const blocksById = (0, exports.buildBlocksById)(versionedTemplate?.pages || []);
        const pages = versionedTemplate?.pages || [];
        for (const [key, value] of Object.entries(assignment.data)) {
            // 1. Language Toggle Merging - ONLY stable blockId format
            if (key.startsWith('language_toggle_')) {
                // Match stable format: language_toggle_{blockId}
                // blockId is a UUID or any non-numeric string
                const match = key.match(/^language_toggle_(.+)$/);
                if (match) {
                    const blockId = String(match[1] || '').trim();
                    // Skip if it looks like legacy format (two numbers separated by underscore)
                    if (/^\d+_\d+$/.test(blockId)) {
                        // This is legacy format - try to migrate it
                        const legacyMatch = blockId.match(/^(\d+)_(\d+)$/);
                        if (legacyMatch) {
                            const pageIdx = parseInt(legacyMatch[1]);
                            const blockIdx = parseInt(legacyMatch[2]);
                            const block = pages[pageIdx]?.blocks?.[blockIdx];
                            if (block && ['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                                const stableBlockId = block?.props?.blockId;
                                if (stableBlockId) {
                                    // Migrate to stable format
                                    block.props = block.props || {};
                                    block.props.items = value;
                                    console.info(`[mergeAssignmentDataIntoTemplate] Migrated legacy key ${key} to blockId ${stableBlockId}`);
                                }
                            }
                        }
                        continue;
                    }
                    const found = blockId ? blocksById.get(blockId) : null;
                    if (found && ['language_toggle', 'language_toggle_v2'].includes(found.block?.type)) {
                        found.block.props = found.block.props || {};
                        found.block.props.items = value;
                    }
                }
            }
            // 2. Table Row Merging - ONLY stable blockId_rowId format
            if (key.startsWith('table_')) {
                // Match stable format: table_{blockId}_row_{rowId}
                const stableMatch = key.match(/^table_(.+)_row_(.+)$/);
                if (stableMatch) {
                    const blockId = String(stableMatch[1] || '').trim();
                    const rowId = String(stableMatch[2] || '').trim();
                    // Skip if it looks like legacy format (blockId is just numbers)
                    if (/^\d+_\d+$/.test(blockId) && /^\d+$/.test(rowId)) {
                        // This is legacy format - try to migrate it
                        const legacyMatch = blockId.match(/^(\d+)_(\d+)$/);
                        if (legacyMatch) {
                            const pageIdx = parseInt(legacyMatch[1]);
                            const blockIdx = parseInt(legacyMatch[2]);
                            const rowIdx = parseInt(rowId);
                            const block = pages[pageIdx]?.blocks?.[blockIdx];
                            if (block && block.type === 'table' && block.props?.expandedRows) {
                                const stableBlockId = block?.props?.blockId;
                                const rowIds = Array.isArray(block.props.rowIds) ? block.props.rowIds : [];
                                const stableRowId = rowIds[rowIdx];
                                if (stableBlockId && stableRowId) {
                                    block.props.rowLanguages = block.props.rowLanguages || {};
                                    block.props.rowLanguages[rowIdx] = value;
                                    console.info(`[mergeAssignmentDataIntoTemplate] Migrated legacy table key ${key} to blockId ${stableBlockId}, rowId ${stableRowId}`);
                                }
                            }
                        }
                        continue;
                    }
                    const found = blockId ? blocksById.get(blockId) : null;
                    const block = found?.block;
                    if (block && block.type === 'table' && block.props?.expandedRows) {
                        const rowIds = Array.isArray(block.props.rowIds) ? block.props.rowIds : [];
                        const rowIdx = rowIds.findIndex((v) => typeof v === 'string' && v.trim() === rowId);
                        if (rowIdx >= 0) {
                            block.props.rowLanguages = block.props.rowLanguages || {};
                            block.props.rowLanguages[rowIdx] = value;
                        }
                    }
                }
            }
            // 3. Dropdowns and Other coordinates (Variable Names)
            // If key matches a variableName, we can overlay it (though UI usually handles this)
            // No specific structural overlay needed for simple variable keys as they are reactive in UI
        }
    }
    return versionedTemplate;
}
async function checkAndAssignTemplates(studentId, level, schoolYearId, classId, userId) {
    try {
        const targetSchoolYear = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
        const targetSchoolYearId = String(schoolYearId);
        const targetStartDate = targetSchoolYear?.startDate ? new Date(targetSchoolYear.startDate) : null;
        let cachedSchoolYears = null;
        const getSchoolYears = async () => {
            if (cachedSchoolYears)
                return cachedSchoolYears;
            cachedSchoolYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
            return cachedSchoolYears;
        };
        // 1. Find other students in the same level for this school year
        const classesInLevel = await Class_1.ClassModel.find({ level, schoolYearId }).lean();
        const classIdsInLevel = classesInLevel.map(c => String(c._id));
        if (classIdsInLevel.length === 0)
            return;
        // Find enrollments in these classes (excluding the current student)
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIdsInLevel },
            studentId: { $ne: studentId }
        }).lean();
        if (enrollments.length === 0)
            return;
        const otherStudentIds = enrollments.map(e => e.studentId);
        // 2. Find templates assigned to these students
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: otherStudentIds }
        }).lean();
        const templateIds = [...new Set(assignments.map(a => a.templateId))];
        if (templateIds.length === 0) {
            // 2a. Check for Default Templates for this Level
            const defaultTemplates = await GradebookTemplate_1.GradebookTemplate.find({ defaultForLevels: level }).lean();
            if (defaultTemplates.length > 0) {
                templateIds.push(...defaultTemplates.map(t => String(t._id)));
            }
        }
        if (templateIds.length === 0)
            return;
        // 3. Assign these templates to the new student
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId }).lean();
        const teacherIds = teacherAssignments.map(t => t.teacherId);
        for (const templateId of templateIds) {
            // Check if already assigned
            const exists = await TemplateAssignment_1.TemplateAssignment.findOne({ studentId, templateId });
            const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
            if (!template)
                continue;
            if (!exists) {
                // NEW: Check for previous year assignment data to copy over
                // We look for a "SavedGradebook" or a previous "TemplateAssignment" for the PREVIOUS level/year.
                // However, we want the data to persist.
                // If we find a previous assignment for this student (regardless of template ID? or maybe same template ID if it persists?),
                // we should copy the `data` field.
                // Actually, the user requirement is: "modified on the same one that was worked on in the previous years"
                // This implies the data should carry over.
                let initialData = {};
                // Find the most recent assignment for this student (any template, or matching template?)
                // If the template changes between years (e.g. EB4 -> EB5), the structure might be different.
                // But usually, teachers want to keep comments or specific tracking data.
                // Let's try to find the MOST RECENT assignment for this student
                const lastAssignment = await TemplateAssignment_1.TemplateAssignment.findOne({ studentId, templateId })
                    .sort({ assignedAt: -1 })
                    .lean();
                if (lastAssignment && lastAssignment.data) {
                    // Use centralized allowlist-based sanitization (replaces blacklist approach)
                    // This explicitly documents which fields are safe to copy and adds copiedFrom metadata for traceability
                    const { sanitizeDataForNewAssignment } = await Promise.resolve().then(() => __importStar(require('./readinessUtils')));
                    initialData = sanitizeDataForNewAssignment(lastAssignment.data, String(lastAssignment._id));
                }
                await TemplateAssignment_1.TemplateAssignment.create({
                    templateId,
                    templateVersion: template.currentVersion || 1,
                    studentId,
                    completionSchoolYearId: schoolYearId,
                    assignedTeachers: teacherIds,
                    assignedBy: userId,
                    assignedAt: new Date(),
                    status: 'draft',
                    data: initialData // Initialize with previous data (sanitized via allowlist with copiedFrom metadata)
                });
            }
            else {
                // Update existing assignment to ensure it's ready for the new year
                const updates = {};
                // Update version if needed
                if (exists.templateVersion !== template.currentVersion) {
                    updates.templateVersion = template.currentVersion;
                }
                const completionYearId = String(exists.completionSchoolYearId || '');
                const assignedAt = exists.assignedAt ? new Date(exists.assignedAt) : null;
                let inferredFromYearId = completionYearId || null;
                if (!inferredFromYearId && assignedAt) {
                    const years = await getSchoolYears();
                    const within = years.find((y) => {
                        if (!y?.startDate || !y?.endDate)
                            return false;
                        const start = new Date(y.startDate);
                        const end = new Date(y.endDate);
                        return assignedAt >= start && assignedAt <= end;
                    });
                    if (within) {
                        inferredFromYearId = String(within._id);
                    }
                    else {
                        const prior = [...years].reverse().find((y) => {
                            if (!y?.startDate)
                                return false;
                            const start = new Date(y.startDate);
                            return assignedAt >= start;
                        });
                        if (prior)
                            inferredFromYearId = String(prior._id);
                    }
                }
                const likelyTargetYearByDate = !completionYearId &&
                    !!targetStartDate &&
                    !!assignedAt &&
                    assignedAt >= targetStartDate;
                const belongsToTargetYear = completionYearId === targetSchoolYearId ||
                    (!completionYearId && inferredFromYearId === targetSchoolYearId) ||
                    (!completionYearId && !inferredFromYearId && likelyTargetYearByDate);
                const shouldResetForNewYear = !belongsToTargetYear;
                if (shouldResetForNewYear) {
                    // Import archiveYearCompletions to preserve historical data
                    const { archiveYearCompletions, getRolloverUpdate } = await Promise.resolve().then(() => __importStar(require('../services/rolloverService')));
                    // Archive current year's completions BEFORE resetting
                    if (inferredFromYearId) {
                        const archiveUpdates = archiveYearCompletions(exists, inferredFromYearId);
                        Object.assign(updates, archiveUpdates);
                    }
                    Object.assign(updates, getRolloverUpdate(targetSchoolYearId, userId));
                }
                else if (!completionYearId) {
                    updates.completionSchoolYearId = targetSchoolYearId;
                }
                // Always update teachers to the new class teachers
                updates.assignedTeachers = teacherIds;
                await TemplateAssignment_1.TemplateAssignment.updateOne({ _id: exists._id }, { $set: updates });
            }
        }
    }
    catch (err) {
        console.error('Error in checkAndAssignTemplates:', err);
    }
}
function getRowSignature(row) {
    if (!Array.isArray(row))
        return '';
    return row
        .map((cell) => {
        if (!cell)
            return '';
        if (typeof cell === 'string')
            return cell;
        if (typeof cell?.text === 'string')
            return cell.text;
        return '';
    })
        .join('|')
        .trim();
}
function getBlockSignature(block) {
    if (!block || typeof block !== 'object')
        return '';
    const t = String(block.type || '');
    const p = block.props || {};
    const keyProps = {};
    if (t === 'language_toggle' || t === 'language_toggle_v2') {
        const items = Array.isArray(p.items) ? p.items : [];
        keyProps.items = items.map((it) => ({
            code: it?.code,
            type: it?.type,
            label: it?.label,
            level: it?.level,
            levels: it?.levels,
        }));
    }
    else if (t === 'dropdown') {
        keyProps.dropdownNumber = p.dropdownNumber;
        keyProps.variableName = p.variableName;
        keyProps.field = p.field;
    }
    else if (t === 'table') {
        const cells = Array.isArray(p.cells) ? p.cells : [];
        keyProps.firstRow = cells[0] ? getRowSignature(cells[0]) : '';
        keyProps.firstCol = cells.map((r) => (Array.isArray(r) && r[0] ? r[0]?.text : '')).join('|').slice(0, 300);
        keyProps.expandedRows = !!p.expandedRows;
    }
    else {
        if (typeof p.content === 'string')
            keyProps.content = p.content.slice(0, 300);
        if (typeof p.text === 'string')
            keyProps.text = p.text.slice(0, 300);
        if (typeof p.title === 'string')
            keyProps.title = p.title.slice(0, 120);
        if (typeof p.field === 'string')
            keyProps.field = p.field;
    }
    return `${t}:${JSON.stringify(keyProps)}`;
}
/**
 * Ensure every block has a stable, unique blockId.
 *
 * This function GUARANTEES that every block in the returned pages array
 * has a valid blockId in props.blockId. This is critical for:
 * - Mapping student data to the correct block even after page reordering
 * - Maintaining data integrity when pages are added/removed
 * - Future-proofing against template structure changes
 *
 * Algorithm:
 * 1. Build a map of existing blockIds from previous pages (if any)
 * 2. For each block in next pages:
 *    - If it already has a valid blockId, keep it
 *    - Otherwise, try to match by signature to preserve existing IDs
 *    - If no match, generate a new UUID
 *
 * @param previousPages - The previous version of pages (for ID preservation)
 * @param nextPages - The new pages to process
 * @returns Pages array with guaranteed blockIds on every block
 */
function ensureStableBlockIds(previousPages, nextPages) {
    const pages = Array.isArray(nextPages) ? JSON.parse(JSON.stringify(nextPages)) : [];
    const prevBlocksById = new Map();
    const prevIdsBySignature = new Map();
    const prevPagesArr = Array.isArray(previousPages) ? previousPages : [];
    for (const prevPage of prevPagesArr) {
        const prevBlocks = Array.isArray(prevPage?.blocks) ? prevPage.blocks : [];
        for (const prevBlock of prevBlocks) {
            const prevIdRaw = prevBlock?.props?.blockId;
            const prevId = typeof prevIdRaw === 'string' && prevIdRaw.trim() ? prevIdRaw.trim() : (0, crypto_1.randomUUID)();
            const sig = getBlockSignature(prevBlock);
            const list = prevIdsBySignature.get(sig) || [];
            list.push(prevId);
            prevIdsBySignature.set(sig, list);
            prevBlocksById.set(prevId, prevBlock);
        }
    }
    for (const page of pages) {
        const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
        for (const block of blocks) {
            if (!block)
                continue;
            // Initialize props if missing
            block.props = block.props || {};
            const currentId = block.props.blockId;
            const currentIdValid = typeof currentId === 'string' && currentId.trim();
            // If block already has a valid blockId, keep it
            if (currentIdValid)
                continue;
            // Try to match by signature to preserve existing IDs
            const sig = getBlockSignature(block);
            const candidates = prevIdsBySignature.get(sig) || [];
            const nextId = candidates.shift() || (0, crypto_1.randomUUID)();
            prevIdsBySignature.set(sig, candidates);
            // ALWAYS assign a blockId - this is mandatory
            block.props.blockId = nextId;
        }
    }
    // Final validation: ensure every block has a blockId
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
        for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
            const block = blocks[blockIdx];
            if (!block)
                continue;
            block.props = block.props || {};
            if (!block.props.blockId || typeof block.props.blockId !== 'string' || !block.props.blockId.trim()) {
                block.props.blockId = (0, crypto_1.randomUUID)();
                console.warn(`[ensureStableBlockIds] Generated missing blockId for block at page ${pageIdx}, index ${blockIdx}`);
            }
        }
    }
    return pages;
}
function ensureStableExpandedTableRowIds(previousPages, nextPages) {
    const pages = Array.isArray(nextPages) ? JSON.parse(JSON.stringify(nextPages)) : [];
    const prevTableBlocksById = new Map();
    const prevPagesArr = Array.isArray(previousPages) ? previousPages : [];
    for (const prevPage of prevPagesArr) {
        const prevBlocks = Array.isArray(prevPage?.blocks) ? prevPage.blocks : [];
        for (const prevBlock of prevBlocks) {
            if (!prevBlock || prevBlock.type !== 'table' || !prevBlock?.props?.expandedRows)
                continue;
            const id = prevBlock?.props?.blockId;
            if (typeof id === 'string' && id.trim())
                prevTableBlocksById.set(id.trim(), prevBlock);
        }
    }
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
        for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
            const block = blocks[blockIdx];
            if (!block || block.type !== 'table' || !block?.props?.expandedRows)
                continue;
            const nextCells = Array.isArray(block?.props?.cells) ? block.props.cells : [];
            const rowCount = nextCells.length;
            if (rowCount === 0)
                continue;
            const nextRowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : null;
            const nextRowIdsValid = nextRowIds &&
                nextRowIds.length === rowCount &&
                nextRowIds.every((v) => typeof v === 'string' && v.trim());
            if (nextRowIdsValid)
                continue;
            const blockId = block?.props?.blockId;
            const prevBlock = typeof blockId === 'string' && blockId.trim()
                ? prevTableBlocksById.get(blockId.trim())
                : previousPages?.[pageIdx]?.blocks?.[blockIdx];
            const prevCells = Array.isArray(prevBlock?.props?.cells) ? prevBlock.props.cells : [];
            const prevRowIds = Array.isArray(prevBlock?.props?.rowIds) ? prevBlock.props.rowIds : [];
            const idsBySignature = new Map();
            for (let rowIdx = 0; rowIdx < prevCells.length; rowIdx++) {
                const signature = getRowSignature(prevCells[rowIdx]);
                const id = typeof prevRowIds[rowIdx] === 'string' && prevRowIds[rowIdx].trim() ? prevRowIds[rowIdx] : (0, crypto_1.randomUUID)();
                const list = idsBySignature.get(signature) || [];
                list.push(id);
                idsBySignature.set(signature, list);
            }
            const assignedRowIds = [];
            for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
                const signature = getRowSignature(nextCells[rowIdx]);
                const candidates = idsBySignature.get(signature) || [];
                const id = candidates.shift() || (0, crypto_1.randomUUID)();
                assignedRowIds.push(id);
                idsBySignature.set(signature, candidates);
            }
            block.props = block.props || {};
            block.props.rowIds = assignedRowIds;
        }
    }
    return pages;
}
