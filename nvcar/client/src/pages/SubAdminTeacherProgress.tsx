import { useEffect, useState, useMemo } from 'react'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import './SubAdminTeacherProgress.css'

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

const GRADIENT_COLORS = [
    'purple', 'blue', 'green', 'amber', 'rose', 'cyan'
]

// Circular Progress Component
const CircularProgress = ({ percentage, size = 80, strokeWidth = 8 }: { percentage: number, size?: number, strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="circular-progress" style={{ width: size, height: size }}>
            <svg width={size} height={size}>
                <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                </defs>
                <circle
                    className="circular-progress-bg"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
                <circle
                    className="circular-progress-fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
            </svg>
            <div className="circular-progress-text">
                <span className="circular-progress-percentage">{percentage}%</span>
            </div>
        </div>
    )
}

// Level Summary Component - Compact Version
const LevelSummary = ({ title, subtitle, progress, byCategory }: any) => (
    <div className="level-summary-card compact">
        <div className="summary-content-compact">
            <div className="circular-progress-section">
                <CircularProgress percentage={progress.percentage} />
                <div className="progress-meta">
                    <span className="progress-meta-title">{title}</span>
                    <span className="progress-meta-subtitle">{subtitle}</span>
                </div>
            </div>

            <div className="category-progress-compact">
                {byCategory.map((cat: any, idx: number) => (
                    <div key={idx} className="category-item-compact">
                        <div className="category-compact-header">
                            <span className="category-name-compact">{cat.name}</span>
                            <span className="category-percentage-compact">{cat.percentage}%</span>
                        </div>
                        <div className="category-bar-compact">
                            <div
                                className={`category-bar-fill ${GRADIENT_COLORS[idx % GRADIENT_COLORS.length]}`}
                                style={{ width: `${cat.percentage}%` }}
                            />
                        </div>
                        {cat.teachers && cat.teachers.length > 0 && (
                            <span className="category-teachers-compact">
                                {cat.teachers.slice(0, 2).join(', ')}
                                {cat.teachers.length > 2 && ` +${cat.teachers.length - 2}`}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
)

// Class Card Component
const ClassCard = ({ cls, index }: { cls: ClassProgress, index: number }) => {
    const getBadgeClass = (percentage: number) => {
        if (percentage === 100) return 'complete'
        if (percentage >= 75) return 'high'
        if (percentage >= 50) return 'medium'
        return 'low'
    }

    const getBadgeIcon = (percentage: number) => {
        if (percentage === 100) return '✓'
        if (percentage >= 75) return '↗'
        if (percentage >= 50) return '→'
        return '↘'
    }

    return (
        <div className="class-card" style={{ animationDelay: `${index * 0.05}s` }}>
            <div className="class-card-header">
                <div className="class-info">
                    <h4 className="class-name">{cls.className}</h4>
                    <p className="class-details">
                        <span>{cls.studentCount} élèves</span>
                    </p>
                </div>
                <div className={`class-percentage-badge ${getBadgeClass(cls.progress.percentage)}`}>
                    <span>{getBadgeIcon(cls.progress.percentage)}</span>
                    <span>{cls.progress.percentage}%</span>
                </div>
            </div>

            <div className="class-categories">
                {cls.byCategory.map((cat, idx) => (
                    <div key={idx} className="mini-category">
                        <div className="mini-category-header">
                            <span className="mini-category-name">{cat.name}</span>
                            <span className="mini-category-percentage">{cat.percentage}%</span>
                        </div>
                        <div className="mini-category-bar">
                            <div
                                className="mini-category-fill"
                                style={{
                                    width: `${cat.percentage}%`,
                                    background: `linear-gradient(90deg, ${getGradientColors(idx)})`
                                }}
                            />
                        </div>
                        {cat.teachers && cat.teachers.length > 0 && (
                            <div className="mini-category-teachers">
                                {cat.teachers.join(', ')}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

const getGradientColors = (idx: number): string => {
    const gradients = [
        '#6366f1, #8b5cf6',
        '#3b82f6, #60a5fa',
        '#22c55e, #4ade80',
        '#f59e0b, #fbbf24',
        '#f43f5e, #fb7185',
        '#06b6d4, #22d3ee'
    ]
    return gradients[idx % gradients.length]
}

// Detailed Table View Component
const DetailedClassTable = ({ cls, isExpanded, onToggle }: { cls: ClassDetailedProgress, isExpanded: boolean, onToggle: () => void }) => {
    // Calculate completion stats for the class
    const completionStats = useMemo(() => {
        let completed = 0
        let total = 0
        cls.students.forEach(student => {
            if (student.hasPolyvalent) {
                total++
                if (student.polyvalent) completed++
            }
            if (student.hasArabic) {
                total++
                if (student.arabic) completed++
            }
            if (student.hasEnglish) {
                total++
                if (student.english) completed++
            }
        })
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
        return { completed, total, percentage }
    }, [cls.students])

    const getBadgeClass = (percentage: number) => {
        if (percentage === 100) return 'complete'
        if (percentage >= 75) return 'high'
        if (percentage >= 50) return 'medium'
        return 'low'
    }

    return (
        <div className={`class-detailed-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="class-detailed-header" onClick={onToggle}>
                <div className="class-detailed-header-left">
                    <button className="class-expand-toggle" aria-label={isExpanded ? 'Réduire' : 'Développer'}>
                        <span className={`toggle-icon ${isExpanded ? 'rotated' : ''}`}>▶</span>
                    </button>
                    <h4 className="class-detailed-title">{cls.className}</h4>
                    <span className="class-student-count">{cls.students.length} élèves</span>
                </div>
                <div className="class-detailed-header-right">
                    <div className={`class-completion-badge ${getBadgeClass(completionStats.percentage)}`}>
                        {completionStats.percentage}%
                    </div>
                </div>
            </div>
            <div className={`student-table-wrapper ${isExpanded ? 'expanded' : 'collapsed'}`}>
                <div className="student-table-container">
                    <table className="student-table">
                        <thead>
                            <tr>
                                <th>Élève</th>
                                <th>Prof. Polyvalent</th>
                                <th>Arabe</th>
                                <th>Anglais</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cls.students.map((student) => (
                                <tr key={student.studentId}>
                                    <td>
                                        <span className="student-name">
                                            {student.lastName} {student.firstName}
                                        </span>
                                    </td>
                                    <td>
                                        {student.hasPolyvalent ? (
                                            student.polyvalent
                                                ? <span className="status-icon complete">✓</span>
                                                : <span className="status-icon pending">✗</span>
                                        ) : <span className="status-icon na">N/A</span>}
                                    </td>
                                    <td>
                                        {student.hasArabic ? (
                                            student.arabic
                                                ? <span className="status-icon complete">✓</span>
                                                : <span className="status-icon pending">✗</span>
                                        ) : <span className="status-icon na">N/A</span>}
                                    </td>
                                    <td>
                                        {student.hasEnglish ? (
                                            student.english
                                                ? <span className="status-icon complete">✓</span>
                                                : <span className="status-icon pending">✗</span>
                                        ) : <span className="status-icon na">N/A</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default function SubAdminTeacherProgress() {
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary')
    const [classes, setClasses] = useState<ClassProgress[]>([])
    const [detailedClasses, setDetailedClasses] = useState<ClassDetailedProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())

    const toggleClassExpanded = (classId: string) => {
        setExpandedClasses(prev => {
            const newSet = new Set(prev)
            if (newSet.has(classId)) {
                newSet.delete(classId)
            } else {
                newSet.add(classId)
            }
            return newSet
        })
    }

    const expandAllClasses = () => {
        const allIds = detailedClasses.map(cls => cls.classId)
        setExpandedClasses(new Set(allIds))
    }

    const collapseAllClasses = () => {
        setExpandedClasses(new Set())
    }
    const { activeYearId, isLoading: yearLoading } = useSchoolYear()

    useEffect(() => {
        const loadData = async () => {
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

    const groupedByLevel = useMemo(() =>
        classes.reduce((acc, cls) => {
            if (!acc[cls.level]) acc[cls.level] = []
            acc[cls.level].push(cls)
            return acc
        }, {} as Record<string, ClassProgress[]>),
        [classes])

    const sortedLevels = Object.keys(groupedByLevel).sort()

    const detailedGroupedByLevel = useMemo(() =>
        detailedClasses.reduce((acc, cls) => {
            if (!acc[cls.level]) acc[cls.level] = []
            acc[cls.level].push(cls)
            return acc
        }, {} as Record<string, ClassDetailedProgress[]>),
        [detailedClasses])

    const detailedSortedLevels = Object.keys(detailedGroupedByLevel).sort()

    const getLevelStats = (levelClasses: ClassProgress[]) => {
        const stats = {
            studentCount: 0,
            classCount: levelClasses.length,
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

    // Calculate global stats
    const globalStats = useMemo(() => {
        const totalStudents = classes.reduce((sum, cls) => sum + cls.studentCount, 0)
        const totalClasses = classes.length
        const totalProgress = classes.reduce((sum, cls) => sum + cls.progress.filled, 0)
        const totalItems = classes.reduce((sum, cls) => sum + cls.progress.total, 0)
        const avgProgress = totalItems > 0 ? Math.round((totalProgress / totalItems) * 100) : 0
        const completedClasses = classes.filter(cls => cls.progress.percentage === 100).length

        return { totalStudents, totalClasses, avgProgress, completedClasses }
    }, [classes])

    return (
        <div className="teacher-progress-page">
            <div className="teacher-progress-wrapper">
                {/* Hero Header */}
                <div className="teacher-progress-header">
                    <div className="header-content">
                        <div className="header-text">
                            <div className="header-icon">📈</div>
                            <h1 className="header-title">Suivi des Enseignants</h1>
                            <p className="header-subtitle">
                                Suivez la progression du remplissage des livrets par classe et par enseignant
                            </p>
                        </div>

                        <div className="view-toggle-container">
                            <button
                                onClick={() => setViewMode('summary')}
                                className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}
                            >
                                <span className="icon">📊</span>
                                Vue Globale
                            </button>
                            <button
                                onClick={() => setViewMode('detailed')}
                                className={`view-toggle-btn ${viewMode === 'detailed' ? 'active' : ''}`}
                            >
                                <span className="icon">📋</span>
                                Vue Détaillée
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stats Overview - Only show in summary mode with data */}
                {!loading && !yearLoading && !error && activeYearId && viewMode === 'summary' && classes.length > 0 && (
                    <div className="stats-overview">
                        <div className="stat-card">
                            <div className="stat-icon purple">👥</div>
                            <div className="stat-info">
                                <p className="stat-label">Total Élèves</p>
                                <h3 className="stat-value">{globalStats.totalStudents}</h3>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon blue">🏫</div>
                            <div className="stat-info">
                                <p className="stat-label">Classes</p>
                                <h3 className="stat-value">{globalStats.totalClasses}</h3>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon green">📈</div>
                            <div className="stat-info">
                                <p className="stat-label">Progression Moyenne</p>
                                <h3 className="stat-value">{globalStats.avgProgress}%</h3>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon amber">✅</div>
                            <div className="stat-info">
                                <p className="stat-label">Classes Complétées</p>
                                <h3 className="stat-value">{globalStats.completedClasses}</h3>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {(loading || yearLoading) && (
                    <div className="loading-container">
                        <div className="loading-spinner" />
                        <p className="loading-text">Chargement des données...</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="error-container">
                        <div className="error-icon">⚠️</div>
                        <p className="error-text">{error}</p>
                    </div>
                )}

                {/* No School Year Warning */}
                {!loading && !yearLoading && !activeYearId && (
                    <div className="warning-container">
                        <div className="warning-icon">📅</div>
                        <p className="warning-text">
                            Aucune année scolaire active trouvée. Veuillez sélectionner une année scolaire.
                        </p>
                    </div>
                )}

                {/* Empty State - Summary */}
                {!loading && !yearLoading && !error && activeYearId && viewMode === 'summary' && classes.length === 0 && (
                    <div className="empty-container">
                        <div className="empty-icon">📚</div>
                        <h3 className="empty-title">Aucune classe trouvée</h3>
                        <p className="empty-text">Aucune classe n'a été trouvée pour vos niveaux assignés.</p>
                    </div>
                )}

                {/* Summary View */}
                {!loading && !yearLoading && !error && activeYearId && viewMode === 'summary' && classes.length > 0 && (
                    <div>
                        {sortedLevels.map((level, levelIdx) => {
                            const levelClasses = groupedByLevel[level]
                            const levelStats = getLevelStats(levelClasses)

                            return (
                                <div
                                    key={level}
                                    className="level-section"
                                    style={{ animationDelay: `${levelIdx * 0.1}s` }}
                                >
                                    <div className="level-header">
                                        <div className="level-badge">
                                            <span className="emoji">🎓</span>
                                            {level}
                                        </div>
                                        <div className="level-stats">
                                            <div className="level-stat">
                                                <strong>{levelStats.classCount}</strong> classes
                                            </div>
                                            <div className="level-stat">
                                                <strong>{levelStats.studentCount}</strong> élèves
                                            </div>
                                            <div className="level-stat">
                                                <strong>{levelStats.progress.percentage}%</strong> complété
                                            </div>
                                        </div>
                                    </div>

                                    <LevelSummary
                                        title={`Résumé ${level}`}
                                        subtitle={`${levelStats.studentCount} élèves répartis dans ${levelStats.classCount} classes`}
                                        progress={levelStats.progress}
                                        byCategory={levelStats.byCategory}
                                    />

                                    <div className="classes-grid">
                                        {levelClasses.map((cls, idx) => (
                                            <ClassCard key={cls.classId} cls={cls} index={idx} />
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Empty State - Detailed */}
                {!loading && !yearLoading && !error && activeYearId && viewMode === 'detailed' && detailedClasses.length === 0 && (
                    <div className="empty-container">
                        <div className="empty-icon">📋</div>
                        <h3 className="empty-title">Aucune donnée détaillée</h3>
                        <p className="empty-text">Aucune classe n'a été trouvée pour vos niveaux assignés.</p>
                    </div>
                )}

                {/* Detailed View */}
                {!loading && !yearLoading && !error && activeYearId && viewMode === 'detailed' && detailedClasses.length > 0 && (
                    <div className="detailed-section">
                        <div className="detailed-controls">
                            <button className="expand-all-btn" onClick={expandAllClasses}>
                                <span className="icon">⬇️</span>
                                Tout développer
                            </button>
                            <button className="collapse-all-btn" onClick={collapseAllClasses}>
                                <span className="icon">⬆️</span>
                                Tout réduire
                            </button>
                        </div>
                        {detailedSortedLevels.map((level, levelIdx) => (
                            <div
                                key={level}
                                className="level-section"
                                style={{ animationDelay: `${levelIdx * 0.1}s` }}
                            >
                                <div className="level-header">
                                    <div className="level-badge">
                                        <span className="emoji">🎓</span>
                                        {level}
                                    </div>
                                </div>

                                {detailedGroupedByLevel[level].map(cls => (
                                    <DetailedClassTable
                                        key={cls.classId}
                                        cls={cls}
                                        isExpanded={expandedClasses.has(cls.classId)}
                                        onToggle={() => toggleClassExpanded(cls.classId)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
