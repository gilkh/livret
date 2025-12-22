// One-off migration script to set completionSchoolYearId on TemplateAssignment
// Usage: npx ts-node scripts/migrate-set-assignment-years.ts
import mongoose from 'mongoose'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { SchoolYear } from '../models/SchoolYear'

async function run() {
  await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/nvcar')
  const active = await SchoolYear.findOne({ active: true }).lean()
  if (!active) {
    console.error('No active school year found; aborting migration')
    process.exit(1)
  }
  const res = await TemplateAssignment.updateMany({ $or: [{ completionSchoolYearId: { $exists: false } }, { completionSchoolYearId: null }] }, { $set: { completionSchoolYearId: String(active._id) } })
  console.log('Updated assignments:', res.modifiedCount)
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })