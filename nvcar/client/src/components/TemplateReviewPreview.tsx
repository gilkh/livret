import { useState, useEffect } from 'react'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import { GradebookPocket } from './GradebookPocket'
import { CroppedImage } from './CroppedImage'
import { formatDdMmYyyyColon } from '../utils/dateFormat'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }

const pageWidth = 800
const pageHeight = 1120

interface TemplateReviewPreviewProps {
    template: Template
    student: any
    assignment: any
    signature: any
    finalSignature: any
    activeSemester?: number
}

export default function TemplateReviewPreview({ template, student, assignment, signature, finalSignature, activeSemester: propActiveSemester }: TemplateReviewPreviewProps) {
    const { levels } = useLevels()
    const { activeYear } = useSchoolYear()
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)

    // Helper function to check if an item's level is at or below the student's current level
    // This allows viewing toggles for PS, MS, GS based on student's current level
    // PS students: show PS toggles only
    // MS students: show PS and MS toggles
    // GS students: show PS, MS, and GS toggles
    const isLevelAtOrBelow = (itemLevel: string | undefined, itemLevels: string[] | undefined, studentLevel: string | undefined) => {
        if (!studentLevel) return true

        // Create a map of level name to order
        const levelOrderMap: Record<string, number> = {}
        levels.forEach(l => { levelOrderMap[l.name.toUpperCase()] = l.order })

        const studentOrder = levelOrderMap[studentLevel.toUpperCase()]
        if (studentOrder === undefined) return true // Unknown level, allow

        // Check single level property
        if (itemLevel) {
            const itemOrder = levelOrderMap[itemLevel.toUpperCase()]
            if (itemOrder === undefined) return true // Unknown item level, allow
            return itemOrder <= studentOrder
        }

        // Check levels array - item is accessible if ANY of its levels are at or below student level
        if (itemLevels && itemLevels.length > 0) {
            return itemLevels.some(lvl => {
                const itemOrder = levelOrderMap[lvl.toUpperCase()]
                if (itemOrder === undefined) return true // Unknown item level, allow
                return itemOrder <= studentOrder
            })
        }

        // No level restrictions, allow
        return true
    }

    // Determine active semester
    // If passed as prop, use it. Otherwise infer from signatures/status.
    const activeSemester = propActiveSemester || ((finalSignature || assignment?.isCompletedSem2) ? 2 : 1)

    // Derived state for view-only
    const editMode = false
    const canEdit = false

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdown(null)
        if (openDropdown) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [openDropdown])

    const getNextLevel = (current: string) => {
        if (!current) return null

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
        return null
    }

    const getBlockLevel = (b: Block) => {
        if (b.props.level) return b.props.level
        const label = (b.props.label || '').toUpperCase()
        if (/\bPS\b/.test(label)) return 'PS'
        if (/\bMS\b/.test(label)) return 'MS'
        if (/\bGS\b/.test(label)) return 'GS'
        if (/\bEB1\b/.test(label)) return 'EB1'
        if (/\bKG1\b/.test(label)) return 'KG1'
        if (/\bKG2\b/.test(label)) return 'KG2'
        if (/\bKG3\b/.test(label)) return 'KG3'
        return null
    }

    const getSemesterNumber = (b: Block): 1 | 2 | null => {
        const raw = (b.props as any)?.semester ?? (b.props as any)?.semestre ?? null
        if (raw === 1 || raw === '1') return 1
        if (raw === 2 || raw === '2') return 2

        // Back-compat: allow using period to imply semester
        const p = String((b.props as any)?.period || '')
        if (p === 'mid-year') return 1
        if (p === 'end-year') return 2
        return null
    }

    const pickSignatureForLevelAndSemester = (opts: { level: string | null; semester: 1 | 2 | null }) => {
        const { level, semester } = opts
        const sigs: any[] = []

        const history = (assignment as any)?.data?.signatures
        if (Array.isArray(history)) sigs.push(...history)
        if (signature) sigs.push(signature as any)
        if (finalSignature) sigs.push(finalSignature as any)

        const promotions = Array.isArray((assignment as any)?.data?.promotions) ? (assignment as any).data.promotions : []
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

        const nextFromActive = computeNextSchoolYearName(activeYear?.name)
        if (nextFromActive) return nextFromActive

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

    const isBlockVisible = (b: Block) => {
        const blockLevel = getBlockLevel(b)

        // Case 1: Block has NO specific level (generic)
        if (!blockLevel) {
            // Use current active signature state
            if (b.props.period === 'mid-year' && !signature && !b.props.field?.includes('signature')) return false
            if (b.props.period === 'end-year' && !finalSignature && !b.props.field?.includes('signature')) return false
            return true
        }

        // Case 2: Block HAS a level
        // Check if we have a signature for that level
        let isSignedStandard = false
        let isSignedFinal = false

        // Check current props
        if (student?.level === blockLevel) {
            if (signature) isSignedStandard = true
            if (finalSignature) isSignedFinal = true
        }

        // Check history
        if (!isSignedStandard || !isSignedFinal) {
            const history = assignment?.data?.signatures || []
            const promotions = assignment?.data?.promotions || []

            history.forEach((sig: any) => {
                if (sig.schoolYearName) {
                    const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                    if (promo && promo.from === blockLevel) {
                        if (sig.type === 'standard' || !sig.type) isSignedStandard = true
                        if (sig.type === 'end_of_year') isSignedFinal = true
                    }
                }
            })
        }

        if (b.props.period === 'mid-year' && !isSignedStandard && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false
        if (b.props.period === 'end-year' && !isSignedFinal && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false

        return true
    }

    const getScopedData = (key: string, blockLevel: string | null) => {
        if (!assignment?.data) return undefined

        // 1. Try fully scoped key (Primary)
        if (blockLevel) {
            const scopedKey = `${key}_${blockLevel}`
            if (assignment.data[scopedKey] !== undefined) return assignment.data[scopedKey]
        }

        // 2. Fallback to unscoped key (Legacy), but ONLY if block matches origin level
        // Calculate origin level
        let originLevel = null
        const promotions = assignment.data.promotions || []
        if (promotions.length > 0) {
            // Sort by date/year to find first
            const sorted = [...promotions].sort((a: any, b: any) => {
                const da = new Date(a.date || 0).getTime()
                const db = new Date(b.date || 0).getTime()
                return da - db
            })
            originLevel = sorted[0].from
        }

        // If no promotions, assume origin is current level? Or allow fallback?
        // If promotions empty, it means student has always been in this level (or assignment created here).
        // So fallback is safe.
        const allowFallback = !originLevel || (blockLevel === originLevel) || !blockLevel

        if (allowFallback) {
            return assignment.data[key]
        }

        return undefined
    }

    const mergeToggleItems = (templateItems: any[], savedItems: any[] | null | undefined) => {
        const base = Array.isArray(templateItems) ? templateItems : []
        const saved = Array.isArray(savedItems) ? savedItems : null

        if (!base.length) return saved || []
        if (!saved || !saved.length) return base

        const codes = base
            .map(it => (typeof it?.code === 'string' && it.code.trim() ? it.code.trim() : ''))
            .filter(Boolean)
        const lowerCodes = codes.map(c => c.toLowerCase())
        const hasUniqueCodes = codes.length === base.length && new Set(lowerCodes).size === lowerCodes.length

        if (hasUniqueCodes) {
            const savedByCode = new Map<string, any>()
            saved.forEach(it => {
                if (typeof it?.code === 'string' && it.code.trim()) {
                    savedByCode.set(it.code.trim().toLowerCase(), it)
                }
            })

            return base.map(it => {
                const key = typeof it?.code === 'string' ? it.code.trim().toLowerCase() : ''
                const savedItem = key ? savedByCode.get(key) : undefined
                const active = typeof savedItem?.active === 'boolean' ? savedItem.active : it.active
                return { ...it, active }
            })
        }

        return base.map((it, i) => {
            const savedItem = saved[i]
            const active = typeof savedItem?.active === 'boolean' ? savedItem.active : it.active
            return { ...it, active }
        })
    }

    if (!template) return null

    return (
        <div>
            <div style={{ marginTop: 20, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)} style={{
                    background: continuousScroll ? 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)' : '#f1f5f9',
                    color: continuousScroll ? 'white' : '#475569',
                    fontWeight: 500,
                    border: '1px solid #cbd5e1',
                    padding: '10px 16px'
                }}>
                    {continuousScroll ? '📄 Vue page par page' : '📚 Vue continue'}
                </button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        className="btn secondary"
                        onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                        disabled={selectedPage === 0 || continuousScroll}
                        style={{
                            padding: '10px 16px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            opacity: (selectedPage === 0 || continuousScroll) ? 0.5 : 1
                        }}
                    >
                        ← Précédent
                    </button>
                    <select
                        value={selectedPage}
                        onChange={e => {
                            const pageNum = Number(e.target.value)
                            setSelectedPage(pageNum)
                            if (continuousScroll) {
                                setTimeout(() => {
                                    const pageElement = document.getElementById(`page-${pageNum}`)
                                    if (pageElement) {
                                        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }
                                }, 100)
                            }
                        }}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            fontWeight: 500,
                            color: '#475569',
                            background: 'white'
                        }}
                    >
                        {template.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
                    </select>
                    <button
                        className="btn secondary"
                        onClick={() => setSelectedPage(Math.min(template.pages.length - 1, selectedPage + 1))}
                        disabled={selectedPage === template.pages.length - 1 || continuousScroll}
                        style={{
                            padding: '10px 16px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            opacity: (selectedPage === template.pages.length - 1 || continuousScroll) ? 0.5 : 1
                        }}
                    >
                        Suivant →
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
                {(continuousScroll ? template.pages : [template.pages[selectedPage]]).map((page, pageIdx) => {
                    const actualPageIndex = continuousScroll ? pageIdx : selectedPage
                    return (
                        <div
                            key={actualPageIndex}
                            id={`page-${actualPageIndex}`}
                            className="card page-canvas"
                            style={{ height: pageHeight, width: pageWidth, background: page.bgColor || '#fff', overflow: 'hidden', position: 'relative' }}
                        >
                            {continuousScroll && <div style={{ position: 'absolute', top: -30, left: 0, color: '#888', fontSize: 14, fontWeight: 600 }}>Page {actualPageIndex + 1}</div>}
                            <div className="page-margins" />
                            {page.blocks.map((b, idx) => {
                                if (!b || !b.props) return null;
                                return (
                                    <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
                                        {b.type === 'text' && (
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ color: b.props.color, fontSize: b.props.fontSize, fontWeight: b.props.bold ? 700 : 400, textDecoration: b.props.underline ? 'underline' : 'none' }}>
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
                                                boxSizing: 'border-box',
                                                // Visibility check
                                                ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                            }}>
                                                {(() => {
                                                    const toggleKeyOriginal = `language_toggle_${actualPageIndex}_${idx}`
                                                    const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                    const toggleKeyStable = blockId ? `language_toggle_${blockId}` : null
                                                    const blockLevel = getBlockLevel(b)
                                                    const savedItems =
                                                        (toggleKeyStable ? getScopedData(toggleKeyStable, blockLevel) : null) ||
                                                        getScopedData(toggleKeyOriginal, blockLevel)
                                                    const baseItems = Array.isArray(b.props.items) ? b.props.items : []
                                                    const items = mergeToggleItems(baseItems, savedItems)

                                                    return items.map((it: any, i: number) => {
                                                    // Check level - show if at or below student's current level
                                                    const isAllowed = isLevelAtOrBelow(undefined, it.levels, student?.level);

                                                    const size = 40
                                                    const getEmoji = (item: any) => {
                                                        const e = item.emoji
                                                        if (e && e.length >= 2) return e
                                                        const c = (item.code || '').toLowerCase()
                                                        if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                        if (c === 'fr') return '🇫🇷'
                                                        if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                        return '🏳️'
                                                    }
                                                    const emoji = getEmoji(it)
                                                    const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`
                                                    return (
                                                        <div
                                                            key={i}
                                                            title={it.label}
                                                            style={{
                                                                width: size,
                                                                height: size,
                                                                minWidth: size,
                                                                borderRadius: '50%',
                                                                background: it.active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                                                border: it.active ? '2px solid #2563eb' : '0.25px solid #fff',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'default',
                                                                boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                                                opacity: isAllowed ? (it.active ? 1 : 0.9) : 0.5,
                                                                filter: 'none'
                                                            }}
                                                        >
                                                            {emoji ? (
                                                                <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                            ) : it.logo ? (
                                                                <img src={it.logo} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                            ) : (
                                                                <span style={{ fontSize: 20, lineHeight: 1 }}>{getEmoji(it)}</span>
                                                            )}
                                                        </div>
                                                    )
                                                })
                                                })()}
                                            </div>
                                        )}
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
                                        {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                        {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                        {b.type === 'gradebook_pocket' && (
                                            <GradebookPocket
                                                number={b.props.number || '1'}
                                                width={b.props.width || 120}
                                                fontSize={b.props.fontSize}
                                            />
                                        )}
                                        {b.type === 'language_toggle' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                                {(() => {
                                                    const toggleKeyOriginal = `language_toggle_${actualPageIndex}_${idx}`
                                                    const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                    const toggleKeyStable = blockId ? `language_toggle_${blockId}` : null
                                                    const blockLevel = getBlockLevel(b)
                                                    const savedItems =
                                                        (toggleKeyStable ? getScopedData(toggleKeyStable, blockLevel) : null) ||
                                                        getScopedData(toggleKeyOriginal, blockLevel)
                                                    const baseItems = Array.isArray(b.props.items) ? b.props.items : []
                                                    const items = mergeToggleItems(baseItems, savedItems)

                                                    return items.map((it: any, i: number) => {
                                                    // Check level - show if at or below student's current level
                                                    const isAllowed = isLevelAtOrBelow(undefined, it.levels, student?.level);

                                                    const r = b.props.radius || 40
                                                    const size = r * 2
                                                    return (
                                                        <div
                                                            key={i}
                                                            style={{
                                                                width: size,
                                                                height: size,
                                                                borderRadius: '50%',
                                                                overflow: 'hidden',
                                                                position: 'relative',
                                                                cursor: 'default',
                                                                boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                                opacity: isAllowed ? (it.active ? 1 : 0.9) : 0.5
                                                            }}
                                                        >
                                                            {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                        </div>
                                                    )
                                                })
                                                })()}
                                            </div>
                                        )}
                                        {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                        {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                                        {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{(() => {
                                            let text = b.props.text || ''
                                            if (student) {
                                                const fatherName = String((student as any)?.fatherName || (student as any)?.parentName || '').trim()
                                                const fatherInitial = fatherName ? fatherName.charAt(0).toUpperCase() : ''
                                                const fatherInitialWithDot = fatherInitial ? `${fatherInitial}.` : ''
                                                const fullNameFatherInitial = [student.firstName, fatherInitialWithDot, student.lastName].filter(Boolean).join(' ')
                                                const dob = new Date(student.dateOfBirth)
                                                const dobDdMmYyyy = isNaN(dob.getTime()) ? '' : `${String(dob.getUTCDate()).padStart(2, '0')}/${String(dob.getUTCMonth() + 1).padStart(2, '0')}/${String(dob.getUTCFullYear())}`

                                                text = text
                                                    .replace(/{student.firstName}/g, student.firstName)
                                                    .replace(/{student.lastName}/g, student.lastName)
                                                    .replace(/{student.dob}/g, student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '')
                                                    .replace(/{student.fatherInitial}/g, fatherInitialWithDot)
                                                    .replace(/{student.fullNameFatherInitial}/g, fullNameFatherInitial)
                                                    .replace(/{student.dob_ddmmyyyy}/g, dobDdMmYyyy)
                                            }
                                            if (assignment?.data) {
                                                Object.entries(assignment.data).forEach(([k, v]) => {
                                                    text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
                                                })
                                            }
                                            return text
                                        })()}</div>}
                                        {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Nom, Classe, Naissance</div>}
                                        {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                                        {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                                        {b.type === 'dropdown' && (() => {
                                            // Check visibility first
                                            if (!isBlockVisible(b)) return null

                                            // Check if dropdown is allowed for current level - show if at or below student's level
                                            const isLevelAllowed = isLevelAtOrBelow(undefined, b.props.levels, student?.level)
                                            // Check if dropdown is allowed for current semester (default to both semesters if not specified)
                                            const dropdownSemesters = b.props.semesters || [1, 2]
                                            const isSemesterAllowed = dropdownSemesters.includes(activeSemester)
                                            const isDropdownAllowed = isLevelAllowed && isSemesterAllowed

                                            return (
                                                <div style={{
                                                    width: b.props.width || 200,
                                                    position: 'relative',
                                                    opacity: isDropdownAllowed ? 1 : 0.5,
                                                    pointerEvents: isDropdownAllowed ? 'auto' : 'none'
                                                }}>
                                                    <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>Dropdown #{b.props.dropdownNumber || '?'}</div>
                                                    {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                                                    <div
                                                        style={{
                                                            width: '100%',
                                                            minHeight: b.props.height || 32,
                                                            fontSize: b.props.fontSize || 12,
                                                            color: b.props.color || '#333',
                                                            padding: '4px 24px 4px 8px',
                                                            borderRadius: 4,
                                                            border: '1px solid #ccc',
                                                            background: '#f9f9f9',
                                                            cursor: 'default',
                                                            position: 'relative',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            wordWrap: 'break-word',
                                                            whiteSpace: 'pre-wrap'
                                                        }}
                                                    >
                                                        {(() => {
                                                            const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                            const stableKey = blockId ? `dropdown_${blockId}` : null
                                                            const legacyKey = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                            const blockLevel = getBlockLevel(b)
                                                            const currentValue =
                                                                (stableKey ? getScopedData(stableKey, blockLevel) : undefined) ??
                                                                (legacyKey ? getScopedData(legacyKey, blockLevel) : undefined) ??
                                                                ''
                                                            return currentValue || 'Sélectionner...'
                                                        })()}
                                                        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</div>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                        {b.type === 'dropdown_reference' && (() => {
                                            const dropdownNum = b.props.dropdownNumber || 1
                                            const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                            const stableKey = blockId ? `dropdown_${blockId}` : null
                                            const legacyKey = dropdownNum ? `dropdown_${dropdownNum}` : null
                                            const raw =
                                                (stableKey ? assignment?.data?.[stableKey] : undefined) ??
                                                (legacyKey ? assignment?.data?.[legacyKey] : undefined)
                                            const value = typeof raw === 'string' ? raw.trim() : raw
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
                                                    {String(value)}
                                                </div>
                                            )
                                        })()}
                                        {b.type === 'promotion_info' && (
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

                                                    let promo: any = null

                                                    if (explicitTarget) {
                                                        promo = promotions.find((p: any) => p.to === explicitTarget)
                                                    }

                                                    if (!promo && blockLevel) {
                                                        promo = promotions.find((p: any) => p.from === blockLevel)
                                                    }

                                                    if (!promo && !explicitTarget && !blockLevel) {
                                                        if (promotions.length === 1) {
                                                            promo = { ...(promotions[0] as any) }
                                                        }
                                                    }

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
                                                        }).sort((a: any, b: any) => {
                                                            const ad = new Date(a.signedAt || 0).getTime()
                                                            const bd = new Date(b.signedAt || 0).getTime()
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
                                                                const startYear = currentYear
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
                                                        const blockIsCurrentLevel = !!blockLevel && !!student?.level && blockLevel === student.level
                                                        const isMidYearBlock = b.props.period === 'mid-year'
                                                        const hasMidSignature = !!signature
                                                        const hasFinalSignature = !!finalSignature
                                                        const canPredict = isMidYearBlock
                                                            ? (hasMidSignature && (blockIsCurrentLevel || (!blockLevel && promotions.length === 0)))
                                                            : (hasFinalSignature && (blockIsCurrentLevel || (!blockLevel && promotions.length === 0)))

                                                        if (!canPredict) {
                                                            return null
                                                        }

                                                        let startYear = 0
                                                        if (activeYear && activeYear.name) {
                                                            const m = activeYear.name.match(/(\d{4})/)
                                                            if (m) startYear = parseInt(m[1], 10)
                                                        }

                                                        if (!startYear) return null

                                                        const baseLevel = blockLevel || student?.level || ''
                                                        const target = explicitTarget || getNextLevel(baseLevel || '') || ''
                                                        const displayYear = `${startYear}/${startYear + 1}`

                                                        promo = {
                                                            year: displayYear,
                                                            from: baseLevel,
                                                            to: target || '?',
                                                            class: student?.className || ''
                                                        }
                                                    } else {
                                                        if (!promo.class && student?.className) promo.class = student.className
                                                        if (!promo.from) {
                                                            if (blockLevel) promo.from = blockLevel
                                                            else if (student?.level) promo.from = student.level
                                                        }
                                                    }

                                                    if (promo) {
                                                        if (!b.props.field) {
                                                            return (
                                                                <>
                                                                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                                    <div>{student?.firstName} {student?.lastName}</div>
                                                                    <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Next Year {getPromotionYearLabel(promo, blockLevel)}</div>
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
                                                            return <div>{getPromotionYearLabel(promo, blockLevel)}</div>
                                                        } else if (b.props.field === 'currentYear') {
                                                            const label = activeYear?.name || promo.year || ''
                                                            return <div>{String(label)}</div>
                                                        } else if (b.props.field === 'class') {
                                                            const raw = promo.class || ''
                                                            const parts = raw.split(/\s*[-\s]\s*/)
                                                            const section = parts.length ? parts[parts.length - 1] : raw
                                                            return <div>{section}</div>
                                                        } else if (b.props.field === 'currentLevel') {
                                                            return <div>{promo.from || ''}</div>
                                                        }
                                                    }
                                                    return null
                                                })()}
                                            </div>
                                        )}
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
                                        {b.type === 'table' && (
                                            (() => {
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
                                                const toggleStyle = b.props.expandedToggleStyle || 'v2'

                                                let width = 0
                                                for (let i = 0; i < cols.length; i++) {
                                                    width += (cols[i] || 0)
                                                    width += gapCol
                                                }
                                                if (cols.length > 0) width -= gapCol

                                                let height = 0
                                                for (let i = 0; i < rows.length; i++) {
                                                    height += (rows[i] || 0)
                                                    if (expandedRows) {
                                                        height += (expandedRowHeight + expandedPadding)
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
                                                                const isFirstRow = ri === 0
                                                                const isLastRow = ri === rows.length - 1
                                                                const treatAsCards = gapRow > 0
                                                                const rowBgColor = row[0]?.fill || b.props.backgroundColor || '#f8f9fa'
                                                                const mainRowHeight = rows[ri] || 40

                                                                return (
                                                                    <div key={`row-unit-${ri}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', marginBottom: (expandedRows && !isLastRow) ? gapRow : 0 }}>

                                                                        {/* Main Row Grid */}
                                                                        <div style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' '),
                                                                            columnGap: gapCol,
                                                                            height: mainRowHeight
                                                                        }}>
                                                                            {row.map((cell: any, ci: number) => {
                                                                                const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b
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
                                                                                    borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                                    borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                                    borderBottomLeftRadius: 0,
                                                                                    borderBottomRightRadius: 0,
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

                                                                        {/* Expanded Row Section */}
                                                                        <div style={{
                                                                            background: rowBgColor,
                                                                            borderBottomLeftRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                            borderBottomRightRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                            height: expandedRowHeight,
                                                                            position: 'relative',
                                                                            paddingBottom: expandedPadding
                                                                        }}>
                                                                            {/* Divider Line */}
                                                                            <div style={{
                                                                                position: 'absolute', top: 0, left: 0, right: 0,
                                                                                height: expandedDividerWidth,
                                                                                background: expandedDividerColor,
                                                                                margin: '0 15px'
                                                                            }} />

                                                                            {/* Language Toggles */}
                                                                            <div style={{
                                                                                height: '100%',
                                                                                display: 'flex',
                                                                                alignItems: 'flex-start',
                                                                                paddingLeft: 15,
                                                                                paddingTop: expandedTopGap,
                                                                                gap: 8
                                                                            }}>
                                                                                {(() => {
                                                                                    const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                                                    const rowIds = Array.isArray(b?.props?.rowIds) ? b.props.rowIds : []
                                                                                    const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null
                                                                                    const toggleKeyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null
                                                                                    const toggleKeyLegacy = `table_${actualPageIndex}_${idx}_row_${ri}`
                                                                                    const toggleKey = toggleKeyStable || toggleKeyLegacy
                                                                                    const rowLangs = b.props.rowLanguages?.[ri] || expandedLanguages
                                                                                    const blockLevel = getBlockLevel(b)
                                                                                    const savedItems =
                                                                                        (toggleKeyStable ? getScopedData(toggleKeyStable, blockLevel) : null) ||
                                                                                        getScopedData(toggleKeyLegacy, blockLevel)
                                                                                    const baseItems = Array.isArray(rowLangs) ? rowLangs : []
                                                                                    const currentItems = mergeToggleItems(baseItems, savedItems)

                                                                                    return currentItems.map((lang: any, li: number) => {
                                                                                        // Check level - show if at or below student's current level
                                                                                        const isLevelAllowed = isLevelAtOrBelow(lang.level, lang.levels, student?.level);
                                                                                        const isAllowed = isLevelAllowed;
                                                                                        const canToggle = editMode && canEdit && isAllowed;

                                                                                        const size = Math.max(12, Math.min(expandedRowHeight - 12, 20))
                                                                                        const isActive = lang.active

                                                                                        if (toggleStyle === 'v1') {
                                                                                            const logo = lang.logo || (() => {
                                                                                                const c = (lang.code || '').toLowerCase()
                                                                                                if (c === 'en' || c === 'uk' || c === 'gb') return 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg'
                                                                                                if (c === 'fr') return 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg'
                                                                                                if (c === 'ar' || c === 'lb') return 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg'
                                                                                                return ''
                                                                                            })()

                                                                                            return (
                                                                                                <div
                                                                                                    key={li}
                                                                                                    style={{
                                                                                                        width: size,
                                                                                                        height: size,
                                                                                                        borderRadius: '50%',
                                                                                                        overflow: 'hidden',
                                                                                                        position: 'relative',
                                                                                                        boxShadow: isActive ? '0 0 0 2px #6c5ce7' : 'none',
                                                                                                        opacity: isActive ? 1 : (canToggle ? 0.6 : 0.5),
                                                                                                        cursor: canToggle ? 'pointer' : 'default'
                                                                                                    }}
                                                                                                    onClick={async (e) => {
                                                                                                        e.stopPropagation()
                                                                                                        // View only logic - no op
                                                                                                    }}
                                                                                                >
                                                                                                    {logo ? <img src={logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isActive ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                                                                </div>
                                                                                            )
                                                                                        }

                                                                                        const getEmoji = (item: any) => {
                                                                                            const e = item.emoji
                                                                                            if (e && e.length >= 2) return e
                                                                                            const c = (item.code || '').toLowerCase()
                                                                                            if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                                                            if (c === 'fr') return '🇫🇷'
                                                                                            if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                                                            return '🏳️'
                                                                                        }
                                                                                        const emoji = getEmoji(lang)
                                                                                        const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`

                                                                                        return (
                                                                                            <div
                                                                                                key={li}
                                                                                                title={lang.label}
                                                                                                style={{
                                                                                                    width: size,
                                                                                                    height: size,
                                                                                                    minWidth: size,
                                                                                                    borderRadius: '50%',
                                                                                                    background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                                                                                    border: isActive ? '0.25px solid #fff' : '0.25px solid #fff',
                                                                                                    display: 'flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center',
                                                                                                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                                                                                    boxShadow: 'none',
                                                                                                    opacity: isActive ? 1 : (canToggle ? 0.6 : 0.5),
                                                                                                    cursor: canToggle ? 'pointer' : 'default'
                                                                                                }}
                                                                                                onClick={async (e) => {
                                                                                                    e.stopPropagation()
                                                                                                    // View only logic - no op
                                                                                                }}
                                                                                            >
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
                                            })()
                                        )}
                                        {b.type === 'qr' && (
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=${b.props.width || 120}x${b.props.height || 120}&data=${encodeURIComponent(b.props.url || '')}`}
                                                style={{
                                                    width: b.props.width || 120,
                                                    height: b.props.height || 120
                                                }}
                                                alt="QR Code"
                                            />
                                        )}
                                        {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
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
                                        {b.type === 'final_signature_box' && (
                                            <div style={{
                                                width: b.props.width || 200,
                                                height: b.props.height || 80,
                                                border: 'none',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                color: '#999',
                                                // Hide if not visible
                                                ...((!isBlockVisible(b)) ? { display: 'none' } : {}),
                                                // Ensure it's treated as end-year
                                                ...((!finalSignature && !isBlockVisible({ ...b, props: { ...b.props, period: 'end-year' } })) ? { display: 'none' } : {})
                                            }}>
                                                {(() => {
                                                    if (finalSignature) return '✓ Signé Fin Année'
                                                    // Check history for end_of_year signature
                                                    const history = assignment?.data?.signatures || []
                                                    const promotions = assignment?.data?.promotions || []
                                                    const blockLevel = getBlockLevel(b)
                                                    if (blockLevel) {
                                                        const matchingSig = history.find((sig: any) => {
                                                            if (sig.type !== 'end_of_year') return false
                                                            if (sig.schoolYearName) {
                                                                const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                                                                if (promo && promo.from === blockLevel) return true
                                                            }
                                                            return false
                                                        })
                                                        if (matchingSig) return `✓ Signé (${matchingSig.schoolYearName || 'Ancien'})`
                                                    }
                                                    return null
                                                })()}
                                            </div>
                                        )}
                                        {b.type === 'final_signature_info' && (
                                            <div style={{
                                                width: b.props.width || 150,
                                                height: b.props.height || 30,
                                                fontSize: b.props.fontSize || 12,
                                                color: b.props.color || '#333',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: b.props.align || 'flex-start'
                                            }}>
                                                {(() => {
                                                    const sigs = (assignment as any)?.data?.signatures || []
                                                    const finalSigData = sigs.filter((s: any) => s?.type === 'end_of_year').sort((a: any, b: any) => {
                                                        const ad = new Date(a.signedAt || 0).getTime()
                                                        const bd = new Date(b.signedAt || 0).getTime()
                                                        return bd - ad
                                                    })[0]
                                                    const hasData = !!finalSigData || !!finalSignature
                                                    if (!hasData) {
                                                        return <span style={{ color: '#ccc' }}>{b.props.placeholder || '...'}</span>
                                                    }
                                                    const yearLabel = (finalSigData && (finalSigData.schoolYearName || '')) || new Date().getFullYear()
                                                    const promos = (assignment as any)?.data?.promotions || []
                                                    const targetPromo = finalSigData ? promos.find((p: any) => String(p.year) === String(finalSigData.schoolYearName)) : null
                                                    const next = targetPromo ? targetPromo.to : getNextLevel(student?.level || '')
                                                    if (b.props.field === 'year') return <span>{String(yearLabel)}</span>
                                                    if (b.props.field === 'student') return <span>{student?.firstName} {student?.lastName}</span>
                                                    if (b.props.field === 'studentFirstName') return <span>{student?.firstName}</span>
                                                    if (b.props.field === 'studentLastName') return <span>{student?.lastName}</span>
                                                    if (b.props.field === 'nextLevel') return <span>{next || ''}</span>
                                                    return null
                                                })()}
                                            </div>
                                        )}
                                        {b.type === 'signature_box' && (
                                            <div style={{
                                                width: b.props.width || 200,
                                                height: b.props.height || 80,
                                                border: 'none',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                color: '#999',
                                                ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                            }}>
                                                {(() => {
                                                    const blockLevel = getBlockLevel(b)
                                                    const sigLevel = (signature as any)?.level
                                                    const finalSigLevel = (finalSignature as any)?.level

                                                    if (!blockLevel) {
                                                        if (b.props.period === 'end-year') {
                                                            if (finalSignature) {
                                                                return finalSignature.signatureUrl ? <img src={finalSignature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé Fin Année'
                                                            }
                                                        } else {
                                                            if (signature) {
                                                                return signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'
                                                            }
                                                        }
                                                    } else {
                                                        if (b.props.period === 'end-year') {
                                                            if (finalSignature && ((finalSigLevel && finalSigLevel === blockLevel) || (!finalSigLevel && student?.level === blockLevel))) {
                                                                return finalSignature.signatureUrl ? <img src={finalSignature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé Fin Année'
                                                            }
                                                        } else {
                                                            if (signature && ((sigLevel && sigLevel === blockLevel) || (!sigLevel && student?.level === blockLevel))) {
                                                                return signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'
                                                            }
                                                        }
                                                    }

                                                    const history = assignment?.data?.signatures || []
                                                    const promotions = assignment?.data?.promotions || []

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
                                                            return `✓ Signé (${matchingSig.schoolYearName || 'Ancien'})`
                                                        }
                                                    }

                                                    return null
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
