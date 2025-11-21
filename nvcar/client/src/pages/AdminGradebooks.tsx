import { useEffect, useState } from 'react'
import api from '../api'

export default function AdminGradebooks() {
  const [years, setYears] = useState<any[]>([])
  const [year, setYear] = useState<any | null>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<any[]>([])
  const [studentId, setStudentId] = useState('')
  const [templates, setTemplates] = useState<any[]>([])
  const [templateId, setTemplateId] = useState('')
  const [pwd, setPwd] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const loadYears = async () => { const r = await api.get('/school-years'); setYears(r.data) }
  const loadClasses = async (yr: string) => { const r = await api.get('/classes', { params: { schoolYearId: yr } }); setClasses(r.data) }
  const loadStudents = async (cls: string) => { const r = await api.get(`/students/by-class/${cls}`); setStudents(r.data) }
  const loadTemplates = async () => { const r = await api.get('/templates'); setTemplates(r.data) }
  const listSaved = async () => { if (!year || !classId) { setFiles([]); return } const r = await api.get('/media/list', { params: { folder: `gradebooks/${year._id}/${classId}` } }); setFiles(r.data) }
  useEffect(() => { loadYears(); loadTemplates() }, [])
  useEffect(() => { if (year) { loadClasses(year._id); setClassId(''); setStudents([]); setFiles([]) } }, [year])
  useEffect(() => { if (classId) { loadStudents(classId); listSaved() } }, [classId])
  const uploadBlob = async (folder: string, filename: string, blob: Blob, mime: string) => {
    const fd = new FormData()
    fd.append('file', new File([blob], filename, { type: mime }))
    await fetch(`http://localhost:4000/media/upload?folder=${encodeURIComponent(folder)}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
  }
  const saveStudent = async () => {
    if (!year || !classId || !studentId) return
    const q: string[] = []
    if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
    if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
    const url = `http://localhost:4000/pdf/student/${studentId}${q.length ? '?' + q.join('&') : ''}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
    const blob = await r.blob()
    const name = `student-${studentId}.pdf`
    await uploadBlob(`gradebooks/${year._id}/${classId}`, name, blob, 'application/pdf')
    await listSaved()
  }
  const saveClass = async () => {
    if (!year || !classId) return
    const q: string[] = []
    if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
    if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
    const url = `http://localhost:4000/pdf/class/${classId}/batch${q.length ? '?' + q.join('&') : ''}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
    const blob = await r.blob()
    const name = `class-${classId}.zip`
    await uploadBlob(`gradebooks/${year._id}/${classId}`, name, blob, 'application/zip')
    await listSaved()
  }
  const saveYear = async () => {
    if (!year) return
    for (const c of classes) {
      const q: string[] = []
      if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
      if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
      const url = `http://localhost:4000/pdf/class/${c._id}/batch${q.length ? '?' + q.join('&') : ''}`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
      const blob = await r.blob()
      const name = `class-${c._id}.zip`
      await uploadBlob(`gradebooks/${year._id}/${c._id}`, name, blob, 'application/zip')
    }
    await listSaved()
  }
  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Carnets sauvegardés</h2>
        <div className="toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={year?._id || ''} onChange={e => { const y = years.find(yy => yy._id === e.target.value); setYear(y || null) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Année</option>
            {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
          </select>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Classe</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Élève</option>
            {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
          </select>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Modèle</option>
            {templates.map(t => <option key={String(t._id)} value={String(t._id)}>{t.name}</option>)}
          </select>
          <input placeholder="Mot de passe export (si requis)" value={pwd} onChange={e => setPwd(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
        </div>
        <div className="toolbar" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={saveYear}>Sauvegarder année</button>
          <button className="btn" onClick={saveClass}>Sauvegarder classe</button>
          <button className="btn" onClick={saveStudent}>Sauvegarder élève</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <h4>Fichiers enregistrés</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {files.map(u => (
              <div key={u} className="card" style={{ padding: 8 }}>
                <div>{u.split('/').pop()}</div>
                <div className="toolbar" style={{ marginTop: 6 }}>
                  <a className="btn secondary" href={`http://localhost:4000/uploads${u}`} target="_blank">Télécharger</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
