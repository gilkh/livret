import { connectDb } from './db'
import { GradebookTemplate } from './models/GradebookTemplate'
import { StudentAcquiredSkill } from './models/StudentAcquiredSkill'
import { TemplateAssignment } from './models/TemplateAssignment'
import { ensureStableBlockIds, ensureStableExpandedTableRowIds } from './utils/templateUtils'

function getVersionedPages(template: any, templateVersion: any) {
  if (!templateVersion || templateVersion === template.currentVersion) return template.pages
  const versionData = template.versionHistory?.find((v: any) => v.version === templateVersion)
  if (!versionData) return template.pages
  return versionData.pages
}

async function migrateTemplatesRowIds() {
  const templates = await GradebookTemplate.find({}).lean()
  let updatedCount = 0

  for (const template of templates) {
    const templateId = String((template as any)._id)
    const pages = Array.isArray((template as any).pages) ? (template as any).pages : []
    const pagesWithBlockIds = ensureStableBlockIds(pages, pages)
    const nextPages = ensureStableExpandedTableRowIds(pages, pagesWithBlockIds)

    const versionHistory = Array.isArray((template as any).versionHistory) ? (template as any).versionHistory : []
    const nextVersionHistory = versionHistory.map((entry: any) => {
      const entryPages = Array.isArray(entry?.pages) ? entry.pages : []
      const entryPagesWithBlockIds = ensureStableBlockIds(entryPages, entryPages)
      return {
        ...entry,
        pages: ensureStableExpandedTableRowIds(entryPages, entryPagesWithBlockIds)
      }
    })

    const pagesChanged = JSON.stringify(pages) !== JSON.stringify(nextPages)
    const versionHistoryChanged = JSON.stringify(versionHistory) !== JSON.stringify(nextVersionHistory)

    if (pagesChanged || versionHistoryChanged) {
      await GradebookTemplate.updateOne(
        { _id: templateId },
        { $set: { pages: nextPages, versionHistory: nextVersionHistory, updatedAt: new Date() } }
      )
      updatedCount++
    }
  }

  return { updatedCount, total: templates.length }
}

async function migrateAcquiredSkillsSourceId() {
  const cursor = StudentAcquiredSkill.find({
    sourceKey: { $exists: true, $ne: null },
    $or: [{ sourceId: { $exists: false } }, { sourceId: null }]
  })
    .select('_id studentId templateId assignmentId skillText sourceKey recordedAt')
    .lean()
    .cursor()

  let processed = 0
  let updated = 0
  let skipped = 0

  for await (const doc of cursor as any) {
    processed++
    const sourceKey = String(doc.sourceKey || '')
    const match = sourceKey.match(/^table_(\d+)_(\d+)_row_(\d+)$/)
    if (!match) {
      skipped++
      continue
    }

    const pageIdx = parseInt(match[1])
    const blockIdx = parseInt(match[2])
    const rowIdx = parseInt(match[3])

    const template = await GradebookTemplate.findById(doc.templateId).lean()
    if (!template) {
      skipped++
      continue
    }

    let templateVersion: any = undefined
    if (doc.assignmentId) {
      const assignment = await TemplateAssignment.findById(doc.assignmentId).select('templateVersion').lean()
      templateVersion = (assignment as any)?.templateVersion
    }

    const pages = getVersionedPages(template, templateVersion)
    const pagesWithBlockIds = ensureStableBlockIds(pages, pages)
    const normalizedPages = ensureStableExpandedTableRowIds(pages, pagesWithBlockIds)

    const page = normalizedPages?.[pageIdx]
    const block = page?.blocks?.[blockIdx]
    const rowId = Array.isArray(block?.props?.rowIds) ? block.props.rowIds[rowIdx] : undefined
    const sourceId = typeof rowId === 'string' && rowId.trim() ? rowId : null

    if (!sourceId) {
      skipped++
      continue
    }

    await StudentAcquiredSkill.updateOne({ _id: doc._id }, { $set: { sourceId } })
    updated++
  }

  return { processed, updated, skipped }
}

async function dedupeAcquiredSkillsBySourceId() {
  const groups = await StudentAcquiredSkill.aggregate([
    { $match: { sourceId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: { studentId: '$studentId', templateId: '$templateId', sourceId: '$sourceId' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ])

  let deleted = 0
  for (const g of groups) {
    const ids: any[] = g.ids || []
    const docs = await StudentAcquiredSkill.find({ _id: { $in: ids } })
      .select('_id recordedAt')
      .sort({ recordedAt: -1, _id: -1 })
      .lean()

    const toDelete = docs.slice(1).map(d => d._id)
    if (toDelete.length > 0) {
      await StudentAcquiredSkill.deleteMany({ _id: { $in: toDelete } })
      deleted += toDelete.length
    }
  }

  return { duplicateGroups: groups.length, deleted }
}

async function main() {
  await connectDb()

  const templateRes = await migrateTemplatesRowIds()
  console.log('templates_rowids', templateRes)

  const skillsRes = await migrateAcquiredSkillsSourceId()
  console.log('skills_sourceid', skillsRes)

  const dedupeRes = await dedupeAcquiredSkillsBySourceId()
  console.log('skills_dedupe', dedupeRes)

  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
