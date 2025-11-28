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
        <div style={{ padding: 24 }}>
            <div className="card">
                <h2 className="title">Gestion des assignations</h2>
                <div className="note">Gérez les assignations des enseignants, carnets et sous-administrateurs</div>
                
                <div style={{ marginTop: 16, marginBottom: 16 }}>
                    <Link to="/admin/assignment-list" className="btn secondary">Voir toutes les assignations</Link>
                </div>

                {message && <div className="note" style={{ marginTop: 12, padding: 12, background: message.includes('✓') ? '#e8f5e9' : '#ffebee', borderRadius: 8 }}>{message}</div>}

                <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
                    {/* Teacher to Class Assignment */}
                    <div className="card">
                        <h3>Assigner un enseignant à une classe</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12 }}>
                            <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner enseignant</option>
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName} ({t.email})</option>)}
                            </select>
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner classe</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                            <button className="btn" onClick={assignTeacherToClass} disabled={!selectedTeacher || !selectedClass}>Assigner</button>
                        </div>
                    </div>

                    {/* Template to Student Assignment */}
                    <div className="card">
                        <h3>Assigner un carnet à un élève</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner élève</option>
                                {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                            </select>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <div className="note" style={{ marginBottom: 8 }}>Enseignants assignés (maintenir Ctrl pour sélection multiple):</div>
                            <select
                                multiple
                                value={selectedTeacherForTemplate}
                                onChange={e => setSelectedTeacherForTemplate(Array.from(e.target.selectedOptions, opt => opt.value))}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', minHeight: 100 }}
                            >
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTemplateToStudent} disabled={!selectedTemplate || !selectedStudent} style={{ marginTop: 12 }}>Assigner</button>
                    </div>

                    {/* Template to Class Assignment (Bulk) */}
                    <div className="card" style={{ background: '#f0f9ff' }}>
                        <h3>Assigner un carnet à toute une classe</h3>
                        <div className="note" style={{ marginBottom: 12 }}>Cette action assignera le carnet à tous les élèves de la classe sélectionnée</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                            <select value={selectedTemplateForBulk} onChange={e => setSelectedTemplateForBulk(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner carnet</option>
                                {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                            <select value={selectedClassForBulk} onChange={e => setSelectedClassForBulk(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner classe</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <div className="note" style={{ marginBottom: 8 }}>Enseignants assignés (maintenir Ctrl pour sélection multiple):</div>
                            <select
                                multiple
                                value={selectedTeachersForBulk}
                                onChange={e => setSelectedTeachersForBulk(Array.from(e.target.selectedOptions, opt => opt.value))}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', minHeight: 100 }}
                            >
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName}</option>)}
                            </select>
                        </div>
                        <button className="btn" onClick={assignTemplateToClass} disabled={!selectedTemplateForBulk || !selectedClassForBulk} style={{ marginTop: 12 }}>Assigner à toute la classe</button>
                    </div>

                    {/* Teacher to SubAdmin Assignment */}
                    <div className="card">
                        <h3>Assigner un enseignant à un sous-administrateur</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12 }}>
                            <select value={selectedSubAdmin} onChange={e => setSelectedSubAdmin(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner sous-admin</option>
                                {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                            </select>
                            <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
                                <option value="">Sélectionner enseignant</option>
                                {teachers.map(t => <option key={t._id} value={t._id}>{t.displayName} ({t.email})</option>)}
                            </select>
                            <button className="btn" onClick={assignTeacherToSubAdmin} disabled={!selectedSubAdmin || !selectedTeacher}>Assigner</button>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 24 }}>
                    <Link to="/admin" className="btn secondary">← Retour au tableau de bord</Link>
                </div>
            </div>
        </div>
    )
}
