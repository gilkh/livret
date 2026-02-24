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
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const auth_1 = require("../auth");
const puppeteer_1 = __importDefault(require("puppeteer"));
const archiver_1 = __importDefault(require("archiver"));
const fs_1 = __importDefault(require("fs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
exports.pdfPuppeteerRouter = (0, express_1.Router)();
const sanitizeFilename = (name) => {
    const base = String(name || 'file')
        .replace(/[\r\n]/g, ' ')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]+/g, '')
        .replace(/["\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return base || 'file';
};
const buildContentDisposition = (filename) => {
    const safe = sanitizeFilename(filename);
    const encoded = encodeURIComponent(String(filename || 'file')).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
};
const normalizeYearForFilename = (yearName) => String(yearName || '').replace(/[\/\\]/g, '-').trim();
const buildStudentPdfFilename = (opts) => {
    const level = String(opts.level || '').toUpperCase().trim();
    const firstName = String(opts.firstName || '').trim();
    const lastName = String(opts.lastName || '').trim();
    const yearSafe = normalizeYearForFilename(opts.yearName);
    const parts = [level, firstName, lastName, yearSafe].filter(Boolean);
    const base = parts.join('-') || 'file';
    return sanitizeFileName(`${base}.pdf`);
};
const getActiveSchoolYear = async () => {
    try {
        return await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
    }
    catch {
        return null;
    }
};
const resolveStudentLevel = async (studentId, fallbackLevel, schoolYearId) => {
    if (fallbackLevel)
        return fallbackLevel;
    if (!studentId)
        return '';
    const enrollment = schoolYearId
        ? await Enrollment_1.Enrollment.findOne({ studentId, schoolYearId, status: 'active' }).lean()
        : await Enrollment_1.Enrollment.findOne({ studentId, status: 'active' }).lean();
    if (!enrollment?.classId)
        return '';
    const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
    return String(classDoc?.level || '').trim();
};
// Singleton browser instance
let browserInstance = null;
const getBrowser = async () => {
    console.log('[PDF DEBUG] getBrowser called');
    if (browserInstance && browserInstance.isConnected()) {
        console.log('[PDF DEBUG] Reusing existing browser instance');
        return browserInstance;
    }
    console.log('[PDF] Launching new browser instance...');
    try {
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
        console.log('[PDF DEBUG] New browser instance launched successfully');
    }
    catch (e) {
        console.error('[PDF DEBUG] Failed to launch browser:', e);
        throw e;
    }
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
const sanitizeArchiveFolder = (value) => {
    return String(value || '')
        .replace(/\\+/g, '/')
        .split('/')
        .map((segment) => sanitizeFileName(segment))
        .filter(Boolean)
        .join('/');
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
const zipProgressStore = new Map();
const ZIP_PROGRESS_TTL_MS = Math.max(60000, Number(process.env.PDF_ZIP_PROGRESS_TTL_MS || '1800000'));
const scheduleZipProgressCleanup = (token) => {
    setTimeout(() => {
        zipProgressStore.delete(token);
    }, ZIP_PROGRESS_TTL_MS);
};
const initZipProgress = (token, totalAssignments) => {
    const now = Date.now();
    zipProgressStore.set(token, {
        token,
        status: 'running',
        totalAssignments,
        completedAssignments: 0,
        failedAssignments: 0,
        startedAt: now,
        updatedAt: now,
        etaSeconds: null
    });
};
const updateZipProgress = (token, patch) => {
    const current = zipProgressStore.get(token);
    if (!current)
        return;
    const partial = typeof patch === 'function' ? patch(current) : patch;
    zipProgressStore.set(token, {
        ...current,
        ...partial,
        updatedAt: Date.now()
    });
};
const recomputeZipProgressEta = (state) => {
    const processed = state.completedAssignments + state.failedAssignments;
    if (processed <= 0 || state.totalAssignments <= processed)
        return null;
    const elapsedMs = Math.max(1, Date.now() - state.startedAt);
    const avgMsPerAssignment = elapsedMs / processed;
    const remainingAssignments = state.totalAssignments - processed;
    return Math.ceil((avgMsPerAssignment * remainingAssignments) / 1000);
};
const resolveFrontendUrl = (req) => {
    // DEBUG: Log all available sources for frontend URL resolution
    const explicitRaw = String(req?.query?.frontendOrigin || req?.query?.frontendUrl || req?.headers?.['x-frontend-origin'] || '').trim();
    const envUrlRaw = String(process.env.FRONTEND_URL || '').trim();
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim();
    const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
    const hostHeader = String(req?.headers?.host || '').trim();
    const originHeader = String(req?.headers?.origin || '').trim();
    const refererHeader = String(req?.headers?.referer || '').trim();
    console.log('[PDF URL DEBUG] Resolving frontend URL from sources:', {
        explicitRaw: explicitRaw || '(empty)',
        envUrlRaw: envUrlRaw || '(empty)',
        forwardedProto: forwardedProto || '(empty)',
        forwardedHost: forwardedHost || '(empty)',
        hostHeader: hostHeader || '(empty)',
        originHeader: originHeader || '(empty)',
        refererHeader: refererHeader || '(empty)'
    });
    if (explicitRaw) {
        try {
            const result = new URL(explicitRaw).origin;
            console.log('[PDF URL DEBUG] Using explicit query/header origin:', result);
            return result;
        }
        catch { }
    }
    let fromReq = '';
    if (forwardedProto && forwardedHost) {
        fromReq = `${forwardedProto}://${forwardedHost}`;
        console.log('[PDF URL DEBUG] Built fromReq from forwarded headers:', fromReq);
    }
    else if (refererHeader) {
        try {
            fromReq = new URL(refererHeader).origin;
            console.log('[PDF URL DEBUG] Built fromReq from referer:', fromReq);
        }
        catch { }
    }
    else if (originHeader) {
        fromReq = originHeader;
        console.log('[PDF URL DEBUG] Built fromReq from origin header:', fromReq);
    }
    else if (hostHeader) {
        const proto = forwardedProto || 'http';
        fromReq = `${proto}://${hostHeader}`;
        console.log('[PDF URL DEBUG] Built fromReq from host header:', fromReq);
    }
    const isLocalhostLike = (urlString) => {
        try {
            const h = new URL(urlString).hostname;
            return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
        }
        catch {
            return false;
        }
    };
    if (envUrlRaw) {
        if (isLocalhostLike(envUrlRaw) && fromReq && !isLocalhostLike(fromReq)) {
            console.log('[PDF URL DEBUG] FRONTEND_URL is localhost but request is from non-localhost, using fromReq:', fromReq);
            return fromReq;
        }
        const resolved = envUrlRaw.replace('//localhost', '//127.0.0.1');
        console.log('[PDF URL DEBUG] Using FRONTEND_URL env var (normalized):', resolved);
        return resolved;
    }
    if (fromReq) {
        const resolved = fromReq.replace('//localhost', '//127.0.0.1');
        console.log('[PDF URL DEBUG] Using fromReq (normalized):', resolved);
        return resolved;
    }
    console.log('[PDF URL DEBUG] FALLBACK to default: https://127.0.0.1:443');
    return 'https://127.0.0.1:443';
};
const generatePdfBufferFromPrintUrl = async (printUrl, token, frontendUrl, options = {}) => {
    const mode = options.mode || 'single';
    const verboseLogs = typeof options.verboseLogs === 'boolean'
        ? options.verboseLogs
        : (mode !== 'batch' || process.env.PDF_BATCH_VERBOSE_LOGS === 'true');
    const pdfPageWidthPxRaw = Number(process.env.PDF_PAGE_WIDTH_PX || '800');
    const pdfPageHeightPxRaw = Number(process.env.PDF_PAGE_HEIGHT_PX || '1120');
    const pdfPageWidthPx = Number.isFinite(pdfPageWidthPxRaw) && pdfPageWidthPxRaw > 0 ? Math.round(pdfPageWidthPxRaw) : 800;
    const pdfPageHeightPx = Number.isFinite(pdfPageHeightPxRaw) && pdfPageHeightPxRaw > 0 ? Math.round(pdfPageHeightPxRaw) : 1120;
    // Device scale factor controls DPI: 1.35 = ~130 DPI (sharp for screen/print, optimized for size)
    // Lower = smaller files, Higher = sharper but larger files
    const batchDefaultScale = process.env.PDF_BATCH_DEVICE_SCALE_FACTOR || '1.15';
    const pdfDeviceScaleFactorRaw = Number(options.deviceScaleFactor ?? process.env.PDF_DEVICE_SCALE_FACTOR ?? process.env.PDF_DPI_SCALE ?? (mode === 'batch' ? batchDefaultScale : '1.35'));
    const pdfDeviceScaleFactor = Number.isFinite(pdfDeviceScaleFactorRaw) && pdfDeviceScaleFactorRaw > 0 ? Math.min(3, Math.max(1, pdfDeviceScaleFactorRaw)) : 1.35;
    // Use native page.pdf() instead of screenshot-based approach
    // Default to screenshot (false) since native PDF can add white borders around content
    const useNativePdf = typeof options.useNativePdf === 'boolean'
        ? options.useNativePdf
        : (mode === 'batch' ? process.env.PDF_BATCH_USE_NATIVE !== 'false' : process.env.PDF_USE_NATIVE === 'true');
    const readyTimeoutMsRaw = Number(options.readyTimeoutMs ?? process.env.PDF_READY_TIMEOUT_MS ?? (mode === 'batch' ? '1500' : '10000'));
    const readyTimeoutMs = Number.isFinite(readyTimeoutMsRaw) && readyTimeoutMsRaw >= 0 ? Math.round(readyTimeoutMsRaw) : (mode === 'batch' ? 1500 : 10000);
    const prePdfDelayMsRaw = Number(options.prePdfDelayMs ?? process.env.PDF_PRE_DELAY_MS ?? (mode === 'batch' ? '50' : '250'));
    const prePdfDelayMs = Number.isFinite(prePdfDelayMsRaw) && prePdfDelayMsRaw >= 0 ? Math.round(prePdfDelayMsRaw) : (mode === 'batch' ? 50 : 250);
    const navigationTimeoutMsRaw = Number(options.navigationTimeoutMs ?? process.env.PDF_NAVIGATION_TIMEOUT_MS ?? (mode === 'batch' ? '20000' : '30000'));
    const navigationTimeoutMs = Number.isFinite(navigationTimeoutMsRaw) && navigationTimeoutMsRaw > 0 ? Math.round(navigationTimeoutMsRaw) : (mode === 'batch' ? 20000 : 30000);
    // SAFETY: Force 127.0.0.1 if localhost leaked through (e.g. stale code or resolve bypass)
    if (printUrl.includes('//localhost')) {
        printUrl = printUrl.replace('//localhost', '//127.0.0.1');
        if (verboseLogs)
            console.log('[PDF DEBUG] Rewrote printUrl localhost to 127.0.0.1');
    }
    // SAFETY: Fix port 5173 to 443 (user's Vite runs on 443)
    if (printUrl.includes(':5173')) {
        printUrl = printUrl.replace(':5173', ':443');
        if (verboseLogs)
            console.log('[PDF DEBUG] Rewrote printUrl port 5173 to 443');
    }
    if (frontendUrl.includes('//localhost')) {
        frontendUrl = frontendUrl.replace('//localhost', '//127.0.0.1');
    }
    if (frontendUrl.includes(':5173')) {
        frontendUrl = frontendUrl.replace(':5173', ':443');
    }
    let page = null;
    const tStart = Date.now();
    const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
    const browser = await getBrowser();
    const reusePage = options.reusePage || null;
    page = reusePage || await browser.newPage();
    const shouldClosePage = !reusePage || !options.keepPageOpen;
    if (verboseLogs) {
        console.log(`[PDF TIMING] Starting PDF generation for ${safePrintUrl} (native=${useNativePdf})`);
    }
    try {
        if (verboseLogs && !page.__pdfListenersAttached) {
            page.on('console', (msg) => {
                console.log('[BROWSER LOG]', msg.text());
            });
            page.on('pageerror', (err) => {
                console.error('[PAGE ERROR]', err);
            });
            page.on('requestfailed', (req) => {
                console.error('[FAILED REQUEST]', req.url(), req.failure());
            });
            page.__pdfListenersAttached = true;
        }
        await page.setViewport({ width: pdfPageWidthPx, height: pdfPageHeightPx, deviceScaleFactor: pdfDeviceScaleFactor });
        if (verboseLogs && !reusePage)
            console.log(`[PDF TIMING] newPage created in ${Date.now() - tStart}ms`);
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
        // Try to navigate until DOM content loaded only (faster and avoids long-polling third-party scripts)
        let navStart = Date.now();
        let navMs = 0;
        let response = null;
        if (verboseLogs) {
            console.log(`[PDF DEBUG] Attempting to navigate to: ${safePrintUrl}`);
            console.log(`[PDF DEBUG] Frontend URL being used: ${frontendUrl}`);
        }
        try {
            response = await page.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
            navMs = Date.now() - navStart;
            if (verboseLogs)
                console.log(`[PDF TIMING] page.goto completed in ${navMs}ms for ${safePrintUrl}`);
        }
        catch (navError) {
            navMs = Date.now() - navStart;
            console.error(`[PDF ERROR] Navigation failed after ${navMs}ms for ${safePrintUrl}`);
            console.error(`[PDF ERROR] Error type: ${navError?.name || 'Unknown'}`);
            console.error(`[PDF ERROR] Error message: ${navError?.message || 'No message'}`);
            // Provide helpful diagnostic info for common errors
            if (navError?.message?.includes('ERR_CONNECTION_REFUSED')) {
                console.error('[PDF ERROR] *** CONNECTION REFUSED ***');
                console.error(`[PDF ERROR] The browser could not connect to: ${printUrl}`);
                console.error('[PDF ERROR] Possible causes:');
                console.error('[PDF ERROR]   1. Frontend dev server is not running (run "npm run dev" in client folder)');
                console.error('[PDF ERROR]   2. Frontend is running on a different port');
                console.error('[PDF ERROR]   3. FRONTEND_URL env variable is not set correctly for production');
                console.error(`[PDF ERROR] Current FRONTEND_URL env: ${process.env.FRONTEND_URL || '(not set)'}`);
            }
            else if (navError?.message?.includes('ERR_CERT')) {
                console.error('[PDF ERROR] *** SSL CERTIFICATE ERROR ***');
                console.error('[PDF ERROR] Puppeteer cannot verify the SSL certificate');
                console.error('[PDF ERROR] For local HTTPS dev, ensure ignoreHTTPSErrors is enabled');
            }
            else if (navError?.message?.includes('TIMEOUT') || navError?.message?.includes('timeout')) {
                console.error('[PDF ERROR] *** NAVIGATION TIMEOUT ***');
                console.error('[PDF ERROR] The page took too long to load');
            }
            throw new Error(`${navError?.message || 'Navigation failed'} at ${safePrintUrl}`);
        }
        if (!response) {
            const currentUrl = String(page.url() || '');
            throw new Error(`Failed to load print page (no response). currentUrl=${currentUrl}`);
        }
        const status = response.status();
        if (status >= 400) {
            throw new Error(`Failed to load print page (HTTP ${status})`);
        }
        try {
            await page.emulateMediaType('print');
        }
        catch { }
        // Wait for explicit ready signal from client
        let readyStart = Date.now();
        let readyMs = 0;
        try {
            await page.waitForFunction(() => {
                // @ts-ignore
                return window.__READY_FOR_PDF__ === true || document.querySelectorAll('.page-canvas').length > 0;
            }, { timeout: readyTimeoutMs });
            readyMs = Date.now() - readyStart;
            if (verboseLogs)
                console.log(`[PDF TIMING] waitForFunction resolved in ${readyMs}ms for ${safePrintUrl}`);
        }
        catch (e) {
            readyMs = Date.now() - readyStart;
            if (verboseLogs)
                console.warn(`[PDF TIMING] Timeout waiting for READY_FOR_PDF after ${readyMs}ms for ${safePrintUrl}, proceeding...`);
        }
        // Keep a short safety delay
        const delayStart = Date.now();
        if (prePdfDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, prePdfDelayMs));
        }
        if (verboseLogs)
            console.log(`[PDF TIMING] pre-pdf delay ${Date.now() - delayStart}ms for ${safePrintUrl}`);
        // Get page dimensions from .page-canvas elements
        let resolvedPdfPageWidthPx = pdfPageWidthPx;
        let resolvedPdfPageHeightPx = pdfPageHeightPx;
        let pageCount = 1;
        try {
            const pageInfo = await page.evaluate(() => {
                const pages = document.querySelectorAll('.page-canvas');
                if (!pages.length)
                    return null;
                const first = pages[0];
                const r = first.getBoundingClientRect();
                const width = Math.round(r.width);
                const height = Math.round(r.height);
                if (!width || !height)
                    return null;
                return { width, height, count: pages.length };
            });
            if (pageInfo?.width && pageInfo?.height) {
                resolvedPdfPageWidthPx = pageInfo.width;
                resolvedPdfPageHeightPx = pageInfo.height;
                pageCount = pageInfo.count || 1;
            }
        }
        catch { }
        if (verboseLogs)
            console.log(`[PDF DEBUG] Found ${pageCount} pages, size ${resolvedPdfPageWidthPx}x${resolvedPdfPageHeightPx}px @ scale ${pdfDeviceScaleFactor} for ${safePrintUrl}`);
        const tPdfStart = Date.now();
        let pdfBuffer;
        if (useNativePdf) {
            // ========== NATIVE PDF APPROACH ==========
            // Uses page.pdf() directly - text stays as vectors, only images are rasterized
            // NOTE: This may add white borders if CSS @page rules don't match exactly
            // Convert pixel dimensions to points (72 points = 1 inch, assuming 96 DPI screen)
            const pageWidthInches = resolvedPdfPageWidthPx / 96;
            const pageHeightInches = resolvedPdfPageHeightPx / 96;
            if (verboseLogs)
                console.log(`[PDF DEBUG] Using NATIVE page.pdf() - ${pageWidthInches.toFixed(2)}in x ${pageHeightInches.toFixed(2)}in per page`);
            pdfBuffer = await page.pdf({
                width: `${pageWidthInches}in`,
                height: `${pageHeightInches}in`, // Single page height - CSS page-break-after handles pagination
                printBackground: true,
                preferCSSPageSize: true, // Prefer CSS @page rules if defined
                scale: 1, // Full scale - CSS handles sizing
                margin: { top: 0, right: 0, bottom: 0, left: 0 }
            });
        }
        else {
            // ========== SCREENSHOT-BASED APPROACH (DEFAULT) ==========
            // Rasterizes everything - guaranteed visual fidelity matching the screen exactly
            // Optimized: JPEG compression, 150 DPI (1.5 scale), PDF compression
            const pageCanvases = await page.$$('.page-canvas');
            if (!pageCanvases.length) {
                throw new Error('No .page-canvas elements found on print page');
            }
            // PDF quality settings - optimized for size while maintaining good quality
            // 72% JPEG quality: imperceptible quality loss on gradebooks, ~20% smaller than 80%
            const pdfImageQuality = Number(mode === 'batch' ? (process.env.PDF_BATCH_IMAGE_QUALITY || process.env.PDF_IMAGE_QUALITY || '60') : (process.env.PDF_IMAGE_QUALITY || '72'));
            const pdfUseJpeg = process.env.PDF_USE_JPEG !== 'false';
            if (verboseLogs)
                console.log(`[PDF DEBUG] Using SCREENSHOT approach - quality=${pdfImageQuality}, jpeg=${pdfUseJpeg}, pages=${pageCanvases.length}`);
            pdfBuffer = await new Promise(async (resolve, reject) => {
                try {
                    const chunks = [];
                    const doc = new pdfkit_1.default({ autoFirstPage: false, margin: 0, compress: true });
                    doc.on('data', (c) => chunks.push(Buffer.from(c)));
                    doc.on('end', () => resolve(Buffer.concat(chunks)));
                    doc.on('error', reject);
                    for (const handle of pageCanvases) {
                        try {
                            await handle.evaluate((el) => el?.scrollIntoView?.({ block: 'start' }));
                        }
                        catch { }
                        const imageBuffer = pdfUseJpeg
                            ? (await handle.screenshot({ type: 'jpeg', quality: pdfImageQuality, omitBackground: false }))
                            : (await handle.screenshot({ type: 'png', omitBackground: true }));
                        doc.addPage({ size: [resolvedPdfPageWidthPx, resolvedPdfPageHeightPx], margin: 0 });
                        doc.image(imageBuffer, 0, 0, { width: resolvedPdfPageWidthPx, height: resolvedPdfPageHeightPx });
                    }
                    doc.end();
                }
                catch (e) {
                    reject(e);
                }
            });
        }
        const pdfMs = Date.now() - tPdfStart;
        if (verboseLogs)
            console.log(`[PDF TIMING] pdf render took ${pdfMs}ms, size: ${pdfBuffer?.length || 0}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}, native: ${useNativePdf} for ${safePrintUrl}`);
        const totalMs = Date.now() - tStart;
        if (verboseLogs)
            console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${totalMs}ms (nav ${navMs}ms, ready ${readyMs}ms, pdf ${pdfMs}ms) for ${safePrintUrl}`);
        try {
            if (process.env.PDF_TIMING_LOG === 'true') {
                fs_1.default.appendFileSync('pdf-timings.log', `${new Date().toISOString()} ${safePrintUrl} totalMs=${totalMs} navMs=${navMs} readyMs=${readyMs} pdfMs=${pdfMs} size=${pdfBuffer?.length || 0} native=${useNativePdf}\n`);
            }
        }
        catch {
        }
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        return pdfBuffer;
    }
    finally {
        try {
            if (shouldClosePage)
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
        const frontendUrl = resolveFrontendUrl(req);
        const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}`;
        const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
        console.log('[PDF] Generating PDF via shared function:', safePrintUrl);
        const genStart = Date.now();
        const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl);
        console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`);
        console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
        // Verify PDF is valid
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        const activeYear = await getActiveSchoolYear();
        const activeYearId = activeYear?._id ? String(activeYear._id) : String(student.schoolYearId || '');
        let yearName = String(activeYear?.name || '').trim();
        if (!yearName && student.schoolYearId) {
            const sy = await SchoolYear_1.SchoolYear.findById(student.schoolYearId).lean();
            yearName = String(sy?.name || '').trim();
        }
        const level = await resolveStudentLevel(String(student._id), String(student.level || ''), activeYearId);
        const filename = buildStudentPdfFilename({
            level,
            firstName: student.firstName,
            lastName: student.lastName,
            yearName
        });
        // Send PDF with proper headers to avoid corruption
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': buildContentDisposition(filename),
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
    // Increase timeout for large batches
    req.setTimeout(3600000); // 1 hour
    let archive = null;
    try {
        const assignmentIds = Array.isArray(req.body?.assignmentIds) ? req.body.assignmentIds.filter(Boolean) : [];
        const groupLabel = String(req.body?.groupLabel || '').trim();
        const hideSignatures = req.body?.hideSignatures === true;
        const progressToken = String(req.body?.progressToken || '').trim();
        const rawAssignmentFolderMap = req.body?.assignmentFolderMap && typeof req.body.assignmentFolderMap === 'object'
            ? req.body.assignmentFolderMap
            : {};
        const assignmentFolderMap = Object.entries(rawAssignmentFolderMap)
            .reduce((acc, [assignmentId, folder]) => {
            if (typeof assignmentId !== 'string')
                return acc;
            const sanitizedFolder = sanitizeArchiveFolder(String(folder || ''));
            if (!sanitizedFolder)
                return acc;
            acc[assignmentId] = sanitizedFolder;
            return acc;
        }, {});
        if (assignmentIds.length === 0) {
            return res.status(400).json({ error: 'missing_assignment_ids' });
        }
        if (progressToken) {
            initZipProgress(progressToken, assignmentIds.length);
        }
        const token = getTokenFromReq(req);
        const frontendUrl = resolveFrontendUrl(req);
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
            'Content-Disposition': buildContentDisposition(String(archiveFileName || 'archive.zip'))
        });
        const zipCompressionLevelRaw = Number(process.env.PDF_ZIP_COMPRESSION_LEVEL || '0');
        const zipCompressionLevel = Number.isFinite(zipCompressionLevelRaw)
            ? Math.min(9, Math.max(0, Math.round(zipCompressionLevelRaw)))
            : 1;
        archive = (0, archiver_1.default)('zip', { zlib: { level: zipCompressionLevel } });
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
        const zipStart = Date.now();
        console.log(`[PDF ZIP] Starting zip generation for ${assignmentIds.length} assignments, group="${groupLabel}"`);
        archive.append(`Archive started at ${new Date().toISOString()}\n`, { name: 'info.txt' });
        // Parallelize generation with a worker pool to reduce wall-clock
        const concurrency = Math.min(Math.max(1, Number(process.env.PDF_CONCURRENCY || '8')), assignmentIds.length);
        console.log(`[PDF ZIP] Generating ${assignmentIds.length} PDFs using concurrency=${concurrency}`);
        const activeYear = await getActiveSchoolYear();
        const activeYearId = activeYear?._id ? String(activeYear._id) : '';
        const activeYearName = String(activeYear?.name || '').trim();
        const assignmentDocs = await TemplateAssignment_1.TemplateAssignment.find({ _id: { $in: assignmentIds } }, '_id studentId templateId').lean();
        const assignmentById = new Map(assignmentDocs.map((assignment) => [String(assignment._id), assignment]));
        const orderedAssignments = assignmentIds
            .map((assignmentId) => ({ assignmentId: String(assignmentId), assignment: assignmentById.get(String(assignmentId)) }));
        const foundAssignments = orderedAssignments.filter((entry) => !!entry.assignment);
        const studentIds = Array.from(new Set(foundAssignments.map((entry) => String(entry.assignment.studentId || '')).filter(Boolean)));
        const students = studentIds.length
            ? await Student_1.Student.find({ _id: { $in: studentIds } }, '_id firstName lastName level schoolYearId').lean()
            : [];
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        const needsFallbackYear = !activeYearName;
        const studentYearIds = needsFallbackYear
            ? Array.from(new Set(students.map((student) => String(student.schoolYearId || '')).filter(Boolean)))
            : [];
        const schoolYears = studentYearIds.length
            ? await SchoolYear_1.SchoolYear.find({ _id: { $in: studentYearIds } }, '_id name').lean()
            : [];
        const schoolYearNameById = new Map(schoolYears.map((schoolYear) => [String(schoolYear._id), String(schoolYear.name || '').trim()]));
        const studentIdsNeedingLevel = students
            .filter((student) => !String(student.level || '').trim())
            .map((student) => String(student._id));
        const enrollments = studentIdsNeedingLevel.length
            ? await Enrollment_1.Enrollment.find(activeYearId
                ? { studentId: { $in: studentIdsNeedingLevel }, schoolYearId: activeYearId, status: 'active' }
                : { studentId: { $in: studentIdsNeedingLevel }, status: 'active' }, '_id studentId classId').lean()
            : [];
        const enrollmentByStudentId = new Map();
        for (const enrollment of enrollments) {
            const studentId = String(enrollment.studentId || '');
            if (!studentId || enrollmentByStudentId.has(studentId))
                continue;
            enrollmentByStudentId.set(studentId, enrollment);
        }
        const classIds = Array.from(new Set(enrollments.map((enrollment) => String(enrollment.classId || '')).filter(Boolean)));
        const classes = classIds.length ? await Class_1.ClassModel.find({ _id: { $in: classIds } }, '_id level').lean() : [];
        const classById = new Map(classes.map((classDoc) => [String(classDoc._id), classDoc]));
        const studentResolvedLevelById = new Map();
        for (const student of students) {
            const studentId = String(student._id);
            let resolvedLevel = String(student.level || '').trim();
            if (!resolvedLevel) {
                const enrollment = enrollmentByStudentId.get(studentId);
                const classDoc = enrollment?.classId ? classById.get(String(enrollment.classId)) : null;
                resolvedLevel = String(classDoc?.level || '').trim();
            }
            studentResolvedLevelById.set(studentId, resolvedLevel);
        }
        let idx = 0;
        const getNext = () => {
            const i = idx;
            idx += 1;
            return orderedAssignments[i];
        };
        const workers = Array.from({ length: concurrency }).map((_, workerIdx) => (async () => {
            const workerBrowser = await getBrowser();
            const workerPage = await workerBrowser.newPage();
            while (true) {
                if (aborted)
                    break;
                const nextEntry = getNext();
                if (!nextEntry)
                    break;
                const assignmentId = String(nextEntry.assignmentId);
                try {
                    const assignment = nextEntry.assignment;
                    if (!assignment) {
                        if (archive)
                            archive.append(`Assignment not found: ${assignmentId}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` });
                        if (progressToken) {
                            updateZipProgress(progressToken, (current) => {
                                const next = {
                                    ...current,
                                    failedAssignments: current.failedAssignments + 1,
                                    updatedAt: Date.now(),
                                    etaSeconds: current.etaSeconds
                                };
                                return { failedAssignments: next.failedAssignments, etaSeconds: recomputeZipProgressEta(next) };
                            });
                        }
                        continue;
                    }
                    const student = studentById.get(String(assignment.studentId || ''));
                    const studentLast = student?.lastName || 'Eleve';
                    const studentFirst = student?.firstName || '';
                    const yearName = activeYearName || schoolYearNameById.get(String(student?.schoolYearId || '')) || '';
                    const level = studentResolvedLevelById.get(String(student?._id || '')) || '';
                    const pdfName = buildStudentPdfFilename({
                        level,
                        firstName: studentFirst,
                        lastName: studentLast,
                        yearName
                    });
                    const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}${hideSignatures ? '&hideSignatures=true' : ''}`;
                    const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
                    if (process.env.PDF_BATCH_VERBOSE_LOGS === 'true') {
                        console.log(`[PDF ZIP] (worker ${workerIdx}) Generating PDF for assignment ${assignmentId} (${safePrintUrl})`);
                    }
                    const assignStart = Date.now();
                    const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl, {
                        mode: 'batch',
                        reusePage: workerPage,
                        keepPageOpen: true,
                        verboseLogs: process.env.PDF_BATCH_VERBOSE_LOGS === 'true'
                    });
                    const assignMs = Date.now() - assignStart;
                    if (process.env.PDF_BATCH_VERBOSE_LOGS === 'true') {
                        console.log(`[PDF ZIP] (worker ${workerIdx}) PDF for ${assignmentId} generated in ${assignMs}ms, size=${pdfBuffer?.length || 0}`);
                    }
                    try {
                        if (process.env.PDF_TIMING_LOG === 'true') {
                            fs_1.default.appendFileSync('pdf-timings.log', `${new Date().toISOString()} assignment=${assignmentId} worker=${workerIdx} totalMs=${assignMs} size=${pdfBuffer?.length || 0} name=${pdfName}\n`);
                        }
                    }
                    catch {
                    }
                    // Append to archive
                    const folderName = assignmentFolderMap[assignmentId];
                    const archiveName = folderName ? `${folderName}/${pdfName}` : pdfName;
                    if (archive)
                        archive.append(pdfBuffer, { name: archiveName });
                    if (progressToken) {
                        updateZipProgress(progressToken, (current) => {
                            const next = {
                                ...current,
                                completedAssignments: current.completedAssignments + 1,
                                updatedAt: Date.now(),
                                etaSeconds: current.etaSeconds
                            };
                            return { completedAssignments: next.completedAssignments, etaSeconds: recomputeZipProgressEta(next) };
                        });
                    }
                }
                catch (e) {
                    const errMsg = e?.message ? String(e.message) : 'pdf_generation_failed';
                    if (archive)
                        archive.append(`${errMsg}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` });
                    if (progressToken) {
                        updateZipProgress(progressToken, (current) => {
                            const next = {
                                ...current,
                                failedAssignments: current.failedAssignments + 1,
                                updatedAt: Date.now(),
                                etaSeconds: current.etaSeconds
                            };
                            return { failedAssignments: next.failedAssignments, etaSeconds: recomputeZipProgressEta(next) };
                        });
                    }
                }
            }
            try {
                await workerPage.close();
            }
            catch { }
        })());
        await Promise.all(workers);
        // finalize archive after all workers finish
        console.log('[PDF ZIP] All workers completed, finalizing archive');
        await archive.finalize();
        if (progressToken) {
            updateZipProgress(progressToken, {
                status: 'completed',
                etaSeconds: 0
            });
            scheduleZipProgressCleanup(progressToken);
        }
    }
    catch (e) {
        console.error('[PDF ZIP] Failed:', e);
        if (String(req.body?.progressToken || '').trim()) {
            const progressToken = String(req.body?.progressToken || '').trim();
            updateZipProgress(progressToken, {
                status: 'failed',
                etaSeconds: null,
                error: e?.message ? String(e.message) : 'zip_generation_failed'
            });
            scheduleZipProgressCleanup(progressToken);
        }
        if (res.headersSent) {
            try {
                // If archive is not yet finalized, try to append error and finalize
                // @ts-ignore
                if (archive && archive._state.status !== 'finalized' && archive._state.status !== 'finalizing') {
                    archive.append(`${e?.message || 'zip_generation_failed'}\n`, { name: `errors/fatal.txt` });
                    await archive.finalize();
                }
                else {
                    console.warn('[PDF ZIP] Archive already finalizing or finalized, forcing response end.');
                    try {
                        res.end();
                    }
                    catch { }
                }
            }
            catch (err) {
                console.error('[PDF ZIP] Error finalizing archive in catch block:', err);
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
exports.pdfPuppeteerRouter.get('/assignments/zip-progress/:token', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const token = String(req.params?.token || '').trim();
    if (!token)
        return res.status(400).json({ error: 'missing_progress_token' });
    const state = zipProgressStore.get(token);
    if (!state)
        return res.status(404).json({ error: 'progress_not_found' });
    const processed = state.completedAssignments + state.failedAssignments;
    const total = Math.max(0, state.totalAssignments);
    const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    res.json({
        token: state.token,
        status: state.status,
        totalAssignments: state.totalAssignments,
        completedAssignments: state.completedAssignments,
        failedAssignments: state.failedAssignments,
        processedAssignments: processed,
        progressPercent: percent,
        etaSeconds: state.etaSeconds,
        startedAt: state.startedAt,
        updatedAt: state.updatedAt,
        error: state.error || null
    });
});
exports.pdfPuppeteerRouter.get('/preview/:templateId/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    let page = null;
    try {
        const { templateId, studentId } = req.params;
        const token = getTokenFromReq(req);
        const empty = String(req.query?.empty || '').toLowerCase() === 'true' || String(req.query?.empty || '') === '1';
        const student = await Student_1.Student.findById(studentId).lean();
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        const frontendUrl = resolveFrontendUrl(req);
        const printUrl = `${frontendUrl}/print/preview/${templateId}/student/${studentId}?token=${token}${empty ? '&empty=true' : ''}`;
        const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
        console.log('[PDF] Generating Preview PDF via shared function:', safePrintUrl);
        const genStart = Date.now();
        const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl);
        console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`);
        // Verify PDF is valid
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        const activeYear = await getActiveSchoolYear();
        const activeYearId = activeYear?._id ? String(activeYear._id) : String(student.schoolYearId || '');
        let yearName = String(activeYear?.name || '').trim();
        if (!yearName && student.schoolYearId) {
            const sy = await SchoolYear_1.SchoolYear.findById(student.schoolYearId).lean();
            yearName = String(sy?.name || '').trim();
        }
        const level = await resolveStudentLevel(String(student._id), String(student.level || ''), activeYearId);
        const filename = buildStudentPdfFilename({
            level,
            firstName: student.firstName,
            lastName: student.lastName,
            yearName
        });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': buildContentDisposition(filename),
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
exports.pdfPuppeteerRouter.get('/preview-empty/:templateId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    let page = null;
    try {
        const { templateId } = req.params;
        const token = getTokenFromReq(req);
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        const frontendUrl = resolveFrontendUrl(req);
        const printUrl = `${frontendUrl}/print/preview-empty/${templateId}?token=${token}&empty=true`;
        const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
        console.log('[PDF] Generating Empty Preview PDF via shared function:', safePrintUrl);
        const genStart = Date.now();
        const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl);
        console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`);
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': buildContentDisposition(`template-${template.name || template._id}.pdf`),
            'Content-Length': pdfBuffer.length.toString()
        });
        res.end(pdfBuffer);
    }
    catch (error) {
        console.error('[PDF] Empty Preview PDF generation error:', error.message);
        console.error('[PDF] Empty Preview stack:', error.stack);
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
        const token = getTokenFromReq(req);
        const frontendUrl = resolveFrontendUrl(req);
        const printUrl = `${frontendUrl}/print/saved/${saved._id}?token=${token}`;
        const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***');
        console.log('[PDF] Generating Saved Gradebook PDF via shared function:', safePrintUrl);
        const genStart = Date.now();
        const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl);
        console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`);
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }
        let firstName = String(saved.data?.student?.firstName || '').trim();
        let lastName = String(saved.data?.student?.lastName || '').trim();
        if (!firstName || !lastName) {
            const student = await Student_1.Student.findById(saved.studentId).lean();
            firstName = firstName || String(student?.firstName || '').trim();
            lastName = lastName || String(student?.lastName || '').trim();
        }
        const schoolYear = await SchoolYear_1.SchoolYear.findById(saved.schoolYearId).lean();
        const yearName = String(schoolYear?.name || '').trim();
        const level = String(saved.level || saved.meta?.level || '').trim();
        const filename = buildStudentPdfFilename({ level, firstName, lastName, yearName });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': buildContentDisposition(filename),
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
