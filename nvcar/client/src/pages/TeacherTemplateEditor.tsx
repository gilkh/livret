import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { useLevels } from '../context/LevelContext'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; className?: string }
type Assignment = { _id: string; status: string; data?: Record<string, any> }

const pageWidth = 800
const pageHeight = 1120

export default function TeacherTemplateEditor() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saveStatus, setSaveStatus] = useState('')
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [allowedLanguages, setAllowedLanguages] = useState<string[]>([])
    const [isProfPolyvalent, setIsProfPolyvalent] = useState(false)
    const [isMyWorkCompleted, setIsMyWorkCompleted] = useState(false) // Keep for backward compat if needed, or remove?
    const [isMyWorkCompletedSem1, setIsMyWorkCompletedSem1] = useState(false)
    const [isMyWorkCompletedSem2, setIsMyWorkCompletedSem2] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)

    const { levels } = useLevels()
    const socket = useSocket()

    const fixUrl = (url: string) => {
        if (!url) return url
        if (typeof window === 'undefined') return url
        // Replace localhost:4000 with current window hostname:4000
        // This handles the case where images were saved with localhost but we are accessing via IP
        if (url.includes('localhost:4000')) {
            const host = window.location.hostname
            const protocol = window.location.protocol
            return url.replace(/http(s)?:\/\/localhost:4000/, `${protocol}//${host}:4000`)
        }
        return url
    }

    useEffect(() => {
        if (assignmentId && socket) {
            const roomId = `assignment:${assignmentId}`
            socket.emit('join-room', roomId)

            const handleUpdate = (payload: any) => {
                if (payload.type === 'language-toggle') {
                    setTemplate(prev => {
                        if (!prev) return prev
                        const newTemplate = { ...prev }
                        const { pageIndex, blockIndex, items } = payload
                        if (newTemplate.pages[pageIndex]?.blocks[blockIndex]) {
                            newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                        }
                        return newTemplate
                    })
                }

                if (payload.type === 'assignment-data') {
                    setAssignment(prev => {
                        if (!prev) return prev
                        if (payload.assignmentId && payload.assignmentId !== prev._id) return prev
                        const nextData = { ...(prev.data || {}), ...(payload.data || {}) }
                        return { ...prev, data: nextData }
                    })
                }
            }

            socket.on('update-received', handleUpdate)

            return () => {
                socket.emit('leave-room', roomId)
                socket.off('update-received', handleUpdate)
            }
        }
    }, [assignmentId, socket])

    const emitAssignmentDataUpdate = (dataPatch: Record<string, any>) => {
        if (!socket || !assignmentId) return
        socket.emit('broadcast-update', {
            roomId: `assignment:${assignmentId}`,
            payload: {
                type: 'assignment-data',
                assignmentId,
                data: dataPatch
            }
        })
    }

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/teacher/template-assignments/${assignmentId}`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setCanEdit(r.data.canEdit)
                setAllowedLanguages(r.data.allowedLanguages || [])
                setIsProfPolyvalent(r.data.isProfPolyvalent || false)
                setIsMyWorkCompleted(r.data.isMyWorkCompleted || false)
                setIsMyWorkCompletedSem1(r.data.isMyWorkCompletedSem1 || false)
                setIsMyWorkCompletedSem2(r.data.isMyWorkCompletedSem2 || false)
                setActiveSemester(r.data.activeSemester || 1)
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdown(null)
        if (openDropdown) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [openDropdown])

    const updateLanguageToggle = async (pageIndex: number, blockIndex: number, items: any[]) => {
        try {
            setSaveStatus('Enregistrement...')
            await api.patch(`/teacher/template-assignments/${assignmentId}/language-toggle`, {
                pageIndex,
                blockIndex,
                items,
            })

            // Update local state
            if (template) {
                const newTemplate = { ...template }
                newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                setTemplate(newTemplate)

                if (socket) {
                    socket.emit('broadcast-update', {
                        roomId: `assignment:${assignmentId}`,
                        payload: {
                            type: 'language-toggle',
                            pageIndex,
                            blockIndex,
                            items
                        }
                    })
                }
            }

            setSaveStatus('Enregistré avec succès ✓')
            setTimeout(() => setSaveStatus(''), 3000)
        } catch (e: any) {
            setError('Échec de l\'enregistrement')
            setSaveStatus('')
            console.error(e)
        }
    }

    const toggleCompletionSem = async (semester: number) => {
        if (!assignment) return
        try {
            setSaveStatus('Enregistrement...')
            const isCompleted = semester === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2
            const action = isCompleted ? 'unmark-done' : 'mark-done'
            const r = await api.post(`/teacher/templates/${assignmentId}/${action}`, { semester })
            setAssignment(r.data)
            
            if (semester === 1) {
                setIsMyWorkCompletedSem1(!isCompleted)
                // Sync legacy
                setIsMyWorkCompleted(!isCompleted)
            } else {
                setIsMyWorkCompletedSem2(!isCompleted)
            }

            setSaveStatus(!isCompleted ? 'Terminé avec succès ✓' : 'Rouvert avec succès')
            setTimeout(() => setSaveStatus(''), 3000)
        } catch (e: any) {
            setError('Erreur lors de la mise à jour du statut')
            console.error(e)
        }
    }

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

    const handleExportPDF = async () => {
        if (template && student) {
            try {
                const r = await api.get(`/pdf-v2/student/${student._id}`, {
                    params: { templateId: template._id },
                    responseType: 'blob'
                })
                const blob = new Blob([r.data], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `carnet-${student.lastName}-${student.firstName}.pdf`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
            } catch (e: any) {
                setError('Échec de l\'export PDF')
                console.error(e)
            }
        }
    }

    if (loading) return <div className="container"><div className="card"><div className="note">Chargement...</div></div></div>
    if (error && !template) return <div className="container"><div className="card"><div className="note" style={{ color: 'crimson' }}>{error}</div></div></div>
    if (!template) return <div className="container"><div className="card"><div className="note">Carnet introuvable</div></div></div>

    return (
        <div style={{ padding: 24 }}>
            <div className="card">
                <button className="btn secondary" onClick={() => window.history.back()} style={{
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>← Retour</button>

                <div style={{ marginBottom: 20 }}>
                    <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span>✏️ Édition du carnet - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</span>
                        {student?.level && (
                            <span style={{
                                fontSize: 14,
                                background: '#e0e7ff',
                                color: '#4338ca',
                                padding: '4px 10px',
                                borderRadius: 16,
                                fontWeight: 600
                            }}>
                                {student.level}
                            </span>
                        )}
                        {student?.className && (
                            <span style={{
                                fontSize: 14,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '4px 10px',
                                borderRadius: 16,
                                fontWeight: 600
                            }}>
                                {student.className}
                            </span>
                        )}
                        <span style={{
                            fontSize: 14,
                            background: activeSemester === 2 ? '#dbeafe' : '#fef3c7',
                            color: activeSemester === 2 ? '#1e40af' : '#92400e',
                            padding: '4px 10px',
                            borderRadius: 16,
                            fontWeight: 700,
                            border: `1px solid ${activeSemester === 2 ? '#93c5fd' : '#fcd34d'}`
                        }}>
                            S{activeSemester}
                        </span>
                    </h2>
                    <div className="note" style={{ fontSize: 15, color: '#64748b', marginBottom: 8 }}>
                        📚 {template.name}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: assignment?.status === 'signed' ? '#d1fae5' : assignment?.status === 'completed' ? '#dbeafe' : '#fef3c7', color: assignment?.status === 'signed' ? '#065f46' : assignment?.status === 'completed' ? '#1e40af' : '#92400e', border: `1px solid ${assignment?.status === 'signed' ? '#6ee7b7' : assignment?.status === 'completed' ? '#93c5fd' : '#fcd34d'}` }}>
                        {assignment?.status === 'draft' && '📝 Brouillon'}
                        {assignment?.status === 'in_progress' && '🔄 En cours'}
                        {assignment?.status === 'completed' && '✅ Terminé'}
                        {assignment?.status === 'signed' && '✔️ Signé'}
                        {!['draft', 'in_progress', 'completed', 'signed'].includes(assignment?.status || '') && assignment?.status}
                    </div>
                    {canEdit && (
                        <>
                            <button
                                className="btn"
                                onClick={() => toggleCompletionSem(1)}
                                disabled={activeSemester !== 1}
                                style={{
                                    marginLeft: 12,
                                    padding: '6px 12px',
                                    fontSize: 13,
                                    background: activeSemester !== 1 ? '#e2e8f0' : (isMyWorkCompletedSem1 ? '#fff' : '#10b981'),
                                    color: activeSemester !== 1 ? '#94a3b8' : (isMyWorkCompletedSem1 ? '#ef4444' : '#fff'),
                                    border: activeSemester !== 1 ? '1px solid #cbd5e1' : (isMyWorkCompletedSem1 ? '1px solid #ef4444' : 'none'),
                                    cursor: activeSemester !== 1 ? 'not-allowed' : 'pointer',
                                    borderRadius: 6,
                                    fontWeight: 500,
                                    opacity: activeSemester !== 1 ? 0.7 : 1
                                }}
                                title={activeSemester !== 1 ? "Le semestre 1 n'est pas actif" : ""}
                            >
                                {isMyWorkCompletedSem1 ? '❌ Rouvrir Sem 1' : '✅ Terminer Sem 1'}
                            </button>
                            <button
                                className="btn"
                                onClick={() => toggleCompletionSem(2)}
                                disabled={activeSemester !== 2}
                                style={{
                                    marginLeft: 8,
                                    padding: '6px 12px',
                                    fontSize: 13,
                                    background: activeSemester !== 2 ? '#e2e8f0' : (isMyWorkCompletedSem2 ? '#fff' : '#10b981'),
                                    color: activeSemester !== 2 ? '#94a3b8' : (isMyWorkCompletedSem2 ? '#ef4444' : '#fff'),
                                    border: activeSemester !== 2 ? '1px solid #cbd5e1' : (isMyWorkCompletedSem2 ? '1px solid #ef4444' : 'none'),
                                    cursor: activeSemester !== 2 ? 'not-allowed' : 'pointer',
                                    borderRadius: 6,
                                    fontWeight: 500,
                                    opacity: activeSemester !== 2 ? 0.7 : 1
                                }}
                                title={activeSemester !== 2 ? "Le semestre 2 n'est pas actif" : ""}
                            >
                                {isMyWorkCompletedSem2 ? '❌ Rouvrir Sem 2' : '✅ Terminer Sem 2'}
                            </button>
                        </>
                    )}
                    <button
                        className="btn secondary"
                        onClick={handleExportPDF}
                        style={{
                            marginLeft: 12,
                            padding: '6px 12px',
                            fontSize: 13,
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            borderRadius: 6,
                            fontWeight: 500
                        }}
                    >
                        📄 Export PDF
                    </button>
                </div>

                {saveStatus && <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14, textAlign: 'center', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}>✓ {saveStatus}</div>}
                {error && <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14, textAlign: 'center', boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)' }}>✗ {error}</div>}

                <div style={{ marginTop: 20, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)} style={{
                        background: continuousScroll ? 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)' : '#f1f5f9',
                        color: continuousScroll ? 'white' : '#475569',
                        fontWeight: 500,
                        border: '1px solid #cbd5e1',
                        padding: '10px 16px',
                        boxShadow: continuousScroll ? '0 2px 8px rgba(108, 92, 231, 0.3)' : 'none'
                    }}>
                        {continuousScroll ? '📄 Vue page par page' : '📚 Vue continue'}
                    </button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                        <button
                            className="btn secondary"
                            onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                            disabled={selectedPage === 0 || continuousScroll}
                            style={{
                                padding: '10px 16px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                opacity: (selectedPage === 0 || continuousScroll) ? 0.5 : 1,
                                cursor: (selectedPage === 0 || continuousScroll) ? 'not-allowed' : 'pointer',
                                fontWeight: 500
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
                                    // Scroll to the selected page
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
                                background: 'white',
                                minWidth: 150
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
                                opacity: (selectedPage === template.pages.length - 1 || continuousScroll) ? 0.5 : 1,
                                cursor: (selectedPage === template.pages.length - 1 || continuousScroll) ? 'not-allowed' : 'pointer',
                                fontWeight: 500
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
                                style={{
                                    height: pageHeight,
                                    width: pageWidth,
                                    background: page.bgColor || '#fff',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                    border: '1px solid #e2e8f0'
                                }}
                            >
                                {continuousScroll && (
                                    <div style={{
                                        position: 'absolute',
                                        top: -36,
                                        left: 0,
                                        color: '#64748b',
                                        fontSize: 15,
                                        fontWeight: 600,
                                        background: '#f8fafc',
                                        padding: '4px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        📄 Page {actualPageIndex + 1}
                                    </div>
                                )}

                                <div className="page-margins" />
                                {page.blocks.map((b, idx) => {
                                    if (!b || !b.props) return null;
                                    return (
                                    <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
                                        {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{b.props.text}</div>}
                                        {b.type === 'image' && <img src={fixUrl(b.props.url)} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                                        {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                        {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                        {b.type === 'language_toggle' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                                {(b.props.items || []).map((it: any, i: number) => {
                                                    // Check level and language
                                                    // Strict check: If levels are defined on the item, student MUST have a matching level
                                                    const isLevelAllowed = !it.levels || it.levels.length === 0 || (student?.level && it.levels.includes(student.level));
                                                    const isLanguageAllowed = (() => {
                                                        const code = it.code
                                                        if (isProfPolyvalent) {
                                                            return code === 'fr'
                                                        }
                                                        return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code))
                                                    })();
                                                    const isAllowed = isLevelAllowed && isLanguageAllowed;

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
                                                                cursor: (canEdit && isAllowed) ? 'pointer' : 'not-allowed',
                                                                boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                                transition: 'all 0.2s ease',
                                                                opacity: (canEdit && isAllowed) ? 1 : 0.5,
                                                                pointerEvents: (canEdit && isAllowed) ? 'auto' : 'none'
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (!canEdit || !isAllowed) return
                                                                const newItems = [...(b.props.items || [])]
                                                                newItems[i] = { ...newItems[i], active: !newItems[i].active }
                                                                updateLanguageToggle(actualPageIndex, idx, newItems)
                                                            }}
                                                        >
                                                            {it.logo ? <img src={fixUrl(it.logo)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
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
                                                    // Check level and language
                                                    const isLevelAllowed = !it.levels || it.levels.length === 0 || (student?.level && it.levels.includes(student.level));
                                                    const isLanguageAllowed = (() => {
                                                        const code = it.code
                                                        if (isProfPolyvalent) {
                                                            return code === 'fr'
                                                        }
                                                        return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code))
                                                    })();
                                                    const isAllowed = isLevelAllowed && isLanguageAllowed;

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
                                                                cursor: (canEdit && isAllowed) ? 'pointer' : 'not-allowed',
                                                                boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                transition: 'all 0.2s ease',
                                                                transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                                                opacity: (canEdit && isAllowed) ? (it.active ? 1 : 0.6) : 0.4,
                                                                pointerEvents: (canEdit && isAllowed) ? 'auto' : 'none',
                                                                filter: 'none'
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (!canEdit || !isAllowed) return
                                                                const newItems = [...(b.props.items || [])]
                                                                newItems[i] = { ...newItems[i], active: !newItems[i].active }
                                                                updateLanguageToggle(actualPageIndex, idx, newItems)
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                                        >
                                                            {emoji ? (
                                                                <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                            ) : it.logo ? (
                                                                <img src={fixUrl(it.logo)} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                            ) : (
                                                                <span style={{ fontSize: 20, lineHeight: 1 }}>{getEmoji(it)}</span>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                        {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                        {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                                        {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{(() => {
                                            let text = b.props.text || ''
                                            if (student) {
                                                text = text.replace(/{student.firstName}/g, student.firstName).replace(/{student.lastName}/g, student.lastName)
                                            }
                                            if (assignment?.data) {
                                                Object.entries(assignment.data).forEach(([k, v]) => {
                                                    text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
                                                })
                                            }
                                            return text
                                        })()}</div>}
                                        {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{student ? `${student.firstName} ${student.lastName}` : 'Nom, Classe, Naissance'}</div>}
                                        {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                                        {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                                        {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{(b.props.labels || []).join(' / ')}</div>}
                                        {b.type === 'dropdown' && (() => {
                                            // Check if dropdown is allowed for current level
                                            // Strict check: If levels are defined on the dropdown, student MUST have a matching level
                                            const isLevelAllowed = !b.props.levels || b.props.levels.length === 0 || (student?.level && b.props.levels.includes(student.level))
                                            // Check if dropdown is allowed for current semester (default to both semesters if not specified)
                                            const dropdownSemesters = b.props.semesters || [1, 2]
                                            const isSemesterAllowed = dropdownSemesters.includes(activeSemester)
                                            const isDropdownAllowed = isLevelAllowed && isSemesterAllowed

                                            return (
                                                <div style={{
                                                    width: b.props.width || 200,
                                                    position: 'relative',
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
                                                            background: (canEdit && isProfPolyvalent && isDropdownAllowed) ? '#fff' : '#f9f9f9',
                                                            cursor: (canEdit && isProfPolyvalent && isDropdownAllowed) ? 'pointer' : 'not-allowed',
                                                            opacity: isDropdownAllowed ? 1 : 0.5,
                                                            position: 'relative',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            wordWrap: 'break-word',
                                                            whiteSpace: 'pre-wrap'
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (!canEdit || !isProfPolyvalent || !isDropdownAllowed) return
                                                            const key = `dropdown_${actualPageIndex}_${idx}`
                                                            setOpenDropdown(openDropdown === key ? null : key)
                                                        }}
                                                    >
                                                        {(() => {
                                                            const currentValue = b.props.dropdownNumber
                                                                ? assignment?.data?.[`dropdown_${b.props.dropdownNumber}`]
                                                                : b.props.variableName ? assignment?.data?.[b.props.variableName] : ''
                                                            return currentValue || 'Sélectionner...'
                                                        })()}
                                                        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</div>
                                                    </div>
                                                    {openDropdown === `dropdown_${actualPageIndex}_${idx}` && (
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: '100%',
                                                                left: 0,
                                                                right: 0,
                                                                maxHeight: 300,
                                                                overflowY: 'auto',
                                                                background: '#fff',
                                                                border: '1px solid #ccc',
                                                                borderRadius: 4,
                                                                marginTop: 2,
                                                                zIndex: 1000,
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div
                                                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: b.props.fontSize || 12, color: '#999', borderBottom: '1px solid #eee' }}
                                                                onClick={async (e) => {
                                                                    e.stopPropagation()
                                                                    if (assignment) {
                                                                        const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                        if (key) {
                                                                            const newData = { ...assignment.data, [key]: '' }
                                                                            setAssignment({ ...assignment, data: newData })
                                                                            try {
                                                                                await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [key]: '' } })
                                                                                emitAssignmentDataUpdate({ [key]: '' })
                                                                                setSaveStatus('Enregistré avec succès ✓')
                                                                                setTimeout(() => setSaveStatus(''), 3000)
                                                                            } catch (err) {
                                                                                setError('Erreur sauvegarde')
                                                                            }
                                                                        }
                                                                    }
                                                                    setOpenDropdown(null)
                                                                }}
                                                                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                                                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                            >
                                                                Sélectionner...
                                                            </div>
                                                            {(b.props.options || []).map((opt: string, i: number) => (
                                                                <div
                                                                    key={i}
                                                                    style={{
                                                                        padding: '8px 12px',
                                                                        cursor: 'pointer',
                                                                        fontSize: b.props.fontSize || 12,
                                                                        wordWrap: 'break-word',
                                                                        whiteSpace: 'pre-wrap',
                                                                        borderBottom: i < (b.props.options || []).length - 1 ? '1px solid #eee' : 'none'
                                                                    }}
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation()
                                                                        if (assignment) {
                                                                            const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                            if (key) {
                                                                                const newData = { ...assignment.data, [key]: opt }
                                                                                setAssignment({ ...assignment, data: newData })
                                                                                try {
                                                                                    await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [key]: opt } })
                                                                                    emitAssignmentDataUpdate({ [key]: opt })
                                                                                    setSaveStatus('Enregistré avec succès ✓')
                                                                                    setTimeout(() => setSaveStatus(''), 3000)
                                                                                } catch (err) {
                                                                                    setError('Erreur sauvegarde')
                                                                                }
                                                                            }
                                                                        }
                                                                        setOpenDropdown(null)
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4ff'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                                >
                                                                    {opt}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                        {b.type === 'dropdown_reference' && (
                                            <div style={{
                                                width: b.props.width || 200,
                                                minHeight: b.props.height || 'auto',
                                                color: b.props.color || '#2d3436',
                                                fontSize: b.props.fontSize || 12,
                                                padding: '8px',
                                                background: '#f0f4ff',
                                                border: '1px dashed #6c5ce7',
                                                borderRadius: 4,
                                                wordWrap: 'break-word',
                                                whiteSpace: 'pre-wrap',
                                                overflow: 'hidden'
                                            }}>
                                                {(() => {
                                                    const dropdownNum = b.props.dropdownNumber || 1
                                                    const value = assignment?.data?.[`dropdown_${dropdownNum}`] || ''
                                                    const displayText = value || `[Dropdown #${dropdownNum}]`
                                                    return displayText
                                                })()}
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
                                                        // Total height of expanded section = height set + paddingBottom
                                                        // In CSS content-box (default), height adds up.
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
                                                                                    const toggleKey = `table_${actualPageIndex}_${idx}_row_${ri}`
                                                                                    const rowLangs = b.props.rowLanguages?.[ri] || expandedLanguages
                                                                                    const currentItems = assignment?.data?.[toggleKey] || rowLangs

                                                                                    return currentItems.map((lang: any, li: number) => {
                                                                                        const isLevelAllowed = !lang.level || (student?.level && lang.level === student.level);

                                                                                        const isLanguageAllowed = (() => {
                                                                                            const code = lang.code
                                                                                            if (isProfPolyvalent) {
                                                                                                return code === 'fr'
                                                                                            }
                                                                                            return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code)) ||
                                                                                                (code === 'lb' && allowedLanguages.includes('ar')) ||
                                                                                                (code === 'ar' && allowedLanguages.includes('ar')) ||
                                                                                                ((code === 'uk' || code === 'gb') && allowedLanguages.includes('en'))
                                                                                        })();
                                                                                        const isAllowed = isLevelAllowed && isLanguageAllowed;

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
                                                                                                        opacity: (canEdit && isAllowed) ? (isActive ? 1 : 0.6) : 0.5,
                                                                                                        cursor: (canEdit && isAllowed) ? 'pointer' : 'default',
                                                                                                        zIndex: 100
                                                                                                    }}
                                                                                                    onMouseDown={async (e) => {
                                                                                                        e.stopPropagation()
                                                                                                        e.preventDefault()
                                                                                                        if (!canEdit || !isAllowed) return
                                                                                                        const newItems = [...currentItems]
                                                                                                        newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                        if (assignment) {
                                                                                                            const newData = { ...assignment.data, [toggleKey]: newItems }
                                                                                                            setAssignment({ ...assignment, data: newData })
                                                                                                            try {
                                                                                                                await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [toggleKey]: newItems } })
                                                                                                                emitAssignmentDataUpdate({ [toggleKey]: newItems })
                                                                                                            } catch (err) {
                                                                                                                setError('Erreur sauvegarde')
                                                                                                            }
                                                                                                        }
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
                                                                                                    opacity: (canEdit && isAllowed) ? (isActive ? 1 : 0.6) : 0.5,
                                                                                                    cursor: (canEdit && isAllowed) ? 'pointer' : 'default',
                                                                                                    zIndex: 100
                                                                                                }}
                                                                                                onMouseDown={async (e) => {
                                                                                                    e.stopPropagation()
                                                                                                    e.preventDefault()
                                                                                                    if (!canEdit || !isAllowed) return
                                                                                                    const newItems = [...currentItems]
                                                                                                    newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                    if (assignment) {
                                                                                                        const newData = { ...assignment.data, [toggleKey]: newItems }
                                                                                                        setAssignment({ ...assignment, data: newData })
                                                                                                        try {
                                                                                                            await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [toggleKey]: newItems } })
                                                                                                            emitAssignmentDataUpdate({ [toggleKey]: newItems })
                                                                                                        } catch (err) {
                                                                                                            setError('Erreur sauvegarde')
                                                                                                        }
                                                                                                    }
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
                                                    // Level filtering: if block has a specific level, check if it matches student's level
                                                    if (b.props.level && student?.level && b.props.level !== student.level) {
                                                        return null
                                                    }

                                                    // Target Level filtering: only show if student is in the level preceding targetLevel
                                                    if (b.props.targetLevel && student?.level) {
                                                        const next = getNextLevel(student.level)
                                                        if (next !== b.props.targetLevel) return null
                                                    }

                                                    const targetLevel = b.props.targetLevel || getNextLevel(student?.level || '')
                                                    const promotions = assignment?.data?.promotions || []
                                                    let promoData = promotions.find((p: any) => p.to === targetLevel)
                                                    let promo = promoData ? { ...promoData } : null

                                                    // Fallback: If no promo record, show predictive info
                                                    if (!promo) {
                                                        const currentYear = new Date().getFullYear()
                                                        const month = new Date().getMonth()
                                                        const startYear = month >= 8 ? currentYear : currentYear - 1

                                                        // Assume end-year context if not specified, or show both
                                                        const displayYear = `${startYear + 1}/${startYear + 2}`

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
                                        {b.type === 'final_signature_box' && (
                                            <div style={{
                                                width: b.props.width || 200,
                                                height: b.props.height || 80,
                                                border: '1px solid #000',
                                                background: '#fff',
                                                display: 'none',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                color: '#999',
                                            }}>
                                                {assignment?.status === 'signed' ? '✓ Signé Fin Année' : b.props.label || 'Signature Fin Année'}
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
                                                {assignment?.status === 'signed' ? (
                                                    <>
                                                        {b.props.field === 'year' && <span>{new Date().getFullYear()}</span>}
                                                        {b.props.field === 'student' && <span>{student?.firstName} {student?.lastName}</span>}
                                                        {b.props.field === 'nextLevel' && <span>{getNextLevel(student?.level || '')}</span>}
                                                    </>
                                                ) : (
                                                    <span style={{ color: '#ccc' }}>{b.props.placeholder || '...'}</span>
                                                )}
                                            </div>
                                        )}
                                        {b.type === 'signature_box' && (
                                            <div style={{
                                                width: b.props.width || 200,
                                                height: b.props.height || 80,
                                                border: '1px solid #000',
                                                background: '#fff',
                                                display: 'none',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                color: '#999',
                                            }}>
                                                {assignment?.status === 'signed' ? '✓ Signé' : b.props.label || 'Signature'}
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
        </div>
    )
}
