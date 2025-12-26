"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest');
const utils_1 = require("../test/utils");
const app_1 = require("../app");
const User_1 = require("../models/User");
const auth_1 = require("../auth");
let app;
describe('Simulations sandbox guard', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
        app = (0, app_1.createApp)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
        delete process.env.SIMULATION_SANDBOX;
        delete process.env.SIMULATION_SANDBOX_MARKER;
    });
    it('should refuse start when SIMULATION_SANDBOX is not enabled', async () => {
        const admin = await User_1.User.create({ email: 'admin-sim@test.com', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const res = await request(app)
            .post('/simulations/start')
            .set('Authorization', `Bearer ${token}`)
            .send({ teachers: 1, subAdmins: 1, durationSec: 10, scenario: 'mixed' });
        expect(res.status).toBe(403);
        expect(res.body?.error).toBe('simulation_not_allowed');
    });
    it('should allow start when SIMULATION_SANDBOX is enabled (test DB)', async () => {
        process.env.SIMULATION_SANDBOX = 'true';
        const admin = await User_1.User.create({ email: 'admin-sim2@test.com', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const res = await request(app)
            .post('/simulations/start')
            .set('Authorization', `Bearer ${token}`)
            .send({ teachers: 0, subAdmins: 0, durationSec: 10, scenario: 'mixed' });
        expect(res.status).toBe(200);
        expect(res.body?.ok).toBe(true);
        expect(typeof res.body?.runId).toBe('string');
    });
});
