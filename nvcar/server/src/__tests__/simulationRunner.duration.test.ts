import { connectTestDb, clearTestDb, closeTestDb } from '../test/utils'
import { SimulationRun } from '../models/SimulationRun'
import { runSimulation } from '../services/simulationRunner'

describe('runSimulation duration behavior', () => {
  beforeAll(async () => {
    await connectTestDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('waits for duration even with zero participants', async () => {
    const doc = await SimulationRun.create({
      status: 'running',
      scenario: 'mixed',
      startedAt: new Date(),
      requestedDurationSec: 2,
      teachers: 0,
      subAdmins: 0,
      sandbox: true,
      sandboxMarker: 'sandbox',
      lastMetrics: {},
    })

    const start = Date.now()
    await runSimulation({ runId: String(doc._id), baseUrl: 'http://localhost', scenario: 'mixed', durationSec: 2, teachers: 0, subAdmins: 0 })
    const elapsed = Date.now() - start

    // Expect it to take at least ~1.5s for a 2s config (allowing some scheduling variance)
    expect(elapsed).toBeGreaterThanOrEqual(1500)

    const r = await SimulationRun.findById(doc._id).lean()
    expect(r).toBeTruthy()
    expect(r?.status).toBe('completed')
  })
})
