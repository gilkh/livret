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
    signature?: { signedAt: Date; subAdminId: string }
}
type ClassInfo = {
    _id: string
    name: string
    pendingSignatures: number
    totalAssignments: number
    signedAssignments: number
}

export default function SubAdminDashboard() {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [pending, setPending] = useState<PendingTemplate[]>([])
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [filter, setFilter] = useState<'all' | 'signed' | 'unsigned'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [signingClass, setSigningClass] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [teachersRes, pendingRes, classesRes] = await Promise.all([
                    api.get('/subadmin/teachers'),
                    api.get('/subadmin/pending-signatures'),
                    api.get('/subadmin/classes'),
                ])
                setTeachers(teachersRes.data)
                setPending(pendingRes.data)
                setClasses(classesRes.data)
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
        if (filter === 'signed') return !!p.signature
        if (filter === 'unsigned') return !p.signature
        return true
    })

    const handleSignClass = async (classId: string) => {
        try {
            setSigningClass(classId)
            setError('')
            await api.post(`/subadmin/templates/sign-class/${classId}`)
            // Reload data
            const [pendingRes, classesRes] = await Promise.all([
                api.get('/subadmin/pending-signatures'),
                api.get('/subadmin/classes'),
            ])
            setPending(pendingRes.data)
            setClasses(classesRes.data)
        } catch (e: any) {
            setError('Échec de la signature de classe')
            console.error(e)
        } finally {
            setSigningClass(null)
        }
    }

    return (
        <div className="container">
            <div className="card">
                <h2 className="title">Tableau de bord sous-administrateur</h2>

                {loading && <div className="note">Chargement...</div>}
                {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

                <h3 style={{ marginTop: 24 }}>Signature par classe</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 12 }}>
                    {classes.map(cls => (
                        <div key={cls._id} className="card">
                            <div className="title" style={{ fontSize: 16 }}>{cls.name}</div>
                            <div className="note" style={{ marginTop: 8 }}>
                                Total: {cls.totalAssignments} carnets
                            </div>
                            <div className="note">
                                Signés: {cls.signedAssignments} | En attente: {cls.pendingSignatures}
                            </div>
                            {cls.pendingSignatures > 0 ? (
                                <button 
                                    className="btn" 
                                    style={{ marginTop: 12, width: '100%' }}
                                    onClick={() => handleSignClass(cls._id)}
                                    disabled={signingClass === cls._id}
                                >
                                    {signingClass === cls._id ? 'Signature...' : `Signer toute la classe (${cls.pendingSignatures})`}
                                </button>
                            ) : (
                                <div className="note" style={{ marginTop: 12, color: '#10b981', fontWeight: 'bold' }}>
                                    ✓ Tous les carnets sont signés
                                </div>
                            )}
                        </div>
                    ))}
                    {!loading && classes.length === 0 && (
                        <div className="note">Aucune classe avec des carnets à signer.</div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Tous les carnets</h3>
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value as any)}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                    >
                        <option value="all">Tous</option>
                        <option value="signed">Signés</option>
                        <option value="unsigned">Non signés</option>
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
                                    Statut: {p.signature ? '✓ Signé' : p.status === 'in_progress' ? 'En cours' : p.status === 'completed' ? 'Terminé' : p.status}
                                </div>
                                {p.signature && (
                                    <div className="note" style={{ fontSize: 11, marginTop: 4, color: '#10b981' }}>
                                        Signé le {new Date(p.signature.signedAt).toLocaleDateString()}
                                    </div>
                                )}
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
                            {filter === 'all' ? 'Aucun carnet.' : filter === 'signed' ? 'Aucun carnet signé.' : 'Aucun carnet non signé.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
