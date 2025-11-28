import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string }
type Assignment = { _id: string; status: string }

const pageWidth = 800
const pageHeight = 1120

export default function SubAdminTemplateReview() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const navigate = useNavigate()
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [signing, setSigning] = useState(false)
    const [unsigning, setUnsigning] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/subadmin/templates/${assignmentId}/review`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setSignature(r.data.signature)
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId])

    const handleSign = async () => {
        try {
            setSigning(true)
            setError('')
            await api.post(`/subadmin/templates/${assignmentId}/sign`)
            // Reload data to get updated signature
            const r = await api.get(`/subadmin/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setAssignment(r.data.assignment)
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
            await api.delete(`/subadmin/templates/${assignmentId}/sign`)
            // Reload data to get updated state
            const r = await api.get(`/subadmin/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setAssignment(r.data.assignment)
        } catch (e: any) {
            setError('Échec de la suppression de signature')
            console.error(e)
        } finally {
            setUnsigning(false)
        }
    }

    const handleExportPDF = async () => {
        if (template && student) {
            try {
                const token = localStorage.getItem('token')
                const url = `http://localhost:4000/pdf/student/${student._id}?templateId=${template._id}`
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                
                if (!response.ok) {
                    throw new Error('Export failed')
                }
                
                const blob = await response.blob()
                const downloadUrl = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = downloadUrl
                a.download = `carnet-${student.lastName}-${student.firstName}.pdf`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(downloadUrl)
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
                <button className="btn secondary" onClick={() => navigate('/subadmin/dashboard')} style={{ marginBottom: 16 }}>← Retour au tableau de bord</button>
                <h2 className="title">Examen du carnet - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</h2>
                <div className="note">{template.name}</div>
                <div className="note" style={{ marginTop: 8 }}>
                    Statut: {assignment?.status === 'signed' ? 'Signé ✓' : assignment?.status === 'completed' ? 'Terminé' : assignment?.status}
                </div>
                {error && <div className="note" style={{ marginTop: 8, color: 'crimson' }}>{error}</div>}

                <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {!signature ? (
                        <button className="btn" onClick={handleSign} disabled={signing}>
                            {signing ? 'Signature...' : 'Signer ce carnet'}
                        </button>
                    ) : (
                        <>
                            <div className="note" style={{ padding: 8, background: '#e8f5e9', borderRadius: 6 }}>
                                Signé le {new Date(signature.signedAt).toLocaleString()}
                            </div>
                            <button className="btn" style={{ background: '#f59e0b' }} onClick={handleUnsign} disabled={unsigning}>
                                {unsigning ? 'Annulation...' : 'Annuler la signature'}
                            </button>
                        </>
                    )}
                    <button className="btn secondary" onClick={handleExportPDF}>Exporter en PDF</button>
                </div>

                <div style={{ marginTop: 16, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)}>
                        {continuousScroll ? 'Vue page par page' : 'Vue continue'}
                    </button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button 
                            className="btn secondary" 
                            onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                            disabled={selectedPage === 0 || continuousScroll}
                            style={{ padding: '8px 16px' }}
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
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                        >
                            {template.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
                        </select>
                        <button 
                            className="btn secondary" 
                            onClick={() => setSelectedPage(Math.min(template.pages.length - 1, selectedPage + 1))}
                            disabled={selectedPage === template.pages.length - 1 || continuousScroll}
                            style={{ padding: '8px 16px' }}
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
                                {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                                {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8 }} />}
                                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%' }} />}
                                {b.type === 'language_toggle' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                        {(b.props.items || []).map((it: any, i: number) => {
                                            const r = b.props.radius || 40
                                            const size = r * 2
                                            return (
                                                <div key={i} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', position: 'relative', boxShadow: it.active ? '0 0 0 2px #6c5ce7' : 'none' }}>
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
                                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
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
        </div>
    )
}
