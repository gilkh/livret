import path from 'path'
import fs from 'fs'

export const uploadsRootDir = path.resolve(process.cwd(), 'public', 'uploads')
export const publicRootDir = path.resolve(process.cwd(), 'public')

export const normalizeUploadsUrl = (raw: string): string | null => {
  const value = String(raw || '').trim().replace(/\\/g, '/')
  if (!value) return null
  const uploadsIdx = value.indexOf('/uploads/')
  if (uploadsIdx < 0) return null
  let normalized = value.slice(uploadsIdx)
  const queryStart = normalized.search(/[?#]/)
  if (queryStart >= 0) normalized = normalized.slice(0, queryStart)
  normalized = `/${normalized.replace(/^\/+/, '')}`
  if (!normalized.startsWith('/uploads/')) return null
  const normalizedPath = path.posix.normalize(normalized.slice(1))
  if (!normalizedPath.startsWith('uploads/')) return null
  return `/${normalizedPath}`
}

export const collectTemplateUploadUrls = (value: any, urls: Set<string>) => {
  if (value == null) return
  if (typeof value === 'string') {
    const normalized = normalizeUploadsUrl(value)
    if (normalized) urls.add(normalized)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTemplateUploadUrls(item, urls)
    return
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) collectTemplateUploadUrls(value[key], urls)
  }
}

export const normalizeTemplateUploadUrls = (value: any): any => {
  if (value == null) return value
  if (typeof value === 'string') {
    return normalizeUploadsUrl(value) || value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeTemplateUploadUrls(item))
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const key of Object.keys(value)) {
      out[key] = normalizeTemplateUploadUrls(value[key])
    }
    return out
  }
  return value
}

export const uploadUrlToAbsoluteFilePath = (url: string): string | null => {
  const normalizedUrl = normalizeUploadsUrl(url)
  if (!normalizedUrl) return null
  const relativeFromPublic = normalizedUrl.replace(/^\/+/, '')
  const absolutePath = path.resolve(publicRootDir, relativeFromPublic)
  if (absolutePath !== uploadsRootDir && !absolutePath.startsWith(uploadsRootDir + path.sep)) {
    return null
  }
  return absolutePath
}

export const zipEntryToUploadAbsolutePath = (entryName: string): string | null => {
  const normalizedEntry = path.posix.normalize(String(entryName || '').replace(/\\/g, '/'))
  if (!normalizedEntry.startsWith('uploads/') || normalizedEntry.includes('..')) return null
  const absolutePath = path.resolve(publicRootDir, normalizedEntry)
  if (absolutePath !== uploadsRootDir && !absolutePath.startsWith(uploadsRootDir + path.sep)) {
    return null
  }
  return absolutePath
}

export const ensureTempDir = (subfolder: string): string => {
  const targetDir = path.join(process.cwd(), '../temps', subfolder)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
  return targetDir
}
