import { useEffect, useState, useMemo } from 'react'
import api from '../api'
import './SubAdminProgress.css'

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

type ViewMode = 'table' | 'grid'

// Helper to get progress status class
const getProgressClass = (percentage: number): string => {
    if (percentage >= 80) return 'high'
    if (percentage >= 50) return 'medium'
    return 'low'
}

// Generate initials from name
const getInitials = (firstName: string, lastName: string): string => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// Progress Ring SVG Component
const ProgressRing = ({ percentage, size = 56 }: { percentage: number; size?: number }) => {
    const radius = (size - 8) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="progress-ring-container" style={{ width: size, height: size }}>
            <svg className="progress-ring" width={size} height={size}>
                <circle
                    className="progress-ring-bg"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                />
                <circle
                    className={`progress-ring-progress ${getProgressClass(percentage)}`}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                />
            </svg>
            <span className="progress-ring-text">{percentage}%</span>
        </div>
    )
}

export default function SubAdminProgress() {
    const [students, setStudents] = useState<StudentProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedLevel, setSelectedLevel] = useState<string>('all')
    const [viewMode, setViewMode] = useState<ViewMode>('table')
    const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const res = await api.get('/subadmin-assignments/progress')
                const data = Array.isArray(res.data) ? res.data : []
                setStudents(data)
                // Initially expand all levels
                const levels = new Set(data.map((s: StudentProgress) => s.currentLevel || 'Sans niveau'))
                setExpandedLevels(levels as Set<string>)
            } catch (e: any) {
                setError('Impossible de charger les données de progression')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    // Filter students based on search and level filter
    const filteredStudents = useMemo(() => {
        return students.filter(student => {
            const matchesSearch = searchTerm === '' ||
                `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                student.className?.toLowerCase().includes(searchTerm.toLowerCase())

            const matchesLevel = selectedLevel === 'all' || student.currentLevel === selectedLevel

            return matchesSearch && matchesLevel
        })
    }, [students, searchTerm, selectedLevel])

    // Group students by level and class
    const grouped = useMemo(() => {
        return filteredStudents.reduce((acc, student) => {
            const level = student.currentLevel || 'Sans niveau'
            const className = student.className || 'Sans classe'

            if (!acc[level]) acc[level] = {}
            if (!acc[level][className]) acc[level][className] = []

            acc[level][className].push(student)
            return acc
        }, {} as Record<string, Record<string, StudentProgress[]>>)
    }, [filteredStudents])

    const sortedLevels = Object.keys(grouped).sort()
    const allLevels = [...new Set(students.map(s => s.currentLevel || 'Sans niveau'))].sort()

    // Calculate statistics
    const stats = useMemo(() => {
        const totalStudents = students.length
        const totalLevels = new Set(students.map(s => s.currentLevel)).size

        let totalPercentage = 0
        let count = 0
        students.forEach(student => {
            const levelsData = Array.isArray(student.levelsData) ? student.levelsData : []
            levelsData.forEach(l => {
                totalPercentage += l.percentage || 0
                count++
            })
        })
        const avgProgress = count > 0 ? Math.round(totalPercentage / count) : 0

        const completeCount = students.filter(student => {
            const levelsData = Array.isArray(student.levelsData) ? student.levelsData : []
            return levelsData.every(l => l.percentage === 100)
        }).length

        return { totalStudents, totalLevels, avgProgress, completeCount }
    }, [students])

    const calculateAverage = (students: StudentProgress[], targetLevel: string) => {
        if (!students.length) return 0

        const total = students.reduce((sum, student) => {
            const safeLevelsData = Array.isArray(student.levelsData) ? student.levelsData : []
            const levelData = safeLevelsData.find(l => l.level === targetLevel)
            return sum + (levelData?.percentage || 0)
        }, 0)

        return Math.round(total / students.length)
    }

    const calculateCategoryAverages = (students: StudentProgress[], targetLevel: string) => {
        const categoryTotals: Record<string, { sum: number, count: number }> = {}

        students.forEach(student => {
            const safeLevelsData = Array.isArray(student.levelsData) ? student.levelsData : []
            const levelData = safeLevelsData.find(l => l.level === targetLevel)

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

    const toggleLevel = (level: string) => {
        setExpandedLevels(prev => {
            const next = new Set(prev)
            if (next.has(level)) {
                next.delete(level)
            } else {
                next.add(level)
            }
            return next
        })
    }

    const toggleClass = (key: string) => {
        setExpandedClasses(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    return (
        <div className="progress-page">
            {/* Header */}
            <header className="progress-header">
                <div className="progress-header-left">
                    <div className="progress-header-icon">📊</div>
                    <div className="progress-header-text">
                        <h1>Progression des Élèves</h1>
                        <p>Suivez la progression détaillée de chaque élève par niveau et catégorie</p>
                    </div>
                </div>
            </header>

            {/* Stats Cards */}
            {!loading && !error && students.length > 0 && (
                <div className="progress-stats-grid">
                    <div className="progress-stat-card">
                        <div className="progress-stat-icon students">👥</div>
                        <div className="progress-stat-content">
                            <div className="progress-stat-value">{stats.totalStudents}</div>
                            <div className="progress-stat-label">Élèves suivis</div>
                        </div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-icon levels">📚</div>
                        <div className="progress-stat-content">
                            <div className="progress-stat-value">{stats.totalLevels}</div>
                            <div className="progress-stat-label">Niveaux</div>
                        </div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-icon complete">✅</div>
                        <div className="progress-stat-content">
                            <div className="progress-stat-value">{stats.completeCount}</div>
                            <div className="progress-stat-label">Carnets complets</div>
                        </div>
                    </div>
                    <div className="progress-stat-card">
                        <div className="progress-stat-icon pending">📈</div>
                        <div className="progress-stat-content">
                            <div className="progress-stat-value">{stats.avgProgress}%</div>
                            <div className="progress-stat-label">Progression moyenne</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            {!loading && !error && students.length > 0 && (
                <div className="progress-filter-bar">
                    <div className="progress-search-wrapper">
                        <span className="progress-search-icon">🔍</span>
                        <input
                            type="text"
                            className="progress-search-input"
                            placeholder="Rechercher un élève ou une classe..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="progress-filter-select"
                        value={selectedLevel}
                        onChange={e => setSelectedLevel(e.target.value)}
                    >
                        <option value="all">Tous les niveaux</option>
                        {allLevels.map(level => (
                            <option key={level} value={level}>{level}</option>
                        ))}
                    </select>
                    <div className="progress-view-toggle">
                        <button
                            className={`progress-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            📋 Tableau
                        </button>
                        <button
                            className={`progress-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            📦 Cartes
                        </button>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="progress-loading">
                    <div className="progress-loading-spinner"></div>
                    <div className="progress-loading-text">Chargement des données...</div>
                    <div className="progress-loading-subtext">Veuillez patienter</div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="progress-error">
                    <div className="progress-error-icon">⚠️</div>
                    <div className="progress-error-content">
                        <h4>Erreur de chargement</h4>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && students.length === 0 && (
                <div className="progress-empty">
                    <div className="progress-empty-icon">📭</div>
                    <h3>Aucune donnée disponible</h3>
                    <p>Aucun élève trouvé avec un carnet terminé pour vos niveaux assignés.</p>
                </div>
            )}

            {/* Content - Table View */}
            {!loading && !error && filteredStudents.length > 0 && viewMode === 'table' && (
                <div className="progress-content">
                    {sortedLevels.map(level => {
                        const levelStudents = Object.values(grouped[level]).flat()
                        const levelAverage = calculateAverage(levelStudents, level)
                        const levelCategoryAverages = calculateCategoryAverages(levelStudents, level)
                        const isExpanded = expandedLevels.has(level)

                        return (
                            <div key={level} className="progress-level-section">
                                <div
                                    className="progress-level-header"
                                    onClick={() => toggleLevel(level)}
                                >
                                    <div className="progress-level-header-left">
                                        <span className="progress-level-badge">{level}</span>
                                        <div className="progress-level-info">
                                            <span className="progress-level-student-count">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                    <circle cx="9" cy="7" r="4" />
                                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                                </svg>
                                                {levelStudents.length} élèves
                                            </span>
                                        </div>
                                    </div>
                                    <div className="progress-level-header-right">
                                        <ProgressRing percentage={levelAverage} />
                                        <div className="progress-category-pills">
                                            {levelCategoryAverages.map(cat => (
                                                <div key={cat.name} className="progress-category-pill">
                                                    <span className="progress-category-name">{cat.name}</span>
                                                    <span className={`progress-category-value ${getProgressClass(cat.average)}`}>
                                                        {cat.average}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className={`progress-collapse-icon ${isExpanded ? 'expanded' : ''}`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="progress-level-content">
                                        {Object.keys(grouped[level]).sort().map(className => {
                                            const classStudents = grouped[level][className]
                                            const classAverage = calculateAverage(classStudents, level)
                                            const classCategoryAverages = calculateCategoryAverages(classStudents, level)
                                            const classKey = `${level}-${className}`
                                            const isClassExpanded = expandedClasses.has(classKey) || expandedClasses.size === 0

                                            return (
                                                <div key={className} className="progress-class-section">
                                                    <div
                                                        className="progress-class-header"
                                                        onClick={() => toggleClass(classKey)}
                                                    >
                                                        <div className="progress-class-header-left">
                                                            <span className="progress-class-badge">{className}</span>
                                                            <span className="progress-class-count">
                                                                {classStudents.length} élèves
                                                            </span>
                                                        </div>
                                                        <div className="progress-class-header-right">
                                                            <span className={`progress-class-avg ${getProgressClass(classAverage)}`}>
                                                                Moyenne: {classAverage}%
                                                            </span>
                                                            {classCategoryAverages.slice(0, 3).map(cat => (
                                                                <div key={cat.name} className="progress-category-pill" style={{ padding: '4px 10px', fontSize: '12px' }}>
                                                                    <span className="progress-category-name">{cat.name}</span>
                                                                    <span className={`progress-category-value ${getProgressClass(cat.average)}`}>
                                                                        {cat.average}%
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {(isClassExpanded || !expandedClasses.has(classKey)) && (
                                                        <div className="progress-student-table-wrapper">
                                                            <table className="progress-student-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ width: '22%' }}>Élève</th>
                                                                        <th style={{ width: '10%', textAlign: 'center' }}>Niveau</th>
                                                                        <th style={{ width: '18%', textAlign: 'center' }}>Progression Globale</th>
                                                                        <th style={{ width: '50%' }}>Par Langue / Catégorie</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {classStudents.map(student => {
                                                                        const safeLevelsData = Array.isArray(student.levelsData) ? student.levelsData : []
                                                                        const levels = safeLevelsData.length > 0
                                                                            ? safeLevelsData
                                                                            : [{ level: '-', activeCount: 0, totalAvailable: 0, percentage: 0, byCategory: [] }]

                                                                        return levels.map((lvlData: LevelProgress, idx: number) => (
                                                                            <tr key={`${student._id}-${lvlData.level ?? idx}`}>
                                                                                {idx === 0 && (
                                                                                    <td rowSpan={levels.length}>
                                                                                        <div className="progress-student-cell">
                                                                                            <div className="progress-student-avatar">
                                                                                                {getInitials(student.firstName, student.lastName)}
                                                                                            </div>
                                                                                            <span className="progress-student-name">
                                                                                                {student.firstName} {student.lastName}
                                                                                            </span>
                                                                                        </div>
                                                                                    </td>
                                                                                )}
                                                                                <td style={{ textAlign: 'center' }}>
                                                                                    <span className="progress-level-indicator">
                                                                                        {lvlData.level}
                                                                                    </span>
                                                                                </td>
                                                                                <td>
                                                                                    <div className="progress-global-cell">
                                                                                        <div className="progress-fraction">
                                                                                            <span>{lvlData.activeCount}</span>
                                                                                            <span className="progress-fraction-divider">/</span>
                                                                                            <span>{lvlData.totalAvailable}</span>
                                                                                        </div>
                                                                                        <span className={`progress-percentage-badge ${getProgressClass(lvlData.percentage)}`}>
                                                                                            {lvlData.percentage}%
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <div className="progress-categories-cell">
                                                                                        {(Array.isArray(lvlData.byCategory) ? lvlData.byCategory : []).map((cat: CategoryProgress) => (
                                                                                            <div key={cat.name} className="progress-category-tag">
                                                                                                <span className="progress-category-tag-name">{cat.name}</span>
                                                                                                <div className="progress-category-tag-stats">
                                                                                                    <span className="progress-category-tag-fraction">
                                                                                                        {cat.filled}/{cat.total}
                                                                                                    </span>
                                                                                                    <span className={`progress-category-tag-percentage ${getProgressClass(cat.percentage)}`}>
                                                                                                        {cat.percentage}%
                                                                                                    </span>
                                                                                                </div>
                                                                                                <div className="progress-mini-bar">
                                                                                                    <div
                                                                                                        className={`progress-mini-bar-fill ${getProgressClass(cat.percentage)}`}
                                                                                                        style={{ width: `${cat.percentage}%` }}
                                                                                                    />
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
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Content - Grid View */}
            {!loading && !error && filteredStudents.length > 0 && viewMode === 'grid' && (
                <div className="progress-grid-view">
                    {filteredStudents.map(student => {
                        const safeLevelsData = Array.isArray(student.levelsData) ? student.levelsData : []
                        const primaryLevel = safeLevelsData.find(l => l.level === student.currentLevel) || safeLevelsData[0]

                        return (
                            <div key={student._id} className="progress-student-card">
                                <div className="progress-student-card-header">
                                    <div className="progress-student-card-avatar">
                                        {getInitials(student.firstName, student.lastName)}
                                    </div>
                                    <div className="progress-student-card-info">
                                        <div className="progress-student-card-name">
                                            {student.firstName} {student.lastName}
                                        </div>
                                        <div className="progress-student-card-meta">
                                            <span className="progress-student-card-level-badge">
                                                {student.currentLevel}
                                            </span>
                                            <span>•</span>
                                            <span>{student.className}</span>
                                        </div>
                                    </div>
                                    {primaryLevel && (
                                        <ProgressRing percentage={primaryLevel.percentage} size={48} />
                                    )}
                                </div>
                                <div className="progress-student-card-body">
                                    {primaryLevel && (
                                        <>
                                            <div className="progress-student-card-overall">
                                                <span className="progress-student-card-overall-label">
                                                    Progression globale
                                                </span>
                                                <div className="progress-student-card-overall-value">
                                                    <span className="progress-fraction">
                                                        {primaryLevel.activeCount}/{primaryLevel.totalAvailable}
                                                    </span>
                                                    <span className={`progress-percentage-badge ${getProgressClass(primaryLevel.percentage)}`}>
                                                        {primaryLevel.percentage}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="progress-student-card-categories">
                                                {(Array.isArray(primaryLevel.byCategory) ? primaryLevel.byCategory : []).map((cat: CategoryProgress) => (
                                                    <div key={cat.name} className="progress-student-card-category">
                                                        <span className="progress-student-card-category-name">{cat.name}</span>
                                                        <div className="progress-student-card-category-bar">
                                                            <div
                                                                className={`progress-student-card-category-bar-fill ${getProgressClass(cat.percentage)}`}
                                                                style={{ width: `${cat.percentage}%` }}
                                                            />
                                                        </div>
                                                        <span className={`progress-student-card-category-value`} style={{
                                                            color: cat.percentage >= 80 ? '#059669' : cat.percentage >= 50 ? '#d97706' : '#dc2626'
                                                        }}>
                                                            {cat.percentage}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* No Results State */}
            {!loading && !error && students.length > 0 && filteredStudents.length === 0 && (
                <div className="progress-empty">
                    <div className="progress-empty-icon">🔍</div>
                    <h3>Aucun résultat</h3>
                    <p>Aucun élève ne correspond à vos critères de recherche. Essayez de modifier vos filtres.</p>
                </div>
            )}
        </div>
    )
}
