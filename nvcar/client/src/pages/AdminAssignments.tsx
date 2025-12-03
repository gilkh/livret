import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
    const { activeYearId } = useSchoolYear()
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
    const [selectedClass, setSelectedClass] = useState('')
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

    const loadData = async () => {
        if (!activeYearId) return
        try {
            const [usersRes, classesRes, studentsRes, templatesRes, taRes, saRes, tplRes, salRes] = await Promise.all([
                api.get('/users'),
                api.get(`/classes?schoolYearId=${activeYearId}`),
                api.get('/students'),
                api.get('/templates'),
                api.get('/teacher-assignments'),
                api.get('/subadmin-assignments'),
                api.get('/template-assignments'),
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
        try {
            await api.post('/teacher-assignments', { 
                teacherId: selectedTeacher, 
                classId: selectedClass,
                languages: selectedLanguages,
                isProfPolyvalent
            })
            setMessage('✓ Enseignant assigné à la classe')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        }
    }

    const assignSubAdminToLevel = async () => {
        try {
            const res = await api.post('/subadmin-assignments/bulk-level', {
                subAdminId: selectedSubAdminForLevel,
                level: selectedLevelForSubAdmin,
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
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        }
    }

    const renderTeacherClassSummary = () => {
        if (teacherAssignments.length === 0) return <div className="note" style={{ marginTop: 16 }}>Aucune assignation</div>
        return (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 16, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.8rem' }}>Déjà assigné :</div>
                {teacherAssignments.map(ta => (
                    <div key={ta._id} style={{ fontSize: '0.85rem', color: '#666', padding: '2px 0', display: 'flex', alignItems: 'center' }}>
                        <span>{ta.teacherName} → {ta.className}</span>
                        {ta.languages && ta.languages.length > 0 ? (
                            <span style={{ marginLeft: 8, fontSize: '0.75rem', background: '#e6f7ff', padding: '1px 4px', borderRadius: 4, color: '#1890ff' }}>
                                {ta.languages.join(', ').toUpperCase()}
                            </span>
                        ) : (
                            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#999' }}>(Toutes)</span>
                        )}
                        {ta.isProfPolyvalent && (
                            <span style={{ marginLeft: 8, fontSize: '0.75rem', background: '#fff7e6', padding: '1px 4px', borderRadius: 4, color: '#fa8c16' }}>
                                Polyvalent
                            </span>
                        )}
                    </div>
                ))}
            </div>
        )
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
                        {sa.subAdminName} → {sa.levels.sort().join(', ')}
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
                        {sa.subAdminName} → {sa.levels.sort().join(', ')}
                    </div>
                ))}
            </div>
        )
    }

    const renderTemplateLevelSummary = () => {
        const summary = new Map<string, Set<string>>()

        templateAssignments.forEach(ta => {
            const templateName = ta.templateName || 'Unknown'
            if (!summary.has(templateName)) summary.set(templateName, new Set())
            
            if (ta.classId) {
                const cls = classes.find(c => c._id === ta.classId)
                if (cls && cls.level) {
                    summary.get(templateName)?.add(cls.level)
                }
            }
        })

        if (summary.size === 0) return <div className="note" style={{ marginTop: 16 }}>Aucune assignation</div>

        return (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 16, background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.8rem' }}>Déjà assigné :</div>
                {Array.from(summary.entries()).map(([name, levels]) => (
                    <div key={name} style={{ fontSize: '0.85rem', color: '#666', padding: '2px 0' }}>
                        {name} → {Array.from(levels).sort().join(', ') || 'Aucun niveau'}
                    </div>
                ))}
            </div>
        )
    }

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
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8 }}>👨‍🏫</div>
                        <h3 style={{ margin: 0 }}>Enseignant → Classe</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Enseignant</label>
                            <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner enseignant</option>
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName} ({t.email})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Classe</label>
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner classe</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Langues autorisées</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {['fr', 'ar', 'en'].map(lang => (
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
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Options</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={isProfPolyvalent} 
                                    onChange={e => setIsProfPolyvalent(e.target.checked)}
                                />
                                <span>Prof Polyvalent (peut modifier les menus déroulants)</span>
                            </label>
                        </div>
                        <button className="btn" onClick={assignTeacherToClass} disabled={!selectedTeacher || !selectedClass} style={{ marginTop: 8 }}>Assigner</button>
                        
                        {renderTeacherClassSummary()}
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
        </div>
    )
}
