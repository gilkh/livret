import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'

type TemplateAssignment = {
    _id: string
    templateId: string
    studentId: string
    status: string
    isCompleted?: boolean
    completedAt?: Date
    completedBy?: string
    template?: { _id: string; name: string }
}

export default function TeacherStudentTemplates() {
    const { studentId } = useParams<{ studentId: string }>()
    const [assignments, setAssignments] = useState<TemplateAssignment[]>([])
    const [studentName, setStudentName] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [updating, setUpdating] = useState<string | null>(null)

    useEffect(() => {
        const loadTemplates = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/teacher/students/${studentId}/templates`)
                setAssignments(r.data)

                // Get student name from first assignment if available
                if (r.data.length > 0 && r.data[0].student) {
                    const s = r.data[0].student
                    setStudentName(`${s.firstName} ${s.lastName}`)
                }
            } catch (e: any) {
                setError('Impossible de charger les carnets')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (studentId) loadTemplates()
    }, [studentId])

    const toggleCompletion = async (assignmentId: string, currentStatus: boolean) => {
        try {
            setUpdating(assignmentId)
            setError('')

            const endpoint = currentStatus ? 'unmark-done' : 'mark-done'
            const response = await api.post(`/teacher/templates/${assignmentId}/${endpoint}`)

            // Update local state
            setAssignments(prev => prev.map(a =>
                a._id === assignmentId ? { ...a, ...response.data } : a
            ))
        } catch (e: any) {
            setError('Échec de la mise à jour')
            console.error(e)
        } finally {
            setUpdating(null)
        }
    }

    return (
        <div className="container">
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
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>📖 Carnets - {studentName || 'Élève'}</h2>
                <div className="note" style={{ fontSize: 14, color: '#64748b' }}>Gérez les carnets de compétences assignés à cet élève</div>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', marginTop: 16 }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginTop: 20 }}>
                    {assignments.map(a => (
                        <div key={a._id} className="card" style={{ 
                            position: 'relative',
                            transition: 'all 0.3s ease',
                            border: '1px solid #e2e8f0',
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                        }}>
                            {a.isCompleted && (
                                <div style={{
                                    position: 'absolute',
                                    top: 14,
                                    right: 14,
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: 40,
                                    height: 40,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 22,
                                    fontWeight: 'bold',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                                }}>
                                    ✓
                                </div>
                            )}
                            <div className="title" style={{ 
                                fontSize: 18, 
                                paddingRight: a.isCompleted ? 50 : 0,
                                marginBottom: 8,
                                color: '#1e293b',
                                fontWeight: 600
                            }}>
                                {a.template?.name || 'Carnet'}
                            </div>
                            <div className="note" style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                                Statut: <span style={{ fontWeight: 500 }}>{
                                    a.status === 'draft' ? '📝 Brouillon' :
                                        a.status === 'in_progress' ? '🔄 En cours' :
                                            a.status === 'completed' ? '✅ Terminé' :
                                                a.status === 'signed' ? '✔️ Signé' : a.status
                                }</span>
                            </div>
                            {a.isCompleted && a.completedAt && (
                                <div className="note" style={{ fontSize: 12, marginTop: 6, color: '#10b981', fontWeight: 500 }}>
                                    📅 Marqué terminé le {new Date(a.completedAt).toLocaleDateString('fr-FR')}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <Link to={`/teacher/templates/${a._id}/edit`} style={{ textDecoration: 'none', flex: 1 }}>
                                    <button className="btn" style={{ 
                                        width: '100%',
                                        background: 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)',
                                        fontWeight: 500,
                                        padding: '10px 16px',
                                        boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)'
                                    }}>✏️ Éditer</button>
                                </Link>
                                <button
                                    className={a.isCompleted ? 'btn secondary' : 'btn'}
                                    onClick={() => toggleCompletion(a._id, a.isCompleted || false)}
                                    disabled={updating === a._id}
                                    style={{
                                        background: a.isCompleted 
                                            ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                                            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: 'white',
                                        minWidth: 130,
                                        fontWeight: 500,
                                        padding: '10px 16px',
                                        boxShadow: a.isCompleted 
                                            ? '0 2px 8px rgba(245, 158, 11, 0.3)' 
                                            : '0 2px 8px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    {updating === a._id ? '⏳ ...' : (a.isCompleted ? '🔄 Incomplet' : '✔️ Terminé')}
                                </button>
                            </div>
                        </div>
                    ))}
                    {!loading && assignments.length === 0 && (
                        <div className="note">Aucun carnet assigné à cet élève.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
