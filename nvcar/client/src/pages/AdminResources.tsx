import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useLevels } from '../context/LevelContext'

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
  const [editingYearId, setEditingYearId] = useState<string | null>(null)
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '', active: true })

  // Class state
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [clsName, setClsName] = useState('') // For renaming

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

  const loadYears = async () => { 
    const r = await api.get('/school-years')
    setYears(r.data.sort((a: Year, b: Year) => a.name.localeCompare(b.name))) 
  }
  useEffect(() => { loadYears() }, [])

  const loadClasses = async (yearId: string) => { const r = await api.get('/classes', { params: { schoolYearId: yearId } }); setClasses(r.data) }
  const loadStudents = async (classId: string) => { const r = await api.get(`/students/by-class/${classId}`); setStudents(r.data) }
  const loadUnassignedStudents = async (yearId: string) => { const r = await api.get(`/students/unassigned/${yearId}`); setUnassignedStudents(r.data) }

  const selectYear = async (y: Year) => {
    setSelectedYear(y)
    setEditingYearId(y._id)
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
    setEditingClassId(null)
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
    
    const r = await api.post('/school-years', { name, startDate, endDate, active: true })
    await loadYears()
    // Optionally select the new year, but loadYears is async. 
    // We can just let the user see it in the list.
  }

  const saveYear = async () => {
    if (editingYearId) {
      const r = await api.patch(`/school-years/${editingYearId}`, yearForm)
      await loadYears()
      setSelectedYear(r.data)
    }
  }

  const deleteYear = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if(!confirm('Supprimer cette année ?')) return
      await api.delete(`/school-years/${id}`)
      await loadYears()
      if(selectedYear?._id === id) setSelectedYear(null)
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
      if(!confirm('Supprimer cette classe ?')) return
      await api.delete(`/classes/${id}`)
      if(selectedYear) await loadClasses(selectedYear._id)
      if(selectedClassId === id) {
          setSelectedClassId('')
          setStudents([])
      }
  }

  const selectClass = async (classId: string) => { setSelectedClassId(classId); setEditingClassId(null); await loadStudents(classId); resetStudentForm() }

  // Students
  const startEditStudent = (s: StudentDoc) => { setEditingStudentId(s._id); setFirstName(s.firstName); setLastName(s.lastName) }

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

  const resetStudentForm = () => { setEditingStudentId(null); setFirstName(''); setLastName('') }
  const deleteStudent = async (id: string) => {
      if(!confirm('Supprimer cet élève ?')) return
      await api.delete(`/students/${id}`)
      if(selectedClassId) await loadStudents(selectedClassId)
  }

  const downloadUnassignedCsv = async () => {
      if (!selectedYear) return
      try {
          const response = await api.get(`/students/unassigned/export/${selectedYear._id}`, { responseType: 'blob' })
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', 'students_to_assign.csv');
          document.body.appendChild(link);
          link.click();
          link.remove();
      } catch (e) {
          alert('Erreur lors du téléchargement')
      }
  }

  return (
    <div className="container" style={{ maxWidth: 1600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="title" style={{ margin: 0 }}>Ressources Scolaires</h2>
        <button 
            className="btn secondary" 
            onClick={() => navigate('/admin/students')}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
            <span>👨‍🎓</span> Gestion des Élèves
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 400px minmax(0, 1fr)', gap: 24, alignItems: 'start', height: 'calc(100vh - 120px)' }}>
        
        {/* Column 1: Years */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8, fontSize: 20 }}>📅</div>
            <h3 style={{ margin: 0 }}>Années Scolaires</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 400, marginBottom: 16 }}>
            {years.map(y => (
              <div 
                key={y._id} 
                onClick={() => selectYear(y)}
                style={{ 
                    padding: 12, 
                    borderRadius: 8, 
                    border: selectedYear?._id === y._id ? '2px solid #1890ff' : (y.active ? '2px solid #52c41a' : '1px solid #f0f0f0'),
                    background: selectedYear?._id === y._id ? '#e6f7ff' : (y.active ? '#f6ffed' : '#fff'),
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{y.name}</span>
                    {y.active && <span className="pill" style={{ background: '#52c41a', color: '#fff', fontSize: '0.8rem', padding: '4px 10px', borderRadius: 12 }}>Active</span>}
                </div>
                <button 
                    onClick={(e) => deleteYear(e, y._id)}
                    style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.5 }}
                >✕</button>
              </div>
            ))}
          </div>
          
          <button className="btn" onClick={addNextYear} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>+</span> Ajouter année suivante
          </button>

          {/* Edit Year Form (Only if selected) */}
          {selectedYear && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>Modifier l'année</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input value={yearForm.name} onChange={e => setYearForm({...yearForm, name: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #ddd' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input type="date" value={yearForm.startDate} onChange={e => setYearForm({...yearForm, startDate: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #ddd' }} />
                        <input type="date" value={yearForm.endDate} onChange={e => setYearForm({...yearForm, endDate: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #ddd' }} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={yearForm.active} onChange={e => setYearForm({...yearForm, active: e.target.checked})} /> Active
                    </label>
                    
                    {/* Semester Toggle */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Semestre actif:</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          className={`btn ${(selectedYear.activeSemester || 1) === 1 ? '' : 'secondary'}`}
                          onClick={async () => {
                            await api.patch(`/school-years/${selectedYear._id}`, { activeSemester: 1 })
                            setSelectedYear({ ...selectedYear, activeSemester: 1 })
                            loadYears()
                          }}
                          style={{ 
                            flex: 1, 
                            padding: '8px 12px',
                            background: (selectedYear.activeSemester || 1) === 1 ? '#6c5ce7' : '#f5f5f5',
                            color: (selectedYear.activeSemester || 1) === 1 ? '#fff' : '#333',
                            border: (selectedYear.activeSemester || 1) === 1 ? '2px solid #6c5ce7' : '1px solid #ddd'
                          }}
                        >
                          Semestre 1
                        </button>
                        <button 
                          className={`btn ${(selectedYear.activeSemester || 1) === 2 ? '' : 'secondary'}`}
                          onClick={async () => {
                            await api.patch(`/school-years/${selectedYear._id}`, { activeSemester: 2 })
                            setSelectedYear({ ...selectedYear, activeSemester: 2 })
                            loadYears()
                          }}
                          style={{ 
                            flex: 1, 
                            padding: '8px 12px',
                            background: (selectedYear.activeSemester || 1) === 2 ? '#6c5ce7' : '#f5f5f5',
                            color: (selectedYear.activeSemester || 1) === 2 ? '#fff' : '#333',
                            border: (selectedYear.activeSemester || 1) === 2 ? '2px solid #6c5ce7' : '1px solid #ddd'
                          }}
                        >
                          Semestre 2
                        </button>
                      </div>
                    </div>

                    <button className="btn secondary" onClick={saveYear}>Enregistrer modifications</button>
                  </div>
              </div>
          )}
        </div>

        {/* Column 2: Classes */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', opacity: selectedYear ? 1 : 0.6, pointerEvents: selectedYear ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#fff0f6', padding: 8, borderRadius: 8, fontSize: 20 }}>🏫</div>
            <h3 style={{ margin: 0 }}>Classes</h3>
          </div>

          {!selectedYear ? (
             <div className="note" style={{ textAlign: 'center', padding: 20 }}>Sélectionnez une année</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                
                {/* Unassigned Students moved to separate column */}

                {levels.filter(l => ['PS', 'MS', 'GS'].includes(l.name)).map(level => (
                    <div key={level._id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h4 style={{ margin: 0, color: '#555' }}>{level.name}</h4>
                            <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => addSection(level.name)}>+</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {classes.filter(c => c.level === level.name).sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                                <div 
                                    key={c._id} 
                                    onClick={() => selectClass(c._id)}
                                    style={{ 
                                        padding: '6px 12px', 
                                        borderRadius: 16, 
                                        border: selectedClassId === c._id ? '2px solid #eb2f96' : '1px solid #ddd',
                                        background: selectedClassId === c._id ? '#fff0f6' : '#fff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                >
                                    <span>{c.name.replace(level.name, '').trim() || c.name}</span>
                                    {selectedClassId === c._id && (
                                        <span onClick={(e) => deleteClass(e, c._id)} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>✕</span>
                                    )}
                                </div>
                            ))}
                            {classes.filter(c => c.level === level.name).length === 0 && <span className="note" style={{ fontSize: '0.8rem' }}>Aucune section</span>}
                        </div>
                    </div>
                ))}

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#8c8c8c' }}>Import CSV</h4>
                    <button className="btn secondary" style={{ width: '100%' }} onClick={() => setShowImportModal(true)}>Importer des élèves (CSV)</button>
                    {selectedYear && <ImportStudentsModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} schoolYearId={selectedYear._id} />}
                    {selectedYear && <BulkAssignModal 
                        isOpen={showBulkAssignModal} 
                        onClose={() => setShowBulkAssignModal(false)} 
                        schoolYearId={selectedYear._id} 
                        onSuccess={() => {
                            loadUnassignedStudents(selectedYear._id)
                            loadClasses(selectedYear._id)
                        }}
                    />}
                </div>
            </div>
          )}
        </div>

        {/* Column 3: Students */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', opacity: selectedClassId ? 1 : 0.6, pointerEvents: selectedClassId ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#f6ffed', padding: 8, borderRadius: 8, fontSize: 20 }}>🎓</div>
            <h3 style={{ margin: 0 }}>Élèves</h3>
          </div>

          {!selectedClassId ? (
             <div className="note" style={{ textAlign: 'center', padding: 20 }}>Sélectionnez une classe pour gérer les élèves</div>
          ) : (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                    <input placeholder="Prénom" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Nom" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={saveStudent} style={{ flex: 1 }}>{editingStudentId ? 'Mettre à jour' : 'Ajouter élève'}</button>
                    {editingStudentId && <button className="btn secondary" onClick={resetStudentForm}>Annuler</button>}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 600 }}>
                    {students.map(s => (
                    <div key={s._id} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid #f0f0f0',
                        background: '#fff'
                    }}>
                        <div>
                            <div style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => startEditStudent(s)}>✏️</button>
                            <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'red' }} onClick={() => deleteStudent(s._id)}>✕</button>
                        </div>
                    </div>
                    ))}
                    {students.length === 0 && <div className="note" style={{ textAlign: 'center' }}>Aucun élève</div>}
                </div>
            </>
          )}
        </div>
      </div>

      {/* Unassigned Students Section */}
      <div style={{ marginTop: 64 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', opacity: selectedYear ? 1 : 0.6, pointerEvents: selectedYear ? 'auto' : 'none', borderLeft: '4px solid #ffd591' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#fff7e6', padding: 8, borderRadius: 8, fontSize: 20 }}>⚠️</div>
            <h3 style={{ margin: 0 }}>Élèves à affecter</h3>
          </div>

          {!selectedYear ? (
             <div className="note" style={{ textAlign: 'center', padding: 20 }}>Sélectionnez une année</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="note">Total: {unassignedStudents.length}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn secondary" onClick={downloadUnassignedCsv} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>⬇ CSV</button>
                        <button className="btn secondary" onClick={() => setShowBulkAssignModal(true)} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>⬆ CSV</button>
                    </div>
                </div>

                {unassignedStudents.length === 0 ? (
                    <div className="note" style={{ fontStyle: 'italic', color: '#8c8c8c', textAlign: 'center', padding: 20 }}>
                        Aucun élève en attente d'affectation pour cette année.
                        <br/>
                        <span style={{ fontSize: '0.8rem' }}>Les élèves promus par les sous-admins apparaîtront ici.</span>
                    </div>
                ) : (
                    <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                        {/* Other Unassigned */}
                        {Object.entries(groupedOtherStudents).map(([groupName, students]) => (
                            <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 4 }}>
                                    <h5 style={{ margin: 0, color: '#555', fontSize: '0.85rem' }}>{groupName} ({students.length})</h5>
                                </div>
                                {students.map(s => (
                                    <div key={s._id} style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #eee', fontSize: '0.9rem' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{s.firstName} {s.lastName}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="pill" style={{ background: '#f0f0f0' }}>{s.level || '?'}</span>
                                            <select 
                                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem' }}
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
                                    </div>
                                ))}
                            </div>
                        ))}

                        {/* Promoted Unassigned */}
                        {Object.entries(groupedPromotedStudents).map(([groupName, students]) => (
                            <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ borderBottom: '1px solid #ffd591', paddingBottom: 4, marginBottom: 4 }}>
                                    <h5 style={{ margin: 0, color: '#d46b08', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{groupName} ({students.length})</h5>
                                </div>
                                {students.map(s => (
                                    <div key={s._id} style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ffd591', fontSize: '0.9rem' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.firstName} {s.lastName}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8 }}>
                                            Promu de {s.promotion?.from} vers {s.promotion?.to}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="pill" style={{ background: '#fff7e6', color: '#d46b08' }}>{s.level || '?'}</span>
                                            <select 
                                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem' }}
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
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ImportStudentsModal({ isOpen, onClose, schoolYearId }: { isOpen: boolean; onClose: () => void; schoolYearId: string }) {
  const [csv, setCsv] = useState('')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Reset state when opening
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
      
      // 1. Auto-detect missing headers
      if (lines.length > 0) {
          const firstLine = lines[0].toLowerCase()
          if (!firstLine.includes('firstname') && !firstLine.includes('nom') && !firstLine.includes('prenom')) {
              // Assume data without headers, prepend default headers
              lines = ['FirstName,LastName,level,section', ...lines]
          }
      }

      if (lines.length > 1) {
        let headers = lines[0].split(',').map(h => h.trim())
        
        // 2. Auto-add DateOfBirth if missing
        const dobIdx = headers.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase() === 'dob')
        if (dobIdx === -1) {
            headers.push('DateOfBirth')
            lines = [
                headers.join(','),
                ...lines.slice(1).map(l => `${l},2020-01-01`)
            ]
        }

        // 3. Combine level + section -> ClassName
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
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
        <div style={{
            background: 'white', padding: 24, borderRadius: 12, width: '600px', maxWidth: '90%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Importer des élèves</h3>
                <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#999' }}>✕</button>
            </div>

            <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>1. Fichier CSV</label>
                <div style={{ border: '2px dashed #ddd', padding: 20, borderRadius: 8, textAlign: 'center', background: '#fafafa', marginBottom: 12 }}>
                    <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="csv-upload" />
                    <label htmlFor="csv-upload" style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 500 }}>
                        Cliquez pour sélectionner un fichier
                    </label>
                    <div style={{ fontSize: '0.8rem', color: '#999', marginTop: 4 }}>ou glissez-déposez ici</div>
                </div>
                
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Ou coller le contenu CSV</label>
                <textarea 
                    value={csv} 
                    onChange={e => setCsv(e.target.value)} 
                    rows={6} 
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9rem' }} 
                    placeholder="FirstName,LastName,level,section..."
                />
                <div className="note" style={{ marginTop: 4 }}>Format attendu: <code>FirstName,LastName,level,section</code></div>
            </div>

            {report && (
                <div style={{ marginBottom: 20, padding: 16, background: report.created > 0 ? '#f6ffed' : '#fffbe6', border: `1px solid ${report.created > 0 ? '#b7eb8f' : '#ffe58f'}`, borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 8px 0' }}>Résultat de l'import</h4>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li>Créés: <b>{report.created}</b></li>
                        <li>Mis à jour: <b>{report.updated}</b></li>
                        <li>Ignorés: <b>{report.ignored}</b></li>
                        <li>Erreurs: <b>{report.errors?.length || 0}</b></li>
                    </ul>
                    {report.errors && report.errors.length > 0 && (
                        <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto', fontSize: '0.85rem', color: 'red' }}>
                            {report.errors.map((e: any, i: number) => <div key={i}>{JSON.stringify(e)}</div>)}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn secondary" onClick={onClose}>Fermer</button>
                <button className="btn" onClick={submit} disabled={loading || !csv.trim()}>
                    {loading ? 'Importation...' : 'Importer les élèves'}
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
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
        <div style={{
            background: 'white', padding: 24, borderRadius: 12, width: '600px', maxWidth: '90%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Affectation en masse</h3>
                <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#999' }}>✕</button>
            </div>

            <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Fichier CSV</label>
                <div style={{ border: '2px dashed #ddd', padding: 20, borderRadius: 8, textAlign: 'center', background: '#fafafa', marginBottom: 12 }}>
                    <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-csv-upload" />
                    <label htmlFor="bulk-csv-upload" style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 500 }}>
                        Cliquez pour sélectionner un fichier
                    </label>
                </div>
                
                <textarea 
                    value={csv} 
                    onChange={e => setCsv(e.target.value)} 
                    rows={6} 
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ddd', fontFamily: 'monospace', fontSize: '0.9rem' }} 
                    placeholder="StudentId,FirstName,LastName,PreviousClass,TargetLevel,NextClass..."
                />
                <div className="note" style={{ marginTop: 4 }}>Colonnes requises: <code>StudentId, NextClass</code> (ex: "MS A")</div>
            </div>

            {report && (
                <div style={{ marginBottom: 20, padding: 16, background: report.success > 0 ? '#f6ffed' : '#fffbe6', border: `1px solid ${report.success > 0 ? '#b7eb8f' : '#ffe58f'}`, borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 8px 0' }}>Résultat</h4>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li>Affectés: <b>{report.success}</b></li>
                        <li>Erreurs: <b>{report.errors?.length || 0}</b></li>
                    </ul>
                    {report.errors && report.errors.length > 0 && (
                        <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto', fontSize: '0.85rem', color: 'red' }}>
                            {report.errors.map((e: any, i: number) => <div key={i}>{JSON.stringify(e)}</div>)}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn secondary" onClick={onClose}>Fermer</button>
                <button className="btn" onClick={submit} disabled={loading || !csv.trim()}>
                    {loading ? 'Traitement...' : 'Lancer l\'affectation'}
                </button>
            </div>
        </div>
    </div>
  )
}
