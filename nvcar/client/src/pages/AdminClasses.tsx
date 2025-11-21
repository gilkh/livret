import { useEffect, useState } from 'react'
import api from '../api'

type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }

export default function AdminClasses() {
  const [list, setList] = useState<ClassDoc[]>([])
  const [name, setName] = useState('KG1 A')
  const [level, setLevel] = useState('KG1')
  const [schoolYearId, setSchoolYearId] = useState('')

  const load = async () => { const r = await api.get('/classes'); setList(r.data) }
  useEffect(() => { load() }, [])

  const createClass = async () => {
    await api.post('/classes', { name, level, schoolYearId })
    setName(''); setLevel(''); setSchoolYearId('')
    await load()
  }

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Classes</h2>
        <div className="grid2">
          <div className="card">
            <h3>Ajouter une classe</h3>
            <input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Niveau" value={level} onChange={e => setLevel(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="ID Année scolaire" value={schoolYearId} onChange={e => setSchoolYearId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <button className="btn" onClick={createClass}>Créer</button>
          </div>
          <div className="card">
            <h3>Liste des classes</h3>
            {list.map(c => (
              <div key={c._id} className="competency">
                <div>{c.name} • {c.level} • Year: {c.schoolYearId}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
