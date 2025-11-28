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
                <div style={{ marginBottom: 24 }}>
                    <h2 className="title" style={{ fontSize: 32, marginBottom: 8, color: '#1e293b' }}>🎯 Tableau de bord sous-administrateur</h2>
                    <div className="note" style={{ fontSize: 14 }}>Gérez les signatures et suivez les carnets des différentes classes</div>
                </div>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                <h3 style={{ marginTop: 28, marginBottom: 16, fontSize: 22, color: '#1e293b', fontWeight: 600 }}>📝 Signature par classe</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, marginTop: 12 }}>
                    {classes.map(cls => (
                        <div key={cls._id} className="card" style={{ 
                            border: '1px solid #e2e8f0',
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                            transition: 'all 0.3s ease'
                        }}>
                            <div className="title" style={{ fontSize: 18, marginBottom: 10, color: '#1e293b', fontWeight: 600 }}>{cls.name}</div>
                            <div className="note" style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
                                📚 Total: <span style={{ fontWeight: 600 }}>{cls.totalAssignments}</span> carnets
                            </div>
                            <div className="note" style={{ fontSize: 13, color: '#475569' }}>
                                ✅ Signés: <span style={{ fontWeight: 600, color: '#10b981' }}>{cls.signedAssignments}</span> | 
                                ⏳ En attente: <span style={{ fontWeight: 600, color: '#f59e0b' }}>{cls.pendingSignatures}</span>
                            </div>
                            {cls.pendingSignatures > 0 ? (
                                <button 
                                    className="btn" 
                                    style={{ 
                                        marginTop: 16, 
                                        width: '100%',
                                        background: 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)',
                                        fontWeight: 500,
                                        padding: '12px 16px',
                                        boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)'
                                    }}
                                    onClick={() => handleSignClass(cls._id)}
                                    disabled={signingClass === cls._id}
                                >
                                    {signingClass === cls._id ? '✍️ Signature...' : `✍️ Signer toute la classe (${cls.pendingSignatures})`}
                                </button>
                            ) : (
                                <div className="note" style={{ 
                                    marginTop: 16, 
                                    padding: 12,
                                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                    color: '#065f46', 
                                    fontWeight: 600,
                                    borderRadius: 8,
                                    textAlign: 'center',
                                    border: '1px solid #6ee7b7'
                                }}>
                                    ✓ Tous les carnets sont signés
                                </div>
                            )}
                        </div>
                    ))}
                    {!loading && classes.length === 0 && (
                        <div className="note" style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>Aucune classe avec des carnets à signer.</div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 22, color: '#1e293b', fontWeight: 600 }}>📋 Tous les carnets</h3>
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value as any)}
                        style={{ 
                            padding: '10px 16px', 
                            borderRadius: 8, 
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            fontWeight: 500,
                            color: '#475569',
                            background: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">Tous</option>
                        <option value="signed">Signés</option>
                        <option value="unsigned">Non signés</option>
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
                    {filteredPending.map(p => (
                        <Link key={p._id} to={`/subadmin/templates/${p._id}/review`} style={{ textDecoration: 'none' }}>
                            <div className="card" style={{ 
                                cursor: 'pointer', 
                                position: 'relative',
                                transition: 'all 0.3s ease',
                                border: '1px solid #e2e8f0',
                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                            }} onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-3px)';
                                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.12)';
                            }} onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.06)';
                            }}>
                                {p.isCompleted && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 14,
                                        right: 14,
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: 32,
                                        height: 32,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 18,
                                        fontWeight: 'bold',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                                    }}>
                                        ✓
                                    </div>
                                )}
                                <div className="title" style={{ fontSize: 18, paddingRight: p.isCompleted ? 42 : 0, marginBottom: 8, color: '#1e293b', fontWeight: 600 }}>
                                    {p.template?.name || 'Carnet'}
                                </div>
                                <div className="note" style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                                    👤 Élève: <span style={{ fontWeight: 500 }}>{p.student ? `${p.student.firstName} ${p.student.lastName}` : 'N/A'}</span>
                                </div>
                                <div className="note" style={{ fontSize: 13, color: '#475569' }}>
                                    📊 Statut: <span style={{ fontWeight: 500 }}>{p.signature ? '✓ Signé' : p.status === 'in_progress' ? '🔄 En cours' : p.status === 'completed' ? '✅ Terminé' : p.status}</span>
                                </div>
                                {p.signature && (
                                    <div className="note" style={{ fontSize: 12, marginTop: 6, color: '#10b981', fontWeight: 500 }}>
                                        📅 Signé le {new Date(p.signature.signedAt).toLocaleDateString('fr-FR')}
                                    </div>
                                )}
                                {p.isCompleted && p.completedAt && (
                                    <div className="note" style={{ fontSize: 12, marginTop: 6, color: '#64748b' }}>
                                        📌 Marqué terminé le {new Date(p.completedAt).toLocaleDateString('fr-FR')}
                                    </div>
                                )}
                                <div className="btn" style={{ 
                                    marginTop: 16,
                                    background: 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)',
                                    fontWeight: 500,
                                    boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)'
                                }}>Examiner →</div>
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
