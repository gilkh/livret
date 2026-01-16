import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import ProgressionChart from '../components/ProgressionChart'

type ClassDoc = {
  _id: string;
  name: string;
  level?: string;
  schoolYearId: string;
  languages?: string[];
  isProfPolyvalent?: boolean;
}
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

  // Per-class breakdown (for "Par Classe" tab)
  const perClassBreakdown = classes.map(c => {
    const stats = statsMap.get(c._id)
    return {
      label: c.name,
      total: stats?.totalAssignments || 0,
      completed: stats?.completedAssignments || 0
    }
  }).sort((a, b) => a.label.localeCompare(b.label))

  // Per-level breakdown (for "Par Niveau" tab) - group classes by level
  const perLevelBreakdown = Object.entries(
    classes.reduce((acc, cls) => {
      const level = cls.level || 'Sans niveau'
      if (!acc[level]) {
        acc[level] = { total: 0, completed: 0 }
      }
      const stats = statsMap.get(cls._id)
      acc[level].total += stats?.totalAssignments || 0
      acc[level].completed += stats?.completedAssignments || 0
      return acc
    }, {} as Record<string, { total: number; completed: number }>)
  ).map(([level, stats]) => ({
    label: level,
    total: stats.total,
    completed: stats.completed
  })).sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="container">
      <div className="card">
        {/* Minimal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <h2 style={{
              fontSize: 26,
              margin: 0,
              color: '#0f172a',
              fontWeight: 700,
              letterSpacing: '-0.02em'
            }}>
              Mes Classes
            </h2>
            <p style={{
              margin: '6px 0 0 0',
              fontSize: 14,
              color: '#64748b',
              fontWeight: 400
            }}>
              {classes.length > 0 ? `${classes.length} classe${classes.length > 1 ? 's' : ''} assignée${classes.length > 1 ? 's' : ''}` : 'Aucune classe'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0'
            }}>
              S{activeSemester}
            </span>
            {activeYear?.name && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                background: '#eef2ff',
                color: '#4f46e5',
                border: '1px solid #c7d2fe'
              }}>
                {activeYear.name}
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: 40,
            color: '#64748b',
            fontSize: 14
          }}>
            <div style={{
              width: 32,
              height: 32,
              border: '3px solid #e2e8f0',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              margin: '0 auto 12px',
              animation: 'spin 1s linear infinite'
            }} />
            Chargement...
          </div>
        )}
        {error && (
          <div style={{
            color: '#dc2626',
            background: '#fef2f2',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid #fecaca',
            fontSize: 14,
            fontWeight: 500
          }}>
            {error}
          </div>
        )}

        {!loading && classes.length > 0 && (
          <ProgressionChart
            title="📊 Progression Globale"
            total={globalStats.total}
            completed={globalStats.completed}
            perLevelBreakdown={perLevelBreakdown}
            perClassBreakdown={perClassBreakdown}
            showPromu={false}
          />
        )}

        <div style={{ marginTop: 20 }}>
          {Object.entries(classes.reduce((acc, cls) => {
            const level = cls.level || 'Sans niveau';
            if (!acc[level]) acc[level] = [];
            acc[level].push(cls);
            return acc;
          }, {} as Record<string, ClassDoc[]>)).sort(([a], [b]) => a.localeCompare(b)).map(([level, levelClasses]) => (
            <div key={level} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, margin: '0 0 12px 0', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>{level}</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {levelClasses.map(c => {
                  const stats = statsMap.get(c._id)
                  return (
                    <Link key={c._id} to={`/teacher/classes/${c._id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }} onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                        e.currentTarget.style.borderColor = '#c7d2fe';
                      }} onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}>
                        {/* Header row: Name + completion badge */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 17, fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                          {stats && stats.completionPercentage === 100 && (
                            <span style={{
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: 'white',
                              borderRadius: 999,
                              width: 22,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 'bold',
                              flexShrink: 0
                            }}>✓</span>
                          )}
                        </div>

                        {/* Tags row: Level + Subject in compact chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {c.level && (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: '#475569',
                              fontWeight: 500
                            }}>📖 {c.level}</span>
                          )}
                          <span style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#eef2ff',
                            color: '#6366f1',
                            fontWeight: 500
                          }}>
                            {(() => {
                              if (c.isProfPolyvalent) return '🎯 Polyvalent'
                              if (!c.languages || c.languages.length === 0) return '🎯 Toutes'
                              const langMap: Record<string, string> = { 'ar': 'العربية', 'en': 'EN', 'fr': 'FR' }
                              return c.languages.map(l => langMap[l.toLowerCase()] || l.toUpperCase()).join(' · ')
                            })()}
                          </span>
                        </div>

                        {/* Progress row: compact bar with inline percentage */}
                        {stats && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{
                                width: `${stats.completionPercentage}%`,
                                height: '100%',
                                background: stats.completionPercentage === 100
                                  ? 'linear-gradient(90deg, #10b981, #059669)'
                                  : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                transition: 'width 0.4s ease'
                              }} />
                            </div>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: stats.completionPercentage === 100 ? '#059669' : '#6366f1',
                              minWidth: 42,
                              textAlign: 'right'
                            }}>
                              {stats.completedAssignments}/{stats.totalAssignments}
                            </span>
                          </div>
                        )}
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
