"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
const supertest_1 = __importDefault(require("supertest"));
const utils_1 = require("../../test/utils");
const auth_1 = require("../../auth");
const app_1 = require("../../app");
const User_1 = require("../../models/User");
let app;
describe('impersonation integration', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
        app = (0, app_1.createApp)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('allows admin to impersonate non-admin and stop impersonation', async () => {
        const admin = await User_1.User.create({ email: 'admin-test', role: 'ADMIN', displayName: 'Admin Test', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'teacher-test', role: 'TEACHER', displayName: 'Teacher Test', passwordHash: 'hash' });
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const startRes = await (0, supertest_1.default)(app).post('/impersonation/start').set('Authorization', `Bearer ${token}`).send({ targetUserId: String(teacher._id) });
        expect(startRes.status).toBe(200);
        expect(startRes.body.token).toBeDefined();
        expect(startRes.body.impersonatedUser).toBeDefined();
        const impersonationToken = startRes.body.token;
        // Check status with impersonated token
        const statusRes = await (0, supertest_1.default)(app).get('/impersonation/status').set('Authorization', `Bearer ${impersonationToken}`);
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.isImpersonating).toBe(true);
        expect(statusRes.body.impersonatedUser.role).toBe('TEACHER');
        // Stop impersonation
        const stopRes = await (0, supertest_1.default)(app).post('/impersonation/stop').set('Authorization', `Bearer ${impersonationToken}`).send();
        expect(stopRes.status).toBe(200);
        expect(stopRes.body.token).toBeDefined();
    });
});
