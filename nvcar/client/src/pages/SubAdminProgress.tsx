import { useEffect, useState } from 'react'
import api from '../api'

type CategoryProgress = {
    name: string
    total: number
    filled: number
    percentage: number
}

type LevelProgress = {
    level: string
    activeCount: number
    totalAvailable: number
    percentage: number
    byCategory: CategoryProgress[]
}

type StudentProgress = {
    _id: string
    firstName: string
    lastName: string
    currentLevel: string
    className: string
    levelsData: LevelProgress[]
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
        const level = student.currentLevel || 'Sans niveau'
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
                                                        <th style={{ padding: 12, textAlign: 'left', color: '#475569', width: '20%' }}>Élève</th>
                                                        <th style={{ padding: 12, textAlign: 'center', color: '#475569', width: '10%' }}>Niveau</th>
                                                        <th style={{ padding: 12, textAlign: 'center', color: '#475569', width: '15%' }}>Global</th>
                                                        <th style={{ padding: 12, textAlign: 'left', color: '#475569', width: '55%' }}>Par Langue</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grouped[level][className].map(student => {
                                                        const levels = student.levelsData.length > 0 ? student.levelsData : [{ level: '-', activeCount: 0, totalAvailable: 0, percentage: 0, byCategory: [] }]
                                                        
                                                        return levels.map((lvlData, idx) => (
                                                            <tr key={`${student._id}-${lvlData.level}`} style={{ borderBottom: idx === levels.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                                {idx === 0 && (
                                                                    <td rowSpan={levels.length} style={{ padding: 12, fontWeight: 500, verticalAlign: 'top', borderRight: '1px solid #f1f5f9' }}>
                                                                        {student.firstName} {student.lastName}
                                                                    </td>
                                                                )}
                                                                <td style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                                                                    {lvlData.level}
                                                                </td>
                                                                <td style={{ padding: 12, textAlign: 'center' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
                                                                            <span>{lvlData.activeCount}</span>
                                                                            <span style={{ color: '#94a3b8' }}>/</span>
                                                                            <span>{lvlData.totalAvailable}</span>
                                                                        </div>
                                                                        <span style={{ 
                                                                            fontSize: 12,
                                                                            fontWeight: 600, 
                                                                            color: lvlData.percentage >= 80 ? '#16a34a' : lvlData.percentage >= 50 ? '#ca8a04' : '#dc2626'
                                                                        }}>
                                                                            {lvlData.percentage}%
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: 12 }}>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                                        {lvlData.byCategory.map(cat => (
                                                                            <div key={cat.name} style={{ 
                                                                                background: '#f8fafc', 
                                                                                border: '1px solid #e2e8f0',
                                                                                borderRadius: 6,
                                                                                padding: '4px 8px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: 8,
                                                                                fontSize: 12
                                                                            }}>
                                                                                <span style={{ color: '#475569', fontWeight: 500 }}>{cat.name}</span>
                                                                                <div style={{ 
                                                                                    background: cat.percentage >= 80 ? '#dcfce7' : cat.percentage >= 50 ? '#fef9c3' : '#fee2e2',
                                                                                    color: cat.percentage >= 80 ? '#166534' : cat.percentage >= 50 ? '#854d0e' : '#991b1b',
                                                                                    padding: '2px 6px',
                                                                                    borderRadius: 4,
                                                                                    fontWeight: 600,
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: 4
                                                                                }}>
                                                                                    <span>{cat.filled}/{cat.total}</span>
                                                                                    <span style={{ opacity: 0.8, fontSize: '0.9em' }}>({cat.percentage}%)</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
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
