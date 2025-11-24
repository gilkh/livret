import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type Teacher = { _id: string; email: string; displayName: string }
type PendingTemplate = {
    _id: string
    status: string
    isCompleted?: boolean
    completedAt?: Date
    template?: { name: string }
    student?: { firstName: string; lastName: string }
}

export default function SubAdminDashboard() {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [pending, setPending] = useState<PendingTemplate[]>([])
    const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [teachersRes, pendingRes] = await Promise.all([
                    api.get('/subadmin/teachers'),
                    api.get('/subadmin/pending-signatures'),
                ])
                setTeachers(teachersRes.data)
                setPending(pendingRes.data)
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const filteredPending = pending.filter(p => {
        if (filter === 'all') return true
        if (filter === 'completed') return p.isCompleted
        if (filter === 'incomplete') return !p.isCompleted
        return true
    })

    return (
        <div className="container">
            <div className="card">
                <h2 className="title">Tableau de bord sous-administrateur</h2>

                {loading && <div className="note">Chargement...</div>}
                {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

                <h3 style={{ marginTop: 24 }}>Enseignants assignés</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
                    {teachers.map(t => (
                        <Link key={t._id} to={`/subadmin/teachers/${t._id}`} style={{ textDecoration: 'none' }}>
                            <div className="card" style={{ cursor: 'pointer' }}>
                                <div className="title" style={{ fontSize: 16 }}>{t.displayName}</div>
                                <div className="note">{t.email}</div>
                                <div className="btn" style={{ marginTop: 12 }}>Voir les modifications →</div>
                            </div>
                        </Link>
                    ))}
                    {!loading && teachers.length === 0 && (
                        <div className="note">Aucun enseignant assigné.</div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Carnets en attente de signature</h3>
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value as any)}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                    >
                        <option value="all">Tous</option>
                        <option value="completed">Terminés</option>
                        <option value="incomplete">Non terminés</option>
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {filteredPending.map(p => (
                        <Link key={p._id} to={`/subadmin/templates/${p._id}/review`} style={{ textDecoration: 'none' }}>
                            <div className="card" style={{ cursor: 'pointer', position: 'relative' }}>
                                {p.isCompleted && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 12,
                                        right: 12,
                                        background: '#10b981',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 16,
                                        fontWeight: 'bold'
                                    }}>
                                        ✓
                                    </div>
                                )}
                                <div className="title" style={{ fontSize: 16, paddingRight: p.isCompleted ? 40 : 0 }}>
                                    {p.template?.name || 'Carnet'}
                                </div>
                                <div className="note">
                                    Élève: {p.student ? `${p.student.firstName} ${p.student.lastName}` : 'N/A'}
                                </div>
                                <div className="note">
                                    Statut: {p.status === 'in_progress' ? 'En cours' : p.status === 'completed' ? 'Terminé' : p.status}
                                </div>
                                {p.isCompleted && p.completedAt && (
                                    <div className="note" style={{ fontSize: 11, marginTop: 4 }}>
                                        Marqué terminé le {new Date(p.completedAt).toLocaleDateString()}
                                    </div>
                                )}
                                <div className="btn" style={{ marginTop: 12 }}>Examiner →</div>
                            </div>
                        </Link>
                    ))}
                    {!loading && filteredPending.length === 0 && (
                        <div className="note">
                            {filter === 'all' ? 'Aucun carnet en attente de signature.' : `Aucun carnet ${filter === 'completed' ? 'terminé' : 'non terminé'}.`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
