import { useEffect, useMemo, useState } from 'react'
import api from '../api'

type Year = { _id: string; name: string; startDate: string; endDate: string; active: boolean }
type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }

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
    <div className="card">
      <h3>Import CSV élèves pour l'année</h3>
      <div className="note">Format initial: <code>FirstName,LastName,level,section</code>. Nous créerons automatiquement la colonne <code>ClassName</code> en combinant <code>level</code> et <code>section</code>.</div>
      <input type="file" accept=".csv" onChange={onFile} />
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd', marginTop: 8 }} />
      <div className="note">Optionnel: Mapping JSON des colonnes (ex: {`{"firstName":"Prenom","section":"ClassName"}`}).</div>
      <textarea value={mappingText} onChange={e => setMappingText(e.target.value)} rows={4} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd', marginTop: 8 }} />
      <div style={{ marginTop: 8 }}>
        <button className="btn" onClick={submit}>Importer</button>
      </div>
      {report && (
        <div className="note" style={{ marginTop: 8 }}>{report.summary}</div>
      )}
    </div>
  )
}

export default function YearSetup() {
  const [createdYear, setCreatedYear] = useState<Year | null>(null)
  const [years, setYears] = useState<Year[]>([])
  const [name, setName] = useState('2025/2026')
  const [startDate, setStartDate] = useState('2025-09-01')
  const [endDate, setEndDate] = useState('2026-06-30')
  const [active, setActive] = useState(true)

  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [clsName, setClsName] = useState('')
  const [clsLevel, setClsLevel] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string>('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [createdStudentMsg, setCreatedStudentMsg] = useState<string>('')

  const canManageClasses = useMemo(() => !!createdYear, [createdYear])
  const canManageStudents = useMemo(() => !!selectedClassId, [selectedClassId])

  const loadYears = async () => { const r = await api.get('/school-years'); setYears(r.data) }
  useEffect(() => { loadYears() }, [])

  const loadClasses = async (yearId: string) => {
    const r = await api.get('/classes', { params: { schoolYearId: yearId } })
    setClasses(r.data)
  }

  const createYear = async () => {
    const r = await api.post('/school-years', { name, startDate, endDate, active })
    setCreatedYear(r.data)
    setName(''); setStartDate(''); setEndDate(''); setActive(true)
    await loadYears()
    await loadClasses(r.data._id)
  }

  const createClass = async () => {
    if (!createdYear) return
    const r = await api.post('/classes', { name: clsName, level: clsLevel, schoolYearId: createdYear._id })
    setClsName(''); setClsLevel('')
    await loadClasses(createdYear._id)
    setSelectedClassId(r.data._id)
  }

  const addStudent = async () => {
    if (!selectedClassId) return
    const resp = await api.post('/students', { firstName, lastName, dateOfBirth, classId: selectedClassId, parentName, parentPhone })
    setCreatedStudentMsg(`Élève créé: ${resp.data.firstName} ${resp.data.lastName}`)
    setFirstName(''); setLastName(''); setDateOfBirth(''); setParentName(''); setParentPhone('')
  }

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Créer année, classes et élèves</h2>
        <div className="grid2">
          <div className="card">
            <h3>1) Créer l'année scolaire</h3>
            <input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Début" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Fin" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
            </label>
            <button className="btn" onClick={createYear}>Créer l'année</button>
            {createdYear && <div className="note" style={{ marginTop: 8 }}>Année créée: {createdYear.name}</div>}
            <div className="note" style={{ marginTop: 8 }}>Ou sélectionnez une année existante ci-dessous:</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {years.map(y => (
                <button key={y._id} className={createdYear?._id === y._id ? 'btn' : 'btn secondary'} onClick={async () => { setCreatedYear(y); await loadClasses(y._id) }}>
                  {y.name}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>2) Ajouter des classes (année sélectionnée)</h3>
            {!canManageClasses && <div className="note">Créez ou sélectionnez d'abord une année.</div>}
            {canManageClasses && (
              <>
                <input placeholder="Nom de la classe" value={clsName} onChange={e => setClsName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Niveau (optionnel)" value={clsLevel} onChange={e => setClsLevel(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <button className="btn" onClick={createClass}>Ajouter la classe</button>
                <div style={{ marginTop: 8 }}>
                  <h4>Classes de l'année</h4>
                  {classes.map(c => (
                    <div key={c._id} className="competency" style={{ cursor: 'pointer' }} onClick={() => setSelectedClassId(c._id)}>
                      <div>{c.name} • {c.level}</div>
                      <div className="pill">{selectedClassId === c._id ? 'Sélectionnée' : 'Sélectionner'}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h3>3) Ajouter des élèves (classe sélectionnée)</h3>
            {!canManageStudents && <div className="note">Sélectionnez une classe pour ajouter des élèves.</div>}
            {canManageStudents && (
              <>
                <input placeholder="Prénom" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Nom" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Date de naissance (YYYY-MM-DD)" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Nom du parent" value={parentName} onChange={e => setParentName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Téléphone du parent" value={parentPhone} onChange={e => setParentPhone(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <button className="btn" onClick={addStudent}>Ajouter l'élève</button>
                {createdStudentMsg && <div className="note" style={{ marginTop: 8 }}>{createdStudentMsg}</div>}
              </>
            )}
          </div>
          <div className="card">
            <h3>4) Import CSV (année sélectionnée)</h3>
            {!canManageClasses && <div className="note">Créez ou sélectionnez d'abord une année pour l'import.</div>}
            {canManageClasses && createdYear && (
              <InlineImportCSV schoolYearId={createdYear._id} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
