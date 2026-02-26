"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSignatureSnapshot = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const guessMimeType = (source) => {
    const ext = path_1.default.extname(source || '').toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.webp')
        return 'image/webp';
    if (ext === '.gif')
        return 'image/gif';
    return 'image/png';
};
const tryResolveLocalUploadsPath = (source) => {
    const raw = String(source || '').trim();
    if (!raw)
        return null;
    let pathname = raw;
    if (/^https?:\/\//i.test(raw)) {
        try {
            pathname = new URL(raw).pathname || '';
        }
        catch {
            pathname = raw;
        }
    }
    const uploadsIdx = pathname.indexOf('/uploads/');
    if (uploadsIdx === -1)
        return null;
    const relFromPublic = pathname.slice(uploadsIdx + 1).replace(/^\/+/, '');
    if (!relFromPublic)
        return null;
    return path_1.default.join(__dirname, '../../public', relFromPublic);
};
const buildSignatureSnapshot = async (signatureUrl, baseUrl) => {
    if (!signatureUrl)
        return undefined;
    if (String(signatureUrl).startsWith('data:'))
        return String(signatureUrl);
    try {
        const raw = String(signatureUrl);
        const localPath = tryResolveLocalUploadsPath(raw);
        if (localPath && fs_1.default.existsSync(localPath)) {
            const buf = fs_1.default.readFileSync(localPath);
            const mime = guessMimeType(localPath);
            return `data:${mime};base64,${buf.toString('base64')}`;
        }
        const normalizedBase = baseUrl || 'http://localhost:4000';
        const fetchUrl = raw.startsWith('http') ? raw : `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`;
        const response = await axios_1.default.get(fetchUrl, { responseType: 'arraybuffer' });
        const buf = Buffer.from(response.data);
        const mime = response.headers?.['content-type'] || guessMimeType(raw);
        return `data:${mime};base64,${buf.toString('base64')}`;
    }
    catch (e) {
        console.error('[buildSignatureSnapshot] Failed to snapshot signature:', e);
        return undefined;
    }
};
exports.buildSignatureSnapshot = buildSignatureSnapshot;
