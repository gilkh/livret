import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Check, X, Plus, Users, BookOpen, Shield, Globe, Download, Search, ChevronRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import './AdminAssignments.css'

type User = { _id: string; email: string; displayName: string; role: string }
type Class = { _id: string; name: string; level?: string }
type Student = { _id: string; firstName: string; lastName: string }
type Template = { _id: string; name: string }

type TeacherAssignment = { _id: string; teacherId: string; classId: string; teacherName?: string; className?: string; languages?: string[]; isProfPolyvalent?: boolean }
type SubAdminAssignment = { _id: string; subAdminId: string; teacherId: string; subAdminName?: string; teacherName?: string }
type SubAdminLevelAssignment = { subAdminId: string; subAdminName: string; levels: string[] }
type TemplateAssignment = { _id: string; templateId: string; studentId: string; className?: string; classId?: string; templateName?: string }
type ImportableTeacherAssignment = {
    teacherId: string
    classId: string
    teacherName?: string
    className?: string
    languages?: string[]
    isProfPolyvalent?: boolean
}

type DeleteAction =
    | { type: 'teacher-assignment'; assignmentId: string; label: string }
    | { type: 'subadmin-level'; subAdminId: string; level: string; label: string }
    | { type: 'template-level'; templateId: string; level: string; label: string }

const TAB_CONFIG = {
    teacher: { icon: Users, label: 'Enseignants', color: '#3b82f6', bg: '#eff6ff' },
    subadmin: { icon: Shield, label: 'Sous-admins', color: '#8b5cf6', bg: '#f5f3ff' },
    aefe: { icon: Globe, label: 'AEFE', color: '#f59e0b', bg: '#fffbeb' },
    template: { icon: BookOpen, label: 'Carnets', color: '#10b981', bg: '#ecfdf5' },
} as const

