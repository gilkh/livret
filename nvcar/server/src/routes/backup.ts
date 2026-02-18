import { Router } from 'express'
import { requireAuth } from '../auth'
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { randomUUID } from 'crypto'
import os from 'os'
import JSZip from 'jszip'
import { User } from '../models/User'
import * as bcrypt from 'bcryptjs'
import { Level } from '../models/Level'
import { logAudit } from '../utils/auditLogger'
import { ErrorLog } from '../models/ErrorLog'

export const backupRouter = Router()

type RestoreMode = 'destructive' | 'safe'

type RestoreDrillIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
  modelName?: string
  fileName?: string
}

const BACKUP_DIR = path.join(process.cwd(), 'backups')
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

const clearDatabase = async () => {
  const models = mongoose.modelNames()
  for (const modelName of models) {
    const Model = mongoose.model(modelName)
    await Model.deleteMany({})
  }
}

const readBackupPayload = async (zipContents: JSZip, modelNames: string[]) => {
  const payload = new Map<string, any[]>()

  for (const modelName of modelNames) {
    const file = zipContents.file(`${modelName}.json`)
    if (!file) {
      payload.set(modelName, [])
      continue
    }

    const content = await file.async('string')
    const docs = JSON.parse(content)
    if (!Array.isArray(docs)) {
      throw new Error(`Invalid backup format for ${modelName}: expected JSON array`)
    }
    payload.set(modelName, docs)
  }

  return payload
}

const readCurrentDatabasePayload = async (modelNames: string[]) => {
  const payload = new Map<string, any[]>()
  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName)
    const docs = await Model.find({}).lean()
    payload.set(modelName, docs)
  }
  return payload
}

const applyPayloadDestructive = async (payload: Map<string, any[]>, modelNames: string[]) => {
  await clearDatabase()

  for (const modelName of modelNames) {
    const docs = payload.get(modelName) || []
    if (docs.length > 0) {
      const Model = mongoose.model(modelName)
      await Model.insertMany(docs)
    }
  }
}

const getRestoreMode = (req: any): RestoreMode | null => {
  const rawMode = String(req?.body?.mode || req?.body?.restoreMode || req?.query?.mode || 'destructive').toLowerCase()
  if (rawMode === 'destructive' || rawMode === 'safe') return rawMode
  return null
}

const createBackupAlert = async (req: any, message: string, details: Record<string, any>, status = 500) => {
  const userInfo = req?.user || {}
  const userId = String(userInfo.userId || userInfo.actualUserId || 'system')
  const role = String(userInfo.role || userInfo.actualRole || 'ADMIN')

  await ErrorLog.create({
    userId,
    role,
    actualUserId: userInfo.actualUserId,
    actualRole: userInfo.actualRole,
    displayName: userInfo.displayName,
    email: userInfo.email,
    source: 'restore-drill',
    method: 'POST',
    url: '/backup/drill/:filename',
    status,
    message,
    details,
  })
}

const runRestoreDrill = async (filePath: string, modelNames: string[]) => {
  const issues: RestoreDrillIssue[] = []
  const fileContent = fs.readFileSync(filePath)
  const jszip = new JSZip()
  const zipContents = await jszip.loadAsync(fileContent)

  const jsonEntries = Object.keys(zipContents.files).filter(name => name.toLowerCase().endsWith('.json'))

  if (jsonEntries.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no_json_files',
      message: 'Backup archive contains no JSON collection files.',
    })
  }

  for (const modelName of modelNames) {
    const fileName = `${modelName}.json`
    const modelFile = zipContents.file(fileName)
    if (!modelFile) {
      issues.push({
        severity: 'error',
        code: 'missing_model_file',
        message: `Missing backup payload for model ${modelName}.`,
        modelName,
        fileName,
      })
      continue
    }

    try {
      const content = await modelFile.async('string')
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed)) {
        issues.push({
          severity: 'error',
          code: 'invalid_model_payload',
          message: `Expected array payload for model ${modelName}.`,
          modelName,
          fileName,
        })
      }
    } catch (error: any) {
      issues.push({
        severity: 'error',
        code: 'invalid_json',
        message: `Invalid JSON for model ${modelName}: ${error?.message || 'Unknown parse error'}`,
        modelName,
        fileName,
      })
    }
  }

  return {
    filesScanned: jsonEntries.length,
    modelCount: modelNames.length,
    issues,
    passed: issues.length === 0,
    summary: {
      errors: issues.filter(issue => issue.severity === 'error').length,
      warnings: issues.filter(issue => issue.severity === 'warning').length,
    }
  }
}

// List available backups
backupRouter.get('/list', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip'))
    const backups = files.map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f))
      return {
        name: f,
        size: stats.size,
        date: stats.mtime
      }
    }).sort((a, b) => b.date.getTime() - a.date.getTime())
    res.json(backups)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to list backups' })
  }
})

