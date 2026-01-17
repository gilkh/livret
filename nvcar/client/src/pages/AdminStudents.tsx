import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import StudentSidebar from '../components/students/StudentSidebar'
import StudentGrid from '../components/students/StudentGrid'
import StudentDetails from '../components/students/StudentDetails'
import FileDropZone from '../components/students/FileDropZone'
import { Upload, CheckCircle, Trash2, Search, X, AlertTriangle, ImageOff, Copy } from 'lucide-react'

type Student = {
  _id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  className?: string
  classId?: string
  level?: string
  avatarUrl?: string
  logicalKey?: string
  parentName?: string
  parentPhone?: string
  fatherName?: string
  fatherEmail?: string
  motherEmail?: string
  studentEmail?: string
  status?: string
}

type Year = { _id: string; name: string; active: boolean }
type ClassInfo = { _id: string; name: string; level: string; schoolYearId: string }

export default function AdminStudents() {
  // Data State
  const [years, setYears] = useState<Year[]>([])
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])

  // UI State
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentHistory, setStudentHistory] = useState<any[]>([])
  const [showPhotoImport, setShowPhotoImport] = useState(false)
  const [importReport, setImportReport] = useState<any>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)

  // Photo check state
  const [showPhotoCheck, setShowPhotoCheck] = useState(false)
  const [photoCheckResult, setPhotoCheckResult] = useState<{ duplicates: any[]; missing: any[] } | null>(null)
  const [checkingPhotos, setCheckingPhotos] = useState(false)
  const [targetedImportReport, setTargetedImportReport] = useState<any>(null)
  const [importingTargeted, setImportingTargeted] = useState(false)

  // Complete class state
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeResult, setCompleteResult] = useState<{ success: number; errors: any[] } | null>(null)

  // Delete class state (3-step confirmation)
  const [showDeleteClassModal, setShowDeleteClassModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState(1)
  const [deletingClass, setDeletingClass] = useState(false)
  const [deleteClassResult, setDeleteClassResult] = useState<{ studentsDeleted: number; enrollmentsDeleted: number; errors: any[] } | null>(null)

  // View State
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [viewUnassigned, setViewUnassigned] = useState(false)

  useEffect(() => {
    loadYears()
    loadLevels()
  }, [])

  useEffect(() => {
    if (selectedYearId) {
      loadStudents(selectedYearId)
      loadClasses(selectedYearId)
    }
  }, [selectedYearId])

  const loadYears = async () => {
    const r = await api.get('/school-years')
    setYears(r.data)
    const active = r.data.find((y: Year) => y.active)
    if (active) setSelectedYearId(active._id)
    else if (r.data.length > 0) setSelectedYearId(r.data[0]._id)
  }

  const loadLevels = async () => {
    const r = await api.get('/levels')
    setLevels(r.data.map((l: any) => l.name))
  }

  const loadClasses = async (yearId: string) => {
    const r = await api.get('/classes', { params: { schoolYearId: yearId } })
    setClasses(r.data)
  }

  const loadStudents = async (yearId: string) => {
    setLoading(true)
    const r = await api.get('/students', { params: { schoolYearId: yearId } })
    setStudents(r.data)
    setLoading(false)
  }

  // Recalculate photo check from current students (used for refresh)
  const recalculatePhotoCheck = (studentList: Student[]) => {
    const byPhoto = new Map<string, Student[]>()
    const missing: Student[] = []

    for (const s of studentList) {
      if (!s.avatarUrl) {
        missing.push(s)
      } else {
        const key = s.avatarUrl
        if (!byPhoto.has(key)) byPhoto.set(key, [])
        byPhoto.get(key)!.push(s)
      }
    }

    const duplicates: { avatarUrl: string; students: Student[] }[] = []
    for (const [url, list] of byPhoto.entries()) {
      if (list.length > 1) {
        duplicates.push({ avatarUrl: url, students: list })
      }
    }

    return { duplicates, missing }
  }

  const checkPhotos = async () => {
    setCheckingPhotos(true)
    setShowPhotoCheck(true)
    setPhotoCheckResult(null)
    setTargetedImportReport(null)

    const result = recalculatePhotoCheck(students)
    setPhotoCheckResult(result)
    setCheckingPhotos(false)
  }

  // Refresh only the missing list without clearing import report
  const refreshPhotoCheckOnly = async () => {
    const r = await api.get('/students', { params: { schoolYearId: selectedYearId } })
    setStudents(r.data)
    const result = recalculatePhotoCheck(r.data)
    setPhotoCheckResult(result)
  }

  const handleTargetedImport = async (file: File, targetIds: string[]) => {
    if (!file || targetIds.length === 0) return

    const ext = file.name.toLowerCase().split('.').pop()
    if (!['zip', 'rar'].includes(ext || '')) {
      alert('Format non supporté. Utilisez un fichier ZIP ou RAR.')
      return
    }

    setImportingTargeted(true)
    setTargetedImportReport(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('targetStudentIds', JSON.stringify(targetIds))

    try {
      const res = await api.post('/media/import-photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setTargetedImportReport(res.data)

      // Refresh photo check after import (without clearing report)
      if (res.data.success > 0) {
        await refreshPhotoCheckOnly()
      }
    } catch (err: any) {
      setTargetedImportReport({ error: err.response?.data?.error || 'Import failed' })
    } finally {
      setImportingTargeted(false)
    }
  }

  // Get class ID from class name
  const getClassIdByName = (className: string): string | undefined => {
    const cls = classes.find(c => c.name === className)
    return cls?._id
  }

  // Grouping Logic
  const groupedStudents = useMemo(() => {
    const grouped: Record<string, Record<string, Student[]>> = {}
    const unassigned: Student[] = []

    // Initialize structure based on known levels
    levels.forEach(l => grouped[l] = {})

    students.forEach(s => {
      // Search Filter
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())) return

      if (!s.className) {
        unassigned.push(s)
        return
      }

      const level = s.level || 'Unknown'
      const className = s.className

      if (!grouped[level]) grouped[level] = {}
      if (!grouped[level][className]) grouped[level][className] = []

      grouped[level][className].push(s)
    })

    return { grouped, unassigned }
  }, [students, search, levels])

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processBatchFile(e.dataTransfer.files[0])
    }
  }

  const processBatchFile = async (file: File) => {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.rar')) {
      alert("Veuillez télécharger un fichier ZIP ou RAR")
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setLoading(true)
      const res = await api.post('/media/import-photos', formData)
      setImportReport(res.data)
      // Reload students to get new avatars
      loadStudents(selectedYearId)
    } catch (err) {
      alert("Erreur lors de l'import")
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !selectedStudent) return
    const file = e.target.files[0]
    const formData = new FormData()
    formData.append('file', file)

    try {
      const uploadRes = await api.post('/media/upload?folder=students', formData)
      const url = uploadRes.data.url

      await api.patch(`/students/${selectedStudent._id}`, { avatarUrl: url })

      // Update local state
      const updated = { ...selectedStudent, avatarUrl: url }
      setSelectedStudent(updated)
      setStudents(students.map(s => s._id === selectedStudent._id ? { ...s, avatarUrl: url } : s))
    } catch (err) {
      alert('Erreur lors du téléchargement de la photo')
    }
  }

  const selectStudent = async (s: Student) => {
    setSelectedStudent(s)
    // Fetch details
    const r = await api.get(`/students/${s._id}`)
    setSelectedStudent(r.data)

    if (r.data.enrollments) {
      const yearsMap = new Map(years.map((y: any) => [y._id, y]))
      const history = r.data.enrollments.map((e: any) => ({
        year: yearsMap.get(e.schoolYearId)?.name || 'Unknown Year',
        status: e.status,
        promotionStatus: e.promotionStatus || 'N/A',
        className: e.className || e.classId || '-'
      }))
      setStudentHistory(history)
    }
  }

  const handleDeleteStudent = async (studentId: string) => {
    try {
      await api.delete(`/students/${studentId}`)
      // Remove from local state
      setStudents(students.filter(s => s._id !== studentId))
      setSelectedStudent(null)
      setStudentHistory([])
    } catch (err: any) {
      alert('Erreur lors de la suppression: ' + (err.response?.data?.message || err.message))
      throw err
    }
  }

  const handleCompleteClass = async () => {
    if (!selectedClass) return
    const classId = getClassIdByName(selectedClass)
    if (!classId) {
      alert('Impossible de trouver l\'ID de la classe')
      return
    }

    setCompleting(true)
    try {
      const res = await api.post(`/students/complete-class/${classId}`)
      setCompleteResult(res.data)
    } catch (err: any) {
      alert('Erreur: ' + (err.response?.data?.message || err.message))
    } finally {
      setCompleting(false)
    }
  }

  const handleDeleteClass = async () => {
    if (!selectedClass) return
    const classId = getClassIdByName(selectedClass)
    if (!classId) {
      alert('Impossible de trouver l\'ID de la classe')
      return
    }

    setDeletingClass(true)
    try {
      const res = await api.delete(`/classes/${classId}/with-students`)
      setDeleteClassResult(res.data)
      // Reload data after deletion
      loadStudents(selectedYearId)
      loadClasses(selectedYearId)
      setSelectedClass(null)
    } catch (err: any) {
      alert('Erreur: ' + (err.response?.data?.message || err.message))
    } finally {
      setDeletingClass(false)
    }
  }

  const openDeleteClassModal = () => {
    setShowDeleteClassModal(true)
    setDeleteStep(1)
    setDeleteClassResult(null)
  }

  // View Helpers
  const currentStudents = viewUnassigned
    ? groupedStudents.unassigned
    : (selectedClass
      ? Object.values(groupedStudents.grouped).flatMap(l => l[selectedClass] || [])
      : [])

  return (
    <div className="container" style={{ maxWidth: 1600, padding: 24, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 className="title" style={{ margin: '0 0 4px 0', fontSize: 24 }}>Gestion des Élèves</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Gérez les inscriptions, photos et informations des élèves.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {selectedClass && !viewUnassigned && (
            <>
              <button
                className="btn"
                onClick={() => { setShowCompleteConfirm(true); setCompleteResult(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#10b981', borderColor: '#10b981' }}
              >
                <CheckCircle size={18} />
                <span>Compléter la classe</span>
              </button>
              <button
                className="btn"
                onClick={openDeleteClassModal}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#ef4444', borderColor: '#ef4444' }}
              >
                <Trash2 size={18} />
                <span>Supprimer la classe</span>
              </button>
            </>
          )}
          <button
            className="btn"
            onClick={() => { setShowPhotoImport(true); setImportReport(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' }}
          >
            <Upload size={18} />
            <span>Import Photos (Batch)</span>
          </button>
          <button
            className="btn"
            onClick={checkPhotos}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
          >
            <Search size={18} />
            <span>Vérifier Photos</span>
          </button>
        </div>
      </div>

      {/* Main Layout - 3 Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 380px', gap: 24, flex: 1, minHeight: 0 }}>

        {/* LEFT: Sidebar */}
        <StudentSidebar
          years={years}
          selectedYearId={selectedYearId}
          onYearChange={setSelectedYearId}
          groupedStudents={groupedStudents}
          expandedLevels={expandedLevels}
          onToggleLevel={(level) => {
            const next = new Set(expandedLevels)
            if (next.has(level)) next.delete(level)
            else next.add(level)
            setExpandedLevels(next)
          }}
          selectedClass={selectedClass}
          viewUnassigned={viewUnassigned}
          onSelectClass={(cls) => { setSelectedClass(cls); setViewUnassigned(false) }}
          onViewUnassigned={() => { setViewUnassigned(true); setSelectedClass(null) }}
        />

        {/* CENTER: Grid */}
        <StudentGrid
          students={currentStudents}
          loading={loading}
          viewUnassigned={viewUnassigned}
          selectedClass={selectedClass}
          search={search}
          onSearchChange={setSearch}
          selectedStudentId={selectedStudent?._id}
          onSelectStudent={selectStudent}
        />

        {/* RIGHT: Details */}
        <StudentDetails
          student={selectedStudent}
          history={studentHistory}
          onPhotoUpload={handlePhotoUpload}
          onDelete={handleDeleteStudent}
        />
      </div>

      {/* MODAL: Photo Check Results */}
      {showPhotoCheck && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, width: '90%', maxWidth: 700, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Vérification des Photos</h2>
              <button onClick={() => setShowPhotoCheck(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {checkingPhotos ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Vérification en cours...</div>
              ) : photoCheckResult ? (
                <>
                  {/* Summary */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                    <div style={{ flex: 1, padding: 16, background: photoCheckResult.duplicates.length > 0 ? '#fef3c7' : '#d1fae5', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Copy size={18} color={photoCheckResult.duplicates.length > 0 ? '#b45309' : '#059669'} />
                        <span style={{ fontWeight: 600, color: photoCheckResult.duplicates.length > 0 ? '#92400e' : '#065f46' }}>
                          {photoCheckResult.duplicates.length} photo(s) en double
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: photoCheckResult.duplicates.length > 0 ? '#a16207' : '#047857' }}>
                        {photoCheckResult.duplicates.reduce((sum, d) => sum + d.students.length, 0)} élèves concernés
                      </div>
                    </div>
                    <div style={{ flex: 1, padding: 16, background: photoCheckResult.missing.length > 0 ? '#fee2e2' : '#d1fae5', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <ImageOff size={18} color={photoCheckResult.missing.length > 0 ? '#dc2626' : '#059669'} />
                        <span style={{ fontWeight: 600, color: photoCheckResult.missing.length > 0 ? '#991b1b' : '#065f46' }}>
                          {photoCheckResult.missing.length} élève(s) sans photo
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Duplicates */}
                  {photoCheckResult.duplicates.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={16} color="#b45309" /> Photos en double
                      </h3>
                      {photoCheckResult.duplicates.map((dup, i) => (
                        <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <img
                              src={dup.avatarUrl}
                              alt=""
                              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '2px solid #fbbf24' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>
                                Cette photo est utilisée par {dup.students.length} élèves :
                              </div>
                              {dup.students.map((s: Student) => (
                                <div key={s._id} style={{ fontSize: 13, color: '#78350f', padding: '2px 0' }}>
                                  • {s.firstName} {s.lastName} {s.className ? `(${s.className})` : ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Missing */}
                  {photoCheckResult.missing.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ImageOff size={16} color="#dc2626" /> Élèves sans photo ({photoCheckResult.missing.length})
                      </h3>

                      {/* Import for missing students */}
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 13, color: '#1e40af', marginBottom: 8, fontWeight: 500 }}>
                          Importer les photos pour ces élèves :
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="file"
                            accept=".zip,.rar"
                            id="targeted-import-input"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                handleTargetedImport(file, photoCheckResult.missing.map((s: Student) => s._id))
                              }
                              e.target.value = ''
                            }}
                          />
                          <label
                            htmlFor="targeted-import-input"
                            className="btn"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                              cursor: importingTargeted ? 'wait' : 'pointer',
                              opacity: importingTargeted ? 0.7 : 1
                            }}
                          >
                            <Upload size={16} />
                            {importingTargeted ? 'Import en cours...' : 'Choisir fichier ZIP/RAR'}
                          </label>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                          Seuls les élèves sans photo seront mis à jour.
                        </div>
                      </div>

                      {/* Targeted import report */}
                      {targetedImportReport && !targetedImportReport.error && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ color: '#166534', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                            ✓ {targetedImportReport.success} photo(s) importée(s), {targetedImportReport.failed} échec(s)
                          </div>

                          {/* Detailed report - only show items needing review (hide matched + already fixed) */}
                          {targetedImportReport.report && (() => {
                            const missingIds = new Set((photoCheckResult?.missing || []).map((s: Student) => String(s._id)))
                            const filteredReport = targetedImportReport.report.filter((r: any) => {
                              if (r.status === 'matched') return false
                              // Only show items that have at least one actionable similar student (in missing list)
                              const actionableSuggestions = (r.similarStudents || []).filter((s: any) => missingIds.has(String(s._id)))
                              if (actionableSuggestions.length === 0) return false
                              return true
                            })

                            if (filteredReport.length === 0) return null

                            return (
                              <div style={{ maxHeight: 250, overflowY: 'auto', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                {filteredReport.map((r: any, i: number) => (
                                  <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#334155' }}>{r.filename}</span>
                                      {r.status === 'needs_review' ? (
                                        <span style={{ fontSize: 11, padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 4 }}>À valider</span>
                                      ) : (
                                        <span style={{ fontSize: 11, padding: '2px 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>Non trouvé</span>
                                      )}
                                    </div>

                                    {/* Show reason */}
                                    {r.reason && (
                                      <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                                        Raison: {r.reason === 'no_match_in_class' ? 'Non trouvé dans la classe' : 
                                                 r.reason === 'class_mismatch' ? 'Classe différente' :
                                                 r.reason === 'multiple_matches' ? 'Plusieurs élèves possibles' : r.reason}
                                      </div>
                                    )}

                                    {/* Similar students with confirm buttons - filter out those who now have photos */}
                                    {r.similarStudents?.length > 0 && (
                                      <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef3c7', borderRadius: 6 }}>
                                        <div style={{ color: '#92400e', fontWeight: 500, marginBottom: 6, fontSize: 11 }}>Élèves similaires :</div>
                                        {r.similarStudents
                                          .filter((s: any) => missingIds.has(String(s._id)))
                                          .map((s: any, j: number) => (
                                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                                            <span style={{ color: '#78350f', fontSize: 11 }}>
                                              • {s.name}{s.birthYear ? ` (${s.birthYear})` : ''}{s.className ? ` — ${s.className}` : ''}
                                            </span>
                                            {r.pendingId && (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    await api.post('/media/confirm-photo', { pendingId: r.pendingId, studentId: s._id })
                                                    // Mark as matched (will be filtered out of display)
                                                    setTargetedImportReport((prev: any) => {
                                                      if (!prev?.report) return prev
                                                      const nextReport = prev.report.map((item: any) => 
                                                        item.pendingId === r.pendingId ? { ...item, status: 'matched', student: s.name } : item
                                                      )
                                                      return { ...prev, success: prev.success + 1, failed: prev.failed - 1, report: nextReport }
                                                    })
                                                    // Refresh students and re-check (without clearing report)
                                                    await refreshPhotoCheckOnly()
                                                  } catch (err) {
                                                    console.error('Confirm failed', err)
                                                  }
                                                }}
                                                style={{
                                                  padding: '2px 8px', fontSize: 10, background: '#3b82f6', color: '#fff',
                                                  border: 'none', borderRadius: 4, cursor: 'pointer'
                                                }}
                                              >
                                                Confirmer
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {targetedImportReport?.error && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ color: '#dc2626', fontSize: 13 }}>Erreur: {targetedImportReport.error}</div>
                        </div>
                      )}

                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {photoCheckResult.missing.map((s: Student) => (
                            <span
                              key={s._id}
                              style={{
                                background: '#fee2e2', padding: '4px 10px', borderRadius: 6,
                                fontSize: 12, color: '#991b1b', border: '1px solid #fca5a5'
                              }}
                            >
                              {s.firstName} {s.lastName} {s.className ? `(${s.className})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {photoCheckResult.duplicates.length === 0 && photoCheckResult.missing.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#059669' }}>
                      <CheckCircle size={48} style={{ marginBottom: 16 }} />
                      <div style={{ fontSize: 16, fontWeight: 500 }}>Toutes les photos sont correctes !</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Aucun doublon et tous les élèves ont une photo.</div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowPhotoCheck(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Batch Import */}
      {showPhotoImport && (
        <FileDropZone
          onFileSelect={processBatchFile}
          isDragActive={dragActive}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          loading={loading}
          importReport={importReport}
          onUpdateReport={setImportReport}
          onClose={() => setShowPhotoImport(false)}
        />
      )}

      {/* MODAL: Complete Class Confirmation */}
      {showCompleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {!completeResult ? (
              <>
                <h3 style={{ margin: '0 0 12px', color: '#1e293b' }}>Compléter la classe</h3>
                <p style={{ color: '#64748b', marginBottom: 24 }}>
                  Vous êtes sur le point de créer un snapshot (sauvegarde) des carnets de tous les élèves de la classe <strong>{selectedClass}</strong>.
                  <br /><br />
                  Cette action va:
                </p>
                <ul style={{ color: '#64748b', marginBottom: 24, paddingLeft: 20 }}>
                  <li>Sauvegarder l'état actuel de chaque carnet</li>
                  <li>Conserver les signatures existantes</li>
                  <li>Permettre de retrouver ces données plus tard</li>
                </ul>
                <p style={{ color: '#059669', marginBottom: 24, fontWeight: 500 }}>
                  ✓ Cette action n'est pas destructive et peut être effectuée plusieurs fois.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setShowCompleteConfirm(false)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCompleteClass}
                    disabled={completing}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: completing ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      opacity: completing ? 0.7 : 1
                    }}
                  >
                    {completing ? 'En cours...' : 'Compléter'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 12px', color: '#1e293b' }}>
                  {completeResult.errors.length === 0 ? '✅ Terminé!' : '⚠️ Terminé avec des erreurs'}
                </h3>
                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>{completeResult.success}</div>
                  <div style={{ color: '#064e3b', fontSize: 14 }}>élèves traités avec succès</div>
                </div>
                {completeResult.errors.length > 0 && (
                  <div style={{ background: '#fef2f2', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{completeResult.errors.length}</div>
                    <div style={{ color: '#991b1b', fontSize: 14 }}>erreurs</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#7f1d1d', maxHeight: 100, overflowY: 'auto' }}>
                      {completeResult.errors.slice(0, 5).map((e, i) => (
                        <div key={i}>{e.studentId}: {e.error}</div>
                      ))}
                      {completeResult.errors.length > 5 && (
                        <div>... et {completeResult.errors.length - 5} autres</div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowCompleteConfirm(false)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#6c5ce7',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Delete Class 3-Step Confirmation */}
      {showDeleteClassModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {!deleteClassResult ? (
              <>
                {/* Step indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                  {[1, 2, 3].map(step => (
                    <div
                      key={step}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 14,
                        background: deleteStep >= step ? '#ef4444' : '#f1f5f9',
                        color: deleteStep >= step ? 'white' : '#94a3b8',
                        transition: 'all 0.3s'
                      }}
                    >
                      {step}
                    </div>
                  ))}
                </div>

                {/* Step 1 */}
                {deleteStep === 1 && (
                  <>
                    <h3 style={{ margin: '0 0 16px', color: '#dc2626', textAlign: 'center' }}>
                      ⚠️ Attention - Suppression de classe
                    </h3>
                    <p style={{ color: '#64748b', marginBottom: 16, textAlign: 'center' }}>
                      Vous allez supprimer la classe <strong style={{ color: '#dc2626' }}>{selectedClass}</strong> et <strong>TOUS les élèves</strong> qui y sont inscrits.
                    </p>
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: 16, marginBottom: 20, border: '1px solid #fecaca' }}>
                      <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Cette action supprimera :</div>
                      <ul style={{ color: '#991b1b', paddingLeft: 20, margin: 0 }}>
                        <li>Tous les élèves de la classe</li>
                        <li>Leurs carnets et compétences</li>
                        <li>Leurs signatures et historiques</li>
                      </ul>
                    </div>
                    <p style={{ color: '#dc2626', fontWeight: 700, textAlign: 'center', marginBottom: 20 }}>
                      ❌ Cette action est IRRÉVERSIBLE
                    </p>
                  </>
                )}

                {/* Step 2 */}
                {deleteStep === 2 && (
                  <>
                    <h3 style={{ margin: '0 0 16px', color: '#dc2626', textAlign: 'center' }}>
                      🔴 Confirmation requise (2/3)
                    </h3>
                    <p style={{ color: '#64748b', marginBottom: 16, textAlign: 'center', fontSize: 18 }}>
                      Êtes-vous <strong>ABSOLUMENT CERTAIN</strong> de vouloir supprimer :
                    </p>
                    <div style={{
                      background: '#fef2f2',
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 20,
                      textAlign: 'center',
                      border: '2px solid #ef4444'
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{selectedClass}</div>
                      <div style={{ fontSize: 14, color: '#991b1b', marginTop: 8 }}>
                        {currentStudents.length} élève(s) seront supprimés
                      </div>
                    </div>
                    <p style={{ color: '#64748b', textAlign: 'center', marginBottom: 20 }}>
                      Encore une confirmation sera nécessaire à l'étape suivante.
                    </p>
                  </>
                )}

                {/* Step 3 */}
                {deleteStep === 3 && (
                  <>
                    <h3 style={{ margin: '0 0 16px', color: '#dc2626', textAlign: 'center' }}>
                      🛑 Dernière confirmation (3/3)
                    </h3>
                    <div style={{
                      background: '#7f1d1d',
                      color: 'white',
                      borderRadius: 12,
                      padding: 24,
                      marginBottom: 20,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 16, marginBottom: 12 }}>Vous êtes sur le point de supprimer définitivement :</div>
                      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{selectedClass}</div>
                      <div style={{ fontSize: 18, opacity: 0.9 }}>
                        {currentStudents.length} élève(s) • Toutes les données
                      </div>
                    </div>
                    <p style={{ color: '#dc2626', fontWeight: 700, textAlign: 'center', marginBottom: 20, fontSize: 16 }}>
                      Cliquez sur "SUPPRIMER DÉFINITIVEMENT" pour confirmer
                    </p>
                  </>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => {
                      if (deleteStep === 1) {
                        setShowDeleteClassModal(false)
                      } else {
                        setDeleteStep(deleteStep - 1)
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {deleteStep === 1 ? 'Annuler' : '← Retour'}
                  </button>
                  <button
                    onClick={() => {
                      if (deleteStep < 3) {
                        setDeleteStep(deleteStep + 1)
                      } else {
                        handleDeleteClass()
                      }
                    }}
                    disabled={deletingClass}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      background: deleteStep === 3 ? '#7f1d1d' : '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: deletingClass ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      opacity: deletingClass ? 0.7 : 1
                    }}
                  >
                    {deletingClass
                      ? 'Suppression...'
                      : deleteStep === 3
                        ? '🗑️ SUPPRIMER DÉFINITIVEMENT'
                        : 'Continuer →'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 12px', color: '#1e293b', textAlign: 'center' }}>
                  ✅ Classe supprimée
                </h3>
                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', textAlign: 'center' }}>
                    {deleteClassResult.studentsDeleted}
                  </div>
                  <div style={{ color: '#064e3b', fontSize: 14, textAlign: 'center' }}>élèves supprimés</div>
                </div>
                {deleteClassResult.errors.length > 0 && (
                  <div style={{ background: '#fef2f2', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{deleteClassResult.errors.length}</div>
                    <div style={{ color: '#991b1b', fontSize: 14 }}>erreurs</div>
                  </div>
                )}
                <button
                  onClick={() => setShowDeleteClassModal(false)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#6c5ce7',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
