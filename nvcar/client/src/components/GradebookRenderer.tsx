import React from 'react'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import { GradebookPocket } from './GradebookPocket'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth: Date; className?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

interface GradebookRendererProps {
    template: Template
    student: Student
    assignment: Assignment
    signature?: any
    finalSignature?: any
    visiblePages?: number[]
    activeSchoolYearName?: string
}

export const GradebookRenderer: React.FC<GradebookRendererProps> = ({ template, student, assignment, signature, finalSignature, visiblePages, activeSchoolYearName }) => {
    const { levels } = useLevels()
    const { activeYear } = useSchoolYear()

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

        // If an explicit active school year name is provided (e.g. from parent/admin view), use it for prediction
        if (activeSchoolYearName) {
            const nextFromActive = computeNextSchoolYearName(activeSchoolYearName)
            if (nextFromActive) return nextFromActive
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

    const isSignedForLevel = (level: string, type: 'standard' | 'end_of_year') => {
        // 1. Check if the "main" signature passed matches (for backward compatibility or current year)
        // Note: signature/finalSignature objects don't carry level info directly, 
        // but if they exist, they usually correspond to the "current active context".
        // However, relying on them alone is what caused the bug (hiding previous years).

        // Check saved signatures from the gradebook snapshot
        const savedSignatures = assignment?.data?.signatures || []

        // Also check signatures passed as props (from saved gradebook)
        const propSignatures = []
        if (signature) {
            propSignatures.push({ type: 'standard', ...signature })
        }
        if (finalSignature) {
            propSignatures.push({ type: 'end_of_year', ...finalSignature })
        }

        // 2. Check historical signatures in assignment data, saved signatures, and prop signatures
        const allSignatures = [...(assignment?.data?.signatures || []), ...(savedSignatures || []), ...propSignatures]
        if (Array.isArray(allSignatures)) {
            // We need to find if there is a signature of 'type' 
            // where the student was in 'level' at that time.
            // But signatures in data don't store "level". They store "schoolYearId".
            // We need to map SchoolYear -> Level for this student.

            // Fortunately, 'promotions' in assignment data might help?
            // Or we can infer level if the signature date matches a period where student was in that level?
            // But we don't have full student history here easily (only current student object).

            // Better approach:
            // The assignment data stores signatures with `schoolYearName`.
            // We can try to match schoolYearName or ID.
            // But we don't know which year corresponds to PS for this student without fetching more data.

            // Let's look at `assignment.data.promotions`.
            // It maps `year` (name) -> `from` (level).
            // So if we have a signature with `schoolYearName` = "2023/2024",
            // and a promotion saying in "2023/2024" student went from PS->MS (or was in PS?),
            // we can link them.

            // Promotion structure: { from: "PS", to: "MS", year: "2023/2024", date: ... }
            // Signature structure: { type: "standard", signedAt: ..., schoolYearName: "2023/2024" }

            // If we find a signature for year Y, and we know in year Y the student was in Level L,
            // then that signature "unlocks" Level L blocks.

            const promotions = assignment?.data?.promotions || []

            // Check if any signature matches the criteria
            return allSignatures.some((sig: any) => {
                if (sig.type !== type) return false

                // Find level for this signature's year
                // Strategy 1: Match by schoolYearName
                if (sig.schoolYearName) {
                    // Find a promotion/record for this year
                    // Note: "Promotion" record usually records the END of the year (Passage en ...).
                    // So `from` level is the level of that year.
                    const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                    if (promo && promo.from === level) return true

                    // What if there is no promotion record (e.g. current year, or very old data)?
                    // If it's the current year, `signature` prop (the passed prop) handles it?
                    // But we want to handle *past* years here.
                }

                // Strategy 2: If we can't link year->level, we might default to TRUE if
                // the signature exists and is "old enough"? No.

                return false
            })
        }

        return false
    }

    // Helper to check if a block should be visible based on signatures
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
        // We check BOTH the current `signature` prop (if it matches level) AND history.

        let isSignedStandard = false
        let isSignedFinal = false

        // Check current props
        // If current student level matches block level, use current props
        if (student?.level === blockLevel) {
            if (signature) isSignedStandard = true
            if (finalSignature) isSignedFinal = true
        }

        // Check history
        if (!isSignedStandard || !isSignedFinal) {
            const history = assignment?.data?.signatures || []
            const promotions = assignment?.data?.promotions || []

            history.forEach((sig: any) => {
                // Try to match signature year to level
                if (sig.schoolYearName) {
                    const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                    // If promo found and 'from' level matches block level, this signature counts!
                    if (promo && promo.from === blockLevel) {
                        if (sig.type === 'standard' || !sig.type) isSignedStandard = true
                        if (sig.type === 'end_of_year') isSignedFinal = true
                    }
                }
            })

            // Fallback: If no promotion data linked, but we have signatures...
            // This is tricky. If we have a signature but don't know the level, we can't be sure.
            // But usually, promotions are recorded when signing end_of_year.
        }

        if (b.props.period === 'mid-year' && !isSignedStandard && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false
        if (b.props.period === 'end-year' && !isSignedFinal && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false

        return true
    }

    return (
        <div style={{ margin: 0, padding: 0 }}>
            <style>{`
                @page {
                    size: A4;
                    margin: 0;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .page-canvas {
                        page-break-after: always;
                        page-break-inside: avoid;
                    }
                }
            `}</style>
            {template.pages.map((page, originalPageIdx) => ({ page, originalPageIdx }))
                .filter(({ page, originalPageIdx }) =>
                    !page.excludeFromPdf &&
                    (!visiblePages || visiblePages.includes(originalPageIdx))
                )
                .map(({ page, originalPageIdx }, pageIdx) => (
                    <div
                        key={pageIdx}
                        className="page-canvas"
                        style={{
                            height: pageHeight,
                            width: pageWidth,
                            background: page.bgColor || '#fff',
                            overflow: 'hidden',
                            position: 'relative',
                            pageBreakAfter: 'always',
                            pageBreakInside: 'avoid',
                            margin: '0 auto',
                            marginBottom: 20,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                        }}
                    >
                        {page.blocks.map((b, blockIdx) => {
                            if (!b || !b.props) return null;
                            return (
                                <div key={blockIdx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIdx }}>
                                    {b.type === 'text' && (
                                        <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                                            {Array.isArray(b.props.runs) && b.props.runs.length ? (
                                                (b.props.runs as any[]).map((r, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            color: (r && typeof r === 'object' && typeof r.color === 'string' && r.color) ? r.color : (b.props.color || undefined),
                                                            fontWeight: (r && typeof r === 'object' && typeof r.bold === 'boolean') ? (r.bold ? 700 : 400) : undefined,
                                                            textDecoration: (r && typeof r === 'object' && typeof r.underline === 'boolean') ? (r.underline ? 'underline' : 'none') : undefined,
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
                                    {b.type === 'dynamic_text' && (
                                        <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                                            {(() => {
                                                let text = b.props.text || ''
                                                if (student) {
                                                    text = text.replace(/{student.firstName}/g, student.firstName)
                                                        .replace(/{student.lastName}/g, student.lastName)
                                                        .replace(/{student.dob}/g, new Date(student.dateOfBirth).toLocaleDateString())
                                                }
                                                if (assignment?.data) {
                                                    Object.entries(assignment.data).forEach(([k, v]) => {
                                                        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
                                                    })
                                                }
                                                return text
                                            })()}
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
                                            ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                        }}>
                                            {(() => {
                                                const toggleKeyOriginal = `language_toggle_${originalPageIdx}_${blockIdx}`
                                                const toggleKeyCurrent = `language_toggle_${pageIdx}_${blockIdx}`
                                                const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                const toggleKeyStable = blockId ? `language_toggle_${blockId}` : null

                                                const items = (toggleKeyStable ? assignment?.data?.[toggleKeyStable] : null) ||
                                                    assignment?.data?.[toggleKeyOriginal] ||
                                                    assignment?.data?.[toggleKeyCurrent] ||
                                                    b.props.items || []

                                                return items.map((it: any, i: number) => {
                                                    const isAllowed = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
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
                                                                boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                                                opacity: isAllowed ? (it.active ? 1 : 0.6) : (it.active ? 0.9 : 0.5),
                                                                filter: 'none'
                                                            }}
                                                        >
                                                            <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                        </div>
                                                    )
                                                })
                                            })()}
                                        </div>
                                    )}
                                    {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                                    {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                    {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                    {b.type === 'gradebook_pocket' && (
                                        <GradebookPocket
                                            number={b.props.number || '1'}
                                            width={b.props.width || 120}
                                            fontSize={b.props.fontSize}
                                        />
                                    )}
                                    {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                    {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}

                                    {b.type === 'language_toggle' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: b.props.spacing || 12 }}>
                                            {(() => {
                                                // Try both keys: with originalPageIdx and with current pageIdx
                                                // This handles cases where versioning might have shifted indices or not
                                                const toggleKeyOriginal = `language_toggle_${originalPageIdx}_${blockIdx}`
                                                const toggleKeyCurrent = `language_toggle_${pageIdx}_${blockIdx}`
                                                const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                const toggleKeyStable = blockId ? `language_toggle_${blockId}` : null

                                                const items = (toggleKeyStable ? assignment?.data?.[toggleKeyStable] : null) ||
                                                    assignment?.data?.[toggleKeyOriginal] ||
                                                    assignment?.data?.[toggleKeyCurrent] ||
                                                    b.props.items || []

                                                return items.map((it: any, i: number) => {
                                                    const isAllowed = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
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
                                                                boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                                opacity: isAllowed ? 0.9 : (it.active ? 0.9 : 0.5)
                                                            }}
                                                        >
                                                            {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                        </div>
                                                    )
                                                })
                                            })()}
                                        </div>
                                    )}

                                    {b.type === 'dropdown' && (
                                        <div style={{
                                            width: b.props.width || 200,
                                            ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                        }}>
                                            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>
                                                {b.props.dropdownNumber && `Dropdown #${b.props.dropdownNumber}`}
                                            </div>
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
                                                {(() => {
                                                    const currentValue = b.props.dropdownNumber
                                                        ? assignment?.data?.[`dropdown_${b.props.dropdownNumber}`]
                                                        : b.props.variableName ? assignment?.data?.[b.props.variableName] : ''
                                                    return currentValue || 'Sélectionner...'
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    {b.type === 'dropdown_reference' && (
                                        <div style={{
                                            color: b.props.color || '#333',
                                            fontSize: b.props.fontSize || 12,
                                            width: b.props.width || 200,
                                            minHeight: b.props.height || 'auto',
                                            wordWrap: 'break-word',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {(() => {
                                                const dropdownNum = b.props.dropdownNumber || 1
                                                const value = assignment?.data?.[`dropdown_${dropdownNum}`]
                                                return value || `[Dropdown #${dropdownNum}]`
                                            })()}
                                        </div>
                                    )}

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

                                                if (b.props.field === 'student') return <div>{student?.firstName} {student?.lastName}</div>
                                                if (b.props.field === 'studentFirstName') return <div>{student?.firstName}</div>
                                                if (b.props.field === 'studentLastName') return <div>{student?.lastName}</div>
                                                if (b.props.field === 'currentLevel') return <div>{student?.level}</div>

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
                                                        const yearLabel = sig.schoolYearName as string | undefined
                                                        if (!yearLabel) return null

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
                                                    const yearName = activeSchoolYearName || (activeYear ? activeYear.name : null)
                                                    if (yearName) {
                                                        const m = yearName.match(/(\d{4})/)
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
                                                        const label = activeSchoolYearName || (activeYear ? activeYear.name : null) || promo.year || ''
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

                                                // Generate unique key for this teacher text block
                                                const blockId = (b as any).id || `teacher_text_${originalPageIdx}_${blockIdx}`
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
                                            const expandedRows = b.props.expandedRows || false
                                            const expandedRowHeight = b.props.expandedRowHeight || 34
                                            const expandedDividerWidth = b.props.expandedDividerWidth || 0.5
                                            const expandedDividerColor = b.props.expandedDividerColor || 'rgba(255, 255, 255, 0.2)'
                                            const gapRow = b.props.rowGap || 0
                                            const defaultLangs = [
                                                { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                                { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                                { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                            ]
                                            const expandedLanguages = b.props.expandedLanguages || defaultLangs

                                            return (
                                                <div style={{ display: 'inline-block', border: (gapRow > 0 && !expandedRows) ? 'none' : '1px solid #ddd', background: (gapRow > 0) ? 'transparent' : '#fff' }}>
                                                    {(b.props.cells || []).map((row: any[], ri: number) => {
                                                        const rowBgColor = row[0]?.fill || b.props.backgroundColor || '#f8f9fa'
                                                        const isLastRow = ri === (b.props.cells || []).length - 1
                                                        return (
                                                            <div key={ri} style={{ marginBottom: (expandedRows && !isLastRow) ? gapRow : 0 }}>
                                                                {/* Main Row */}
                                                                <div style={{ display: 'flex' }}>
                                                                    {row.map((cell: any, ci: number) => (
                                                                        <div
                                                                            key={ci}
                                                                            style={{
                                                                                width: b.props.columnWidths?.[ci] || 100,
                                                                                height: b.props.rowHeights?.[ri] || 40,
                                                                                borderLeft: cell.borders?.l?.width ? `${cell.borders.l.width}px solid ${cell.borders.l.color || '#000'}` : 'none',
                                                                                borderRight: cell.borders?.r?.width ? `${cell.borders.r.width}px solid ${cell.borders.r.color || '#000'}` : 'none',
                                                                                borderTop: cell.borders?.t?.width ? `${cell.borders.t.width}px solid ${cell.borders.t.color || '#000'}` : 'none',
                                                                                borderBottom: cell.borders?.b?.width ? `${cell.borders.b.width}px solid ${cell.borders.b.color || '#000'}` : 'none',
                                                                                background: cell.fill || 'transparent',
                                                                                padding: 15,
                                                                                fontSize: cell.fontSize || b.props.fontSize || 10,
                                                                                color: cell.color || '#333',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                overflow: 'hidden'
                                                                            }}
                                                                        >
                                                                            {cell.text}
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Expanded Section */}
                                                                {expandedRows && (
                                                                    <div style={{
                                                                        background: rowBgColor,
                                                                        borderBottom: 'none',
                                                                        position: 'relative',
                                                                        height: expandedRowHeight
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
                                                                            alignItems: 'center',
                                                                            paddingLeft: 15,
                                                                            gap: 15
                                                                        }}>
                                                                            {(() => {
                                                                                // Get toggle states from assignment data
                                                                                const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                                                const rowIds = Array.isArray(b?.props?.rowIds) ? b.props.rowIds : []
                                                                                const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null
                                                                                const toggleKeyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null
                                                                                const toggleKeyOriginal = `table_${originalPageIdx}_${blockIdx}_row_${ri}`
                                                                                const toggleKeyCurrent = `table_${pageIdx}_${blockIdx}_row_${ri}`
                                                                                const toggleKeyLegacy = `table_${blockIdx}_row_${ri}`
                                                                                const rowLanguages = b.props.rowLanguages?.[ri] || expandedLanguages
                                                                                const toggleData =
                                                                                    (toggleKeyStable ? assignment?.data?.[toggleKeyStable] : null) ||
                                                                                    assignment?.data?.[toggleKeyOriginal] ||
                                                                                    assignment?.data?.[toggleKeyCurrent] ||
                                                                                    assignment?.data?.[toggleKeyLegacy] ||
                                                                                    rowLanguages
                                                                                const toggleStyle = b.props.expandedToggleStyle || 'v2'

                                                                                return toggleData.map((lang: any, li: number) => {
                                                                                    const size = Math.min(expandedRowHeight - 10, 12)
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
                                                                                                    opacity: isActive ? 1 : 0.6
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
                                                                                    // Use native emoji directly instead of CDN to ensure compatibility and correct rendering
                                                                                    // const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`

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
                                                                                                border: isActive ? '2px solid #2563eb' : '0.25px solid #fff',
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                                                                                boxShadow: isActive ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                                                opacity: isActive ? 1 : 0.6,
                                                                                                fontSize: size * 0.8,
                                                                                                lineHeight: 1
                                                                                            }}
                                                                                        >
                                                                                            {emoji}
                                                                                        </div>
                                                                                    )
                                                                                })
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })()
                                    )}

                                    {b.type === 'qr' && (
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=${b.props.width || 120}x${b.props.height || 120}&data=${encodeURIComponent(b.props.url || '')}`}
                                            style={{ width: b.props.width || 120, height: b.props.height || 120 }}
                                            alt="QR Code"
                                        />
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

                                                return b.props.label || 'Signature'
                                            })()}
                                        </div>
                                    )}
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
                                            ...((!isBlockVisible(b)) ? { display: 'none' } : {}),
                                            ...((!finalSignature && !isBlockVisible({ ...b, props: { ...b.props, period: 'end-year' } })) ? { display: 'none' } : {})
                                        }}>
                                            {(() => {
                                                if (finalSignature) return '✓ Signé Fin Année'
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
                                                return b.props.label || 'Signature Fin Année'
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

                                    {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{student ? `${student.firstName} ${student.lastName}, ${student.className || 'Classe'}, ${student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'Date'}` : 'Nom, Classe, Naissance'}</div>}
                                    {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                                    {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                                    {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{(b.props.labels || []).join(' / ')}</div>}
                                </div>
                            )
                        })}
                    </div>
                ))}
        </div>
    )
}
