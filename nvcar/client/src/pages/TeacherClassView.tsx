import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'

type Student = { _id: string; firstName: string; lastName: string; dateOfBirth: Date }
type Assignment = {
    _id: string
    studentId: string
    isCompleted?: boolean
    template?: { name: string }
    student?: Student
}
type CompletionStats = {
    totalAssignments: number
    completedAssignments: number
    completionPercentage: number
}

export default function TeacherClassView() {
    const { classId } = useParams<{ classId: string }>()
    const [students, setStudents] = useState<Student[]>([])
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [stats, setStats] = useState<CompletionStats | null>(null)
    const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [studentsRes, assignmentsRes, statsRes] = await Promise.all([
                    api.get(`/teacher/classes/${classId}/students`),
                    api.get(`/teacher/classes/${classId}/assignments`),
                    api.get(`/teacher/classes/${classId}/completion-stats`),
                ])
                setStudents(studentsRes.data)
                setAssignments(assignmentsRes.data)
                setStats(statsRes.data)
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (classId) loadData()
    }, [classId])

    // Calculate completion per student
    const getStudentCompletion = (studentId: string) => {
        const studentAssignments = assignments.filter(a => a.studentId === studentId)
        const completed = studentAssignments.filter(a => a.isCompleted).length
        const total = studentAssignments.length
        return { completed, total, isFullyComplete: total > 0 && completed === total }
    }

    // Filter students based on completion status
    const filteredStudents = students.filter(student => {
        if (filter === 'all') return true
        const { isFullyComplete } = getStudentCompletion(student._id)
        if (filter === 'completed') return isFullyComplete
        if (filter === 'incomplete') return !isFullyComplete
        return true
    })

    return (
        <div className="container">
            <div className="card">
                <Link to="/teacher/classes" className="btn secondary" style={{ 
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>← Retour aux classes</Link>
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>🏛️ Élèves de la classe</h2>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {stats && (
                    <div style={{ 
                        marginTop: 20, 
                        marginBottom: 20,
                        padding: 20,
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div className="note" style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>
                                📈 Progression de la classe
                            </div>
                            <div style={{ 
                                fontSize: 24, 
                                fontWeight: 'bold', 
                                color: stats.completionPercentage === 100 ? '#10b981' : '#6c5ce7',
                                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                {stats.completionPercentage}%
                            </div>
                        </div>
                        <div className="note" style={{ fontSize: 13, marginBottom: 10, color: '#64748b' }}>
                            {stats.completedAssignments} / {stats.totalAssignments} carnets terminés
                        </div>
                        <div style={{ width: '100%', height: 14, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{
                                width: `${stats.completionPercentage}%`,
                                height: '100%',
                                background: stats.completionPercentage === 100 
                                    ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' 
                                    : 'linear-gradient(90deg, #6c5ce7 0%, #5b4bc4 100%)',
                                transition: 'width 0.5s ease',
                                boxShadow: stats.completionPercentage > 0 ? '0 2px 8px rgba(108, 92, 231, 0.4)' : 'none'
                            }} />
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 20, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="note" style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>🔍 Filtrer:</span>
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value as any)}
                            style={{ 
                                padding: '10px 16px', 
                                borderRadius: 8, 
                                border: '1px solid #cbd5e1',
                                fontSize: 14,
                                fontWeight: 500,
                                color: '#475569',
                                background: 'white',
                                cursor: 'pointer',
                                outline: 'none',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <option value="all">Tous les élèves</option>
                            <option value="completed">Terminés</option>
                            <option value="incomplete">Non terminés</option>
                        </select>
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18, marginTop: 20 }}>
                    {filteredStudents.map(s => {
                        const completion = getStudentCompletion(s._id)
                        const studentAssignments = assignments.filter(a => a.studentId === s._id)
                        return (
                            <div key={s._id} className="card" style={{ 
                                display: 'flex', 
                                flexDirection: 'column',
                                gap: 14, 
                                position: 'relative',
                                transition: 'all 0.3s ease',
                                border: '1px solid #e2e8f0',
                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    {completion.isFullyComplete && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 10,
                                            right: 10,
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            borderRadius: '50%',
                                            width: 28,
                                            height: 28,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 16,
                                            fontWeight: 'bold',
                                            boxShadow: '0 3px 10px rgba(16, 185, 129, 0.4)'
                                        }}>
                                            ✓
                                        </div>
                                    )}
                                    <img className="avatar" src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${s.firstName}-${s.lastName}`} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #e2e8f0' }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="title" style={{ fontSize: 17, marginBottom: 4, color: '#1e293b', fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                                        <div className="note" style={{ fontSize: 13, fontWeight: 500 }}>
                                            {completion.total > 0 ? (
                                                <span style={{ color: completion.isFullyComplete ? '#10b981' : '#6c5ce7' }}>
                                                    📖 {completion.completed}/{completion.total} carnets
                                                </span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>Aucun carnet</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {studentAssignments.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                        {studentAssignments.map(a => (
                                            <Link 
                                                key={a._id} 
                                                to={`/teacher/templates/${a._id}/edit`}
                                                style={{ textDecoration: 'none' }}
                                            >
                                                <div style={{
                                                    padding: '8px 12px',
                                                    background: a.isCompleted ? '#ecfdf5' : 'white',
                                                    border: `1px solid ${a.isCompleted ? '#10b981' : '#e2e8f0'}`,
                                                    borderRadius: 6,
                                                    fontSize: 13,
                                                    color: '#334155',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = '#6c5ce7';
                                                    e.currentTarget.style.transform = 'translateX(2px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = a.isCompleted ? '#10b981' : '#e2e8f0';
                                                    e.currentTarget.style.transform = 'translateX(0)';
                                                }}
                                                >
                                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.template?.name || 'Carnet'}</span>
                                                    {a.isCompleted ? <span style={{ color: '#10b981' }}>✓</span> : <span style={{ color: '#6c5ce7' }}>→</span>}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {!loading && filteredStudents.length === 0 && (
                        <div className="note">
                            {filter === 'all' ? 'Aucun élève dans cette classe.' : `Aucun élève ${filter === 'completed' ? 'terminé' : 'non terminé'}.`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
