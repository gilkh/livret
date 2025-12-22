import { ClassModel } from '../models/Class'
import { Enrollment } from '../models/Enrollment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { SchoolYear } from '../models/SchoolYear'
import { randomUUID } from 'crypto'

export function getVersionedTemplate(template: any, templateVersion: any) {
  if (!templateVersion || templateVersion === template.currentVersion) return template
  const versionData = template.versionHistory?.find((v: any) => v.version === templateVersion)
  if (!versionData) return template
  return {
    ...template,
    pages: versionData.pages,
    variables: versionData.variables || {},
    watermark: versionData.watermark,
    _versionUsed: templateVersion,
    _isOldVersion: templateVersion < (template.currentVersion || 1),
  } as any
}

export const buildBlocksById = (pages: any[]) => {
  const map = new Map<string, { block: any, pageIdx: number, blockIdx: number }>()
    ; (Array.isArray(pages) ? pages : []).forEach((page: any, pageIdx: number) => {
      ; (Array.isArray(page?.blocks) ? page.blocks : []).forEach((block: any, blockIdx: number) => {
        const raw = block?.props?.blockId
        const id = typeof raw === 'string' && raw.trim() ? raw.trim() : null
        if (!id) return
        map.set(id, { block, pageIdx, blockIdx })
      })
    })
  return map
}

export function mergeAssignmentDataIntoTemplate(template: any, assignment: any) {
  if (!template) return null
  const templateVersion = (assignment as any)?.templateVersion
  let versionedTemplate = getVersionedTemplate(template, templateVersion)

  // Deep clone to avoid mutating the original template object (especially if it came from cache)
  versionedTemplate = JSON.parse(JSON.stringify(versionedTemplate))

  if (assignment?.data) {
    const blocksById = buildBlocksById(versionedTemplate?.pages || [])
    const pages = versionedTemplate?.pages || []

    for (const [key, value] of Object.entries(assignment.data)) {
      // 1. Language Toggle Merging
      if (key.startsWith('language_toggle_')) {
        const mStable = key.match(/^language_toggle_(.+)$/)
        const mLegacy = key.match(/^language_toggle_(\d+)_(\d+)$/)

        if (mStable) {
          const blockId = String(mStable[1] || '').trim()
          const found = blockId ? blocksById.get(blockId) : null
          if (found && ['language_toggle', 'language_toggle_v2'].includes(found.block?.type)) {
            found.block.props = found.block.props || {}
            found.block.props.items = value
          }
        }

        if (mLegacy) {
          const pageIdx = parseInt(mLegacy[1])
          const blockIdx = parseInt(mLegacy[2])
          const block = pages[pageIdx]?.blocks?.[blockIdx]
          // Only use legacy if stable ID didn't already populate this (or if it doesn't have an ID)
          if (block && ['language_toggle', 'language_toggle_v2'].includes(block.type)) {
            // If the block has no stable ID, or if the data specifically targeted these coordinates
            block.props = block.props || {}
            block.props.items = value
          }
        }
      }

      // 2. Table Row Merging (Skills)
      const mTableStable = key.match(/^table_(.+)_row_(.+)$/)
      const mTableLegacy = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/)

      if (mTableStable) {
        const blockId = String(mTableStable[1] || '').trim()
        const rowId = String(mTableStable[2] || '').trim()
        const found = blockId ? blocksById.get(blockId) : null
        const block = found?.block
        if (block && block.type === 'table' && block.props?.expandedRows) {
          const rowIds = Array.isArray(block.props.rowIds) ? block.props.rowIds : []
          const rowIdx = rowIds.findIndex((v: any) => typeof v === 'string' && v.trim() === rowId)
          if (rowIdx >= 0) {
            block.props.rowLanguages = block.props.rowLanguages || {}
            block.props.rowLanguages[rowIdx] = value
          }
        }
      }

      if (mTableLegacy) {
        const pageIdx = parseInt(mTableLegacy[1])
        const blockIdx = parseInt(mTableLegacy[2])
        const rowIdx = parseInt(mTableLegacy[3])
        const block = pages[pageIdx]?.blocks?.[blockIdx]
        if (block && block.type === 'table' && block.props?.expandedRows) {
          block.props.rowLanguages = block.props.rowLanguages || {}
          block.props.rowLanguages[rowIdx] = value
        }
      }

      // 3. Dropdowns and Other coordinates (Variable Names)
      // If key matches a variableName, we can overlay it (though UI usually handles this)
      // No specific structural overlay needed for simple variable keys as they are reactive in UI
    }
  }

  return versionedTemplate
}

