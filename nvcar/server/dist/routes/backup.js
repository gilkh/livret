"use strict";
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
const uuid_1 = require("uuid");
const os_1 = __importDefault(require("os"));
exports.backupRouter = (0, express_1.Router)();
exports.backupRouter.get('/full', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const tempDir = path_1.default.join(os_1.default.tmpdir(), `nvcar-backup-${(0, uuid_1.v4)()}`);
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
        const restoreScript = `@echo off
echo Restoring database 'nvcarn' from JSON files in this folder...
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
    mongoimport --db nvcarn --collection %%~nf --file "%%f" --jsonArray --drop
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
