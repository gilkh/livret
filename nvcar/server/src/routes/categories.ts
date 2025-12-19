import { Router } from 'express'
import { Category } from '../models/Category'
import { Competency } from '../models/Competency'
import { requireAuth } from '../auth'
import { withCache, clearCache } from '../utils/cache'

export const categoriesRouter = Router()

categoriesRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const result = await withCache('categories-all-grouped', async () => {
    const cats = await Category.find({ active: true }).sort({ order: 1 }).lean()
    const catIds = cats.map(c => String((c as any)._id))
    const comps = await Competency.find({ categoryId: { $in: catIds }, active: true }).sort({ order: 1 }).lean()
    const grouped: Record<string, any[]> = {}
    for (const comp of comps) {
      const cid = comp.categoryId as any as string
        ; (grouped[cid] ||= []).push(comp)
    }
    return cats.map(c => ({ ...c, competencies: grouped[String((c as any)._id)] || [] }))
  })
  res.json(result)
})

categoriesRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { name, order, active } = req.body
  clearCache('categories')
  const cat = await Category.create({ name, order: order ?? 0, active: active ?? true })
  res.json(cat)
})

categoriesRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  clearCache('categories')
  const cat = await Category.findByIdAndUpdate(id, req.body, { new: true })
  res.json(cat)
})

categoriesRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  clearCache('categories')
  await Category.findByIdAndDelete(id)
  res.json({ ok: true })
})

// Competencies
categoriesRouter.post('/:id/competencies', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const { label, order, active } = req.body
  clearCache('categories')
  const comp = await Competency.create({ categoryId: id, label, order: order ?? 0, active: active ?? true })
  res.json(comp)
})

categoriesRouter.patch('/competencies/:compId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { compId } = req.params
  clearCache('categories')
  const comp = await Competency.findByIdAndUpdate(compId, req.body, { new: true })
  res.json(comp)
})

categoriesRouter.delete('/competencies/:compId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { compId } = req.params
  clearCache('categories')
  await Competency.findByIdAndDelete(compId)
  res.json({ ok: true })
})
