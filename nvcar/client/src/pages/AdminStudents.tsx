import { useState, useEffect } from 'react'
import api from '../api'

export default function AdminStudents() {
  // Create Form State
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [classId, setClassId] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [result, setResult] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)

  // List State
  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [studentHistory, setStudentHistory] = useState<any[]>([])

  useEffect(() => {
    loadStudents()
  }, [])

  const loadStudents = async () => {
    const r = await api.get('/students')
    setStudents(r.data)
  }

  const submit = async () => {
    const r = await api.post('/students', { firstName, lastName, dateOfBirth, classId, parentName, parentPhone })
    setResult(r.data)
    setFirstName(''); setLastName(''); setDateOfBirth(''); setParentName(''); setParentPhone('')
    loadStudents()
  }

  const selectStudent = async (s: any) => {
    setSelectedStudent(s)
    // Fetch full details including enrollments
    const r = await api.get(`/students/${s._id}`)
    setSelectedStudent(r.data)
    // Process history from enrollments
    if (r.data.enrollments) {
        // We need to fetch school years to map IDs to names if not present
        // For now assuming enrollments have enough info or we fetch years separately
        // Actually enrollments just have schoolYearId. We might need to fetch years map.
        const yearsRes = await api.get('/school-years')
        const yearsMap = new Map(yearsRes.data.map((y: any) => [y._id, y]))
        
        const history = r.data.enrollments.map((e: any) => ({
            year: yearsMap.get(e.schoolYearId)?.name || 'Unknown Year',
            status: e.status,
            promotionStatus: e.promotionStatus || 'N/A',
            className: e.className || e.classId || '-'
        }))
        setStudentHistory(history)
    }
  }

  const filteredStudents = students.filter(s => 
    s.firstName.toLowerCase().includes(search.toLowerCase()) || 
    s.lastName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="title">Gestion des Élèves</h2>
            <button className="btn secondary" onClick={() => setShowCreate(!showCreate)}>
                {showCreate ? 'Fermer Création' : 'Nouvel Élève'}
            </button>
        </div>

        {showCreate && (
            <div className="card" style={{ background: '#f9f9f9', marginTop: 10 }}>
                <h3>Ajouter un élève</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <input placeholder="Prénom" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Nom" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Date de naissance (YYYY-MM-DD)" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="ID Classe (Optionnel)" value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Nom du parent" value={parentName} onChange={e => setParentName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Téléphone du parent" value={parentPhone} onChange={e => setParentPhone(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                </div>
                <button className="btn" onClick={submit} style={{ marginTop: 10 }}>Ajouter</button>
                {result && <div className="note">Élève créé: {result.firstName} {result.lastName}</div>}
            </div>
        )}

        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
            <div>
                <input 
                    placeholder="Rechercher un élève..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', marginBottom: 10 }} 
                />
                <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {filteredStudents.map(s => (
                        <div 
                            key={s._id} 
                            onClick={() => selectStudent(s)}
                            style={{ 
                                padding: 10, 
                                borderRadius: 8, 
                                border: '1px solid #eee', 
                                cursor: 'pointer',
                                background: selectedStudent?._id === s._id ? '#eef' : 'white'
                            }}
                        >
                            <strong>{s.firstName} {s.lastName}</strong>
                            <div style={{ fontSize: '0.8em', color: '#666' }}>{s.className || 'Sans classe'}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                {selectedStudent ? (
                    <div className="card">
                        <h3>{selectedStudent.firstName} {selectedStudent.lastName}</h3>
                        <div className="grid2">
                            <div>
                                <label>Date de naissance</label>
                                <div>{new Date(selectedStudent.dateOfBirth).toLocaleDateString()}</div>
                            </div>
                            <div>
                                <label>Parent</label>
                                <div>{selectedStudent.parentName} ({selectedStudent.parentPhone})</div>
                            </div>
                            <div>
                                <label>Statut Actuel</label>
                                <div>{selectedStudent.status || 'Active'}</div>
                            </div>
                        </div>

                        <h4 style={{ marginTop: 20 }}>Historique Scolaire</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f0f0f0', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>Année</th>
                                    <th style={{ padding: 8 }}>Classe</th>
                                    <th style={{ padding: 8 }}>Statut</th>
                                    <th style={{ padding: 8 }}>Décision</th>
                                </tr>
                            </thead>
                            <tbody>
                                {studentHistory.map((h, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: 8 }}>{h.year}</td>
                                        <td style={{ padding: 8 }}>{h.className}</td>
                                        <td style={{ padding: 8 }}>{h.status}</td>
                                        <td style={{ padding: 8 }}>
                                            <span className={`pill ${h.promotionStatus === 'promoted' ? 'green' : h.promotionStatus === 'retained' ? 'red' : 'grey'}`}>
                                                {h.promotionStatus}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {studentHistory.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 10, textAlign: 'center' }}>Aucun historique disponible</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="note">Sélectionnez un élève pour voir les détails</div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}
