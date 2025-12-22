#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2))
const mongoose = require('mongoose')

const MONGO_URI = argv['mongo-uri'] || process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'
const CONFIRM = argv.confirm === true || argv.confirm === 'true'

async function main() {
  console.log('Index admin script')
  console.log('Mongo URI:', MONGO_URI)
  console.log('Confirm:', CONFIRM)

  await mongoose.connect(MONGO_URI)
  let TemplateAssignment
  try {
    TemplateAssignment = require('../dist/models/TemplateAssignment').TemplateAssignment
  } catch (e) {
    TemplateAssignment = require('../src/models/TemplateAssignment').TemplateAssignment
  }

  const coll = TemplateAssignment.collection

  console.log('Current indexes:')
  const indexes = await coll.indexes()
  console.log(JSON.stringify(indexes, null, 2))

  // Detect legacy index
  const legacyByName = indexes.find(ix => ix.name === 'templateId_1_studentId_1')
  const legacyBySpec = indexes.find(ix => ix.key && ix.key.templateId === 1 && ix.key.studentId === 1 && Object.keys(ix.key).length === 2)
  const legacy = legacyByName || legacyBySpec

  if (!legacy) {
    console.log('No legacy index found (on templateId + studentId) — nothing to drop')
  } else {
    console.log('Found legacy index:', JSON.stringify(legacy, null, 2))
    if (!CONFIRM) {
      console.log('\nDry-run: to actually drop the legacy index and create new one, re-run with --confirm')
      await mongoose.disconnect()
      return
    }

    // Drop legacy index
    try {
      if (legacy.name) {
        console.log(`Dropping index by name: ${legacy.name}`)
        await coll.dropIndex(legacy.name)
      } else {
        console.log(`Dropping index by spec: ${JSON.stringify(legacy.key)}`)
        await coll.dropIndex(legacy.key)
      }
      console.log('Dropped legacy index')
    } catch (e) {
      console.error('Error dropping legacy index:', e.message)
      await mongoose.disconnect()
      process.exit(1)
    }
  }

  // Create new unique index
  try {
    console.log('Creating new unique index { templateId:1, studentId:1, completionSchoolYearId:1 }')
    await coll.createIndex({ templateId: 1, studentId: 1, completionSchoolYearId: 1 }, { unique: true })
    console.log('Created new unique index')
  } catch (e) {
    console.error('Error creating index:', e.message)
    await mongoose.disconnect()
    process.exit(1)
  }

  const finalIndexes = await coll.indexes()
  console.log('Final indexes:')
  console.log(JSON.stringify(finalIndexes, null, 2))

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})
