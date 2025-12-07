import { Router } from 'express'
import { requireAuth } from '../auth'
import { StudentSignature } from '../models/StudentSignature'
import { AdminSignature } from '../models/AdminSignature'

export const signaturesRouter = Router()

// Admin Signature Routes
signaturesRouter.get('/admin', requireAuth(['ADMIN']), async (req, res) => {
  const sigs = await AdminSignature.find().sort({ createdAt: -1 }).lean()
  res.json(sigs)
})

signaturesRouter.post('/admin', requireAuth(['ADMIN']), async (req, res) => {
  const { name, dataUrl } = req.body
  const newSig = await AdminSignature.create({
    name,
    dataUrl,
    isActive: false // Default to false
  })
  res.json(newSig)
})

signaturesRouter.delete('/admin/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  await AdminSignature.findByIdAndDelete(id)
  res.json({ success: true })
})

signaturesRouter.post('/admin/:id/activate', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  
  // Deactivate all others
  await AdminSignature.updateMany({}, { isActive: false })
  
  // Activate selected
  const updated = await AdminSignature.findByIdAndUpdate(
    id, 
    { isActive: true }, 
    { new: true }
  )
  
  res.json(updated)
})

// Student Signature Routes
signaturesRouter.get('/:studentId', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { studentId } = req.params
  const s = await StudentSignature.findOne({ studentId }).lean()
  res.json(s || { studentId, items: [] })
})

signaturesRouter.post('/:studentId', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { studentId } = req.params
  const { items } = req.body
  const updated = await StudentSignature.findOneAndUpdate(
    { studentId },
    { items, updatedAt: new Date() },
    { upsert: true, new: true }
  )
  res.json(updated)
})
