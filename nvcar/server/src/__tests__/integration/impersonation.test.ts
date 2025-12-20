/// <reference path="../../test/types.d.ts" />
import request from 'supertest'
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import { createApp } from '../../app'
import { User } from '../../models/User'

let app: any

describe('impersonation integration', () => {
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

  it('allows admin to impersonate non-admin and stop impersonation', async () => {
    const admin = await User.create({ email: 'admin-test', role: 'ADMIN', displayName: 'Admin Test', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'teacher-test', role: 'TEACHER', displayName: 'Teacher Test', passwordHash: 'hash' })

    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const startRes = await request(app).post('/impersonation/start').set('Authorization', `Bearer ${token}`).send({ targetUserId: String(teacher._id) })
    expect(startRes.status).toBe(200)
    expect(startRes.body.token).toBeDefined()
    expect(startRes.body.impersonatedUser).toBeDefined()

    const impersonationToken = startRes.body.token

    // Check status with impersonated token
    const statusRes = await request(app).get('/impersonation/status').set('Authorization', `Bearer ${impersonationToken}`)
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.isImpersonating).toBe(true)
    expect(statusRes.body.impersonatedUser.role).toBe('TEACHER')

    // Stop impersonation
    const stopRes = await request(app).post('/impersonation/stop').set('Authorization', `Bearer ${impersonationToken}`).send()
    expect(stopRes.status).toBe(200)
    expect(stopRes.body.token).toBeDefined()
  })
})
