import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useLevels } from '../context/LevelContext'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth: Date; className?: string; avatarUrl?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

export default function CarnetPrint({ mode }: { mode?: 'saved' | 'preview' }) {
    const { assignmentId, savedId, templateId, studentId } = useParams<{ assignmentId: string, savedId: string, templateId: string, studentId: string }>()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
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
                    if (!isTeacher) setSignature(r.data.signature)
                    
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
            {template.pages.filter(p => !p.excludeFromPdf).map((page, pageIdx) => (
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
                        margin: '0 auto'
                    }}
                >
                    {page.blocks.map((b, idx) => {
                        if (!b || !b.props) return null;
                        return (
                        <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx }}>
                            {b.type === 'text' && (
                                <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{b.props.text}</div>
                            )}
                            {b.type === 'dynamic_text' && (
                                <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                                    {(b.props.text || '')
                                        .replace(/\{student\.firstName\}/g, student.firstName)
                                        .replace(/\{student\.lastName\}/g, student.lastName)
                                        .replace(/\{student\.className\}/g, student.className || '')
                                        .replace(/\{student\.level\}/g, student.level || '')
                                        .replace(/\{student\.dob\}/g, new Date(student.dateOfBirth).toLocaleDateString())
                                    }
                                </div>
                            )}
                            {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
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
                            {b.type === 'signature_box' && (
                                <div style={{ width: b.props.width || 200, height: b.props.height || 80, border: 'none', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>
                                    {b.props.label || 'Signature'}
                                </div>
                            )}
                            
                            {b.type === 'dropdown' && (
                                <div style={{ width: b.props.width || 200 }}>
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
                                        const targetLevel = b.props.targetLevel || getNextLevel(student?.level || '')
                                        const promotions = assignment?.data?.promotions || []
                                        let promoData = promotions.find((p: any) => p.to === targetLevel)
                                        let promo = promoData ? { ...promoData } : null
                                        
                                        if (!promo) {
                                            const currentYear = new Date().getFullYear()
                                            const month = new Date().getMonth()
                                            const startYear = month >= 8 ? currentYear : currentYear - 1
                                            
                                            const isMidYearContext = b.props.period === 'mid-year'
                                            const displayYear = isMidYearContext ? `${startYear}/${startYear + 1}` : `${startYear + 1}/${startYear + 2}`

                                            promo = {
                                                year: displayYear,
                                                from: student?.level || '',
                                                to: targetLevel || '?',
                                                class: student?.className || ''
                                            }
                                        } else {
                                            // Enrich existing promo with current data if missing
                                            if (!promo.class && student?.className) promo.class = student.className
                                            if (!promo.from && student?.level) promo.from = student.level
                                        }

                                        if (promo) {
                                            if (!b.props.field) {
                                                return (
                                                    <>
                                                        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                        <div>{student?.firstName} {student?.lastName}</div>
                                                        <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Année {promo.year}</div>
                                                    </>
                                                )
                                            } else if (b.props.field === 'level') {
                                                return <div style={{ fontWeight: 'bold' }}>Passage en {promo.to}</div>
                                            } else if (b.props.field === 'student') {
                                                return <div>{student?.firstName} {student?.lastName}</div>
                                            } else if (b.props.field === 'studentFirstName') {
                                                return <div>{student?.firstName}</div>
                                            } else if (b.props.field === 'studentLastName') {
                                                return <div>{student?.lastName}</div>
                                            } else if (b.props.field === 'year') {
                                                return <div>{promo.year}</div>
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
                                        const blockId = b.id || `teacher_text_${pageIndex}_${idx}`
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
                                    color: '#999'
                                }}>
                                    {signature ? '✓ Signé' : (b.props.label || 'Signature')}
                                </div>
                            )} 
                        </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
