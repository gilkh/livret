import { useState, useEffect } from 'react'
import api from '../api'
import Modal from '../components/Modal'
import Toast from '../components/Toast'

type Student = {
    _id: string
    firstName: string
    lastName: string
    level: string
    classId?: string
    className?: string
}

type ClassInfo = {
    _id: string
    name: string
    level: string
}

type LevelGroup = {
    level: string
    classes: ClassInfo[]
    unassignedStudents: Student[]
    studentsByClass: Record<string, Student[]>
}

export default function SubAdminStudents() {
    const [students, setStudents] = useState<Student[]>([])
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
    
    // Modal state
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const [targetClassId, setTargetClassId] = useState('')
    const [studentSearch, setStudentSearch] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            const [studentsRes, classesRes] = await Promise.all([
                api.get('/subadmin/students'),
                api.get('/subadmin/classes')
            ])
            setStudents(studentsRes.data)
            setClasses(classesRes.data)
        } catch (e) {
            console.error(e)
            setMessage({ type: 'error', text: 'Erreur lors du chargement des données' })
        } finally {
            setLoading(false)
        }
    }

    const handleAssign = async () => {
        if (!selectedStudent || !targetClassId) return

        try {
            await api.post('/subadmin/assign-student', {
                studentId: selectedStudent._id,
                classId: targetClassId
            })
            setMessage({ type: 'success', text: 'Élève assigné avec succès' })
            setShowAssignModal(false)
            setSelectedStudent(null)
            setTargetClassId('')
            loadData()
        } catch (e) {
            console.error(e)
            setMessage({ type: 'error', text: 'Erreur lors de l\'assignation' })
        }
    }

    const openAssignModal = (student: Student) => {
        setSelectedStudent(student)
        setTargetClassId(student.classId || '')
        setShowAssignModal(true)
    }

    const openAddModal = (classId: string) => {
        setTargetClassId(classId)
        setStudentSearch('')
        setSelectedStudent(null)
        setShowAddModal(true)
    }

    const handleAddStudent = async () => {
        if (!selectedStudent || !targetClassId) return
        
        try {
            await api.post('/subadmin/assign-student', {
                studentId: selectedStudent._id,
                classId: targetClassId
            })
            setMessage({ type: 'success', text: 'Élève ajouté à la classe avec succès' })
            setShowAddModal(false)
            setSelectedStudent(null)
            setTargetClassId('')
            loadData()
        } catch (e) {
            console.error(e)
            setMessage({ type: 'error', text: 'Erreur lors de l\'ajout' })
        }
    }

    // Group data
    const groupedData: LevelGroup[] = []
    
    // Get all unique levels from classes and students
    const levels = new Set<string>()
    classes.forEach(c => levels.add(c.level))
    students.forEach(s => { if (s.level) levels.add(s.level) })
    
    const sortedLevels = Array.from(levels).sort()

    sortedLevels.forEach(level => {
        const levelClasses = classes.filter(c => c.level === level)
        const levelStudents = students.filter(s => s.level === level)
        
        const studentsByClass: Record<string, Student[]> = {}
        levelClasses.forEach(c => {
            studentsByClass[c._id] = levelStudents.filter(s => s.classId === c._id)
        })

        const unassignedStudents = levelStudents.filter(s => !s.classId)

        groupedData.push({
            level,
            classes: levelClasses,
            unassignedStudents,
            studentsByClass
        })
    })

    const filteredStudents = (list: Student[]) => {
        if (!search) return list
        const lowerSearch = search.toLowerCase()
        return list.filter(s => 
            s.firstName.toLowerCase().includes(lowerSearch) || 
            s.lastName.toLowerCase().includes(lowerSearch)
        )
    }

    return (
        <div className="container">
            <div className="card">
                <h2 className="title">Gestion des Élèves</h2>
                
                {message && (
                    <Toast 
                        message={message.text}
                        type={message.type}
                        onClose={() => setMessage(null)}
                    />
                )}

                <div style={{ marginBottom: 20 }}>
                    <input 
                        placeholder="Rechercher un élève..." 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} 
                    />
                </div>

                {loading ? (
                    <div>Chargement...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                        {groupedData.map(group => (
                            <div key={group.level} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#f8fafc' }}>
                                <h3 style={{ fontSize: '1.2rem', color: '#334155', marginBottom: 15, borderBottom: '2px solid #cbd5e1', paddingBottom: 5 }}>
                                    Niveau {group.level}
                                </h3>

                                {/* Unassigned Students */}
                                {filteredStudents(group.unassignedStudents).length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ fontSize: '1rem', color: '#64748b', marginBottom: 10 }}>⚠️ Élèves non assignés</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                                            {filteredStudents(group.unassignedStudents).map(s => (
                                                <div key={s._id} style={{ background: 'white', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</span>
                                                    <button 
                                                        onClick={() => openAssignModal(s)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '1.2rem' }}
                                                        title="Assigner à une classe"
                                                    >
                                                        ➜
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Classes */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                                    {group.classes.map(cls => (
                                        <div key={cls._id} style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                            <div style={{ padding: '10px 15px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{cls.name}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontSize: '0.8em', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                                                        {filteredStudents(group.studentsByClass[cls._id] || []).length} élèves
                                                    </span>
                                                    <button 
                                                        onClick={() => openAddModal(cls._id)}
                                                        style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                                                        title="Ajouter un élève"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ padding: 10, maxHeight: 300, overflowY: 'auto' }}>
                                                {filteredStudents(group.studentsByClass[cls._id] || []).length === 0 ? (
                                                    <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9em', textAlign: 'center', padding: 10 }}>Aucun élève</div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                        {filteredStudents(group.studentsByClass[cls._id] || []).map(s => (
                                                            <div key={s._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                                                <span style={{ fontSize: '0.95em' }}>{s.firstName} {s.lastName}</span>
                                                                <button 
                                                                    onClick={() => openAssignModal(s)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}
                                                                    title="Changer de classe"
                                                                >
                                                                    ✎
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Assign Modal */}
            <Modal
                isOpen={showAssignModal && !!selectedStudent}
                onClose={() => setShowAssignModal(false)}
                title={selectedStudent ? `Assigner ${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Assigner'}
                width={400}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button 
                            className="btn secondary" 
                            onClick={() => setShowAssignModal(false)}
                            style={{ background: '#f1f5f9', color: '#475569' }}
                        >
                            Annuler
                        </button>
                        <button 
                            className="btn" 
                            onClick={handleAssign}
                            disabled={!targetClassId || (selectedStudent && targetClassId === selectedStudent.classId)}
                        >
                            Enregistrer
                        </button>
                    </div>
                }
            >
                {selectedStudent && (
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Choisir une classe</label>
                        <select 
                            value={targetClassId} 
                            onChange={e => setTargetClassId(e.target.value)}
                            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #cbd5e1' }}
                        >
                            <option value="">Sélectionner...</option>
                            {classes
                                .filter(c => c.level === selectedStudent.level)
                                .sort((a, b) => a.level.localeCompare(b.level))
                                .map(c => (
                                    <option key={c._id} value={c._id}>
                                        {c.name} ({c.level})
                                    </option>
                                ))
                            }
                        </select>
                        <div style={{ marginTop: 5, fontSize: '0.85em', color: '#64748b' }}>
                            Note: Changer de niveau mettra à jour le niveau de l'élève.
                        </div>
                    </div>
                )}
            </Modal>

            {/* Add Student Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Ajouter un élève à la classe"
                width={500}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button 
                            className="btn secondary" 
                            onClick={() => setShowAddModal(false)}
                            style={{ background: '#f1f5f9', color: '#475569' }}
                        >
                            Annuler
                        </button>
                        <button 
                            className="btn" 
                            onClick={handleAddStudent}
                            disabled={!selectedStudent}
                        >
                            Ajouter
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                     <div style={{ marginBottom: 15 }}>
                        <input 
                            placeholder="Rechercher un élève (nom, prénom)..." 
                            value={studentSearch} 
                            onChange={e => setStudentSearch(e.target.value)} 
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} 
                            autoFocus
                        />
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, marginBottom: 15 }}>
                        {students
                            .filter(s => 
                                s.classId !== targetClassId && 
                                (s.firstName.toLowerCase().includes(studentSearch.toLowerCase()) || 
                                 s.lastName.toLowerCase().includes(studentSearch.toLowerCase()))
                            )
                            .slice(0, 20)
                            .map(s => (
                                <div 
                                    key={s._id}
                                    onClick={() => setSelectedStudent(s)}
                                    style={{ 
                                        padding: 10, 
                                        borderBottom: '1px solid #eee', 
                                        cursor: 'pointer',
                                        background: selectedStudent?._id === s._id ? '#f0f9ff' : 'white',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</div>
                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                            {s.className ? `Actuellement en ${s.className}` : 'Non assigné'} ({s.level})
                                        </div>
                                    </div>
                                    {selectedStudent?._id === s._id && <span style={{ color: '#0ea5e9' }}>✓</span>}
                                </div>
                            ))
                        }
                        {students.filter(s => s.classId !== targetClassId && (s.firstName.toLowerCase().includes(studentSearch.toLowerCase()) || s.lastName.toLowerCase().includes(studentSearch.toLowerCase()))).length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun élève trouvé</div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    )
}
