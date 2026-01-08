"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const archiver_1 = __importDefault(require("archiver"));
const jszip_1 = __importDefault(require("jszip"));
const pptxImporter_1 = require("../utils/pptxImporter");
const templateUtils_1 = require("../utils/templateUtils");
const cache_1 = require("../utils/cache");
const User_1 = require("../models/User");
const fs_1 = __importDefault(require("fs"));
exports.templatesRouter = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.templatesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const list = await (0, cache_1.withCache)('templates-all', () => GradebookTemplate_1.GradebookTemplate.find({}).lean());
    res.json(list);
});
exports.templatesRouter.post('/import-pptx', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'missing_file' });
        const uploadDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'media');
        // Pass empty baseUrl to generate relative paths (/uploads/media/...)
        const importer = new pptxImporter_1.PptxImporter(uploadDir, '');
        const templateData = await importer.parse(req.file.buffer);
        const pagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(undefined, templateData?.pages);
        const pagesWithRowIds = (0, templateUtils_1.ensureStableExpandedTableRowIds)(undefined, pagesWithBlockIds);
        // Create the template in DB
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({
            ...templateData,
            pages: pagesWithRowIds,
            createdBy: req.user.userId,
            updatedAt: new Date(),
            status: 'draft',
            currentVersion: 1,
            versionHistory: [{
                    version: 1,
                    pages: pagesWithRowIds,
                    variables: templateData?.variables || {},
                    watermark: templateData?.watermark,
                    createdAt: new Date(),
                    createdBy: req.user.userId,
                    changeDescription: 'Initial version'
                }]
        });
        (0, cache_1.clearCache)('templates');
        res.json(tpl);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import_failed', message: e.message });
    }
});
exports.templatesRouter.post('/import-package', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'missing_file' });
        let jsonContent = '';
        // Check if zip
        if (req.file.mimetype === 'application/zip' || req.file.originalname.endsWith('.zip')) {
            const zip = await jszip_1.default.loadAsync(req.file.buffer);
            const file = zip.file('template.json');
            if (!file)
                return res.status(400).json({ error: 'invalid_zip_no_template_json' });
            jsonContent = await file.async('string');
        }
        else {
            jsonContent = req.file.buffer.toString('utf8');
        }
        let templateData;
        try {
            templateData = JSON.parse(jsonContent);
        }
        catch (e) {
            return res.status(400).json({ error: 'invalid_json' });
        }
        const userId = req.user.userId;
        // Remove system fields
        const { _id, __v, createdBy, createdAt, updatedAt, ...cleanData } = templateData;
        const pagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(undefined, cleanData?.pages);
        const pagesWithRowIds = (0, templateUtils_1.ensureStableExpandedTableRowIds)(undefined, pagesWithBlockIds);
        const newTemplate = await GradebookTemplate_1.GradebookTemplate.create({
            ...cleanData,
            name: `${cleanData.name} (Imported)`,
            pages: pagesWithRowIds,
            createdBy: userId,
            updatedAt: new Date(),
            createdAt: new Date(),
            status: 'draft',
            currentVersion: 1,
            versionHistory: [{
                    version: 1,
                    pages: pagesWithRowIds,
                    variables: cleanData.variables || {},
                    watermark: cleanData.watermark,
                    createdAt: new Date(),
                    createdBy: userId,
                    changeDescription: 'Imported from package'
                }]
        });
        (0, cache_1.clearCache)('templates');
        res.json(newTemplate);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import_failed', message: e.message });
    }
});
exports.templatesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { name, pages, variables, watermark, permissions, status, exportPassword } = req.body || {};
        if (!name)
            return res.status(400).json({ error: 'missing_name' });
        const userId = req.user.actualUserId || req.user.userId;
        const pagesWithBlockIds = (0, templateUtils_1.ensureStableBlockIds)(undefined, Array.isArray(pages) ? pages : []);
        const pagesWithRowIds = (0, templateUtils_1.ensureStableExpandedTableRowIds)(undefined, pagesWithBlockIds);
        const templateData = {
            name,
            pages: pagesWithRowIds,
            variables: variables || {},
            watermark,
            permissions,
            status: status || 'draft',
            exportPassword,
            createdBy: userId,
            updatedAt: new Date(),
            currentVersion: 1,
            versionHistory: [{
                    version: 1,
                    pages: pagesWithRowIds,
                    variables: variables || {},
                    watermark,
                    createdAt: new Date(),
                    createdBy: userId,
                    changeDescription: 'Initial version'
                }]
        };
        const tpl = await GradebookTemplate_1.GradebookTemplate.create(templateData);
        (0, cache_1.clearCache)('templates');
        res.json(tpl);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
