import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type StudentLite = { _id: string; firstName: string; lastName: string }

export default function TeacherDashboard() {
  const [students, setStudents] = useState<StudentLite[]>([])

  useEffect(() => {
    // Placeholder: would call /classes/:id/students depending on teacher scope
    setStudents([])
  }, [])

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Mes élèves</h2>
        <div className="note">Sélectionnez un élève pour ouvrir son carnet.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
          {students.map(s => (
            <div key={s._id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img className="avatar" src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${s.firstName}-${s.lastName}`} />
              <div style={{ flex: 1 }}>
                <div className="title">{s.firstName} {s.lastName}</div>
                <Link className="btn" to={`/student/${s._id}`}>Ouvrir le carnet</Link>
              </div>
            </div>
          ))}
          {students.length === 0 && <div className="note">Aucun élève affiché (données de démonstration à ajouter).</div>}
        </div>
      </div>
    </div>
  )
}
