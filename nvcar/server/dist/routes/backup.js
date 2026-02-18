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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const archiver_1 = __importDefault(require("archiver"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = require("crypto");
const os_1 = __importDefault(require("os"));
const jszip_1 = __importDefault(require("jszip"));
const User_1 = require("../models/User");
const bcrypt = __importStar(require("bcryptjs"));
const Level_1 = require("../models/Level");
const auditLogger_1 = require("../utils/auditLogger");
const ErrorLog_1 = require("../models/ErrorLog");
exports.backupRouter = (0, express_1.Router)();
const BACKUP_DIR = path_1.default.join(process.cwd(), 'backups');
if (!fs_1.default.existsSync(BACKUP_DIR)) {
    fs_1.default.mkdirSync(BACKUP_DIR, { recursive: true });
}
const clearDatabase = async () => {
    const models = mongoose_1.default.modelNames();
    for (const modelName of models) {
        const Model = mongoose_1.default.model(modelName);
        await Model.deleteMany({});
    }
};
const readBackupPayload = async (zipContents, modelNames) => {
    const payload = new Map();
    for (const modelName of modelNames) {
        const file = zipContents.file(`${modelName}.json`);
        if (!file) {
            payload.set(modelName, []);
            continue;
        }
        const content = await file.async('string');
        const docs = JSON.parse(content);
        if (!Array.isArray(docs)) {
            throw new Error(`Invalid backup format for ${modelName}: expected JSON array`);
        }
        payload.set(modelName, docs);
    }
    return payload;
};
const readCurrentDatabasePayload = async (modelNames) => {
    const payload = new Map();
    for (const modelName of modelNames) {
        const Model = mongoose_1.default.model(modelName);
        const docs = await Model.find({}).lean();
        payload.set(modelName, docs);
    }
    return payload;
};
const applyPayloadDestructive = async (payload, modelNames) => {
    await clearDatabase();
    for (const modelName of modelNames) {
        const docs = payload.get(modelName) || [];
        if (docs.length > 0) {
            const Model = mongoose_1.default.model(modelName);
            await Model.insertMany(docs);
        }
    }
};
const getRestoreMode = (req) => {
    const rawMode = String(req?.body?.mode || req?.body?.restoreMode || req?.query?.mode || 'destructive').toLowerCase();
    if (rawMode === 'destructive' || rawMode === 'safe')
        return rawMode;
    return null;
};
const createBackupAlert = async (req, message, details, status = 500) => {
    const userInfo = req?.user || {};
    const userId = String(userInfo.userId || userInfo.actualUserId || 'system');
    const role = String(userInfo.role || userInfo.actualRole || 'ADMIN');
    await ErrorLog_1.ErrorLog.create({
        userId,
        role,
        actualUserId: userInfo.actualUserId,
        actualRole: userInfo.actualRole,
        displayName: userInfo.displayName,
        email: userInfo.email,
        source: 'restore-drill',
        method: 'POST',
        url: '/backup/drill/:filename',
        status,
        message,
        details,
    });
};
const runRestoreDrill = async (filePath, modelNames) => {
    const issues = [];
    const fileContent = fs_1.default.readFileSync(filePath);
    const jszip = new jszip_1.default();
    const zipContents = await jszip.loadAsync(fileContent);
    const jsonEntries = Object.keys(zipContents.files).filter(name => name.toLowerCase().endsWith('.json'));
    if (jsonEntries.length === 0) {
        issues.push({
            severity: 'error',
            code: 'no_json_files',
            message: 'Backup archive contains no JSON collection files.',
        });
    }
    for (const modelName of modelNames) {
        const fileName = `${modelName}.json`;
        const modelFile = zipContents.file(fileName);
        if (!modelFile) {
            issues.push({
                severity: 'error',
                code: 'missing_model_file',
                message: `Missing backup payload for model ${modelName}.`,
                modelName,
                fileName,
            });
            continue;
        }
        try {
            const content = await modelFile.async('string');
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                issues.push({
                    severity: 'error',
                    code: 'invalid_model_payload',
                    message: `Expected array payload for model ${modelName}.`,
                    modelName,
                    fileName,
                });
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                code: 'invalid_json',
                message: `Invalid JSON for model ${modelName}: ${error?.message || 'Unknown parse error'}`,
                modelName,
                fileName,
            });
        }
    }
    return {
        filesScanned: jsonEntries.length,
        modelCount: modelNames.length,
        issues,
        passed: issues.length === 0,
        summary: {
            errors: issues.filter(issue => issue.severity === 'error').length,
            warnings: issues.filter(issue => issue.severity === 'warning').length,
        }
    };
};
// List available backups
exports.backupRouter.get('/list', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const files = fs_1.default.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip'));
        const backups = files.map(f => {
            const stats = fs_1.default.statSync(path_1.default.join(BACKUP_DIR, f));
            return {
                name: f,
                size: stats.size,
                date: stats.mtime
            };
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
        res.json(backups);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});
// Create new DB backup (stored on server)
exports.backupRouter.post('/create', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), `nvcar-db-backup-${(0, crypto_1.randomUUID)()}`);
    const fileName = `backup-db-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    const archivePath = path_1.default.join(BACKUP_DIR, fileName);
    try {
        fs_1.default.mkdirSync(tempDir, { recursive: true });
        const models = mongoose_1.default.modelNames();
        for (const modelName of models) {
            const Model = mongoose_1.default.model(modelName);
            const docs = await Model.find({}).lean();
            fs_1.default.writeFileSync(path_1.default.join(tempDir, `${modelName}.json`), JSON.stringify(docs, null, 2));
        }
        const output = fs_1.default.createWriteStream(archivePath);
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        const adminId = req.user?.userId;
        output.on('close', async () => {
            try {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            catch (e) { }
            // Log the backup creation
            await (0, auditLogger_1.logAudit)({
                userId: adminId,
                action: 'CREATE_BACKUP',
                details: {
                    filename: fileName,
                    modelsBackedUp: models.length
                },
                req
            });
            res.json({ success: true, filename: fileName });
        });
        archive.on('error', (err) => {
            throw err;
        });
        archive.pipe(output);
        archive.directory(tempDir, false);
        await archive.finalize();
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Backup creation failed' });
        try {
            fs_1.default.rmSync(tempDir, { recursive: true, force: true });
        }
        catch (e) { }
    }
});
// Restore backup
exports.backupRouter.post('/restore/:filename', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { filename } = req.params;
    const filePath = path_1.default.join(BACKUP_DIR, filename);
    const mode = getRestoreMode(req);
    if (!fs_1.default.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup not found' });
    }
    if (!mode) {
        return res.status(400).json({ error: 'Invalid restore mode. Use destructive or safe.' });
    }
    try {
        const fileContent = fs_1.default.readFileSync(filePath);
        const jszip = new jszip_1.default();
        const zipContents = await jszip.loadAsync(fileContent);
        const models = mongoose_1.default.modelNames();
        const backupPayload = await readBackupPayload(zipContents, models);
        let rollbackPerformed = false;
        if (mode === 'destructive') {
            await applyPayloadDestructive(backupPayload, models);
        }
        else {
            const preRestorePayload = await readCurrentDatabasePayload(models);
            try {
                await applyPayloadDestructive(backupPayload, models);
            }
            catch (restoreError) {
                try {
                    await applyPayloadDestructive(preRestorePayload, models);
                    rollbackPerformed = true;
                }
                catch (rollbackError) {
                    const combinedError = new Error(`Safe restore failed and rollback failed: restore=${restoreError?.message || restoreError}; rollback=${rollbackError?.message || rollbackError}`);
                    combinedError.rollbackFailed = true;
                    throw combinedError;
                }
                const wrappedError = new Error(`Safe restore failed. Original data was restored. Cause: ${restoreError?.message || restoreError}`);
                wrappedError.rollbackPerformed = true;
                throw wrappedError;
            }
        }
        // Log the restore
        const adminId = req.user?.userId;
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'RESTORE_BACKUP',
            details: {
                filename,
                modelsRestored: models.length,
                mode,
                rollbackPerformed
            },
            req
        });
        res.json({ success: true, mode, rollbackPerformed });
    }
    catch (e) {
        console.error('Restore error:', e);
        const rollbackPerformed = Boolean(e?.rollbackPerformed);
        const rollbackFailed = Boolean(e?.rollbackFailed);
        res.status(500).json({
            error: 'Restore failed',
            message: e?.message || 'Unknown restore error',
            rollbackPerformed,
            rollbackFailed
        });
    }
});
exports.backupRouter.post('/drill/:filename', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { filename } = req.params;
    const filePath = path_1.default.join(BACKUP_DIR, filename);
    if (!fs_1.default.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup not found' });
    }
    try {
        const models = mongoose_1.default.modelNames();
        const drillResult = await runRestoreDrill(filePath, models);
        const adminId = req.user?.userId;
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'RESTORE_DRILL',
            details: {
                filename,
                passed: drillResult.passed,
                errors: drillResult.summary.errors,
                warnings: drillResult.summary.warnings,
            },
            req
        });
        if (!drillResult.passed) {
            await createBackupAlert(req, `Restore drill failed for backup ${filename}`, {
                filename,
                summary: drillResult.summary,
                firstIssues: drillResult.issues.slice(0, 10),
            }, 422);
        }
        res.json({
            filename,
            executedAt: new Date().toISOString(),
            ...drillResult,
        });
    }
    catch (error) {
        console.error('Restore drill failed:', error);
        try {
            await createBackupAlert(req, `Restore drill execution failed for backup ${filename}`, {
                filename,
                error: error?.message || 'Unexpected restore drill error',
            });
        }
        catch (logError) {
            console.error('Restore drill alert failed:', logError);
        }
        res.status(500).json({ error: 'restore_drill_failed', message: error?.message || 'Unexpected restore drill error' });
    }
});
// Empty database
exports.backupRouter.post('/empty', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Preserve only: default admin (email: 'admin') and Microsoft-authenticated admin accounts
        const adminUsersToKeep = await User_1.User.find({
            role: 'ADMIN',
            $or: [
                { email: 'admin' },
                { authProvider: 'microsoft' }
            ]
        }).lean();
        await clearDatabase();
        // Restore preserved admins
        if (adminUsersToKeep.length > 0) {
            await User_1.User.insertMany(adminUsersToKeep);
        }
        else {
            // Fallback: create default admin if none preserved
            const hash = await bcrypt.hash('admin', 10);
            await User_1.User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' });
        }
        // Re-seed default levels
        await Level_1.Level.insertMany([
            { name: 'PS', order: 1 },
            { name: 'MS', order: 2 },
            { name: 'GS', order: 3 },
        ]);
        // Log the database empty operation
        const adminId = req.user?.userId;
        if (adminId) {
            await (0, auditLogger_1.logAudit)({
                userId: adminId,
                action: 'EMPTY_DATABASE',
                details: {
                    adminsPreserved: adminUsersToKeep.length,
                    levelsReseeded: true
                },
                req
            });
        }
        res.json({ success: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Empty DB failed' });
    }
});
// Delete backup
exports.backupRouter.delete('/:filename', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { filename } = req.params;
    const filePath = path_1.default.join(BACKUP_DIR, filename);
    if (fs_1.default.existsSync(filePath)) {
        try {
            fs_1.default.unlinkSync(filePath);
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: 'Delete failed' });
        }
    }
    else {
        res.status(404).json({ error: 'File not found' });
    }
});
exports.backupRouter.get('/full', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), `nvcar-backup-${(0, crypto_1.randomUUID)()}`);
    const archivePath = path_1.default.join(tempDir, 'backup.zip');
    try {
        // Create temp directory
        if (!fs_1.default.existsSync(tempDir)) {
            fs_1.default.mkdirSync(tempDir, { recursive: true });
        }
        // 1. Dump Database
        const dbDir = path_1.default.join(tempDir, 'db');
        fs_1.default.mkdirSync(dbDir);
        const models = mongoose_1.default.modelNames();
        for (const modelName of models) {
            const Model = mongoose_1.default.model(modelName);
            const docs = await Model.find({}).lean();
            fs_1.default.writeFileSync(path_1.default.join(dbDir, `${modelName}.json`), JSON.stringify(docs, null, 2));
        }
        // Create restore batch file
        const dbNameForRestore = mongoose_1.default.connection?.db?.databaseName || process.env.MONGO_DB_NAME || 'nvcar';
        const restoreScript = `@echo off
    echo Restoring database '${dbNameForRestore}' from JSON files in this folder...
    echo.

    where mongoimport >nul 2>nul
    if %errorlevel% neq 0 (
        echo Error: mongoimport not found in PATH.
        echo Please install MongoDB Database Tools.
        pause
        exit /b
    )

    for %%f in (*.json) do (
        echo Importing %%~nf...
        mongoimport --db ${dbNameForRestore} --collection %%~nf --file "%%f" --jsonArray --drop
    )

