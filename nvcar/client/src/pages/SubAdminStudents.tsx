import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import { Users, GraduationCap, BookOpen, AlertTriangle, Search, X, ChevronDown, Plus, Edit2, UserPlus, User, Info } from 'lucide-react'
import './SubAdminStudents.css'

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
    const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})

    // Modal state
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const [targetClassId, setTargetClassId] = useState('')
    const [newStudentFirstName, setNewStudentFirstName] = useState('')
    const [newStudentLastName, setNewStudentLastName] = useState('')

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

            // Auto-expand all levels by default
            const levels = new Set<string>()
            classesRes.data.forEach((c: ClassInfo) => levels.add(c.level))
            studentsRes.data.forEach((s: Student) => { if (s.level) levels.add(s.level) })
            const expanded: Record<string, boolean> = {}
            levels.forEach(l => expanded[l] = true)
            setExpandedLevels(expanded)
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
        setNewStudentFirstName('')
        setNewStudentLastName('')
        setSelectedStudent(null)
        setShowAddModal(true)
    }

    const handleAddStudent = async () => {
        if (!targetClassId || !newStudentFirstName.trim() || !newStudentLastName.trim()) return

        try {
            await api.post('/students', {
                firstName: newStudentFirstName.trim(),
                lastName: newStudentLastName.trim(),
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

    const toggleLevel = (level: string) => {
        setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }))
    }

    // Group data
    const groupedData: LevelGroup[] = useMemo(() => {
        const data: LevelGroup[] = []

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

            data.push({
                level,
                classes: levelClasses,
                unassignedStudents,
                studentsByClass
            })
        })

        return data
    }, [students, classes])

    const filteredStudents = (list: Student[]) => {
        if (!search) return list
        const lowerSearch = search.toLowerCase()
        return list.filter(s =>
            s.firstName.toLowerCase().includes(lowerSearch) ||
            s.lastName.toLowerCase().includes(lowerSearch)
        )
    }

    // Stats
    const totalStudents = students.length
    const totalClasses = classes.length
    const unassignedCount = groupedData.reduce((sum, g) => sum + g.unassignedStudents.length, 0)
    const levelsCount = groupedData.length

    const getInitials = (firstName: string, lastName: string) => {
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
    }

    const getClassStudentCount = (studentsByClass: Record<string, Student[]>) => {
        return Object.values(studentsByClass).reduce((sum, arr) => sum + arr.length, 0)
    }

    return (
        <div className="students-page">
            <div className="container">
                {message && (
                    <Toast
                        message={message.text}
                        type={message.type}
                        onClose={() => setMessage(null)}
                    />
                )}

                {/* Header Section */}
                <div className="students-header">
                    <div className="students-header-left">
                        <h1>
                            <span className="header-icon">
                                <GraduationCap size={26} />
                            </span>
                            Gestion des Élèves
                        </h1>
                        <p>Gérez et organisez les élèves par niveau et par classe</p>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="students-stats-grid">
                    <div className="stat-card purple">
                        <div className="stat-card-icon">
                            <Users size={24} />
                        </div>
                        <div className="stat-card-value">{totalStudents}</div>
                        <div className="stat-card-label">Nombre total d'élèves</div>
                    </div>
                    <div className="stat-card blue">
                        <div className="stat-card-icon">
                            <BookOpen size={24} />
                        </div>
                        <div className="stat-card-value">{totalClasses}</div>
                        <div className="stat-card-label">Classes actives</div>
                    </div>
                    <div className="stat-card green">
                        <div className="stat-card-icon">
                            <GraduationCap size={24} />
                        </div>
                        <div className="stat-card-value">{levelsCount}</div>
                        <div className="stat-card-label">Niveaux scolaires</div>
                    </div>
                    {unassignedCount > 0 && (
                        <div className="stat-card amber">
                            <div className="stat-card-icon">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="stat-card-value">{unassignedCount}</div>
                            <div className="stat-card-label">Non assignés</div>
                        </div>
                    )}
                </div>

                {/* Search Bar */}
                <div className="students-search-bar">
                    <Search size={20} className="search-icon" />
                    <input
                        placeholder="Rechercher un élève par nom ou prénom..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="clear-btn" onClick={() => setSearch('')} title="Effacer">
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Loading State */}
                {loading ? (
                    <div className="students-loading">
                        <div className="loading-spinner" />
                        <p>Chargement des élèves...</p>
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="students-empty">
                        <div className="empty-icon">
                            <Users size={36} />
                        </div>
                        <h3>Aucun élève trouvé</h3>
                        <p>Commencez par ajouter des élèves à votre établissement</p>
                    </div>
                ) : (
                    /* Level Groups */
                    <div>
                        {groupedData.map(group => {
                            const isExpanded = expandedLevels[group.level] !== false
                            const totalInLevel = getClassStudentCount(group.studentsByClass) + group.unassignedStudents.length
                            const filteredUnassigned = filteredStudents(group.unassignedStudents)

                            return (
                                <div key={group.level} className={`level-group ${isExpanded ? 'expanded' : ''}`}>
                                    <div className="level-header" onClick={() => toggleLevel(group.level)}>
                                        <div className="level-header-left">
                                            <div className="level-badge">{group.level}</div>
                                            <div className="level-info">
                                                <h3>Niveau {group.level}</h3>
                                                <p>{group.classes.length} classe{group.classes.length > 1 ? 's' : ''} • {totalInLevel} élève{totalInLevel > 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <div className="level-header-right">
                                            {group.unassignedStudents.length > 0 && (
                                                <span className="level-count-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                                                    <AlertTriangle size={14} />
                                                    {group.unassignedStudents.length} non assigné{group.unassignedStudents.length > 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <div className="expand-icon">
                                                <ChevronDown size={18} />
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="level-content">
                                            {/* Unassigned Students Warning */}
                                            {filteredUnassigned.length > 0 && (
                                                <div className="unassigned-section">
                                                    <div className="unassigned-header">
                                                        <div className="warning-icon">
                                                            <AlertTriangle size={20} />
                                                        </div>
                                                        <h4>Élèves non assignés à une classe</h4>
                                                    </div>
                                                    <div className="unassigned-list">
                                                        {filteredUnassigned.map(s => (
                                                            <div key={s._id} className="unassigned-student-card">
                                                                <div className="student-info">
                                                                    <div className="student-avatar-placeholder">
                                                                        {getInitials(s.firstName, s.lastName)}
                                                                    </div>
                                                                    <span className="student-name">{s.firstName} {s.lastName}</span>
                                                                </div>
                                                                <button
                                                                    className="assign-btn"
                                                                    onClick={() => openAssignModal(s)}
                                                                    title="Assigner à une classe"
                                                                >
                                                                    <UserPlus size={18} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Classes Grid */}
                                            <div className="classes-grid">
                                                {group.classes.map(cls => {
                                                    const classStudents = filteredStudents(group.studentsByClass[cls._id] || [])

                                                    return (
                                                        <div key={cls._id} className="class-card">
                                                            <div className="class-card-header">
                                                                <div className="class-card-header-left">
                                                                    <div className="class-icon">
                                                                        <BookOpen size={20} />
                                                                    </div>
                                                                    <h4 className="class-name">{cls.name}</h4>
                                                                </div>
                                                                <div className="class-card-header-right">
                                                                    <span className="student-count-chip">
                                                                        <Users size={14} />
                                                                        {classStudents.length} élève{classStudents.length !== 1 ? 's' : ''}
                                                                    </span>
                                                                    <button
                                                                        className="add-student-btn"
                                                                        onClick={() => openAddModal(cls._id)}
                                                                        title="Ajouter un élève"
                                                                    >
                                                                        <Plus size={18} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="class-card-body">
                                                                {classStudents.length === 0 ? (
                                                                    <div className="empty-class-placeholder">
                                                                        <div className="empty-icon">
                                                                            <User size={24} />
                                                                        </div>
                                                                        <p>Aucun élève dans cette classe</p>
                                                                    </div>
                                                                ) : (
                                                                    classStudents.map(s => (
                                                                        <div key={s._id} className="student-row">
                                                                            <div className="student-info">
                                                                                <div className="student-avatar">
                                                                                    {getInitials(s.firstName, s.lastName)}
                                                                                </div>
                                                                                <span className="student-name">{s.firstName} {s.lastName}</span>
                                                                            </div>
                                                                            <button
                                                                                className="edit-btn"
                                                                                onClick={() => openAssignModal(s)}
                                                                                title="Changer de classe"
                                                                            >
                                                                                <Edit2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Assign Modal */}
            <Modal
                isOpen={showAssignModal && !!selectedStudent}
                onClose={() => setShowAssignModal(false)}
                title={selectedStudent ? `Assigner ${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Assigner'}
                width={450}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                        <button
                            className="btn secondary"
                            onClick={() => setShowAssignModal(false)}
                        >
                            Annuler
                        </button>
                        <button
                            className="btn"
                            onClick={handleAssign}
                            disabled={!targetClassId || (selectedStudent?.classId === targetClassId)}
                        >
                            Enregistrer
                        </button>
                    </div>
                }
            >
                <div className="students-modal-content">
                    {selectedStudent && (
                        <div className="modal-field">
                            <label>Choisir une classe</label>
                            <select
                                value={targetClassId}
                                onChange={e => setTargetClassId(e.target.value)}
                            >
                                <option value="">Sélectionner une classe...</option>
                                {classes
                                    .filter(c => c.level === selectedStudent.level)
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(c => (
                                        <option key={c._id} value={c._id}>
                                            {c.name} ({c.level})
                                        </option>
                                    ))
                                }
                            </select>
                        </div>
                    )}
                    <div className="modal-note">
                        <Info size={16} />
                        <span>Changer de classe modifiera l'affectation de l'élève pour l'année en cours.</span>
                    </div>
                </div>
            </Modal>

            {/* Add Student Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Ajouter un nouvel élève"
                width={500}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                        <button
                            className="btn secondary"
                            onClick={() => setShowAddModal(false)}
                        >
                            Annuler
                        </button>
                        <button
                            className="btn"
                            onClick={handleAddStudent}
                            disabled={!newStudentFirstName.trim() || !newStudentLastName.trim() || !targetClassId}
                        >
                            Ajouter l'élève
                        </button>
                    </div>
                }
            >
                <div className="students-modal-content">
                    <div className="modal-field">
                        <label>Prénom</label>
                        <input
                            placeholder="Entrez le prénom de l'élève"
                            value={newStudentFirstName}
                            onChange={e => setNewStudentFirstName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="modal-field">
                        <label>Nom de famille</label>
                        <input
                            placeholder="Entrez le nom de famille"
                            value={newStudentLastName}
                            onChange={e => setNewStudentLastName(e.target.value)}
                        />
                    </div>
                    <div className="modal-note">
                        <Info size={16} />
                        <span>L'élève sera automatiquement ajouté à la classe sélectionnée.</span>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
