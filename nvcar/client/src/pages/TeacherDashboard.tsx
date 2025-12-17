import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import ProgressionChart from '../components/ProgressionChart'

type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }
type CompletionStats = {
  totalAssignments: number
  completedAssignments: number
  completionPercentage: number
}

export default function TeacherDashboard() {
  const { activeYearId, activeYear, isLoading: isYearLoading } = useSchoolYear()
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [statsMap, setStatsMap] = useState<Map<string, CompletionStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const activeSemester = activeYear?.activeSemester || 1

  useEffect(() => {
    // Avoid loading if year context is not ready
    if (isYearLoading) return

    let isMounted = true

    const loadClasses = async () => {
      try {
        setLoading(true)
        const r = await api.get(`/teacher/classes?schoolYearId=${activeYearId}`)
        if (!isMounted) return
        setClasses(r.data)

        const semester = activeSemester

        const statsPromises = r.data.map((c: ClassDoc) =>
          api
            .get(`/teacher/classes/${c._id}/completion-stats?semester=${semester}`)
            .then(res => {
              const stats = res.data as CompletionStats
              return { classId: c._id, stats }
            })
            .catch(() => ({ classId: c._id, stats: null }))
        )

        const statsResults = await Promise.all(statsPromises)
        if (!isMounted) return

        const newStatsMap = new Map()
        statsResults.forEach(({ classId, stats }) => {
          if (stats) newStatsMap.set(classId, stats)
        })
        setStatsMap(newStatsMap)
      } catch (e: any) {
        if (isMounted) {
          setError('Impossible de charger les classes')
          console.error(e)
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadClasses()

    return () => {
        isMounted = false
    }
  }, [activeYearId, activeYear?.activeSemester, isYearLoading])

  // Calculate global stats
  const globalStats = Array.from(statsMap.values()).reduce((acc, stats) => {
    acc.total += stats.totalAssignments
    acc.completed += stats.completedAssignments
    return acc
  }, { total: 0, completed: 0 })

  const breakdown = classes.map(c => {
    const stats = statsMap.get(c._id)
    return {
      label: c.name,
      total: stats?.totalAssignments || 0,
      completed: stats?.completedAssignments || 0
    }
  }).sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="container">
      <div className="card">
        <div style={{ marginBottom: 24 }}>
          <h2 className="title" style={{ fontSize: 32, marginBottom: 8, color: '#1e293b' }}>📚 Mes Classes</h2>
          <div className="note" style={{ fontSize: 14 }}>Sélectionnez une classe pour voir les élèves et gérer leurs carnets.</div>
          <div className="note" style={{ fontSize: 14, marginTop: 6 }}>Semestre actif : S{activeSemester}</div>
        </div>

        {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
        {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

        {!loading && classes.length > 0 && (
          <ProgressionChart 
            title="📊 Progression Globale"
            total={globalStats.total}
            completed={globalStats.completed}
            breakdown={breakdown}
          />
        )}

        <div style={{ marginTop: 20 }}>
          {Object.entries(classes.reduce((acc, cls) => {
            const level = cls.level || 'Sans niveau';
            if (!acc[level]) acc[level] = [];
            acc[level].push(cls);
            return acc;
          }, {} as Record<string, ClassDoc[]>)).sort(([a], [b]) => a.localeCompare(b)).map(([level, levelClasses]) => (
            <div key={level} style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 24, marginBottom: 16, color: '#475569', borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>{level}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                {levelClasses.map(c => {
                  const stats = statsMap.get(c._id)
                  return (
                    <Link key={c._id} to={`/teacher/classes/${c._id}`} style={{ textDecoration: 'none' }}>
                      <div className="card" style={{ 
                        cursor: 'pointer', 
                        transition: 'all 0.3s ease', 
                        position: 'relative',
                        border: '1px solid #e2e8f0',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                      }} onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)';
                      }} onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.06)';
                      }}>
                        {stats && stats.completionPercentage === 100 && (
                          <div style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            borderRadius: '50%',
                            width: 36,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            fontWeight: 'bold',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                          }}>
                            ✓
                          </div>
                        )}
                        <div className="title" style={{ 
                          fontSize: 20, 
                          paddingRight: stats?.completionPercentage === 100 ? 44 : 0,
                          marginBottom: 8,
                          color: '#1e293b',
                          fontWeight: 600
                        }}>
                          {c.name}
                        </div>
                        {c.level && <div className="note" style={{ fontSize: 13, color: '#64748b' }}>📖 Niveau: {c.level}</div>}
                        {stats && (
                          <div style={{ marginTop: 12 }}>
                            <div className="note" style={{ fontSize: 13, marginBottom: 6, fontWeight: 500, color: '#475569' }}>
                              {stats.completedAssignments} / {stats.totalAssignments} carnets terminés ({stats.completionPercentage}%)
                            </div>
                            <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{
                                width: `${stats.completionPercentage}%`,
                                height: '100%',
                                background: stats.completionPercentage === 100 
                                  ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' 
                                  : 'linear-gradient(90deg, #6c5ce7 0%, #5b4bc4 100%)',
                                transition: 'width 0.5s ease',
                                boxShadow: stats.completionPercentage > 0 ? 'inset 0 1px 2px rgba(255,255,255,0.3)' : 'none'
                              }} />
                            </div>
                          </div>
                        )}
                        <div className="btn" style={{ 
                          marginTop: 16, 
                          fontSize: 14,
                          fontWeight: 500,
                          padding: '10px 16px',
                          background: 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)',
                          boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)'
                        }}>Voir les élèves →</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          {!loading && classes.length === 0 && (
            <div className="note">Aucune classe assignée. Contactez l'administrateur.</div>
          )}
        </div>
      </div>
    </div>
  )
}
