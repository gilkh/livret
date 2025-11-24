import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type ClassDoc = { _id: string; name: string; level?: string; schoolYearId: string }
type CompletionStats = {
  totalAssignments: number
  completedAssignments: number
  completionPercentage: number
}

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [statsMap, setStatsMap] = useState<Map<string, CompletionStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadClasses = async () => {
      try {
        setLoading(true)
        const r = await api.get('/teacher/classes')
        setClasses(r.data)

        // Load stats for each class
        const statsPromises = r.data.map((c: ClassDoc) =>
          api.get(`/teacher/classes/${c._id}/completion-stats`)
            .then(res => ({ classId: c._id, stats: res.data }))
            .catch(() => ({ classId: c._id, stats: null }))
        )

        const statsResults = await Promise.all(statsPromises)
        const newStatsMap = new Map()
        statsResults.forEach(({ classId, stats }) => {
          if (stats) newStatsMap.set(classId, stats)
        })
        setStatsMap(newStatsMap)
      } catch (e: any) {
        setError('Impossible de charger les classes')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadClasses()
  }, [])

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Mes Classes</h2>
        <div className="note">Sélectionnez une classe pour voir les élèves.</div>

        {loading && <div className="note">Chargement...</div>}
        {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
          {classes.map(c => {
            const stats = statsMap.get(c._id)
            return (
              <Link key={c._id} to={`/teacher/classes/${c._id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s', position: 'relative' }}>
                  {stats && stats.completionPercentage === 100 && (
                    <div style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: '#10b981',
                      color: 'white',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}
                  <div className="title" style={{ fontSize: 18, paddingRight: stats?.completionPercentage === 100 ? 40 : 0 }}>
                    {c.name}
                  </div>
                  {c.level && <div className="note">Niveau: {c.level}</div>}
                  {stats && (
                    <div style={{ marginTop: 8 }}>
                      <div className="note" style={{ fontSize: 12, marginBottom: 4 }}>
                        {stats.completedAssignments} / {stats.totalAssignments} carnets terminés ({stats.completionPercentage}%)
                      </div>
                      <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${stats.completionPercentage}%`,
                          height: '100%',
                          background: stats.completionPercentage === 100 ? '#10b981' : '#6c5ce7',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                  <div className="btn" style={{ marginTop: 12 }}>Voir les élèves →</div>
                </div>
              </Link>
            )
          })}
          {!loading && classes.length === 0 && (
            <div className="note">Aucune classe assignée. Contactez l'administrateur.</div>
          )}
        </div>
      </div>
    </div>
  )
}
