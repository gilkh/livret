import { useEffect, useMemo, useState } from 'react'
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

  const resetYearForm = () => { setEditingYearId(null); setName(''); setStartDate(''); setEndDate(''); setActive(true) }

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
      <div className="card">
        <h2 className="title">Ressource</h2>
        <div className="grid2">
          <div className="card">
            <h3>1) Créer ou modifier l'année scolaire</h3>
            <input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Début" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Fin" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" onClick={saveYear}>{editingYearId ? 'Mettre à jour' : 'Enregistrer l\'année'}</button>
              {editingYearId && <button className="btn secondary" onClick={resetYearForm}>Annuler</button>}
            </div>
            <div className="note" style={{ marginTop: 8 }}>Sélectionnez une année existante:</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {years.map(y => (
                <button key={y._id} className={selectedYear?._id === y._id ? 'btn' : 'btn secondary'} onClick={() => selectYear(y)}>
                  {y.name}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>2) Classes de l'année sélectionnée</h3>
            {!selectedYear && <div className="note">Créez ou sélectionnez d'abord une année.</div>}
            {selectedYear && (
              <>
                <input placeholder="Nom de la classe" value={clsName} onChange={e => setClsName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Niveau (optionnel)" value={clsLevel} onChange={e => setClsLevel(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={saveClass}>{editingClassId ? 'Mettre à jour' : 'Ajouter la classe'}</button>
                  {editingClassId && <button className="btn secondary" onClick={resetClassForm}>Annuler</button>}
                </div>
                <div style={{ marginTop: 8 }}>
                  <h4>Classes</h4>
                  {classes.map(c => (
                    <div key={c._id} className="competency" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ cursor: 'pointer' }} onClick={() => selectClass(c._id)}>
                        <div>{c.name} • {c.level}</div>
                        <div className="pill">{selectedClassId === c._id ? 'Sélectionnée' : 'Sélectionner'}</div>
                      </div>
                      <button className="btn secondary" onClick={() => startEditClass(c)}>Modifier</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <h4>Import CSV élèves (affectation par classe)</h4>
                  <InlineImportCSV schoolYearId={selectedYear._id} />
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h3>3) Élèves de la classe sélectionnée</h3>
            {!selectedClassId && <div className="note">Sélectionnez une classe pour gérer ses élèves.</div>}
            {selectedClassId && (
              <>
                <input placeholder="Prénom" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Nom" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={saveStudent}>{editingStudentId ? 'Mettre à jour' : 'Ajouter l\'élève'}</button>
                  {editingStudentId && <button className="btn secondary" onClick={resetStudentForm}>Annuler</button>}
                </div>
                <div style={{ marginTop: 8 }}>
                  <h4>Élèves</h4>
                  {students.map(s => (
                    <div key={s._id} className="competency" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>{s.firstName} {s.lastName}</div>
                      <button className="btn secondary" onClick={() => startEditStudent(s)}>Modifier</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InlineImportCSV({ schoolYearId }: { schoolYearId: string }) {
  const [csv, setCsv] = useState('FirstName,LastName,level,section\nLara,Haddad,KG1,A')
  const [report, setReport] = useState<any>(null)
  const [mappingText, setMappingText] = useState('')
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
  return (
    <div>
      <div className="note">Format initial: <code>FirstName,LastName,level,section</code>. Nous créerons automatiquement la colonne <code>ClassName</code> en combinant <code>level</code> et <code>section</code>.</div>
      <input type="file" accept=".csv" onChange={onFile} />
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd', marginTop: 8 }} />
      <div className="note">Optionnel: Mapping JSON des colonnes (ex: {`{"firstName":"Prenom","section":"ClassName"}`}).</div>
      <textarea value={mappingText} onChange={e => setMappingText(e.target.value)} rows={3} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd', marginTop: 8 }} />
      <div style={{ marginTop: 8 }}>
        <button className="btn" onClick={submit}>Importer</button>
      </div>
      {report && (
        <div className="note" style={{ marginTop: 8 }}>{report.summary}</div>
      )}
    </div>
  )
}
