/// <reference path="../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')

import { connectTestDb, clearTestDb, closeTestDb } from '../test/utils'
import { createApp } from '../app'
import { User } from '../models/User'
import { signToken } from '../auth'

let app: any

describe('Simulations sandbox guard', () => {
  beforeAll(async () => {
    await connectTestDb()
    app = createApp()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
    delete process.env.SIMULATION_SANDBOX
    delete process.env.SIMULATION_SANDBOX_MARKER
  })

  it('should refuse start when SIMULATION_SANDBOX is not enabled', async () => {
    const admin = await User.create({ email: 'admin-sim@test.com', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const res = await request(app)
      .post('/simulations/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ teachers: 1, subAdmins: 1, durationSec: 10, scenario: 'mixed' })

    // Sandbox server is not running in test environment - expect 409
    expect(res.status).toBe(409)
    expect(res.body?.error).toBe('sandbox_server_not_running')
  })

  it('should allow start when SIMULATION_SANDBOX is enabled (test DB)', async () => {
    process.env.SIMULATION_SANDBOX = 'true'

    const admin = await User.create({ email: 'admin-sim2@test.com', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const res = await request(app)
      .post('/simulations/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ teachers: 0, subAdmins: 0, durationSec: 10, scenario: 'mixed' })

    expect(res.status).toBe(200)
    expect(res.body?.ok).toBe(true)
    expect(typeof res.body?.runId).toBe('string')
  })
})
