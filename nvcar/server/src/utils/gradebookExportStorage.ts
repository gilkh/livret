import fs from 'fs'
import path from 'path'

export const GRADEBOOK_EXPORT_ROOT = path.resolve(process.cwd(), 'exports', 'gradebooks')

export const sanitizeGradebookExportSegment = (value: string) => {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Sans valeur'
}

export const ensureGradebookExportRoot = async () => {
  await fs.promises.mkdir(GRADEBOOK_EXPORT_ROOT, { recursive: true })
}

export const buildGradebookExportRelativeDir = (opts: {
  yearName?: string
  level?: string
  className?: string
  batchKey: string
}) => {
  const yearSegment = sanitizeGradebookExportSegment(String(opts.yearName || 'Sans annee'))
  const levelSegment = sanitizeGradebookExportSegment(String(opts.level || 'Sans niveau'))
  const classSegment = sanitizeGradebookExportSegment(String(opts.className || 'Sans classe'))
  const batchSegment = sanitizeGradebookExportSegment(String(opts.batchKey || 'lot'))

  return path.join(yearSegment, levelSegment, classSegment, batchSegment)
}

export const resolveGradebookExportPath = (relativePath: string) => {
  const target = path.resolve(GRADEBOOK_EXPORT_ROOT, relativePath)
  const rootWithSep = `${GRADEBOOK_EXPORT_ROOT}${path.sep}`
  if (target !== GRADEBOOK_EXPORT_ROOT && !target.startsWith(rootWithSep)) {
    throw new Error('invalid_export_path')
  }
  return target
}
