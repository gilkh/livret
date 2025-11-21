import { useState } from 'react'
import api from '../api'

export default function AdminStudents() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [classId, setClassId] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [result, setResult] = useState<any>(null)

  const submit = async () => {
    const r = await api.post('/students', { firstName, lastName, dateOfBirth, classId, parentName, parentPhone })
    setResult(r.data)
    setFirstName(''); setLastName(''); setDateOfBirth(''); setParentName(''); setParentPhone('')
  }

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Ajouter un élève</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Prénom" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Nom" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Date de naissance (YYYY-MM-DD)" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="ID Classe" value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Nom du parent" value={parentName} onChange={e => setParentName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Téléphone du parent" value={parentPhone} onChange={e => setParentPhone(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button className="btn" onClick={submit}>Ajouter</button>
          {result && <div className="note">Élève créé: {result.firstName} {result.lastName}</div>}
        </div>
      </div>
    </div>
  )
}
