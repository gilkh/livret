/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import express from 'express'
import bodyParser from 'body-parser'
import { backupRouter } from '../../routes/backup'
import { User } from '../../models/User'
import { Level } from '../../models/Level'
import mongoose from 'mongoose'
import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'

jest.setTimeout(60000)

let app: any

describe('backup & restore', () => {
  beforeAll(async () => {
    await connectTestDb()
    app = express()
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true }))
    app.use('/backup', backupRouter)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('does not hardcode the wrong DB name (fix nvcarn typo)', async () => {
    // Ensure source does not contain the old typo string "nvcarn"
    const backupSource = fs.readFileSync(path.join(process.cwd(), 'src', 'routes', 'backup.ts'), 'utf8')
    expect(backupSource).not.toContain("mongoimport --db nvcarn")

    // Ensure computed DB name is available and non-empty
    const dbName = mongoose.connection?.db?.databaseName || process.env.MONGO_DB_NAME || 'nvcar'
    expect(typeof dbName).toBe('string')
    expect(dbName.length).toBeGreaterThan(0)
  })

  it('creates a backup with /backup/create and restores it with /backup/restore/:filename', async () => {
    const admin = await User.create({ email: 'admin-backup2', role: 'ADMIN', displayName: 'Admin Backup2', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    // Create a sample level
    await Level.create({ name: 'TESTLVL_RESTORE', order: 999 })
    expect(await Level.countDocuments({ name: 'TESTLVL_RESTORE' })).toBe(1)

    // Create backup stored on server
    const createRes = await request(app).post('/backup/create').set('Authorization', `Bearer ${token}`)
    expect(createRes.status).toBe(200)
    expect(createRes.body.filename).toBeDefined()
    const filename = createRes.body.filename as string
    const backupPath = path.join(process.cwd(), 'backups', filename)
    expect(fs.existsSync(backupPath)).toBe(true)

    // Remove the data
    await Level.deleteMany({ name: 'TESTLVL_RESTORE' })
    expect(await Level.countDocuments({ name: 'TESTLVL_RESTORE' })).toBe(0)

    // Restore
    const restoreRes = await request(app).post(`/backup/restore/${filename}`).set('Authorization', `Bearer ${token}`)
    expect(restoreRes.status).toBe(200)

    // Verify restored
    expect(await Level.countDocuments({ name: 'TESTLVL_RESTORE' })).toBeGreaterThanOrEqual(1)

    // Cleanup backup file
    try { fs.unlinkSync(backupPath) } catch (e) { }
  })
})