export default function AdminAssignments() {
    const { levels } = useLevels()
    const { activeYearId, years } = useSchoolYear()
    const [teachers, setTeachers] = useState<User[]>([])
    const [subAdmins, setSubAdmins] = useState<User[]>([])
    const [aefeUsers, setAefeUsers] = useState<User[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [templates, setTemplates] = useState<Template[]>([])

    const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
    const [subAdminAssignments, setSubAdminAssignments] = useState<SubAdminAssignment[]>([])
    const [subAdminLevelAssignments, setSubAdminLevelAssignments] = useState<SubAdminLevelAssignment[]>([])
    const [templateAssignments, setTemplateAssignments] = useState<TemplateAssignment[]>([])

    const [selectedTeacher, setSelectedTeacher] = useState('')
    const [selectedClasses, setSelectedClasses] = useState<string[]>([])
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
    const [isProfPolyvalent, setIsProfPolyvalent] = useState(false)
    
    const [selectedLevelForSubAdmin, setSelectedLevelForSubAdmin] = useState('')
    const [selectedSubAdminForLevel, setSelectedSubAdminForLevel] = useState('')
    
    const [selectedLevelForAefe, setSelectedLevelForAefe] = useState('')
    const [selectedAefeForLevel, setSelectedAefeForLevel] = useState('')
    
    const [selectedLevelForTemplate, setSelectedLevelForTemplate] = useState('')
    const [selectedTemplateForLevel, setSelectedTemplateForLevel] = useState('')

    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [busyAction, setBusyAction] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'teacher' | 'subadmin' | 'aefe' | 'template'>('teacher')
    const [teacherQuery, setTeacherQuery] = useState('')
    const [classQuery, setClassQuery] = useState('')
    const [currentAssignmentsQuery, setCurrentAssignmentsQuery] = useState('')
    const [importQuery, setImportQuery] = useState('')
    const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    const [showImportModal, setShowImportModal] = useState(false)
    const [importFromYearId, setImportFromYearId] = useState('')
    const [availableImports, setAvailableImports] = useState<ImportableTeacherAssignment[]>([])
    const [selectedImportIndices, setSelectedImportIndices] = useState<Set<number>>(new Set())

    const loadData = async () => {
        if (!activeYearId) return
        try {
            setLoading(true)
            setLoadError(null)
            const [usersRes, classesRes, studentsRes, templatesRes, taRes, saRes, tplRes, salRes] = await Promise.all([
                api.get('/users'),
                api.get(`/classes?schoolYearId=${activeYearId}`),
                api.get('/students'),
                api.get('/templates'),
                api.get(`/teacher-assignments?schoolYearId=${activeYearId}`),
                api.get('/subadmin-assignments'),
                api.get(`/template-assignments?schoolYearId=${activeYearId}`),
                api.get('/subadmin-assignments/levels'),
            ])

            const allUsers = usersRes.data
            setTeachers(allUsers.filter((u: User) => u.role === 'TEACHER'))
            setSubAdmins(allUsers.filter((u: User) => u.role === 'SUBADMIN'))
            setAefeUsers(allUsers.filter((u: User) => u.role === 'AEFE'))
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
            setTemplates(templatesRes.data)
            
            setTeacherAssignments(taRes.data)
            setSubAdminAssignments(saRes.data)
            setTemplateAssignments(tplRes.data)
            setSubAdminLevelAssignments(salRes.data)
        } catch (e) {
            setLoadError("Impossible de charger les données. Réessayez dans quelques instants.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (activeYearId) loadData()
    }, [activeYearId])

    const assignTeacherToClass = async () => {
        if (!selectedTeacher || selectedClasses.length === 0) return
        try {
            setBusyAction('assign-teacher')
            await Promise.all(selectedClasses.map(classId => 
                api.post('/teacher-assignments', { 
                    teacherId: selectedTeacher, 
                    classId: classId,
                    languages: selectedLanguages,
                    isProfPolyvalent
                })
            ))
            setMessage(`✓ ${selectedClasses.length} classes assignées`)
            setSelectedClasses([])
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const requestRemoveTeacherAssignment = (assignmentId: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'teacher-assignment', assignmentId, label })
    }

    const assignSubAdminToLevel = async () => {
        try {
            setBusyAction('assign-subadmin-level')
            const res = await api.post('/subadmin-assignments/bulk-level', {
                subAdminId: selectedSubAdminForLevel,
                level: selectedLevelForSubAdmin,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const assignAefeToLevel = async () => {
        try {
            setBusyAction('assign-aefe-level')
            const res = await api.post('/subadmin-assignments/bulk-level', {
                subAdminId: selectedAefeForLevel,
                level: selectedLevelForAefe,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const assignTemplateToLevel = async () => {
        try {
            setBusyAction('assign-template-level')
            const res = await api.post('/template-assignments/bulk-level', {
                templateId: selectedTemplateForLevel,
                level: selectedLevelForTemplate,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const fetchImportableAssignments = async (yearId: string) => {
        try {
            const res = await api.get(`/teacher-assignments?schoolYearId=${yearId}`)
            setAvailableImports(res.data)
            setImportFromYearId(yearId)
            const allIndices = new Set<number>(res.data.map((_: ImportableTeacherAssignment, idx: number) => idx))
            setSelectedImportIndices(allIndices)
        } catch (e) {
            console.error(e)
        }
    }

    const handleOpenImport = () => {
        const sortedYears = [...years].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        const currentIndex = sortedYears.findIndex(y => y._id === activeYearId)
        let targetYear = sortedYears[currentIndex + 1]
        if (!targetYear && sortedYears.length > 1) {
            targetYear = sortedYears.find(y => y._id !== activeYearId)!
        }
        
        if (targetYear) {
            fetchImportableAssignments(targetYear._id)
            setShowImportModal(true)
        } else {
            alert("Aucune autre année scolaire trouvée pour l'importation.")
        }
    }

    const executeImport = async () => {
        const toImport = availableImports.filter((_, idx) => selectedImportIndices.has(idx))
        if (toImport.length === 0) return

        try {
            setBusyAction('import')
            const res = await api.post('/teacher-assignments/import', {
                sourceAssignments: toImport,
                targetYearId: activeYearId
            })
            setMessage(`✓ ${res.data.importedCount} assignations importées`)
            if (res.data.errors && res.data.errors.length > 0) {
                alert(`Importé avec des erreurs:\n${res.data.errors.join('\n')}`)
            }
            setShowImportModal(false)
            loadData()
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'import')
        } finally {
            setBusyAction(null)
        }
    }

    const requestRemoveSubAdminLevelAssignment = (subAdminId: string, level: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'subadmin-level', subAdminId, level, label })
    }

    const requestRemoveTemplateLevelAssignment = (templateId: string, level: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'template-level', templateId, level, label })
    }

    const performDelete = async () => {
        if (!deleteAction) return
        if (deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER') return
        try {
            setBusyAction('delete')
            if (deleteAction.type === 'teacher-assignment') {
                await api.delete(`/teacher-assignments/${deleteAction.assignmentId}`)
                setMessage('✓ Assignation supprimée')
            }
            if (deleteAction.type === 'subadmin-level') {
                await api.delete(`/subadmin-assignments/levels/${deleteAction.subAdminId}/${deleteAction.level}`)
                setMessage('✓ Assignation supprimée')
            }
            if (deleteAction.type === 'template-level') {
                await api.delete(`/template-assignments/bulk-level/${deleteAction.templateId}/${deleteAction.level}?schoolYearId=${activeYearId}`)
                setMessage('✓ Assignations supprimées')
            }
            setTimeout(() => setMessage(''), 3000)
            setDeleteAction(null)
            setDeleteConfirmText('')
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        } finally {
            setBusyAction(null)
        }
    }

    const activeYearName = useMemo(() => years.find(y => y._id === activeYearId)?.name ?? '—', [years, activeYearId])

    const filteredTeachers = useMemo(() => {
        const q = teacherQuery.trim().toLowerCase()
        if (!q) return teachers
        return teachers.filter(t => `${t.displayName} ${t.email}`.toLowerCase().includes(q))
    }, [teachers, teacherQuery])

    const currentTeacherAssignmentsAll = useMemo(() => teacherAssignments.filter(ta => ta.teacherId === selectedTeacher), [teacherAssignments, selectedTeacher])

    const currentTeacherAssignments = useMemo(() => {
        const q = currentAssignmentsQuery.trim().toLowerCase()
        if (!q) return currentTeacherAssignmentsAll
        return currentTeacherAssignmentsAll.filter(a => (a.className ?? '').toLowerCase().includes(q))
    }, [currentTeacherAssignmentsAll, currentAssignmentsQuery])

    const assignedClassIds = useMemo(() => new Set(currentTeacherAssignmentsAll.map(ta => ta.classId)), [currentTeacherAssignmentsAll])

    const availableClasses = useMemo(() => classes.filter(c => !assignedClassIds.has(c._id)), [classes, assignedClassIds])

    const filteredAvailableClasses = useMemo(() => {
        const q = classQuery.trim().toLowerCase()
        if (!q) return availableClasses
        return availableClasses.filter(c => c.name.toLowerCase().includes(q))
    }, [availableClasses, classQuery])

    const subAdminSummary = useMemo(() => {
        return subAdminLevelAssignments
            .filter(sa => subAdmins.some(u => u._id === sa.subAdminId))
            .map(sa => ({ ...sa, levels: [...sa.levels].sort() }))
            .sort((a, b) => a.subAdminName.localeCompare(b.subAdminName))
    }, [subAdminLevelAssignments, subAdmins])

    const aefeSummary = useMemo(() => {
        return subAdminLevelAssignments
            .filter(sa => aefeUsers.some(u => u._id === sa.subAdminId))
            .map(sa => ({ ...sa, levels: [...sa.levels].sort() }))
            .sort((a, b) => a.subAdminName.localeCompare(b.subAdminName))
    }, [subAdminLevelAssignments, aefeUsers])

    const templateSummary = useMemo(() => {
        const summary = new Map<string, { templateId: string; levels: Set<string> }>()
        templateAssignments.forEach(ta => {
            const templateName = ta.templateName || 'Unknown'
            if (!summary.has(templateName)) summary.set(templateName, { templateId: ta.templateId, levels: new Set() })
            if (ta.classId) {
                const cls = classes.find(c => c._id === ta.classId)
                if (cls?.level) summary.get(templateName)?.levels.add(cls.level)
            }
        })
        return Array.from(summary.entries())
            .map(([name, data]) => ({ name, templateId: data.templateId, levels: Array.from(data.levels).sort() }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [templateAssignments, classes])

    const importRows = useMemo(() => {
        const q = importQuery.trim().toLowerCase()
        return availableImports
            .map((ta, idx) => ({ ta, idx }))
            .filter(({ ta }) => {
                if (!q) return true
                return `${ta.teacherName ?? ''} ${ta.className ?? ''} ${(ta.languages ?? []).join(',')}`.toLowerCase().includes(q)
            })
    }, [availableImports, importQuery])

    const allVisibleImportsSelected = useMemo(() => {
        if (importRows.length === 0) return false
        return importRows.every(r => selectedImportIndices.has(r.idx))
    }, [importRows, selectedImportIndices])

    const tabCounts = useMemo(() => ({
        teacher: teacherAssignments.length,
        subadmin: subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0),
        aefe: aefeSummary.reduce((acc, s) => acc + s.levels.length, 0),
        template: templateSummary.reduce((acc, s) => acc + s.levels.length, 0),
    }), [teacherAssignments, subAdminSummary, aefeSummary, templateSummary])

    return (
        <div className="aa-page">
            {/* Header */}
            <header className="aa-header">
                <div className="aa-header-content">
                    <div className="aa-header-left">
                        <div className="aa-header-icon">
                            <Users size={24} />
                        </div>
                        <div>
                            <h1 className="aa-title">Gestion des assignations</h1>
                            <p className="aa-subtitle">
                                <span className="aa-year-badge">{activeYearName}</span>
                                Gérez les assignations des enseignants, carnets et sous-administrateurs
                            </p>
                        </div>
                    </div>
                    <div className="aa-header-actions">
                        <Link to="/admin/assignment-list" className="aa-btn aa-btn-secondary">
                            <ChevronRight size={16} />
                            Voir toutes
                        </Link>
                        <Link to="/admin" className="aa-btn aa-btn-ghost">
                            Retour
                        </Link>
                    </div>
                </div>
            </header>

            {/* Toast Messages */}
            {message && (
                <div className={`aa-toast ${message.includes('✓') ? 'aa-toast-success' : 'aa-toast-error'}`}>
                    {message.includes('✓') ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{message}</span>
                </div>
            )}

            {loadError && (
                <div className="aa-error-banner">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                    <button onClick={loadData} className="aa-btn aa-btn-sm">Réessayer</button>
                </div>
            )}

            {/* Tab Navigation */}
            <nav className="aa-tabs">
                {(Object.keys(TAB_CONFIG) as Array<keyof typeof TAB_CONFIG>).map(key => {
                    const config = TAB_CONFIG[key]
                    const Icon = config.icon
                    const isActive = activeTab === key
                    return (
                        <button
                            key={key}
                            className={`aa-tab ${isActive ? 'aa-tab-active' : ''}`}
                            onClick={() => setActiveTab(key)}
                            style={{ '--tab-color': config.color, '--tab-bg': config.bg } as React.CSSProperties}
                        >
                            <Icon size={18} />
                            <span className="aa-tab-label">{config.label}</span>
                            <span className="aa-tab-count">{tabCounts[key]}</span>
                        </button>
                    )
                })}
                {loading && (
                    <div className="aa-loading-indicator">
                        <Loader2 size={16} className="aa-spin" />
                        <span>Chargement…</span>
                    </div>
                )}
            </nav>

            {/* Teacher Tab */}
            {activeTab === 'teacher' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Users size={20} style={{ color: '#3b82f6' }} />
                                <span>Enseignant → Classe</span>
                            </div>
                            <button className="aa-btn aa-btn-outline" onClick={handleOpenImport} disabled={busyAction !== null || loading}>
                                <Download size={16} />
                                Importer N-1
                            </button>
                        </div>

                        <div className="aa-search-row">
                            <div className="aa-search-field">
                                <Search size={16} className="aa-search-icon" />
                                <input
                                    type="text"
                                    className="aa-input"
                                    value={teacherQuery}
                                    onChange={e => setTeacherQuery(e.target.value)}
                                    placeholder="Rechercher un enseignant…"
                                    disabled={loading}
                                />
                            </div>
                            <select
                                className="aa-select"
                                value={selectedTeacher}
                                disabled={loading}
                                onChange={e => {
                                    setSelectedTeacher(e.target.value)
                                    setSelectedClasses([])
                                    setClassQuery('')
                                    setCurrentAssignmentsQuery('')
                                }}
                            >
                                <option value="">Sélectionner un enseignant</option>
                                {filteredTeachers.map(t => (
                                    <option key={t._id} value={t._id}>
                                        {t.displayName} ({t.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!selectedTeacher && (
                            <div className="aa-empty-state">
                                <Users size={48} strokeWidth={1} />
                                <p>Sélectionnez un enseignant pour gérer ses assignations</p>
                            </div>
                        )}

                        {selectedTeacher && (
                            <div className="aa-split-view">
                                {/* New Assignment Panel */}
                                <div className="aa-split-panel aa-split-panel-new">
                                    <h4 className="aa-split-title">
                                        <Plus size={16} />
                                        Nouvelle assignation
                                        {selectedClasses.length > 0 && (
                                            <span className="aa-badge">{selectedClasses.length}</span>
                                        )}
                                    </h4>

                                    <div className="aa-search-field aa-search-field-sm">
                                        <Search size={14} className="aa-search-icon" />
                                        <input
                                            type="text"
                                            className="aa-input aa-input-sm"
                                            value={classQuery}
                                            onChange={e => setClassQuery(e.target.value)}
                                            placeholder="Filtrer les classes…"
                                            disabled={loading || busyAction !== null}
                                        />
                                    </div>

                                    <div className="aa-list-actions">
                                        <span className="aa-list-count">{filteredAvailableClasses.length} disponible(s)</span>
                                        <div className="aa-list-btns">
                                            <button
                                                type="button"
                                                className="aa-btn aa-btn-xs"
                                                disabled={filteredAvailableClasses.length === 0 || loading || busyAction !== null}
                                                onClick={() => setSelectedClasses(Array.from(new Set([...selectedClasses, ...filteredAvailableClasses.map(c => c._id)])))}
                                            >
                                                Tout
                                            </button>
                                            <button
                                                type="button"
                                                className="aa-btn aa-btn-xs"
                                                disabled={selectedClasses.length === 0 || loading || busyAction !== null}
                                                onClick={() => setSelectedClasses([])}
                                            >
                                                Aucun
                                            </button>
                                        </div>
                                    </div>

                                    <div className="aa-checkbox-list">
                                        {availableClasses.length === 0 ? (
                                            <div className="aa-list-empty">Toutes les classes sont assignées</div>
                                        ) : filteredAvailableClasses.length === 0 ? (
                                            <div className="aa-list-empty">Aucune classe ne correspond</div>
                                        ) : (
                                            filteredAvailableClasses.map(c => (
                                                <label key={c._id} className={`aa-checkbox-item ${selectedClasses.includes(c._id) ? 'aa-checkbox-item-selected' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClasses.includes(c._id)}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedClasses([...selectedClasses, c._id])
                                                            else setSelectedClasses(selectedClasses.filter(id => id !== c._id))
                                                        }}
                                                        disabled={busyAction !== null || loading}
                                                    />
                                                    <span>{c.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>

                                    <div className="aa-options-section">
                                        <label className="aa-option-label">Langues autorisées</label>
                                        <div className="aa-lang-chips">
                                            {['ar', 'en'].map(lang => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    className={`aa-lang-chip ${selectedLanguages.includes(lang) ? 'aa-lang-chip-active' : ''}`}
                                                    disabled={isProfPolyvalent || loading || busyAction !== null}
                                                    onClick={() => {
                                                        if (selectedLanguages.includes(lang)) setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
                                                        else setSelectedLanguages([...selectedLanguages, lang])
                                                    }}
                                                >
                                                    {lang.toUpperCase()}
                                                </button>
                                            ))}
                                            {selectedLanguages.length === 0 && !isProfPolyvalent && (
                                                <span className="aa-lang-hint">Toutes langues</span>
                                            )}
                                        </div>
                                    </div>

                                    <label className="aa-toggle">
                                        <input
                                            type="checkbox"
                                            checked={isProfPolyvalent}
                                            onChange={e => {
                                                const checked = e.target.checked
                                                setIsProfPolyvalent(checked)
                                                if (checked) setSelectedLanguages([])
                                            }}
                                            disabled={loading || busyAction !== null}
                                        />
                                        <span className="aa-toggle-slider"></span>
                                        <span className="aa-toggle-label">Prof Polyvalent</span>
                                    </label>

                                    <button
                                        className="aa-btn aa-btn-primary aa-btn-full"
                                        onClick={assignTeacherToClass}
                                        disabled={selectedClasses.length === 0 || loading || busyAction !== null}
                                    >
                                        {busyAction === 'assign-teacher' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                        Assigner {selectedClasses.length > 0 ? `(${selectedClasses.length})` : ''}
                                    </button>
                                </div>

                                {/* Current Assignments Panel */}
                                <div className="aa-split-panel aa-split-panel-current">
                                    <h4 className="aa-split-title">
                                        <Check size={16} />
                                        Assignations actuelles
                                        <span className="aa-badge aa-badge-muted">{currentTeacherAssignmentsAll.length}</span>
                                    </h4>

                                    <div className="aa-search-field aa-search-field-sm">
                                        <Search size={14} className="aa-search-icon" />
                                        <input
                                            type="text"
                                            className="aa-input aa-input-sm"
                                            value={currentAssignmentsQuery}
                                            onChange={e => setCurrentAssignmentsQuery(e.target.value)}
                                            placeholder="Filtrer…"
                                            disabled={loading}
                                        />
                                    </div>

                                    <div className="aa-assignment-list">
                                        {currentTeacherAssignments.length === 0 ? (
                                            <div className="aa-list-empty">Aucune assignation</div>
                                        ) : (
                                            currentTeacherAssignments.map(ta => (
                                                <div key={ta._id} className="aa-assignment-card">
                                                    <div className="aa-assignment-info">
                                                        <span className="aa-assignment-name">{ta.className}</span>
                                                        <div className="aa-assignment-meta">
                                                            {ta.isProfPolyvalent ? (
                                                                <span className="aa-tag aa-tag-purple">Polyvalent</span>
                                                            ) : ta.languages && ta.languages.length > 0 ? (
                                                                <span className="aa-tag">{ta.languages.join(', ').toUpperCase()}</span>
                                                            ) : (
                                                                <span className="aa-tag aa-tag-muted">Toutes langues</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="aa-btn-icon aa-btn-icon-danger"
                                                        onClick={() => requestRemoveTeacherAssignment(ta._id, `${ta.className ?? 'classe'}`)}
                                                        title="Supprimer"
                                                        disabled={busyAction !== null || loading}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SubAdmin Tab */}
            {activeTab === 'subadmin' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Shield size={20} style={{ color: '#8b5cf6' }} />
                                <span>Sous-admin → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Sous-administrateur</label>
                                <select className="aa-select" value={selectedSubAdminForLevel} onChange={e => setSelectedSubAdminForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner sous-admin</option>
                                    {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForSubAdmin} onChange={e => setSelectedLevelForSubAdmin(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignSubAdminToLevel}
                                disabled={!selectedSubAdminForLevel || !selectedLevelForSubAdmin || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-subadmin-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {subAdminSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    subAdminSummary.map(sa => (
                                        <div key={sa.subAdminId} className="aa-summary-row">
                                            <span className="aa-summary-name">{sa.subAdminName}</span>
                                            <div className="aa-summary-tags">
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="aa-tag aa-tag-removable">
                                                        {lvl}
                                                        <button type="button" onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AEFE Tab */}
            {activeTab === 'aefe' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Globe size={20} style={{ color: '#f59e0b' }} />
                                <span>AEFE → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Utilisateur AEFE</label>
                                <select className="aa-select" value={selectedAefeForLevel} onChange={e => setSelectedAefeForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner AEFE</option>
                                    {aefeUsers.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForAefe} onChange={e => setSelectedLevelForAefe(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignAefeToLevel}
                                disabled={!selectedAefeForLevel || !selectedLevelForAefe || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-aefe-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{aefeSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {aefeSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    aefeSummary.map(sa => (
                                        <div key={sa.subAdminId} className="aa-summary-row">
                                            <span className="aa-summary-name">{sa.subAdminName}</span>
                                            <div className="aa-summary-tags">
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="aa-tag aa-tag-removable">
                                                        {lvl}
                                                        <button type="button" onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Tab */}
            {activeTab === 'template' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <BookOpen size={20} style={{ color: '#10b981' }} />
                                <span>Carnet → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Carnet</label>
                                <select className="aa-select" value={selectedTemplateForLevel} onChange={e => setSelectedTemplateForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner carnet</option>
                                    {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForTemplate} onChange={e => setSelectedLevelForTemplate(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignTemplateToLevel}
                                disabled={!selectedTemplateForLevel || !selectedLevelForTemplate || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-template-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{templateSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {templateSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    templateSummary.map(t => (
                                        <div key={t.name} className="aa-summary-row">
                                            <span className="aa-summary-name">{t.name}</span>
                                            <div className="aa-summary-tags">
                                                {t.levels.length === 0 ? (
                                                    <span className="aa-tag aa-tag-muted">Aucun niveau</span>
                                                ) : (
                                                    t.levels.map(lvl => (
                                                        <span key={lvl} className="aa-tag aa-tag-removable">
                                                            {lvl}
                                                            <button type="button" onClick={() => requestRemoveTemplateLevelAssignment(t.templateId, lvl, `${t.name} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="aa-modal-overlay" onClick={() => setShowImportModal(false)}>
                    <div className="aa-modal" onClick={e => e.stopPropagation()}>
                        <div className="aa-modal-header">
                            <h3>Importer les assignations</h3>
                            <button type="button" className="aa-btn-icon" onClick={() => setShowImportModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="aa-modal-body">
                            <div className="aa-form-row">
                                <div className="aa-form-group">
                                    <label className="aa-label">Depuis l'année scolaire</label>
                                    <select
                                        className="aa-select"
                                        value={importFromYearId}
                                        onChange={e => fetchImportableAssignments(e.target.value)}
                                        disabled={busyAction !== null}
                                    >
                                        {years.filter(y => y._id !== activeYearId).map(y => (
                                            <option key={y._id} value={y._id}>{y.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="aa-form-group">
                                    <label className="aa-label">Rechercher</label>
                                    <div className="aa-search-field">
                                        <Search size={14} className="aa-search-icon" />
                                        <input className="aa-input" value={importQuery} onChange={e => setImportQuery(e.target.value)} placeholder="Enseignant, classe…" />
                                    </div>
                                </div>
                            </div>

                            <div className="aa-list-actions">
                                <span className="aa-list-count">{selectedImportIndices.size} sélectionnée(s)</span>
                                <div className="aa-list-btns">
                                    <button
                                        type="button"
                                        className="aa-btn aa-btn-xs"
                                        disabled={importRows.length === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.add(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Tout
                                    </button>
                                    <button
                                        type="button"
                                        className="aa-btn aa-btn-xs"
                                        disabled={selectedImportIndices.size === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.delete(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Aucun
                                    </button>
                                </div>
                            </div>

                            <div className="aa-import-table-wrapper">
                                <table className="aa-import-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleImportsSelected}
                                                    disabled={importRows.length === 0 || busyAction !== null}
                                                    onChange={e => {
                                                        if (e.target.checked) {
                                                            const next = new Set(selectedImportIndices)
                                                            importRows.forEach(r => next.add(r.idx))
                                                            setSelectedImportIndices(next)
                                                        } else {
                                                            const next = new Set(selectedImportIndices)
                                                            importRows.forEach(r => next.delete(r.idx))
                                                            setSelectedImportIndices(next)
                                                        }
                                                    }}
                                                />
                                            </th>
                                            <th>Enseignant</th>
                                            <th>Classe</th>
                                            <th>Langues</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importRows.length === 0 ? (
                                            <tr><td colSpan={4} className="aa-table-empty">Aucune assignation trouvée</td></tr>
                                        ) : importRows.map(({ ta, idx }) => (
                                            <tr key={idx} className={selectedImportIndices.has(idx) ? 'aa-row-selected' : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedImportIndices.has(idx)}
                                                        disabled={busyAction !== null}
                                                        onChange={e => {
                                                            const next = new Set(selectedImportIndices)
                                                            if (e.target.checked) next.add(idx)
                                                            else next.delete(idx)
                                                            setSelectedImportIndices(next)
                                                        }}
                                                    />
                                                </td>
                                                <td>{ta.teacherName}</td>
                                                <td>{ta.className}</td>
                                                <td>
                                                    {ta.isProfPolyvalent ? (
                                                        <span className="aa-tag aa-tag-purple">Polyvalent</span>
                                                    ) : (ta.languages && ta.languages.length > 0) ? (
                                                        <span className="aa-tag">{ta.languages.join(', ').toUpperCase()}</span>
                                                    ) : (
                                                        <span className="aa-tag aa-tag-muted">Toutes</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="aa-modal-footer">
                            <button className="aa-btn aa-btn-ghost" onClick={() => setShowImportModal(false)} disabled={busyAction !== null}>Annuler</button>
                            <button className="aa-btn aa-btn-primary" onClick={executeImport} disabled={selectedImportIndices.size === 0 || busyAction !== null}>
                                {busyAction === 'import' ? <Loader2 size={16} className="aa-spin" /> : <Check size={16} />}
                                Importer ({selectedImportIndices.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteAction && (
                <div className="aa-modal-overlay" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }}>
                    <div className="aa-modal aa-modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="aa-modal-header aa-modal-header-danger">
                            <h3>Supprimer l'assignation</h3>
                            <button type="button" className="aa-btn-icon" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="aa-modal-body">
                            <div className="aa-delete-warning">
                                <AlertCircle size={24} />
                                <div>
                                    <p className="aa-delete-label">{deleteAction.label}</p>
                                    <p className="aa-delete-hint">Tapez <strong>SUPPRIMER</strong> pour confirmer</p>
                                </div>
                            </div>
                            <input
                                className="aa-input"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder="SUPPRIMER"
                                autoFocus
                            />
                        </div>
                        <div className="aa-modal-footer">
                            <button className="aa-btn aa-btn-ghost" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }} disabled={busyAction !== null}>Annuler</button>
                            <button className="aa-btn aa-btn-danger" onClick={performDelete} disabled={deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER' || busyAction !== null}>
                                {busyAction === 'delete' ? <Loader2 size={16} className="aa-spin" /> : <Trash2 size={16} />}
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
