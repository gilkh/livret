import { useEffect, useState } from 'react'
import api from '../api'
import './AdminProgress.css'
import ProgressSection from '../components/ProgressSection' 

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

// ProgressSection extracted to components/ProgressSection.tsx (keeps behavior and adds accessibility)
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

    // UI state: filters & sorting
    const [searchQuery, setSearchQuery] = useState('')
    const [levelFilter, setLevelFilter] = useState('all')
    const [sortBy, setSortBy] = useState('className')

    const filteredClasses = classes
      .filter(c => (levelFilter === 'all' || c.level === levelFilter) && c.className.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'progress_desc') return b.progress.percentage - a.progress.percentage
        if (sortBy === 'progress_asc') return a.progress.percentage - b.progress.percentage
        return a.className.localeCompare(b.className)
      })

    const filteredSubAdmins = subAdmins.filter(sa => levelFilter === 'all' || sa.assignedLevels.includes(levelFilter))

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

    const levelsToShow = levelFilter === 'all' ? sortedLevels : sortedLevels.filter(l => l === levelFilter)

    // Helper: clear filters
    const clearFilters = () => { setSearchQuery(''); setLevelFilter('all'); setSortBy('className') }

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
                <h2 className="title" style={{ fontSize: 28, marginBottom: 12, color: '#1e293b' }}>
                    📈 Suivi Global des Classes
                </h2>

                {/* Filter / Controls */}
                <div className="filter-bar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <input
                        className="search-input"
                        aria-label="Rechercher une classe"
                        placeholder="Rechercher une classe..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 220 }}
                    />

                    <select aria-label="Filtrer par niveau" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <option value="all">Tous niveaux</option>
                        {sortedLevels.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                    </select>

                    <select aria-label="Trier" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <option value="className">Trier: Nom</option>
                        <option value="progress_desc">Trier: Progression desc.</option>
                        <option value="progress_asc">Trier: Progression asc.</option>
                    </select>

                    <button className="btn-clear" onClick={clearFilters} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>
                        Réinitialiser
                    </button>
                </div>

                <div style={{ marginBottom: 12, color: '#475569', fontSize: 13 }}>
                    <strong>{filteredClasses.length}</strong> classes affichées • <strong>{filteredSubAdmins.length}</strong> sous-admins
                </div>

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
                                    {filteredClasses.map(cls => {
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
                        {levelsToShow.map(level => {
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
                                        {levelClasses.filter(c => c.className.toLowerCase().includes(searchQuery.toLowerCase())).map(cls => (
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
                            {filteredSubAdmins.map(sa => (
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
