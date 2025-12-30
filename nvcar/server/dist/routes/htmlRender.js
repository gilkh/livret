"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.htmlRenderRouter = void 0;
const express_1 = require("express");
const Student_1 = require("../models/Student");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const auth_1 = require("../auth");
exports.htmlRenderRouter = (0, express_1.Router)();
// Helper function to compute next school year name
function computeNextSchoolYearName(year) {
    if (!year)
        return '';
    const m = year.match(/(\d{4})\s*([/\-])\s*(\d{4})/);
    if (!m)
        return '';
    const start = parseInt(m[1], 10);
    const sep = m[2];
    const end = parseInt(m[3], 10);
    if (Number.isNaN(start) || Number.isNaN(end))
        return '';
    return `${start + 1}${sep}${end + 1}`;
}
// Helper function to get the promotion year label (next year)
function getPromotionYearLabel(promo, assignmentData, blockLevel) {
    const year = String(promo?.year || '');
    if (year) {
        const next = computeNextSchoolYearName(year);
        if (next)
            return next;
    }
    if (!year)
        return '';
    const history = assignmentData?.signatures || [];
    const level = String(promo?.from || blockLevel || '');
    const endSig = Array.isArray(history)
        ? history
            .filter((s) => (s?.type === 'end_of_year') && s?.schoolYearName)
            .find((s) => {
            if (!level)
                return true;
            if (s?.level)
                return String(s.level) === level;
            return false;
        })
        : null;
    if (endSig?.schoolYearName)
        return String(endSig.schoolYearName);
    const next = computeNextSchoolYearName(year);
    return next || year;
}
// HTML template for rendering the carnet
exports.htmlRenderRouter.get('/carnet/:assignmentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { token } = req.query;
        // Get assignment data
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).send('Assignment not found');
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        if (!template || !student)
            return res.status(404).send('Template or student not found');
        const assignmentData = assignment.data || {};
        // Generate HTML with inline styles
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: white;
    }
    .page-container {
      width: 800px;
      margin: 0 auto;
    }
    .page {
      width: 800px;
      height: 1120px;
      position: relative;
      background: white;
      page-break-after: always;
      overflow: hidden;
    }
    .block {
      position: absolute;
    }
    .dropdown-box {
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 8px;
      background: white;
    }
    .dropdown-label {
      font-size: 10px;
      color: #666;
      margin-bottom: 2px;
    }
    .dropdown-number {
      font-size: 8px;
      color: #6c5ce7;
      font-weight: bold;
    }
    .signature-box {
      border: 1px solid #000;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .promotion-box {
      border: 1px solid #6c5ce7;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .table-cell {
      border: 1px solid #ddd;
      padding: 4px;
      overflow: hidden;
    }
    @media print {
      .page { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    ${template.pages.map((page, pageIdx) => `
      <div class="page" style="background: ${page.bgColor || '#fff'};">
        ${(page.blocks || []).sort((a, b) => (a.props?.z ?? 0) - (b.props?.z ?? 0)).map((block) => renderBlock(block, student, assignmentData)).join('')}
      </div>
    `).join('')}
  </div>
</body>
</html>
`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    }
    catch (error) {
        console.error('HTML render error:', error);
        res.status(500).send('Error rendering HTML');
    }
});
function renderBlock(block, student, assignmentData) {
    const props = block.props || {};
    const style = `left: ${props.x || 0}px; top: ${props.y || 0}px; z-index: ${props.z ?? 0};`;
    switch (block.type) {
        case 'text':
            return `<div class="block" style="${style} color: ${props.color || '#000'}; font-size: ${props.fontSize || 12}px; width: ${props.width || 'auto'}px;">${props.text || ''}</div>`;
        case 'dynamic_text':
            const text = (props.text || '')
                .replace(/\{student\.firstName\}/g, student.firstName)
                .replace(/\{student\.lastName\}/g, student.lastName)
                .replace(/\{student\.dob\}/g, new Date(student.dateOfBirth).toLocaleDateString());
            return `<div class="block" style="${style} color: ${props.color || '#000'}; font-size: ${props.fontSize || 12}px;">${text}</div>`;
        case 'image':
            return `<div class="block" style="${style}"><img src="${props.url}" style="width: ${props.width || 120}px; height: ${props.height || 120}px; border-radius: 8px;" /></div>`;
        case 'rect':
            return `<div class="block" style="${style} width: ${props.width || 100}px; height: ${props.height || 50}px; background: ${props.color || 'transparent'}; border: ${props.stroke ? `${props.strokeWidth || 1}px solid ${props.stroke}` : 'none'}; border-radius: ${props.radius || 0}px;"></div>`;
        case 'circle':
            const radius = props.radius || 40;
            return `<div class="block" style="${style} width: ${radius * 2}px; height: ${radius * 2}px; background: ${props.color || '#ddd'}; border-radius: 50%; border: ${props.stroke ? `${props.strokeWidth || 1}px solid ${props.stroke}` : 'none'};"></div>`;
        case 'line':
            return `<div class="block" style="${style} width: ${props.x2 || 100}px; height: ${props.strokeWidth || 2}px; background: ${props.stroke || '#b2bec3'};"></div>`;
        case 'arrow':
            return `<div class="block" style="${style} width: ${props.x2 || 100}px; height: ${props.strokeWidth || 2}px; background: ${props.stroke || '#6c5ce7'}; position: relative;"><div style="position: absolute; right: 0; top: -6px; width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 12px solid ${props.stroke || '#6c5ce7'};"></div></div>`;
        case 'dropdown':
            const dropdownNum = props.dropdownNumber;
            const selectedValue = dropdownNum ? assignmentData[`dropdown_${dropdownNum}`] : '';
            return `<div class="block" style="${style}">
        <div class="dropdown-box" style="width: ${props.width || 200}px; min-height: ${props.height || 40}px; font-size: ${props.fontSize || 12}px; color: ${props.color || '#333'};">
          ${props.label ? `<div class="dropdown-label">${props.label}</div>` : ''}
          ${dropdownNum ? `<div class="dropdown-number" style="float: right;">#${dropdownNum}</div>` : ''}
          <div style="clear: both;">${selectedValue || 'Sélectionner...'}</div>
        </div>
      </div>`;
        case 'dropdown_reference':
            const refDropdownNum = props.dropdownNumber || 1;
            const refValue = assignmentData[`dropdown_${refDropdownNum}`] || `[Dropdown #${refDropdownNum}]`;
            return `<div class="block" style="${style} color: ${props.color || '#333'}; font-size: ${props.fontSize || 12}px; width: ${props.width || 200}px; white-space: pre-wrap; word-wrap: break-word;">${refValue}</div>`;
        case 'promotion_info':
            const targetLevel = props.targetLevel;
            const promotions = assignmentData.promotions || [];
            const promo = promotions.find((p) => p.to === targetLevel);
            if (promo) {
                const yearLabel = getPromotionYearLabel(promo, assignmentData, null);
                if (!props.field) {
                    return `<div class="block" style="${style}">
            <div class="promotion-box" style="width: ${props.width || 300}px; height: ${props.height || 100}px; font-size: ${props.fontSize || 12}px; color: ${props.color || '#2d3436'};">
              <div style="font-weight: bold; margin-bottom: 8px;">Passage en ${targetLevel}</div>
              <div>${student.firstName} ${student.lastName}</div>
              <div style="font-size: ${(props.fontSize || 12) * 0.8}px; color: #666; margin-top: 8px;">Année ${yearLabel}</div>
            </div>
          </div>`;
                }
                else {
                    let content = '';
                    if (props.field === 'level')
                        content = `Passage en ${targetLevel}`;
                    else if (props.field === 'student')
                        content = `${student.firstName} ${student.lastName}`;
                    else if (props.field === 'year')
                        content = `Année ${yearLabel}`;
                    return `<div class="block" style="${style} width: ${props.width || 150}px; height: ${props.height || 30}px; font-size: ${props.fontSize || 12}px; color: ${props.color || '#2d3436'}; display: flex; align-items: center; justify-content: center; text-align: center;">${content}</div>`;
                }
            }
            return '';
        case 'table':
            const cells = props.cells || [];
            const columnWidths = props.columnWidths || [];
            const rowHeights = props.rowHeights || [];
            let tableHtml = '<div class="block" style="' + style + '"><table style="border-collapse: collapse;">';
            cells.forEach((row, ri) => {
                tableHtml += '<tr>';
                row.forEach((cell, ci) => {
                    tableHtml += `<td class="table-cell" style="width: ${columnWidths[ci] || 100}px; height: ${rowHeights[ri] || 40}px; background: ${cell.fill || 'transparent'}; color: ${cell.color || '#333'}; font-size: ${cell.fontSize || 12}px;">${cell.text || ''}</td>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</table></div>';
            return tableHtml;
        case 'qr':
            return `<div class="block" style="${style}"><img src="https://api.qrserver.com/v1/create-qr-code/?size=${props.width || 120}x${props.height || 120}&data=${encodeURIComponent(props.url || '')}" style="width: ${props.width || 120}px; height: ${props.height || 120}px;" /></div>`;
        case 'signature_box':
            return `<div class="block" style="${style}">
        <div class="signature-box" style="width: ${props.width || 200}px; height: ${props.height || 80}px; font-size: 10px; color: #999;">
          ${props.label || 'Signature'}
        </div>
      </div>`;
        case 'language_toggle':
            const items = props.items || [];
            const toggleRadius = props.radius || 40;
            const size = toggleRadius * 2;
            const spacing = props.spacing || 12;
            let toggleHtml = `<div class="block" style="${style} display: flex; flex-direction: column; gap: ${spacing}px;">`;
            items.forEach((item) => {
                toggleHtml += `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; overflow: hidden; position: relative; opacity: ${item.active ? 1 : 0.5}; box-shadow: ${item.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd'};">
          ${item.logo ? `<img src="${item.logo}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<div style="width: 100%; height: 100%; background: #ddd;"></div>`}
        </div>`;
            });
            toggleHtml += '</div>';
            return toggleHtml;
        default:
            return '';
    }
}
