const mongoose = require('mongoose')
const argv = require('minimist')(process.argv.slice(2))
const MONGO_URI = argv['mongo-uri'] || process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'

async function main() {
  await mongoose.connect(MONGO_URI)
  const TemplateAssignment = require('../dist/models/TemplateAssignment').TemplateAssignment
  // Find recent assignments with smoke marker
  const recent = await TemplateAssignment.find({ 'data.smoke': true }).lean()
  console.log('Assignments with smoke marker:', recent.length)
  if (recent.length) console.log(recent)

  // List assignments for a sample tpl/student from recent history
  const all = await TemplateAssignment.find({}).sort({ assignedAt: -1 }).limit(50).lean()
  console.log('Latest 50 assignments:')
  for (const a of all) console.log(a._id, a.templateId, a.studentId, a.completionSchoolYearId)
  await mongoose.disconnect()
}

main().catch(e=>{console.error(e); process.exit(1)})