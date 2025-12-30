import { Router } from 'express'
import { requireAuth } from '../auth'
import { ClassModel } from '../models/Class'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { CsvImportJob } from '../models/CsvImportJob'
import { SchoolYear } from '../models/SchoolYear'
import { parse } from 'csv-parse/sync'
import { checkAndAssignTemplates } from '../utils/templateUtils'
import { withTransaction } from '../utils/transactionUtils'

export const importRouter = Router()

importRouter.post('/students', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { csv, schoolYearId, dryRun, mapping } = req.body
  if (!csv || !schoolYearId) return res.status(400).json({ error: 'missing_payload' })
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true })
  
  // Get the join year from the school year
  let joinYear = new Date().getFullYear().toString()
  const schoolYear = await SchoolYear.findById(schoolYearId).lean()
  if (schoolYear && schoolYear.name) {
    const match = schoolYear.name.match(/(\d{4})/)
    if (match) joinYear = match[1]
  }
  
  // For dry run, just validate without transaction
  if (dryRun) {
    let added = 0, updated = 0, errorCount = 0
    const report: any[] = []
    
    for (const r of records) {
      try {
        const col = (k: string, def: string) => r[(mapping && mapping[k]) || def]
        const firstName = col('firstName','FirstName')
        const lastName = col('lastName','LastName')
        const dob = new Date(col('dateOfBirth','DateOfBirth'))
        const className = col('className','ClassName')
        
        // Check for existing student by name pattern (any year)
        const baseKeyPattern = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_`
        const existing = await Student.findOne({ 
          logicalKey: { $regex: `^${baseKeyPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
        })
        
        if (existing) {
          updated += 1
          report.push({ status: 'would_update', studentId: String(existing._id) })
        } else {
          added += 1
          report.push({ status: 'would_add', firstName, lastName })
        }
      } catch (e: any) {
        errorCount++
        report.push({ status: 'error', message: e.message })
      }
    }
    
    const summary = `${added} élèves à ajouter — ${updated} à mettre à jour — ${errorCount} en erreur`
    return res.json({ added, updated, errorCount, report, summary, dryRun: true })
  }
  
  // Execute the import within a transaction for atomicity
  const result = await withTransaction(async (session) => {
    let added = 0, updated = 0, errorCount = 0
    const report: any[] = []
    const userId = (req as any).user.userId
    
    for (const r of records) {
      try {
        const col = (k: string, def: string) => r[(mapping && mapping[k]) || def]
        const firstName = col('firstName','FirstName')
        const lastName = col('lastName','LastName')
        const dob = new Date(col('dateOfBirth','DateOfBirth'))
        const className = col('className','ClassName')
        const parentName = col('parentName','ParentName')
        const parentPhone = col('parentPhone','ParentPhone')
        
        // Check for existing student by name pattern (any year)
        const baseKeyPattern = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_`
        const existing = await Student.findOne({ 
          logicalKey: { $regex: `^${baseKeyPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
        }).session(session)
        
        let student
        
        if (existing) {
          student = await Student.findByIdAndUpdate(
            existing._id, 
            { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, 
            { new: true, session }
          )
          updated += 1
        } else {
          // Generate logicalKey as firstName_lastName_yearJoined with suffix for duplicates
          const baseKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${joinYear}`
          let key = baseKey
          let suffix = 1
          let keyExists = await Student.findOne({ logicalKey: key }).session(session)
          while (keyExists) {
            suffix++
            key = `${baseKey}_${suffix}`
            keyExists = await Student.findOne({ logicalKey: key }).session(session)
          }
          
          const created = await Student.create([{ 
            logicalKey: key, 
            firstName, 
            lastName, 
            dateOfBirth: dob, 
            parentName, 
            parentPhone 
          }], { session })
          student = created[0]
          added += 1
        }
        
        // Find or create class
        let cls = await ClassModel.findOne({ name: className, schoolYearId }).session(session)
        if (!cls) {
          const created = await ClassModel.create([{ name: className, schoolYearId }], { session })
          cls = created[0]
        }
        
        // Create enrollment if not exists
        const enrollmentExists = await Enrollment.findOne({ 
          studentId: String(student!._id), 
          classId: String(cls!._id), 
          schoolYearId 
        }).session(session)
        
        if (!enrollmentExists) {
          await Enrollment.create([{ 
            studentId: String(student!._id), 
            classId: String(cls!._id), 
            schoolYearId 
          }], { session })
          
          // Auto-assign templates based on level
          if (cls && cls.level) {
            await checkAndAssignTemplates(
              String(student!._id), 
              cls.level, 
              schoolYearId, 
              String(cls._id), 
              userId
            )
          }
        }
        
        report.push({ 
          status: existing ? 'updated' : 'added', 
          studentId: String(student!._id), 
          classId: String(cls!._id) 
        })
      } catch (e: any) {
        errorCount++
        report.push({ status: 'error', message: e.message })
        // In a transaction, we might want to fail fast on errors
        // For now, we continue to collect all errors
      }
    }
    
    // If there were errors, we might want to abort
    // For now, we allow partial success within the transaction
    // The transaction ensures all successful operations are atomic
    
    return { added, updated, errorCount, report }
  })
  
  if (!result.success) {
    return res.status(500).json({ 
      error: 'import_failed', 
      message: result.error,
      transactionUsed: result.usedTransaction 
    })
  }
  
  const { added, updated, errorCount, report } = result.data!
  const summary = `${added} élèves ajoutés — ${updated} mis à jour — ${errorCount} en erreur`
  
  // Log the import job
  await CsvImportJob.create({ 
    addedCount: added, 
    updatedCount: updated, 
    errorCount, 
    reportJson: JSON.stringify(report),
    transactionUsed: result.usedTransaction
  })
  
  res.json({ added, updated, errorCount, report, summary, transactionUsed: result.usedTransaction })
})
