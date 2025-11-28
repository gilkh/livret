import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type Year = { _id: string; name: string; startDate: string; endDate: string; active: boolean }
type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }
type StudentDoc = { _id: string; firstName: string; lastName: string; dateOfBirth: string; parentName?: string; parentPhone?: string }

export default function AdminResources() {
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState<Year | null>(null)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [active, setActive] = useState(true)
  const [editingYearId, setEditingYearId] = useState<string | null>(null)

  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [clsName, setClsName] = useState('')
  const [clsLevel, setClsLevel] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [editingClassId, setEditingClassId] = useState<string | null>(null)

  const [students, setStudents] = useState<StudentDoc[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)

  const loadYears = async () => { const r = await api.get('/school-years'); setYears(r.data) }
  useEffect(() => { loadYears() }, [])

  const loadClasses = async (yearId: string) => { const r = await api.get('/classes', { params: { schoolYearId: yearId } }); setClasses(r.data) }
  const loadStudents = async (classId: string) => { const r = await api.get(`/students/by-class/${classId}`); setStudents(r.data) }

  const selectYear = async (y: Year) => {
    setSelectedYear(y)
    setEditingYearId(y._id)
    setName(y.name)
    setStartDate(y.startDate?.slice(0,10) || '')
    setEndDate(y.endDate?.slice(0,10) || '')
    setActive(!!y.active)
    await loadClasses(y._id)
    setSelectedClassId('')
    setStudents([])
    setEditingClassId(null)
    resetStudentForm()
  }

  const saveYear = async () => {
    if (editingYearId) {
      const r = await api.patch(`/school-years/${editingYearId}`, { name, startDate, endDate, active })
      await loadYears()
      await selectYear(r.data)
    } else {
      const r = await api.post('/school-years', { name, startDate, endDate, active })
      await loadYears()
      await selectYear(r.data)
    }
  }

  const resetYearForm = () => { setEditingYearId(null); setName(''); setStartDate(''); setEndDate(''); setActive(true); setSelectedYear(null); setClasses([]); setStudents([]); }

  const startEditClass = async (c: ClassDoc) => {
    setEditingClassId(c._id)
    setSelectedClassId(c._id)
    setClsName(c.name)
    setClsLevel(c.level || '')
    await loadStudents(c._id)
  }

  const saveClass = async () => {
    if (!selectedYear) return
    if (editingClassId) {
      await api.patch(`/classes/${editingClassId}`, { name: clsName, level: clsLevel, schoolYearId: selectedYear._id })
    } else {
      const r = await api.post('/classes', { name: clsName, level: clsLevel, schoolYearId: selectedYear._id })
      setSelectedClassId(r.data._id)
    }
    setClsName(''); setClsLevel(''); setEditingClassId(null)
    await loadClasses(selectedYear._id)
    if (selectedClassId) await loadStudents(selectedClassId)
  }

  const resetClassForm = () => { setEditingClassId(null); setClsName(''); setClsLevel('') }
  const selectClass = async (classId: string) => { setSelectedClassId(classId); setEditingClassId(null); await loadStudents(classId); resetStudentForm() }

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

  return (
    <div className="container">
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h2 className="title" style={{ fontSize: '2rem', marginBottom: 8 }}>Gestion des ressources</h2>
            <p className="note">Gérez les années scolaires, les classes et les élèves</p>
        </div>
        <Link to="/admin" className="btn secondary">Retour</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24, alignItems: 'start' }}>
        
        {/* Column 1: Years */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8, fontSize: 20 }}>📅</div>
            <h3 style={{ margin: 0 }}>Années Scolaires</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            <input placeholder="Nom (ex: 2023-2024)" value={name} onChange={e => setName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="date" placeholder="Début" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input type="date" placeholder="Fin" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 16, height: 16 }} /> 
              <span>Année active</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={saveYear} style={{ flex: 1 }}>{editingYearId ? 'Mettre à jour' : 'Créer année'}</button>
              {editingYearId && <button className="btn secondary" onClick={resetYearForm}>Annuler</button>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 400 }}>
            {years.map(y => (
              <div 
                key={y._id} 
                onClick={() => selectYear(y)}
                style={{ 
                    padding: 12, 
                    borderRadius: 8, 
                    border: selectedYear?._id === y._id ? '2px solid #1890ff' : '1px solid #f0f0f0',
                    background: selectedYear?._id === y._id ? '#e6f7ff' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{y.name}</span>
                    {y.active && <span className="pill" style={{ background: '#f6ffed', color: '#52c41a', fontSize: '0.7rem', padding: '2px 8px' }}>Active</span>}
                </div>
                <div className="note" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                    {y.startDate?.slice(0,10)} - {y.endDate?.slice(0,10)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Classes */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', opacity: selectedYear ? 1 : 0.6, pointerEvents: selectedYear ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ background: '#fff0f6', padding: 8, borderRadius: 8, fontSize: 20 }}>🏫</div>
            <h3 style={{ margin: 0 }}>Classes</h3>
          </div>

          {!selectedYear ? (
             <div className="note" style={{ textAlign: 'center', padding: 20 }}>Sélectionnez une année pour gérer les classes</div>
          ) : (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                    <input placeholder="Nom de la classe" value={clsName} onChange={e => setClsName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Niveau (optionnel)" value={clsLevel} onChange={e => setClsLevel(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={saveClass} style={{ flex: 1 }}>{editingClassId ? 'Mettre à jour' : 'Ajouter classe'}</button>
                    {editingClassId && <button className="btn secondary" onClick={resetClassForm}>Annuler</button>}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 400, marginBottom: 24 }}>
                    {classes.map(c => (
                    <div key={c._id} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 8,
                        border: selectedClassId === c._id ? '2px solid #eb2f96' : '1px solid #f0f0f0',
                        background: selectedClassId === c._id ? '#fff0f6' : '#fff',
                        cursor: 'pointer'
                    }}>
                        <div onClick={() => selectClass(c._id)} style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            {c.level && <div className="note">{c.level}</div>}
                        </div>
                        <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); startEditClass(c); }}>✏️</button>
                    </div>
                    ))}
                    {classes.length === 0 && <div className="note" style={{ textAlign: 'center' }}>Aucune classe</div>}
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#8c8c8c' }}>Import CSV</h4>
                    <InlineImportCSV schoolYearId={selectedYear._id} />
                </div>
            </>
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
                        <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => startEditStudent(s)}>✏️</button>
                    </div>
                    ))}
                    {students.length === 0 && <div className="note" style={{ textAlign: 'center' }}>Aucun élève</div>}
                </div>
            </>
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
