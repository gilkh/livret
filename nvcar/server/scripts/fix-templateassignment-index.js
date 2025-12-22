#!/usr/bin/env node
/*
 * Migration helper: fix legacy TemplateAssignment index issues where
 * documents lacked `completionSchoolYearId`, causing conflicts with
 * the new unique index on { templateId, studentId, completionSchoolYearId }.
 *
 * Usage:
 *  node server/scripts/fix-templateassignment-index.js --dry-run
 *  node server/scripts/fix-templateassignment-index.js --apply --auto-resolve=keep_latest
 *
 * Options:
 *  --dry-run        : (default) don't modify DB, just report
 *  --apply          : actually perform updates/deletes
 *  --auto-resolve   : conflict resolution strategy when a target slot is already occupied
 *                     options: keep_latest, keep_oldest, skip
 *  --limit=N        : only process N documents (for incremental rollout)
 *  --mongo-uri=URI  : MongoDB connection string (env MONGO_URI used if not provided)
 *
 * Notes:
 *  - Always make a DB backup first (mongodump) before running with --apply.
 *  - Run this in staging first and verify results.
 */

const mongoose = require('mongoose')
const argv = require('minimist')(process.argv.slice(2))

const MONGO_URI = argv['mongo-uri'] || process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'
const DRY_RUN = !argv.apply
const AUTO_RESOLVE = argv['auto-resolve'] || 'skip'
const LIMIT = argv.limit ? parseInt(argv.limit, 10) : null

