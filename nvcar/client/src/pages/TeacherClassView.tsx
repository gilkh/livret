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
                <Link to="/teacher/classes" className="btn secondary" style={{ marginBottom: 16 }}>← Retour aux classes</Link>
                <h2 className="title">Élèves de la classe</h2>

                {loading && <div className="note">Chargement...</div>}
                {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

                {stats && (
                    <div style={{ marginTop: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div className="note" style={{ fontSize: 14 }}>
                                Progression: {stats.completedAssignments} / {stats.totalAssignments} carnets terminés
                            </div>
                            <div className="note" style={{ fontSize: 14, fontWeight: 'bold', color: stats.completionPercentage === 100 ? '#10b981' : '#6c5ce7' }}>
                                {stats.completionPercentage}%
                            </div>
                        </div>
                        <div style={{ width: '100%', height: 12, background: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{
                                width: `${stats.completionPercentage}%`,
                                height: '100%',
                                background: stats.completionPercentage === 100 ? '#10b981' : '#6c5ce7',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 16, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="note">Filtrer:</span>
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value as any)}
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                        >
                            <option value="all">Tous les élèves</option>
                            <option value="completed">Terminés</option>
                            <option value="incomplete">Non terminés</option>
                        </select>
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                    {filteredStudents.map(s => {
                        const completion = getStudentCompletion(s._id)
                        return (
                            <Link key={s._id} to={`/teacher/students/${s._id}/templates`} style={{ textDecoration: 'none' }}>
                                <div className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                                    {completion.isFullyComplete && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            background: '#10b981',
                                            color: 'white',
                                            borderRadius: '50%',
                                            width: 24,
                                            height: 24,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 14,
                                            fontWeight: 'bold'
                                        }}>
                                            ✓
                                        </div>
                                    )}
                                    <img className="avatar" src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${s.firstName}-${s.lastName}`} alt="" />
                                    <div style={{ flex: 1 }}>
                                        <div className="title" style={{ fontSize: 16 }}>{s.firstName} {s.lastName}</div>
                                        <div className="note" style={{ fontSize: 12 }}>
                                            {completion.total > 0 ? (
                                                <span style={{ color: completion.isFullyComplete ? '#10b981' : '#6c5ce7' }}>
                                                    {completion.completed}/{completion.total} carnets
                                                </span>
                                            ) : (
                                                'Aucun carnet'
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
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
