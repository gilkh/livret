import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useLevels } from '../context/LevelContext'

type Year = { _id: string; name: string; startDate: string; endDate: string; active: boolean }
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

  return (
    <div className="container">
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h2 className="title" style={{ fontSize: '2rem', marginBottom: 8 }}>Gestion des ressources</h2>
            <p className="note">Gérez les années scolaires, les classes et les élèves</p>
        </div>
        <Link to="/admin" className="btn secondary">Retour</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
        
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
                            await api.patch(`/school-years/${selectedYear._id}/semester`, { semester: 1 })
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
                            await api.patch(`/school-years/${selectedYear._id}/semester`, { semester: 2 })
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
                    <InlineImportCSV schoolYearId={selectedYear._id} />
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

function InlineImportCSV({ schoolYearId }: { schoolYearId: string }) {
  const [csv, setCsv] = useState('FirstName,LastName,level,section\nLara,Haddad,KG1,A')
  const [report, setReport] = useState<any>(null)
  const [mappingText, setMappingText] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const onFile = async (e: any) => {
    const f = e.target.files?.[0]
    if (!f) return
    const txt = await f.text()
    setCsv(txt)
  }
  const submit = async () => {
    let mapping
    try { mapping = mappingText ? JSON.parse(mappingText) : undefined } catch {}
    let processedCsv = csv
    try {
      const lines = processedCsv.split(/\r?\n/).filter(l => l.trim().length > 0)
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim())
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
        }
      }
    } catch {}
    const r = await api.post('/import/students', { csv: processedCsv, schoolYearId, dryRun: false, mapping })
    setReport(r.data)
  }
  
  if (!isOpen) {
      return <button className="btn secondary" style={{ width: '100%', fontSize: '0.9rem' }} onClick={() => setIsOpen(true)}>Importer des élèves (CSV)</button>
  }

  return (
    <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>Import CSV</span>
        <button style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setIsOpen(false)}>✕</button>
      </div>
      <div className="note" style={{ marginBottom: 8 }}>Format: <code>FirstName,LastName,level,section</code></div>
      <input type="file" accept=".csv" onChange={onFile} style={{ fontSize: '0.8rem', marginBottom: 8, width: '100%' }} />
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={4} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: '0.8rem', fontFamily: 'monospace' }} />
      <div className="note" style={{ marginTop: 8 }}>Mapping JSON (optionnel):</div>
      <textarea value={mappingText} onChange={e => setMappingText(e.target.value)} rows={2} placeholder='{"firstName":"Prenom"}' style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: '0.8rem', fontFamily: 'monospace' }} />
      <div style={{ marginTop: 8 }}>
        <button className="btn" onClick={submit} style={{ width: '100%' }}>Importer</button>
      </div>
      {report && (
        <div className="note" style={{ marginTop: 8, padding: 8, background: '#e6f7ff', borderRadius: 4 }}>{report.summary}</div>
      )}
    </div>
  )
}
