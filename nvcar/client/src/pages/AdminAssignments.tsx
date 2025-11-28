import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type User = { _id: string; email: string; displayName: string; role: string }
type Class = { _id: string; name: string }
type Student = { _id: string; firstName: string; lastName: string }
type Template = { _id: string; name: string }

export default function AdminAssignments() {
    const [teachers, setTeachers] = useState<User[]>([])
    const [subAdmins, setSubAdmins] = useState<User[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [templates, setTemplates] = useState<Template[]>([])

    const [selectedTeacher, setSelectedTeacher] = useState('')
    const [selectedClass, setSelectedClass] = useState('')
    const [selectedStudent, setSelectedStudent] = useState('')
    const [selectedTemplate, setSelectedTemplate] = useState('')
    const [selectedSubAdmin, setSelectedSubAdmin] = useState('')
    const [selectedTeacherForTemplate, setSelectedTeacherForTemplate] = useState<string[]>([])
    
    // Bulk assignment states
    const [selectedClassForBulk, setSelectedClassForBulk] = useState('')
    const [selectedTemplateForBulk, setSelectedTemplateForBulk] = useState('')
    const [selectedTeachersForBulk, setSelectedTeachersForBulk] = useState<string[]>([])

    const [message, setMessage] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                const [usersRes, classesRes, studentsRes, templatesRes] = await Promise.all([
                    api.get('/users'),
                    api.get('/classes'),
                    api.get('/students'),
                    api.get('/templates'),
                ])

                const allUsers = usersRes.data
                setTeachers(allUsers.filter((u: User) => u.role === 'TEACHER'))
                setSubAdmins(allUsers.filter((u: User) => u.role === 'SUBADMIN'))
                setClasses(classesRes.data)
                setStudents(studentsRes.data)
                setTemplates(templatesRes.data)
            } catch (e) {
                console.error('Failed to load data', e)
            }
        }
        loadData()
    }, [])

    const assignTeacherToClass = async () => {
        try {
            await api.post('/teacher-assignments', { teacherId: selectedTeacher, classId: selectedClass })
            setMessage('✓ Enseignant assigné à la classe')
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        }
    }

    const assignTemplateToStudent = async () => {
        try {
            await api.post('/template-assignments', {
                templateId: selectedTemplate,
                studentId: selectedStudent,
                assignedTeachers: selectedTeacherForTemplate,
            })
            setMessage('✓ Carnet assigné à l\'élève')
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        }
    }

    const assignTeacherToSubAdmin = async () => {
        try {
            await api.post('/subadmin-assignments', {
                subAdminId: selectedSubAdmin,
                teacherId: selectedTeacher,
            })
            setMessage('✓ Enseignant assigné au sous-administrateur')
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        }
    }

    const assignTemplateToClass = async () => {
        try {
            if (!selectedTemplateForBulk || !selectedClassForBulk) return
            
            // Get all students in the class
            const studentsRes = await api.get(`/students/by-class/${selectedClassForBulk}`)
            const classStudents = studentsRes.data
            
            if (classStudents.length === 0) {
                setMessage('✗ Aucun élève dans cette classe')
                return
            }
            
            // Create assignments for all students
            const promises = classStudents.map((student: Student) =>
                api.post('/template-assignments', {
                    templateId: selectedTemplateForBulk,
                    studentId: student._id,
                    assignedTeachers: selectedTeachersForBulk,
                })
            )
            
            await Promise.all(promises)
            setMessage(`✓ Carnet assigné à ${classStudents.length} élève(s) de la classe`)
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
            console.error(e)
        }
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
                        <button className="btn" onClick={assignTeacherToClass} disabled={!selectedTeacher || !selectedClass} style={{ marginTop: 8 }}>Assigner</button>
                    </div>
                </div>

                {/* Teacher to SubAdmin */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#fff0f6', padding: 8, borderRadius: 8 }}>👔</div>
                        <h3 style={{ margin: 0 }}>Enseignant → Sous-admin</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Sous-administrateur</label>
                            <select value={selectedSubAdmin} onChange={e => setSelectedSubAdmin(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner sous-admin</option>
                                {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Enseignant</label>
                            <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner enseignant</option>
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName} ({t.email})</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTeacherToSubAdmin} disabled={!selectedSubAdmin || !selectedTeacher} style={{ marginTop: 8 }}>Assigner</button>
                    </div>
                </div>

                {/* Template to Student */}
                <div className="card" style={{ gridRow: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f6ffed', padding: 8, borderRadius: 8 }}>🎓</div>
                        <h3 style={{ margin: 0 }}>Carnet → Élève</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Carnet</label>
                            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Élève</label>
                            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner élève</option>
                                {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6 }}>Enseignants assignés (Ctrl+Click)</label>
                            <select
                                multiple
                                value={selectedTeacherForTemplate}
                                onChange={e => setSelectedTeacherForTemplate(Array.from(e.target.selectedOptions, opt => opt.value))}
                                style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd', width: '100%', minHeight: 120 }}
                            >
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTemplateToStudent} disabled={!selectedTemplate || !selectedStudent} style={{ marginTop: 8 }}>Assigner</button>
                    </div>
                </div>

                {/* Bulk Assignment */}
                <div className="card" style={{ gridRow: 'span 2', background: 'linear-gradient(to bottom right, #f0f9ff, #e6f7ff)', border: '1px solid #bae7ff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#1890ff', padding: 8, borderRadius: 8, color: 'white' }}>⚡</div>
                        <div>
                            <h3 style={{ margin: 0, color: '#0050b3' }}>Assignation de masse</h3>
                            <div className="note" style={{ color: '#0050b3', opacity: 0.7 }}>Assigner à toute une classe</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6, color: '#0050b3' }}>Carnet</label>
                            <select value={selectedTemplateForBulk} onChange={e => setSelectedTemplateForBulk(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #91d5ff' }}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6, color: '#0050b3' }}>Classe</label>
                            <select value={selectedClassForBulk} onChange={e => setSelectedClassForBulk(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #91d5ff' }}>
                                <option value="">Sélectionner classe</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="note" style={{ display: 'block', marginBottom: 6, color: '#0050b3' }}>Enseignants assignés (Ctrl+Click)</label>
                            <select
                                multiple
                                value={selectedTeachersForBulk}
                                onChange={e => setSelectedTeachersForBulk(Array.from(e.target.selectedOptions, opt => opt.value))}
                                style={{ padding: 10, borderRadius: 8, border: '1px solid #91d5ff', width: '100%', minHeight: 120 }}
                            >
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTemplateToClass} disabled={!selectedTemplateForBulk || !selectedClassForBulk} style={{ marginTop: 8, background: '#0050b3' }}>Assigner à toute la classe</button>
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
