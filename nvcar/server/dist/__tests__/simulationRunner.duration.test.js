"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../test/utils");
const SimulationRun_1 = require("../models/SimulationRun");
const simulationRunner_1 = require("../services/simulationRunner");
describe('runSimulation duration behavior', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('waits for duration even with zero participants', async () => {
        const doc = await SimulationRun_1.SimulationRun.create({
            status: 'running',
            scenario: 'mixed',
            startedAt: new Date(),
            requestedDurationSec: 2,
            teachers: 0,
            subAdmins: 0,
            sandbox: true,
            sandboxMarker: 'sandbox',
            lastMetrics: {},
        });
        const start = Date.now();
        await (0, simulationRunner_1.runSimulation)({ runId: String(doc._id), baseUrl: 'http://localhost', scenario: 'mixed', durationSec: 2, teachers: 0, subAdmins: 0 });
        const elapsed = Date.now() - start;
        // Expect it to take at least ~1.5s for a 2s config (allowing some scheduling variance)
        expect(elapsed).toBeGreaterThanOrEqual(1500);
        const r = await SimulationRun_1.SimulationRun.findById(doc._id).lean();
        expect(r).toBeTruthy();
        expect(r?.status).toBe('completed');
    });
});
