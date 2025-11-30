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
    className?: string
    level?: string
    isPromoted?: boolean
}
type ClassInfo = {
    _id: string
    name: string
    pendingSignatures: number
    totalAssignments: number
    signedAssignments: number
}
type PromotedStudent = {
    _id: string
    firstName: string
    lastName: string
    fromLevel: string
    toLevel: string
    date: string
    assignmentId?: string
}

export default function SubAdminDashboard() {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [pending, setPending] = useState<PendingTemplate[]>([])
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [promotedStudents, setPromotedStudents] = useState<PromotedStudent[]>([])
    const [filter, setFilter] = useState<'all' | 'signed' | 'unsigned'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [signingClass, setSigningClass] = useState<string | null>(null)
    const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [teachersRes, pendingRes, classesRes, promotedRes] = await Promise.all([
                    api.get('/subadmin/teachers'),
                    api.get('/subadmin/pending-signatures'),
                    api.get('/subadmin/classes'),
                    api.get('/subadmin/promoted-students'),
                ])
                setTeachers(teachersRes.data)
                setPending(pendingRes.data)
                setClasses(classesRes.data)
                setPromotedStudents(promotedRes.data)
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

    const groupTemplates = (templates: PendingTemplate[]) => {
        const grouped: Record<string, Record<string, PendingTemplate[]>> = {}
        
        templates.forEach(t => {
            const level = t.level || 'Sans niveau'
            const className = t.className || 'Sans classe'
            
            if (!grouped[level]) grouped[level] = {}
            if (!grouped[level][className]) grouped[level][className] = []
            
            grouped[level][className].push(t)
        })
        
        return grouped
    }

    const groupedTemplates = groupTemplates(filteredPending)
    const sortedLevels = Object.keys(groupedTemplates).sort()

    const toggleClass = (level: string, className: string) => {
        const key = `${level}-${className}`
        setExpandedClasses(prev => ({ ...prev, [key]: !prev[key] }))
    }

    // Calculate statistics
    const totalStudents = pending.length
    const signedCount = pending.filter(p => p.signature).length
    const completionPercentage = totalStudents > 0 ? Math.round((signedCount / totalStudents) * 100) : 0
    
    const levelStats = Object.keys(groupedTemplates).reduce((acc, level) => {
        const templatesInLevel = Object.values(groupedTemplates[level]).flat()
        const total = templatesInLevel.length
        const signed = templatesInLevel.filter(t => t.signature).length
        const percentage = total > 0 ? Math.round((signed / total) * 100) : 0
        acc[level] = { total, signed, percentage }
        return acc
    }, {} as Record<string, { total: number, signed: number, percentage: number }>)

    return (
        <div className="container">
            <div className="card">
                <div style={{ marginBottom: 24 }}>
                    <h2 className="title" style={{ fontSize: 32, marginBottom: 8, color: '#1e293b' }}>🎯 Tableau de bord sous-administrateur</h2>
                    <div className="note" style={{ fontSize: 14 }}>Gérez les signatures et suivez les carnets des différentes classes</div>
                </div>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {/* Global Statistics Bar */}
                {!loading && (
                    <div style={{ 
                        marginBottom: 32, 
                        padding: 20, 
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                        borderRadius: 12, 
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, color: '#1e293b', fontWeight: 600 }}>📊 Progression Globale</h3>
                                <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{totalStudents}</span> élèves au total
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 24, fontWeight: 700, color: completionPercentage === 100 ? '#10b981' : '#3b82f6' }}>
                                    {completionPercentage}%
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b' }}>de carnets signés</div>
                            </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}>
                            <div style={{ 
                                width: `${completionPercentage}%`, 
                                height: '100%', 
                                background: completionPercentage === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                                transition: 'width 0.5s ease-out'
                            }} />
                        </div>

                        {/* Level Breakdown */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {Object.entries(levelStats).sort().map(([level, stats]) => (
                                <div key={level} style={{ 
                                    flex: 1, 
                                    minWidth: 140,
                                    background: 'white', 
                                    padding: '10px 14px', 
                                    borderRadius: 8, 
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{level}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{stats.percentage}%</span>
                                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{stats.signed}/{stats.total}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Promoted Students Section */}
                {promotedStudents.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                        <h3 style={{ fontSize: 22, color: '#1e293b', fontWeight: 600, marginBottom: 16 }}>🎓 Élèves Promus (En attente d'affectation)</h3>
                        
                        {Object.entries(promotedStudents.reduce((acc, student) => {
                            const key = `${student.fromLevel || '?'} → ${student.toLevel || '?'}`
                            if (!acc[key]) acc[key] = []
                            acc[key].push(student)
                            return acc
                        }, {} as Record<string, PromotedStudent[]>)).sort().map(([group, students]) => (
                            <div key={group} style={{ marginBottom: 20 }}>
                                <h4 style={{ fontSize: 16, color: '#475569', marginBottom: 10, fontWeight: 600 }}>{group}</h4>
                                <div style={{ 
                                    background: 'white', 
                                    borderRadius: 12, 
                                    border: '1px solid #e2e8f0',
                                    overflow: 'hidden'
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Élève</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Date de promotion</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.map(student => (
                                                <tr key={student._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
                                                        {student.firstName} {student.lastName}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                                                        {new Date(student.date).toLocaleDateString('fr-FR')}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                        {student.assignmentId && (
                                                            <Link 
                                                                to={`/subadmin/templates/${student.assignmentId}/review`}
                                                                style={{ 
                                                                    display: 'inline-block',
                                                                    padding: '6px 12px',
                                                                    background: '#3b82f6',
                                                                    color: 'white',
                                                                    borderRadius: 6,
                                                                    textDecoration: 'none',
                                                                    fontSize: 13,
                                                                    fontWeight: 500
                                                                }}
                                                            >
                                                                Voir le carnet
                                                            </Link>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tous les carnets Section (Moved to Top) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 16 }}>
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

                {sortedLevels.length > 0 ? (
                    sortedLevels.map(level => (
                        <div key={level} style={{ marginBottom: 24 }}>
                            <h4 style={{ fontSize: 18, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
                                Niveau: {level}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {Object.keys(groupedTemplates[level]).sort().map(className => {
                                    const templates = groupedTemplates[level][className]
                                    const key = `${level}-${className}`
                                    const isExpanded = expandedClasses[key]
                                    const signedCount = templates.filter(t => t.signature).length
                                    const totalCount = templates.length
                                    
                                    return (
                                        <div key={className} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                            <div 
                                                onClick={() => toggleClass(level, className)}
                                                style={{ 
                                                    padding: '12px 16px', 
                                                    background: '#f8fafc', 
                                                    cursor: 'pointer',
                                                    display: 'flex', 
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    userSelect: 'none'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 12, color: '#64748b' }}>{isExpanded ? '▼' : '▶'}</span>
                                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{className}</span>
                                                </div>
                                                <div style={{ fontSize: 14, color: '#64748b' }}>
                                                    <span style={{ color: '#10b981', fontWeight: 600 }}>{signedCount}</span> / {totalCount} signés
                                                </div>
                                            </div>
                                            
                                            {isExpanded && (
                                                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, background: 'white', borderTop: '1px solid #e2e8f0' }}>
                                                    {templates.map(p => (
                                                        <Link key={p._id} to={`/subadmin/templates/${p._id}/review`} style={{ textDecoration: 'none' }}>
                                                            <div className="card" style={{ 
                                                                cursor: 'pointer', 
                                                                position: 'relative',
                                                                transition: 'all 0.3s ease',
                                                                border: '1px solid #e2e8f0',
                                                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                                                                height: '100%'
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
                                                                    {p.isPromoted && (
                                                                        <span style={{ 
                                                                            marginLeft: 8, 
                                                                            fontSize: 11, 
                                                                            background: '#dcfce7', 
                                                                            color: '#166534', 
                                                                            padding: '2px 6px', 
                                                                            borderRadius: 4,
                                                                            border: '1px solid #bbf7d0'
                                                                        }}>
                                                                            Promu
                                                                        </span>
                                                                    )}
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
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    !loading && (
                        <div className="note">
                            {filter === 'all' ? 'Aucun carnet.' : filter === 'signed' ? 'Aucun carnet signé.' : 'Aucun carnet non signé.'}
                        </div>
                    )
                )}


            </div>
        </div>
    )
}
