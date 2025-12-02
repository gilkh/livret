import { Router } from 'express'
import { requireAuth } from '../auth'
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'

export const backupRouter = Router()

backupRouter.get('/full', requireAuth(['ADMIN']), async (req, res) => {
  const tempDir = path.join(os.tmpdir(), `nvcar-backup-${uuidv4()}`)
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
    const restoreScript = `@echo off
echo Restoring database 'nvcarn' from JSON files in this folder...
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
    mongoimport --db nvcarn --collection %%~nf --file "%%f" --jsonArray --drop
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
    } catch (e) {}
  }
})