import { Setting } from '../models/Setting'

const DEFAULT_ALLOWED_LONG_TERM_KEYS = [
  'longTermNotes', 'permanentNotes', 'medicalInfo', 'iep', 'edPlan', 'chronicNotes', 'comments', 'variables', 'personalHistory'
]

export async function getAllowedLongTermKeys() {
  try {
    const s = await Setting.findOne({ key: 'assignment_long_term_keys' }).lean()
    if (!s || !Array.isArray(s.value)) return DEFAULT_ALLOWED_LONG_TERM_KEYS
    return Array.isArray(s.value) ? s.value : DEFAULT_ALLOWED_LONG_TERM_KEYS
  } catch (e) {
    console.error('Failed to load assignment_long_term_keys setting, using defaults', e)
    return DEFAULT_ALLOWED_LONG_TERM_KEYS
  }
}

// Blacklisted keys never to copy
const BLACKLISTED_KEYS = [
  'signatures', 'promotions', 'active', 'completed', 'completedSem1', 'completedSem2',
  'completedAt', 'completedAtSem1', 'completedAtSem2', '_id', 'id', '__v'
]

// Maximum size for objects to be considered for copying (10KB)
const MAX_OBJECT_SIZE = 10 * 1024

function isBlacklistedKey(key: string): boolean {
  return BLACKLISTED_KEYS.includes(key)
}

function getObjectSize(obj: any): number {
  try { return JSON.stringify(obj).length } catch (e) { return Infinity }
}

function isValueAllowedForCopying(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (typeof value === 'object') {
    const size = getObjectSize(value)
    return size <= MAX_OBJECT_SIZE
  }
  return false
}

export async function getAutoInferFlag() {
  try {
    const s = await Setting.findOne({ key: 'assignment_long_term_auto_infer' }).lean()
    return s ? Boolean(s.value) : true
  } catch (e) {
    console.error('Failed to load assignment_long_term_auto_infer setting, defaulting to true', e)
    return true
  }
}

export async function inferLongTermDataKeys(studentId: string, lastN: number = 3, lastAssignments?: any[]) {
  try {
    // Use provided lastAssignments if available to avoid re-querying
    const recentAssignments = Array.isArray(lastAssignments) && lastAssignments.length > 0
      ? lastAssignments.slice(0, lastN)
      : await TemplateAssignment.find({ studentId }).sort({ assignedAt: -1 }).limit(lastN).select({ data: 1 }).lean()

    if (!recentAssignments || recentAssignments.length === 0) return []

    const dataObjects = recentAssignments.map(a => a.data).filter(d => d && typeof d === 'object')
    if (dataObjects.length === 0) return []

    const keyFrequency: Record<string, number> = {}
    const totalObjects = dataObjects.length

    for (const dataObj of dataObjects) {
      const keys = Object.keys(dataObj)
      for (const key of keys) {
        if (isBlacklistedKey(key)) continue
        if (!isValueAllowedForCopying(dataObj[key])) continue
        keyFrequency[key] = (keyFrequency[key] || 0) + 1
      }
    }

    // Keys that appear in majority (more than 50%) of assignments
    const inferredKeys = Object.keys(keyFrequency).filter(key => keyFrequency[key] / totalObjects > 0.5)

    return inferredKeys
  } catch (e) {
    console.error('Failed to infer long-term data keys:', e)
    return []
  }
}

export async function extractLongTermDataAuto(data: any, studentId: string, inferredKeysParam?: string[], lastAssignments?: any[]) {
  if (!data || typeof data !== 'object') return {}

  // Determine inferred keys either from caller or by inspecting history
  const inferredKeys = Array.isArray(inferredKeysParam) && inferredKeysParam.length > 0
    ? inferredKeysParam
    : await inferLongTermDataKeys(studentId, 3, lastAssignments)

  const out: any = {}
  for (const key of inferredKeys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const val = (data as any)[key]
      if (val === null || val === undefined) continue
      if (isValueAllowedForCopying(val)) out[key] = val
    }
  }

  return out
}

