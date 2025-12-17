"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfPuppeteerRouter = void 0;
const express_1 = require("express");
const Student_1 = require("../models/Student");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const SavedGradebook_1 = require("../models/SavedGradebook");
const auth_1 = require("../auth");
const puppeteer_1 = __importDefault(require("puppeteer"));
const archiver_1 = __importDefault(require("archiver"));
exports.pdfPuppeteerRouter = (0, express_1.Router)();
// Singleton browser instance
let browserInstance = null;
const getBrowser = async () => {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }
    console.log('[PDF] Launching new browser instance...');
    browserInstance = await puppeteer_1.default.launch({
        headless: true,
        // @ts-ignore - available at runtime, not in older type defs
        ignoreHTTPSErrors: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--ignore-certificate-errors'
        ]
    });
    browserInstance.on('disconnected', () => {
        console.log('[PDF] Browser disconnected');
        browserInstance = null;
    });
    return browserInstance;
};
const sanitizeFileName = (value) => {
    const cleaned = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || 'file';
};
const getTokenFromReq = (req) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return req.headers.authorization.slice('Bearer '.length);
    }
    if (req.query?.token)
        return String(req.query.token);
    if (req.body?.token)
        return String(req.body.token);
    return '';
};
const resolveFrontendUrl = () => {
    let frontendUrl = process.env.FRONTEND_URL || 'https://localhost:5173';
    try {
        const u = new URL(frontendUrl);
        if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
            u.protocol = 'https:';
            frontendUrl = u.toString().replace(/\/$/, '');
        }
    }
    catch { }
    try {
        const u = new URL(frontendUrl);
        if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
            u.protocol = 'https:';
            frontendUrl = u.toString().replace(/\/$/, '');
        }
    }
    catch { }
    try {
        const u = new URL(frontendUrl);
        if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
            u.protocol = 'https:';
            frontendUrl = u.toString().replace(/\/$/, '');
        }
    }
    catch { }
    return frontendUrl;
};
const generatePdfBufferFromPrintUrl = async (printUrl, token, frontendUrl) => {
    let page = null;
    const browser = await getBrowser();
    page = await browser.newPage();
    try {
        page.on('console', (msg) => {
            console.log('[BROWSER LOG]', msg.text());
        });
        page.on('pageerror', (err) => {
            console.error('[PAGE ERROR]', err);
        });
        page.on('requestfailed', (req) => {
            console.error('[FAILED REQUEST]', req.url(), req.failure());
        });
        await page.setViewport({ width: 800, height: 1120 });
        if (token) {
            let cookieDomain = 'localhost';
            try {
                cookieDomain = new URL(frontendUrl).hostname;
            }
            catch { }
            await page.setCookie({
                name: 'token',
                value: token,
                domain: cookieDomain,
                path: '/'
            });
        }
        await page.goto(printUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForFunction(() => {
            // @ts-ignore
            return window.__READY_FOR_PDF__ === true;
        }, { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        return pdfBuffer;
    }
    finally {
        try {
            await page?.close();
        }
        catch { }
    }
};
// Generate PDF using Puppeteer from HTML render
exports.pdfPuppeteerRouter.get('/student/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    let page = null;
    try {
        const { id } = req.params;
        const { templateId } = req.query;
        if (!templateId) {
            return res.status(400).json({ error: 'templateId required' });
        }
        console.log('[PDF] Starting PDF generation for student:', id, 'template:', templateId);
        const student = await Student_1.Student.findById(id).lean();
        if (!student) {
            console.log('[PDF] Student not found:', id);
            return res.status(404).json({ error: 'student_not_found' });
        }
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template) {
            console.log('[PDF] Template not found:', templateId);
            return res.status(404).json({ error: 'template_not_found' });
        }
        const assignment = await TemplateAssignment_1.TemplateAssignment.findOne({
            studentId: id,
            templateId: templateId
        }).lean();
        if (!assignment) {
            console.log('[PDF] Assignment not found');
            return res.status(404).json({ error: 'assignment_not_found' });
        }
        // Get token for authentication
        let token = '';
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.slice('Bearer '.length);
        }
        else if (req.query.token) {
            token = String(req.query.token);
        }
        console.log('[PDF] Getting browser instance...');
        const browser = await getBrowser();
        console.log('[PDF] Creating page...');
        page = await browser.newPage();
        // Add error logging to see what breaks in headless mode
        page.on('console', (msg) => {
            console.log('[BROWSER LOG]', msg.text());
        });
        page.on('pageerror', (err) => {
            console.error('[PAGE ERROR]', err);
        });
        page.on('requestfailed', (req) => {
            console.error('[FAILED REQUEST]', req.url(), req.failure());
        });
        // Set viewport for consistent rendering
        await page.setViewport({ width: 800, height: 1120 });
        let frontendUrl = process.env.FRONTEND_URL || 'https://localhost:5173';
        try {
            const u = new URL(frontendUrl);
            if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
                u.protocol = 'https:';
                frontendUrl = u.toString().replace(/\/$/, '');
            }
        }
        catch { }
        try {
            const u = new URL(frontendUrl);
            if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
                u.protocol = 'https:';
                frontendUrl = u.toString().replace(/\/$/, '');
            }
        }
        catch { }
        try {
            const u = new URL(frontendUrl);
            if (u.hostname === 'localhost' && u.port === '5173' && u.protocol === 'http:') {
                u.protocol = 'https:';
                frontendUrl = u.toString().replace(/\/$/, '');
            }
        }
        catch { }
        if (token) {
            let cookieDomain = 'localhost';
            try {
                cookieDomain = new URL(frontendUrl).hostname;
            }
            catch { }
            await page.setCookie({
                name: 'token',
                value: token,
                domain: cookieDomain,
                path: '/'
            });
        }
        const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}`;
        console.log('[PDF] Loading page:', printUrl);
        await page.goto(printUrl, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        // Wait for the page to signal it's ready
        console.log('[PDF] Waiting for page to be ready...');
        await page.waitForFunction(() => {
            // @ts-ignore
            return window.__READY_FOR_PDF__ === true;
        }, { timeout: 30000 });
        console.log('[PDF] Page confirmed ready');
        // Give a small delay for any final renders
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[PDF] Generating PDF...');
        // Generate PDF - use A4 format and let multiple pages be created automatically
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            }
        });
        console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
        await page.close();
        page = null;
        // Verify PDF is valid
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        // Send PDF with proper headers to avoid corruption
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="carnet-${student.lastName}-${student.firstName}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
        });
        res.end(pdfBuffer);
        console.log('[PDF] PDF sent successfully');
    }
    catch (error) {
        console.error('[PDF] PDF generation error:', error.message);
        console.error('[PDF] Stack:', error.stack);
        // Clean up page if it's still open
        if (page) {
            try {
                await page.close();
            }
            catch (e) {
                console.error('[PDF] Error closing page:', e);
            }
        }
        res.status(500).json({
            error: 'pdf_generation_failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
exports.pdfPuppeteerRouter.post('/assignments/zip', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    let archive = null;
    try {
        const assignmentIds = Array.isArray(req.body?.assignmentIds) ? req.body.assignmentIds.filter(Boolean) : [];
        const groupLabel = String(req.body?.groupLabel || '').trim();
        if (assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' });
        }
        const token = getTokenFromReq(req);
        const frontendUrl = resolveFrontendUrl();
        try {
            await getBrowser();
        }
        catch (err) {
            console.error('[PDF ZIP] Browser launch failed:', err);
            return res.status(500).json({
                error: 'browser_launch_failed',
                message: err.message
            });
        }
        const archiveFileName = sanitizeFileName(groupLabel ? `carnets-${groupLabel}.zip` : 'carnets.zip');
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${archiveFileName}"`
        });
        archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        let aborted = false;
        res.on('close', () => {
            if (res.writableEnded)
                return;
            aborted = true;
            try {
                archive?.abort();
            }
            catch { }
        });
        archive.on('error', (err) => {
            console.error('[PDF ZIP] Archiver error:', err);
            res.destroy(err);
        });
        archive.on('warning', (err) => {
            console.warn('[PDF ZIP] Archiver warning:', err);
        });
        archive.pipe(res);
        archive.append(`Archive started at ${new Date().toISOString()}\n`, { name: 'info.txt' });
        for (const assignmentId of assignmentIds) {
            if (aborted)
                break;
            try {
                const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
                if (!assignment) {
                    archive.append(`Assignment not found: ${assignmentId}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` });
                    continue;
                }
                const student = await Student_1.Student.findById(assignment.studentId).lean();
                const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
                const studentLast = student?.lastName || 'Eleve';
                const studentFirst = student?.firstName || '';
                const templateName = template?.name || 'Carnet';
                const pdfName = sanitizeFileName(`${studentLast}-${studentFirst}-${templateName}.pdf`);
                const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}`;
                const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl);
                archive.append(pdfBuffer, { name: pdfName });
            }
            catch (e) {
                const errMsg = e?.message ? String(e.message) : 'pdf_generation_failed';
                archive.append(`${errMsg}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` });
            }
        }
        await archive.finalize();
    }
    catch (e) {
        console.error('[PDF ZIP] Failed:', e);
        if (res.headersSent) {
            try {
                archive?.append(`${e?.message || 'zip_generation_failed'}\n`, { name: `errors/fatal.txt` });
                await archive?.finalize();
            }
            catch {
                try {
                    res.end();
                }
                catch { }
            }
            return;
        }
        res.status(500).json({ error: 'zip_generation_failed', message: e.message });
    }
});
exports.pdfPuppeteerRouter.get('/preview/:templateId/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    let page = null;
    try {
        const { templateId, studentId } = req.params;
        let token = '';
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.slice('Bearer '.length);
        }
        else if (req.query.token) {
            token = String(req.query.token);
        }
        const student = await Student_1.Student.findById(studentId).lean();
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        const browser = await getBrowser();
        page = await browser.newPage();
        page.on('console', (msg) => { console.log('[BROWSER LOG]', msg.text()); });
        page.on('pageerror', (err) => { console.error('[PAGE ERROR]', err); });
        page.on('requestfailed', (req) => { console.error('[FAILED REQUEST]', req.url(), req.failure()); });
        await page.setViewport({ width: 800, height: 1120 });
        const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
        const forwardedHost = String(req.headers['x-forwarded-host'] || '');
        const originHeader = String(req.headers['origin'] || '');
        const refererHeader = String(req.headers['referer'] || '');
        let frontendUrl = process.env.FRONTEND_URL || '';
        if (!frontendUrl) {
            if (forwardedProto && forwardedHost) {
                frontendUrl = `${forwardedProto}://${forwardedHost}`;
            }
            else if (originHeader) {
                frontendUrl = originHeader;
            }
            else if (refererHeader) {
                try {
                    frontendUrl = new URL(refererHeader).origin;
                }
                catch { }
            }
        }
        if (!frontendUrl)
            frontendUrl = 'https://localhost:5173';
        if (token) {
            let cookieDomain = 'localhost';
            try {
                cookieDomain = new URL(frontendUrl).hostname;
            }
            catch { }
            await page.setCookie({ name: 'token', value: token, domain: cookieDomain, path: '/' });
        }
        const printUrl = `${frontendUrl}/print/preview/${templateId}/student/${studentId}?token=${token}`;
        await page.goto(printUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForFunction(() => {
            // @ts-ignore
            return window.__READY_FOR_PDF__ === true;
        }, { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });
        await page.close();
        page = null;
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="carnet-${student.lastName}-${student.firstName}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
        });
        res.end(pdfBuffer);
    }
    catch (error) {
        console.error('[PDF] Preview PDF generation error:', error.message);
        console.error('[PDF] Preview stack:', error.stack);
        if (page) {
            try {
                await page.close();
            }
            catch { }
        }
        res.status(500).json({
            error: 'pdf_generation_failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// Generate PDF for Saved Gradebook
exports.pdfPuppeteerRouter.get('/saved/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    let page = null;
    try {
        const { id } = req.params;
        console.log('[PDF] Starting PDF generation for saved gradebook:', id);
        const saved = await SavedGradebook_1.SavedGradebook.findById(id).lean();
        if (!saved) {
            console.log('[PDF] Saved gradebook not found:', id);
            return res.status(404).json({ error: 'saved_gradebook_not_found' });
        }
        // Get token for authentication
        let token = '';
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.slice('Bearer '.length);
        }
        else if (req.query.token) {
            token = String(req.query.token);
        }
        console.log('[PDF] Getting browser instance...');
        const browser = await getBrowser();
        console.log('[PDF] Creating page...');
        page = await browser.newPage();
        // Add error logging
        page.on('console', (msg) => {
            console.log('[BROWSER LOG]', msg.text());
        });
        page.on('pageerror', (err) => {
            console.error('[PAGE ERROR]', err);
        });
        page.on('requestfailed', (req) => {
            console.error('[FAILED REQUEST]', req.url(), req.failure());
        });
        await page.setViewport({ width: 800, height: 1120 });
        const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
        const forwardedHost = String(req.headers['x-forwarded-host'] || '');
        const originHeader = String(req.headers['origin'] || '');
        const refererHeader = String(req.headers['referer'] || '');
        let frontendUrl = process.env.FRONTEND_URL || '';
        if (!frontendUrl) {
            if (forwardedProto && forwardedHost) {
                frontendUrl = `${forwardedProto}://${forwardedHost}`;
            }
            else if (originHeader) {
                frontendUrl = originHeader;
            }
            else if (refererHeader) {
                try {
                    frontendUrl = new URL(refererHeader).origin;
                }
                catch { }
            }
        }
        if (!frontendUrl)
            frontendUrl = 'https://localhost:5173';
        if (token) {
            let cookieDomain = 'localhost';
            try {
                cookieDomain = new URL(frontendUrl).hostname;
            }
            catch { }
            await page.setCookie({
                name: 'token',
                value: token,
                domain: cookieDomain,
                path: '/'
            });
        }
        const printUrl = `${frontendUrl}/print/saved/${saved._id}?token=${token}`;
        console.log('[PDF] Loading page:', printUrl);
        await page.goto(printUrl, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        console.log('[PDF] Waiting for page to be ready...');
        await page.waitForFunction(() => {
            // @ts-ignore
            return window.__READY_FOR_PDF__ === true;
        }, { timeout: 30000 });
        console.log('[PDF] Page confirmed ready');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[PDF] Generating PDF...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            }
        });
        console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
        await page.close();
        page = null;
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        // Use student name from saved data if available, otherwise generic name
        const studentName = saved.data?.student ? `${saved.data.student.lastName}-${saved.data.student.firstName}` : 'carnet';
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="carnet-${studentName}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
        });
        res.end(pdfBuffer);
        console.log('[PDF] PDF sent successfully');
    }
    catch (error) {
        console.error('[PDF] PDF generation error:', error.message);
        console.error('[PDF] Stack:', error.stack);
        if (page) {
            try {
                await page.close();
            }
            catch (e) {
                console.error('[PDF] Error closing page:', e);
            }
        }
        res.status(500).json({
            error: 'pdf_generation_failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