// Create new DB backup (stored on server)
backupRouter.post('/create', requireAuth(['ADMIN']), async (req, res) => {
  const tempDir = path.join(os.tmpdir(), `nvcar-db-backup-${randomUUID()}`)
  const fileName = `backup-db-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  const archivePath = path.join(BACKUP_DIR, fileName)

  try {
    fs.mkdirSync(tempDir, { recursive: true })

    const models = mongoose.modelNames()
    for (const modelName of models) {
      const Model = mongoose.model(modelName)
      const docs = await Model.find({}).lean()
      fs.writeFileSync(
        path.join(tempDir, `${modelName}.json`),
        JSON.stringify(docs, null, 2)
      )
    }

    const output = fs.createWriteStream(archivePath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    const adminId = (req as any).user?.userId

    output.on('close', async () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch (e) { }

      // Log the backup creation
      await logAudit({
        userId: adminId,
        action: 'CREATE_BACKUP',
        details: {
          filename: fileName,
          modelsBackedUp: models.length
        },
        req
      })

      res.json({ success: true, filename: fileName })
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)
    archive.directory(tempDir, false)
    await archive.finalize()

  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Backup creation failed' })
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch (e) { }
  }
})

// Restore backup
backupRouter.post('/restore/:filename', requireAuth(['ADMIN']), async (req, res) => {
  const { filename } = req.params
  const filePath = path.join(BACKUP_DIR, filename)
  const mode = getRestoreMode(req)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' })
  }

  if (!mode) {
    return res.status(400).json({ error: 'Invalid restore mode. Use destructive or safe.' })
  }

  try {
    const fileContent = fs.readFileSync(filePath)
    const jszip = new JSZip()
    const zipContents = await jszip.loadAsync(fileContent)
    const models = mongoose.modelNames()
    const backupPayload = await readBackupPayload(zipContents, models)

    let rollbackPerformed = false

    if (mode === 'destructive') {
      await applyPayloadDestructive(backupPayload, models)
    } else {
      const preRestorePayload = await readCurrentDatabasePayload(models)

      try {
        await applyPayloadDestructive(backupPayload, models)
      } catch (restoreError) {
        try {
          await applyPayloadDestructive(preRestorePayload, models)
          rollbackPerformed = true
        } catch (rollbackError) {
          const combinedError = new Error(`Safe restore failed and rollback failed: restore=${(restoreError as any)?.message || restoreError}; rollback=${(rollbackError as any)?.message || rollbackError}`)
          ;(combinedError as any).rollbackFailed = true
          throw combinedError
        }

        const wrappedError = new Error(`Safe restore failed. Original data was restored. Cause: ${(restoreError as any)?.message || restoreError}`)
        ;(wrappedError as any).rollbackPerformed = true
        throw wrappedError
      }
    }

    // Log the restore
    const adminId = (req as any).user?.userId
    await logAudit({
      userId: adminId,
      action: 'RESTORE_BACKUP',
      details: {
        filename,
        modelsRestored: models.length,
        mode,
        rollbackPerformed
      },
      req
    })

    res.json({ success: true, mode, rollbackPerformed })

  } catch (e) {
    console.error('Restore error:', e)
    const rollbackPerformed = Boolean((e as any)?.rollbackPerformed)
    const rollbackFailed = Boolean((e as any)?.rollbackFailed)
    res.status(500).json({
      error: 'Restore failed',
      message: (e as any)?.message || 'Unknown restore error',
      rollbackPerformed,
      rollbackFailed
    })
  }
})

backupRouter.post('/drill/:filename', requireAuth(['ADMIN']), async (req, res) => {
  const { filename } = req.params
  const filePath = path.join(BACKUP_DIR, filename)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' })
  }

  try {
    const models = mongoose.modelNames()
    const drillResult = await runRestoreDrill(filePath, models)
    const adminId = (req as any).user?.userId

    await logAudit({
      userId: adminId,
      action: 'RESTORE_DRILL',
      details: {
        filename,
        passed: drillResult.passed,
        errors: drillResult.summary.errors,
        warnings: drillResult.summary.warnings,
      },
      req
    })

    if (!drillResult.passed) {
      await createBackupAlert(
        req,
        `Restore drill failed for backup ${filename}`,
        {
          filename,
          summary: drillResult.summary,
          firstIssues: drillResult.issues.slice(0, 10),
        },
        422
      )
    }

    res.json({
      filename,
      executedAt: new Date().toISOString(),
      ...drillResult,
    })
  } catch (error: any) {
    console.error('Restore drill failed:', error)
    try {
      await createBackupAlert(req, `Restore drill execution failed for backup ${filename}`, {
        filename,
        error: error?.message || 'Unexpected restore drill error',
      })
    } catch (logError) {
      console.error('Restore drill alert failed:', logError)
    }

    res.status(500).json({ error: 'restore_drill_failed', message: error?.message || 'Unexpected restore drill error' })
  }
})

// Empty database
backupRouter.post('/empty', requireAuth(['ADMIN']), async (req, res) => {
  try {
    // Preserve only: default admin (email: 'admin') and Microsoft-authenticated admin accounts
    const adminUsersToKeep = await User.find({
      role: 'ADMIN',
      $or: [
        { email: 'admin' },
        { authProvider: 'microsoft' }
      ]
    }).lean()

    await clearDatabase()

    // Restore preserved admins
    if (adminUsersToKeep.length > 0) {
      await User.insertMany(adminUsersToKeep)
    } else {
      // Fallback: create default admin if none preserved
      const hash = await bcrypt.hash('admin', 10)
      await User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' })
    }

    // Re-seed default levels
    await Level.insertMany([
      { name: 'PS', order: 1 },
      { name: 'MS', order: 2 },
      { name: 'GS', order: 3 },
    ])

    // Log the database empty operation
    const adminId = (req as any).user?.userId
    if (adminId) {
      await logAudit({
        userId: adminId,
        action: 'EMPTY_DATABASE',
        details: {
          adminsPreserved: adminUsersToKeep.length,
          levelsReseeded: true
        },
        req
      })
    }

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Empty DB failed' })
  }
})

// Delete backup
backupRouter.delete('/:filename', requireAuth(['ADMIN']), async (req, res) => {
  const { filename } = req.params
  const filePath = path.join(BACKUP_DIR, filename)

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath)
      res.json({ success: true })
    } catch (e) {
      res.status(500).json({ error: 'Delete failed' })
    }
  } else {
    res.status(404).json({ error: 'File not found' })
  }
})

backupRouter.get('/full', requireAuth(['ADMIN']), async (req, res) => {
  const tempDir = path.join(os.tmpdir(), `nvcar-backup-${randomUUID()}`)
  const archivePath = path.join(tempDir, 'backup.zip')

  try {
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // 1. Dump Database
    const dbDir = path.join(tempDir, 'db')
    fs.mkdirSync(dbDir)

    const models = mongoose.modelNames()
    for (const modelName of models) {
      const Model = mongoose.model(modelName)
      const docs = await Model.find({}).lean()
      fs.writeFileSync(
        path.join(dbDir, `${modelName}.json`),
        JSON.stringify(docs, null, 2)
      )
    }

    // Create restore batch file
    const dbNameForRestore = mongoose.connection?.db?.databaseName || process.env.MONGO_DB_NAME || 'nvcar'
    const restoreScript = `@echo off
    echo Restoring database '${dbNameForRestore}' from JSON files in this folder...
    echo.

    where mongoimport >nul 2>nul
    if %errorlevel% neq 0 (
        echo Error: mongoimport not found in PATH.
        echo Please install MongoDB Database Tools.
        pause
        exit /b
    )

    for %%f in (*.json) do (
        echo Importing %%~nf...
        mongoimport --db ${dbNameForRestore} --collection %%~nf --file "%%f" --jsonArray --drop
    )

echo.
echo Restore completed!
pause
`
    fs.writeFileSync(path.join(dbDir, 'restore_db.bat'), restoreScript)

    // 2. Prepare Archive
    const output = fs.createWriteStream(archivePath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      res.download(archivePath, `nvcar-full-backup-${new Date().toISOString().split('T')[0]}.zip`, (err) => {
        // Cleanup
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
          console.error('Error cleaning up backup temp dir:', e)
        }
      })
    })

    archive.on('error', (err: any) => {
      throw err
    })

    archive.pipe(output)

    // Add DB dump
    archive.directory(dbDir, 'database')

    // Add Source Code
    // Assuming process.cwd() is nvcar/server
    const serverDir = process.cwd()
    const clientDir = path.resolve(serverDir, '../client')
    const rootDir = path.resolve(serverDir, '..') // nvcar folder

    // Add Server (excluding node_modules, dist, .git)
    // We include public/uploads to ensure full restoration
    archive.directory(serverDir, 'server', (entry: any) => {
      if (entry.name.includes('node_modules') ||
        entry.name.includes('dist') ||
        entry.name.includes('.git')) {
        return false
      }
      return entry
    })

    // Add Client (excluding node_modules, dist, .git)
    archive.directory(clientDir, 'client', (entry: any) => {
      if (entry.name.includes('node_modules') ||
        entry.name.includes('dist') ||
        entry.name.includes('build') ||
        entry.name.includes('.git')) {
        return false
      }
      return entry
    })

    // Add root files (like start_app.bat)
    const rootFiles = fs.readdirSync(rootDir).filter(f => fs.statSync(path.join(rootDir, f)).isFile())
    rootFiles.forEach(f => {
      archive.file(path.join(rootDir, f), { name: f })
    })

    // Add root directories (like certs/, backups/, etc.)
    const rootDirs = fs.readdirSync(rootDir)
      .filter(name => {
        const full = path.join(rootDir, name)
        if (!fs.existsSync(full)) return false
        if (!fs.statSync(full).isDirectory()) return false
        if (name === 'server' || name === 'client') return false
        if (name === 'node_modules' || name === '.git') return false
        return true
      })

    rootDirs.forEach(dirName => {
      archive.directory(path.join(rootDir, dirName), dirName, (entry: any) => {
        if (entry.name.includes('node_modules') ||
          entry.name.includes('dist') ||
          entry.name.includes('build') ||
          entry.name.includes('.git')) {
          return false
        }
        return entry
      })
    })

    await archive.finalize()

  } catch (err) {
    console.error('Backup error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Backup failed' })
    }
    // Cleanup on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch (e) { }
  }
})
