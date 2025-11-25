import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type Block = { type: string; props: any }
type Page = { title?: string; layout?: string; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Year = { _id: string; name: string }
type ClassDoc = { _id: string; name: string; schoolYearId: string }
type StudentDoc = { _id: string; firstName: string; lastName: string }

function SampleTemplate(): Template {
  return {
    name: 'Carnet coloré',
    pages: [
      {
        title: 'Page de garde',
        layout: 'single',
        blocks: [
          { type: 'image', props: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Eo_circle_pink_blank.svg/480px-Eo_circle_pink_blank.svg.png' } },
          { type: 'student_info', props: { fields: ['name','class','dob'] } },
          { type: 'text', props: { text: 'Bienvenue au carnet scolaire', size: 16 } },
        ],
      },
      {
        title: 'Compétences',
        layout: 'single',
        blocks: [
          { type: 'competency_list', props: {} },
        ],
      },
    ],
  }
}

export default function Templates() {
  const [list, setList] = useState<Template[]>([])
  const [tpl, setTpl] = useState<Template>(SampleTemplate())
  const [studentId, setStudentId] = useState('')
  const [yearId, setYearId] = useState('')
  const [classId, setClassId] = useState('')
  const [years, setYears] = useState<Year[]>([])
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [students, setStudents] = useState<StudentDoc[]>([])

  const load = async () => {
    const r = await api.get('/templates')
    setList(r.data)
  }
  const loadYears = async () => { const r = await api.get('/school-years'); setYears(r.data) }
  const loadClasses = async (yr: string) => { const r = await api.get('/classes', { params: { schoolYearId: yr } }); setClasses(r.data) }
  const loadStudents = async (cls: string) => { const r = await api.get(`/students/by-class/${cls}`); setStudents(r.data) }
  useEffect(() => { load(); loadYears() }, [])
  useEffect(() => { if (yearId) { loadClasses(yearId); setClassId(''); setStudents([]); setStudentId('') } }, [yearId])
  useEffect(() => { if (classId) { loadStudents(classId); setStudentId('') } }, [classId])

  const save = async () => {
    if (tpl._id) {
      await api.patch(`/templates/${tpl._id}`, tpl)
    } else {
      const r = await api.post('/templates', tpl)
      setTpl(r.data)
    }
    await load()
  }

  const previewUrl = tpl._id && studentId ? `http://localhost:4000/pdf/student/${studentId}?templateId=${tpl._id}` : ''
  const bulkUrl = tpl._id && classId ? `http://localhost:4000/pdf/class/${classId}/batch?templateId=${tpl._id}` : ''

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="title" style={{ margin: 0 }}>Templates de carnets (JSON Avancé)</h2>
          <Link to="/admin/template-builder" className="btn">Aller à l'éditeur visuel</Link>
        </div>
        <div className="grid2">
          <div className="card">
            <h3>Éditeur JSON</h3>
            <input placeholder="Nom du template" value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', marginBottom: 8 }} />
            <textarea rows={12} value={JSON.stringify(tpl, null, 2)} onChange={e => setTpl(JSON.parse(e.target.value))} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn" onClick={save}>Enregistrer</button>
              <select value={yearId} onChange={e => setYearId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
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
              {previewUrl && <a className="btn secondary" href={previewUrl} target="_blank">Aperçu PDF</a>}
              {bulkUrl && <a className="btn secondary" href={bulkUrl} target="_blank">Export classe (ZIP)</a>}
            </div>
          </div>
          <div className="card">
            <h3>Templates existants</h3>
            {list.map(item => (
              <div key={item._id} className="competency">
                <div>{item.name}</div>
                <div className="toolbar">
                  <button className="btn" onClick={() => setTpl(item)}>Ouvrir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
