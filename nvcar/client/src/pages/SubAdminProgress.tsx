import { useEffect, useState } from 'react'
import api from '../api'

type StudentProgress = {
    _id: string
    firstName: string
    lastName: string
    level: string
    className: string
    activeCount: number
    totalAvailable: number
}

export default function SubAdminProgress() {
    const [students, setStudents] = useState<StudentProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const res = await api.get('/subadmin-assignments/progress')
                setStudents(res.data)
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const grouped = students.reduce((acc, student) => {
        const level = student.level || 'Sans niveau'
        const className = student.className || 'Sans classe'
        
        if (!acc[level]) acc[level] = {}
        if (!acc[level][className]) acc[level][className] = []
        
        acc[level][className].push(student)
        return acc
    }, {} as Record<string, Record<string, StudentProgress[]>>)

    const sortedLevels = Object.keys(grouped).sort()

    return (
        <div className="container">
            <div className="card">
                <h2 className="title" style={{ fontSize: 28, marginBottom: 20, color: '#1e293b' }}>
                    📊 Progression des Élèves
                </h2>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {!loading && !error && students.length === 0 && (
                    <div className="note" style={{ textAlign: 'center', padding: 24 }}>
                        Aucun élève trouvé avec un carnet terminé pour vos niveaux assignés.
                    </div>
                )}

                {!loading && !error && students.length > 0 && (
                    <div>
                        {sortedLevels.map(level => (
                            <div key={level} style={{ marginBottom: 32 }}>
                                <h3 style={{ 
                                    fontSize: 20, 
                                    color: '#334155', 
                                    marginBottom: 16, 
                                    borderBottom: '2px solid #e2e8f0', 
                                    paddingBottom: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12
                                }}>
                                    <span style={{ background: '#64748b', color: 'white', padding: '4px 12px', borderRadius: 6, fontSize: 14 }}>
                                        {level}
                                    </span>
                                </h3>
                                {Object.keys(grouped[level]).sort().map(className => (
                                    <div key={className} style={{ marginBottom: 24, paddingLeft: 16 }}>
                                        <h4 style={{ fontSize: 16, color: '#475569', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
                                                {className}
                                            </span>
                                            <span style={{ color: '#94a3b8', fontSize: 14 }}>({grouped[level][className].length} élèves)</span>
                                        </h4>
                                        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                        <th style={{ padding: 12, textAlign: 'left', color: '#475569', width: '40%' }}>Élève</th>
                                                        <th style={{ padding: 12, textAlign: 'center', color: '#475569', width: '30%' }}>Progression</th>
                                                        <th style={{ padding: 12, textAlign: 'right', color: '#475569', width: '30%' }}>%</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grouped[level][className].map(student => {
                                                        const percentage = student.totalAvailable > 0 
                                                            ? Math.round((student.activeCount / student.totalAvailable) * 100) 
                                                            : 0
                                                        
                                                        return (
                                                            <tr key={student._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: 12, fontWeight: 500 }}>
                                                                    {student.firstName} {student.lastName}
                                                                </td>
                                                                <td style={{ padding: 12, textAlign: 'center' }}>
                                                                    <div style={{ 
                                                                        display: 'inline-flex', 
                                                                        alignItems: 'center', 
                                                                        gap: 8,
                                                                        background: '#f0f9ff',
                                                                        padding: '4px 12px',
                                                                        borderRadius: 16,
                                                                        color: '#0369a1',
                                                                        fontWeight: 600
                                                                    }}>
                                                                        <span>{student.activeCount}</span>
                                                                        <span style={{ color: '#94a3b8' }}>/</span>
                                                                        <span>{student.totalAvailable}</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: 12, textAlign: 'right' }}>
                                                                    <span style={{ 
                                                                        fontWeight: 600, 
                                                                        color: percentage >= 80 ? '#16a34a' : percentage >= 50 ? '#ca8a04' : '#dc2626'
                                                                    }}>
                                                                        {percentage}%
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
