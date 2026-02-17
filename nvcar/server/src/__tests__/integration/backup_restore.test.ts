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

  it('rejects invalid restore mode', async () => {
    const admin = await User.create({ email: 'admin-invalid-mode', role: 'ADMIN', displayName: 'Admin Invalid', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const zip = new JSZip()
    zip.file('Level.json', JSON.stringify([], null, 2))
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const backupName = `invalid-mode-${Date.now()}.zip`
    const backupPath = path.join(process.cwd(), 'backups', backupName)
    fs.writeFileSync(backupPath, zipBuffer)

    try {
      const res = await request(app)
        .post(`/backup/restore/${backupName}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mode: 'invalid-mode' })

      expect(res.status).toBe(400)
      expect(String(res.body.error || '')).toContain('Invalid restore mode')
    } finally {
      try { fs.unlinkSync(backupPath) } catch (e) { }
    }
  })

  it('safe restore rolls back to original data when restore payload is invalid', async () => {
    const admin = await User.create({ email: 'admin-safe-rollback', role: 'ADMIN', displayName: 'Admin Safe Rollback', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    await Level.create({ name: 'SAFE_KEEP', order: 777 })
    expect(await Level.countDocuments({ name: 'SAFE_KEEP' })).toBe(1)

    const zip = new JSZip()
    zip.file('User.json', JSON.stringify([{ email: 'broken-user-without-password', role: 'ADMIN', displayName: 'Broken User' }], null, 2))
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const badBackupName = `bad-safe-restore-${Date.now()}.zip`
    const badBackupPath = path.join(process.cwd(), 'backups', badBackupName)
    fs.writeFileSync(badBackupPath, zipBuffer)

    try {
      const restoreRes = await request(app)
        .post(`/backup/restore/${badBackupName}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mode: 'safe' })

      expect(restoreRes.status).toBe(500)
      expect(restoreRes.body.rollbackPerformed).toBe(true)

      const kept = await Level.countDocuments({ name: 'SAFE_KEEP' })
      expect(kept).toBe(1)
    } finally {
      try { fs.unlinkSync(badBackupPath) } catch (e) { }
    }
  })
})
