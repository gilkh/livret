import { useEffect, useState, useMemo } from 'react'
import api from '../api'
import { openPdfExport, buildSavedGradebookPdfUrl } from '../utils/pdfExport'
import './AdminGradebooks.css'

interface YearData {
    yearId: string
    yearName: string
    level: string
    s1: { _id: string; createdAt: string } | null
    s2: { _id: string; createdAt: string } | null
    allSnapshots: any[]
}

interface StudentEntry {
    studentId: string
    firstName: string
    lastName: string
    currentLevel: string
    avatarUrl?: string
    years: YearData[]
    exitedAt?: string
    exitedFromLevel?: string
}

export default function AdminGradebooks() {
    const [viewMode, setViewMode] = useState<'current' | 'archived'>('current')
    const [loading, setLoading] = useState(true)
    const [currentStudents, setCurrentStudents] = useState<StudentEntry[]>([])
    const [archivedStudents, setArchivedStudents] = useState<StudentEntry[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedStudent, setSelectedStudent] = useState<StudentEntry | null>(null)
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

    // School year filter
    const [allYears, setAllYears] = useState<{ _id: string; name: string; active?: boolean }[]>([])
    const [selectedYearId, setSelectedYearId] = useState<string>('')

    // Load school years on mount
    useEffect(() => {
        loadYears()
    }, [])

    // Load students when year/view changes
    useEffect(() => {
        if (viewMode === 'archived') {
            loadAllStudents()
            return
        }
        if (selectedYearId) {
            loadAllStudents(selectedYearId)
        }
    }, [selectedYearId, viewMode])


    const loadYears = async () => {
        try {
            const res = await api.get('/school-years')
            const years = res.data || []
            setAllYears(years)
            // Default to active year
            const activeYear = years.find((y: any) => y.active)
            if (activeYear) {
                setSelectedYearId(activeYear._id)
            } else if (years.length > 0) {
                setSelectedYearId(years[0]._id)
            }
        } catch (e) {
            console.error('Failed to load years:', e)
        }
    }

    const loadAllStudents = async (yearId?: string) => {
        setLoading(true)
        setSelectedStudent(null)
        try {
            const params = yearId ? { schoolYearId: yearId } : {}
            const res = await api.get('/saved-gradebooks/admin/all-students', { params })
            setCurrentStudents(res.data.current || [])
            setArchivedStudents(res.data.archived || [])
        } catch (e) {
            console.error('Failed to load students:', e)
        } finally {
            setLoading(false)
        }
    }

    const students = viewMode === 'current' ? currentStudents : archivedStudents

    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return students
        const q = searchQuery.toLowerCase()
        return students.filter(s =>
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
            `${s.lastName} ${s.firstName}`.toLowerCase().includes(q)
        )
    }, [students, searchQuery])

    const exportGradebook = (gradebookId: string) => {
        const base = (api.defaults.baseURL || '').replace(/\/$/, '')
        const pdfUrl = buildSavedGradebookPdfUrl(base, gradebookId)
        const studentFullName = selectedStudent
            ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
            : 'Carnet'
        openPdfExport(pdfUrl, studentFullName, 'single', 1)
    }

    const toggleYear = (yearId: string) => {
        const next = new Set(expandedYears)
        if (next.has(yearId)) next.delete(yearId)
        else next.add(yearId)
        setExpandedYears(next)
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return ''
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    const formatSnapshotReason = (reason: string) => {
        switch (reason) {
            case 'sem1':
                return 'Semestre 1'
            case 'year_end':
                return 'Semestre 2'
            case 'promotion':
                return 'Promotion'
            case 'transfer':
                return 'Transfert'
            case 'exit':
                return 'Sortie'
            case 'manual':
                return 'Manuel'
            default:
                return reason || 'Snapshot'
        }
    }

    return (
        <div className="gradebooks-container">
            <div className="gradebooks-header">
                <h2 className="gradebooks-title">📚 Carnets Scolaires</h2>
                <div className="header-controls">
                    <div className="year-selector">
                        <label>Année scolaire:</label>
                        <select
                            value={selectedYearId}
                            onChange={e => setSelectedYearId(e.target.value)}
                            className="year-select"
                            disabled={viewMode === 'archived'}
                        >
                            {allYears.map(y => (
                                <option key={y._id} value={y._id}>
                                    {y.name} {y.active ? '(active)' : ''}
                                </option>
                            ))}
                        </select>
                        {viewMode === 'archived' && (
                            <span className="year-note">Toutes les années affichées</span>
                        )}
                    </div>
                    <div className="mode-switcher">
                        <button
                            className={`mode-btn ${viewMode === 'current' ? 'active' : ''}`}
                            onClick={() => { setViewMode('current'); setSelectedStudent(null) }}
                        >
                            🎓 En cours ({currentStudents.length})
                        </button>
                        <button
                            className={`mode-btn ${viewMode === 'archived' ? 'active' : ''}`}
                            onClick={() => { setViewMode('archived'); setSelectedStudent(null) }}
                        >
                            📦 Archives ({archivedStudents.length})
                        </button>
                    </div>
                </div>
            </div>

            <div className="gradebooks-layout">
                {/* Left Panel - Student List */}
                <div className="students-panel">
                    <div className="search-box">
                        <input
                            type="text"
                            placeholder="🔍 Rechercher un élève..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                    </div>

                    {loading ? (
                        <div className="panel-loading">Chargement...</div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="panel-empty">
                            {searchQuery ? 'Aucun élève trouvé' : 'Aucun carnet sauvegardé'}
                        </div>
                    ) : (
                        <div className="students-list">
                            {filteredStudents.map(student => (
                                <div
                                    key={student.studentId}
                                    className={`student-item ${selectedStudent?.studentId === student.studentId ? 'selected' : ''}`}
                                    onClick={() => { setSelectedStudent(student); setExpandedYears(new Set()) }}
                                >
                                    <div className="student-avatar">
                                        {student.avatarUrl ? (
                                            <img src={student.avatarUrl} alt="" />
                                        ) : (
                                            <span>{student.firstName[0]}{student.lastName[0]}</span>
                                        )}
                                    </div>
                                    <div className="student-info">
                                        <div className="student-name">{student.lastName} {student.firstName}</div>
                                        <div className="student-meta">
                                            {viewMode === 'archived' ? (
                                                <span className="badge badge-archived">
                                                    Sorti {student.exitedFromLevel ? `de ${student.exitedFromLevel}` : ''}
                                                </span>
                                            ) : (
                                                <span className="badge badge-level">{student.currentLevel || 'N/A'}</span>
                                            )}
                                            <span className="years-count">{student.years.length} année(s)</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Panel - Student Detail / Gradebook Viewer */}
                <div className="detail-panel">
                    {!selectedStudent ? (
                        <div className="detail-empty">
                            <div className="empty-icon">👈</div>
                            <div>Sélectionnez un élève pour voir ses carnets</div>
                        </div>
                    ) : (
                        <div className="student-detail">
                            <div className="detail-header">
                                <div className="detail-avatar">
                                    {selectedStudent.avatarUrl ? (
                                        <img src={selectedStudent.avatarUrl} alt="" />
                                    ) : (
                                        <span>{selectedStudent.firstName[0]}{selectedStudent.lastName[0]}</span>
                                    )}
                                </div>
                                <div className="detail-title">
                                    <h3>{selectedStudent.lastName} {selectedStudent.firstName}</h3>
                                    {viewMode === 'archived' && selectedStudent.exitedAt && (
                                        <p className="exit-info">
                                            Sorti le {formatDate(selectedStudent.exitedAt)}
                                            {selectedStudent.exitedFromLevel && ` (${selectedStudent.exitedFromLevel} → EB1)`}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="years-timeline">
                                <h4>📅 Historique des carnets</h4>
                                {selectedStudent.years.length === 0 ? (
                                    <div className="no-years">Aucun carnet enregistré</div>
                                ) : (
                                    <div className="years-list">
                                        {selectedStudent.years.map(year => (
                                            <div key={year.yearId} className="year-card">
                                                <div
                                                    className="year-header"
                                                    onClick={() => toggleYear(year.yearId)}
                                                >
                                                    <span className="year-name">{year.yearName}</span>
                                                    <span className="year-level">{year.level}</span>
                                                    <span className="year-toggle">
                                                        {expandedYears.has(year.yearId) ? '▼' : '▶'}
                                                    </span>
                                                </div>

                                                {expandedYears.has(year.yearId) && (
                                                    <div className="year-content">
                                                        {viewMode === 'archived' ? (
                                                            <div className="snapshot-list">
                                                                {[...year.allSnapshots]
                                                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                                    .map(snapshot => (
                                                                        <div key={snapshot._id} className="snapshot-item">
                                                                            <div className="snapshot-meta">
                                                                                <div className="snapshot-reason">{formatSnapshotReason(snapshot.snapshotReason)}</div>
                                                                                <div className="snapshot-sub">
                                                                                    <span>{snapshot.level || year.level}</span>
                                                                                    <span>•</span>
                                                                                    <span>{formatDate(snapshot.createdAt)}</span>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                className="view-btn"
                                                                                onClick={() => exportGradebook(snapshot._id)}
                                                                            >
                                                                                🖨️ Exporter PDF
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        ) : (
                                                            <div className="semester-grid">
                                                                <div className={`semester-card ${year.s1 ? 'available' : 'unavailable'}`}>
                                                                    <div className="semester-label">S1</div>
                                                                    {year.s1 ? (
                                                                        <>
                                                                            <div className="semester-date">{formatDate(year.s1.createdAt)}</div>
                                                                            <button
                                                                                className="view-btn"
                                                                                onClick={() => exportGradebook(year.s1!._id)}
                                                                            >
                                                                                🖨️ Exporter PDF
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <div className="semester-na">Non disponible</div>
                                                                    )}
                                                                </div>

                                                                <div className={`semester-card ${year.s2 ? 'available' : 'unavailable'}`}>
                                                                    <div className="semester-label">S2</div>
                                                                    {year.s2 ? (
                                                                        <>
                                                                            <div className="semester-date">{formatDate(year.s2.createdAt)}</div>
                                                                            <button
                                                                                className="view-btn"
                                                                                onClick={() => exportGradebook(year.s2!._id)}
                                                                            >
                                                                                🖨️ Exporter PDF
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <div className="semester-na">Non disponible</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
