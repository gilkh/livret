import { useState, useEffect } from 'react'
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

    // Import State
    const [showImportModal, setShowImportModal] = useState(false)
    const [importFromYearId, setImportFromYearId] = useState('')
    const [availableImports, setAvailableImports] = useState<any[]>([])
    const [selectedImportIndices, setSelectedImportIndices] = useState<Set<number>>(new Set())

    const loadData = async () => {
        if (!activeYearId) return
        try {
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
            console.error('Failed to load data', e)
        }
    }

    useEffect(() => {
        if (activeYearId) loadData()
    }, [activeYearId])

    const assignTeacherToClass = async () => {
        if (!selectedTeacher || selectedClasses.length === 0) return
        try {
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
        }
    }

    const removeAssignment = async (assignmentId: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette assignation ?')) return
        try {
            await api.delete(`/teacher-assignments/${assignmentId}`)
            setMessage('✓ Assignation supprimée')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const assignSubAdminToLevel = async () => {
        try {
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
        }
    }

    const assignAefeToLevel = async () => {
        try {
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
        }
    }

    const assignTemplateToLevel = async () => {
        try {
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
        }
    }

    const fetchImportableAssignments = async (yearId: string) => {
        try {
            const res = await api.get(`/teacher-assignments?schoolYearId=${yearId}`)
            setAvailableImports(res.data)
            setImportFromYearId(yearId)
            // Select all by default
            const allIndices = new Set<number>(res.data.map((_: any, idx: number) => idx))
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
        }
    }

    const removeSubAdminLevelAssignment = async (subAdminId: string, level: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette assignation ?')) return
        try {
            await api.delete(`/subadmin-assignments/levels/${subAdminId}/${level}`)
            setMessage('✓ Assignation supprimée')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const removeTemplateLevelAssignment = async (templateId: string, level: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette assignation pour tous les élèves de ce niveau ?')) return
        try {
            // Need a new endpoint or careful logic here.
            // Currently, template assignments are individual.
            // Bulk remove for a level/template combination:
            await api.delete(`/template-assignments/bulk-level/${templateId}/${level}?schoolYearId=${activeYearId}`)
            setMessage('✓ Assignations supprimées')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const renderSubAdminLevelSummary = () => {
        const subAdminOnly = subAdminLevelAssignments.filter(sa => {
            const user = subAdmins.find(u => u._id === sa.subAdminId)
            return user !== undefined
        })
        
        if (subAdminOnly.length === 0) return <div className="note" style={{ marginTop: 16 }}>Aucune assignation</div>

        return (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 16, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.8rem' }}>Déjà assigné :</div>
                {subAdminOnly.map(sa => (
                    <div key={sa.subAdminId} style={{ fontSize: '0.85rem', color: '#666', padding: '2px 0' }}>
                        {sa.subAdminName} → {sa.levels.sort().map(lvl => (
                            <span key={lvl} style={{ marginRight: 8 }}>
                                {lvl}
                                <button 
                                    onClick={() => removeSubAdminLevelAssignment(sa.subAdminId, lvl)}
                                    style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer', marginLeft: 2 }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        )
    }

    const renderAefeLevelSummary = () => {
        const aefeOnly = subAdminLevelAssignments.filter(sa => {
            const user = aefeUsers.find(u => u._id === sa.subAdminId)
            return user !== undefined
        })
        
        if (aefeOnly.length === 0) return <div className="note" style={{ marginTop: 16 }}>Aucune assignation</div>

        return (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 16, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.8rem' }}>Déjà assigné :</div>
                {aefeOnly.map(sa => (
                    <div key={sa.subAdminId} style={{ fontSize: '0.85rem', color: '#666', padding: '2px 0' }}>
                        {sa.subAdminName} → {sa.levels.sort().map(lvl => (
                            <span key={lvl} style={{ marginRight: 8 }}>
                                {lvl}
                                <button 
                                    onClick={() => removeSubAdminLevelAssignment(sa.subAdminId, lvl)}
                                    style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer', marginLeft: 2 }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        )
    }

    const renderTemplateLevelSummary = () => {
        const summary = new Map<string, { templateId: string, levels: Set<string> }>()

        templateAssignments.forEach(ta => {
            const templateName = ta.templateName || 'Unknown'
            if (!summary.has(templateName)) {
                summary.set(templateName, { templateId: ta.templateId, levels: new Set() })
            }
            
            if (ta.classId) {
                const cls = classes.find(c => c._id === ta.classId)
                if (cls && cls.level) {
                    summary.get(templateName)?.levels.add(cls.level)
                }
            }
        })

        if (summary.size === 0) return <div className="note" style={{ marginTop: 16 }}>Aucune assignation</div>

        return (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 16, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.8rem' }}>Déjà assigné :</div>
                {Array.from(summary.entries()).map(([name, data]) => (
                    <div key={name} style={{ fontSize: '0.85rem', color: '#666', padding: '2px 0' }}>
                        {name} → {Array.from(data.levels).sort().map(lvl => (
                            <span key={lvl} style={{ marginRight: 8 }}>
                                {lvl}
                                <button 
                                    onClick={() => removeTemplateLevelAssignment(data.templateId, lvl)}
                                    style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer', marginLeft: 2 }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        )) || 'Aucun niveau'}
                    </div>
                ))}
            </div>
        )
    }

    const currentTeacherAssignments = teacherAssignments.filter(ta => ta.teacherId === selectedTeacher)
    const assignedClassIds = new Set(currentTeacherAssignments.map(ta => ta.classId))
    const availableClasses = classes.filter(c => !assignedClassIds.has(c._id))

    return (
        <div className="container">
            <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="title" style={{ fontSize: '2rem', marginBottom: 8 }}>Gestion des assignations</h2>
                        <p className="note">Gérez les assignations des enseignants, carnets et sous-administrateurs</p>
                    </div>
                    <Link to="/admin/assignment-list" className="btn secondary">Voir toutes les assignations</Link>
                </div>
                
                {message && (
                    <div style={{ 
                        marginTop: 16, 
                        padding: '12px 16px', 
                        background: message.includes('✓') ? '#f6ffed' : '#fff1f0', 
                        border: `1px solid ${message.includes('✓') ? '#b7eb8f' : '#ffa39e'}`,
                        color: message.includes('✓') ? '#389e0d' : '#cf1322',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        {message}
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
                
                {/* Teacher to Class */}
                <div className="card" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8 }}>👨‍🏫</div>
                            <h3 style={{ margin: 0 }}>Enseignant → Classe</h3>
                        </div>
                        <button className="btn secondary" onClick={handleOpenImport} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                            📥 Importer N-1
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Enseignant</label>
                            <select value={selectedTeacher} onChange={e => {
                                setSelectedTeacher(e.target.value)
                                setSelectedClasses([])
                            }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner enseignant</option>
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName} ({t.email})</option>)}
                            </select>
                        </div>

                        {selectedTeacher && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                {/* Left: Add Assignment */}
                                <div>
                                    <h4 style={{ marginBottom: 12, fontSize: '0.9rem', color: '#666' }}>Nouvelle assignation</h4>
                                    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, background: '#fafafa' }}>
                                        <label className="note" style={{ display: 'block', marginBottom: 6 }}>Classes disponibles</label>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', background: 'white', border: '1px solid #ddd', borderRadius: 4, padding: 4 }}>
                                            {availableClasses.length === 0 ? (
                                                <div style={{ padding: 8, color: '#999', fontSize: '0.85rem' }}>Toutes les classes sont assignées</div>
                                            ) : (
                                                availableClasses.map(c => (
                                                    <label key={c._id} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedClasses.includes(c._id)}
                                                            onChange={e => {
                                                                if (e.target.checked) setSelectedClasses([...selectedClasses, c._id])
                                                                else setSelectedClasses(selectedClasses.filter(id => id !== c._id))
                                                            }}
                                                            style={{ marginRight: 8 }}
                                                        />
                                                        {c.name}
                                                    </label>
                                                ))
                                            )}
                                        </div>

                                        <div style={{ marginTop: 12 }}>
                                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Langues autorisées</label>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                {['ar', 'en'].map(lang => (
                                                    <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedLanguages.includes(lang)} 
                                                            onChange={e => {
                                                                if (e.target.checked) {
                                                                    setSelectedLanguages([...selectedLanguages, lang])
                                                                } else {
                                                                    setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
                                                                }
                                                            }}
                                                        />
                                                        <span style={{ textTransform: 'uppercase' }}>{lang}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ marginTop: 12 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isProfPolyvalent} 
                                                    onChange={e => setIsProfPolyvalent(e.target.checked)}
                                                />
                                                <span style={{ fontSize: '0.9rem' }}>Prof Polyvalent</span>
                                            </label>
                                        </div>

                                        <button 
                                            className="btn" 
                                            onClick={assignTeacherToClass} 
                                            disabled={selectedClasses.length === 0} 
                                            style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                        >
                                            <Plus size={16} /> Assigner {selectedClasses.length > 0 ? `(${selectedClasses.length})` : ''}
                                        </button>
                                    </div>
                                </div>

                                {/* Right: Current Assignments */}
                                <div>
                                    <h4 style={{ marginBottom: 12, fontSize: '0.9rem', color: '#666' }}>Assignations actuelles</h4>
                                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                        {currentTeacherAssignments.length === 0 ? (
                                            <div className="note">Aucune assignation pour cet enseignant</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {currentTeacherAssignments.map(ta => (
                                                    <div key={ta._id} style={{ 
                                                        padding: 10, 
                                                        background: 'white', 
                                                        border: '1px solid #eee', 
                                                        borderRadius: 6,
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <div>
                                                            <div style={{ fontWeight: 500 }}>{ta.className}</div>
                                                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                                                {ta.isProfPolyvalent ? (
                                                                    <span style={{ fontSize: '0.7rem', background: '#fff7e6', padding: '2px 6px', borderRadius: 4, color: '#fa8c16' }}>
                                                                        Polyvalent
                                                                    </span>
                                                                ) : (
                                                                    ta.languages && ta.languages.length > 0 ? (
                                                                        <span style={{ fontSize: '0.7rem', background: '#e6f7ff', padding: '2px 6px', borderRadius: 4, color: '#1890ff' }}>
                                                                            {ta.languages.join(', ').toUpperCase()}
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.7rem', color: '#999' }}>Toutes langues</span>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => removeAssignment(ta._id)}
                                                            style={{ 
                                                                background: 'none', 
                                                                border: 'none', 
                                                                color: '#ff4d4f', 
                                                                cursor: 'pointer',
                                                                padding: 4,
                                                                borderRadius: 4,
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Supprimer"
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
                </div>

                {/* SubAdmin to Level */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#fff0f6', padding: 8, borderRadius: 8 }}>👔</div>
                        <h3 style={{ margin: 0 }}>Sous-admin → Niveau</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Sous-administrateur</label>
                            <select value={selectedSubAdminForLevel} onChange={e => setSelectedSubAdminForLevel(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner sous-admin</option>
                                {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Niveau</label>
                            <select value={selectedLevelForSubAdmin} onChange={e => setSelectedLevelForSubAdmin(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignSubAdminToLevel} disabled={!selectedSubAdminForLevel || !selectedLevelForSubAdmin} style={{ marginTop: 8 }}>Assigner à tous les enseignants</button>
                        
                        {renderSubAdminLevelSummary()}
                    </div>
                </div>

                {/* AEFE to Level */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#fff7e6', padding: 8, borderRadius: 8 }}>🌍</div>
                        <h3 style={{ margin: 0 }}>AEFE → Niveau</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Utilisateur AEFE</label>
                            <select value={selectedAefeForLevel} onChange={e => setSelectedAefeForLevel(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner AEFE</option>
                                {aefeUsers.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Niveau</label>
                            <select value={selectedLevelForAefe} onChange={e => setSelectedLevelForAefe(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignAefeToLevel} disabled={!selectedAefeForLevel || !selectedLevelForAefe} style={{ marginTop: 8 }}>Assigner à tous les enseignants</button>
                        
                        {renderAefeLevelSummary()}
                    </div>
                </div>

                {/* Template to Level */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f6ffed', padding: 8, borderRadius: 8 }}>🎓</div>
                        <h3 style={{ margin: 0 }}>Carnet → Niveau</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Carnet</label>
                            <select value={selectedTemplateForLevel} onChange={e => setSelectedTemplateForLevel(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Niveau</label>
                            <select value={selectedLevelForTemplate} onChange={e => setSelectedLevelForTemplate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner niveau</option>
                                {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTemplateToLevel} disabled={!selectedTemplateForLevel || !selectedLevelForTemplate} style={{ marginTop: 8 }}>Assigner à tous les élèves</button>
                        
                        {renderTemplateLevelSummary()}
                    </div>
                </div>

            </div>
            
            <div style={{ marginTop: 32 }}>
                <Link to="/admin" className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span>←</span> Retour au tableau de bord
                </Link>
            </div>

            {showImportModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 600, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0 }}>Importer les assignations</h3>
                            <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        
                        <div style={{ marginBottom: 16 }}>
                            <label className="note">Depuis l'année scolaire</label>
                            <select 
                                value={importFromYearId} 
                                onChange={e => fetchImportableAssignments(e.target.value)}
                                style={{ width: '100%', padding: 8, marginTop: 4, borderRadius: 4, border: '1px solid #ddd' }}
                            >
                                {years.filter(y => y._id !== activeYearId).map(y => (
                                    <option key={y._id} value={y._id}>{y.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', marginBottom: 16, borderRadius: 4 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                                    <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                                        <th style={{ padding: 8, width: 30 }}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedImportIndices.size === availableImports.length && availableImports.length > 0}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedImportIndices(new Set(availableImports.map((_, i) => i)))
                                                    } else {
                                                        setSelectedImportIndices(new Set())
                                                    }
                                                }}
                                            />
                                        </th>
                                        <th style={{ padding: 8 }}>Enseignant</th>
                                        <th style={{ padding: 8 }}>Classe</th>
                                        <th style={{ padding: 8 }}>Langues</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {availableImports.length === 0 ? (
                                        <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#999' }}>Aucune assignation trouvée</td></tr>
                                    ) : availableImports.map((ta, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: 8 }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedImportIndices.has(idx)}
                                                    onChange={e => {
                                                        const newSet = new Set(selectedImportIndices)
                                                        if (e.target.checked) newSet.add(idx)
                                                        else newSet.delete(idx)
                                                        setSelectedImportIndices(newSet)
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: 8 }}>{ta.teacherName}</td>
                                            <td style={{ padding: 8 }}>{ta.className}</td>
                                            <td style={{ padding: 8 }}>{ta.languages?.join(', ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button className="btn secondary" onClick={() => setShowImportModal(false)}>Annuler</button>
                            <button className="btn" onClick={executeImport} disabled={selectedImportIndices.size === 0}>
                                Importer ({selectedImportIndices.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
