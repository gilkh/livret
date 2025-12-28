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
                setStudents(Array.isArray(res.data) ? res.data : [])
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const grouped = (students || []).reduce((acc, student) => {
        const level = student.currentLevel || 'Sans niveau'
        const className = student.className || 'Sans classe'
        
        if (!acc[level]) acc[level] = {}
        if (!acc[level][className]) acc[level][className] = []
        
        acc[level][className].push(student)
        return acc
    }, {} as Record<string, Record<string, StudentProgress[]>>)

    const sortedLevels = Object.keys(grouped).sort()

    const calculateAverage = (students: StudentProgress[], targetLevel: string) => {
        if (!students.length) return 0
        
        const total = students.reduce((sum, student) => {
            const safeLevelsData = Array.isArray((student as any).levelsData) ? (student as any).levelsData : []
            const levelData = safeLevelsData.find((l: any) => l.level === targetLevel)
            return sum + (levelData?.percentage || 0)
        }, 0)
        
        return Math.round(total / students.length)
    }

    const calculateCategoryAverages = (students: StudentProgress[], targetLevel: string) => {
        const categoryTotals: Record<string, { sum: number, count: number }> = {}

        students.forEach(student => {
            const safeLevelsData = Array.isArray((student as any).levelsData) ? (student as any).levelsData : []
            const levelData = safeLevelsData.find((l: any) => l.level === targetLevel)
            
            if (levelData && Array.isArray(levelData.byCategory)) {
                levelData.byCategory.forEach((cat: CategoryProgress) => {
                    if (!categoryTotals[cat.name]) {
                        categoryTotals[cat.name] = { sum: 0, count: 0 }
                    }
                    categoryTotals[cat.name].sum += cat.percentage
                    categoryTotals[cat.name].count++
                })
            }
        })

        return Object.entries(categoryTotals).map(([name, data]) => ({
            name,
            average: data.count > 0 ? Math.round(data.sum / data.count) : 0
        })).sort((a, b) => a.name.localeCompare(b.name))
    }

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
                        {sortedLevels.map(level => {
                            const levelStudents = Object.values(grouped[level]).flat()
                            const levelAverage = calculateAverage(levelStudents, level)
                            const levelCategoryAverages = calculateCategoryAverages(levelStudents, level)
                            
                            return (
                            <div key={level} style={{ marginBottom: 32 }}>
                                <h3 style={{ 
                                    fontSize: 20, 
                                    color: '#334155', 
                                    marginBottom: 16, 
                                    borderBottom: '2px solid #e2e8f0', 
                                    paddingBottom: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap'
                                }}>
                                    <span style={{ background: '#64748b', color: 'white', padding: '4px 12px', borderRadius: 6, fontSize: 14 }}>
                                        {level}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        <span style={{ 
                                            fontSize: 14, 
                                            color: levelAverage >= 80 ? '#166534' : levelAverage >= 50 ? '#854d0e' : '#991b1b',
                                            background: levelAverage >= 80 ? '#dcfce7' : levelAverage >= 50 ? '#fef9c3' : '#fee2e2',
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            fontWeight: 600
                                        }}>
                                            Moyenne: {levelAverage}%
                                        </span>
                                        {levelCategoryAverages.map(cat => (
                                            <span key={cat.name} style={{ 
                                                fontSize: 13, 
                                                color: '#475569',
                                                background: '#f1f5f9',
                                                border: '1px solid #e2e8f0',
                                                padding: '2px 8px',
                                                borderRadius: 4,
                                                fontWeight: 500,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}>
                                                {cat.name}
                                                <span style={{
                                                    color: cat.average >= 80 ? '#166534' : cat.average >= 50 ? '#854d0e' : '#991b1b',
                                                    fontWeight: 600
                                                }}>
                                                    {cat.average}%
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </h3>
                                {Object.keys(grouped[level]).sort().map(className => {
                                    const classStudents = grouped[level][className]
                                    const classAverage = calculateAverage(classStudents, level)
                                    const classCategoryAverages = calculateCategoryAverages(classStudents, level)

                                    return (
                                    <div key={className} style={{ marginBottom: 24, paddingLeft: 16 }}>
                                        <h4 style={{ fontSize: 16, color: '#475569', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
                                                    {className}
                                                </span>
                                                <span style={{ color: '#94a3b8', fontSize: 14 }}>({classStudents.length} élèves)</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ 
                                                    fontSize: 13, 
                                                    color: classAverage >= 80 ? '#166534' : classAverage >= 50 ? '#854d0e' : '#991b1b',
                                                    background: classAverage >= 80 ? '#dcfce7' : classAverage >= 50 ? '#fef9c3' : '#fee2e2',
                                                    padding: '2px 6px',
                                                    borderRadius: 4,
                                                    fontWeight: 600,
                                                }}>
                                                    Moy. {classAverage}%
                                                </span>
                                                {classCategoryAverages.map(cat => (
                                                    <span key={cat.name} style={{ 
                                                        fontSize: 12, 
                                                        color: '#64748b',
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        padding: '2px 6px',
                                                        borderRadius: 4,
                                                        fontWeight: 500,
                                                        marginLeft: 4
                                                    }}>
                                                        {cat.name}: <span style={{
                                                            color: cat.average >= 80 ? '#166534' : cat.average >= 50 ? '#854d0e' : '#991b1b',
                                                            fontWeight: 600
                                                        }}>{cat.average}%</span>
                                                    </span>
                                                ))}
                                            </div>
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
                                                        const safeLevelsData = Array.isArray((student as any).levelsData) ? (student as any).levelsData : []
                                                        const levels = safeLevelsData.length > 0 ? safeLevelsData : [{ level: '-', activeCount: 0, totalAvailable: 0, percentage: 0, byCategory: [] }]
                                                        
                                                        return levels.map((lvlData: LevelProgress, idx: number) => (
                                                            <tr key={`${student._id}-${lvlData.level ?? idx}`} style={{ borderBottom: idx === levels.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
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
                                                                        {(Array.isArray((lvlData as any).byCategory) ? (lvlData as any).byCategory : []).map((cat: any) => (
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
                                )})}
                            </div>
                        )})}
                    </div>
                )}
            </div>
        </div>
    )
}
