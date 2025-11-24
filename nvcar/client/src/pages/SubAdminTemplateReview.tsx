import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string }
type Change = { timestamp: Date; before: any; after: any }
type Assignment = { _id: string; status: string }

const pageWidth = 800
const pageHeight = 1120

export default function SubAdminTemplateReview() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const navigate = useNavigate()
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [changes, setChanges] = useState<Change[]>([])
    const [signature, setSignature] = useState<any>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [signing, setSigning] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/subadmin/templates/${assignmentId}/review`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setChanges(r.data.changes || [])
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

    const handleExportPDF = () => {
        if (template && student) {
            const url = `http://localhost:4000/pdf/student/${student._id}?templateId=${template._id}`
            window.open(url, '_blank')
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

                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    {!signature && (
                        <button className="btn" onClick={handleSign} disabled={signing}>
                            {signing ? 'Signature...' : 'Signer ce carnet'}
                        </button>
                    )}
                    {signature && (
                        <div className="note" style={{ padding: 8, background: '#e8f5e9', borderRadius: 6 }}>
                            Signé le {new Date(signature.signedAt).toLocaleString()}
                        </div>
                    )}
                    <button className="btn secondary" onClick={handleExportPDF}>Exporter en PDF</button>
                </div>

                <div style={{ marginTop: 16, marginBottom: 12 }}>
                    <select value={selectedPage} onChange={e => setSelectedPage(Number(e.target.value))} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                        {template.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 16 }}>
                    <div className="card page-canvas" style={{ height: pageHeight, width: pageWidth, background: template.pages[selectedPage].bgColor || '#fff', overflow: 'hidden', position: 'relative' }}>
                        <div className="page-margins" />
                        {template.pages[selectedPage].blocks.map((b, idx) => (
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
                            </div>
                        ))}
                    </div>

                    <div className="card">
                        <h3>Historique des modifications</h3>
                        <div style={{ marginTop: 12, maxHeight: 600, overflowY: 'auto' }}>
                            {changes.map((c, i) => (
                                <div key={i} className="card" style={{ marginBottom: 8, fontSize: 12 }}>
                                    <div className="note" style={{ fontSize: 10 }}>
                                        {new Date(c.timestamp).toLocaleString()}
                                    </div>
                                    <div style={{ marginTop: 4 }}>
                                        <strong>Avant:</strong> {JSON.stringify(c.before?.items?.map((it: any) => ({ code: it.code, active: it.active })))}
                                    </div>
                                    <div style={{ marginTop: 4 }}>
                                        <strong>Après:</strong> {JSON.stringify(c.after?.items?.map((it: any) => ({ code: it.code, active: it.active })))}
                                    </div>
                                </div>
                            ))}
                            {changes.length === 0 && (
                                <div className="note">Aucune modification enregistrée.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