export async function extractLongTermData(data: any, studentId?: string, lastAssignments?: any[]) {
  if (!data || typeof data !== 'object') return {}

  const adminKeys = await getAllowedLongTermKeys()
  const autoInfer = await getAutoInferFlag()

  let allowedKeys: string[] = []

  if (autoInfer && studentId) {
    const inferred = await inferLongTermDataKeys(studentId, 3, lastAssignments)
    // Union admin keys + inferred keys (admin keys take precedence)
    const set = new Set<string>([...(Array.isArray(adminKeys) ? adminKeys : []), ...inferred])
    allowedKeys = Array.from(set)
  } else {
    allowedKeys = Array.isArray(adminKeys) ? adminKeys : []
  }

  const out: any = {}
  for (const k of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      const v = (data as any)[k]
      if (v === null || v === undefined) continue
      if (isValueAllowedForCopying(v)) out[k] = v
    }
  }

  return out
}

export async function checkAndAssignTemplates(studentId: string, level: string, schoolYearId: string, classId: string, userId: string) {
  try {
    const targetYear = schoolYearId ? await SchoolYear.findById(schoolYearId).select({ startDate: 1 }).lean() : null
    const targetStartDate = targetYear?.startDate ? new Date(targetYear.startDate).getTime() : null

    // 1. Find other students in the same level for this school year
    const classesInLevel = await ClassModel.find({ level, schoolYearId }).lean()
    const classIdsInLevel = classesInLevel.map(c => String(c._id))

    if (classIdsInLevel.length === 0) return

    // Find enrollments in these classes (excluding the current student)
    const enrollments = await Enrollment.find({
      classId: { $in: classIdsInLevel },
      studentId: { $ne: studentId }
    }).lean()

    if (enrollments.length === 0) return

    const otherStudentIds = enrollments.map(e => e.studentId)

    // 2. Find templates assigned to these students
    const assignments = await TemplateAssignment.find({
      studentId: { $in: otherStudentIds }
    }).lean()

    const templateIds = [...new Set(assignments.map(a => a.templateId))]

    if (templateIds.length === 0) {
      // 2a. Check for Default Templates for this Level
      const defaultTemplates = await GradebookTemplate.find({ defaultForLevels: level }).lean()
      if (defaultTemplates.length > 0) {
        templateIds.push(...defaultTemplates.map(t => String(t._id)))
      }
    }

    if (templateIds.length === 0) return

    // 3. Assign these templates to the new student
    const teacherAssignments = await TeacherClassAssignment.find({ classId }).lean()
    const teacherIds = teacherAssignments.map(t => t.teacherId)

    for (const templateId of templateIds) {
      // Check if already assigned for this school year
      const exists = await TemplateAssignment.findOne({ studentId, templateId, completionSchoolYearId: schoolYearId })
      const template = await GradebookTemplate.findById(templateId).lean()

      if (!template) continue

      if (!exists) {
        // NEW: Check for previous year assignment data to copy over
        // We look for a "SavedGradebook" or a previous "TemplateAssignment" for the PREVIOUS level/year.
        // However, we want the data to persist.
        // If we find a previous assignment for this student (regardless of template ID? or maybe same template ID if it persists?),
        // we should copy the `data` field.

        // Actually, the user requirement is: "modified on the same one that was worked on in the previous years"
        // This implies the data should carry over.

        let initialData = {};

        // Find the most recent assignment for this student (any template, or matching template?)
        // If the template changes between years (e.g. EB4 -> EB5), the structure might be different.
        // But usually, teachers want to keep comments or specific tracking data.

        // Let's try to find the MOST RECENT assignment for this student
        const lastAssignment = await TemplateAssignment.findOne({ studentId })
          .sort({ assignedAt: -1 })
          .lean();

        if (lastAssignment && lastAssignment.data) {
          // Copy only explicitly approved long-term keys from previous assignment
          const recent = await TemplateAssignment.find({ studentId }).sort({ assignedAt: -1 }).limit(3).lean()
          initialData = await extractLongTermData(lastAssignment.data, studentId, recent)
        }

        await TemplateAssignment.create({
          templateId,
          templateVersion: template.currentVersion || 1,
          studentId,
          completionSchoolYearId: schoolYearId,
          assignedTeachers: teacherIds,
          assignedBy: userId,
          assignedAt: new Date(),
          status: 'draft',
          data: initialData // Initialize with previous data
        })
      } else {
        // Update existing assignment to ensure it's ready for the new year
        const updates: any = {}

        // Update version if needed
        if (exists.templateVersion !== template.currentVersion) {
          updates.templateVersion = template.currentVersion
        }

        const completionYearId = String((exists as any).completionSchoolYearId || '')
        const existsAssignedAt = (exists as any)?.assignedAt ? new Date((exists as any).assignedAt).getTime() : null
        const inferredIsCurrentYear =
          !completionYearId &&
          targetStartDate !== null &&
          existsAssignedAt !== null &&
          existsAssignedAt >= targetStartDate

        const shouldResetForNewYear =
          (completionYearId && completionYearId !== String(schoolYearId)) ||
          (!completionYearId && !inferredIsCurrentYear)

        if (shouldResetForNewYear) {
          updates.status = 'draft'
          updates.isCompleted = false
          updates.completedAt = null
          updates.completedBy = null
          updates.isCompletedSem1 = false
          updates.completedAtSem1 = null
          updates.isCompletedSem2 = false
          updates.completedAtSem2 = null
          updates.teacherCompletions = []
          updates.assignedAt = new Date()
          updates.assignedBy = userId
          updates.completionSchoolYearId = schoolYearId
        } else if (!completionYearId) {
          updates.completionSchoolYearId = schoolYearId
        }

        // Always update teachers to the new class teachers
        updates.assignedTeachers = teacherIds

        await TemplateAssignment.updateOne({ _id: exists._id }, { $set: updates })
      }
    }
  } catch (err) {
    console.error('Error in checkAndAssignTemplates:', err)
  }
}

