import { useEffect, useState, useMemo } from 'react'
import api from '../api'

const StudentPromotions = ({ levels, classes, students, activeSchoolYearId, onRefresh }: { levels: any[], classes: any[], students: any[], activeSchoolYearId: string, onRefresh: () => void }) => {
    const [selectedLevel, setSelectedLevel] = useState('')
    const [selectedClass, setSelectedClass] = useState('')
    const [promoting, setPromoting] = useState<string | null>(null)
    
    const filteredClasses = useMemo(() => {
        if (!selectedLevel) return []
        return classes.filter(c => c.level === selectedLevel)
    }, [classes, selectedLevel])

    const filteredStudents = useMemo(() => {
        if (!selectedClass) return []
        return students.filter(s => s.classId === selectedClass)
    }, [students, selectedClass])

    const handlePromote = async (studentId: string, currentLevel: string) => {
        if (!confirm("Confirmer le passage de cet élève au niveau supérieur ?")) return
        setPromoting(studentId)
        try {
            await api.post(`/students/${studentId}/promote`, {})
            alert("Élève promu avec succès")
            onRefresh()
        } catch (e: any) {
            alert("Erreur: " + (e.response?.data?.message || e.message))
        } finally {
            setPromoting(null)
        }
    }

    return (
        <div className="card" style={{ padding: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'center' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Niveau</label>
                    <select 
                        value={selectedLevel} 
                        onChange={e => { setSelectedLevel(e.target.value); setSelectedClass('') }}
                        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                        <option value="">-- Choisir --</option>
                        {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                    </select>
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Classe</label>
                    <select 
                        value={selectedClass} 
                        onChange={e => setSelectedClass(e.target.value)} 
                        disabled={!selectedLevel}
                        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', opacity: !selectedLevel ? 0.5 : 1 }}
                    >
                        <option value="">-- Choisir --</option>
                        {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                 </div>
            </div>

            {selectedClass && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee', color: '#64748b', fontSize: 13 }}>
                            <th style={{ padding: 10 }}>Élève</th>
                            <th style={{ padding: 10 }}>Niveau Actuel</th>
                            <th style={{ padding: 10 }}>Statut</th>
                            <th style={{ padding: 10 }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.map(s => {
                            const isPromoted = s.promotions?.some((p: any) => p.schoolYearId === activeSchoolYearId)
                            return (
                                <tr key={s._id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                    <td style={{ padding: 10 }}>{s.firstName} {s.lastName}</td>
                                    <td style={{ padding: 10 }}>{s.level}</td>
                                    <td style={{ padding: 10 }}>
                                        {isPromoted ? (
                                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Promu</span>
                                        ) : (
                                            <span style={{ color: '#64748b', fontSize: 12 }}>En cours</span>
                                        )}
                                    </td>
                                    <td style={{ padding: 10 }}>
                                        {!isPromoted && (
                                            <button 
                                                className="btn" 
                                                onClick={() => handlePromote(s._id, s.level)}
                                                disabled={promoting === s._id}
                                                style={{ padding: '4px 12px', fontSize: 12, height: 'auto' }}
                                            >
                                                {promoting === s._id ? '...' : 'Promouvoir'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredStudents.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun élève dans cette classe.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export default function AdminStudentPromotions() {
    // Options for dropdowns
    const [levels, setLevels] = useState<any[]>([])
    const [classes, setClasses] = useState<any[]>([])
    const [students, setStudents] = useState<any[]>([])
    const [activeSchoolYearId, setActiveSchoolYearId] = useState('')

    const loadOptions = async () => {
        try {
            const [resLevels, resYears] = await Promise.all([
                api.get('/levels'),
                api.get('/school-years')
            ])
            setLevels(resLevels.data)
            
            const activeYear = resYears.data.find((y: any) => y.active)
            if (activeYear) {
                setActiveSchoolYearId(activeYear._id)
                const [resClasses, resStudents] = await Promise.all([
                    api.get(`/classes?schoolYearId=${activeYear._id}`),
                    api.get(`/students?schoolYearId=${activeYear._id}`)
                ])
                setClasses(resClasses.data)
                setStudents(resStudents.data)
            }
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => {
        loadOptions()
    }, [])

    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
            {/* Student Promotions Section */}
            <div style={{ marginTop: 40, marginBottom: 32 }}>
                <h2 className="title" style={{ fontSize: 20, marginBottom: 8 }}>Passage des Élèves (Admin)</h2>
                <p className="note" style={{ fontSize: 16, color: '#64748b' }}>
                    Promouvoir les élèves au niveau supérieur sans restriction de signature.
                </p>
            </div>

            <StudentPromotions 
                levels={levels} 
                classes={classes} 
                students={students} 
                activeSchoolYearId={activeSchoolYearId}
                onRefresh={loadOptions}
            />
        </div>
    )
}
