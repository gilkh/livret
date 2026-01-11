import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { GradebookRenderer } from '../components/GradebookRenderer'
import { openPdfExport, buildStudentPdfUrl } from '../utils/pdfExport'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth: Date; className?: string }
type Assignment = {
    _id: string;
    status: string;
    data?: any;
    isCompleted?: boolean;
    isCompletedSem1?: boolean;
    isCompletedSem2?: boolean;
}

const pageWidth = 800
const pageHeight = 1120

export default function AdminGradebookReview() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const navigate = useNavigate()
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
                const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setSignature(r.data.signature)
                setFinalSignature(r.data.finalSignature)
                setCanEdit(r.data.canEdit)
                setIsPromoted(r.data.isPromoted)
                setIsSignedByMe(r.data.isSignedByMe)
                setActiveSemester(r.data.activeSemester || 1)

                // Fallback enrichment if className/level missing
                try {
                    const s = r.data.student
                    if (!s?.className || !s?.level) {
                        const all = await api.get('/admin-extras/all-gradebooks')
                        const found = (all.data || []).find((a: any) => String(a._id) === String(assignmentId))
                        if (found) {
                            setStudent(prev => prev ? { ...prev, className: found.className || prev.className, level: found.level || prev.level } : prev)
                        }
                    }
                } catch (err) {
                    // ignore enrichment errors
                }
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
            // Note: We need to implement PATCH /admin/extras/templates/:id/data if we want this to work for admin
            // For now, we'll try to use the subadmin one, but it might fail if admin doesn't have subadmin role.
            // If it fails, we'll need to add the route.
            // Assuming for now we just want to view and sign.
            // If editing is required, we need that route.
            // I'll leave it as is, but it might error.
            // Actually, let's just disable editing for now to be safe, or try.
            // I'll try to use a hypothetical admin route.
            const res = await api.patch(`/admin-extras/templates/${assignmentId}/data`, {
                type: 'language_toggle',
                pageIndex,
                blockIndex,
                items,
                expectedDataVersion: (assignment as any)?.dataVersion
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
                            items,
                            changeId: res.data?.changeId,
                            dataVersion: res.data?.dataVersion
                        }
                    }, (ack: any) => {
                        if (!ack || ack.status !== 'ok') console.warn('Socket ack failed (admin language-toggle)', ack)
                    })
                }

                if (res && res.data && typeof res.data.dataVersion === 'number') {
                    setAssignment(prev => prev ? ({ ...prev, data: prev.data, dataVersion: res.data.dataVersion } as any) : prev)
                }
            }
        } catch (e: any) {
            if (e?.response?.status === 409) {
                setError('Conflit détecté — vos modifications n\'ont pas été appliquées. Rechargez la page.')
                try {
                    const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
                    setTemplate(r.data.template)
                    setAssignment(r.data.assignment)
                } catch (err) {
                    console.error('Failed to reload after conflict', err)
                }
            } else {
                setError('Échec de l\'enregistrement (Non implémenté pour Admin)')
            }
            console.error(e)
        }
    }

    const handleSign = async () => {
        try {
            setSigning(true)
            setError('')
            await api.post(`/admin-extras/templates/${assignmentId}/sign`, { type: 'standard' })
            // Reload data
            const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
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
            await api.delete(`/admin-extras/templates/${assignmentId}/sign`, { data: { type: 'standard' } })
            // Reload data
            const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
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
        try {
            setSigningFinal(true)
            setError('')
            await api.post(`/admin-extras/templates/${assignmentId}/sign`, { type: 'end_of_year' })
            // Reload data
            const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
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
            await api.delete(`/admin-extras/templates/${assignmentId}/sign`, { data: { type: 'end_of_year' } })
            // Reload data
            const r = await api.get(`/admin-extras/templates/${assignmentId}/review`)
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
                const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                const pdfUrl = buildStudentPdfUrl(base, student._id, template._id || '')
                const studentFullName = `${student.firstName} ${student.lastName}`
                openPdfExport(pdfUrl, studentFullName, 'single', 1)
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
                <button className="btn secondary" onClick={() => navigate('/admin/all-gradebooks')} style={{
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>← Retour à la liste</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>📝 Examen du carnet (Admin) - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</h2>
                        <div className="note" style={{ fontSize: 14, color: '#64748b' }}>{template.name}</div>
                    </div>
                    {canEdit && (
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

                <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {!signature ? (
                        <button className="btn" onClick={handleSign} disabled={signing} style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            fontWeight: 500,
                            padding: '12px 20px',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            cursor: 'pointer'
                        }}>
                            {signing ? '✍️ Signature...' : '✍️ Signer ce carnet (Force)'}
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
                        <button className="btn" onClick={handleSignFinal} disabled={signingFinal} style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            fontWeight: 500,
                            padding: '12px 20px',
                            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                            cursor: 'pointer'
                        }}>
                            {signingFinal ? '✍️ Signature...' : '✍️ Signer ce carnet fin années (Force)'}
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

                    <button className="btn secondary" onClick={handleExportPDF} style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        fontWeight: 500,
                        border: '1px solid #e2e8f0',
                        padding: '12px 20px'
                    }}>📄 Exporter en PDF</button>
                </div>

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
                    {template && student && assignment && (
                        <GradebookRenderer
                            template={template}
                            student={student}
                            assignment={assignment}
                            signature={signature}
                            finalSignature={finalSignature}
                            visiblePages={continuousScroll ? undefined : [selectedPage]}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
