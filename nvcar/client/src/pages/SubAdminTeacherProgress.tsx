import { useEffect, useState } from 'react'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
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
    teachers?: string[]
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
}

type StudentProgress = {
    studentId: string
    firstName: string
    lastName: string
    arabic: boolean
    english: boolean
    polyvalent: boolean
    hasArabic: boolean
    hasEnglish: boolean
    hasPolyvalent: boolean
}

type ClassDetailedProgress = {
    classId: string
    className: string
    level: string
    students: StudentProgress[]
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const ProgressSection = ({ title, subtitle, progress, byCategory, color = '#fff' }: any) => (
    <div style={{
        background: color,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        padding: 16,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
            <div>
                <h4 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>{title}</h4>
                {subtitle && <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{subtitle}</div>}
            </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
            {/* Global Progress Pie Chart */}
            <div style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h5 style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Progression Globale</h5>
                <div style={{ width: 140, height: 140, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={[
                                    { name: 'Rempli', value: progress.filled },
                                    { name: 'Restant', value: progress.total - progress.filled }
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={60}
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
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{progress.percentage}%</div>
                    </div>
                </div>
            </div>

            {/* Category Progress Bar Chart */}
            <div style={{ flex: 1, minWidth: 350, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h5 style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 12 }}>Par Enseignant / Domaine</h5>
                <div style={{ width: '100%', height: Math.max(180, byCategory.length * 65) }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={byCategory}
                            layout="vertical"
                            margin={{ top: 10, right: 30, left: 180, bottom: 10 }}
                            barGap={2}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} unit="%" />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={170}
                                tick={(props) => {
                                    const { x, y, payload } = props;
                                    const categoryData = byCategory.find((c: any) => c.name === payload.value);
                                    const teachers = categoryData?.teachers?.join(', ') || '';
                                    const displayName = payload.value.length > 25 ? payload.value.substring(0, 23) + '...' : payload.value;

                                    return (
                                        <g transform={`translate(${x},${y})`}>
                                            <text x={-10} y={-6} textAnchor="end" fill="#334155" fontSize={13} fontWeight={500}>
                                                {displayName}
                                            </text>
                                            <text x={-10} y={14} textAnchor="end" fill="#64748b" fontSize={11}>
                                                {teachers.length > 30 ? teachers.substring(0, 28) + '...' : teachers}
                                            </text>
                                        </g>
                                    );
                                }}
                            />
                            <Tooltip
                                formatter={(value: number, name: string, props: any) => {
                                    const data = props.payload;
                                    return [
                                        <div key="tooltip">
                                            <div>Progression: {data.filled}/{data.total} ({value}%)</div>
                                            {data.teachers && data.teachers.length > 0 && (
                                                <div style={{ marginTop: 4, fontSize: 12, color: '#ccc' }}>
                                                    Enseignants: {data.teachers.join(', ')}
                                                </div>
                                            )}
                                        </div>,
                                        ''
                                    ]
                                }}
                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16}>
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

const CompactProgressCard = ({ title, subtitle, progress, byCategory }: any) => (
    <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        padding: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box'
    }}>
        <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h4>
                <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: progress.percentage === 100 ? '#16a34a' : '#2563eb',
                    background: progress.percentage === 100 ? '#dcfce7' : '#dbeafe',
                    padding: '2px 8px',
                    borderRadius: 12
                }}>
                    {progress.percentage}%
                </span>
            </div>
            {subtitle && <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{subtitle}</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {byCategory.map((cat: any, idx: number) => (
                <div key={idx} style={{ fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 500, color: '#334155' }}>{cat.name}</span>
                        <span style={{ color: '#64748b' }}>{cat.percentage}%</span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${cat.percentage}%`,
                            background: COLORS[idx % COLORS.length],
                            borderRadius: 4
                        }} />
                    </div>
                    {cat.teachers && cat.teachers.length > 0 && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cat.teachers.join(', ')}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
)

export default function SubAdminTeacherProgress() {
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary')
    const [classes, setClasses] = useState<ClassProgress[]>([])
    const [detailedClasses, setDetailedClasses] = useState<ClassDetailedProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const { activeYearId, isLoading: yearLoading } = useSchoolYear()

    useEffect(() => {
        const loadData = async () => {
            // Wait for school year context to finish loading
            if (yearLoading) return

            if (!activeYearId) {
                setLoading(false)
                return
            }
            try {
                setLoading(true)
                if (viewMode === 'summary') {
                    const res = await api.get(`/subadmin-assignments/teacher-progress?schoolYearId=${activeYearId}`)
                    setClasses(res.data)
                } else {
                    const res = await api.get(`/subadmin-assignments/teacher-progress-detailed?schoolYearId=${activeYearId}`)
                    setDetailedClasses(res.data)
                }
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [viewMode, activeYearId, yearLoading])

    const groupedByLevel = classes.reduce((acc, cls) => {
        if (!acc[cls.level]) acc[cls.level] = []
        acc[cls.level].push(cls)
        return acc
    }, {} as Record<string, ClassProgress[]>)

    const sortedLevels = Object.keys(groupedByLevel).sort()

    const detailedGroupedByLevel = detailedClasses.reduce((acc, cls) => {
        if (!acc[cls.level]) acc[cls.level] = []
        acc[cls.level].push(cls)
        return acc
    }, {} as Record<string, ClassDetailedProgress[]>)

    const detailedSortedLevels = Object.keys(detailedGroupedByLevel).sort()

    const getLevelStats = (levelClasses: ClassProgress[]) => {
        const stats = {
            studentCount: 0,
            progress: { total: 0, filled: 0, percentage: 0 },
            byCategory: {} as Record<string, { total: number, filled: number, name: string, teachers: Set<string> }>
        }

        levelClasses.forEach(cls => {
            stats.studentCount += cls.studentCount
            stats.progress.total += cls.progress.total
            stats.progress.filled += cls.progress.filled

            cls.byCategory.forEach(cat => {
                if (!stats.byCategory[cat.name]) {
                    stats.byCategory[cat.name] = { total: 0, filled: 0, name: cat.name, teachers: new Set() }
                }
                stats.byCategory[cat.name].total += cat.total
                stats.byCategory[cat.name].filled += cat.filled

                if (cat.teachers && Array.isArray(cat.teachers)) {
                    cat.teachers.forEach(t => stats.byCategory[cat.name].teachers.add(t))
                }
            })
        })

        stats.progress.percentage = stats.progress.total > 0
            ? Math.round((stats.progress.filled / stats.progress.total) * 100)
            : 0

        const byCategoryArray = Object.values(stats.byCategory).map(cat => ({
            ...cat,
            teachers: Array.from(cat.teachers),
            percentage: cat.total > 0 ? Math.round((cat.filled / cat.total) * 100) : 0
        }))

        return { ...stats, byCategory: byCategoryArray }
    }

    return (
        <div className="container">
            <div className="card" style={{ maxWidth: 1200, margin: '0 auto', background: 'transparent', boxShadow: 'none', padding: 0 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 32,
                    background: '#fff',
                    padding: '24px',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    border: '1px solid #e2e8f0'
                }}>
                    <div>
                        <h2 className="title" style={{ fontSize: 24, margin: '0 0 8px 0', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '28px' }}>📈</span> Suivi des Enseignants
                        </h2>
                        <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>
                            Suivez la progression du remplissage des livrets par classe et par enseignant
                        </p>
                    </div>

                    <div style={{
                        background: '#f1f5f9',
                        padding: '6px',
                        borderRadius: '12px',
                        display: 'flex',
                        gap: '6px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <button
                            onClick={() => setViewMode('summary')}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'summary' ? '#fff' : 'transparent',
                                color: viewMode === 'summary' ? '#0f172a' : '#64748b',
                                fontWeight: viewMode === 'summary' ? 600 : 500,
                                boxShadow: viewMode === 'summary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                outline: 'none'
                            }}
                        >
                            <span>📊</span> Vue Globale
                        </button>
                        <button
                            onClick={() => setViewMode('detailed')}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'detailed' ? '#fff' : 'transparent',
                                color: viewMode === 'detailed' ? '#0f172a' : '#64748b',
                                fontWeight: viewMode === 'detailed' ? 600 : 500,
                                boxShadow: viewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                outline: 'none'
                            }}
                        >
                            <span>📋</span> Vue Détaillée
                        </button>
                    </div>
                </div>

                {(loading || yearLoading) && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {!loading && !yearLoading && !activeYearId && (
                    <div className="note" style={{ textAlign: 'center', padding: 24, color: '#b45309', background: '#fef3c7', borderRadius: 8, border: '1px solid #fcd34d' }}>
                        Aucune année scolaire active trouvée. Veuillez sélectionner une année scolaire.
                    </div>
                )}

                {!loading && !yearLoading && !error && activeYearId && viewMode === 'summary' && classes.length === 0 && (
                    <div className="note" style={{ textAlign: 'center', padding: 24 }}>
                        Aucune classe trouvée pour vos niveaux assignés.
                    </div>
                )}

                {!loading && !yearLoading && !error && activeYearId && viewMode === 'summary' && classes.length > 0 && (
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
                                    <div style={{ marginBottom: 64 }}>
                                        <ProgressSection
                                            title={`Résumé ${level}`}
                                            subtitle={`${levelStats.studentCount} élèves au total`}
                                            progress={levelStats.progress}
                                            byCategory={levelStats.byCategory}
                                            color="#f8fafc"
                                        />
                                    </div>

                                    {/* Classes Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                        gap: 24,
                                        rowGap: 48
                                    }}>
                                        {levelClasses.map(cls => (
                                            <CompactProgressCard
                                                key={cls.classId}
                                                title={cls.className}
                                                subtitle={`${cls.teachers.join(', ') || 'Aucun enseignant'} • ${cls.studentCount} élèves`}
                                                progress={cls.progress}
                                                byCategory={cls.byCategory}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {!loading && !yearLoading && !error && activeYearId && viewMode === 'detailed' && detailedClasses.length === 0 && (
                    <div className="note" style={{ textAlign: 'center', padding: 24 }}>
                        Aucune classe trouvée pour vos niveaux assignés.
                    </div>
                )}

                {!loading && !yearLoading && !error && activeYearId && viewMode === 'detailed' && detailedClasses.length > 0 && (
                    <div>
                        {detailedSortedLevels.map(level => (
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

                                {detailedGroupedByLevel[level].map(cls => (
                                    <div key={cls.classId} style={{ marginBottom: 30 }}>
                                        <h4 style={{ fontSize: 18, fontWeight: 600, color: '#475569', marginBottom: 12 }}>{cls.className}</h4>
                                        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b' }}>Élève</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>Prof. Polyvalent</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>Arabe</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>Anglais</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {cls.students.map((student, idx) => (
                                                        <tr key={student.studentId} style={{ borderBottom: idx < cls.students.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 500, color: '#334155' }}>
                                                                {student.lastName} {student.firstName}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                {student.hasPolyvalent ? (
                                                                    student.polyvalent ? <span style={{ color: '#22c55e', fontSize: 18 }}>✔</span> : <span style={{ color: '#ef4444', fontSize: 18 }}>✘</span>
                                                                ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>N/A</span>}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                {student.hasArabic ? (
                                                                    student.arabic ? <span style={{ color: '#22c55e', fontSize: 18 }}>✔</span> : <span style={{ color: '#ef4444', fontSize: 18 }}>✘</span>
                                                                ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>N/A</span>}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                {student.hasEnglish ? (
                                                                    student.english ? <span style={{ color: '#22c55e', fontSize: 18 }}>✔</span> : <span style={{ color: '#ef4444', fontSize: 18 }}>✘</span>
                                                                ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>N/A</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
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
