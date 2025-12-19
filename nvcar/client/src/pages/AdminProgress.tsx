import { useEffect, useState } from 'react'
import api from '../api'
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    PieChart, 
    Pie, 
    Cell
} from 'recharts'

type CategoryProgress = {
    name: string
    total: number
    filled: number
    percentage: number
}

type ClassProgress = {
    classId: string
    className: string
    level: string
    teachers: string[]
    studentCount: number
    progress: {
        total: number
        filled: number
        percentage: number
    }
    byCategory: CategoryProgress[]
    teachersCheck?: {
        polyvalent: string[]
        english: string[]
        arabic: string[]
        hasPolyvalent: boolean
        hasEnglish: boolean
        hasArabic: boolean
    }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const ProgressSection = ({ title, subtitle, progress, byCategory, color = '#fff', compact = false }: any) => (
    <div style={{ 
        background: color, 
        borderRadius: compact ? 10 : 12, 
        border: '1px solid #e2e8f0',
        padding: compact ? 16 : 24,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: compact ? 12 : 24 }}>
            <div>
                <h4 style={{ fontSize: compact ? 16 : 20, fontWeight: 600, color: '#0f172a', margin: 0 }}>{title}</h4>
                {subtitle && <div style={{ color: '#64748b', fontSize: compact ? 13 : 15, marginTop: 4 }}>{subtitle}</div>}
            </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 16 : 32 }}>
            {/* Global Progress Pie Chart */}
            <div style={{ flex: compact ? '0 0 180px' : '0 0 250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h5 style={{ fontSize: compact ? 13 : 16, fontWeight: 600, color: '#475569', marginBottom: compact ? 8 : 12 }}>Progression Globale</h5>
                <div style={{ width: compact ? 140 : 200, height: compact ? 140 : 200, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={[
                                    { name: 'Rempli', value: progress.filled },
                                    { name: 'Restant', value: progress.total - progress.filled }
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={compact ? 42 : 60}
                                outerRadius={compact ? 58 : 80}
                                fill="#8884d8"
                                paddingAngle={5}
                                dataKey="value"
                            >
                                <Cell key="filled" fill="#22c55e" />
                                <Cell key="remaining" fill="#e2e8f0" />
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: compact ? 18 : 24, fontWeight: 700, color: '#0f172a' }}>{progress.percentage}%</div>
                        <div style={{ fontSize: compact ? 11 : 12, color: '#64748b' }}>complété</div>
                    </div>
                </div>
            </div>

            {/* Category Progress Bar Chart */}
            <div style={{ flex: 1, minWidth: compact ? 260 : 300 }}>
                <h5 style={{ fontSize: compact ? 13 : 16, fontWeight: 600, color: '#475569', marginBottom: compact ? 8 : 12 }}>Par Domaine / Langue</h5>
                <div style={{ width: '100%', height: compact ? 160 : 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={byCategory}
                            layout="vertical"
                            margin={{ top: 5, right: 18, left: compact ? 18 : 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} unit="%" />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                width={compact ? 80 : 100} 
                                tick={{ fontSize: compact ? 11 : 12 }}
                            />
                            <Tooltip 
                                formatter={(value: number, name: string, props: any) => {
                                    const data = props.payload;
                                    return [`${data.filled}/${data.total} (${value}%)`, 'Progression']
                                }}
                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={compact ? 12 : 20}>
                                {byCategory.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    </div>
)

type SubAdminProgress = {
    subAdminId: string
    displayName: string
    assignedLevels: string[]
    assignedTeacherCount: number
    totalStudents: number
    totalAssignments: number
    signedAssignments: number
    percentage: number
}

export default function AdminProgress() {
    const [classes, setClasses] = useState<ClassProgress[]>([])
    const [subAdmins, setSubAdmins] = useState<SubAdminProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const res = await api.get('/admin-extras/progress')
                setClasses(res.data.classes || [])
                setSubAdmins(res.data.subAdmins || [])
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const groupedByLevel = classes.reduce((acc, cls) => {
        if (!acc[cls.level]) acc[cls.level] = []
        acc[cls.level].push(cls)
        return acc
    }, {} as Record<string, ClassProgress[]>)

    const sortedLevels = Object.keys(groupedByLevel).sort()

    const getLevelStats = (levelClasses: ClassProgress[]) => {
        const stats = {
            studentCount: 0,
            progress: { total: 0, filled: 0, percentage: 0 },
            byCategory: {} as Record<string, { total: number, filled: number, name: string }>
        }

        levelClasses.forEach(cls => {
            stats.studentCount += cls.studentCount
            stats.progress.total += cls.progress.total
            stats.progress.filled += cls.progress.filled
            
            cls.byCategory.forEach(cat => {
                if (!stats.byCategory[cat.name]) {
                    stats.byCategory[cat.name] = { total: 0, filled: 0, name: cat.name }
                }
                stats.byCategory[cat.name].total += cat.total
                stats.byCategory[cat.name].filled += cat.filled
            })
        })

        stats.progress.percentage = stats.progress.total > 0 
            ? Math.round((stats.progress.filled / stats.progress.total) * 100) 
            : 0

        const byCategoryArray = Object.values(stats.byCategory).map(cat => ({
            ...cat,
            percentage: cat.total > 0 ? Math.round((cat.filled / cat.total) * 100) : 0
        }))

        return { ...stats, byCategory: byCategoryArray }
    }

    return (
        <div className="container">
            <div className="card" style={{ maxWidth: 1400, margin: '0 auto' }}>
                <h2 className="title" style={{ fontSize: 28, marginBottom: 20, color: '#1e293b' }}>
                    📈 Suivi Global des Classes
                </h2>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {!loading && !error && classes.length === 0 && (
                    <div className="note" style={{ textAlign: 'center', padding: 24 }}>
                        Aucune classe trouvée.
                    </div>
                )}

                {!loading && !error && classes.length > 0 && (
                    <div style={{ marginBottom: 40 }}>
                        <h3 style={{ fontSize: 20, color: '#334155', marginBottom: 20 }}>
                            📋 Vérification des Enseignants
                        </h3>
                        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, color: '#64748b' }}>Classe</th>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, color: '#64748b' }}>Arabe</th>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, color: '#64748b' }}>Anglais</th>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, color: '#64748b' }}>Polyvalent</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classes.sort((a, b) => a.className.localeCompare(b.className)).map(cls => {
                                        const check = cls.teachersCheck || { 
                                            polyvalent: [], english: [], arabic: [], 
                                            hasPolyvalent: false, hasEnglish: false, hasArabic: false 
                                        }
                                        
                                        // Helper for cell style
                                        const getCellStyle = (hasTeacher: boolean) => {
                                            if (!hasTeacher) return { background: '#fef2f2', color: '#dc2626' } // Pink red
                                            return {}
                                        }

                                        return (
                                            <tr key={cls.classId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 24px', fontWeight: 500 }}>{cls.className}</td>
                                                <td style={{ padding: '12px 24px', ...getCellStyle(check.hasArabic) }}>
                                                    {check.arabic.join(', ') || '-'}
                                                </td>
                                                <td style={{ padding: '12px 24px', ...getCellStyle(check.hasEnglish) }}>
                                                    {check.english.join(', ') || '-'}
                                                </td>
                                                <td style={{ padding: '12px 24px', ...getCellStyle(check.hasPolyvalent) }}>
                                                    {check.polyvalent.join(', ') || '-'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!loading && !error && classes.length > 0 && (
                    <div>
                        {sortedLevels.map(level => {
                            const levelClasses = groupedByLevel[level]
                            const levelStats = getLevelStats(levelClasses)
                            
                            return (
                                <div key={level} style={{ marginBottom: 40 }}>
                                    <h3 style={{ 
                                        fontSize: 20, 
                                        color: '#334155', 
                                        marginBottom: 20, 
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

                                    {/* Level Summary */}
                                    <div style={{ marginBottom: 24 }}>
                                        <ProgressSection 
                                            title={`Résumé ${level}`}
                                            subtitle={`${levelStats.studentCount} élèves au total`}
                                            progress={levelStats.progress}
                                            byCategory={levelStats.byCategory}
                                            color="#f8fafc"
                                            compact
                                        />
                                    </div>

                                    {/* Classes Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                                        {levelClasses.map(cls => (
                                            <ProgressSection 
                                                key={cls.classId}
                                                title={cls.className}
                                                subtitle={`${cls.teachers.join(', ') || 'Aucun enseignant'} • ${cls.studentCount} élèves`}
                                                progress={cls.progress}
                                                byCategory={cls.byCategory}
                                                compact
                                            />
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Sub-Admin Progress Section */}
                {!loading && !error && subAdmins.length > 0 && (
                    <div style={{ marginTop: 60, borderTop: '2px solid #e2e8f0', paddingTop: 40 }}>
                        <h2 className="title" style={{ fontSize: 24, marginBottom: 20, color: '#1e293b' }}>
                            👥 Suivi des Sous-Administrateurs
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                            {subAdmins.map(sa => (
                                <div key={sa.subAdminId} style={{ 
                                    background: '#fff', 
                                    borderRadius: 10, 
                                    border: '1px solid #e2e8f0',
                                    padding: 16,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{sa.displayName}</h4>
                                        <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, fontSize: 12, color: '#64748b' }}>
                                            {sa.percentage}% Signé
                                        </span>
                                    </div>
                                    
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Périmètre:</div>
                                        <div style={{ fontSize: 14, color: '#334155' }}>
                                            {sa.assignedLevels.length > 0 ? sa.assignedLevels.join(', ') : 'Aucun niveau'} 
                                            {sa.assignedTeacherCount > 0 && ` • ${sa.assignedTeacherCount} Enseignants`}
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                                            <span style={{ color: '#64748b' }}>Élèves</span>
                                            <span style={{ fontWeight: 600 }}>{sa.totalStudents}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                            <span style={{ color: '#64748b' }}>Carnets Signés</span>
                                            <span style={{ fontWeight: 600 }}>{sa.signedAssignments} / {sa.totalAssignments}</span>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                        <div style={{ 
                                            height: '100%', 
                                            width: `${sa.percentage}%`, 
                                            background: sa.percentage === 100 ? '#22c55e' : '#3b82f6',
                                            transition: 'width 0.5s ease'
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
