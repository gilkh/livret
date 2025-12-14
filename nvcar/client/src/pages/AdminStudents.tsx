import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import StudentSidebar from '../components/students/StudentSidebar'
import StudentGrid from '../components/students/StudentGrid'
import StudentDetails from '../components/students/StudentDetails'
import FileDropZone from '../components/students/FileDropZone'
import { Upload } from 'lucide-react'

type Student = {
  _id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  className?: string
  level?: string
  avatarUrl?: string
  logicalKey?: string
  parentName?: string
  parentPhone?: string
  status?: string
}

type Year = { _id: string; name: string; active: boolean }

export default function AdminStudents() {
  // Data State
  const [years, setYears] = useState<Year[]>([])
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [levels, setLevels] = useState<string[]>([])
  
  // UI State
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentHistory, setStudentHistory] = useState<any[]>([])
  const [showPhotoImport, setShowPhotoImport] = useState(false)
  const [importReport, setImportReport] = useState<any>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  
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

  const loadStudents = async (yearId: string) => {
    setLoading(true)
    const r = await api.get('/students', { params: { schoolYearId: yearId } })
    setStudents(r.data)
    setLoading(false)
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
      if (!file.name.endsWith('.zip')) {
          alert("Veuillez télécharger un fichier ZIP")
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
        <button 
          className="btn" 
          onClick={() => { setShowPhotoImport(true); setImportReport(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' }}
        >
            <Upload size={18} />
            <span>Import Photos (Batch)</span>
        </button>
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
        />
      </div>

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
          onClose={() => setShowPhotoImport(false)}
        />
      )}
    </div>
  )
}

