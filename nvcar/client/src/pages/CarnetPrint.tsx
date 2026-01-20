import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { GradebookPocket } from '../components/GradebookPocket'
import { CroppedImage } from '../components/CroppedImage'
import { formatDdMmYyyyColon } from '../utils/dateFormat'
import { computeSignatureStatusForBlock } from '../utils/signatureVisibility'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth?: Date | string; className?: string; avatarUrl?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

export default function CarnetPrint({ mode }: { mode?: 'saved' | 'preview' }) {
    const { assignmentId, savedId, templateId, studentId } = useParams<{ assignmentId: string, savedId: string, templateId: string, studentId: string }>()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const hideSignatures = searchParams.get('hideSignatures') === 'true'

    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
    const [finalSignature, setFinalSignature] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const { levels } = useLevels()

    const getNextLevel = (current: string) => {
        if (!current) return ''

        // Use dynamic levels if available
        if (levels && levels.length > 0) {
            const currentLvl = levels.find(l => l.name === current)
            if (currentLvl) {
                const nextLvl = levels.find(l => l.order === currentLvl.order + 1)
                if (nextLvl) return nextLvl.name
            }
        }

        const c = (current || '').toUpperCase()
        if (c === 'TPS') return 'PS'
        if (c === 'PS') return 'MS'
        if (c === 'MS') return 'GS'
        if (c === 'GS') return 'EB1'
        if (c === 'KG1') return 'KG2'
        if (c === 'KG2') return 'KG3'
        if (c === 'KG3') return 'EB1'
        return ''
    }

    const getBlockLevel = (b: Block) => {
        if (b.props.level) return b.props.level
        const label = (b.props.label || '').toUpperCase()
        if (/\bTPS\b/.test(label)) return 'TPS'
        if (/\bPS\b/.test(label)) return 'PS'
        if (/\bMS\b/.test(label)) return 'MS'
        if (/\bGS\b/.test(label)) return 'GS'
        if (/\bEB1\b/.test(label)) return 'EB1'
        if (/\bKG1\b/.test(label)) return 'KG1'
        if (/\bKG2\b/.test(label)) return 'KG2'
        if (/\bKG3\b/.test(label)) return 'KG3'
        return null
    }

    const computeNextSchoolYearName = (year: string | undefined) => {
        if (!year) return ''
        const m = year.match(/(\d{4})\s*([/\-])\s*(\d{4})/)
        if (!m) return ''
        const start = parseInt(m[1], 10)
        const sep = m[2]
        const end = parseInt(m[3], 10)
        if (Number.isNaN(start) || Number.isNaN(end)) return ''
        return `${start + 1}${sep}${end + 1}`
    }

    const getPromotionYearLabel = (promo: any, blockLevel: string | null) => {
        const year = String(promo?.year || '')
        if (year) {
            const next = computeNextSchoolYearName(year)
            if (next) return next
        }

        if (!year) return ''

        const history = assignment?.data?.signatures || []
        const level = String(promo?.from || blockLevel || '')
        const endSig = Array.isArray(history)
            ? history
                .filter((s: any) => (s?.type === 'end_of_year') && s?.schoolYearName)
                .find((s: any) => {
                    if (!level) return true
                    if (s?.level) return String(s.level) === level
                    return false
                })
            : null

        if (endSig?.schoolYearName) return String(endSig.schoolYearName)

        const next = computeNextSchoolYearName(year)
        return next || year
    }

    // Check if a block should be visible based on signature status
    const isBlockVisible = (b: Block) => {
        // Hide signature blocks entirely when hideSignatures is true
        if (hideSignatures && (b.type === 'signature_block' || b.type === 'signature_date')) {
            return false
        }
        
        // If block has no period, it's always visible
        if (!b.props.period) return true

        const blockLevel = getBlockLevel(b)

        // Case 1: Block has NO specific level (generic)
        if (!blockLevel) {
            // Use current active signature state
            if (b.props.period === 'mid-year' && !signature) return false
            if (b.props.period === 'end-year' && !signature) return false // Use signature for end-year in PDF context
            return true
        }

        const { isSignedStandard, isSignedFinal } = computeSignatureStatusForBlock({
            signature,
            finalSignature,
            history: assignment?.data?.signatures || [],
            promotions: assignment?.data?.promotions || [],
            studentLevel: student?.level || null,
            blockLevel,
            includeDirectLevelMatch: true,
            useFinalSignature: true,
            useSignatureAsFinal: true
        })

        if (b.props.period === 'mid-year' && !isSignedStandard) return false
        if (b.props.period === 'end-year' && !isSignedFinal) return false

        return true
    }

    const getSemesterNumber = (b: Block): 1 | 2 | null => {
        const raw = (b.props as any)?.semester ?? (b.props as any)?.semestre ?? null
        if (raw === 1 || raw === '1') return 1
        if (raw === 2 || raw === '2') return 2
        const p = String((b.props as any)?.period || '')
        if (p === 'mid-year') return 1
        if (p === 'end-year') return 2
        return null
    }

    const pickSignatureForLevelAndSemester = (opts: { level: string | null; semester: 1 | 2 | null }) => {
        const { level, semester } = opts
        const sigs: any[] = []
        const history = assignment?.data?.signatures
        if (Array.isArray(history)) sigs.push(...history)
        if (signature) sigs.push(signature)
        if (finalSignature) sigs.push(finalSignature)

        const promotions = Array.isArray(assignment?.data?.promotions) ? assignment?.data?.promotions : []
        const normalizeLevel = (val: any) => String(val || '').trim().toLowerCase()
        const normLevel = normalizeLevel(level)

        const matchesSemester = (s: any) => {
            const spid = String(s?.signaturePeriodId || '')
            const t = String(s?.type || 'standard')
            if (semester === 1) return spid.endsWith('_sem1') || t === 'standard'
            if (semester === 2) return spid.endsWith('_sem2') || spid.endsWith('_end_of_year') || t === 'end_of_year'
            return true
        }

        const matchesLevel = (s: any) => {
            if (!normLevel) return true
            const sLevel = normalizeLevel(s?.level)
            if (sLevel) return sLevel === normLevel

            if (s?.schoolYearName) {
                const promo = promotions.find((p: any) => String(p?.year || '') === String(s.schoolYearName))
                const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
                if (promoFrom && promoFrom === normLevel) return true
            }

            if (s?.schoolYearId) {
                const promo = promotions.find((p: any) => String(p?.schoolYearId || '') === String(s.schoolYearId))
                const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
                if (promoFrom && promoFrom === normLevel) return true
            }

            const studentLevel = normalizeLevel(student?.level)
            return !!studentLevel && studentLevel === normLevel
        }

        const filtered = sigs
            .filter(s => s && s?.signedAt)
            .filter(matchesSemester)
            .filter(matchesLevel)
            .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())

        return filtered[0] || null
    }

    useEffect(() => {
        // Initialize as not ready
        // @ts-ignore
        window.__READY_FOR_PDF__ = false

        const getRoleFromToken = (tok: string | null): string => {
            try {
                if (!tok) return ''
                const parts = tok.split('.')
                if (parts.length < 2) return ''
                const b64url = parts[1]
                const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
                const padded = b64 + '='.repeat((4 - (b64.length % 4 || 4)) % 4)
                const payload = JSON.parse(atob(padded))
                const effRole = payload.impersonateRole || payload.role
                return String(effRole || '')
            } catch {
                return ''
            }
        }

        const loadData = async () => {
            try {
                setLoading(true)
                // Use token from URL if provided
                if (token) {
                    localStorage.setItem('token', token)
                }

                if (mode === 'saved' && savedId) {
                    console.log('[CarnetPrint] Loading saved gradebook:', savedId)
                    const r = await api.get(`/saved-gradebooks/${savedId}`)
                    const savedData = r.data

                    setStudent({
                        ...savedData.data.student,
                        className: savedData.data.className || savedData.data.student.className
                    })
                    setAssignment(savedData.data.assignment)
                    setSignature(savedData.data.signature)
                    setFinalSignature(savedData.data.finalSignature || null)

                    if (savedData.templateId) {
                        const t = await api.get(`/templates/${savedData.templateId}`)
                        let templateData = t.data

                        // Handle versioning
                        const assignment = savedData.data.assignment
                        if (assignment?.templateVersion && templateData.versionHistory) {
                            const version = templateData.versionHistory.find((v: any) => v.version === assignment.templateVersion)
                            if (version) {
                                templateData = {
                                    ...templateData,
                                    pages: version.pages,
                                    variables: version.variables || {},
                                    watermark: version.watermark
                                }
                            }
                        }

                        // Merge assignment data into template blocks (specifically for language toggles)
                        if (assignment && assignment.data) {
                            templateData.pages.forEach((page: any, pIdx: number) => {
                                page.blocks.forEach((block: any, bIdx: number) => {
                                    if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                                        const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
                                        const keyStable = blockId ? `language_toggle_${blockId}` : null
                                        const keyLegacy = `language_toggle_${pIdx}_${bIdx}`
                                        const items = (keyStable ? assignment.data[keyStable] : null) || assignment.data[keyLegacy]
                                        if (items) block.props.items = items
                                    }
                                })
                            })
                        }

                        setTemplate(templateData)
                    }
                } else if (mode === 'preview' && templateId && studentId) {
                    const sRes = await api.get(`/students/${studentId}`)
                    const s = sRes.data
                    let cls = ''
                    if (Array.isArray(s.enrollments) && s.enrollments.length > 0) {
                        const active = s.enrollments.find((e: any) => e.status === 'active')
                        cls = (active || s.enrollments[s.enrollments.length - 1])?.className || ''
                    }
                    setStudent({
                        _id: s._id,
                        firstName: s.firstName,
                        lastName: s.lastName,
                        level: s.level,
                        className: cls,
                        dateOfBirth: s.dateOfBirth,
                        avatarUrl: s.avatarUrl
                    })
                    const tRes = await api.get(`/templates/${templateId}`)
                    setTemplate(tRes.data)
                } else if (assignmentId) {
                    console.log('[CarnetPrint] Loading data for assignment:', assignmentId)
                    let role = localStorage.getItem('role') || ''
                    if (!role) role = getRoleFromToken(token)

                    const isTeacher = role === 'TEACHER'
                    const isAdmin = role === 'ADMIN'

                    const endpoint = isTeacher
                        ? `/teacher/template-assignments/${assignmentId}`
                        : (isAdmin ? `/admin-extras/templates/${assignmentId}/review` : `/subadmin/templates/${assignmentId}/review`)
                    const r = await api.get(endpoint)
                    let templateData = r.data.template
                    const assignmentData = r.data.assignment
                    const studentData = r.data.student
                    setStudent(studentData)
                    setAssignment(assignmentData)
                    if (!isTeacher) {
                        setSignature(r.data.signature)
                        setFinalSignature(r.data.finalSignature || null)
                    }

                    if (assignmentData?.templateVersion && templateData?.versionHistory) {
                        const version = templateData.versionHistory.find((v: any) => v.version === assignmentData.templateVersion)
                        if (version) {
                            templateData = {
                                ...templateData,
                                pages: version.pages,
                                variables: version.variables || {},
                                watermark: version.watermark
                            }
                        }
                    }

                    if (assignmentData && assignmentData.data && templateData?.pages) {
                        templateData.pages.forEach((page: any, pIdx: number) => {
                            page.blocks.forEach((block: any, bIdx: number) => {
                                if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                                    const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
                                    const keyStable = blockId ? `language_toggle_${blockId}` : null
                                    const keyLegacy = `language_toggle_${pIdx}_${bIdx}`
                                    const items = (keyStable ? assignmentData.data[keyStable] : null) || assignmentData.data[keyLegacy]
                                    if (items) block.props.items = items
                                }
                            })
                        })
                    }

                    setTemplate(templateData)
                }

                console.log('[CarnetPrint] Data loaded successfully')

            } catch (e: any) {
                setError(e.response?.data?.error || 'Erreur de chargement')
                console.error('[CarnetPrint] Error loading data:', e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [assignmentId, savedId, token, mode])

    // Signal ready after render is complete
    useEffect(() => {
        if (!loading) {
            console.log('[CarnetPrint] Rendering/Loading complete, signaling ready for PDF')
            // Small delay to ensure all images/fonts are loaded
            setTimeout(() => {
                // @ts-ignore
                window.__READY_FOR_PDF__ = true
                console.log('[CarnetPrint] Ready for PDF generation')
            }, 500)
        }
    }, [loading, template, student, error])

    if (loading) return <div style={{ padding: 20 }}>Chargement...</div>
    if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>
    if (!template || !student) return <div style={{ padding: 20 }}>Données introuvables</div>

    return (
        <div style={{ margin: 0, padding: 0 }}>
            <style>{`
                @page {
                    size: ${pageWidth}px ${pageHeight}px;
                    margin: 0;
                }
                @media print {
                    html, body {
                        width: ${pageWidth}px;
                        margin: 0;
                        padding: 0;
                    }
                    body {
                        background: transparent;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    #root {
                        width: ${pageWidth}px;
                        margin: 0;
                        padding: 0;
                    }
                    .page-canvas {
                        page-break-after: always;
                        page-break-inside: avoid;
                    }
                }
            `}</style>
            {template.pages
                .map((page, actualPageIndex) => ({ page, actualPageIndex }))
                .filter(({ page }) => !page.excludeFromPdf)
                .map(({ page, actualPageIndex }) => (
                    <div
                        key={actualPageIndex}
                        className="page-canvas"
                        style={{
                            height: pageHeight,
                            width: pageWidth,
                            background: page.bgColor || '#fff',
                            overflow: 'hidden',
                            position: 'relative',
                            pageBreakAfter: 'always',
                            pageBreakInside: 'avoid',
                            margin: 0
                        }}
                    >
                        {page.blocks.map((b, idx) => {
                            if (!b || !b.props) return null;
                            return (
                                <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx }}>
                                    {b.type === 'text' && (
                                        <div style={{
                                            color: b.props.color,
                                            fontSize: b.props.fontSize,
                                            fontWeight: b.props.bold ? 700 : 400,
                                            textDecoration: b.props.underline ? 'underline' : 'none',
                                            width: b.props.width,
                                            height: b.props.height,
                                            overflow: 'hidden',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {Array.isArray(b.props.runs) && b.props.runs.length ? (
                                                (b.props.runs as any[]).map((r, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            color: (r && typeof r === 'object' && typeof r.color === 'string' && r.color) ? r.color : (b.props.color || undefined),
                                                            fontWeight: (r && typeof r === 'object' && typeof r.bold === 'boolean') ? (r.bold ? 700 : 400) : (b.props.bold ? 700 : 400),
                                                            textDecoration: (r && typeof r === 'object' && typeof r.underline === 'boolean') ? (r.underline ? 'underline' : 'none') : (b.props.underline ? 'underline' : 'none'),
                                                        }}
                                                    >
                                                        {r?.text || ''}
                                                    </span>
                                                ))
                                            ) : (
                                                b.props.text
                                            )}
                                        </div>
                                    )}
                                    {b.type === 'dynamic_text' && (() => {
                                        const fatherName = String((student as any)?.fatherName || (student as any)?.parentName || '').trim()
                                        const fatherInitial = fatherName ? fatherName.charAt(0).toUpperCase() : ''
                                        const fatherInitialWithDot = fatherInitial ? `${fatherInitial}.` : ''
                                        const fullNameFatherInitial = [student.firstName, fatherInitialWithDot, student.lastName].filter(Boolean).join(' ')
                                        const dob = student.dateOfBirth ? new Date(student.dateOfBirth) : new Date(NaN)
                                        const dobDdMmYyyy = isNaN(dob.getTime()) ? '' : `${String(dob.getUTCDate()).padStart(2, '0')}/${String(dob.getUTCMonth() + 1).padStart(2, '0')}/${String(dob.getUTCFullYear())}`
                                        
                                        let text = (b.props.text || '')
                                            .replace(/\{student\.firstName\}/g, student.firstName)
                                            .replace(/\{student\.lastName\}/g, student.lastName)
                                            .replace(/\{student\.className\}/g, student.className || '')
                                            .replace(/\{student\.level\}/g, student.level || '')
                                            .replace(/\{student\.dob\}/g, student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '')
                                            .replace(/\{student\.fatherInitial\}/g, fatherInitialWithDot)
                                            .replace(/\{student\.fullNameFatherInitial\}/g, fullNameFatherInitial)
                                            .replace(/\{student\.dob_ddmmyyyy\}/g, dobDdMmYyyy)
                                        
                                        if (assignment?.data) {
                                            Object.entries(assignment.data).forEach(([k, v]) => {
                                                if (typeof v === 'string' || typeof v === 'number') {
                                                    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
                                                }
                                            })
                                        }
                                        
                                        return (
                                            <div style={{
                                                color: b.props.color,
                                                fontSize: b.props.fontSize,
                                                fontWeight: b.props.bold ? 700 : 400,
                                                textDecoration: b.props.underline ? 'underline' : 'none',
                                                width: b.props.width,
                                                height: b.props.height,
                                                overflow: 'hidden',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {text}
                                            </div>
                                        )
                                    })()}
                                    {b.type === 'image' && <CroppedImage src={b.props.url} displayWidth={b.props.width || 120} displayHeight={b.props.height || 120} cropData={b.props.cropData} borderRadius={8} />}
                                    {b.type === 'student_photo' && (
                                        student?.avatarUrl ? (
                                            <img src={student.avatarUrl} style={{ width: b.props.width || 100, height: b.props.height || 100, objectFit: 'cover', borderRadius: 8 }} alt="Student" />
                                        ) : (
                                            <div style={{ width: b.props.width || 100, height: b.props.height || 100, borderRadius: 8, background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                                                <div style={{ fontSize: 24 }}>👤</div>
                                            </div>
                                        )
                                    )}
                                    {b.type === 'student_info' && (
                                        <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>
                                            {`${student.firstName} ${student.lastName}, ${student.className || 'Classe'}, ${student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : ''}`}
                                        </div>
                                    )}
                                    {b.type === 'category_title' && (
                                        <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>
                                            {b.props.text || 'Titre catégorie'}
                                        </div>
                                    )}
                                    {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: b.props.radius || 8 }} />}
                                    {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: '50%' }} />}
                                    {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                    {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}

                                    {b.type === 'gradebook_pocket' && (
                                        <GradebookPocket
                                            number={b.props.number || '1'}
                                            width={b.props.width || 120}
                                            fontSize={b.props.fontSize}
                                        />
                                    )}

                                    {b.type === 'language_toggle' && (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: (b.props.direction as any) || 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: b.props.spacing || 12,
                                            background: b.props.backgroundColor || 'transparent',
                                            borderRadius: b.props.borderRadius || 12,
                                            padding: b.props.padding || 8,
                                            width: b.props.width,
                                            height: b.props.height,
                                            boxSizing: 'border-box'
                                        }}>
                                            {(b.props.items || []).map((it: any, i: number) => {
                                                const isAllowed = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
                                                const r = b.props.radius || 40
                                                const size = r * 2
                                                return (
                                                    <div key={i} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', position: 'relative', boxShadow: it.active ? '0 0 0 2px #6c5ce7' : 'none', opacity: isAllowed ? 0.9 : 0.5 }}>
                                                        {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {b.type === 'language_toggle_v2' && (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: (b.props.direction as any) || 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: b.props.spacing || 12,
                                            background: b.props.backgroundColor || 'transparent',
                                            borderRadius: b.props.borderRadius || 12,
                                            padding: b.props.padding || 8,
                                            width: b.props.width,
                                            height: b.props.height,
                                            boxSizing: 'border-box'
                                        }}>
                                            {(b.props.items || []).map((it: any, i: number) => {
                                                const size = 40
                                                const e = (it.emoji || '').toLowerCase()
                                                const emoji = e ? it.emoji : ((it.code || '').toLowerCase() === 'fr' ? '🇫🇷' : ((it.code || '').toLowerCase() === 'en' || (it.code || '').toLowerCase() === 'gb' || (it.code || '').toLowerCase() === 'uk') ? '🇬🇧' : ((it.code || '').toLowerCase() === 'lb' || (it.code || '').toLowerCase() === 'ar') ? '🇱🇧' : '🏳️')
                                                const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`
                                                return (
                                                    <div key={i} title={it.label} style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: it.active ? '#fff' : 'rgba(255, 255, 255, 0.5)', border: it.active ? '2px solid #2563eb' : '0.25px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none', opacity: it.active ? 1 : 0.5 }}>
                                                        <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {b.type === 'table' && (() => {
                                        const parseNum = (v: any) => {
                                            const n = typeof v === 'number' ? v : parseFloat(String(v || '0'))
                                            return isNaN(n) ? 0 : n
                                        }
                                        const cols: number[] = (b.props.columnWidths || []).map(parseNum)
                                        const rows: number[] = (b.props.rowHeights || []).map(parseNum)
                                        const cells: any[][] = b.props.cells || []
                                        const gapCol = parseNum(b.props.colGap)
                                        const gapRow = parseNum(b.props.rowGap)
                                        const expandedRows = b.props.expandedRows || false
                                        const expandedRowHeight = parseNum(b.props.expandedRowHeight || 34)
                                        const expandedDividerWidth = parseNum(b.props.expandedDividerWidth || 0.5)
                                        const expandedDividerColor = b.props.expandedDividerColor || 'rgba(255, 255, 255, 0.2)'
                                        const expandedPadding = 4
                                        const expandedTopGap = 6
                                        const expandedLanguages = b.props.expandedLanguages || [
                                            { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                            { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                            { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                        ]
                                        let width = 0
                                        const colOffsets: number[] = [0]
                                        for (let i = 0; i < cols.length; i++) {
                                            width += (cols[i] || 0)
                                            colOffsets[i + 1] = width
                                            width += gapCol
                                        }
                                        if (cols.length > 0) width -= gapCol
                                        let height = 0
                                        for (let i = 0; i < rows.length; i++) {
                                            height += (rows[i] || 0)
                                            if (expandedRows) {
                                                height += (expandedRowHeight + expandedPadding + expandedTopGap)
                                            }
                                            height += gapRow
                                        }
                                        if (rows.length > 0) height -= gapRow
                                        return (
                                            <div style={{
                                                position: 'relative',
                                                width,
                                                height,
                                                display: expandedRows ? 'flex' : 'grid',
                                                flexDirection: 'column',
                                                gap: `${gapRow}px ${gapCol}px`,
                                                gridTemplateColumns: !expandedRows ? cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' ') : undefined,
                                                gridTemplateRows: !expandedRows ? rows.map(h => `${Math.max(1, Math.round(h))}px`).join(' ') : undefined,
                                                overflow: 'visible',
                                                background: (gapRow > 0 || gapCol > 0) ? 'transparent' : (b.props.backgroundColor || 'transparent'),
                                                borderRadius: (gapRow > 0 || gapCol > 0) ? 0 : (b.props.borderRadius || 0)
                                            }}>
                                                {!expandedRows ? (
                                                    cells.flatMap((row, ri) => row.map((cell, ci) => {
                                                        const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b
                                                        const radius = b.props.borderRadius || 0
                                                        const isFirstCol = ci === 0
                                                        const isLastCol = ci === cols.length - 1
                                                        const isFirstRow = ri === 0
                                                        const isLastRow = ri === rows.length - 1
                                                        const treatAsCards = gapRow > 0
                                                        const style: React.CSSProperties = {
                                                            background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                                            borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                                            borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                                            borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                                            borderBottom: bb?.width ? `${bb.width}px solid ${bb.color || '#000'}` : 'none',
                                                            padding: 15,
                                                            boxSizing: 'border-box',
                                                            borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                            borderBottomLeftRadius: (isFirstCol && (treatAsCards || isLastRow)) ? radius : 0,
                                                            borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                            borderBottomRightRadius: (isLastCol && (treatAsCards || isLastRow)) ? radius : 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            overflow: 'hidden'
                                                        }
                                                        return (
                                                            <div key={`${ri}-${ci}`} style={style}>
                                                                {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                                            </div>
                                                        )
                                                    }))
                                                ) : (
                                                    cells.map((row, ri) => {
                                                        const radius = b.props.borderRadius || 0
                                                        const isLastRow = ri === rows.length - 1
                                                        const treatAsCards = gapRow > 0
                                                        const rowBgColor = row[0]?.fill || b.props.backgroundColor || '#f8f9fa'
                                                        const mainRowHeight = rows[ri] || 40
                                                        return (
                                                            <div key={`row-unit-${ri}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                                                <div style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' '),
                                                                    columnGap: gapCol,
                                                                    height: mainRowHeight
                                                                }}>
                                                                    {row.map((cell, ci) => {
                                                                        const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t
                                                                        const isFirstCol = ci === 0
                                                                        const isLastCol = ci === cols.length - 1
                                                                        const style: React.CSSProperties = {
                                                                            background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                                                            borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                                                            borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                                                            borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                                                            borderBottom: 'none',
                                                                            padding: 15,
                                                                            boxSizing: 'border-box',
                                                                            borderTopLeftRadius: (isFirstCol) ? radius : 0,
                                                                            borderTopRightRadius: (isLastCol) ? radius : 0,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            overflow: 'hidden'
                                                                        }
                                                                        return (
                                                                            <div key={`cell-${ri}-${ci}`} style={style}>
                                                                                {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                                <div style={{
                                                                    background: rowBgColor,
                                                                    borderBottomLeftRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                    borderBottomRightRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                    height: expandedRowHeight,
                                                                    position: 'relative',
                                                                    paddingBottom: expandedPadding
                                                                }}>
                                                                    <div style={{
                                                                        position: 'absolute', top: 0, left: 0, right: 0,
                                                                        height: expandedDividerWidth,
                                                                        background: expandedDividerColor,
                                                                        margin: '0 15px'
                                                                    }} />
                                                                    <div style={{
                                                                        height: '100%',
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        paddingLeft: 15,
                                                                        paddingTop: expandedTopGap,
                                                                        gap: 8
                                                                    }}>
                                                                        {(() => {
                                                                            const rowLangs = b.props.rowLanguages?.[ri] || expandedLanguages
                                                                            const toggleStyle = b.props.expandedToggleStyle || 'v2'
                                                                            const toggleKey = `table_${idx}_row_${ri}`
                                                                            const currentItems = assignment?.data?.[toggleKey] || rowLangs
                                                                            return currentItems.map((lang: any, li: number) => {
                                                                                const size = Math.max(12, Math.min(expandedRowHeight - 12, 20))
                                                                                const isActive = !!lang.active
                                                                                if (toggleStyle === 'v1') {
                                                                                    const logo = lang.logo || (() => {
                                                                                        const c = (lang.code || '').toLowerCase()
                                                                                        if (c === 'en' || c === 'uk' || c === 'gb') return 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg'
                                                                                        if (c === 'fr') return 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg'
                                                                                        if (c === 'ar' || c === 'lb') return 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg'
                                                                                        return ''
                                                                                    })()
                                                                                    return (
                                                                                        <div key={li} title={lang.label} style={{ width: size, height: size, minWidth: size, borderRadius: '50%', overflow: 'hidden', background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)', border: isActive ? '0.25px solid #fff' : '0.25px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', opacity: isActive ? 1 : 0.6 }}>
                                                                                            {logo ? <img src={logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isActive ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                                                        </div>
                                                                                    )
                                                                                }
                                                                                const e = lang.emoji
                                                                                const emoji = e && e.length >= 2 ? e : (() => {
                                                                                    const c = (lang.code || '').toLowerCase()
                                                                                    if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                                                    if (c === 'fr') return '🇫🇷'
                                                                                    if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                                                    return '🏳️'
                                                                                })()
                                                                                const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`
                                                                                return (
                                                                                    <div key={li} title={lang.label} style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)', border: isActive ? '0.25px solid #fff' : '0.25px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', opacity: isActive ? 1 : 0.6 }}>
                                                                                        <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                                                    </div>
                                                                                )
                                                                            })
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                )}
                                            </div>
                                        )
                                    })()}
                                    {b.type === 'signature' && (
                                        <div style={{ fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>
                                            {(b.props.labels || []).join(' / ')}
                                        </div>
                                    )}

                                    {b.type === 'signature_date' && (() => {
                                        const configuredLevel = String((b.props as any)?.level || getBlockLevel(b) || '').trim() || null
                                        const semester = getSemesterNumber(b)
                                        const found = pickSignatureForLevelAndSemester({ level: configuredLevel, semester })
                                        if (!found) return null

                                        const dateStr = formatDdMmYyyyColon(found.signedAt)
                                        const showMeta = (b.props as any)?.showMeta !== false
                                        const prefix = 'Signé le:'
                                        const semLabel = semester ? `S${semester}` : ''
                                        const levelLabel = configuredLevel || ''
                                        const metaPart = `${levelLabel}${levelLabel && semLabel ? ' ' : ''}${semLabel}`
                                        const text = showMeta
                                            ? `${prefix}${metaPart ? ` ${metaPart}` : ''} ${dateStr}`
                                            : `${prefix} ${dateStr}`

                                        return (
                                            <div style={{
                                                width: b.props.width || 220,
                                                height: b.props.height || 34,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: b.props.align || 'flex-start',
                                                fontSize: b.props.fontSize || 12,
                                                color: b.props.color || '#111',
                                                overflow: 'hidden',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {text}
                                            </div>
                                        )
                                    })()}

                                    {b.type === 'signature_box' && (() => {
                                        const blockLevel = getBlockLevel(b)
                                        const history = assignment?.data?.signatures || []
                                        const promotions = assignment?.data?.promotions || []

                                        // Check current signature
                                        if (!blockLevel) {
                                            if (signature) {
                                                return (
                                                    <div style={{ width: b.props.width || 200, height: b.props.height || 80, border: 'none', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>
                                                        {signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'}
                                                    </div>
                                                )
                                            }
                                        } else {
                                            // Block has specific level
                                            const sigLevel = (signature as any)?.level
                                            if (signature && ((sigLevel && sigLevel === blockLevel) || (!sigLevel && student?.level === blockLevel))) {
                                                return (
                                                    <div style={{ width: b.props.width || 200, height: b.props.height || 80, border: 'none', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>
                                                        {signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'}
                                                    </div>
                                                )
                                            }
                                        }

                                        // Check history for matching signature
                                        if (blockLevel) {
                                            const matchingSig = history.find((sig: any) => {
                                                if (b.props.period === 'end-year' && sig.type !== 'end_of_year') return false
                                                if ((!b.props.period || b.props.period === 'mid-year') && (sig.type === 'end_of_year')) return false

                                                if (sig.level && sig.level === blockLevel) return true

                                                if (sig.schoolYearName) {
                                                    const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                                                    if (promo && promo.from === blockLevel) return true
                                                }
                                                return false
                                            })

                                            if (matchingSig) {
                                                return (
                                                    <div style={{ width: b.props.width || 200, height: b.props.height || 80, border: 'none', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>
                                                        {matchingSig.signatureUrl ? <img src={matchingSig.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : `✓ Signé (${matchingSig.schoolYearName || 'Ancien'})`}
                                                    </div>
                                                )
                                            }
                                        }

                                        return null
                                    })()}

                                    {b.type === 'dropdown' && (() => {
                                        // Only render if a value is selected
                                        const currentValue = b.props.dropdownNumber
                                            ? assignment?.data?.[`dropdown_${b.props.dropdownNumber}`]
                                            : b.props.variableName ? assignment?.data?.[b.props.variableName] : ''
                                        if (!currentValue) return null
                                        return (
                                            <div style={{ width: b.props.width || 200 }}>
                                                {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                                                <div style={{
                                                    width: '100%',
                                                    minHeight: b.props.height || 32,
                                                    fontSize: b.props.fontSize || 12,
                                                    color: b.props.color || '#333',
                                                    padding: '4px 8px',
                                                    borderRadius: 4,
                                                    border: '1px solid #ccc',
                                                    background: '#fff',
                                                    wordWrap: 'break-word',
                                                    whiteSpace: 'pre-wrap'
                                                }}>
                                                    {currentValue}
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {b.type === 'dropdown_reference' && (() => {
                                        const dropdownNum = b.props.dropdownNumber || 1
                                        const value = assignment?.data?.[`dropdown_${dropdownNum}`]
                                        // Don't render if no value
                                        if (!value) return null
                                        return (
                                            <div style={{
                                                color: b.props.color || '#333',
                                                fontSize: b.props.fontSize || 12,
                                                width: b.props.width || 200,
                                                minHeight: b.props.height || 'auto',
                                                wordWrap: 'break-word',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {value}
                                            </div>
                                        )
                                    })()}

                                    {b.type === 'promotion_info' && (() => {
                                        // Check if block should be visible based on signature status
                                        if (!isBlockVisible(b)) return null

                                        return (
                                            <div style={{
                                                width: b.props.width || (b.props.field ? 150 : 300),
                                                height: b.props.height || (b.props.field ? 30 : 100),
                                                border: b.props.field ? 'none' : '1px solid #6c5ce7',
                                                padding: b.props.field ? 0 : 10,
                                                borderRadius: 8,
                                                fontSize: b.props.fontSize || 12,
                                                color: b.props.color || '#2d3436',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                textAlign: 'center'
                                            }}>
                                                {(() => {
                                                    const promotions = assignment?.data?.promotions || []
                                                    const blockLevel = getBlockLevel(b)
                                                    const explicitTarget = b.props.targetLevel as string | undefined

                                                    if (b.props.field === 'student') return <div>{student?.firstName} {student?.lastName}</div>
                                                    if (b.props.field === 'studentFirstName') return <div>{student?.firstName}</div>
                                                    if (b.props.field === 'studentLastName') return <div>{student?.lastName}</div>
                                                    if (b.props.field === 'currentLevel') return <div>{student?.level}</div>

                                                    let promo: any = null

                                                    // Strategy 1: Match by explicit target level
                                                    if (explicitTarget) {
                                                        promo = promotions.find((p: any) => p.to === explicitTarget)
                                                    }

                                                    // Strategy 2: Match by block level (from)
                                                    if (!promo && blockLevel) {
                                                        promo = promotions.find((p: any) => p.from === blockLevel)
                                                    }

                                                    // Strategy 3: If only one promotion exists and no specific target/level
                                                    if (!promo && !explicitTarget && !blockLevel) {
                                                        if (promotions.length === 1) {
                                                            promo = { ...(promotions[0] as any) }
                                                        }
                                                    }

                                                    // Strategy 4: Try to find from signature history
                                                    if (!promo && blockLevel) {
                                                        const history = assignment?.data?.signatures || []
                                                        const isMidYearBlock = b.props.period === 'mid-year'
                                                        const wantEndOfYear = b.props.period === 'end-year'
                                                        const candidates = history.filter((sig: any) => {
                                                            if (wantEndOfYear) {
                                                                if (sig.type !== 'end_of_year') return false
                                                            } else if (isMidYearBlock) {
                                                                if (sig.type && sig.type !== 'standard') return false
                                                            }
                                                            if (sig.level && sig.level !== blockLevel) return false
                                                            return true
                                                        }).sort((a: any, bb: any) => {
                                                            const ad = new Date(a.signedAt || 0).getTime()
                                                            const bd = new Date(bb.signedAt || 0).getTime()
                                                            return bd - ad
                                                        })

                                                        const sig = candidates[0]
                                                        if (sig) {
                                                            let yearLabel = sig.schoolYearName as string | undefined
                                                            if (!yearLabel && sig.signedAt) {
                                                                const d = new Date(sig.signedAt)
                                                                const y = d.getFullYear()
                                                                const m = d.getMonth()
                                                                const startYear = m >= 8 ? y : y - 1
                                                                yearLabel = `${startYear}/${startYear + 1}`
                                                            }
                                                            if (!yearLabel) {
                                                                const currentYear = new Date().getFullYear()
                                                                const month = new Date().getMonth()
                                                                const startYear = month >= 8 ? currentYear : currentYear - 1
                                                                yearLabel = `${startYear}/${startYear + 1}`
                                                            }

                                                            const baseLevel = blockLevel
                                                            const target = explicitTarget || getNextLevel(baseLevel || '') || ''

                                                            promo = {
                                                                year: yearLabel,
                                                                from: baseLevel,
                                                                to: target || '?',
                                                                class: student?.className || ''
                                                            }
                                                        }
                                                    }

                                                    if (!promo) {
                                                        const isEndYear = b.props.period === 'end-year'
                                                        const candidate = isEndYear ? (finalSignature || signature) : signature
                                                        const candidateLevel = String(candidate?.level || '').trim()
                                                        const matchesLevel = !blockLevel || !candidateLevel || candidateLevel === blockLevel

                                                        if (candidate && candidate.signedAt && matchesLevel) {
                                                            let yearLabel = String(candidate.schoolYearName || '').trim()
                                                            if (!yearLabel) {
                                                                const d = new Date(candidate.signedAt)
                                                                const y = d.getFullYear()
                                                                const m = d.getMonth()
                                                                const startYear = m >= 8 ? y : y - 1
                                                                yearLabel = `${startYear}/${startYear + 1}`
                                                            }

                                                            const baseLevel = blockLevel || candidateLevel || student?.level || ''
                                                            const target = explicitTarget || getNextLevel(baseLevel || '') || ''

                                                            promo = {
                                                                year: yearLabel,
                                                                from: baseLevel,
                                                                to: target || '?',
                                                                class: student?.className || ''
                                                            }
                                                        }
                                                    }

                                                    if (!promo) {
                                                        return null
                                                    }

                                                    // Enrich existing promo with current data if missing
                                                    if (!promo.class && student?.className) promo.class = student.className
                                                    if (!promo.from) {
                                                        if (blockLevel) promo.from = blockLevel
                                                        else if (student?.level) promo.from = student.level
                                                    }

                                                    const yearLabel = getPromotionYearLabel(promo, blockLevel)
                                                    if (!b.props.field) {
                                                        return (
                                                            <>
                                                                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                                <div>{student?.firstName} {student?.lastName}</div>
                                                                <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Année {yearLabel}</div>
                                                            </>
                                                        )
                                                    } else if (b.props.field === 'level') {
                                                        return <div style={{ fontWeight: 'bold' }}>{promo.to}</div>
                                                    } else if (b.props.field === 'student') {
                                                        return <div>{student?.firstName} {student?.lastName}</div>
                                                    } else if (b.props.field === 'studentFirstName') {
                                                        return <div>{student?.firstName}</div>
                                                    } else if (b.props.field === 'studentLastName') {
                                                        return <div>{student?.lastName}</div>
                                                    } else if (b.props.field === 'year') {
                                                        return <div>{yearLabel}</div>
                                                    } else if (b.props.field === 'currentYear') {
                                                        return <div>{String(promo.year || '')}</div>
                                                    } else if (b.props.field === 'class') {
                                                        const raw = promo.class || ''
                                                        const parts = raw.split(/\s*[-\s]\s*/)
                                                        const section = parts.length ? parts[parts.length - 1] : raw
                                                        return <div>{section}</div>
                                                    } else if (b.props.field === 'currentLevel') {
                                                        return <div>{promo.from || ''}</div>
                                                    }
                                                    return null
                                                })()}
                                            </div>
                                        )
                                    })()}

                                    {b.type === 'teacher_text' && (
                                        <div style={{
                                            width: b.props.width || 300,
                                            height: b.props.height || 60,
                                            border: '1px solid #ddd',
                                            borderRadius: 4,
                                            padding: 8,
                                            fontSize: b.props.fontSize || 12,
                                            color: b.props.color || '#2d3436',
                                            background: '#fff',
                                            position: 'relative',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {(() => {
                                                // Level filtering: if block has a specific level, check if it matches student's level
                                                if (b.props.level && student?.level && b.props.level !== student.level) {
                                                    return null
                                                }

                                                const stableBlockId =
                                                    typeof b?.props?.blockId === 'string' && b.props.blockId.trim()
                                                        ? b.props.blockId.trim()
                                                        : null
                                                const blockId = stableBlockId || `teacher_text_${actualPageIndex}_${idx}`
                                                const textValue = assignment?.data?.[blockId] || ''

                                                return (
                                                    <div style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        color: textValue ? 'inherit' : '#999'
                                                    }}>
                                                        {textValue || (b.props.placeholder || 'Texte éditable par le prof polyvalent...')}
                                                    </div>
                                                )
                                            })()}
                                            {b.props.label && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: -10,
                                                    left: 8,
                                                    background: '#fff',
                                                    padding: '2px 6px',
                                                    fontSize: 10,
                                                    color: '#e17055',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {b.props.label}
                                                </div>
                                            )}
                                        </div>
                                    )}



                                    {b.type === 'qr' && (
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=${b.props.width || 120}x${b.props.height || 120}&data=${encodeURIComponent(b.props.url || '')}`}
                                            style={{ width: b.props.width || 120, height: b.props.height || 120 }}
                                            alt="QR Code"
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
        </div>
    )
}
