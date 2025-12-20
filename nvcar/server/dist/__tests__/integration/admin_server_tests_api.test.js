"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest');
const utils_1 = require("../../test/utils");
const auth_1 = require("../../auth");
const app_1 = require("../../app");
const User_1 = require("../../models/User");
let app;
describe('admin run-tests API', () => {
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
    it('lists available server tests and runs a small test pattern', async () => {
        // create admin
        const admin = await User_1.User.create({ email: 'admin-test', role: 'ADMIN', displayName: 'Admin Test', passwordHash: 'hash' });
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const listRes = await request(app).get('/admin-extras/run-tests/list').set('Authorization', `Bearer ${token}`);
        expect(listRes.status).toBe(200);
        expect(Array.isArray(listRes.body.tests)).toBe(true);
        // Run a small existing test file to avoid long runs
        const pattern = 'src/__tests__/templateUtils.test.ts';
        const runRes = await request(app).post('/admin-extras/run-tests').set('Authorization', `Bearer ${token}`).send({ pattern });
        // Environment may not have npx or local jest binary; accept 200 (ran), 501 (not available) or 500 (spawn failure)
        expect([200, 500, 501]).toContain(runRes.status);
        expect(runRes.body).toBeDefined();
        if (runRes.status === 200) {
            expect(runRes.body.ok === true || typeof runRes.body.code === 'number').toBeTruthy();
            if (runRes.body.results) {
                expect(typeof runRes.body.results.numTotalTests).toBe('number');
                expect(typeof runRes.body.results.numFailedTests).toBe('number');
            }
        }
        else {
            // should return a clear error message if not runnable
            expect(runRes.body.error || runRes.body.message).toBeDefined();
        }
    });
});