async function main() {
  console.log('Fix TemplateAssignment index helper')
  console.log('Mongo URI:', MONGO_URI)
  console.log('Mode:', DRY_RUN ? 'dry-run' : 'apply', 'Auto-resolve:', AUTO_RESOLVE, 'Limit:', LIMIT || 'none')

  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })

  // Prefer compiled JS models if present (run in node), fall back to TS sources if using ts-node
  let TemplateAssignment
  let SchoolYear
  try {
    TemplateAssignment = require('../dist/models/TemplateAssignment').TemplateAssignment
    SchoolYear = require('../dist/models/SchoolYear').SchoolYear
  } catch (e) {
    // If not compiled, try src (requires ts-node to run TS directly)
    TemplateAssignment = require('../src/models/TemplateAssignment').TemplateAssignment
    SchoolYear = require('../src/models/SchoolYear').SchoolYear
  }

  const activeYear = await SchoolYear.findOne({ active: true }).lean()
  console.log('Active School Year:', activeYear ? `${activeYear.name} (${activeYear._id})` : 'none')

  // Helper: determine school year id for a given date
  async function findSchoolYearForDate(d) {
    if (!d) return null
    const sy = await SchoolYear.findOne({ startDate: { $lte: d }, endDate: { $gt: d } }).lean()
    if (sy) return String(sy._id)
    return null
  }

  // Find docs missing completionSchoolYearId
  const missingFilter = { $or: [{ completionSchoolYearId: { $exists: false } }, { completionSchoolYearId: null }, { completionSchoolYearId: '' }] }
  const totalMissing = await TemplateAssignment.countDocuments(missingFilter)
  console.log(`Found ${totalMissing} TemplateAssignment documents missing completionSchoolYearId`)

  let cursor = TemplateAssignment.find(missingFilter).sort({ assignedAt: -1 })
  if (LIMIT) cursor = cursor.limit(LIMIT)
  const docs = await cursor.lean()

  const conflicts = []
  const updates = []

  for (const doc of docs) {
    const assignedAt = doc.assignedAt ? new Date(doc.assignedAt) : null
    let targetYearId = null
    if (assignedAt) {
      targetYearId = await findSchoolYearForDate(assignedAt)
    }
    if (!targetYearId && activeYear) targetYearId = String(activeYear._id)

    if (!targetYearId) {
      console.warn(`Could not determine target school year for assignment ${doc._id}; skipping`)
      continue
    }

    const filter = { templateId: doc.templateId, studentId: doc.studentId, completionSchoolYearId: targetYearId }
    const existing = await TemplateAssignment.findOne(filter).lean()
    if (existing) {
      // Conflict: some document already occupies the target triple
      conflicts.push({ doc, existing, targetYearId })
    } else {
      updates.push({ doc, targetYearId })
    }
  }

  console.log(`Planned updates: ${updates.length}, conflicts: ${conflicts.length}`)

  if (DRY_RUN) {
    console.log('Dry-run mode: no changes will be applied')
    if (updates.length > 0) {
      console.log('Sample updates (first 10):')
      for (const u of updates.slice(0, 10)) {
        console.log(`  - Set completionSchoolYearId=${u.targetYearId} for assignment ${u.doc._id}`)
      }
    }
    if (conflicts.length > 0) {
      console.log('Conflicts (first 10):')
      for (const c of conflicts.slice(0, 10)) {
        console.log(`  - Doc ${c.doc._id} would target year ${c.targetYearId} but existing ${c.existing._id} occupies it`) 
      }
    }
    await mongoose.disconnect()
    process.exit(0)
  }

  // APPLY changes
  // First, apply non-conflicting updates
  for (const u of updates) {
    const { doc, targetYearId } = u
    console.log(`Updating ${doc._id} -> set completionSchoolYearId=${targetYearId}`)
    await TemplateAssignment.updateOne({ _id: doc._id }, { $set: { completionSchoolYearId: targetYearId } })
  }

  // Resolve conflicts according to strategy
  for (const c of conflicts) {
    const { doc, existing, targetYearId } = c
    console.log(`Conflict: ${doc._id} -> target ${targetYearId}, existing ${existing._id}`)
    if (AUTO_RESOLVE === 'skip') {
      console.log('  skipping (auto-resolve=skip)')
      continue
    }

    // choose winner
    let keep = null
    if (AUTO_RESOLVE === 'keep_latest') {
      const tDoc = doc.assignedAt ? new Date(doc.assignedAt) : new Date(0)
      const tExisting = existing.assignedAt ? new Date(existing.assignedAt) : new Date(0)
      keep = tDoc > tExisting ? 'doc' : 'existing'
    } else if (AUTO_RESOLVE === 'keep_oldest') {
      const tDoc = doc.assignedAt ? new Date(doc.assignedAt) : new Date(0)
      const tExisting = existing.assignedAt ? new Date(existing.assignedAt) : new Date(0)
      keep = tDoc <= tExisting ? 'doc' : 'existing'
    } else {
      console.log(`  Unknown auto-resolve strategy ${AUTO_RESOLVE}; skipping`)
      continue
    }

    if (keep === 'doc') {
      // Set completionYearId on doc then delete existing
      console.log(`  keeping doc ${doc._id} and removing existing ${existing._id}`)
      await TemplateAssignment.updateOne({ _id: doc._id }, { $set: { completionSchoolYearId: targetYearId } })
      // Move any useful fields? For now we preserve existing's data by merging shallowly
      const mergedData = Object.assign({}, existing.data || {}, doc.data || {})
      await TemplateAssignment.updateOne({ _id: doc._id }, { $set: { data: mergedData } })
      await TemplateAssignment.deleteOne({ _id: existing._id })
    } else {
      // Keep existing, delete or archive doc
      console.log(`  keeping existing ${existing._id} and removing doc ${doc._id}`)
      // Alternatively we could set completionSchoolYearId on doc to another year but safest is remove duplicate
      await TemplateAssignment.deleteOne({ _id: doc._id })
    }
  }

  console.log('Migration updates applied')

  // After all data is cleaned up, print admin commands to drop legacy index and create new one
  console.log('\n=== ADMIN COMMANDS TO RUN IN MONGO SHELL (after verifying results) ===')
  console.log('1) Verify indexes and identify legacy index name (if present):')
  console.log('   db.templateassignments.getIndexes()')
  console.log("2) If an index named 'templateId_1_studentId_1' exists, drop it (ensure you have a backup):")
  console.log("   db.templateassignments.dropIndex('templateId_1_studentId_1')")
  console.log('   OR drop by spec: db.templateassignments.dropIndex({ templateId:1, studentId:1 })')
  console.log('3) Create the new unique index scoped to completionSchoolYearId:')
  console.log("   db.templateassignments.createIndex({ templateId:1, studentId:1, completionSchoolYearId:1 }, { unique: true })")
  console.log('4) Optionally rebuild indexes / run db.collection.reIndex() if desired')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error('Migration error:', err)
  process.exit(1)
})
