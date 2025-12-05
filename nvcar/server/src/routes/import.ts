import { Router } from 'express'
import { requireAuth } from '../auth'
import { ClassModel } from '../models/Class'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { CsvImportJob } from '../models/CsvImportJob'
import { parse } from 'csv-parse/sync'
import { checkAndAssignTemplates } from '../utils/templateUtils'

export const importRouter = Router()

importRouter.post('/students', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { csv, schoolYearId, dryRun, mapping } = req.body
  if (!csv || !schoolYearId) return res.status(400).json({ error: 'missing_payload' })
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true })
  let added = 0, updated = 0, errorCount = 0
  const report: any[] = []
  for (const r of records) {
    try {
      const col = (k: string, def: string) => r[(mapping && mapping[k]) || def]
      const firstName = col('firstName','FirstName')
      const lastName = col('lastName','LastName')
      const dob = new Date(col('dateOfBirth','DateOfBirth'))
      const className = col('className','ClassName')
      const parentName = col('parentName','ParentName')
      const parentPhone = col('parentPhone','ParentPhone')
      const key = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${dob.toISOString().slice(0,10)}`
      const existing = await Student.findOne({ logicalKey: key })
      let student
      if (existing) {
        student = await Student.findByIdAndUpdate(existing._id, { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, { new: true })
        updated += 1
      } else {
        student = await Student.create({ logicalKey: key, firstName, lastName, dateOfBirth: dob, parentName, parentPhone })
        added += 1
      }
      let cls = await ClassModel.findOne({ name: className, schoolYearId })
      if (!cls) {
        cls = await ClassModel.create({ name: className, schoolYearId })
      }
      const enrollmentExists = await Enrollment.findOne({ studentId: String(student!._id), classId: String(cls!._id), schoolYearId })
      if (!enrollmentExists) {
        await Enrollment.create({ studentId: String(student!._id), classId: String(cls!._id), schoolYearId })
        if (cls && cls.level) {
          await checkAndAssignTemplates(String(student!._id), cls.level, schoolYearId, String(cls._id), (req as any).user.userId)
        }
      }
      report.push({ status: existing ? 'updated' : 'added', studentId: String(student!._id), classId: String(cls!._id) })
    } catch (e: any) {
      errorCount++
      report.push({ status: 'error', message: e.message })
    }
  }
  const summary = `${added} élèves ajoutés — ${updated} mis à jour — ${errorCount} en erreur`
  if (!dryRun) {
    await CsvImportJob.create({ addedCount: added, updatedCount: updated, errorCount, reportJson: JSON.stringify(report) })
  }
  res.json({ added, updated, errorCount, report, summary })
})
