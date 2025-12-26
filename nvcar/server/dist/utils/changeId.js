"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChangeId = void 0;
const generateChangeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
exports.generateChangeId = generateChangeId;
