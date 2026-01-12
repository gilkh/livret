import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useLevels } from '../context/LevelContext'
import './AdminResources.css'
import Toast, { ToastType } from '../components/Toast'
import {
  Calendar,
  Users,
  GraduationCap,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Download,
  Upload,
  Search,
  Check,
  AlertCircle,
  FileText,
  ChevronRight,
  MoreVertical,
  School,
  Clock,
  ArrowRight
} from 'lucide-react'

type Year = { _id: string; name: string; startDate: string; endDate: string; active: boolean; activeSemester?: number }
type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }
type StudentDoc = {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  parentName?: string;
  parentPhone?: string;
  level?: string;
  promotion?: { from: string; to: string; date: string; year: string }
  previousClassName?: string
}

export default function AdminResources() {
  const navigate = useNavigate()
  const { activeYearId, refetchYears } = useSchoolYear()
  const { levels } = useLevels()
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState<Year | null>(null)
  const [creatingPreviousYear, setCreatingPreviousYear] = useState(false)

  const tripleConfirm = (message: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!confirm(`${message}\n\nConfirmation ${attempt}/3`)) return false
    }
    return true
  }

  // Year editing state
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '', active: true, activeSemester: 1 })

  // Class state
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')

  // Student state
  const [students, setStudents] = useState<StudentDoc[]>([])
  const [unassignedStudents, setUnassignedStudents] = useState<StudentDoc[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [targetClassId, setTargetClassId] = useState('')
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)

  // Search state
  const [studentSearch, setStudentSearch] = useState('')

  // Toast notification
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  const showToast = (message: string, type: ToastType = 'success') => setToast({ message, type })

  const promotedStudents = useMemo(() => {
    return unassignedStudents.filter(s => s.promotion && s.promotion.from !== s.promotion.to)
  }, [unassignedStudents])

  const otherUnassignedStudents = useMemo(() => {
    return unassignedStudents.filter(s => !s.promotion || s.promotion.from === s.promotion.to)
  }, [unassignedStudents])

  const groupedPromotedStudents = useMemo(() => {
    const groups: Record<string, StudentDoc[]> = {}
    for (const s of promotedStudents) {
      const key = `${s.promotion?.from || '?'} → ${s.promotion?.to || '?'} (${s.previousClassName || '?'})`
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return groups
  }, [promotedStudents])

  const groupedOtherStudents = useMemo(() => {
    const groups: Record<string, StudentDoc[]> = {}
    for (const s of otherUnassignedStudents) {
      const key = `${s.level || '?'} (${s.previousClassName || '?'})`
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return groups
  }, [otherUnassignedStudents])

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students
    const lower = studentSearch.toLowerCase()
    return students.filter(s =>
      s.firstName.toLowerCase().includes(lower) ||
      s.lastName.toLowerCase().includes(lower)
    )
  }, [students, studentSearch])

  const loadYears = async () => {
    const r = await api.get('/school-years')
    setYears(r.data.sort((a: Year, b: Year) => a.name.localeCompare(b.name)))
  }
  useEffect(() => { loadYears() }, [])

  const oldestYearId = useMemo(() => {
    if (years.length === 0) return ''
    let oldest = years[0]
    let oldestTime = new Date(oldest.startDate).getTime()
    for (const y of years) {
      const t = new Date(y.startDate).getTime()
      if (!isNaN(t) && (isNaN(oldestTime) || t < oldestTime)) {
        oldest = y
        oldestTime = t
      }
    }
    return oldest._id
  }, [years])

  const loadClasses = async (yearId: string) => {
    const r = await api.get('/classes', { params: { schoolYearId: yearId } })
    setClasses(r.data)
  }
  const loadStudents = async (classId: string) => {
    const r = await api.get(`/students/by-class/${classId}`)
    setStudents(r.data)
  }
  const loadUnassignedStudents = async (yearId: string) => {
    const r = await api.get(`/students/unassigned/${yearId}`)
    setUnassignedStudents(r.data)
  }

  const selectYear = async (y: Year) => {
    setSelectedYear(y)
    setYearForm({
      name: y.name,
      startDate: y.startDate?.slice(0, 10) || '',
      endDate: y.endDate?.slice(0, 10) || '',
      active: !!y.active,
      activeSemester: y.activeSemester || 1
    })
    await loadClasses(y._id)
    await loadUnassignedStudents(y._id)
    setSelectedClassId('')
    setStudents([])
    resetStudentForm()
  }

  const assignSection = async (studentId: string, level: string, section: string) => {
    if (!selectedYear) return
    await api.post(`/students/${studentId}/assign-section`, {
      schoolYearId: selectedYear._id,
      level,
      section
    })
    await loadUnassignedStudents(selectedYear._id)
    await loadClasses(selectedYear._id)
  }

  const addPreviousYear = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (creatingPreviousYear) return

    let startYear = new Date().getFullYear()
    const oldest = years.find(y => y._id === oldestYearId)
    if (oldest) {
      const parts = oldest.name.split('/')
      if (parts.length === 2) {
        const y1 = parseInt(parts[0])
        if (!isNaN(y1)) startYear = y1 - 1
      } else {
        const match = oldest.name.match(/(\d{4})/)
        if (match) {
          startYear = parseInt(match[1]) - 1
        } else {
          const d = new Date(oldest.startDate)
          if (!isNaN(d.getTime())) startYear = d.getFullYear() - 1
        }
      }
    }

    const name = `${startYear}/${startYear + 1}`
    if (years.some(y => y.name === name)) {
      alert("Cette année scolaire existe déjà")
      return
    }

    const startDate = `${startYear}-09-01`
    const endDate = `${startYear + 1}-07-01`

    try {
      setCreatingPreviousYear(true)
      await api.post('/school-years', { name, startDate, endDate, active: false })
      await loadYears()
    } finally {
      setCreatingPreviousYear(false)
    }
  }

  const addNextYear = async () => {
    const sorted = [...years].sort((a, b) => a.name.localeCompare(b.name))
    const last = sorted[sorted.length - 1]
    let startYear = new Date().getFullYear()
    if (last) {
      const parts = last.name.split('/')
      if (parts.length === 2) {
        const y1 = parseInt(parts[0])
        if (!isNaN(y1)) startYear = y1 + 1
      } else {
        const match = last.name.match(/(\d{4})/)
        if (match) startYear = parseInt(match[1]) + 1
      }
    }

    const name = `${startYear}/${startYear + 1}`
    const startDate = `${startYear}-09-01`
    const endDate = `${startYear + 1}-07-01`

    await api.post('/school-years', { name, startDate, endDate, active: false })
    await loadYears()
  }

  const saveYear = async () => {
    if (selectedYear) {
      try {
        const payload: any = { ...yearForm }
        if (selectedYear.activeSemester !== payload.activeSemester) {
          payload.active = true
        }

        const r = await api.patch(`/school-years/${selectedYear._id}`, payload)
        await loadYears()
        await refetchYears() // Sync NavBar with the new active year
        setSelectedYear(r.data)
        if (r.data.active) {
          const sem = r.data.activeSemester || payload.activeSemester || 1
          showToast(`L'année ${r.data.name} — Semestre S${sem} est maintenant actif`, 'success')
        } else {
          showToast(`Modifications enregistrées pour ${r.data.name}`, 'success')
        }
      } catch (e) {
        showToast('Erreur lors de l\'enregistrement', 'error')
      }
    }
  }

  const deleteYear = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!tripleConfirm('Êtes-vous sûr de vouloir supprimer cette année scolaire ?')) return
    await api.delete(`/school-years/${id}`)
    await loadYears()
    if (selectedYear?._id === id) setSelectedYear(null)
  }


  // Classes
  const addSection = async (level: string) => {
    if (!selectedYear) return
    const levelClasses = classes.filter(c => c.level === level)
    const usedLetters = new Set(levelClasses.map(c => {
      return c.name.replace(level, '').trim()
    }))

    const alphabet = 'ABCDEFGHIJK'
    let nextLetter = 'A'
    for (const char of alphabet) {
      if (!usedLetters.has(char)) {
        nextLetter = char
        break
      }
    }

    const name = `${level} ${nextLetter}`
    await api.post('/classes', { name, level, schoolYearId: selectedYear._id })
    await loadClasses(selectedYear._id)
  }

  const deleteClass = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!tripleConfirm('Êtes-vous sûr de vouloir supprimer cette classe ?')) return
    await api.delete(`/classes/${id}`)
    if (selectedYear) await loadClasses(selectedYear._id)
    if (selectedClassId === id) {
      setSelectedClassId('')
      setStudents([])
    }
  }

  const selectClass = async (classId: string) => {
    setSelectedClassId(classId)
    await loadStudents(classId)
    resetStudentForm(classId)
  }

  // Students
  const startEditStudent = (s: StudentDoc) => {
    setEditingStudentId(s._id)
    setFirstName(s.firstName)
    setLastName(s.lastName)
    setTargetClassId(selectedClassId)
  }

  const saveStudent = async () => {
    const clsId = targetClassId || selectedClassId
    if (!clsId) return
    if (editingStudentId) {
      await api.patch(`/students/${editingStudentId}`, { firstName, lastName, classId: clsId })
    } else {
      await api.post('/students', { firstName, lastName, classId: clsId })
    }
    resetStudentForm(selectedClassId)
    await loadStudents(selectedClassId)
  }

  const resetStudentForm = (defaultClassId?: string) => {
    setEditingStudentId(null)
    setFirstName('')
    setLastName('')
    setTargetClassId(defaultClassId || selectedClassId)
  }

  const deleteStudent = async (id: string) => {
    if (!tripleConfirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) return
    await api.delete(`/students/${id}`)
    if (selectedClassId) await loadStudents(selectedClassId)
  }

  const downloadUnassignedCsv = async () => {
    if (!selectedYear) return
    try {
      const response = await api.get(`/students/unassigned/export/${selectedYear._id}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'students_to_assign.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e) {
      alert('Erreur lors du téléchargement')
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const selectedClass = classes.find(c => c._id === selectedClassId)

  return (
    <div className="resources-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="resources-header">
        <div className="resources-header-left">
          <div className="resources-header-icon-wrapper">
            <School className="resources-header-icon" />
          </div>
          <div className="resources-header-text">
            <h1>Ressources Scolaires</h1>
            <p>Gestion globale des années, classes et affectations</p>
          </div>
        </div>
        <div className="resources-header-actions">
          <button
            className="feature-btn"
            onClick={() => setShowImportModal(true)}
            title={`Importer dans l'année active`}
          >
            <Upload className="btn-icon" size={18} />
            <span>Importer élèves</span>
          </button>
          <button
            className="feature-btn"
            onClick={() => navigate('/admin/students')}
          >
            <Users className="btn-icon" size={18} />
            <span>Tous les élèves</span>
          </button>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-icon-wrapper blue"><Calendar size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{years.length}</span>
            <span className="stat-label">Années scolaires</span>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-icon-wrapper purple"><School size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{classes.length}</span>
            <span className="stat-label">Classes actives</span>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-icon-wrapper green"><GraduationCap size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{students.length}</span>
            <span className="stat-label">Élèves (classe)</span>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-icon-wrapper orange"><Clock size={24} /></div>
          <div className="stat-content">
            <span className="stat-value text-orange">{unassignedStudents.length}</span>
            <span className="stat-label">À affecter</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="main-grid">

        {/* Column 1: Years */}
        <div className="column-card">
          <div className="column-header">
            <div className="column-header-title">
              <Calendar className="column-icon blue" size={20} />
              <h3>Années</h3>
            </div>
          </div>

          <div className="column-body">
            <div className="years-list-container">
              {years.map(y => (
                <div
                  key={y._id}
                  className={`list-item ${selectedYear?._id === y._id ? 'selected' : ''} ${y.active ? 'active-year' : ''}`}
                  onClick={() => selectYear(y)}
                >
                  <div className="list-item-main">
                    <span className="year-title">{y.name}</span>
                    <div className="year-badges-row">
                      {y.active && <span className="status-badge active">Actif</span>}
                      {y.active && y.activeSemester && <span className="status-badge semester">S{y.activeSemester}</span>}
                    </div>
                  </div>

                  <div className="list-item-actions">
                    {y._id === oldestYearId && (
                      <button
                        className="icon-action-btn small"
                        onClick={(e) => addPreviousYear(e)}
                        title="Ajouter l'année précédente"
                        disabled={creatingPreviousYear}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                    <button
                      className="icon-action-btn small danger"
                      onClick={(e) => deleteYear(e, y._id)}
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button className="primary-add-btn" onClick={addNextYear}>
              <Plus size={18} />
              <span>Nouvelle année</span>
            </button>

            {selectedYear && (
              <div className="edit-panel">
                <div className="edit-panel-header">
                  <Edit2 size={16} />
                  <span>Modifier {selectedYear.name}</span>
                </div>

                <div className="edit-form-group">
                  <label>Nom</label>
                  <input
                    value={yearForm.name}
                    onChange={e => setYearForm({ ...yearForm, name: e.target.value })}
                    placeholder="2024/2025"
                  />
                </div>
                <div className="edit-form-row">
                  <div className="edit-form-group">
                    <label>Début</label>
                    <input type="date" value={yearForm.startDate} onChange={e => setYearForm({ ...yearForm, startDate: e.target.value })} />
                  </div>
                  <div className="edit-form-group">
                    <label>Fin</label>
                    <input type="date" value={yearForm.endDate} onChange={e => setYearForm({ ...yearForm, endDate: e.target.value })} />
                  </div>
                </div>

                <div className="semester-selector">
                  <button
                    className={`sem-btn ${(yearForm.activeSemester || 1) === 1 ? 'selected' : ''}`}
                    onClick={() => setYearForm({ ...yearForm, activeSemester: 1 })}
                  >
                    S1
                  </button>
                  <button
                    className={`sem-btn ${(yearForm.activeSemester || 1) === 2 ? 'selected' : ''}`}
                    onClick={() => setYearForm({ ...yearForm, activeSemester: 2 })}
                  >
                    S2
                  </button>
                </div>

                <div className="edit-form-checkbox">
                  <input
                    type="checkbox"
                    checked={yearForm.active}
                    onChange={e => setYearForm({ ...yearForm, active: e.target.checked })}
                    id="activeCheck"
                  />
                  <label htmlFor="activeCheck">Année active</label>
                </div>

                <button className="save-action-btn" onClick={saveYear}>
                  <Save size={16} />
                  Enregistrer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Classes */}
        <div className={`column-card ${!selectedYear ? 'disabled' : ''}`}>
          <div className="column-header">
            <div className="column-header-title">
              <School className="column-icon purple" size={20} />
              <h3>Classes</h3>
            </div>
            {selectedYear && <span className="header-count">{classes.length}</span>}
          </div>

          <div className="column-body">
            {!selectedYear ? (
              <div className="empty-placeholder">
                <ArrowRight size={48} className="placeholder-icon" />
                <p>Sélectionnez une année</p>
              </div>
            ) : (
              <div className="classes-list-wrapper">
                {levels.filter(l => ['PS', 'MS', 'GS'].includes(l.name)).map(level => {
                  const levelClasses = classes.filter(c => c.level === level.name).sort((a, b) => a.name.localeCompare(b.name))
                  return (
                    <div key={level._id} className="level-group">
                      <div className="level-group-header">
                        <span className={`level-pill ${level.name.toLowerCase()}`}>{level.name}</span>
                        <div className="level-line"></div>
                        <button
                          className="icon-action-btn"
                          onClick={() => addSection(level.name)}
                          title="Ajouter une section"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="sections-grid-new">
                        {levelClasses.map(c => {
                          const letter = c.name.replace(level.name, '').trim() || c.name
                          return (
                            <div
                              key={c._id}
                              className={`section-card ${selectedClassId === c._id ? 'selected' : ''} ${level.name.toLowerCase()}`}
                              onClick={() => selectClass(c._id)}
                            >
                              <span className="section-letter">{letter}</span>
                              {selectedClassId === c._id && (
                                <button
                                  className="delete-section-btn"
                                  onClick={(e) => deleteClass(e, c._id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {levelClasses.length === 0 && <span className="empty-level-text">Aucune classe</span>}
                      </div>
                    </div>
                  )
                })}

                <button className="import-action-btn" onClick={() => setShowImportModal(true)} title={`Importer dans l'année active`}>
                  <Upload size={16} />
                  <span>Importer CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Students */}
        <div className={`column-card ${!selectedClassId ? 'disabled' : ''}`}>
          <div className="column-header">
            <div className="column-header-title">
              <GraduationCap className="column-icon green" size={20} />
              <h3>Élèves</h3>
            </div>
            {selectedClass && <span className="header-count">{students.length}</span>}
          </div>

          <div className="column-body">
            {!selectedClassId ? (
              <div className="empty-placeholder">
                <ArrowRight size={48} className="placeholder-icon" />
                <p>Sélectionnez une classe</p>
              </div>
            ) : (
              <div className="students-panel">
                <div className="student-input-area">
                  <div className="student-form-row">
                    <input
                      className="clean-input"
                      placeholder="Prénom"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                    />
                    <input
                      className="clean-input"
                      placeholder="Nom"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                    />
                  </div>

                  {/* Class select only if creating new/editing */}
                  {editingStudentId && (
                    <select
                      className="clean-select"
                      value={targetClassId}
                      onChange={e => setTargetClassId(e.target.value)}
                    >
                      {classes.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="student-form-actions">
                    <button
                      className={`action-btn primary ${editingStudentId ? 'warning' : ''}`}
                      onClick={saveStudent}
                      disabled={!firstName.trim() || !lastName.trim()}
                    >
                      {editingStudentId ? <Save size={16} /> : <Plus size={16} />}
                      <span>{editingStudentId ? 'Mettre à jour' : 'Ajouter'}</span>
                    </button>
                    {editingStudentId && (
                      <button className="action-btn ghost" onClick={() => resetStudentForm()}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="search-bar">
                  <Search size={16} className="search-icon" />
                  <input
                    placeholder="Rechercher un élève..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                  />
                </div>

                <div className="students-list-new">
                  {filteredStudents.map(s => (
                    <div key={s._id} className="student-row">
                      <div className="student-avatar-small">
                        {getInitials(s.firstName, s.lastName)}
                      </div>
                      <div className="student-info-col">
                        <span className="student-fullname">{s.firstName} {s.lastName}</span>
                      </div>
                      <div className="student-row-actions">
                        <button onClick={() => startEditStudent(s)} className="icon-btn-row edit">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deleteStudent(s._id)} className="icon-btn-row delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredStudents.length === 0 && (
                    <div className="empty-list-msg">Aucun élève trouvé</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unassigned Section */}
      {selectedYear && (
        <div className="unassigned-panel">
          <div className="unassigned-header-row">
            <div className="unassigned-title">
              <AlertCircle className="unassign-icon" size={24} />
              <div>
                <h3>En attente d'affectation</h3>
                <p>{unassignedStudents.length} élèves à placer</p>
              </div>
            </div>
            <div className="unassigned-actions-row">
              <button className="secondary-action-btn" onClick={downloadUnassignedCsv}>
                <Download size={16} /> CSV
              </button>
              <button className="secondary-action-btn" onClick={() => setShowBulkAssignModal(true)}>
                <Upload size={16} /> Importer affectations
              </button>
            </div>
          </div>

          {unassignedStudents.length > 0 ? (
            <div className="unassigned-grid-layout">
              {/* Other Students */}
              {Object.entries(groupedOtherStudents).map(([groupName, groupStudents]) => (
                <div key={groupName} className="unassigned-card-group">
                  <div className="group-header">
                    <span className="group-name">{groupName}</span>
                    <span className="group-badge">{groupStudents.length}</span>
                  </div>
                  <div className="group-list">
                    {groupStudents.map(s => (
                      <div key={s._id} className="unassigned-item">
                        <span className="u-name">{s.firstName} {s.lastName}</span>
                        <select
                          className="u-select"
                          onChange={(e) => {
                            if (e.target.value) assignSection(s._id, s.level || 'MS', e.target.value)
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Section...</option>
                          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map(l => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Promoted Students */}
              {Object.entries(groupedPromotedStudents).map(([groupName, groupStudents]) => (
                <div key={groupName} className="unassigned-card-group promoted">
                  <div className="group-header">
                    <span className="group-name">{groupName}</span>
                    <span className="group-badge promoted">{groupStudents.length}</span>
                  </div>
                  <div className="group-list">
                    {groupStudents.map(s => (
                      <div key={s._id} className="unassigned-item">
                        <span className="u-name">{s.firstName} {s.lastName}</span>
                        <select
                          className="u-select"
                          onChange={(e) => {
                            if (e.target.value) assignSection(s._id, s.level || 'MS', e.target.value)
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Section...</option>
                          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map(l => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="all-clear-message">
              <Check size={48} className="success-icon" />
              <p>Tous les élèves sont affectés pour cette année !</p>
            </div>
          )}
        </div>
      )}

      {/* Modals - Import always uses active year from context */}
      <ImportStudentsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          if (selectedYear) {
            loadUnassignedStudents(selectedYear._id)
            loadClasses(selectedYear._id)
          }
        }}
      />
      {selectedYear && (
        <BulkAssignModal
          isOpen={showBulkAssignModal}
          onClose={() => setShowBulkAssignModal(false)}
          schoolYearId={selectedYear._id}
          onSuccess={() => {
            loadUnassignedStudents(selectedYear._id)
            loadClasses(selectedYear._id)
          }}
        />
      )}
    </div>
  )
}

function ImportStudentsModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) {
  const { activeYearId, activeYear } = useSchoolYear()
  const [csv, setCsv] = useState('')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCsv('FirstName,LastName,level,section\n')
      setReport(null)
      setLoading(false)
    }
  }, [isOpen])

  const onFile = async (e: any) => {
    const f = e.target.files?.[0]
    if (!f) return
    const txt = await f.text()
    setCsv(txt)
  }

  const submit = async () => {
    setLoading(true)
    setReport(null)

    let processedCsv = csv
    try {
      let lines = processedCsv.split(/\r?\n/).filter(l => l.trim().length > 0)

      if (lines.length > 0) {
        const firstLine = lines[0].toLowerCase()
        if (!firstLine.includes('firstname') && !firstLine.includes('nom') && !firstLine.includes('prenom')) {
          lines = ['FirstName,LastName,level,section', ...lines]
        }
      }

      if (lines.length > 1) {
        let headers = lines[0].split(',').map(h => h.trim())

        const dobIdx = headers.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase() === 'dob')
        if (dobIdx === -1) {
          headers.push('DateOfBirth')
          lines = [
            headers.join(','),
            ...lines.slice(1).map(l => `${l},2020-01-01`)
          ]
        }

        const hasClassName = headers.some(h => h.toLowerCase() === 'classname')
        const levelIdx = headers.findIndex(h => h.toLowerCase() === 'level')
        const sectionIdx = headers.findIndex(h => h.toLowerCase() === 'section')

        if (!hasClassName && levelIdx !== -1 && sectionIdx !== -1) {
          const newHeaders = [...headers, 'ClassName']
          const newRows = lines.slice(1).map(row => {
            const cols = row.split(',')
            const lvl = (cols[levelIdx] || '').trim()
            const sec = (cols[sectionIdx] || '').trim()
            const cls = [lvl, sec].filter(Boolean).join(' ').trim()
            return [...cols, cls].join(',')
          })
          processedCsv = [newHeaders.join(','), ...newRows].join('\n')
        } else {
          processedCsv = lines.join('\n')
        }
      }
    } catch { }

    if (!activeYearId) {
      alert('Aucune année scolaire active. Veuillez d\'abord activer une année.')
      setLoading(false)
      return
    }

    try {
      const r = await api.post('/import/students', { csv: processedCsv, schoolYearId: activeYearId, dryRun: false })
      setReport(r.data)
      if (r.data.added > 0 || r.data.updated > 0) {
        onSuccess?.()
      }
    } catch (e) {
      alert('Erreur lors de l\'import')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Upload size={20} className="modal-icon" />
            <div>
              <h3>Importer des élèves</h3>
              {activeYear && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Année active: <strong>{activeYear.name}</strong>
                </p>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div
            className="file-upload-zone"
            onClick={() => document.getElementById('csv-upload')?.click()}
          >
            <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="csv-upload" />
            <FileText size={32} className="upload-icon" />
            <p className="file-upload-text">Cliquez pour sélectionner un fichier CSV</p>
            <p className="file-upload-hint">ou glissez-déposez le fichier ici</p>
          </div>

          <textarea
            className="csv-textarea"
            value={csv}
            onChange={e => setCsv(e.target.value)}
            rows={8}
            placeholder="FirstName,LastName,level,section..."
          />

          <div className="format-hint">
            <AlertCircle size={14} />
            Format attendu: <code>FirstName,LastName,level,section</code>
          </div>

          <div className="format-hint" style={{ marginTop: '8px', color: 'var(--success-color)' }}>
            <Check size={14} />
            Les classes seront créées automatiquement si elles n'existent pas
          </div>

          {report && (
            <div className={`import-result ${report.added > 0 ? 'success' : 'warning'}`}>
              <h4 className="import-result-title">
                {report.added > 0 ? 'Import réussi' : 'Résultat de l\'import'}
              </h4>
              <div className="import-result-stats">
                <div className="import-stat">
                  <div className="import-stat-value">{report.added}</div>
                  <div className="import-stat-label">Créés</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-value">{report.updated}</div>
                  <div className="import-stat-label">Mis à jour</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-value">{report.errorCount || 0}</div>
                  <div className="import-stat-label">Erreurs</div>
                </div>
              </div>
              {report.report && report.report.filter((r: any) => r.status === 'error').length > 0 && (
                <div className="import-errors">
                  {report.report.filter((r: any) => r.status === 'error').map((e: any, i: number) => <div key={i}>{e.message || JSON.stringify(e)}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Fermer</button>
          <button
            className="modal-btn primary"
            onClick={submit}
            disabled={loading || !csv.trim()}
          >
            {loading ? 'Importation...' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkAssignModal({ isOpen, onClose, schoolYearId, onSuccess }: { isOpen: boolean; onClose: () => void; schoolYearId: string; onSuccess: () => void }) {
  const [csv, setCsv] = useState('')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCsv('')
      setReport(null)
      setLoading(false)
    }
  }, [isOpen])

  const onFile = async (e: any) => {
    const f = e.target.files?.[0]
    if (!f) return
    const txt = await f.text()
    setCsv(txt)
  }

  const submit = async () => {
    setLoading(true)
    setReport(null)
    try {
      const r = await api.post('/students/bulk-assign-section', { csv, schoolYearId })
      setReport(r.data)
      if (r.data.success > 0) {
        onSuccess()
      }
    } catch (e) {
      alert('Erreur lors de l\'import')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Upload size={20} className="modal-icon" />
            <h3>Affectation en masse</h3>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div
            className="file-upload-zone"
            onClick={() => document.getElementById('bulk-csv-upload')?.click()}
          >
            <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-csv-upload" />
            <FileText size={32} className="upload-icon" />
            <p className="file-upload-text">Cliquez pour sélectionner un fichier CSV</p>
            <p className="file-upload-hint">ou glissez-déposez le fichier ici</p>
          </div>

          <textarea
            className="csv-textarea"
            value={csv}
            onChange={e => setCsv(e.target.value)}
            rows={8}
            placeholder="StudentId,FirstName,LastName,PreviousClass,TargetLevel,NextClass..."
          />

          <div className="format-hint">
            <AlertCircle size={14} />
            Colonnes requises: <code>StudentId, NextClass</code>
          </div>

          {report && (
            <div className={`import-result ${report.success > 0 ? 'success' : 'warning'}`}>
              <h4 className="import-result-title">
                {report.success > 0 ? 'Affectation réussie' : 'Résultat'}
              </h4>
              <div className="import-result-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="import-stat">
                  <div className="import-stat-value">{report.success}</div>
                  <div className="import-stat-label">Affectés</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-value">{report.errors?.length || 0}</div>
                  <div className="import-stat-label">Erreurs</div>
                </div>
              </div>
              {report.errors && report.errors.length > 0 && (
                <div className="import-errors">
                  {report.errors.map((e: any, i: number) => <div key={i}>{JSON.stringify(e)}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Fermer</button>
          <button
            className="modal-btn primary"
            onClick={submit}
            disabled={loading || !csv.trim()}
          >
            {loading ? 'Traitement...' : 'Lancer l\'affectation'}
          </button>
        </div>
      </div>
    </div>
  )
}
