import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useLevels } from '../context/LevelContext'
import './AdminResources.css'

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
  const { activeYearId } = useSchoolYear()
  const { levels } = useLevels()
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState<Year | null>(null)
  
  // Year editing state
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '', active: true })

  // Class state
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')

  // Student state
  const [students, setStudents] = useState<StudentDoc[]>([])
  const [unassignedStudents, setUnassignedStudents] = useState<StudentDoc[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)

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

  // Stats
  const totalStudents = useMemo(() => {
    return students.length + unassignedStudents.length
  }, [students, unassignedStudents])

  const loadYears = async () => { 
    const r = await api.get('/school-years')
    setYears(r.data.sort((a: Year, b: Year) => a.name.localeCompare(b.name))) 
  }
  useEffect(() => { loadYears() }, [])

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
        startDate: y.startDate?.slice(0,10) || '',
        endDate: y.endDate?.slice(0,10) || '',
        active: !!y.active
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
    
    await api.post('/school-years', { name, startDate, endDate, active: true })
    await loadYears()
  }

  const saveYear = async () => {
    if (selectedYear) {
      const r = await api.patch(`/school-years/${selectedYear._id}`, yearForm)
      await loadYears()
      setSelectedYear(r.data)
    }
  }

  const deleteYear = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if(!confirm('Êtes-vous sûr de vouloir supprimer cette année scolaire ?')) return
      await api.delete(`/school-years/${id}`)
      await loadYears()
      if(selectedYear?._id === id) setSelectedYear(null)
  }

  const toggleSemester = async (semester: number) => {
    if (!selectedYear) return
    await api.patch(`/school-years/${selectedYear._id}`, { activeSemester: semester })
    setSelectedYear({ ...selectedYear, activeSemester: semester })
    loadYears()
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
      if(!confirm('Êtes-vous sûr de vouloir supprimer cette classe ?')) return
      await api.delete(`/classes/${id}`)
      if(selectedYear) await loadClasses(selectedYear._id)
      if(selectedClassId === id) {
          setSelectedClassId('')
          setStudents([])
      }
  }

  const selectClass = async (classId: string) => { 
    setSelectedClassId(classId)
    await loadStudents(classId)
    resetStudentForm() 
  }

  // Students
  const startEditStudent = (s: StudentDoc) => { 
    setEditingStudentId(s._id)
    setFirstName(s.firstName)
    setLastName(s.lastName) 
  }

  const saveStudent = async () => {
    if (!selectedClassId) return
    if (editingStudentId) {
      await api.patch(`/students/${editingStudentId}`, { firstName, lastName, classId: selectedClassId })
    } else {
      await api.post('/students', { firstName, lastName, classId: selectedClassId })
    }
    resetStudentForm()
    await loadStudents(selectedClassId)
  }

  const resetStudentForm = () => { 
    setEditingStudentId(null)
    setFirstName('')
    setLastName('') 
  }

  const deleteStudent = async (id: string) => {
      if(!confirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) return
      await api.delete(`/students/${id}`)
      if(selectedClassId) await loadStudents(selectedClassId)
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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const selectedClass = classes.find(c => c._id === selectedClassId)

  return (
    <div className="resources-page">
      {/* Header */}
      <header className="resources-header">
        <div className="resources-header-left">
          <div className="resources-header-icon">🏫</div>
          <div>
            <h1>Ressources Scolaires</h1>
            <p>Gérez les années scolaires, classes et élèves</p>
          </div>
        </div>
        <div className="resources-header-actions">
          <button 
            className="header-btn secondary" 
            onClick={() => navigate('/admin/students')}
          >
            <span>👨‍🎓</span> Gestion des Élèves
          </button>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-card-icon years">📅</div>
          <div className="stat-card-value">{years.length}</div>
          <div className="stat-card-label">Années scolaires</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon classes">🏫</div>
          <div className="stat-card-value">{classes.length}</div>
          <div className="stat-card-label">Classes</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon students">🎓</div>
          <div className="stat-card-value">{students.length}</div>
          <div className="stat-card-label">Élèves (classe sélectionnée)</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon pending">⏳</div>
          <div className="stat-card-value">{unassignedStudents.length}</div>
          <div className="stat-card-label">En attente d'affectation</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="resources-grid">
        
        {/* Column 1: Years */}
        <div className="resource-card">
          <div className="card-header">
            <div className="card-header-icon years">📅</div>
            <div className="card-header-content">
              <h3>Années Scolaires</h3>
              <p>Sélectionnez une année à gérer</p>
            </div>
          </div>

          <div className="card-body">
            <div className="years-list">
              {years.map(y => (
                <div 
                  key={y._id} 
                  className={`year-item ${selectedYear?._id === y._id ? 'selected' : ''} ${y.active ? 'active' : ''}`}
                  onClick={() => selectYear(y)}
                >
                  <div className="year-item-left">
                    <div className="year-icon">📆</div>
                    <div>
                      <div className="year-name">{y.name}</div>
                      <div className="year-dates">
                        {formatDate(y.startDate)} - {formatDate(y.endDate)}
                      </div>
                    </div>
                  </div>
                  <div className="year-badges">
                    {y.active && <span className="badge active">Active</span>}
                    {y.activeSemester && <span className="badge semester">S{y.activeSemester}</span>}
                  </div>
                  <button 
                    className="year-delete"
                    onClick={(e) => deleteYear(e, y._id)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            
            <button className="add-year-btn" onClick={addNextYear}>
              <span>➕</span> Ajouter l'année suivante
            </button>

            {/* Year Edit Form */}
            {selectedYear && (
              <div className="year-edit-form">
                <div className="form-section-title">
                  <span>✏️</span> Modifier l'année
                </div>
                
                <div className="form-group">
                  <label className="form-label">Nom de l'année</label>
                  <input 
                    className="form-input"
                    value={yearForm.name} 
                    onChange={e => setYearForm({...yearForm, name: e.target.value})} 
                    placeholder="ex: 2024/2025"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date de début</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={yearForm.startDate} 
                      onChange={e => setYearForm({...yearForm, startDate: e.target.value})} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date de fin</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={yearForm.endDate} 
                      onChange={e => setYearForm({...yearForm, endDate: e.target.value})} 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Semestre actif</label>
                  <div className="semester-toggle">
                    <button 
                      className={`semester-btn ${(selectedYear.activeSemester || 1) === 1 ? 'active' : ''}`}
                      onClick={() => toggleSemester(1)}
                    >
                      Semestre 1
                    </button>
                    <button 
                      className={`semester-btn ${selectedYear.activeSemester === 2 ? 'active' : ''}`}
                      onClick={() => toggleSemester(2)}
                    >
                      Semestre 2
                    </button>
                  </div>
                </div>

                <div className="form-checkbox">
                  <input 
                    type="checkbox" 
                    id="yearActive"
                    checked={yearForm.active} 
                    onChange={e => setYearForm({...yearForm, active: e.target.checked})} 
                  />
                  <label htmlFor="yearActive">Année active</label>
                </div>

                <button className="save-btn" onClick={saveYear}>
                  💾 Enregistrer les modifications
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Classes */}
        <div className={`resource-card ${!selectedYear ? 'disabled' : ''}`}>
          <div className="card-header">
            <div className="card-header-icon classes">🏫</div>
            <div className="card-header-content">
              <h3>Classes & Sections</h3>
              <p>{selectedYear ? `${selectedYear.name} - ${classes.length} classes` : 'Sélectionnez une année'}</p>
            </div>
          </div>

          <div className="card-body">
            {!selectedYear ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <h4 className="empty-state-title">Aucune année sélectionnée</h4>
                <p className="empty-state-text">Sélectionnez une année scolaire pour voir les classes</p>
              </div>
            ) : (
              <div className="classes-container">
                {levels.filter(l => ['PS', 'MS', 'GS'].includes(l.name)).map(level => {
                  const levelClasses = classes.filter(c => c.level === level.name).sort((a,b) => a.name.localeCompare(b.name))
                  return (
                    <div key={level._id} className="level-section">
                      <div className="level-header">
                        <div className="level-title">
                          <span className={`level-badge ${level.name.toLowerCase()}`}>{level.name}</span>
                          <div>
                            <span className="level-name">
                              {level.name === 'PS' ? 'Petite Section' : level.name === 'MS' ? 'Moyenne Section' : 'Grande Section'}
                            </span>
                            <span className="level-count"> · {levelClasses.length} section{levelClasses.length > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <button 
                          className="add-section-btn" 
                          onClick={() => addSection(level.name)}
                          title="Ajouter une section"
                        >
                          +
                        </button>
                      </div>
                      <div className="sections-grid">
                        {levelClasses.map(c => {
                          const letter = c.name.replace(level.name, '').trim() || c.name
                          return (
                            <div 
                              key={c._id} 
                              className={`section-chip ${selectedClassId === c._id ? 'selected' : ''} ${level.name.toLowerCase()}`}
                              onClick={() => selectClass(c._id)}
                            >
                              <span className={`section-letter ${level.name.toLowerCase()}`}>{letter}</span>
                              <span className="section-name">{c.name}</span>
                              {selectedClassId === c._id && (
                                <button 
                                  className="section-delete"
                                  onClick={(e) => deleteClass(e, c._id)}
                                  title="Supprimer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {levelClasses.length === 0 && (
                          <div className="no-sections">Aucune section créée</div>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div className="import-section">
                  <button className="import-btn" onClick={() => setShowImportModal(true)}>
                    <span>📥</span> Importer des élèves (CSV)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Students */}
        <div className={`resource-card ${!selectedClassId ? 'disabled' : ''}`}>
          <div className="card-header">
            <div className="card-header-icon students">🎓</div>
            <div className="card-header-content">
              <h3>Élèves</h3>
              <p>{selectedClass ? `${selectedClass.name} - ${students.length} élèves` : 'Sélectionnez une classe'}</p>
            </div>
          </div>

          <div className="card-body">
            {!selectedClassId ? (
              <div className="empty-state">
                <div className="empty-state-icon">👥</div>
                <h4 className="empty-state-title">Aucune classe sélectionnée</h4>
                <p className="empty-state-text">Sélectionnez une classe pour voir et gérer les élèves</p>
              </div>
            ) : (
              <div className="students-container">
                {/* Add/Edit Student Form */}
                <div className="student-form">
                  <h4 className="student-form-title">
                    {editingStudentId ? '✏️ Modifier l\'élève' : '➕ Ajouter un élève'}
                  </h4>
                  <div className="student-form-inputs">
                    <input 
                      className="form-input"
                      placeholder="Prénom" 
                      value={firstName} 
                      onChange={e => setFirstName(e.target.value)} 
                    />
                    <input 
                      className="form-input"
                      placeholder="Nom" 
                      value={lastName} 
                      onChange={e => setLastName(e.target.value)} 
                    />
                  </div>
                  <div className="student-form-actions">
                    <button 
                      className="add-student-btn" 
                      onClick={saveStudent}
                      disabled={!firstName.trim() || !lastName.trim()}
                    >
                      {editingStudentId ? '💾 Mettre à jour' : '➕ Ajouter'}
                    </button>
                    {editingStudentId && (
                      <button className="cancel-btn" onClick={resetStudentForm}>
                        Annuler
                      </button>
                    )}
                  </div>
                </div>

                {/* Students List */}
                <div className="students-list">
                  {students.map(s => (
                    <div key={s._id} className="student-item">
                      <div className="student-info">
                        <div className="student-avatar">
                          {getInitials(s.firstName, s.lastName)}
                        </div>
                        <span className="student-name">{s.firstName} {s.lastName}</span>
                      </div>
                      <div className="student-actions">
                        <button 
                          className="student-action-btn edit"
                          onClick={() => startEditStudent(s)}
                          title="Modifier"
                        >
                          ✏️
                        </button>
                        <button 
                          className="student-action-btn delete"
                          onClick={() => deleteStudent(s._id)}
                          title="Supprimer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  {students.length === 0 && (
                    <div className="no-students">
                      <div className="no-students-icon">📭</div>
                      <p className="no-students-text">Aucun élève dans cette classe</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unassigned Students Section */}
      {selectedYear && (
        <div className="unassigned-section">
          <div className="unassigned-card">
            <div className="unassigned-header">
              <div className="unassigned-header-left">
                <div className="card-header-icon unassigned">⏳</div>
                <div className="card-header-content">
                  <h3>Élèves en attente d'affectation</h3>
                  <p>{unassignedStudents.length} élève{unassignedStudents.length > 1 ? 's' : ''} à affecter pour {selectedYear.name}</p>
                </div>
              </div>
              <div className="unassigned-actions">
                <button className="csv-btn download" onClick={downloadUnassignedCsv}>
                  <span>📥</span> Télécharger CSV
                </button>
                <button className="csv-btn upload" onClick={() => setShowBulkAssignModal(true)}>
                  <span>📤</span> Affectation en masse
                </button>
              </div>
            </div>

            <div className="unassigned-body">
              {unassignedStudents.length === 0 ? (
                <div className="unassigned-empty">
                  <div className="unassigned-empty-icon">🎉</div>
                  <h4 className="unassigned-empty-title">Tous les élèves sont affectés !</h4>
                  <p className="unassigned-empty-text">
                    Aucun élève en attente d'affectation pour cette année scolaire.
                    <br />Les élèves promus par les sous-admins apparaîtront ici.
                  </p>
                </div>
              ) : (
                <div className="unassigned-groups">
                  {/* Other Unassigned */}
                  {Object.entries(groupedOtherStudents).map(([groupName, groupStudents]) => (
                    <div key={groupName} className="unassigned-group">
                      <div className="unassigned-group-header">
                        <span className="unassigned-group-title">{groupName}</span>
                        <span className="unassigned-group-count">{groupStudents.length}</span>
                      </div>
                      <div className="unassigned-group-students">
                        {groupStudents.map(s => (
                          <div key={s._id} className="unassigned-student">
                            <div className="unassigned-student-info">
                              <div className="unassigned-student-avatar">
                                {getInitials(s.firstName, s.lastName)}
                              </div>
                              <div>
                                <div className="unassigned-student-name">{s.firstName} {s.lastName}</div>
                                <div className="unassigned-student-meta">Niveau: {s.level || '?'}</div>
                              </div>
                            </div>
                            <select 
                              className="section-select"
                              onChange={(e) => {
                                if (e.target.value) assignSection(s._id, s.level || 'MS', e.target.value)
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>Section...</option>
                              {['A','B','C','D','E','F','G','H','I','J','K'].map(l => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Promoted Unassigned */}
                  {Object.entries(groupedPromotedStudents).map(([groupName, groupStudents]) => (
                    <div key={groupName} className="unassigned-group">
                      <div className="unassigned-group-header promoted">
                        <span className="unassigned-group-title">🎓 {groupName}</span>
                        <span className="unassigned-group-count">{groupStudents.length}</span>
                      </div>
                      <div className="unassigned-group-students">
                        {groupStudents.map(s => (
                          <div key={s._id} className="unassigned-student">
                            <div className="unassigned-student-info">
                              <div className="unassigned-student-avatar">
                                {getInitials(s.firstName, s.lastName)}
                              </div>
                              <div>
                                <div className="unassigned-student-name">{s.firstName} {s.lastName}</div>
                                <div className="unassigned-student-meta">
                                  Promu: {s.promotion?.from} → {s.promotion?.to}
                                </div>
                              </div>
                            </div>
                            <select 
                              className="section-select"
                              onChange={(e) => {
                                if (e.target.value) assignSection(s._id, s.level || 'MS', e.target.value)
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>Section...</option>
                              {['A','B','C','D','E','F','G','H','I','J','K'].map(l => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>
                          </div>
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

      {/* Modals */}
      {selectedYear && (
        <>
          <ImportStudentsModal 
            isOpen={showImportModal} 
            onClose={() => setShowImportModal(false)} 
            schoolYearId={selectedYear._id} 
          />
          <BulkAssignModal 
            isOpen={showBulkAssignModal} 
            onClose={() => setShowBulkAssignModal(false)} 
            schoolYearId={selectedYear._id} 
            onSuccess={() => {
              loadUnassignedStudents(selectedYear._id)
              loadClasses(selectedYear._id)
            }}
          />
        </>
      )}
    </div>
  )
}

function ImportStudentsModal({ isOpen, onClose, schoolYearId }: { isOpen: boolean; onClose: () => void; schoolYearId: string }) {
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
    } catch {}

    try {
      const r = await api.post('/import/students', { csv: processedCsv, schoolYearId, dryRun: false })
      setReport(r.data)
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
            <div className="modal-title-icon">📥</div>
            <h3>Importer des élèves</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div 
            className="file-upload-zone"
            onClick={() => document.getElementById('csv-upload')?.click()}
          >
            <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="csv-upload" />
            <div className="file-upload-icon">📄</div>
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
            <span>💡</span>
            Format attendu: <code>FirstName,LastName,level,section</code>
          </div>

          {report && (
            <div className={`import-result ${report.created > 0 ? 'success' : 'warning'}`}>
              <h4 className="import-result-title">
                {report.created > 0 ? '✅ Import réussi' : '⚠️ Résultat de l\'import'}
              </h4>
              <div className="import-result-stats">
                <div className="import-stat">
                  <div className="import-stat-value">{report.created}</div>
                  <div className="import-stat-label">Créés</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-value">{report.updated}</div>
                  <div className="import-stat-label">Mis à jour</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-value">{report.ignored}</div>
                  <div className="import-stat-label">Ignorés</div>
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
            {loading ? '⏳ Importation...' : '📥 Importer les élèves'}
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
            <div className="modal-title-icon">📤</div>
            <h3>Affectation en masse</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div 
            className="file-upload-zone"
            onClick={() => document.getElementById('bulk-csv-upload')?.click()}
          >
            <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-csv-upload" />
            <div className="file-upload-icon">📄</div>
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
            <span>💡</span>
            Colonnes requises: <code>StudentId, NextClass</code> (ex: "MS A")
          </div>

          {report && (
            <div className={`import-result ${report.success > 0 ? 'success' : 'warning'}`}>
              <h4 className="import-result-title">
                {report.success > 0 ? '✅ Affectation réussie' : '⚠️ Résultat'}
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
            {loading ? '⏳ Traitement...' : '📤 Lancer l\'affectation'}
          </button>
        </div>
      </div>
    </div>
  )
}
