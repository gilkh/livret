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
exports.pdfRouter = void 0;
const express_1 = require("express");
const pdfkit_1 = __importDefault(require("pdfkit"));
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Category_1 = require("../models/Category");
const Competency_1 = require("../models/Competency");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const axios_1 = __importDefault(require("axios"));
const StudentSignature_1 = require("../models/StudentSignature");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// eslint-disable-next-line
const archiver = require('archiver');
const auth_1 = require("../auth");
exports.pdfRouter = (0, express_1.Router)();
exports.pdfRouter.get('/student/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const { templateId, pwd } = req.query;
    const student = await Student_1.Student.findById(id).lean();
    if (!student)
        return res.status(404).json({ error: 'not_found' });
    const enrollments = await Enrollment_1.Enrollment.find({ studentId: id }).lean();
    const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: id }).lean();
    const statusMap = new Map(statuses.map((s) => [s.competencyId, s]));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="carnet-${student.lastName}.pdf"`);
    const doc = new pdfkit_1.default({ size: 'A4', margin: 0 });
    doc.pipe(res);
    const renderDefault = async () => {
        const categories = await Category_1.Category.find({}).lean();
        const comps = await Competency_1.Competency.find({}).lean();
        doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).fillColor('#555').text(`Nom: ${student.firstName} ${student.lastName}`);
        const enrollment = enrollments[0];
        if (enrollment)
            doc.text(`Classe: ${enrollment.classId}`);
        doc.moveDown();
        for (const cat of categories) {
            doc.fontSize(16).fillColor('#6c5ce7').text(cat.name);
            doc.moveDown(0.2);
            const catComps = comps.filter((c) => c.categoryId === String(cat._id));
            for (const comp of catComps) {
                const st = statusMap.get(String(comp._id));
                const en = st?.en ? '✔' : '✘';
                const fr = st?.fr ? '✔' : '✘';
                const ar = st?.ar ? '✔' : '✘';
                doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`);
            }
            doc.moveDown();
        }
    };
    const renderFromTemplate = async (tplId) => {
        var _a;
        const tpl = await GradebookTemplate_1.GradebookTemplate.findById(tplId).lean();
        if (!tpl)
            return renderDefault();
        if (tpl.exportPassword && tpl.exportPassword !== pwd) {
            const user = req.user;
            if (!user || !['ADMIN', 'SUBADMIN'].includes(user.role)) {
                return renderDefault();
            }
        }
        // Try to get assignment data for dropdowns
        const TemplateAssignment = (await Promise.resolve().then(() => __importStar(require('../models/TemplateAssignment')))).TemplateAssignment;
        const assignment = await TemplateAssignment.findOne({
            studentId: id,
            templateId: tplId
        }).lean();
        const assignmentData = assignment?.data || {};
        const categories = await Category_1.Category.find({}).lean();
        const comps = await Competency_1.Competency.find({}).lean();
        const compByCat = {};
        for (const c of comps) {
            ;
            (compByCat[_a = c.categoryId] || (compByCat[_a] = [])).push(c);
        }
        const enrollment = enrollments[0];
        const signatures = await StudentSignature_1.StudentSignature.findOne({ studentId: id }).lean();
        const sigMap = new Map((signatures?.items || []).map((s) => [s.label, s]));
        const classDoc = enrollment ? await Class_1.ClassModel.findById(enrollment.classId).lean() : null;
        const level = classDoc ? classDoc.level : '';
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const DESIGN_W = 800;
        const DESIGN_H = 1120;
        const sx = (v) => (typeof v === 'number' ? v : 0) * (pageW / DESIGN_W);
        const sy = (v) => (typeof v === 'number' ? v : 0) * (pageH / DESIGN_H);
        const px = (v) => sx(v);
        const py = (v) => sy(v);
        const sr = (v) => {
            const scale = (pageW / DESIGN_W + pageH / DESIGN_H) / 2;
            return (typeof v === 'number' ? v : 0) * scale;
        };
        const resolveText = (t) => t
            .replace(/\{student\.firstName\}/g, String(student.firstName))
            .replace(/\{student\.lastName\}/g, String(student.lastName))
            .replace(/\{student\.dob\}/g, new Date(student.dateOfBirth).toLocaleDateString())
            .replace(/\{class\.name\}/g, classDoc ? String(classDoc.name) : '');
        const drawBlock = async (b) => {
            if (b.type === 'text') {
                if (b.props?.color)
                    doc.fillColor(b.props.color);
                doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                const x = b.props?.x, y = b.props?.y;
                const w = b.props?.width, h = b.props?.height;
                const txt = b.props?.text || '';
                if (typeof x === 'number' && typeof y === 'number') {
                    const opts = {};
                    if (typeof w === 'number')
                        opts.width = Math.max(0, sx(w));
                    if (typeof h === 'number')
                        opts.height = Math.max(0, sy(h));
                    doc.text(txt, px(x), py(y), opts);
                }
                else
                    doc.text(txt);
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'dynamic_text') {
                if (b.props?.color)
                    doc.fillColor(b.props.color);
                doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                const x = b.props?.x, y = b.props?.y;
                const w = b.props?.width, h = b.props?.height;
                const txt = resolveText(b.props?.text || '');
                if (typeof x === 'number' && typeof y === 'number') {
                    const opts = {};
                    if (typeof w === 'number')
                        opts.width = Math.max(0, sx(w));
                    if (typeof h === 'number')
                        opts.height = Math.max(0, sy(h));
                    doc.text(txt, px(x), py(y), opts);
                }
                else
                    doc.text(txt);
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'image' && b.props?.url) {
                try {
                    const url = String(b.props.url);
                    if (url.startsWith('data:')) {
                        const base64 = url.split(',').pop() || '';
                        const buf = Buffer.from(base64, 'base64');
                        const options = {};
                        if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                            options.x = px(b.props.x);
                            options.y = py(b.props.y);
                        }
                        if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') {
                            options.width = sx(b.props.width);
                            options.height = sy(b.props.height);
                        }
                        doc.image(buf, options.width ? options : undefined);
                    }
                    else {
                        const fetchUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`;
                        const r = await axios_1.default.get(fetchUrl, { responseType: 'arraybuffer' });
                        const buf = Buffer.from(r.data);
                        const options = {};
                        if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                            options.x = px(b.props.x);
                            options.y = py(b.props.y);
                        }
                        if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') {
                            options.width = sx(b.props.width);
                            options.height = sy(b.props.height);
                        }
                        doc.image(buf, options.width ? options : undefined);
                    }
                }
                catch { }
            }
            else if (b.type === 'rect') {
                const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                const w = sx(b.props?.width || 100), h = sy(b.props?.height || 50);
                if (b.props?.color && b.props.color !== 'transparent') {
                    doc.fillColor(b.props.color);
                    doc.rect(x, y, w, h).fill();
                }
                if (b.props?.stroke) {
                    doc.strokeColor(b.props.stroke);
                    doc.lineWidth(b.props?.strokeWidth || 1);
                    doc.rect(x, y, w, h).stroke();
                    doc.strokeColor('#000');
                }
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'circle') {
                const r = sr(b.props?.radius || 40);
                const x = px((b.props?.x || 50)) + r;
                const y = py((b.props?.y || 50)) + r;
                if (b.props?.color && b.props.color !== 'transparent') {
                    doc.fillColor(b.props.color);
                    doc.circle(x, y, r).fill();
                }
                if (b.props?.stroke) {
                    doc.strokeColor(b.props.stroke);
                    doc.lineWidth(b.props?.strokeWidth || 1);
                    doc.circle(x, y, r).stroke();
                    doc.strokeColor('#000');
                }
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'line') {
                const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0);
                doc.moveTo(x, y).lineTo(x + x2, y + y2);
                if (b.props?.stroke)
                    doc.strokeColor(b.props.stroke);
                doc.lineWidth(b.props?.strokeWidth || 1).stroke();
                doc.strokeColor('#000');
            }
            else if (b.type === 'arrow') {
                const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0);
                const color = b.props?.stroke || '#6c5ce7';
                doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke();
                doc.fillColor(color);
                const ax = x + x2, ay = y + y2;
                doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill();
                doc.fillColor('#2d3436').strokeColor('#000');
            }
            else if (b.type === 'qr') {
                try {
                    const wq = Math.round(sx(b.props?.width || 120)) || 120;
                    const hq = Math.round(sy(b.props?.height || 120)) || 120;
                    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${wq}x${hq}&data=${encodeURIComponent(b.props?.url || '')}`;
                    const r = await axios_1.default.get(url, { responseType: 'arraybuffer' });
                    const buf = Buffer.from(r.data);
                    const options = {};
                    if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                        options.x = px(b.props.x);
                        options.y = py(b.props.y);
                    }
                    doc.image(buf, options);
                }
                catch { }
            }
            else if (b.type === 'table') {
                const x0 = px(b.props?.x || 50), y0 = py(b.props?.y || 50);
                const cols = (b.props?.columnWidths || []).map((cw) => sx(cw));
                const rows = (b.props?.rowHeights || []).map((rh) => sy(rh));
                const cells = b.props?.cells || [];
                const colOffsets = [0];
                for (let i = 0; i < cols.length; i++)
                    colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0);
                const rowOffsets = [0];
                for (let i = 0; i < rows.length; i++)
                    rowOffsets[i + 1] = rowOffsets[i] + (rows[i] || 0);
                for (let ri = 0; ri < rows.length; ri++) {
                    for (let ci = 0; ci < cols.length; ci++) {
                        const cell = cells?.[ri]?.[ci] || {};
                        const cx = x0 + colOffsets[ci];
                        const cy = y0 + rowOffsets[ri];
                        const w = cols[ci] || 0;
                        const h = rows[ri] || 0;
                        if (cell.fill && cell.fill !== 'transparent') {
                            doc.save();
                            doc.fillColor(cell.fill);
                            doc.rect(cx, cy, w, h).fill();
                            doc.restore();
                        }
                        const drawSide = (sx, sy, ex, ey, side) => {
                            if (!side?.width || !side?.color)
                                return;
                            doc.save();
                            doc.strokeColor(side.color).lineWidth(side.width);
                            doc.moveTo(sx, sy).lineTo(ex, ey).stroke();
                            doc.restore();
                        };
                        drawSide(cx, cy, cx + w, cy, cell?.borders?.t);
                        drawSide(cx, cy + h, cx + w, cy + h, cell?.borders?.b);
                        drawSide(cx, cy, cx, cy + h, cell?.borders?.l);
                        drawSide(cx + w, cy, cx + w, cy + h, cell?.borders?.r);
                        if (cell.text) {
                            doc.save();
                            if (cell.color)
                                doc.fillColor(cell.color);
                            doc.fontSize(cell.fontSize || 12);
                            doc.text(cell.text, cx + 4, cy + 4, { width: Math.max(0, w - 8) });
                            doc.restore();
                        }
                    }
                }
            }
            else if (b.type === 'student_info') {
                const fields = b.props?.fields || ['name', 'class'];
                const x = b.props?.x, y = b.props?.y;
                const lines = [];
                if (fields.includes('name'))
                    lines.push(`${student.firstName} ${student.lastName}`);
                if (fields.includes('class'))
                    lines.push(`Classe: ${enrollment ? enrollment.classId : ''}`);
                if (fields.includes('dob'))
                    lines.push(`Naissance: ${new Date(student.dateOfBirth).toLocaleDateString()}`);
                if (b.props?.color)
                    doc.fillColor(b.props.color);
                doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                const text = lines.join('\n');
                if (typeof x === 'number' && typeof y === 'number')
                    doc.text(text, px(x), py(y));
                else
                    doc.text(text);
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'category_title' && b.props?.categoryId) {
                const cat = categories.find((c) => String(c._id) === b.props.categoryId);
                if (cat) {
                    doc.fontSize(b.props?.size || b.props?.fontSize || 16);
                    if (b.props?.color)
                        doc.fillColor(b.props.color);
                    const x = b.props?.x, y = b.props?.y;
                    if (typeof x === 'number' && typeof y === 'number')
                        doc.text(cat.name, px(x), py(y));
                    else
                        doc.text(cat.name);
                    doc.fillColor('#6c5ce7');
                }
            }
            else if (b.type === 'competency_list') {
                const catId = b.props?.categoryId;
                const items = catId ? (compByCat[catId] || []) : comps;
                const lines = [];
                for (const comp of items) {
                    const st = statusMap.get(String(comp._id));
                    const en = st?.en ? '✔' : '✘';
                    const fr = st?.fr ? '✔' : '✘';
                    const ar = st?.ar ? '✔' : '✘';
                    lines.push(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`);
                }
                if (b.props?.color)
                    doc.fillColor(b.props.color);
                doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                const x = b.props?.x, y = b.props?.y;
                const text = lines.join('\n');
                if (typeof x === 'number' && typeof y === 'number')
                    doc.text(text, px(x), py(y));
                else
                    doc.text(text);
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'signature') {
                const labels = b.props?.labels || ['Directeur', 'Enseignant', 'Parent'];
                let x = b.props?.x, y = b.props?.y;
                for (const lab of labels) {
                    const sig = sigMap.get(lab);
                    doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436');
                    if (typeof x === 'number' && typeof y === 'number') {
                        doc.text(`${lab}:`, px(x), py(y));
                        y += 16;
                        if (sig?.url) {
                            try {
                                const r = await axios_1.default.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' });
                                const buf = Buffer.from(r.data);
                                doc.image(buf, px(x), py(y), { width: 160 });
                                y += 100;
                            }
                            catch {
                                doc.text(`______________________________`, px(x), py(y));
                                y += 18;
                            }
                        }
                        else if (sig?.dataUrl) {
                            try {
                                const base64 = String(sig.dataUrl).split(',').pop() || '';
                                const buf = Buffer.from(base64, 'base64');
                                doc.image(buf, px(x), py(y), { width: 160 });
                                y += 100;
                            }
                            catch {
                                doc.text(`______________________________`, px(x), py(y));
                                y += 18;
                            }
                        }
                        else {
                            doc.text(`______________________________`, px(x), py(y));
                            y += 18;
                        }
                    }
                    else {
                        doc.text(`${lab}:`);
                        if (sig?.url || sig?.dataUrl)
                            doc.moveDown(0.2);
                        if (sig?.url) {
                            try {
                                const r = await axios_1.default.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' });
                                const buf = Buffer.from(r.data);
                                doc.image(buf, { width: 160 });
                            }
                            catch {
                                doc.text(`______________________________`);
                            }
                        }
                        else if (sig?.dataUrl) {
                            try {
                                const base64 = String(sig.dataUrl).split(',').pop() || '';
                                const buf = Buffer.from(base64, 'base64');
                                doc.image(buf, { width: 160 });
                            }
                            catch {
                                doc.text(`______________________________`);
                            }
                        }
                        else {
                            doc.text(`______________________________`);
                        }
                        doc.moveDown(0.4);
                    }
                }
            }
            else if (b.type === 'signature_box') {
                // Get the signature from the sub-admin who signed this template
                const templateAssignment = await (await Promise.resolve().then(() => __importStar(require('../models/TemplateAssignment')))).TemplateAssignment.findOne({
                    studentId: id,
                    templateId: tplId
                }).lean();
                if (templateAssignment) {
                    const TemplateSignature = (await Promise.resolve().then(() => __importStar(require('../models/TemplateSignature')))).TemplateSignature;
                    const signature = await TemplateSignature.findOne({
                        templateAssignmentId: String(templateAssignment._id)
                    }).lean();
                    if (signature?.subAdminId) {
                        const subAdmin = await User_1.User.findById(signature.subAdminId).lean();
                        const x = px(b.props?.x || 50);
                        const y = py(b.props?.y || 50);
                        const width = sx(b.props?.width || 200);
                        const height = sy(b.props?.height || 80);
                        // Draw white rectangle with black border
                        doc.save();
                        doc.rect(x, y, width, height).stroke('#000');
                        // If sub-admin has a signature image, place it in the box
                        if (subAdmin?.signatureUrl) {
                            try {
                                const sigPath = path_1.default.join(__dirname, '../../public', subAdmin.signatureUrl);
                                if (fs_1.default.existsSync(sigPath)) {
                                    const imgWidth = Math.min(width - 10, width * 0.9);
                                    const imgHeight = height - 10;
                                    doc.image(sigPath, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' });
                                }
                            }
                            catch (e) {
                                console.error('Failed to load signature image:', e);
                            }
                        }
                        doc.restore();
                    }
                    else {
                        const x2 = px(b.props?.x || 50);
                        const y2 = py(b.props?.y || 50);
                        const width2 = sx(b.props?.width || 200);
                        const height2 = sy(b.props?.height || 80);
                        doc.rect(x2, y2, width2, height2).stroke('#000');
                    }
                }
                else {
                    const x2 = px(b.props?.x || 50);
                    const y2 = py(b.props?.y || 50);
                    const width2 = sx(b.props?.width || 200);
                    const height2 = sy(b.props?.height || 80);
                    doc.rect(x2, y2, width2, height2).stroke('#000');
                }
            }
            else if (b.type === 'dropdown') {
                // Check level
                if (b.props?.levels && b.props.levels.length > 0 && level && !b.props.levels.includes(level)) {
                    return;
                }
                // Render dropdown with selected value or as empty box
                const dropdownNum = b.props?.dropdownNumber;
                const selectedValue = dropdownNum ? assignmentData[`dropdown_${dropdownNum}`] : (b.props?.variableName ? assignmentData[b.props.variableName] : '');
                const x = px(b.props?.x || 50);
                const y = py(b.props?.y || 50);
                const width = sx(b.props?.width || 200);
                const height = sy(b.props?.height || 40);
                // Draw dropdown box
                doc.save();
                doc.rect(x, y, width, height).stroke('#ccc');
                // Draw label if present
                if (b.props?.label) {
                    doc.fontSize(10).fillColor('#666');
                    doc.text(b.props.label, x, y - 14, { width });
                }
                // Draw dropdown number indicator
                if (dropdownNum) {
                    doc.fontSize(8).fillColor('#6c5ce7').font('Helvetica-Bold');
                    doc.text(`#${dropdownNum}`, x + width - 25, y - 14);
                    doc.font('Helvetica');
                }
                // Draw selected value or placeholder with text wrapping
                doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#333');
                const displayText = selectedValue || 'Sélectionner...';
                doc.text(displayText, x + 8, y + 8, { width: Math.max(0, width - 16), height: Math.max(0, height - 16), align: 'left' });
                doc.restore();
            }
            else if (b.type === 'dropdown_reference') {
                // Render the value selected in the referenced dropdown
                const dropdownNum = b.props?.dropdownNumber || 1;
                const selectedValue = assignmentData[`dropdown_${dropdownNum}`] || `[Dropdown #${dropdownNum}]`;
                if (b.props?.color)
                    doc.fillColor(b.props.color);
                doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                const x = b.props?.x, y = b.props?.y;
                const width = sx(b.props?.width || 200);
                const height = b.props?.height != null ? sy(b.props?.height) : undefined;
                if (typeof x === 'number' && typeof y === 'number') {
                    const options = { width };
                    if (height)
                        options.height = height;
                    doc.text(selectedValue, px(x), py(y), options);
                }
                else {
                    doc.text(selectedValue);
                }
                doc.fillColor('#2d3436');
            }
            else if (b.type === 'language_toggle') {
                const items = b.props?.items || [];
                // Filter items by level
                const filteredItems = items.filter(it => !it.levels || it.levels.length === 0 || !level || it.levels.includes(level));
                const r = sr(b.props?.radius || 40);
                const size = r * 2;
                const spacing = sx(b.props?.spacing || 12);
                let x = px(b.props?.x || 50);
                const y = py(b.props?.y || 50);
                for (const it of filteredItems) {
                    doc.save();
                    doc.circle(x + r, y + r, r).fill('#ddd');
                    if (it?.logo) {
                        try {
                            const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`;
                            const rimg = await axios_1.default.get(url, { responseType: 'arraybuffer' });
                            const buf = Buffer.from(rimg.data);
                            doc.image(buf, x, y, { width: size, height: size });
                        }
                        catch {
                            // keep gray circle
                        }
                    }
                    if (!it?.active) {
                        doc.opacity(0.4);
                        doc.rect(x, y, size, size).fill('#000');
                        doc.opacity(1);
                    }
                    doc.restore();
                    x += size + spacing;
                }
            }
            else if (b.type === 'promotion_info') {
                const targetLevel = b.props?.targetLevel;
                const promotions = assignmentData.promotions || [];
                const promo = promotions.find((p) => p.to === targetLevel);
                if (promo) {
                    const x = px(b.props?.x || 50);
                    const y = py(b.props?.y || 50);
                    const width = sx(b.props?.width || (b.props?.field ? 150 : 300));
                    const height = sy(b.props?.height || (b.props?.field ? 30 : 100));
                    doc.save();
                    doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#2d3436');
                    if (!b.props?.field) {
                        // Legacy behavior: Draw box and all info
                        doc.rect(x, y, width, height).stroke('#6c5ce7');
                        const textX = x + 10;
                        let textY = y + 15;
                        doc.font('Helvetica-Bold').text(`Passage en ${targetLevel}`, textX, textY, { width: width - 20, align: 'center' });
                        textY += 20;
                        doc.font('Helvetica').text(`${student.firstName} ${student.lastName}`, textX, textY, { width: width - 20, align: 'center' });
                        textY += 20;
                        doc.fontSize((b.props?.fontSize || 12) * 0.8).fillColor('#666');
                        doc.text(`Année ${promo.year}`, textX, textY, { width: width - 20, align: 'center' });
                    }
                    else {
                        // Specific field
                        if (b.props.field === 'level') {
                            doc.font('Helvetica-Bold').text(`Passage en ${targetLevel}`, x, y + (height / 2) - 6, { width, align: 'center' });
                        }
                        else if (b.props.field === 'student') {
                            doc.font('Helvetica').text(`${student.firstName} ${student.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' });
                        }
                        else if (b.props.field === 'year') {
                            doc.text(`Année ${promo.year}`, x, y + (height / 2) - 6, { width, align: 'center' });
                        }
                    }
                    doc.restore();
                }
            }
        };
        for (let i = 0; i < (tpl.pages || []).length; i++) {
            const page = tpl.pages[i];
            if (i > 0)
                doc.addPage();
            if (page?.bgColor) {
                doc.save();
                doc.fillColor(page.bgColor);
                doc.rect(0, 0, pageW, pageH).fill();
                doc.restore();
            }
            if (page?.title)
                doc.fontSize(18).fillColor('#333').text(page.title);
            const blocksOrdered = [...(page?.blocks || [])].sort((a, b) => ((a?.props?.z ?? 0) - (b?.props?.z ?? 0)));
            for (const b of blocksOrdered) {
                await drawBlock(b);
                if (!b.props?.x && !b.props?.y)
                    doc.moveDown(0.4);
            }
        }
    };
    if (templateId)
        await renderFromTemplate(String(templateId));
    else
        await renderDefault();
    const dateStr = new Date().toLocaleDateString();
    doc.moveDown();
    doc.fontSize(10).fillColor('#999').text(`Imprimé le ${dateStr}`, { align: 'right' });
    doc.end();
});
exports.pdfRouter.get('/class/:classId/batch', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    var _a;
    const { classId } = req.params;
    const { templateId, pwd } = req.query;
    const enrolls = await Enrollment_1.Enrollment.find({ classId }).lean();
    const studentIds = enrolls.map(e => e.studentId);
    const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="reports-${classId}.zip"`);
    const archive = archiver('zip');
    archive.pipe(res);
    for (const s of students) {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (d) => chunks.push(d));
        doc.on('end', () => {
            const buf = Buffer.concat(chunks);
            archive.append(buf, { name: `carnet-${s.lastName}-${s.firstName}.pdf` });
        });
        const enrollments = await Enrollment_1.Enrollment.find({ studentId: String(s._id) }).lean();
        const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: String(s._id) }).lean();
        const statusMap = new Map(statuses.map((st) => [st.competencyId, st]));
        if (templateId) {
            try {
                const tpl = await GradebookTemplate_1.GradebookTemplate.findById(String(templateId)).lean();
                if (!tpl || (tpl.exportPassword && tpl.exportPassword !== pwd)) {
                    // fallback default
                    const categories = await Category_1.Category.find({}).lean();
                    const comps = await Competency_1.Competency.find({}).lean();
                    doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' });
                    doc.moveDown();
                    doc.fontSize(12).fillColor('#555').text(`Nom: ${s.firstName} ${s.lastName}`);
                    const enrollment = enrollments[0];
                    if (enrollment)
                        doc.text(`Classe: ${enrollment.classId}`);
                    doc.moveDown();
                    for (const cat of categories) {
                        doc.fontSize(16).fillColor('#6c5ce7').text(cat.name);
                        doc.moveDown(0.2);
                        const catComps = comps.filter((c) => c.categoryId === String(cat._id));
                        for (const comp of catComps) {
                            const st = statusMap.get(String(comp._id));
                            const en = st?.en ? '✔' : '✘';
                            const fr = st?.fr ? '✔' : '✘';
                            const ar = st?.ar ? '✔' : '✘';
                            doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`);
                        }
                        doc.moveDown();
                    }
                }
                else {
                    // Try to get assignment data for dropdowns
                    const TemplateAssignment = (await Promise.resolve().then(() => __importStar(require('../models/TemplateAssignment')))).TemplateAssignment;
                    const assignment = await TemplateAssignment.findOne({
                        studentId: String(s._id),
                        templateId: String(templateId)
                    }).lean();
                    const assignmentData = assignment?.data || {};
                    const categories = await Category_1.Category.find({}).lean();
                    const comps = await Competency_1.Competency.find({}).lean();
                    const compByCat = {};
                    for (const c of comps) {
                        ;
                        (compByCat[_a = c.categoryId] || (compByCat[_a] = [])).push(c);
                    }
                    const signatures = await StudentSignature_1.StudentSignature.findOne({ studentId: String(s._id) }).lean();
                    const sigMap = new Map((signatures?.items || []).map((si) => [si.label, si]));
                    const classDoc = enrollments[0] ? await Class_1.ClassModel.findById(enrollments[0].classId).lean() : null;
                    const level = classDoc ? classDoc.level : '';
                    const pageW = doc.page.width;
                    const pageH = doc.page.height;
                    const DESIGN_W = 800;
                    const DESIGN_H = 1120;
                    const sx = (v) => (typeof v === 'number' ? v : 0) * (pageW / DESIGN_W);
                    const sy = (v) => (typeof v === 'number' ? v : 0) * (pageH / DESIGN_H);
                    const px = (v) => sx(v);
                    const py = (v) => sy(v);
                    const sr = (v) => {
                        const scale = (pageW / DESIGN_W + pageH / DESIGN_H) / 2;
                        return (typeof v === 'number' ? v : 0) * scale;
                    };
                    const resolveText = (t) => t
                        .replace(/\{student\.firstName\}/g, String(s.firstName))
                        .replace(/\{student\.lastName\}/g, String(s.lastName))
                        .replace(/\{student\.dob\}/g, new Date(s.dateOfBirth).toLocaleDateString())
                        .replace(/\{class\.name\}/g, classDoc ? String(classDoc.name) : '');
                    const drawBlock = async (b) => {
                        if (Array.isArray(b?.props?.levels) && b.props.levels.length > 0 && level && !b.props.levels.includes(level))
                            return;
                        if (b.type === 'text') {
                            if (b.props?.color)
                                doc.fillColor(b.props.color);
                            doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                            const x = b.props?.x, y = b.props?.y;
                            const w = b.props?.width, h = b.props?.height;
                            const txt = b.props?.text || '';
                            if (typeof x === 'number' && typeof y === 'number') {
                                const opts = {};
                                if (typeof w === 'number')
                                    opts.width = Math.max(0, sx(w));
                                if (typeof h === 'number')
                                    opts.height = Math.max(0, sy(h));
                                doc.text(txt, px(x), py(y), opts);
                            }
                            else
                                doc.text(txt);
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'dynamic_text') {
                            if (b.props?.color)
                                doc.fillColor(b.props.color);
                            doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                            const x = b.props?.x, y = b.props?.y;
                            const w = b.props?.width, h = b.props?.height;
                            const txt = resolveText(b.props?.text || '');
                            if (typeof x === 'number' && typeof y === 'number') {
                                const opts = {};
                                if (typeof w === 'number')
                                    opts.width = Math.max(0, sx(w));
                                if (typeof h === 'number')
                                    opts.height = Math.max(0, sy(h));
                                doc.text(txt, px(x), py(y), opts);
                            }
                            else
                                doc.text(txt);
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'image' && b.props?.url) {
                            try {
                                const url = String(b.props.url);
                                if (url.startsWith('data:')) {
                                    const base64 = url.split(',').pop() || '';
                                    const buf = Buffer.from(base64, 'base64');
                                    const options = {};
                                    if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                                        options.x = px(b.props.x);
                                        options.y = py(b.props.y);
                                    }
                                    if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') {
                                        options.width = sx(b.props.width);
                                        options.height = sy(b.props.height);
                                    }
                                    doc.image(buf, options.width ? options : undefined);
                                }
                                else {
                                    const fetchUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`;
                                    const r = await axios_1.default.get(fetchUrl, { responseType: 'arraybuffer' });
                                    const buf = Buffer.from(r.data);
                                    const options = {};
                                    if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                                        options.x = px(b.props.x);
                                        options.y = py(b.props.y);
                                    }
                                    if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') {
                                        options.width = sx(b.props.width);
                                        options.height = sy(b.props.height);
                                    }
                                    doc.image(buf, options.width ? options : undefined);
                                }
                            }
                            catch { }
                        }
                        else if (b.type === 'rect') {
                            const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                            const w = sx(b.props?.width || 100), h = sy(b.props?.height || 50);
                            if (b.props?.color && b.props.color !== 'transparent') {
                                doc.fillColor(b.props.color);
                                doc.rect(x, y, w, h).fill();
                            }
                            if (b.props?.stroke) {
                                doc.strokeColor(b.props.stroke);
                                doc.lineWidth(b.props?.strokeWidth || 1);
                                doc.rect(x, y, w, h).stroke();
                                doc.strokeColor('#000');
                            }
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'circle') {
                            const r = sr(b.props?.radius || 40);
                            const x = px((b.props?.x || 50)) + r;
                            const y = py((b.props?.y || 50)) + r;
                            if (b.props?.color && b.props.color !== 'transparent') {
                                doc.fillColor(b.props.color);
                                doc.circle(x, y, r).fill();
                            }
                            if (b.props?.stroke) {
                                doc.strokeColor(b.props.stroke);
                                doc.lineWidth(b.props?.strokeWidth || 1);
                                doc.circle(x, y, r).stroke();
                                doc.strokeColor('#000');
                            }
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'line') {
                            const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                            const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0);
                            doc.moveTo(x, y).lineTo(x + x2, y + y2);
                            if (b.props?.stroke)
                                doc.strokeColor(b.props.stroke);
                            doc.lineWidth(b.props?.strokeWidth || 1).stroke();
                            doc.strokeColor('#000');
                        }
                        else if (b.type === 'arrow') {
                            const x = px(b.props?.x || 50), y = py(b.props?.y || 50);
                            const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0);
                            const color = b.props?.stroke || '#6c5ce7';
                            doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke();
                            doc.fillColor(color);
                            const ax = x + x2, ay = y + y2;
                            doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill();
                            doc.fillColor('#2d3436').strokeColor('#000');
                        }
                        else if (b.type === 'qr') {
                            try {
                                const wq = Math.round(sx(b.props?.width || 120)) || 120;
                                const hq = Math.round(sy(b.props?.height || 120)) || 120;
                                const url = `https://api.qrserver.com/v1/create-qr-code/?size=${wq}x${hq}&data=${encodeURIComponent(b.props?.url || '')}`;
                                const r = await axios_1.default.get(url, { responseType: 'arraybuffer' });
                                const buf = Buffer.from(r.data);
                                const options = {};
                                if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') {
                                    options.x = px(b.props.x);
                                    options.y = py(b.props.y);
                                }
                                doc.image(buf, options);
                            }
                            catch { }
                        }
                        else if (b.type === 'student_info') {
                            const fields = b.props?.fields || ['name', 'class'];
                            const x = b.props?.x, y = b.props?.y;
                            const lines = [];
                            if (fields.includes('name'))
                                lines.push(`${s.firstName} ${s.lastName}`);
                            if (fields.includes('class'))
                                lines.push(`Classe: ${enrollments[0] ? enrollments[0].classId : ''}`);
                            if (fields.includes('dob'))
                                lines.push(`Naissance: ${new Date(s.dateOfBirth).toLocaleDateString()}`);
                            if (b.props?.color)
                                doc.fillColor(b.props.color);
                            doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                            const text = lines.join('\n');
                            if (typeof x === 'number' && typeof y === 'number')
                                doc.text(text, px(x), py(y));
                            else
                                doc.text(text);
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'category_title' && b.props?.categoryId) {
                            const cat = categories.find((c) => String(c._id) === b.props.categoryId);
                            if (cat) {
                                doc.fontSize(b.props?.size || b.props?.fontSize || 16);
                                if (b.props?.color)
                                    doc.fillColor(b.props.color);
                                const x = b.props?.x, y = b.props?.y;
                                if (typeof x === 'number' && typeof y === 'number')
                                    doc.text(cat.name, px(x), py(y));
                                else
                                    doc.text(cat.name);
                                doc.fillColor('#6c5ce7');
                            }
                        }
                        else if (b.type === 'competency_list') {
                            const catId = b.props?.categoryId;
                            const items = catId ? (compByCat[catId] || []) : comps;
                            const lines = [];
                            for (const comp of items) {
                                const st = statusMap.get(String(comp._id));
                                const en = st?.en ? '✔' : '✘';
                                const fr = st?.fr ? '✔' : '✘';
                                const ar = st?.ar ? '✔' : '✘';
                                lines.push(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`);
                            }
                            if (b.props?.color)
                                doc.fillColor(b.props.color);
                            doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                            const x = b.props?.x, y = b.props?.y;
                            const text = lines.join('\n');
                            if (typeof x === 'number' && typeof y === 'number')
                                doc.text(text, px(x), py(y));
                            else
                                doc.text(text);
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'signature') {
                            const labels = b.props?.labels || ['Directeur', 'Enseignant', 'Parent'];
                            let x = b.props?.x, y = b.props?.y;
                            for (const lab of labels) {
                                const sig = sigMap.get(lab);
                                doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436');
                                if (typeof x === 'number' && typeof y === 'number') {
                                    doc.text(`${lab}:`, px(x), py(y));
                                    y += 16;
                                    if (sig?.url) {
                                        try {
                                            const r = await axios_1.default.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' });
                                            const buf = Buffer.from(r.data);
                                            doc.image(buf, px(x), py(y), { width: 160 });
                                            y += 100;
                                        }
                                        catch {
                                            doc.text(`______________________________`, px(x), py(y));
                                            y += 18;
                                        }
                                    }
                                    else if (sig?.dataUrl) {
                                        try {
                                            const base64 = String(sig.dataUrl).split(',').pop() || '';
                                            const buf = Buffer.from(base64, 'base64');
                                            doc.image(buf, px(x), py(y), { width: 160 });
                                            y += 100;
                                        }
                                        catch {
                                            doc.text(`______________________________`, px(x), py(y));
                                            y += 18;
                                        }
                                    }
                                    else {
                                        doc.text(`______________________________`, px(x), py(y));
                                        y += 18;
                                    }
                                }
                                else {
                                    doc.text(`${lab}:`);
                                    if (sig?.url || sig?.dataUrl)
                                        doc.moveDown(0.2);
                                    if (sig?.url) {
                                        try {
                                            const r = await axios_1.default.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' });
                                            const buf = Buffer.from(r.data);
                                            doc.image(buf, { width: 160 });
                                        }
                                        catch {
                                            doc.text(`______________________________`);
                                        }
                                    }
                                    else if (sig?.dataUrl) {
                                        try {
                                            const base64 = String(sig.dataUrl).split(',').pop() || '';
                                            const buf = Buffer.from(base64, 'base64');
                                            doc.image(buf, { width: 160 });
                                        }
                                        catch {
                                            doc.text(`______________________________`);
                                        }
                                    }
                                    else {
                                        doc.text(`______________________________`);
                                    }
                                    doc.moveDown(0.4);
                                }
                            }
                        }
                        else if (b.type === 'dropdown') {
                            // Render dropdown with selected value or as empty box
                            const dropdownNum = b.props?.dropdownNumber;
                            const selectedValue = dropdownNum ? assignmentData[`dropdown_${dropdownNum}`] : (b.props?.variableName ? assignmentData[b.props.variableName] : '');
                            const x = px(b.props?.x || 50);
                            const y = py(b.props?.y || 50);
                            const width = sx(b.props?.width || 200);
                            const height = sy(b.props?.height || 40);
                            // Draw dropdown box
                            doc.save();
                            doc.rect(x, y, width, height).stroke('#ccc');
                            // Draw label if present
                            if (b.props?.label) {
                                doc.fontSize(10).fillColor('#666');
                                doc.text(b.props.label, x, y - 14, { width });
                            }
                            // Draw dropdown number indicator
                            if (dropdownNum) {
                                doc.fontSize(8).fillColor('#6c5ce7').font('Helvetica-Bold');
                                doc.text(`#${dropdownNum}`, x + width - 25, y - 14);
                                doc.font('Helvetica');
                            }
                            // Draw selected value or placeholder with text wrapping
                            doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#333');
                            const displayText = selectedValue || 'Sélectionner...';
                            doc.text(displayText, x + 8, y + 8, { width: Math.max(0, width - 16), height: Math.max(0, height - 16), align: 'left' });
                            doc.restore();
                        }
                        else if (b.type === 'dropdown_reference') {
                            // Render the value selected in the referenced dropdown
                            const dropdownNum = b.props?.dropdownNumber || 1;
                            const selectedValue = assignmentData[`dropdown_${dropdownNum}`] || `[Dropdown #${dropdownNum}]`;
                            if (b.props?.color)
                                doc.fillColor(b.props.color);
                            doc.fontSize(b.props?.size || b.props?.fontSize || 12);
                            const x = b.props?.x, y = b.props?.y;
                            const width = sx(b.props?.width || 200);
                            const height = b.props?.height != null ? sy(b.props?.height) : undefined;
                            if (typeof x === 'number' && typeof y === 'number') {
                                const options = { width };
                                if (height)
                                    options.height = height;
                                doc.text(selectedValue, px(x), py(y), options);
                            }
                            else {
                                doc.text(selectedValue);
                            }
                            doc.fillColor('#2d3436');
                        }
                        else if (b.type === 'language_toggle') {
                            const items = b.props?.items || [];
                            const filteredItems = items.filter(it => !it.levels || it.levels.length === 0 || !level || it.levels.includes(level));
                            const r2 = sr(b.props?.radius || 40);
                            const size2 = r2 * 2;
                            const spacing2 = sx(b.props?.spacing || 12);
                            let x = px(b.props?.x || 50);
                            const y = py(b.props?.y || 50);
                            for (const it of filteredItems) {
                                doc.save();
                                doc.circle(x + r2, y + r2, r2).fill('#ddd');
                                if (it?.logo) {
                                    try {
                                        const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`;
                                        const rimg = await axios_1.default.get(url, { responseType: 'arraybuffer' });
                                        const buf = Buffer.from(rimg.data);
                                        doc.image(buf, x, y, { width: size2, height: size2 });
                                    }
                                    catch { }
                                }
                                if (!it?.active) {
                                    doc.opacity(0.4);
                                    doc.rect(x, y, size2, size2).fill('#000');
                                    doc.opacity(1);
                                }
                                doc.restore();
                                x += size2 + spacing2;
                            }
                        }
                        else if (b.type === 'table') {
                            const x0 = px(b.props?.x || 50), y0 = py(b.props?.y || 50);
                            const cols = (b.props?.columnWidths || []).map((cw) => sx(cw));
                            const rows = (b.props?.rowHeights || []).map((rh) => sy(rh));
                            const cells = b.props?.cells || [];
                            const colOffsets = [0];
                            for (let i = 0; i < cols.length; i++)
                                colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0);
                            const rowOffsets = [0];
                            for (let i = 0; i < rows.length; i++)
                                rowOffsets[i + 1] = rowOffsets[i] + (rows[i] || 0);
                            for (let ri = 0; ri < rows.length; ri++) {
                                for (let ci = 0; ci < cols.length; ci++) {
                                    const cell = cells?.[ri]?.[ci] || {};
                                    const cx = x0 + colOffsets[ci];
                                    const cy = y0 + rowOffsets[ri];
                                    const w = cols[ci] || 0;
                                    const h = rows[ri] || 0;
                                    if (cell.fill && cell.fill !== 'transparent') {
                                        doc.save();
                                        doc.fillColor(cell.fill);
                                        doc.rect(cx, cy, w, h).fill();
                                        doc.restore();
                                    }
                                    const drawSide = (sx, sy, ex, ey, side) => {
                                        if (!side?.width || !side?.color)
                                            return;
                                        doc.save();
                                        doc.strokeColor(side.color).lineWidth(side.width);
                                        doc.moveTo(sx, sy).lineTo(ex, ey).stroke();
                                        doc.restore();
                                    };
                                    drawSide(cx, cy, cx + w, cy, cell?.borders?.t);
                                    drawSide(cx, cy + h, cx + w, cy + h, cell?.borders?.b);
                                    drawSide(cx, cy, cx, cy + h, cell?.borders?.l);
                                    drawSide(cx + w, cy, cx + w, cy + h, cell?.borders?.r);
                                    if (cell.text) {
                                        doc.save();
                                        if (cell.color)
                                            doc.fillColor(cell.color);
                                        doc.fontSize(cell.fontSize || 12);
                                        doc.text(cell.text, cx + 4, cy + 4, { width: Math.max(0, w - 8) });
                                        doc.restore();
                                    }
                                }
                            }
                        }
                        else if (b.type === 'signature_box') {
                            // Get the signature from the sub-admin who signed this template
                            const TemplateAssignment = (await Promise.resolve().then(() => __importStar(require('../models/TemplateAssignment')))).TemplateAssignment;
                            const templateAssignment = await TemplateAssignment.findOne({
                                studentId: String(s._id),
                                templateId: String(templateId)
                            }).lean();
                            if (templateAssignment) {
                                const TemplateSignature = (await Promise.resolve().then(() => __importStar(require('../models/TemplateSignature')))).TemplateSignature;
                                const signature = await TemplateSignature.findOne({
                                    templateAssignmentId: String(templateAssignment._id)
                                }).lean();
                                if (signature?.subAdminId) {
                                    const subAdmin = await User_1.User.findById(signature.subAdminId).lean();
                                    const x = px(b.props?.x || 50);
                                    const y = py(b.props?.y || 50);
                                    const width = sx(b.props?.width || 200);
                                    const height = sy(b.props?.height || 80);
                                    // Draw white rectangle with black border
                                    doc.save();
                                    doc.rect(x, y, width, height).stroke('#000');
                                    // If sub-admin has a signature image, place it in the box
                                    if (subAdmin?.signatureUrl) {
                                        try {
                                            const sigPath = path_1.default.join(__dirname, '../../public', subAdmin.signatureUrl);
                                            if (fs_1.default.existsSync(sigPath)) {
                                                const imgWidth = Math.min(width - 10, width * 0.9);
                                                const imgHeight = height - 10;
                                                doc.image(sigPath, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' });
                                            }
                                        }
                                        catch (e) {
                                            console.error('Failed to load signature image:', e);
                                        }
                                    }
                                    doc.restore();
                                }
                                else {
                                    const x2 = px(b.props?.x || 50);
                                    const y2 = py(b.props?.y || 50);
                                    const width2 = sx(b.props?.width || 200);
                                    const height2 = sy(b.props?.height || 80);
                                    doc.rect(x2, y2, width2, height2).stroke('#000');
                                }
                            }
                            else {
                                const x2 = px(b.props?.x || 50);
                                const y2 = py(b.props?.y || 50);
                                const width2 = sx(b.props?.width || 200);
                                const height2 = sy(b.props?.height || 80);
                                doc.rect(x2, y2, width2, height2).stroke('#000');
                            }
                        }
                        else if (b.type === 'promotion_info') {
                            const targetLevel = b.props?.targetLevel;
                            const promotions = assignmentData.promotions || [];
                            const promo = promotions.find((p) => p.to === targetLevel);
                            if (promo) {
                                const x = px(b.props?.x || 50);
                                const y = py(b.props?.y || 50);
                                const width = sx(b.props?.width || (b.props?.field ? 150 : 300));
                                const height = sy(b.props?.height || (b.props?.field ? 30 : 100));
                                doc.save();
                                doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#2d3436');
                                if (!b.props?.field) {
                                    // Legacy behavior: Draw box and all info
                                    doc.rect(x, y, width, height).stroke('#6c5ce7');
                                    const textX = x + 10;
                                    let textY = y + 15;
                                    doc.font('Helvetica-Bold').text(`Passage en ${targetLevel}`, textX, textY, { width: width - 20, align: 'center' });
                                    textY += 20;
                                    doc.font('Helvetica').text(`${s.firstName} ${s.lastName}`, textX, textY, { width: width - 20, align: 'center' });
                                    textY += 20;
                                    doc.fontSize((b.props?.fontSize || 12) * 0.8).fillColor('#666');
                                    doc.text(`Année ${promo.year}`, textX, textY, { width: width - 20, align: 'center' });
                                }
                                else {
                                    // Specific field
                                    if (b.props.field === 'level') {
                                        doc.font('Helvetica-Bold').text(`Passage en ${targetLevel}`, x, y + (height / 2) - 6, { width, align: 'center' });
                                    }
                                    else if (b.props.field === 'student') {
                                        doc.font('Helvetica').text(`${s.firstName} ${s.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' });
                                    }
                                    else if (b.props.field === 'year') {
                                        doc.text(`Année ${promo.year}`, x, y + (height / 2) - 6, { width, align: 'center' });
                                    }
                                }
                                doc.restore();
                            }
                        }
                    };
                    for (let i = 0; i < (tpl.pages || []).length; i++) {
                        const page = tpl.pages[i];
                        if (i > 0)
                            doc.addPage();
                        if (page?.bgColor) {
                            doc.save();
                            doc.fillColor(page.bgColor);
                            doc.rect(0, 0, pageW, pageH).fill();
                            doc.restore();
                        }
                        if (page?.title)
                            doc.fontSize(18).fillColor('#333').text(page.title);
                        const blocksOrdered = [...(page?.blocks || [])].sort((a, b) => ((a?.props?.z ?? 0) - (b?.props?.z ?? 0)));
                        for (const b of blocksOrdered) {
                            await drawBlock(b);
                            if (!b.props?.x && !b.props?.y)
                                doc.moveDown(0.4);
                        }
                    }
                }
            }
            catch {
                // default fallback
            }
        }
        else {
            const categories = await Category_1.Category.find({}).lean();
            const comps = await Competency_1.Competency.find({}).lean();
            doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).fillColor('#555').text(`Nom: ${s.firstName} ${s.lastName}`);
            const enrollment = enrollments[0];
            if (enrollment)
                doc.text(`Classe: ${enrollment.classId}`);
            doc.moveDown();
            for (const cat of categories) {
                doc.fontSize(16).fillColor('#6c5ce7').text(cat.name);
                doc.moveDown(0.2);
                const catComps = comps.filter((c) => c.categoryId === String(cat._id));
                for (const comp of catComps) {
                    const st = statusMap.get(String(comp._id));
                    const en = st?.en ? '✔' : '✘';
                    const fr = st?.fr ? '✔' : '✘';
                    const ar = st?.ar ? '✔' : '✘';
                    doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`);
                }
                doc.moveDown();
            }
        }
        doc.end();
    }
    archive.finalize();
});
