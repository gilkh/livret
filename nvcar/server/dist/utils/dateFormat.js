"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDdMmYyyyColon = void 0;
exports.formatDdMmYyyy = formatDdMmYyyy;
function formatDdMmYyyy(dateInput) {
    if (!dateInput)
        return '';
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime()))
        return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
}
// Backward-compatible name (was previously colon-separated, now slash-separated).
exports.formatDdMmYyyyColon = formatDdMmYyyy;