exports.templatesRouter.get('/:id/export-package', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const template = await GradebookTemplate_1.GradebookTemplate.findById(id).lean();
        if (!template)
            return res.status(404).json({ error: 'not_found' });
        // Clean data
        const { _id, __v, createdBy, updatedAt, ...cleanTemplate } = template;
        // Create archive
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        // Determine target directory: .../nvcar/temps
        // process.cwd() is .../nvcar/server
        // So ../temps is .../nvcar/temps
        const targetDir = path_1.default.join(process.cwd(), '../temps');
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        const fileName = `${template.name.replace(/[^a-z0-9]/gi, '_')}_export.zip`;
        const filePath = path_1.default.join(targetDir, fileName);
        // Check if file exists
        let existed = false;
        if (fs_1.default.existsSync(filePath)) {
            existed = true;
        }
        const output = fs_1.default.createWriteStream(filePath);
        // Save metadata
        const userId = req.user.userId;
        const user = await User_1.User.findById(userId).lean();
        const metadata = {
            exportedBy: userId,
            exportedByName: user?.displayName || 'Unknown',
            timestamp: new Date().toISOString()
        };
        const metaPath = filePath + '.json';
        fs_1.default.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
        await new Promise((resolve, reject) => {
            output.on('close', () => resolve());
            output.on('error', reject);
            archive.on('error', reject);
            archive.pipe(output);
            // Add template JSON
            archive.append(JSON.stringify(cleanTemplate, null, 2), { name: 'template.json' });
            // Add batch file
            const batContent = `@echo off
set /p targetUrl="Enter the target server URL (default: https://localhost:4000): "
if "%targetUrl%"=="" set targetUrl=https://localhost:4000

echo.
echo Please ensure you are logged in on the target server or have an authentication token.
echo This script assumes you can access the API.
echo.
echo Importing template to %targetUrl%...
echo.
echo Note: This batch script attempts to upload 'template.json'.
echo If this fails due to authentication, please use the "Import Template" button in the Admin UI.
echo.

curl -k -X POST -F "file=@template.json" "%targetUrl%/templates/import-package"

echo.
echo Done.
pause
`;
            archive.append(batContent, { name: 'import_template.bat' });
            archive.finalize();
        });
        res.json({ success: true, path: filePath, fileName, existed });
    }
    catch (e) {
        console.error('Export error:', e);
        res.status(500).json({ error: 'export_failed', message: e.message });
    }
});
// List exported packages in ../temps
exports.templatesRouter.get('/exports', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const targetDir = path_1.default.join(process.cwd(), '../temps');
        if (!fs_1.default.existsSync(targetDir))
            return res.json([]);
        const files = fs_1.default.readdirSync(targetDir).filter(f => f.endsWith('.zip'));
        const list = files.map(f => {
            const p = path_1.default.join(targetDir, f);
            const stat = fs_1.default.statSync(p);
            let metadata = {};
            try {
                const metaPath = p + '.json';
                if (fs_1.default.existsSync(metaPath)) {
                    metadata = JSON.parse(fs_1.default.readFileSync(metaPath, 'utf8'));
                }
            }
            catch (e) { /* ignore */ }
            return { fileName: f, size: stat.size, mtime: stat.mtime.toISOString(), ...metadata };
        }).sort((a, b) => (new Date(b.mtime).getTime() - new Date(a.mtime).getTime()));
        res.json(list);
    }
    catch (e) {
        console.error('List exports error:', e);
        res.status(500).json({ error: 'list_exports_failed', message: e.message });
    }
});
// Download an exported package
exports.templatesRouter.get('/exports/:fileName', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { fileName } = req.params;
        const targetDir = path_1.default.join(process.cwd(), '../temps');
        const filePath = path_1.default.join(targetDir, fileName);
        if (!fs_1.default.existsSync(filePath))
            return res.status(404).json({ error: 'not_found' });
        res.download(filePath, fileName);
    }
    catch (e) {
        console.error('Download export error:', e);
        res.status(500).json({ error: 'download_failed', message: e.message });
    }
});
// Delete an exported package
exports.templatesRouter.delete('/exports/:fileName', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { fileName } = req.params;
        const targetDir = path_1.default.join(process.cwd(), '../temps');
        const filePath = path_1.default.join(targetDir, fileName);
        if (!fs_1.default.existsSync(filePath))
            return res.status(404).json({ error: 'not_found' });
        fs_1.default.unlinkSync(filePath);
        // Delete metadata if exists
        const metaPath = filePath + '.json';
        if (fs_1.default.existsSync(metaPath)) {
            fs_1.default.unlinkSync(metaPath);
        }
        res.json({ success: true });
    }
    catch (e) {
        console.error('Delete export error:', e);
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
exports.templatesRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const tpl = await (0, cache_1.withCache)(`template-${id}`, () => GradebookTemplate_1.GradebookTemplate.findById(id).lean());
    if (!tpl)
        return res.status(404).json({ error: 'not_found' });
    res.json(tpl);
});
exports.templatesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { _id, __v, createdBy, updatedAt, shareId, versions, comments, versionHistory, currentVersion, changeDescription, ...rest } = req.body || {};
        const userId = req.user.actualUserId || req.user.userId;
        // Get the current template
        const currentTemplate = await GradebookTemplate_1.GradebookTemplate.findById(id);
        if (!currentTemplate)
            return res.status(404).json({ error: 'template_not_found' });
        const previousPages = Array.isArray(currentTemplate.pages) ? currentTemplate.pages : [];
        const hasIncomingPages = Object.prototype.hasOwnProperty.call(rest, 'pages');
        const incomingPages = hasIncomingPages ? (Array.isArray(rest.pages) ? rest.pages : []) : undefined;
        const pagesWithBlockIds = hasIncomingPages ? (0, templateUtils_1.ensureStableBlockIds)(previousPages, incomingPages) : undefined;
        const pagesWithRowIds = hasIncomingPages ? (0, templateUtils_1.ensureStableExpandedTableRowIds)(previousPages, pagesWithBlockIds) : undefined;
        // Check if this is a significant change (pages, variables, or watermark changed)
        const hasSignificantChange = rest.pages || rest.variables !== undefined || rest.watermark !== undefined;
        // Check if there are existing assignments using this template
        const existingAssignments = await TemplateAssignment_1.TemplateAssignment.find({ templateId: id }).lean();
        const hasActiveAssignments = existingAssignments.length > 0;
        // If there are active assignments and significant changes, create a new version
        if (hasActiveAssignments && hasSignificantChange) {
            const newVersion = (currentTemplate.currentVersion || 1) + 1;
            // Add current state to version history
            const newHistoryEntry = {
                version: newVersion,
                pages: hasIncomingPages ? pagesWithRowIds : currentTemplate.pages,
                variables: rest.variables !== undefined ? rest.variables : currentTemplate.variables,
                watermark: rest.watermark !== undefined ? rest.watermark : currentTemplate.watermark,
                createdAt: new Date(),
                createdBy: userId,
                changeDescription: changeDescription || `Version ${newVersion}`
            };
            currentTemplate.versionHistory.push(newHistoryEntry);
            currentTemplate.currentVersion = newVersion;
        }
        // Update the template
        const data = { ...rest, updatedAt: new Date() };
        if (hasIncomingPages)
            data.pages = pagesWithRowIds;
        if (hasActiveAssignments && hasSignificantChange) {
            data.versionHistory = currentTemplate.versionHistory;
            data.currentVersion = currentTemplate.currentVersion;
        }
        const tpl = await GradebookTemplate_1.GradebookTemplate.findByIdAndUpdate(id, data, { new: true });
        // Update existing assignments to use the new version so changes propagate immediately
        if (hasActiveAssignments && hasSignificantChange && tpl) {
            await TemplateAssignment_1.TemplateAssignment.updateMany({ templateId: id }, { $set: { templateVersion: tpl.currentVersion } });
        }
        (0, cache_1.clearCache)('templates');
        res.json(tpl);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
exports.templatesRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    (0, cache_1.clearCache)('templates');
    await GradebookTemplate_1.GradebookTemplate.findByIdAndDelete(id);
    res.json({ ok: true });
});