function getRowSignature(row: any): string {
  if (!Array.isArray(row)) return ''
  return row
    .map((cell: any) => {
      if (!cell) return ''
      if (typeof cell === 'string') return cell
      if (typeof cell?.text === 'string') return cell.text
      return ''
    })
    .join('|')
    .trim()
}

function getBlockSignature(block: any): string {
  if (!block || typeof block !== 'object') return ''
  const t = String(block.type || '')
  const p = block.props || {}
  const keyProps: any = {}

  if (t === 'language_toggle' || t === 'language_toggle_v2') {
    const items = Array.isArray(p.items) ? p.items : []
    keyProps.items = items.map((it: any) => ({
      code: it?.code,
      type: it?.type,
      label: it?.label,
      level: it?.level,
      levels: it?.levels,
    }))
  } else if (t === 'dropdown') {
    keyProps.dropdownNumber = p.dropdownNumber
    keyProps.variableName = p.variableName
    keyProps.field = p.field
  } else if (t === 'table') {
    const cells = Array.isArray(p.cells) ? p.cells : []
    keyProps.firstRow = cells[0] ? getRowSignature(cells[0]) : ''
    keyProps.firstCol = cells.map((r: any) => (Array.isArray(r) && r[0] ? r[0]?.text : '')).join('|').slice(0, 300)
    keyProps.expandedRows = !!p.expandedRows
  } else {
    if (typeof p.content === 'string') keyProps.content = p.content.slice(0, 300)
    if (typeof p.text === 'string') keyProps.text = p.text.slice(0, 300)
    if (typeof p.title === 'string') keyProps.title = p.title.slice(0, 120)
    if (typeof p.field === 'string') keyProps.field = p.field
  }

  return `${t}:${JSON.stringify(keyProps)}`
}