echo.
echo Restore completed!
pause
`;
        fs_1.default.writeFileSync(path_1.default.join(dbDir, 'restore_db.bat'), restoreScript);
        // 2. Prepare Archive
        const output = fs_1.default.createWriteStream(archivePath);
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        output.on('close', () => {
            res.download(archivePath, `nvcar-full-backup-${new Date().toISOString().split('T')[0]}.zip`, (err) => {
                // Cleanup
                try {
                    fs_1.default.rmSync(tempDir, { recursive: true, force: true });
                }
                catch (e) {
                    console.error('Error cleaning up backup temp dir:', e);
                }
            });
        });
        archive.on('error', (err) => {
            throw err;
        });
        archive.pipe(output);
        // Add DB dump
        archive.directory(dbDir, 'database');
        // Add Source Code
        // Assuming process.cwd() is nvcar/server
        const serverDir = process.cwd();
        const clientDir = path_1.default.resolve(serverDir, '../client');
        const rootDir = path_1.default.resolve(serverDir, '..'); // nvcar folder
        // Add Server (excluding node_modules, dist, .git)
        // We include public/uploads to ensure full restoration
        archive.directory(serverDir, 'server', (entry) => {
            if (entry.name.includes('node_modules') ||
                entry.name.includes('dist') ||
                entry.name.includes('.git')) {
                return false;
            }
            return entry;
        });
        // Add Client (excluding node_modules, dist, .git)
        archive.directory(clientDir, 'client', (entry) => {
            if (entry.name.includes('node_modules') ||
                entry.name.includes('dist') ||
                entry.name.includes('build') ||
                entry.name.includes('.git')) {
                return false;
            }
            return entry;
        });
        // Add root files (like start_app.bat)
        const rootFiles = fs_1.default.readdirSync(rootDir).filter(f => fs_1.default.statSync(path_1.default.join(rootDir, f)).isFile());
        rootFiles.forEach(f => {
            archive.file(path_1.default.join(rootDir, f), { name: f });
        });
        // Add root directories (like certs/, backups/, etc.)
        const rootDirs = fs_1.default.readdirSync(rootDir)
            .filter(name => {
            const full = path_1.default.join(rootDir, name);
            if (!fs_1.default.existsSync(full))
                return false;
            if (!fs_1.default.statSync(full).isDirectory())
                return false;
            if (name === 'server' || name === 'client')
                return false;
            if (name === 'node_modules' || name === '.git')
                return false;
            return true;
        });
        rootDirs.forEach(dirName => {
            archive.directory(path_1.default.join(rootDir, dirName), dirName, (entry) => {
                if (entry.name.includes('node_modules') ||
                    entry.name.includes('dist') ||
                    entry.name.includes('build') ||
                    entry.name.includes('.git')) {
                    return false;
                }
                return entry;
            });
        });
        await archive.finalize();
    }
    catch (err) {
        console.error('Backup error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Backup failed' });
        }
        // Cleanup on error
        try {
            if (fs_1.default.existsSync(tempDir)) {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
        }
        catch (e) { }
    }
});
