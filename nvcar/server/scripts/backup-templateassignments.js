#!/usr/bin/env node
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')
const mongoose = require('mongoose')
const argv = require('minimist')(process.argv.slice(2))

const MONGO_URI = argv['mongo-uri'] || process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'

async function main() {
  console.log('Backing up TemplateAssignment collection (JSON gzip)')
  await mongoose.connect(MONGO_URI)
  let TemplateAssignment
  try {
    TemplateAssignment = require('../dist/models/TemplateAssignment').TemplateAssignment
  } catch (e) {
    TemplateAssignment = require('../src/models/TemplateAssignment').TemplateAssignment
  }

  const docs = await TemplateAssignment.find({}).lean()
  const outDir = path.join(__dirname, '../../backups')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(outDir, `templateassignments-backup-${ts}.json.gz`)
  const gz = zlib.createGzip()
  const ws = fs.createWriteStream(outPath)
  gz.pipe(ws)
  gz.write(JSON.stringify(docs))
  gz.end()
  await new Promise((res, rej) => ws.on('close', res).on('error', rej))
  console.log('Backup written to', outPath)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
