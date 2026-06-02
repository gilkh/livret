import { useEffect, useState, useMemo } from 'react'
import {
  Globe,
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  Layers,
  Check,
  X,
  Languages,
  BookOpen,
  Users,
  MessageSquareText
} from 'lucide-react'
import api from '../api'
import './AdminGradebookLanguages.css'

interface StudentLanguageStatus {
  studentId: string
  firstName: string
  lastName: string
  assignmentId: string | null
  templateName: string | null
  appreciations?: {
    dataKey: string
    label: string
    options: string[]
    value: string
  }[]
  languages: {
    fr: boolean
    en: boolean
    ar: boolean
  }
}

export default function AdminGradebookLanguages() {
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [selectedYearId, setSelectedYearId] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSemester, setSelectedSemester] = useState<number>(1)
  
  const [students, setStudents] = useState<StudentLanguageStatus[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null) // 'batch' or assignmentId
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load School Years first
  useEffect(() => {
    const loadYears = async () => {
      try {
        setLoading(true)
        const res = await api.get('/school-years')
        setSchoolYears(res.data)
        const activeYear = res.data.find((y: any) => y.active)
        if (activeYear) {
          setSelectedYearId(activeYear._id)
          setSelectedSemester(activeYear.activeSemester || 1)
        } else if (res.data.length > 0) {
          setSelectedYearId(res.data[0]._id)
        }
      } catch (e: any) {
        setError('Erreur lors du chargement des années scolaires.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadYears()
  }, [])

  // Load Classes when School Year changes
  useEffect(() => {
    if (!selectedYearId) return
    const loadClasses = async () => {
      try {
        setError('')
        const res = await api.get(`/classes?schoolYearId=${selectedYearId}`)
        setClasses(res.data)
        if (res.data.length > 0) {
          setSelectedClassId(res.data[0]._id)
        } else {
          setSelectedClassId('')
          setStudents([])
        }
      } catch (e: any) {
        setError('Erreur lors du chargement des classes.')
        console.error(e)
      }
    }
    loadClasses()
  }, [selectedYearId])

  // Load Student Statuses when Class or Semester changes
  const loadStudentStatus = async (silent = false) => {
    if (!selectedClassId || !selectedYearId) return
    try {
      if (!silent) setLoading(true)
      setError('')
      const res = await api.get(
        `/admin-extras/gradebooks/languages/status?classId=${selectedClassId}&schoolYearId=${selectedYearId}&semester=${selectedSemester}`
      )
      setStudents(res.data.students || [])
    } catch (e: any) {
      setError('Erreur lors du chargement des statuts de langues.')
      console.error(e)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadStudentStatus()
  }, [selectedClassId, selectedSemester])

  // Real-time search filter
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return students
    return students.filter(
      s =>
        s.firstName.toLowerCase().includes(query) ||
        s.lastName.toLowerCase().includes(query)
    )
  }, [students, searchQuery])

  // Stat counts
  const stats = useMemo(() => {
    const total = students.filter(s => !!s.assignmentId).length
    if (total === 0) return { fr: 0, en: 0, ar: 0, total: 0, appreciationsSelected: 0, appreciationsMissing: 0, appreciationsTotal: 0 }
    
    let fr = 0, en = 0, ar = 0
    let appreciationsSelected = 0
    let appreciationsTotal = 0
    students.forEach(s => {
      if (s.assignmentId) {
        if (s.languages.fr) fr++
        if (s.languages.en) en++
        if (s.languages.ar) ar++
        ;(s.appreciations || []).forEach(app => {
          appreciationsTotal++
          if (app.value) appreciationsSelected++
        })
      }
    })
    
    return {
      fr,
      en,
      ar,
      total,
      appreciationsSelected,
      appreciationsMissing: appreciationsTotal - appreciationsSelected,
      appreciationsTotal
    }
  }, [students])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  // Toggle individual language done status
  const handleToggleIndividual = async (
    student: StudentLanguageStatus,
    langCode: 'fr' | 'en' | 'ar',
    currentVal: boolean
  ) => {
    if (!student.assignmentId) return
    setActionLoading(student.studentId + '-' + langCode)
    try {
      const res = await api.post('/admin-extras/gradebooks/languages/toggle', {
        assignmentIds: [student.assignmentId],
        languages: [langCode],
        active: !currentVal,
        semester: selectedSemester
      })

      if (res.data.success && res.data.successCount > 0) {
        showToast('success', `Statut mis à jour pour ${student.firstName} ${student.lastName}`)
        
        // Update state locally
        setStudents(prev =>
          prev.map(s => {
            if (s.studentId === student.studentId) {
              return {
                ...s,
                languages: {
                  ...s.languages,
                  [langCode]: !currentVal
                }
              }
            }
            return s
          })
        )
      } else {
        const errMsg = res.data.errors?.[0]?.error || 'Erreur inconnue'
        showToast('error', `Erreur: ${errMsg}`)
      }
    } catch (e: any) {
      console.error(e)
      showToast('error', e.response?.data?.message || 'Une erreur est survenue.')
    } finally {
      setActionLoading(null)
    }
  }

  // Toggle ALL languages for individual student
  const handleToggleAllIndividual = async (student: StudentLanguageStatus, active: boolean) => {
    if (!student.assignmentId) return
    setActionLoading(student.studentId + '-all')
    try {
      const res = await api.post('/admin-extras/gradebooks/languages/toggle', {
        assignmentIds: [student.assignmentId],
        languages: ['fr', 'en', 'ar'],
        active,
        semester: selectedSemester
      })

      if (res.data.success && res.data.successCount > 0) {
        showToast('success', `Toutes les langues mises à jour pour ${student.firstName} ${student.lastName}`)
        
        setStudents(prev =>
          prev.map(s => {
            if (s.studentId === student.studentId) {
              return {
                ...s,
                languages: { fr: active, en: active, ar: active }
              }
            }
            return s
          })
        )
      } else {
        showToast('error', 'Erreur lors de la mise à jour.')
      }
    } catch (e: any) {
      console.error(e)
      showToast('error', e.response?.data?.message || 'Une erreur est survenue.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpdateAppreciation = async (
    student: StudentLanguageStatus,
    dataKey: string,
    value: string
  ) => {
    if (!student.assignmentId) return
    const loadingKey = `${student.studentId}-appreciation-${dataKey}`
    setActionLoading(loadingKey)

    try {
      const res = await api.post('/admin-extras/gradebooks/languages/appreciation', {
        assignmentId: student.assignmentId,
        dataKey,
        value,
        semester: selectedSemester
      })

      if (res.data.success) {
        setStudents(prev =>
          prev.map(s => {
            if (s.studentId !== student.studentId) return s
            return {
              ...s,
              appreciations: (s.appreciations || []).map(app =>
                app.dataKey === dataKey ? { ...app, value } : app
              )
            }
          })
        )
        showToast('success', `Appréciation mise à jour pour ${student.firstName} ${student.lastName}`)
      } else {
        showToast('error', 'Erreur lors de la mise à jour de l’appréciation.')
      }
    } catch (e: any) {
      console.error(e)
      showToast('error', e.response?.data?.message || 'Une erreur est survenue.')
    } finally {
      setActionLoading(null)
    }
  }

  // Toggle Batch action for the whole class
  const handleBatchToggle = async (langCodes: ('fr' | 'en' | 'ar')[], active: boolean) => {
    const targetAssignments = students.map(s => s.assignmentId).filter(Boolean) as string[]
    if (targetAssignments.length === 0) {
      showToast('error', 'Aucun carnet disponible dans cette classe.')
      return
    }

    const langNames = langCodes.map(code => {
      if (code === 'fr') return 'Polyvalent'
      if (code === 'en') return 'Anglais'
      if (code === 'ar') return 'Arabe'
      return code
    }).join(', ')

    const confirmMsg = active 
      ? `Marquer ${langNames} comme complété pour toute la classe (${targetAssignments.length} élèves) ?`
      : `Désactiver la validation de ${langNames} pour toute la classe (${targetAssignments.length} élèves) ?`

    if (!confirm(confirmMsg)) return

    setActionLoading('batch')
    try {
      const res = await api.post('/admin-extras/gradebooks/languages/toggle', {
        assignmentIds: targetAssignments,
        languages: langCodes,
        active,
        semester: selectedSemester
      })

      if (res.data.success) {
        showToast('success', `${res.data.successCount} carnets mis à jour avec succès!`)
        
        // Update local state immediately for instant feedback
        setStudents(prev =>
          prev.map(s => {
            if (s.assignmentId) {
              const updatedLanguages = { ...s.languages }
              langCodes.forEach(code => {
                updatedLanguages[code] = active
              })
              return {
                ...s,
                languages: updatedLanguages
              }
            }
            return s
          })
        )
      } else {
        showToast('error', 'Erreur lors de la mise à jour par lot.')
      }
    } catch (e: any) {
      console.error(e)
      showToast('error', e.response?.data?.message || 'Une erreur est survenue.')
    } finally {
      setActionLoading(null)
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return ((firstName[0] || '') + (lastName[0] || '')).toUpperCase()
  }

  return (
    <div className="admin-gradebook-languages-page">
      {/* Toast Alert */}
      {toast && (
        <div className={`toast-alert ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Section */}
      <header className="page-header">
        <div className="header-title-container">
          <div className="header-icon-badge">
            <Languages size={28} />
          </div>
          <div>
            <h1>Validation Administrative des Langues</h1>
            <p>Valider les modules linguistiques des carnets individuellement ou par classe.</p>
          </div>
        </div>
      </header>

      {/* Filters and Controls */}
      <section className="controls-grid">
        <div className="filters-card glass">
          <div className="filter-group">
            <label><Calendar size={14} /> Année Scolaire</label>
            <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}>
              {schoolYears.map(y => (
                <option key={y._id} value={y._id}>{y.name} {y.active ? '(Actif)' : ''}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label><Layers size={14} /> Classe</label>
            <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} disabled={classes.length === 0}>
              {classes.length === 0 ? (
                <option value="">Aucune classe</option>
              ) : (
                classes.map(c => (
                  <option key={c._id} value={c._id}>{c.name} ({c.level})</option>
                ))
              )}
            </select>
          </div>

          <div className="filter-group semester-selector">
            <label><BookOpen size={14} /> Semestre</label>
            <div className="semester-tabs">
              <button 
                type="button" 
                className={selectedSemester === 1 ? 'active' : ''} 
                onClick={() => setSelectedSemester(1)}
              >
                Semestre 1
              </button>
              <button 
                type="button" 
                className={selectedSemester === 2 ? 'active' : ''} 
                onClick={() => setSelectedSemester(2)}
              >
                Semestre 2
              </button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="stats-dashboard">
          {/* Polyvalent */}
          {(() => {
            const pct = stats.total > 0 ? Math.round((stats.fr / stats.total) * 100) : 0
            const r = 30, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <div className="stat-ring-card french-card glass">
                <div className="ring-wrapper">
                  <svg width="88" height="88" viewBox="0 0 88 88">
                    <circle cx="44" cy="44" r={r} className="ring-track" />
                    <circle
                      cx="44" cy="44" r={r}
                      className="ring-fill ring-fr"
                      strokeDasharray={`${dash} ${circ}`}
                      strokeDashoffset="0"
                      transform="rotate(-90 44 44)"
                    />
                  </svg>
                  <div className="ring-center">
                    <span className="ring-pct">{pct}%</span>
                  </div>
                </div>
                <div className="stat-info">
                  <div className="stat-lang-label">
                    <span className="lang-dot dot-fr" />
                    Polyvalent
                  </div>
                  <div className="stat-fraction">{stats.fr} <span>/ {stats.total}</span></div>
                  <div className="stat-sublabel">carnets validés</div>
                </div>
              </div>
            )
          })()}

          {/* Anglais */}
          {(() => {
            const pct = stats.total > 0 ? Math.round((stats.en / stats.total) * 100) : 0
            const r = 30, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <div className="stat-ring-card english-card glass">
                <div className="ring-wrapper">
                  <svg width="88" height="88" viewBox="0 0 88 88">
                    <circle cx="44" cy="44" r={r} className="ring-track" />
                    <circle
                      cx="44" cy="44" r={r}
                      className="ring-fill ring-en"
                      strokeDasharray={`${dash} ${circ}`}
                      strokeDashoffset="0"
                      transform="rotate(-90 44 44)"
                    />
                  </svg>
                  <div className="ring-center">
                    <span className="ring-pct">{pct}%</span>
                  </div>
                </div>
                <div className="stat-info">
                  <div className="stat-lang-label">
                    <span className="lang-dot dot-en" />
                    Anglais
                  </div>
                  <div className="stat-fraction">{stats.en} <span>/ {stats.total}</span></div>
                  <div className="stat-sublabel">carnets validés</div>
                </div>
              </div>
            )
          })()}

          {/* Arabe */}
          {(() => {
            const pct = stats.total > 0 ? Math.round((stats.ar / stats.total) * 100) : 0
            const r = 30, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <div className="stat-ring-card arabic-card glass">
                <div className="ring-wrapper">
                  <svg width="88" height="88" viewBox="0 0 88 88">
                    <circle cx="44" cy="44" r={r} className="ring-track" />
                    <circle
                      cx="44" cy="44" r={r}
                      className="ring-fill ring-ar"
                      strokeDasharray={`${dash} ${circ}`}
                      strokeDashoffset="0"
                      transform="rotate(-90 44 44)"
                    />
                  </svg>
                  <div className="ring-center">
                    <span className="ring-pct">{pct}%</span>
                  </div>
                </div>
                <div className="stat-info">
                  <div className="stat-lang-label">
                    <span className="lang-dot dot-ar" />
                    Arabe
                  </div>
                  <div className="stat-fraction">{stats.ar} <span>/ {stats.total}</span></div>
                  <div className="stat-sublabel">carnets validés</div>
                </div>
              </div>
            )
          })()}
        </div>

        <div className="appreciation-overview glass">
          <div className="appreciation-overview-icon">
            <MessageSquareText size={20} />
          </div>
          <div>
            <div className="appreciation-overview-label">Appréciations</div>
            <div className="appreciation-overview-counts">
              <span className="selected-count">{stats.appreciationsSelected}</span>
              <span>sélectionnée(s)</span>
              <span className="count-separator">/</span>
              <span className="missing-count">{stats.appreciationsMissing}</span>
              <span>non sélectionnée(s)</span>
            </div>
            <div className="appreciation-overview-subtitle">
              {stats.appreciationsTotal} champ(s) pour la classe et le semestre affichés
            </div>
          </div>
        </div>
      </section>

      {/* Actions and Search */}
      <section className="action-toolbar glass">
        <div className="search-bar">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Rechercher un élève par nom..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="batch-actions-container">
          <div className="batch-action-group validate-group">
            <span className="batch-group-label"><CheckCircle2 size={14} /> Valider Lot :</span>
            <button type="button" className="batch-btn val-fr" onClick={() => handleBatchToggle(['fr'], true)}>Polyvalent</button>
            <button type="button" className="batch-btn val-en" onClick={() => handleBatchToggle(['en'], true)}>Anglais</button>
            <button type="button" className="batch-btn val-ar" onClick={() => handleBatchToggle(['ar'], true)}>Arabe</button>
            <button type="button" className="batch-btn val-all" onClick={() => handleBatchToggle(['fr', 'en', 'ar'], true)}>Tout valider</button>
          </div>

          <div className="batch-action-group devalidate-group">
            <span className="batch-group-label"><X size={14} /> Dévalider Lot :</span>
            <button type="button" className="batch-btn deval-fr" onClick={() => handleBatchToggle(['fr'], false)}>Polyvalent</button>
            <button type="button" className="batch-btn deval-en" onClick={() => handleBatchToggle(['en'], false)}>Anglais</button>
            <button type="button" className="batch-btn deval-ar" onClick={() => handleBatchToggle(['ar'], false)}>Arabe</button>
            <button type="button" className="batch-btn deval-all" onClick={() => handleBatchToggle(['fr', 'en', 'ar'], false)}>Tout dévalider</button>
          </div>
        </div>
      </section>

      {/* Main Student List Table */}
      <main className="table-container glass">
        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner" />
            <p>Chargement des élèves...</p>
          </div>
        ) : error ? (
          <div className="error-alert">
            <AlertTriangle size={24} />
            <p>{error}</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty-state">
            <Users size={40} className="empty-icon" />
            <h3>Aucun élève trouvé</h3>
            <p>Veuillez modifier vos critères de filtrage ou de recherche.</p>
          </div>
        ) : (
          <table className="students-table">
            <thead>
              <tr>
                <th>Élève</th>
                <th>Modèle Carnet</th>
                <th className="center-header">Polyvalent</th>
                <th className="center-header">Anglais</th>
                <th className="center-header">Arabe</th>
                <th>Appréciations</th>
                <th className="center-header">Actions Globales</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => {
                const hasAssignment = !!student.assignmentId
                const isAllDone = student.languages.fr && student.languages.en && student.languages.ar
                const isAllUndone = !student.languages.fr && !student.languages.en && !student.languages.ar

                return (
                  <tr key={student.studentId} className={hasAssignment ? '' : 'no-gradebook-row'}>
                    <td>
                      <div className="student-profile">
                        <div className="avatar">
                          {getInitials(student.firstName, student.lastName)}
                        </div>
                        <div>
                          <div className="student-name">
                            {student.lastName.toUpperCase()} {student.firstName}
                          </div>
                          {!hasAssignment && <span className="no-assignment-tag">Aucun carnet</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="template-name-badge">
                        {student.templateName || 'Non assigné'}
                      </span>
                    </td>
                    
                    {/* French Validation Toggle */}
                    <td className="center-cell">
                      {hasAssignment ? (
                        <button
                          type="button"
                          className={`lang-toggle-btn ${student.languages.fr ? 'completed' : 'pending'}`}
                          onClick={() => handleToggleIndividual(student, 'fr', student.languages.fr)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === `${student.studentId}-fr` ? (
                            <div className="mini-spinner" />
                          ) : student.languages.fr ? (
                            <><Check size={14} /> Fait</>
                          ) : (
                            <><X size={14} /> En attente</>
                          )}
                        </button>
                      ) : '-'}
                    </td>

                    {/* English Validation Toggle */}
                    <td className="center-cell">
                      {hasAssignment ? (
                        <button
                          type="button"
                          className={`lang-toggle-btn ${student.languages.en ? 'completed' : 'pending'}`}
                          onClick={() => handleToggleIndividual(student, 'en', student.languages.en)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === `${student.studentId}-en` ? (
                            <div className="mini-spinner" />
                          ) : student.languages.en ? (
                            <><Check size={14} /> Fait</>
                          ) : (
                            <><X size={14} /> En attente</>
                          )}
                        </button>
                      ) : '-'}
                    </td>

                    {/* Arabic Validation Toggle */}
                    <td className="center-cell">
                      {hasAssignment ? (
                        <button
                          type="button"
                          className={`lang-toggle-btn ${student.languages.ar ? 'completed' : 'pending'}`}
                          onClick={() => handleToggleIndividual(student, 'ar', student.languages.ar)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === `${student.studentId}-ar` ? (
                            <div className="mini-spinner" />
                          ) : student.languages.ar ? (
                            <><Check size={14} /> Fait</>
                          ) : (
                            <><X size={14} /> En attente</>
                          )}
                        </button>
                      ) : '-'}
                    </td>

                    <td>
                      {hasAssignment ? (
                        (student.appreciations || []).length > 0 ? (
                          <div className="appreciations-panel">
                            <div className="appreciations-summary">
                              <MessageSquareText size={14} />
                              <span>
                                {(student.appreciations || []).filter(app => !!app.value).length}
                                /{(student.appreciations || []).length} sélectionnée(s)
                              </span>
                            </div>
                            <div className="appreciations-grid">
                              {(student.appreciations || []).map(app => {
                                const loadingKey = `${student.studentId}-appreciation-${app.dataKey}`
                                return (
                                  <label className="appreciation-field" key={app.dataKey}>
                                    <span title={app.label}>{app.label}</span>
                                    <div className="appreciation-select-wrap">
                                      <select
                                        value={app.value || ''}
                                        onChange={e => handleUpdateAppreciation(student, app.dataKey, e.target.value)}
                                        disabled={actionLoading !== null}
                                      >
                                        <option value="">Sélectionner...</option>
                                        {app.options.map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                      {actionLoading === loadingKey && <div className="mini-spinner appreciation-spinner" />}
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="no-appreciations-tag">Aucune appréciation</span>
                        )
                      ) : '-'}
                    </td>

                    {/* Global Actions */}
                    <td className="center-cell">
                      {hasAssignment ? (
                        <div className="global-row-actions">
                          {actionLoading === `${student.studentId}-all` ? (
                            <div className="mini-spinner" />
                          ) : (
                            <>
                              {!isAllDone && (
                                <button
                                  type="button"
                                  className="global-action-btn complete-all"
                                  title="Tout valider"
                                  onClick={() => handleToggleAllIndividual(student, true)}
                                >
                                  Tout valider
                                </button>
                              )}
                              {!isAllUndone && (
                                <button
                                  type="button"
                                  className="global-action-btn reset-all"
                                  title="Tout réinitialiser"
                                  onClick={() => handleToggleAllIndividual(student, false)}
                                >
                                  Réinitialiser
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
