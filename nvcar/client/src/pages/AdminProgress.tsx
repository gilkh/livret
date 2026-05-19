import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    ChevronDown,
    CircleDot,
    LayoutDashboard,
    ListFilter,
    Search,
    ShieldCheck,
    Users,
    XCircle
} from 'lucide-react'
import api from '../api'
import './AdminProgress.css'

type CategoryProgress = {
    name: string
    total: number
    filled: number
    percentage: number
}

type ProgressSummary = {
    total: number
    filled: number
    percentage: number
}

type SemesterProgress = ProgressSummary & {
    byCategory: CategoryProgress[]
}

type LanguageGradebookProgress = {
    name: string
    total: number
    done: number
    missing: number
    percentage: number
}

type GradebookSemesterProgress = {
    done: number
    signed: number
    notDone: number
    notSigned: number
    percentage: number
    signedPercentage: number
    byLanguage: LanguageGradebookProgress[]
}

type ClassProgress = {
    classId: string
    className: string
    level: string
    teachers: string[]
    studentCount: number
    gradebooks?: {
        total: number
        sem1: GradebookSemesterProgress
        sem2: GradebookSemesterProgress
    }
    progress: ProgressSummary
    semesters?: {
        sem1: SemesterProgress
        sem2: SemesterProgress
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

type SubAdminProgress = {
    subAdminId: string
    displayName: string
    assignedLevels: string[]
    assignedTeacherCount: number
    totalStudents: number
    totalAssignments: number
    signedAssignments: number
    percentage: number
    semesters?: {
        sem1: { total: number; signed: number; percentage: number }
        sem2: { total: number; signed: number; percentage: number }
    }
}

type ViewMode = 'classes' | 'coverage' | 'subadmins'
type SortMode = 'className' | 'progress_desc' | 'progress_asc' | 'students_desc'

const emptyProgress: SemesterProgress = { total: 0, filled: 0, percentage: 0, byCategory: [] }
const emptyGradebookSemester: GradebookSemesterProgress = {
    done: 0,
    signed: 0,
    notDone: 0,
    notSigned: 0,
    percentage: 0,
    signedPercentage: 0,
    byLanguage: []
}

const getProgressTone = (percentage: number) => {
    if (percentage >= 80) return 'high'
    if (percentage >= 50) return 'medium'
    return 'low'
}

const pct = (filled: number, total: number) => total > 0 ? Math.round((filled / total) * 100) : 0

const ProgressBar = ({ value, tone }: { value: number; tone?: string }) => (
    <div className="admin-progress-bar" aria-hidden>
        <div className={`admin-progress-bar-fill ${tone || getProgressTone(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
)

const MiniMetric = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
    <div className="admin-progress-stat">
        <div className="admin-progress-stat-icon">{icon}</div>
        <div>
            <div className="admin-progress-stat-value">{value}</div>
            <div className="admin-progress-stat-label">{label}</div>
        </div>
    </div>
)

export default function AdminProgress() {
    const [classes, setClasses] = useState<ClassProgress[]>([])
    const [subAdmins, setSubAdmins] = useState<SubAdminProgress[]>([])
    const [activeSemester, setActiveSemester] = useState(1)
    const [schoolYearName, setSchoolYearName] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [levelFilter, setLevelFilter] = useState('all')
    const [sortBy, setSortBy] = useState<SortMode>('className')
    const [viewMode, setViewMode] = useState<ViewMode>('classes')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const res = await api.get('/admin-extras/progress')
                const nextClasses = Array.isArray(res.data?.classes) ? res.data.classes : []
                setClasses(nextClasses)
                setSubAdmins(Array.isArray(res.data?.subAdmins) ? res.data.subAdmins : [])
                setActiveSemester(Number(res.data?.activeSemester || 1))
                setSchoolYearName(String(res.data?.schoolYear?.name || ''))
                setExpanded(new Set(nextClasses.slice(0, 6).map((c: ClassProgress) => c.classId)))
                setError('')
            } catch (e: any) {
                setError('Impossible de charger les donnees de progression.')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const levels = useMemo(() => [...new Set(classes.map(cls => cls.level || 'Sans niveau'))].sort(), [classes])

    const filteredClasses = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return classes
            .filter(cls => {
                const matchesLevel = levelFilter === 'all' || cls.level === levelFilter
                const matchesSearch = !query ||
                    cls.className.toLowerCase().includes(query) ||
                    cls.teachers.join(' ').toLowerCase().includes(query)
                return matchesLevel && matchesSearch
            })
            .sort((a, b) => {
                if (sortBy === 'progress_desc') return b.progress.percentage - a.progress.percentage
                if (sortBy === 'progress_asc') return a.progress.percentage - b.progress.percentage
                if (sortBy === 'students_desc') return b.studentCount - a.studentCount
                return a.className.localeCompare(b.className)
            })
    }, [classes, levelFilter, searchQuery, sortBy])

    const filteredSubAdmins = useMemo(() => (
        subAdmins.filter(sa => levelFilter === 'all' || sa.assignedLevels.includes(levelFilter))
    ), [subAdmins, levelFilter])

    const dashboard = useMemo(() => {
        const totalStudents = classes.reduce((sum, cls) => sum + cls.studentCount, 0)
        const totals = classes.reduce((acc, cls) => {
            acc.total += cls.progress.total
            acc.filled += cls.progress.filled
            acc.sem1Total += cls.semesters?.sem1?.total || 0
            acc.sem1Filled += cls.semesters?.sem1?.filled || 0
            acc.sem2Total += cls.semesters?.sem2?.total || 0
            acc.sem2Filled += cls.semesters?.sem2?.filled || 0
            acc.gradebooks += cls.gradebooks?.total || 0
            acc.activeDone += activeSemester === 2 ? (cls.gradebooks?.sem2?.done || 0) : (cls.gradebooks?.sem1?.done || 0)
            acc.activeSigned += activeSemester === 2 ? (cls.gradebooks?.sem2?.signed || 0) : (cls.gradebooks?.sem1?.signed || 0)
            acc.activeNotSigned += activeSemester === 2 ? (cls.gradebooks?.sem2?.notSigned || 0) : (cls.gradebooks?.sem1?.notSigned || 0)
            if (!cls.teachersCheck?.hasArabic || !cls.teachersCheck?.hasEnglish || !cls.teachersCheck?.hasPolyvalent) acc.coverageAlerts++
            return acc
        }, { total: 0, filled: 0, sem1Total: 0, sem1Filled: 0, sem2Total: 0, sem2Filled: 0, gradebooks: 0, activeDone: 0, activeSigned: 0, activeNotSigned: 0, coverageAlerts: 0 })

        return {
            totalStudents,
            overall: pct(totals.filled, totals.total),
            sem1: pct(totals.sem1Filled, totals.sem1Total),
            sem2: pct(totals.sem2Filled, totals.sem2Total),
            gradebooks: totals.gradebooks,
            activeDone: totals.activeDone,
            activeSigned: totals.activeSigned,
            activeNotSigned: totals.activeNotSigned,
            activeDonePct: pct(totals.activeDone, totals.gradebooks),
            activeSignedPct: pct(totals.activeSigned, totals.gradebooks),
            coverageAlerts: totals.coverageAlerts
        }
    }, [activeSemester, classes])

    const groupedByLevel = useMemo(() => {
        return filteredClasses.reduce((acc, cls) => {
            const level = cls.level || 'Sans niveau'
            if (!acc[level]) acc[level] = []
            acc[level].push(cls)
            return acc
        }, {} as Record<string, ClassProgress[]>)
    }, [filteredClasses])

    const resetFilters = () => {
        setSearchQuery('')
        setLevelFilter('all')
        setSortBy('className')
    }

    const toggleClass = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const renderGradebookSemesterBlock = (label: string, gradebooks?: GradebookSemesterProgress, total = 0) => {
        const data = gradebooks || emptyGradebookSemester
        return (
            <div className="admin-semester-card">
                <div className="admin-semester-head">
                    <span>{label}</span>
                    <strong>{data.done}/{total}</strong>
                </div>
                <ProgressBar value={data.percentage} />
                <div className="admin-gradebook-status-row">
                    <span className="done">Faits: {data.done}</span>
                    <span className="signed">Signes: {data.signed}</span>
                    <span className="missing">Non signes: {data.notSigned}</span>
                    <span>Non faits: {data.notDone}</span>
                </div>
                <div className="admin-semester-foot">Progression carnet: {data.percentage}% - Signature: {data.signedPercentage}%</div>
                <div className="admin-category-list">
                    {data.byLanguage.map(lang => (
                        <span key={lang.name} className={`admin-category-chip ${getProgressTone(lang.percentage)}`}>
                            {lang.name}: {lang.done}/{lang.total} faits
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    const renderTeacherStatus = (label: string, names: string[], ok: boolean) => (
        <div className={`admin-teacher-status ${ok ? 'ok' : 'missing'}`}>
            {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <div>
                <strong>{label}</strong>
                <span>{names.length ? names.join(', ') : 'Aucun enseignant'}</span>
            </div>
        </div>
    )

    return (
        <div className="admin-progress-page">
            <header className="admin-progress-header">
                <div className="admin-progress-title">
                    <div className="admin-progress-title-icon"><BarChart3 size={28} /></div>
                    <div>
                        <h1>Suivi des carnets</h1>
                        <p>{schoolYearName ? `${schoolYearName} - ` : ''}Carnets faits, non signes et par langue enseignante - S{activeSemester}</p>
                    </div>
                </div>
                <div className="admin-progress-tabs" role="tablist" aria-label="Vue progression admin">
                    <button className={viewMode === 'classes' ? 'active' : ''} onClick={() => setViewMode('classes')}>
                        <LayoutDashboard size={16} /> Classes
                    </button>
                    <button className={viewMode === 'coverage' ? 'active' : ''} onClick={() => setViewMode('coverage')}>
                        <ShieldCheck size={16} /> Enseignants
                    </button>
                    <button className={viewMode === 'subadmins' ? 'active' : ''} onClick={() => setViewMode('subadmins')}>
                        <Users size={16} /> Sous-admins
                    </button>
                </div>
            </header>

            {!loading && !error && (
                <section className="admin-progress-stats-grid">
                    <MiniMetric label="Classes" value={classes.length} icon={<LayoutDashboard size={20} />} />
                    <MiniMetric label="Carnets" value={dashboard.gradebooks} icon={<CircleDot size={20} />} />
                    <MiniMetric label={`Faits S${activeSemester}`} value={`${dashboard.activeDone}/${dashboard.gradebooks}`} icon={<CheckCircle2 size={20} />} />
                    <MiniMetric label="Faits non signes" value={dashboard.activeNotSigned} icon={<AlertTriangle size={20} />} />
                </section>
            )}

            {!loading && !error && (
                <section className="admin-semester-overview">
                    <div>
                        <span>Semestre actif - carnets faits</span>
                        <strong>{dashboard.activeDonePct}%</strong>
                        <ProgressBar value={dashboard.activeDonePct} />
                    </div>
                    <div>
                        <span>Semestre actif - carnets signes</span>
                        <strong>{dashboard.activeSignedPct}%</strong>
                        <ProgressBar value={dashboard.activeSignedPct} />
                    </div>
                </section>
            )}

            {!loading && !error && classes.length > 0 && (
                <section className="admin-progress-filters">
                    <div className="admin-search">
                        <Search size={18} />
                        <input
                            aria-label="Rechercher une classe ou un enseignant"
                            placeholder="Rechercher une classe ou un enseignant"
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <select aria-label="Filtrer par niveau" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}>
                        <option value="all">Tous les niveaux</option>
                        {levels.map(level => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <select aria-label="Trier les classes" value={sortBy} onChange={event => setSortBy(event.target.value as SortMode)}>
                        <option value="className">Nom de classe</option>
                        <option value="progress_desc">Progression decroissante</option>
                        <option value="progress_asc">Progression croissante</option>
                        <option value="students_desc">Nombre d'eleves</option>
                    </select>
                    <button type="button" onClick={resetFilters}><ListFilter size={16} /> Reinitialiser</button>
                </section>
            )}

            {loading && (
                <div className="admin-progress-state">
                    <div className="admin-progress-spinner" />
                    <strong>Chargement des progressions</strong>
                    <span>Preparation des classes, enseignants et semestres.</span>
                </div>
            )}

            {error && (
                <div className="admin-progress-error">
                    <AlertTriangle size={22} />
                    <span>{error}</span>
                </div>
            )}

            {!loading && !error && classes.length === 0 && (
                <div className="admin-progress-state">
                    <strong>Aucune classe trouvee</strong>
                    <span>Les progressions apparaitront ici lorsque l'annee scolaire active aura des classes.</span>
                </div>
            )}

            {!loading && !error && viewMode === 'classes' && (
                <main className="admin-progress-content">
                    {Object.keys(groupedByLevel).sort().map(level => {
                        const levelClasses = groupedByLevel[level]
                        return (
                            <section key={level} className="admin-level-section">
                                <div className="admin-level-header">
                                    <span>{level}</span>
                                    <strong>{levelClasses.length} classes</strong>
                                </div>
                                <div className="admin-class-list">
                                    {levelClasses.map(cls => {
                                        const isExpanded = expanded.has(cls.classId)
                                        const activeGradebooks = activeSemester === 2 ? cls.gradebooks?.sem2 : cls.gradebooks?.sem1
                                        const gradebookTotal = cls.gradebooks?.total || 0
                                        return (
                                            <article key={cls.classId} className="admin-class-card">
                                                <button type="button" className="admin-class-summary" onClick={() => toggleClass(cls.classId)}>
                                                    <div>
                                                        <span className="admin-class-level">{cls.level || 'Niveau'}</span>
                                                        <h2>{cls.className}</h2>
                                                        <p>{gradebookTotal} carnets - {cls.studentCount} eleves - {cls.teachers.length ? cls.teachers.join(', ') : 'Aucun enseignant'}</p>
                                                    </div>
                                                    <div className="admin-class-progress">
                                                        <strong>{activeGradebooks?.done || 0}/{gradebookTotal}</strong>
                                                        <span>{activeGradebooks?.notSigned || 0} faits non signes</span>
                                                        <ChevronDown className={isExpanded ? 'expanded' : ''} size={20} />
                                                    </div>
                                                </button>
                                                <ProgressBar value={activeGradebooks?.percentage || 0} />
                                                {isExpanded && (
                                                    <div className="admin-class-detail">
                                                        <div className="admin-semester-grid">
                                                            {renderGradebookSemesterBlock('Semestre 1', cls.gradebooks?.sem1, gradebookTotal)}
                                                            {renderGradebookSemesterBlock('Semestre 2', cls.gradebooks?.sem2, gradebookTotal)}
                                                        </div>
                                                        <div className="admin-category-list wide">
                                                            {(activeGradebooks?.byLanguage || []).map(lang => (
                                                                <span key={lang.name} className={`admin-category-chip ${getProgressTone(lang.percentage)}`}>
                                                                    S{activeSemester} {lang.name}: {lang.done}/{lang.total} faits, {lang.missing} restants
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </article>
                                        )
                                    })}
                                </div>
                            </section>
                        )
                    })}
                </main>
            )}

            {!loading && !error && viewMode === 'coverage' && (
                <main className="admin-coverage-grid">
                    {filteredClasses.map(cls => {
                        const check = cls.teachersCheck || { polyvalent: [], english: [], arabic: [], hasPolyvalent: false, hasEnglish: false, hasArabic: false }
                        return (
                            <article key={cls.classId} className="admin-coverage-card">
                                <div className="admin-coverage-head">
                                    <span>{cls.level}</span>
                                    <strong>{cls.className}</strong>
                                </div>
                                {renderTeacherStatus('Arabe', check.arabic, check.hasArabic)}
                                {renderTeacherStatus('Anglais', check.english, check.hasEnglish)}
                                {renderTeacherStatus('Polyvalent', check.polyvalent, check.hasPolyvalent)}
                            </article>
                        )
                    })}
                </main>
            )}

            {!loading && !error && viewMode === 'subadmins' && (
                <main className="admin-subadmin-grid">
                    {filteredSubAdmins.map(sa => (
                        <article key={sa.subAdminId} className="admin-subadmin-card">
                            <div className="admin-subadmin-head">
                                <div>
                                    <h2>{sa.displayName}</h2>
                                    <p>{sa.assignedLevels.length ? sa.assignedLevels.join(', ') : 'Aucun niveau'} - {sa.assignedTeacherCount} enseignants</p>
                                </div>
                                <strong>{sa.percentage}%</strong>
                            </div>
                            <ProgressBar value={sa.percentage} />
                            <div className="admin-subadmin-meta">
                                <span>{sa.totalStudents} eleves</span>
                                <span>{sa.signedAssignments}/{sa.totalAssignments} carnets signes</span>
                            </div>
                            <div className="admin-subadmin-semesters">
                                <span>S1: {sa.semesters?.sem1?.signed || 0}/{sa.semesters?.sem1?.total || sa.totalAssignments} ({sa.semesters?.sem1?.percentage || 0}%)</span>
                                <span>S2: {sa.semesters?.sem2?.signed || 0}/{sa.semesters?.sem2?.total || sa.totalAssignments} ({sa.semesters?.sem2?.percentage || 0}%)</span>
                            </div>
                        </article>
                    ))}
                </main>
            )}

            {!loading && !error && classes.length > 0 && filteredClasses.length === 0 && viewMode !== 'subadmins' && (
                <div className="admin-progress-state">
                    <strong>Aucun resultat</strong>
                    <span>Essayez de modifier la recherche ou le filtre de niveau.</span>
                </div>
            )}
        </div>
    )
}
