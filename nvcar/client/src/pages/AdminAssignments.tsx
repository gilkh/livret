import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Check, X, Plus } from 'lucide-react'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'

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
    
    // Level assignment states
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

    // Import State
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
            // Select all by default
            const allIndices = new Set<number>(res.data.map((_: ImportableTeacherAssignment, idx: number) => idx))
            setSelectedImportIndices(allIndices)
        } catch (e) {
            console.error(e)
        }
    }

    const handleOpenImport = () => {
        // Find previous year
        // Sort years by startDate descending
        const sortedYears = [...years].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        const currentIndex = sortedYears.findIndex(y => y._id === activeYearId)
        // Default to previous year (currentIndex + 1) if exists, else first available that is not active
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

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                    <h2 className="title" style={{ fontSize: '2rem', marginBottom: 6 }}>Gestion des assignations</h2>
                    <p className="note" style={{ marginTop: 0 }}>Année scolaire: {activeYearName}</p>
                    <p className="note" style={{ marginTop: 6 }}>Gérez les assignations des enseignants, carnets et sous-administrateurs</p>
                </div>
                <div className="toolbar" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link to="/admin/assignment-list" className="btn secondary">Voir toutes les assignations</Link>
                    <Link to="/admin" className="btn ghost">Retour</Link>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <div className="segmented" role="tablist" aria-label="Sections assignations">
                    <button type="button" className={`segment ${activeTab === 'teacher' ? 'active' : ''}`} onClick={() => setActiveTab('teacher')}>
                        Enseignant→Classe ({teacherAssignments.length})
                    </button>
                    <button type="button" className={`segment ${activeTab === 'subadmin' ? 'active' : ''}`} onClick={() => setActiveTab('subadmin')}>
                        Sous-admin→Niveau ({subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0)})
                    </button>
                    <button type="button" className={`segment ${activeTab === 'aefe' ? 'active' : ''}`} onClick={() => setActiveTab('aefe')}>
                        AEFE→Niveau ({aefeSummary.reduce((acc, s) => acc + s.levels.length, 0)})
                    </button>
                    <button type="button" className={`segment ${activeTab === 'template' ? 'active' : ''}`} onClick={() => setActiveTab('template')}>
                        Carnet→Niveau ({templateSummary.reduce((acc, s) => acc + s.levels.length, 0)})
                    </button>
                </div>
                {loading && (
                    <div className="note" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="spinner" /> Chargement…
                    </div>
                )}
            </div>

            {loadError && (
                <div style={{ padding: '12px 16px', background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 10, marginBottom: 12 }}>
                    {loadError}
                </div>
            )}

            {message && (
                <div style={{
                    marginBottom: 12,
                    padding: '12px 16px',
                    background: message.includes('✓') ? '#f6ffed' : '#fff1f0',
                    border: `1px solid ${message.includes('✓') ? '#b7eb8f' : '#ffa39e'}`,
                    color: message.includes('✓') ? '#389e0d' : '#cf1322',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                }}>
                    {message}
                </div>
            )}

            {activeTab === 'teacher' && (
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 10 }}>👨‍🏫</div>
                            <h3 style={{ margin: 0 }}>Enseignant → Classe</h3>
                        </div>
                        <button className="btn ghost" onClick={handleOpenImport} disabled={busyAction !== null || loading}>
                            📥 Importer N-1
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div className="field">
                            <div className="field-label">Recherche enseignant</div>
                            <input className="input" value={teacherQuery} onChange={e => setTeacherQuery(e.target.value)} placeholder="Nom ou email…" disabled={loading} />
                        </div>
                        <div className="field">
                            <div className="field-label">Enseignant</div>
                            <select
                                className="select"
                                value={selectedTeacher}
                                disabled={loading}
                                onChange={e => {
                                    setSelectedTeacher(e.target.value)
                                    setSelectedClasses([])
                                    setClassQuery('')
                                    setCurrentAssignmentsQuery('')
                                }}
                            >
                                <option value="">Sélectionner enseignant</option>
                                {filteredTeachers.map(t => (
                                    <option key={t._id} value={t._id}>
                                        {t.displayName} ({t.email})
                                    </option>
                                ))}
                            </select>
                            <div className="note">{filteredTeachers.length} enseignant(s)</div>
                        </div>
                    </div>

                    {selectedTeacher && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 18 }}>
                            <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: 16, background: '#fafafa' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#334155' }}>Nouvelle assignation</h4>
                                    <div className="note">{selectedClasses.length} sélectionnée(s)</div>
                                </div>

                                <div className="field" style={{ marginBottom: 10 }}>
                                    <div className="field-label">Filtrer les classes</div>
                                    <input className="input" value={classQuery} onChange={e => setClassQuery(e.target.value)} placeholder="Ex: 5A, GS…" disabled={loading || busyAction !== null} />
                                </div>

                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' }}>
                                    <div className="note">{filteredAvailableClasses.length} classe(s) disponible(s)</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="btn ghost"
                                            disabled={filteredAvailableClasses.length === 0 || loading || busyAction !== null}
                                            onClick={() => setSelectedClasses(Array.from(new Set([...selectedClasses, ...filteredAvailableClasses.map(c => c._id)])))}
                                        >
                                            Tout
                                        </button>
                                        <button type="button" className="btn ghost" disabled={selectedClasses.length === 0 || loading || busyAction !== null} onClick={() => setSelectedClasses([])}>
                                            Aucun
                                        </button>
                                    </div>
                                </div>

                                <div style={{ maxHeight: 220, overflowY: 'auto', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 6 }}>
                                    {availableClasses.length === 0 ? (
                                        <div style={{ padding: 10, color: '#94a3b8', fontSize: '0.9rem' }}>Toutes les classes sont assignées</div>
                                    ) : filteredAvailableClasses.length === 0 ? (
                                        <div style={{ padding: 10, color: '#94a3b8', fontSize: '0.9rem' }}>Aucune classe ne correspond</div>
                                    ) : (
                                        filteredAvailableClasses.map(c => (
                                            <label key={c._id} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: 'pointer', fontSize: '0.95rem', borderRadius: 10 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedClasses.includes(c._id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setSelectedClasses([...selectedClasses, c._id])
                                                        else setSelectedClasses(selectedClasses.filter(id => id !== c._id))
                                                    }}
                                                    style={{ marginRight: 10 }}
                                                    disabled={busyAction !== null || loading}
                                                />
                                                {c.name}
                                            </label>
                                        ))
                                    )}
                                </div>

                                <div style={{ marginTop: 12 }}>
                                    <div className="field-label">Langues autorisées</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                        {['ar', 'en'].map(lang => (
                                            <button
                                                key={lang}
                                                type="button"
                                                className={`chip ${selectedLanguages.includes(lang) ? 'active' : ''}`}
                                                disabled={isProfPolyvalent || loading || busyAction !== null}
                                                onClick={() => {
                                                    if (selectedLanguages.includes(lang)) setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
                                                    else setSelectedLanguages([...selectedLanguages, lang])
                                                }}
                                            >
                                                {lang.toUpperCase()}
                                            </button>
                                        ))}
                                        <span className="note" style={{ alignSelf: 'center' }}>{selectedLanguages.length === 0 ? 'Toutes langues' : ''}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: 12 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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
                                        <span style={{ fontSize: '0.95rem' }}>Prof Polyvalent</span>
                                    </label>
                                </div>

                                <button
                                    className="btn"
                                    onClick={assignTeacherToClass}
                                    disabled={selectedClasses.length === 0 || loading || busyAction !== null}
                                    style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                                >
                                    {busyAction === 'assign-teacher' ? <span className="spinner" /> : <Plus size={16} />}
                                    Assigner {selectedClasses.length > 0 ? `(${selectedClasses.length})` : ''}
                                </button>
                            </div>

                            <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: 16, background: 'white' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#334155' }}>Assignations actuelles</h4>
                                    <div className="note">{currentTeacherAssignmentsAll.length} total</div>
                                </div>

                                <div className="field" style={{ marginBottom: 10 }}>
                                    <div className="field-label">Filtrer</div>
                                    <input className="input" value={currentAssignmentsQuery} onChange={e => setCurrentAssignmentsQuery(e.target.value)} placeholder="Nom de classe…" disabled={loading} />
                                </div>

                                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                                    {currentTeacherAssignments.length === 0 ? (
                                        <div className="note">Aucune assignation</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {currentTeacherAssignments.map(ta => (
                                                <div key={ta._id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{ta.className}</div>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                                            {ta.isProfPolyvalent ? (
                                                                <span className="chip">Polyvalent</span>
                                                            ) : ta.languages && ta.languages.length > 0 ? (
                                                                <span className="chip">{ta.languages.join(', ').toUpperCase()}</span>
                                                            ) : (
                                                                <span className="note">Toutes langues</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="icon-btn danger"
                                                        onClick={() => requestRemoveTeacherAssignment(ta._id, `${ta.className ?? 'classe'}`)}
                                                        title="Supprimer"
                                                        disabled={busyAction !== null || loading}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'subadmin' && (
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#fff0f6', padding: 8, borderRadius: 10 }}>👔</div>
                        <h3 style={{ margin: 0 }}>Sous-admin → Niveau</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
                        <div className="field">
                            <div className="field-label">Sous-administrateur</div>
                            <select className="select" value={selectedSubAdminForLevel} onChange={e => setSelectedSubAdminForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner sous-admin</option>
                                {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <div className="field-label">Niveau</div>
                            <select className="select" value={selectedLevelForSubAdmin} onChange={e => setSelectedLevelForSubAdmin(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <button className="btn" onClick={assignSubAdminToLevel} disabled={!selectedSubAdminForLevel || !selectedLevelForSubAdmin || loading || busyAction !== null} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {busyAction === 'assign-subadmin-level' ? <span className="spinner" /> : null}
                        Assigner à tous les enseignants
                    </button>

                    <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>Déjà assigné</div>
                            <div className="note">{subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</div>
                        </div>
                        <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                            {subAdminSummary.length === 0 ? (
                                <div className="note">Aucune assignation</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {subAdminSummary.map(sa => (
                                        <div key={sa.subAdminId} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                            <div style={{ fontWeight: 600, color: '#334155', minWidth: 180 }}>{sa.subAdminName}</div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="chip">
                                                        {lvl}
                                                        <button type="button" className="icon-btn danger" style={{ padding: 0, borderRadius: 6 }} onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'aefe' && (
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#fff7e6', padding: 8, borderRadius: 10 }}>🌍</div>
                        <h3 style={{ margin: 0 }}>AEFE → Niveau</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
                        <div className="field">
                            <div className="field-label">Utilisateur AEFE</div>
                            <select className="select" value={selectedAefeForLevel} onChange={e => setSelectedAefeForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner AEFE</option>
                                {aefeUsers.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <div className="field-label">Niveau</div>
                            <select className="select" value={selectedLevelForAefe} onChange={e => setSelectedLevelForAefe(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <button className="btn" onClick={assignAefeToLevel} disabled={!selectedAefeForLevel || !selectedLevelForAefe || loading || busyAction !== null} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {busyAction === 'assign-aefe-level' ? <span className="spinner" /> : null}
                        Assigner à tous les enseignants
                    </button>

                    <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>Déjà assigné</div>
                            <div className="note">{aefeSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</div>
                        </div>
                        <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                            {aefeSummary.length === 0 ? (
                                <div className="note">Aucune assignation</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {aefeSummary.map(sa => (
                                        <div key={sa.subAdminId} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                            <div style={{ fontWeight: 600, color: '#334155', minWidth: 180 }}>{sa.subAdminName}</div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="chip">
                                                        {lvl}
                                                        <button type="button" className="icon-btn danger" style={{ padding: 0, borderRadius: 6 }} onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'template' && (
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f6ffed', padding: 8, borderRadius: 10 }}>🎓</div>
                        <h3 style={{ margin: 0 }}>Carnet → Niveau</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
                        <div className="field">
                            <div className="field-label">Carnet</div>
                            <select className="select" value={selectedTemplateForLevel} onChange={e => setSelectedTemplateForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <div className="field-label">Niveau</div>
                            <select className="select" value={selectedLevelForTemplate} onChange={e => setSelectedLevelForTemplate(e.target.value)} disabled={loading || busyAction !== null}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <button className="btn" onClick={assignTemplateToLevel} disabled={!selectedTemplateForLevel || !selectedLevelForTemplate || loading || busyAction !== null} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {busyAction === 'assign-template-level' ? <span className="spinner" /> : null}
                        Assigner à tous les élèves
                    </button>

                    <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>Déjà assigné</div>
                            <div className="note">{templateSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</div>
                        </div>
                        <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                            {templateSummary.length === 0 ? (
                                <div className="note">Aucune assignation</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {templateSummary.map(t => (
                                        <div key={t.name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                            <div style={{ fontWeight: 600, color: '#334155', minWidth: 220 }}>{t.name}</div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {t.levels.length === 0 ? (
                                                    <span className="note">Aucun niveau</span>
                                                ) : (
                                                    t.levels.map(lvl => (
                                                        <span key={lvl} className="chip">
                                                            {lvl}
                                                            <button type="button" className="icon-btn danger" style={{ padding: 0, borderRadius: 6 }} onClick={() => requestRemoveTemplateLevelAssignment(t.templateId, lvl, `${t.name} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showImportModal && (
                <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Importer les assignations">
                    <div className="modal">
                        <div className="modal-header">
                            <h3 className="modal-title">Importer les assignations</h3>
                            <button type="button" className="icon-btn" onClick={() => setShowImportModal(false)}><X size={20} /></button>
                        </div>

                        <div className="modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <div className="field">
                                    <div className="field-label">Depuis l'année scolaire</div>
                                    <select
                                        className="select"
                                        value={importFromYearId}
                                        onChange={e => fetchImportableAssignments(e.target.value)}
                                        disabled={busyAction !== null}
                                    >
                                        {years.filter(y => y._id !== activeYearId).map(y => (
                                            <option key={y._id} value={y._id}>{y.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <div className="field-label">Rechercher</div>
                                    <input className="input" value={importQuery} onChange={e => setImportQuery(e.target.value)} placeholder="Enseignant, classe, langues…" />
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                                <div className="note">{selectedImportIndices.size} sélectionnée(s)</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn ghost"
                                        disabled={importRows.length === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.add(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Tout (visible)
                                    </button>
                                    <button
                                        type="button"
                                        className="btn ghost"
                                        disabled={selectedImportIndices.size === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.delete(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Aucun (visible)
                                    </button>
                                </div>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                            <th style={{ padding: 10, width: 36 }}>
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
                                            <th style={{ padding: 10 }}>Enseignant</th>
                                            <th style={{ padding: 10 }}>Classe</th>
                                            <th style={{ padding: 10 }}>Langues</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importRows.length === 0 ? (
                                            <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Aucune assignation trouvée</td></tr>
                                        ) : importRows.map(({ ta, idx }) => (
                                            <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: 10 }}>
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
                                                <td style={{ padding: 10 }}>{ta.teacherName}</td>
                                                <td style={{ padding: 10 }}>{ta.className}</td>
                                                <td style={{ padding: 10 }}>
                                                    {ta.isProfPolyvalent ? (
                                                        <span className="chip">Polyvalent</span>
                                                    ) : (ta.languages && ta.languages.length > 0) ? (
                                                        <span className="chip">{ta.languages.join(', ').toUpperCase()}</span>
                                                    ) : (
                                                        <span className="note">Toutes langues</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn ghost" onClick={() => setShowImportModal(false)} disabled={busyAction !== null}>Annuler</button>
                            <button className="btn" onClick={executeImport} disabled={selectedImportIndices.size === 0 || busyAction !== null}>
                                {busyAction === 'import' ? <span className="spinner" /> : <Check size={16} />}
                                Importer ({selectedImportIndices.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteAction && (
                <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
                    <div className="modal" style={{ width: 'min(560px, 100%)' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Supprimer l'assignation</h3>
                            <button type="button" className="icon-btn" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: 6 }}>{deleteAction.label}</div>
                            <div className="note" style={{ marginBottom: 12 }}>Tapez SUPPRIMER pour confirmer.</div>
                            <input className="input" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="SUPPRIMER" />
                        </div>
                        <div className="modal-footer">
                            <button className="btn ghost" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }} disabled={busyAction !== null}>Annuler</button>
                            <button className="btn danger" onClick={performDelete} disabled={deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER' || busyAction !== null}>
                                {busyAction === 'delete' ? <span className="spinner" /> : null}
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
