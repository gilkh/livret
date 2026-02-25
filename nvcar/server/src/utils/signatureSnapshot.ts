import fs from 'fs'
import path from 'path'
import axios from 'axios'

const guessMimeType = (source: string) => {
    const ext = path.extname(source || '').toLowerCase()
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.gif') return 'image/gif'
    return 'image/png'
}

const tryResolveLocalUploadsPath = (source: string): string | null => {
    const raw = String(source || '').trim()
    if (!raw) return null

    let pathname = raw
    if (/^https?:\/\//i.test(raw)) {
        try {
            pathname = new URL(raw).pathname || ''
        } catch {
            pathname = raw
        }
    }

    const uploadsIdx = pathname.indexOf('/uploads/')
    if (uploadsIdx === -1) return null

    const relFromPublic = pathname.slice(uploadsIdx + 1).replace(/^\/+/, '')
    if (!relFromPublic) return null

    return path.join(__dirname, '../../public', relFromPublic)
}

export const buildSignatureSnapshot = async (signatureUrl?: string, baseUrl?: string): Promise<string | undefined> => {
    if (!signatureUrl) return undefined
    if (String(signatureUrl).startsWith('data:')) return String(signatureUrl)

    try {
        const raw = String(signatureUrl)
        const localPath = tryResolveLocalUploadsPath(raw)
        if (localPath && fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath)
            const mime = guessMimeType(localPath)
            return `data:${mime};base64,${buf.toString('base64')}`
        }

        const normalizedBase = baseUrl || 'http://localhost:4000'
        const fetchUrl = raw.startsWith('http') ? raw : `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`
        const response = await axios.get(fetchUrl, { responseType: 'arraybuffer' })
        const buf = Buffer.from(response.data)
        const mime = response.headers?.['content-type'] || guessMimeType(raw)
        return `data:${mime};base64,${buf.toString('base64')}`
    } catch (e) {
        console.error('[buildSignatureSnapshot] Failed to snapshot signature:', e)
        return undefined
    }
}
