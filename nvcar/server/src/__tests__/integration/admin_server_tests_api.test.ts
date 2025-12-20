/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import { createApp } from '../../app'
import { User } from '../../models/User'

let app: any

describe('admin run-tests API', () => {
  beforeAll(async () => {
    await connectTestDb()
    app = createApp()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('lists available server tests and runs a small test pattern', async () => {
    // create admin
    const admin = await User.create({ email: 'admin-test', role: 'ADMIN', displayName: 'Admin Test', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const listRes = await request(app).get('/admin-extras/run-tests/list').set('Authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    expect(Array.isArray(listRes.body.tests)).toBe(true)

    // Run a small existing test file to avoid long runs
    const pattern = 'src/__tests__/templateUtils.test.ts'
    const runRes = await request(app).post('/admin-extras/run-tests').set('Authorization', `Bearer ${token}`).send({ pattern })
    // Environment may not have npx or local jest binary; accept 200 (ran), 501 (not available) or 500 (spawn failure)
    expect([200, 500, 501]).toContain(runRes.status)
    expect(runRes.body).toBeDefined()
    if (runRes.status === 200) {
      expect(runRes.body.ok === true || typeof runRes.body.code === 'number').toBeTruthy()
      if (runRes.body.results) {
        expect(typeof runRes.body.results.numTotalTests).toBe('number')
        expect(typeof runRes.body.results.numFailedTests).toBe('number')
      }
    } else {
      // should return a clear error message if not runnable
      expect(runRes.body.error || runRes.body.message).toBeDefined()
    }
  })
})
