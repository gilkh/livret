import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import { School, Users, CheckCircle2, XCircle } from 'lucide-react'
import './AdminClassTeacherCoverage.css'

type ClassDoc = {
  _id: string
  name: string
  level?: string
}

type TeacherAssignment = {
  _id: string
  classId: string
  teacherId: string
  teacherName?: string
  languages?: string[]
  isProfPolyvalent?: boolean
}

type TeacherBreakdown = {
  english: string[]
  arabic: string[]
  poly: string[]
}

type LevelGroup = {
  level: string
  classes: Array<{
    _id: string
    name: string
    teacherCount: number
    hasTeacher: boolean
    teacherNames: string[]
    breakdown: TeacherBreakdown
  }>
  assignedClasses: number
}

export default function AdminClassTeacherCoverage() {
  const { activeYearId } = useSchoolYear()
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      if (!activeYearId) return

      try {
        setLoading(true)
        setError(null)

        const [classesRes, assignmentsRes] = await Promise.all([
          api.get(`/classes?schoolYearId=${activeYearId}`),
          api.get(`/teacher-assignments?schoolYearId=${activeYearId}`),
        ])

        setClasses(classesRes.data || [])
        setAssignments(assignmentsRes.data || [])
      } catch (e) {
        console.error(e)
        setError('Impossible de charger le suivi des assignations.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeYearId])

  const groupedByLevel = useMemo<LevelGroup[]>(() => {
    const normalizeLanguage = (value: string) => {
      const normalized = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()

      if (normalized === 'en' || normalized.includes('english') || normalized.includes('anglais')) return 'en'
      if (normalized === 'ar' || normalized.includes('arab')) return 'ar'
      return normalized
    }

    const dedupeNames = (list: string[]) => Array.from(new Set(list.map(name => name.trim()).filter(Boolean)))

    const assignmentsByClass = new Map<string, TeacherAssignment[]>()

    assignments.forEach(assignment => {
      const list = assignmentsByClass.get(assignment.classId) || []
      list.push(assignment)
      assignmentsByClass.set(assignment.classId, list)
    })

    const levelMap = new Map<string, LevelGroup>()

    classes.forEach(classDoc => {
      const levelKey = classDoc.level?.trim() || 'Sans niveau'
      const classAssignments = assignmentsByClass.get(classDoc._id) || []

      if (!levelMap.has(levelKey)) {
        levelMap.set(levelKey, {
          level: levelKey,
          classes: [],
          assignedClasses: 0,
        })
      }

      const currentLevel = levelMap.get(levelKey)!
      const teacherNames = dedupeNames(classAssignments.map(item => item.teacherName || ''))
      const englishNames = dedupeNames(
        classAssignments
          .filter(item => (item.languages || []).map(normalizeLanguage).includes('en'))
          .map(item => item.teacherName || '')
      )
      const arabicNames = dedupeNames(
        classAssignments
          .filter(item => (item.languages || []).map(normalizeLanguage).includes('ar'))
          .map(item => item.teacherName || '')
      )
      const polyNames = dedupeNames(
        classAssignments
          .filter(item => item.isProfPolyvalent)
          .map(item => item.teacherName || '')
      )

      const teacherCount = teacherNames.length || classAssignments.length
      const hasTeacher = teacherCount > 0

      if (hasTeacher) {
        currentLevel.assignedClasses += 1
      }

      currentLevel.classes.push({
        _id: classDoc._id,
        name: classDoc.name,
        teacherCount,
        hasTeacher,
        teacherNames,
        breakdown: {
          english: englishNames,
          arabic: arabicNames,
          poly: polyNames,
        },
      })
    })

    return Array.from(levelMap.values())
      .map(levelGroup => ({
        ...levelGroup,
        classes: [...levelGroup.classes].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
      }))
      .sort((a, b) => a.level.localeCompare(b.level, 'fr', { numeric: true, sensitivity: 'base' }))
  }, [classes, assignments])

  const totals = useMemo(() => {
    const totalClasses = classes.length
    const assignedClasses = groupedByLevel.reduce((sum, levelGroup) => sum + levelGroup.assignedClasses, 0)
    return {
      totalClasses,
      assignedClasses,
      unassignedClasses: Math.max(totalClasses - assignedClasses, 0),
    }
  }, [classes, groupedByLevel])

  return (
    <div className="admin-class-teacher-coverage">
      <header className="coverage-header">
        <h1 className="coverage-title">
          <School size={34} strokeWidth={2.5} />
          Couverture des Assignations
        </h1>
        <p className="coverage-subtitle">
          Vérifiez pour chaque classe et niveau si un enseignant est assigné, et combien d&apos;enseignants sont affectés.
        </p>
      </header>

      <section className="coverage-stats">
        <div className="coverage-stat-card">
          <span className="coverage-stat-label">Classes totales</span>
          <strong className="coverage-stat-value">{totals.totalClasses}</strong>
        </div>
        <div className="coverage-stat-card">
          <span className="coverage-stat-label">Classes avec enseignant</span>
          <strong className="coverage-stat-value positive">{totals.assignedClasses}</strong>
        </div>
        <div className="coverage-stat-card">
          <span className="coverage-stat-label">Classes sans enseignant</span>
          <strong className="coverage-stat-value negative">{totals.unassignedClasses}</strong>
        </div>
      </section>

      {loading && <div className="coverage-feedback">Chargement...</div>}
      {error && <div className="coverage-feedback error">{error}</div>}

      {!loading && !error && groupedByLevel.length === 0 && (
        <div className="coverage-feedback">Aucune classe disponible pour cette année scolaire.</div>
      )}

      {!loading && !error && groupedByLevel.length > 0 && (
        <div className="coverage-levels">
          {groupedByLevel.map(levelGroup => (
            <section key={levelGroup.level} className="coverage-level-card">
              <div className="coverage-level-header">
                <h2>{levelGroup.level}</h2>
                <span>
                  {levelGroup.assignedClasses}/{levelGroup.classes.length} classes assignées
                </span>
              </div>

              <div className="coverage-table-wrap">
                <table className="coverage-table">
                  <thead>
                    <tr>
                      <th>Classe</th>
                      <th>Assignée</th>
                      <th>Total</th>
                      <th>English</th>
                      <th>Arabic</th>
                      <th>Poly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levelGroup.classes.map(classItem => (
                      <tr key={classItem._id}>
                        <td>{classItem.name}</td>
                        <td>
                          {classItem.hasTeacher ? (
                            <span className="status-pill assigned">
                              <CheckCircle2 size={16} />
                              Oui
                            </span>
                          ) : (
                            <span className="status-pill unassigned">
                              <XCircle size={16} />
                              Non
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="teacher-count">
                            <Users size={15} />
                            {classItem.teacherCount}
                          </span>
                        </td>
                        <td className="teacher-breakdown-cell">
                          <div className="teacher-breakdown-count">{classItem.breakdown.english.length}</div>
                          <div className="teacher-breakdown-names">
                            {classItem.breakdown.english.length > 0 ? classItem.breakdown.english.join(', ') : '—'}
                          </div>
                        </td>
                        <td className="teacher-breakdown-cell">
                          <div className="teacher-breakdown-count">{classItem.breakdown.arabic.length}</div>
                          <div className="teacher-breakdown-names">
                            {classItem.breakdown.arabic.length > 0 ? classItem.breakdown.arabic.join(', ') : '—'}
                          </div>
                        </td>
                        <td className="teacher-breakdown-cell">
                          <div className="teacher-breakdown-count">{classItem.breakdown.poly.length}</div>
                          <div className="teacher-breakdown-names">
                            {classItem.breakdown.poly.length > 0 ? classItem.breakdown.poly.join(', ') : '—'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
