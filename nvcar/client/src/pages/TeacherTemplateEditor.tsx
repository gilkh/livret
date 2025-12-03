import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'

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
    const [isMyWorkCompleted, setIsMyWorkCompleted] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)

    const socket = useSocket()

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

    const toggleCompletion = async () => {
        if (!assignment) return
        try {
            setSaveStatus('Enregistrement...')
            const action = isMyWorkCompleted ? 'unmark-done' : 'mark-done'
            const r = await api.post(`/teacher/templates/${assignmentId}/${action}`)
            setAssignment(r.data)
            setIsMyWorkCompleted(!isMyWorkCompleted)
            setSaveStatus(isMyWorkCompleted ? 'Rouvert avec succès' : 'Terminé avec succès ✓')
            setTimeout(() => setSaveStatus(''), 3000)
        } catch (e: any) {
            setError('Erreur lors de la mise à jour du statut')
            console.error(e)
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
                    {canEdit && assignment?.status !== 'signed' && (
                        <button 
                            className="btn"
                            onClick={toggleCompletion}
                            style={{
                                marginLeft: 12,
                                padding: '6px 12px',
                                fontSize: 13,
                                background: isMyWorkCompleted ? '#fff' : '#10b981',
                                color: isMyWorkCompleted ? '#ef4444' : '#fff',
                                border: isMyWorkCompleted ? '1px solid #ef4444' : 'none',
                                cursor: 'pointer',
                                borderRadius: 6,
                                fontWeight: 500
                            }}
                        >
                            {isMyWorkCompleted ? 'Rouvrir' : 'Marquer comme terminé'}
                        </button>
                    )}
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
                                {page.blocks.map((b, idx) => (
                        <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
                            {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                            {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                            {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8 }} />}
                            {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%' }} />}
                            {b.type === 'language_toggle' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                    {(b.props.items || []).map((it: any, i: number) => {
                                        // Check level and language
                                        const isLevelAllowed = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
                                        const isLanguageAllowed = allowedLanguages.length === 0 || (it.code && allowedLanguages.includes(it.code));
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
                                                {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{it.label || it.code}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                                {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                                {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{(() => {
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
                                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{student ? `${student.firstName} ${student.lastName}` : 'Nom, Classe, Naissance'}</div>}
                                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Titre catégorie</div>}
                                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Liste des compétences</div>}
                                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
                                {b.type === 'dropdown' && (() => {
                                    // Check if dropdown is allowed for current level
                                    const isLevelAllowed = !(b.props.levels && b.props.levels.length > 0 && student?.level && !b.props.levels.includes(student.level))
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
                                )})()}
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
                    </div>
                    ))}
                </div>
            )
        })}
        </div>
            </div>
        </div>
    )
}