export function ensureStableBlockIds(previousPages: any[] | undefined, nextPages: any[] | undefined) {
  const pages = Array.isArray(nextPages) ? JSON.parse(JSON.stringify(nextPages)) : []

  const prevBlocksById = new Map<string, any>()
  const prevIdsBySignature = new Map<string, string[]>()

  const prevPagesArr = Array.isArray(previousPages) ? previousPages : []
  for (const prevPage of prevPagesArr) {
    const prevBlocks: any[] = Array.isArray(prevPage?.blocks) ? prevPage.blocks : []
    for (const prevBlock of prevBlocks) {
      const prevIdRaw = prevBlock?.props?.blockId
      const prevId = typeof prevIdRaw === 'string' && prevIdRaw.trim() ? prevIdRaw.trim() : randomUUID()
      const sig = getBlockSignature(prevBlock)
      const list = prevIdsBySignature.get(sig) || []
      list.push(prevId)
      prevIdsBySignature.set(sig, list)
      prevBlocksById.set(prevId, prevBlock)
    }
  }

  for (const page of pages) {
    const blocks: any[] = Array.isArray(page?.blocks) ? page.blocks : []
    for (const block of blocks) {
      if (!block) continue
      const currentId = block?.props?.blockId
      const currentIdValid = typeof currentId === 'string' && currentId.trim()
      if (currentIdValid) continue

      const sig = getBlockSignature(block)
      const candidates = prevIdsBySignature.get(sig) || []
      const nextId = candidates.shift() || randomUUID()
      prevIdsBySignature.set(sig, candidates)

      block.props = block.props || {}
      block.props.blockId = nextId
    }
  }

  return pages
}

export function ensureStableExpandedTableRowIds(previousPages: any[] | undefined, nextPages: any[] | undefined) {
  const pages = Array.isArray(nextPages) ? JSON.parse(JSON.stringify(nextPages)) : []

  const prevTableBlocksById = new Map<string, any>()
  const prevPagesArr = Array.isArray(previousPages) ? previousPages : []
  for (const prevPage of prevPagesArr) {
    const prevBlocks: any[] = Array.isArray(prevPage?.blocks) ? prevPage.blocks : []
    for (const prevBlock of prevBlocks) {
      if (!prevBlock || prevBlock.type !== 'table' || !prevBlock?.props?.expandedRows) continue
      const id = prevBlock?.props?.blockId
      if (typeof id === 'string' && id.trim()) prevTableBlocksById.set(id.trim(), prevBlock)
    }
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx]
    const blocks: any[] = Array.isArray(page?.blocks) ? page.blocks : []

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const block = blocks[blockIdx]
      if (!block || block.type !== 'table' || !block?.props?.expandedRows) continue

      const nextCells: any[] = Array.isArray(block?.props?.cells) ? block.props.cells : []
      const rowCount = nextCells.length
      if (rowCount === 0) continue

      const nextRowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : null
      const nextRowIdsValid =
        nextRowIds &&
        nextRowIds.length === rowCount &&
        nextRowIds.every((v: any) => typeof v === 'string' && v.trim())

      if (nextRowIdsValid) continue

      const blockId = block?.props?.blockId
      const prevBlock =
        typeof blockId === 'string' && blockId.trim()
          ? prevTableBlocksById.get(blockId.trim())
          : previousPages?.[pageIdx]?.blocks?.[blockIdx]
      const prevCells: any[] = Array.isArray(prevBlock?.props?.cells) ? prevBlock.props.cells : []
      const prevRowIds: any[] = Array.isArray(prevBlock?.props?.rowIds) ? prevBlock.props.rowIds : []

      const idsBySignature = new Map<string, string[]>()
      for (let rowIdx = 0; rowIdx < prevCells.length; rowIdx++) {
        const signature = getRowSignature(prevCells[rowIdx])
        const id = typeof prevRowIds[rowIdx] === 'string' && prevRowIds[rowIdx].trim() ? prevRowIds[rowIdx] : randomUUID()
        const list = idsBySignature.get(signature) || []
        list.push(id)
        idsBySignature.set(signature, list)
      }

      const assignedRowIds: string[] = []
      for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
        const signature = getRowSignature(nextCells[rowIdx])
        const candidates = idsBySignature.get(signature) || []
        const id = candidates.shift() || randomUUID()
        assignedRowIds.push(id)
        idsBySignature.set(signature, candidates)
      }

      block.props = block.props || {}
      block.props.rowIds = assignedRowIds
    }
  }

  return pages
}
