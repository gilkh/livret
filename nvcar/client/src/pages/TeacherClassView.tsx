import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'

type Student = { _id: string; firstName: string; lastName: string; dateOfBirth: Date; avatarUrl?: string }
type Assignment = {
    _id: string
    studentId: string
    isCompleted?: boolean
    isCompletedSem1?: boolean
    isCompletedSem2?: boolean
    template?: { name: string }
    student?: Student
}

export default function TeacherClassView() {
    const { classId } = useParams<{ classId: string }>()
    const { activeYear } = useSchoolYear()
    const [students, setStudents] = useState<Student[]>([])
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [className, setClassName] = useState('')
    const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<'name_asc' | 'name_desc' | 'firstName_asc' | 'firstName_desc' | 'progress_desc' | 'progress_asc'>('name_asc')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            setError('')
            
            try {
                // Launch requests in parallel
                const studentsPromise = api.get(`/teacher/classes/${classId}/students`)
                    .then(res => setStudents(res.data))
                
                const assignmentsPromise = api.get(`/teacher/classes/${classId}/assignments`)
                    .then(res => setAssignments(res.data))

                const classPromise = api.get('/teacher/classes')
                    .then(res => {
                        const cls = res.data.find((c: any) => c._id === classId)
                        if (cls) setClassName(cls.name)
                    })

                await Promise.all([studentsPromise, assignmentsPromise, classPromise])
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (classId) loadData()
    }, [classId])

    const activeSemester = activeYear?.activeSemester || 1

    const isAssignmentCompletedForActiveSemester = (assignment: Assignment) => {
        if (activeSemester === 2) {
            return !!assignment.isCompletedSem2
        }
        return !!assignment.isCompletedSem1 || !!assignment.isCompleted
    }

    const assignmentsByStudentId = useMemo(() => {
        const map = new Map<string, Assignment[]>()
        for (const assignment of assignments) {
            const list = map.get(assignment.studentId)
            if (list) {
                list.push(assignment)
            } else {
                map.set(assignment.studentId, [assignment])
            }
        }
        return map
    }, [assignments])

    const completionByStudentId = useMemo(() => {
        const totals = new Map<string, { total: number; completed: number }>()

        for (const a of assignments) {
            const prev = totals.get(a.studentId) || { total: 0, completed: 0 }
            const next = { total: prev.total + 1, completed: prev.completed + (isAssignmentCompletedForActiveSemester(a) ? 1 : 0) }
            totals.set(a.studentId, next)
        }

        const map = new Map<string, { completed: number; total: number; isFullyComplete: boolean; completionPercentage: number }>()
        totals.forEach((v, studentId) => {
            const completionPercentage = v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0
            map.set(studentId, {
                completed: v.completed,
                total: v.total,
                isFullyComplete: v.total > 0 && v.completed === v.total,
                completionPercentage
            })
        })
        return map
    }, [assignments, activeSemester])

    const getStudentCompletion = (studentId: string) => {
        return (
            completionByStudentId.get(studentId) || {
                completed: 0,
                total: 0,
                isFullyComplete: false,
                completionPercentage: 0
            }
        )
    }

    const normalizeText = (value: string) => {
        return (value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
    }

    const displayedStudents = useMemo(() => {
        const q = normalizeText(search)

        const list = students.filter(student => {
            const nameFirstLast = normalizeText(`${student.firstName} ${student.lastName}`)
            const nameLastFirst = normalizeText(`${student.lastName} ${student.firstName}`)
            const matchesSearch = !q || nameFirstLast.includes(q) || nameLastFirst.includes(q)
            if (!matchesSearch) return false

            if (filter === 'all') return true
            const { isFullyComplete } = getStudentCompletion(student._id)
            if (filter === 'completed') return isFullyComplete
            if (filter === 'incomplete') return !isFullyComplete
            return true
        })

        list.sort((a, b) => {
            const aLast = normalizeText(a.lastName)
            const bLast = normalizeText(b.lastName)
            const aFirst = normalizeText(a.firstName)
            const bFirst = normalizeText(b.firstName)

            const byNameAsc = () => {
                const lastCmp = aLast.localeCompare(bLast)
                if (lastCmp !== 0) return lastCmp
                return aFirst.localeCompare(bFirst)
            }

            const byFirstNameAsc = () => {
                const firstCmp = aFirst.localeCompare(bFirst)
                if (firstCmp !== 0) return firstCmp
                return aLast.localeCompare(bLast)
            }

            const byProgressDesc = () => {
                const aProg = getStudentCompletion(a._id).completionPercentage
                const bProg = getStudentCompletion(b._id).completionPercentage
                if (aProg !== bProg) return bProg - aProg
                return byNameAsc()
            }

            if (sort === 'name_asc') return byNameAsc()
            if (sort === 'name_desc') return -byNameAsc()
            if (sort === 'firstName_asc') return byFirstNameAsc()
            if (sort === 'firstName_desc') return -byFirstNameAsc()
            if (sort === 'progress_desc') return byProgressDesc()
            if (sort === 'progress_asc') return -byProgressDesc()
            return 0
        })

        return list
    }, [students, filter, search, sort, completionByStudentId])

    const totalAssignments = assignments.length
    const completedAssignments = assignments.filter(a => isAssignmentCompletedForActiveSemester(a)).length
    const completionPercentage = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0
    const stats = totalAssignments > 0 ? { totalAssignments, completedAssignments, completionPercentage } : null

    return (
        <div className="container">
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                    <Link to="/teacher/classes" className="btn secondary" style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 42,
                        padding: '0 20px',
                        borderRadius: 21,
                        background: '#f1f5f9',
                        color: '#475569',
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        flexShrink: 0
                    }}>← Retour aux classes</Link>
                    
                    <div>
                        <h2 className="title" style={{ fontSize: 24, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span>🏛️ Élèves de la classe</span>
                            {className && <span style={{ background: '#e2e8f0', padding: '4px 12px', borderRadius: 8, fontSize: '0.9em', color: '#334155' }}>{className}</span>}
                        </h2>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                            <div className="note" style={{ fontSize: 14, color: '#64748b' }}>Semestre actif : S{activeSemester}</div>
                            {activeYear?.name && (
                              <div className="note" style={{ fontSize: 13, background: '#eef2ff', padding: '4px 10px', borderRadius: 8, color: '#3730a3' }}>
                                Année : {activeYear.name}
                              </div>
                            )}
                        </div>
                    </div>
                </div>

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
                            {stats.completedAssignments} / {stats.totalAssignments} carnets terminés (S{activeSemester})
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

                <div style={{ marginTop: 20, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 320px' }}>
                        <span className="note" style={{ fontSize: 14, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>🔎 Rechercher:</span>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Prénom ou nom"
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: 14,
                                fontWeight: 500,
                                color: '#475569',
                                background: 'white',
                                outline: 'none'
                            }}
                        />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                        <span className="note" style={{ fontSize: 14, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>↕️ Trier:</span>
                        <select
                            value={sort}
                            onChange={e => setSort(e.target.value as any)}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: 14,
                                fontWeight: 500,
                                color: '#475569',
                                background: 'white',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="name_asc">Nom (A → Z)</option>
                            <option value="name_desc">Nom (Z → A)</option>
                            <option value="firstName_asc">Prénom (A → Z)</option>
                            <option value="firstName_desc">Prénom (Z → A)</option>
                            <option value="progress_desc">Progression (plus → moins)</option>
                            <option value="progress_asc">Progression (moins → plus)</option>
                        </select>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                        <span className="note" style={{ fontSize: 14, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>🔍 Filtrer:</span>
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
                                outline: 'none'
                            }}
                        >
                            <option value="all">Tous</option>
                            <option value="completed">Terminés</option>
                            <option value="incomplete">Non terminés</option>
                        </select>
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18, marginTop: 20 }}>
                    {displayedStudents.map(s => {
                        const completion = getStudentCompletion(s._id)
                        const studentAssignments = assignmentsByStudentId.get(s._id) || []
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
                                    <img className="avatar" loading="lazy" src={s.avatarUrl || `https://api.dicebear.com/9.x/thumbs/svg?seed=${s.firstName}-${s.lastName}`} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #e2e8f0', objectFit: 'cover' }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="title" style={{ fontSize: 17, marginBottom: 4, color: '#1e293b', fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                                        <div className="note" style={{ fontSize: 13, fontWeight: 500 }}>
                                            {completion.total > 0 ? (
                                                <span style={{ color: completion.isFullyComplete ? '#10b981' : '#6c5ce7' }}>
                                                    {completion.isFullyComplete ? 'Terminé' : 'Pas encore terminé'}
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
                                                <div
                                                style={{
                                                    padding: '8px 12px',
                                                    background: isAssignmentCompletedForActiveSemester(a) ? '#ecfdf5' : 'white',
                                                    border: `1px solid ${isAssignmentCompletedForActiveSemester(a) ? '#10b981' : '#e2e8f0'}`,
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
                                                    e.currentTarget.style.borderColor = isAssignmentCompletedForActiveSemester(a) ? '#10b981' : '#e2e8f0';
                                                    e.currentTarget.style.transform = 'translateX(0)';
                                                }}
                                                >
                                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ouvrir</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{ display: 'flex', gap: 2 }}>
                                                            <span style={{ 
                                                                fontSize: 10, 
                                                                padding: '2px 4px', 
                                                                borderRadius: 4, 
                                                                background: a.isCompletedSem1 ? '#10b981' : '#f1f5f9', 
                                                                color: a.isCompletedSem1 ? 'white' : '#94a3b8',
                                                                fontWeight: 600
                                                            }}>S1</span>
                                                            <span style={{ 
                                                                fontSize: 10, 
                                                                padding: '2px 4px', 
                                                                borderRadius: 4, 
                                                                background: a.isCompletedSem2 ? '#10b981' : '#f1f5f9', 
                                                                color: a.isCompletedSem2 ? 'white' : '#94a3b8',
                                                                fontWeight: 600
                                                            }}>S2</span>
                                                        </div>
                                                        {isAssignmentCompletedForActiveSemester(a) ? (
                                                            <span style={{ color: '#10b981' }}>✓</span>
                                                        ) : (
                                                            <span style={{ color: '#6c5ce7' }}>→</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {!loading && displayedStudents.length === 0 && (
                        <div className="note">
                            {search.trim()
                                ? 'Aucun élève ne correspond à la recherche.'
                                : (filter === 'all' ? 'Aucun élève dans cette classe.' : `Aucun élève ${filter === 'completed' ? 'terminé' : 'non terminé'}.`)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
