import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

export default function SubAdminTemplateReview() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe/')
    const apiPrefix = isAefeUser ? '/aefe' : '/subadmin'
    const dashboardPath = isAefeUser ? '/aefe/dashboard' : '/subadmin/dashboard'
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
    const [finalSignature, setFinalSignature] = useState<any>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [signing, setSigning] = useState(false)
    const [unsigning, setUnsigning] = useState(false)
    const [signingFinal, setSigningFinal] = useState(false)
    const [unsigningFinal, setUnsigningFinal] = useState(false)
    const [isPromoted, setIsPromoted] = useState(false)
    const [isSignedByMe, setIsSignedByMe] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)

    const [promoting, setPromoting] = useState(false)
    const [canEdit, setCanEdit] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)
    const [suggestionModal, setSuggestionModal] = useState<{
        pageIndex: number, 
        blockIndex: number, 
        originalText: string,
        isOpen: boolean
    } | null>(null)
    const [suggestionText, setSuggestionText] = useState('')

    const socket = useSocket()

    useEffect(() => {
        if (!assignmentId || !socket) return

        const roomId = `assignment:${assignmentId}`
        socket.emit('join-room', roomId)

        const handleUpdate = (payload: any) => {
            if (payload.type === 'language-toggle') {
                setTemplate(prev => {
                    if (!prev) return prev
                    const updated = { ...prev }
                    const { pageIndex, blockIndex, items } = payload
                    if (updated.pages[pageIndex]?.blocks[blockIndex]) {
                        updated.pages[pageIndex].blocks[blockIndex].props.items = items
                    }
                    return updated
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
                const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setSignature(r.data.signature)
                setFinalSignature(r.data.finalSignature)
                setCanEdit(r.data.canEdit)
                setIsPromoted(r.data.isPromoted)
                setIsSignedByMe(r.data.isSignedByMe)
                setActiveSemester(r.data.activeSemester || 1)
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId, apiPrefix])

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
            await api.patch(`${apiPrefix}/templates/${assignmentId}/data`, {
                type: 'language_toggle',
                pageIndex,
                blockIndex,
                items,
            })

            // Update local state
            if (template) {
                const newTemplate = { ...template }
                newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                setTemplate(newTemplate)

                if (socket && assignmentId) {
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
        } catch (e: any) {
            setError('Échec de l\'enregistrement')
            console.error(e)
        }
    }

    const submitSuggestion = async () => {
        if (!suggestionModal || !template) return
        try {
            await api.post('/suggestions', {
                templateId: template._id,
                pageIndex: suggestionModal.pageIndex,
                blockIndex: suggestionModal.blockIndex,
                originalText: suggestionModal.originalText,
                suggestedText: suggestionText
            })
            alert('Suggestion envoyée !')
            setSuggestionModal(null)
            setSuggestionText('')
        } catch (e) {
            alert('Erreur lors de l\'envoi')
        }
    }

    const getNextLevel = (current: string) => {
        const c = current.toUpperCase()
        if (c === 'TPS') return 'PS'
        if (c === 'PS') return 'MS'
        if (c === 'MS') return 'GS'
        if (c === 'GS') return 'EB1'
        
        if (c === 'KG1') return 'KG2'
        if (c === 'KG2') return 'KG3'
        if (c === 'KG3') return 'EB1'
        return null
    }

    const handlePromote = async () => {
        if (!student?.level) return
        const next = getNextLevel(student.level)
        if (!next) return
        
        if (!confirm(`Confirmer le passage de ${student.firstName} en ${next} ?\nL'élève sera retiré de sa classe actuelle.`)) return

        try {
            setPromoting(true)
            const r = await api.post(`${apiPrefix}/templates/${assignmentId}/promote`, { nextLevel: next })
            alert('Élève promu avec succès !')
            
            // Update state with returned data instead of reloading
            if (r.data.student) setStudent(r.data.student)
            if (r.data.assignment) setAssignment(r.data.assignment)
            // We don't necessarily need to update template unless language toggles changed, but good practice
            // if (r.data.template) setTemplate(r.data.template) 
            setIsPromoted(true)
        } catch (e: any) {
            if (e.response?.data?.error === 'already_promoted') {
                alert('Cet élève a déjà été promu cette année.')
            } else if (e.response?.data?.message) {
                setError(`Échec de la promotion: ${e.response.data.message}`)
            } else {
                setError('Échec de la promotion')
            }
            console.error(e)
        } finally {
            setPromoting(false)
        }
    }

    const handleSign = async () => {
        if (assignment?.status !== 'completed') {
            alert('L\'enseignant doit marquer le carnet comme terminé avant que vous puissiez le signer.')
            return
        }
        try {
            setSigning(true)
            setError('')
            await api.post(`${apiPrefix}/templates/${assignmentId}/sign`)
            // Reload data to get updated signature
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
        } catch (e: any) {
            setError('Échec de la signature')
            console.error(e)
        } finally {
            setSigning(false)
        }
    }

    const handleUnsign = async () => {
        try {
            setUnsigning(true)
            setError('')
            await api.delete(`${apiPrefix}/templates/${assignmentId}/sign`)
            // Reload data to get updated state
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
        } catch (e: any) {
            setError('Échec de la suppression de signature')
            console.error(e)
        } finally {
            setUnsigning(false)
        }
    }

    const handleSignFinal = async () => {
        if (assignment?.status !== 'completed' && assignment?.status !== 'signed') {
            alert('L\'enseignant doit marquer le carnet comme terminé avant que vous puissiez le signer.')
            return
        }
        try {
            setSigningFinal(true)
            setError('')
            await api.post(`${apiPrefix}/templates/${assignmentId}/sign`, { type: 'end_of_year' })
            // Reload data to get updated signature
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
        } catch (e: any) {
            setError('Échec de la signature fin d\'année')
            console.error(e)
        } finally {
            setSigningFinal(false)
        }
    }

    const handleUnsignFinal = async () => {
        try {
            setUnsigningFinal(true)
            setError('')
            // Use data property for DELETE body if supported by axios/backend, or query param
            // Axios delete supports data in config
            await api.delete(`${apiPrefix}/templates/${assignmentId}/sign`, { data: { type: 'end_of_year' } })
            // Reload data to get updated state
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
        } catch (e: any) {
            setError('Échec de la suppression de signature fin d\'année')
            console.error(e)
        } finally {
            setUnsigningFinal(false)
        }
    }

    const handleExportPDF = async () => {
        if (template && student) {
            try {
                setError('')
                const token = localStorage.getItem('token')
                const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                // Use new Puppeteer-based PDF generation for better rendering
                const url = `${base}/pdf-v2/student/${student._id}?templateId=${template._id}&token=${token}`
                window.open(url, '_blank')
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
                <button className="btn secondary" onClick={() => navigate(dashboardPath)} style={{ 
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>← Retour au tableau de bord</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>📝 Examen du carnet - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</h2>
                        <div className="note" style={{ fontSize: 14, color: '#64748b' }}>{template.name}</div>
                    </div>
                    {canEdit && !isAefeUser && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: editMode ? '#10b981' : '#64748b' }}>
                                {editMode ? 'Mode Édition' : 'Mode Lecture'}
                            </span>
                            <div 
                                onClick={() => setEditMode(!editMode)}
                                style={{
                                    width: 48,
                                    height: 24,
                                    background: editMode ? '#10b981' : '#cbd5e1',
                                    borderRadius: 12,
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background 0.3s ease'
                                }}
                            >
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    background: 'white',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    top: 2,
                                    left: editMode ? 26 : 2,
                                    transition: 'left 0.3s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                }} />
                            </div>
                        </div>
                    )}
                </div>
                <div className="note" style={{ marginTop: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>Statut:</span> {assignment?.status === 'signed' ? '✔️ Signé ✓' : assignment?.status === 'completed' ? '✅ Terminé' : assignment?.status}
                </div>
                {error && <div className="note" style={{ marginTop: 12, color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {!isAefeUser && (
                    <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!signature ? (
                            <button className="btn" onClick={handleSign} disabled={signing || assignment?.status !== 'completed'} style={{
                                background: assignment?.status === 'completed' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#cbd5e1',
                                fontWeight: 500,
                                padding: '12px 20px',
                                boxShadow: assignment?.status === 'completed' ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                                cursor: assignment?.status === 'completed' ? 'pointer' : 'not-allowed'
                            }}
                            title={assignment?.status !== 'completed' ? "L'enseignant n'a pas encore terminé ce carnet" : ""}
                            >
                                {signing ? '✍️ Signature...' : '✍️ Signer ce carnet'}
                            </button>
                        ) : (
                            <>
                                <div className="note" style={{ 
                                    padding: 12, 
                                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', 
                                    borderRadius: 8,
                                    border: '1px solid #6ee7b7',
                                    color: '#065f46',
                                    fontWeight: 500
                                }}>
                                    ✅ Signé le {new Date(signature.signedAt).toLocaleString('fr-FR')}
                                </div>
                                <button className="btn" style={{ 
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                }} onClick={handleUnsign} disabled={unsigning}>
                                    {unsigning ? '⏳ Annulation...' : '🔄 Annuler la signature'}
                                </button>
                            </>
                        )}

                        {!finalSignature ? (
                            <button className="btn" onClick={handleSignFinal} disabled={signingFinal || !signature || (assignment?.status !== 'completed' && assignment?.status !== 'signed')} style={{
                                background: (!signature || (assignment?.status !== 'completed' && assignment?.status !== 'signed')) ? '#cbd5e1' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                fontWeight: 500,
                                padding: '12px 20px',
                                boxShadow: (!signature || (assignment?.status !== 'completed' && assignment?.status !== 'signed')) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                                cursor: (!signature || (assignment?.status !== 'completed' && assignment?.status !== 'signed')) ? 'not-allowed' : 'pointer'
                            }}
                            title={!signature ? "Vous devez d'abord signer le carnet (signature standard)" : (assignment?.status !== 'completed' && assignment?.status !== 'signed') ? "L'enseignant n'a pas encore terminé ce carnet" : ""}
                            >
                                {signingFinal ? '✍️ Signature...' : '✍️ Signer ce carnet fin années'}
                            </button>
                        ) : (
                            <>
                                <div className="note" style={{ 
                                    padding: 12, 
                                    background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', 
                                    borderRadius: 8,
                                    border: '1px solid #93c5fd',
                                    color: '#1e40af',
                                    fontWeight: 500
                                }}>
                                    ✅ Signé fin année le {new Date(finalSignature.signedAt).toLocaleString('fr-FR')}
                                </div>
                                <button className="btn" style={{ 
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                }} onClick={handleUnsignFinal} disabled={unsigningFinal}>
                                    {unsigningFinal ? '⏳ Annulation...' : '🔄 Annuler la signature fin année'}
                                </button>
                            </>
                        )}

                        {student?.level && getNextLevel(student.level) && (
                            <button 
                                className="btn" 
                                onClick={handlePromote} 
                                disabled={promoting || isPromoted || !finalSignature}
                                style={{
                                    background: (isPromoted || !finalSignature) ? '#cbd5e1' : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: (isPromoted || !finalSignature) ? 'none' : '0 2px 8px rgba(139, 92, 246, 0.3)',
                                    color: (isPromoted || !finalSignature) ? '#64748b' : 'white',
                                    border: 'none',
                                    cursor: (isPromoted || !finalSignature) ? 'not-allowed' : 'pointer'
                                }}
                                title={isPromoted ? "Élève déjà promu cette année" : !finalSignature ? "Vous devez signer le carnet (fin année) avant de promouvoir l'élève" : ""}
                            >
                                {promoting ? '⏳ Promotion...' : isPromoted ? 'Déjà promu' : `Passer en classe supérieure ${getNextLevel(student.level)}`}
                            </button>
                        )}

                        <button className="btn secondary" onClick={handleExportPDF} style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontWeight: 500,
                            border: '1px solid #e2e8f0',
                            padding: '12px 20px'
                        }}>📄 Exporter en PDF</button>
                    </div>
                )}

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
                                {page.blocks.map((b, idx) => (
                            <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
                                {b.type === 'text' && (
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>
                                        {editMode && canEdit && (
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSuggestionModal({
                                                        pageIndex: actualPageIndex,
                                                        blockIndex: idx,
                                                        originalText: b.props.text,
                                                        isOpen: true
                                                    })
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: -10,
                                                    right: -10,
                                                    background: '#f59e0b',
                                                    color: 'white',
                                                    borderRadius: '50%',
                                                    width: 20,
                                                    height: 20,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    fontSize: 12,
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                }}
                                                title="Suggérer une modification"
                                            >
                                                ✎
                                            </div>
                                        )}
                                    </div>
                                )}
                                {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8 }} />}
                                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%' }} />}
                                {b.type === 'language_toggle' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                        {(b.props.items || []).map((it: any, i: number) => {
                                            // Check level
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
                                                        cursor: (editMode && canEdit) ? (isAllowed ? 'pointer' : 'not-allowed') : 'default', 
                                                        boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                        transition: 'all 0.2s ease',
                                                        opacity: isAllowed ? ((editMode && canEdit) ? 1 : 0.9) : 0.5
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (!editMode || !canEdit || !isAllowed) return
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
                                {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Nom, Classe, Naissance</div>}
                                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Titre catégorie</div>}
                                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Liste des compétences</div>}
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
                                                background: (editMode && canEdit && isDropdownAllowed) ? '#fff' : '#f9f9f9',
                                                cursor: (editMode && canEdit && isDropdownAllowed) ? 'pointer' : 'default',
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'center',
                                                wordWrap: 'break-word',
                                                whiteSpace: 'pre-wrap'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (!editMode || !canEdit || !isDropdownAllowed) return
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
                                                                    await api.patch(`${apiPrefix}/templates/${assignment._id}/data`, { data: { [key]: '' } })
                                                                    emitAssignmentDataUpdate({ [key]: '' })
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
                                                                        await api.patch(`${apiPrefix}/templates/${assignment._id}/data`, { data: { [key]: opt } })
                                                                        emitAssignmentDataUpdate({ [key]: opt })
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
                                            const targetLevel = b.props.targetLevel
                                            const promotions = assignment?.data?.promotions || []
                                            const promo = promotions.find((p: any) => p.to === targetLevel)
                                            
                                            if (promo) {
                                                if (!b.props.field) {
                                                    return (
                                                        <>
                                                            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {targetLevel}</div>
                                                            <div>{student?.firstName} {student?.lastName}</div>
                                                            <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Année {promo.year}</div>
                                                        </>
                                                    )
                                                } else if (b.props.field === 'level') {
                                                    return <div style={{ fontWeight: 'bold' }}>Passage en {targetLevel}</div>
                                                } else if (b.props.field === 'student') {
                                                    return <div>{student?.firstName} {student?.lastName}</div>
                                                } else if (b.props.field === 'year') {
                                                    return <div>Année {promo.year}</div>
                                                }
                                            }
                                            return <div style={{ color: '#999' }}>Pas de promotion pour {targetLevel}</div>
                                        })()}
                                    </div>
                                )}
                                {b.type === 'table' && (
                                    <div style={{ 
                                        display: 'inline-block',
                                        border: '1px solid #ddd'
                                    }}>
                                        {(b.props.cells || []).map((row: any[], ri: number) => (
                                            <div key={ri} style={{ display: 'flex' }}>
                                                {row.map((cell: any, ci: number) => (
                                                    <div 
                                                        key={ci}
                                                        style={{ 
                                                            width: b.props.columnWidths?.[ci] || 100,
                                                            height: b.props.rowHeights?.[ri] || 40,
                                                            borderRight: ci < row.length - 1 ? '1px solid #ddd' : 'none',
                                                            borderBottom: ri < b.props.cells.length - 1 ? '1px solid #ddd' : 'none',
                                                            background: cell.fill || 'transparent',
                                                            padding: 4,
                                                            fontSize: cell.fontSize || 12,
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
                                        ))}
                                    </div>
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
                                {b.type === 'final_signature_box' && (
                                    <div style={{ 
                                        width: b.props.width || 200, 
                                        height: b.props.height || 80, 
                                        border: '1px solid #000', 
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 10,
                                        color: '#999'
                                    }}>
                                        {finalSignature ? '✓ Signé Fin Année' : b.props.label || 'Signature Fin Année'}
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
                                        {finalSignature ? (
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
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 10,
                                        color: '#999'
                                    }}>
                                        {signature ? '✓ Signé' : b.props.label || 'Signature'}
                                    </div>
                                )}
                            </div>
                                ))}
                            </div>
                        )
                    })}
                </div>
            </div>
            {suggestionModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: 'white', padding: 24, borderRadius: 12, width: 500, maxWidth: '90%' }}>
                        <h3 style={{ marginBottom: 16 }}>Suggérer une modification</h3>
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Texte original</label>
                            <div style={{ padding: 8, background: '#f1f5f9', borderRadius: 4, fontSize: 14 }}>{suggestionModal.originalText}</div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Suggestion</label>
                            <textarea 
                                value={suggestionText}
                                onChange={e => setSuggestionText(e.target.value)}
                                style={{ width: '100%', height: 100, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                                placeholder="Entrez votre suggestion..."
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn secondary" onClick={() => setSuggestionModal(null)}>Annuler</button>
                            <button className="btn primary" onClick={submitSuggestion}>Envoyer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
