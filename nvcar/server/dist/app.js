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
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const auth_1 = require("./routes/auth");
const categories_1 = require("./routes/categories");
const students_1 = require("./routes/students");
const import_1 = require("./routes/import");
const pdf_1 = require("./routes/pdf");
const pdfPuppeteer_1 = require("./routes/pdfPuppeteer");
const db_1 = require("./db");
const templates_1 = require("./routes/templates");
const users_1 = require("./routes/users");
const signatures_1 = require("./routes/signatures");
const schoolYears_1 = require("./routes/schoolYears");
const media_1 = require("./routes/media");
const path_1 = __importDefault(require("path"));
const User_1 = require("./models/User");
const bcrypt = __importStar(require("bcryptjs"));
const classes_1 = require("./routes/classes");
const teacherAssignments_1 = require("./routes/teacherAssignments");
const templateAssignments_1 = require("./routes/templateAssignments");
const subAdminAssignments_1 = require("./routes/subAdminAssignments");
const teacherTemplates_1 = require("./routes/teacherTemplates");
const subAdminTemplates_1 = require("./routes/subAdminTemplates");
const auditLogs_1 = require("./routes/auditLogs");
const impersonation_1 = require("./routes/impersonation");
const suggestions_1 = require("./routes/suggestions");
const settings_1 = require("./routes/settings");
const microsoft_1 = require("./routes/microsoft");
const outlookUsers_1 = require("./routes/outlookUsers");
const analytics_1 = require("./routes/analytics");
const backup_1 = require("./routes/backup");
const levels_1 = require("./routes/levels");
const savedGradebooks_1 = require("./routes/savedGradebooks");
const Level_1 = require("./models/Level");
const adminExtras_1 = require("./routes/adminExtras");
const simulations_1 = require("./routes/simulations");
const templatePropagation_1 = require("./routes/templatePropagation");
const errorLogs_1 = require("./routes/errorLogs");
const integrity_1 = require("./routes/integrity");
const compression_1 = __importDefault(require("compression"));
const createApp = () => {
    const app = (0, express_1.default)();
    app.use((0, compression_1.default)());
    // Allow all origins with credentials
    app.use((0, cors_1.default)({
        origin: true,
        credentials: true,
        exposedHeaders: ['Content-Disposition']
    }));
    app.use(body_parser_1.default.json({ limit: '50mb' }));
    app.use(body_parser_1.default.urlencoded({ limit: '50mb', extended: true }));
    app.use('/auth', auth_1.authRouter);
    app.use('/categories', categories_1.categoriesRouter);
    app.use('/students', students_1.studentsRouter);
    app.use('/levels', levels_1.levelsRouter);
    app.use('/import', import_1.importRouter);
    // Use new Puppeteer-based PDF generation for better rendering
    app.use('/pdf-v2', pdfPuppeteer_1.pdfPuppeteerRouter);
    app.use('/reports-v2', pdfPuppeteer_1.pdfPuppeteerRouter);
    app.use('/files-v2', pdfPuppeteer_1.pdfPuppeteerRouter);
    // Keep old routes for backwards compatibility
    app.use('/pdf', pdf_1.pdfRouter);
    app.use('/reports', pdf_1.pdfRouter);
    app.use('/files', pdf_1.pdfRouter);
    app.use('/templates', templates_1.templatesRouter);
    app.use('/users', users_1.usersRouter);
    app.use('/signatures', signatures_1.signaturesRouter);
    app.use('/school-years', schoolYears_1.schoolYearsRouter);
    app.use('/classes', classes_1.classesRouter);
    app.use('/media', media_1.mediaRouter);
    app.use('/teacher-assignments', teacherAssignments_1.teacherAssignmentsRouter);
    app.use('/template-assignments', templateAssignments_1.templateAssignmentsRouter);
    app.use('/subadmin-assignments', subAdminAssignments_1.subAdminAssignmentsRouter);
    app.use('/teacher', teacherTemplates_1.teacherTemplatesRouter);
    app.use('/subadmin', subAdminTemplates_1.subAdminTemplatesRouter);
    app.use('/aefe', subAdminTemplates_1.subAdminTemplatesRouter);
    app.use('/audit-logs', auditLogs_1.auditLogsRouter);
    app.use('/impersonation', impersonation_1.impersonationRouter);
    app.use('/suggestions', suggestions_1.suggestionsRouter);
    app.use('/settings', settings_1.settingsRouter);
    app.use('/admin-extras', adminExtras_1.adminExtrasRouter);
    app.use('/microsoft', microsoft_1.microsoftRouter);
    app.use('/outlook-users', outlookUsers_1.outlookUsersRouter);
    app.use('/analytics', analytics_1.analyticsRouter);
    app.use('/backup', backup_1.backupRouter);
    app.use('/saved-gradebooks', savedGradebooks_1.savedGradebooksRouter);
    app.use('/simulations', simulations_1.simulationsRouter);
    app.use('/template-propagation', templatePropagation_1.templatePropagationRouter);
    app.use('/error-logs', errorLogs_1.errorLogsRouter);
    app.use('/integrity', integrity_1.integrityRouter);
    app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'public', 'uploads')));
    app.get('/health', (_, res) => res.json({ ok: true }));
    (0, db_1.connectDb)()
        .then(async () => {
        console.log('mongo connected');
        const admin = await User_1.User.findOne({ email: 'admin' });
        if (!admin) {
            const hash = await bcrypt.hash('admin', 10);
            await User_1.User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' });
            console.log('seeded default admin user');
        }
        // Seed levels if they don't exist
        const levelCount = await Level_1.Level.countDocuments();
        if (levelCount === 0) {
            await Level_1.Level.insertMany([
                { name: 'PS', order: 1 },
                { name: 'MS', order: 2 },
                { name: 'GS', order: 3 },
                { name: 'EB1', order: 4, isExitLevel: true },
            ]);
            console.log('seeded default levels (PS, MS, GS, EB1)');
        }
        else {
            // Ensure EB1 exists (for existing databases without it)
            const eb1Exists = await Level_1.Level.findOne({ name: 'EB1' });
            if (!eb1Exists) {
                const maxOrder = await Level_1.Level.findOne().sort({ order: -1 }).lean();
                await Level_1.Level.create({ name: 'EB1', order: (maxOrder?.order || 3) + 1, isExitLevel: true });
                console.log('added missing EB1 level');
            }
            else if (!eb1Exists.isExitLevel) {
                // Ensure EB1 is marked as exit level
                await Level_1.Level.updateOne({ name: 'EB1' }, { isExitLevel: true });
                console.log('marked EB1 as exit level');
            }
        }
    })
        .catch(e => console.error('mongo error', e));
    // Global error handling middleware - must be last
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'internal_server_error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
            });
        }
    });
    return app;
};
exports.createApp = createApp;
