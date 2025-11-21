import { useEffect, useState } from 'react'
import api from '../api'

type Year = { _id: string; name: string; startDate: string; endDate: string; active: boolean }

export default function AdminSchoolYears() {
  const [list, setList] = useState<Year[]>([])
  const [name, setName] = useState('2025/2026')
  const [startDate, setStartDate] = useState('2025-09-01')
  const [endDate, setEndDate] = useState('2026-06-30')
  const [active, setActive] = useState(true)

  const load = async () => { const r = await api.get('/school-years'); setList(r.data) }
  useEffect(() => { load() }, [])

  const createYear = async () => {
    await api.post('/school-years', { name, startDate, endDate, active })
    setName(''); setStartDate(''); setEndDate(''); setActive(true)
    await load()
  }

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Années scolaires</h2>
        <div className="grid2">
          <div className="card">
            <h3>Ajouter</h3>
            <input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Début" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Fin" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
            </label>
            <button className="btn" onClick={createYear}>Créer</button>
          </div>
          <div className="card">
            <h3>Liste</h3>
            {list.map(y => (
              <div key={y._id} className="competency">
                <div>{y.name} • {new Date(y.startDate).toLocaleDateString()} → {new Date(y.endDate).toLocaleDateString()}</div>
                <div className="pill">{y.active ? 'Active' : 'Inactif'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
