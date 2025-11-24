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
                <button className="btn secondary" onClick={() => window.history.back()} style={{ marginBottom: 16 }}>← Retour</button>
                <h2 className="title">Carnets - {studentName || 'Élève'}</h2>

                {loading && <div className="note">Chargement...</div>}
                {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
                    {assignments.map(a => (
                        <div key={a._id} className="card" style={{ position: 'relative' }}>
                            {a.isCompleted && (
                                <div style={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    background: '#10b981',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: 32,
                                    height: 32,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 20,
                                    fontWeight: 'bold'
                                }}>
                                    ✓
                                </div>
                            )}
                            <div className="title" style={{ fontSize: 16, paddingRight: a.isCompleted ? 40 : 0 }}>
                                {a.template?.name || 'Carnet'}
                            </div>
                            <div className="note">
                                Statut: {
                                    a.status === 'draft' ? 'Brouillon' :
                                        a.status === 'in_progress' ? 'En cours' :
                                            a.status === 'completed' ? 'Terminé' :
                                                a.status === 'signed' ? 'Signé' : a.status
                                }
                            </div>
                            {a.isCompleted && a.completedAt && (
                                <div className="note" style={{ fontSize: 11, marginTop: 4 }}>
                                    Marqué terminé le {new Date(a.completedAt).toLocaleDateString()}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <Link to={`/teacher/templates/${a._id}/edit`} style={{ textDecoration: 'none', flex: 1 }}>
                                    <button className="btn" style={{ width: '100%' }}>Éditer</button>
                                </Link>
                                <button
                                    className={a.isCompleted ? 'btn secondary' : 'btn'}
                                    onClick={() => toggleCompletion(a._id, a.isCompleted || false)}
                                    disabled={updating === a._id}
                                    style={{
                                        background: a.isCompleted ? '#f59e0b' : '#10b981',
                                        color: 'white',
                                        minWidth: 120
                                    }}
                                >
                                    {updating === a._id ? '...' : (a.isCompleted ? 'Incomplet' : 'Terminé ✓')}
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
