import { useEffect, useState } from 'react'
import { FileDown, RefreshCcw, Mail, Eye, Archive, CheckCircle2, XCircle, AlertCircle, Send, CheckSquare, Square, FolderArchive, MailPlus, Trash2, Users } from 'lucide-react'
import api from '../api'
import './SubAdminExportedGradebooks.css'

type ExportedFile = {
  _id: string
  assignmentId: string
  studentId: string
  firstName: string
  lastName: string
  yearName: string
  level: string
  className: string
  fileName: string
  emails?: {
    father?: string
    mother?: string
    student?: string
  }
  version: number
  quality?: 'high' | 'compressed'
}

type ExportedBatch = {
  _id: string
  groupLabel: string
  yearName?: string
  semester?: string
  archiveFileName: string
  exportedCount: number
  failedCount: number
  createdAt: string
  files: ExportedFile[]
}

type EmailPreview = {
  subject: string
  html: string
  text: string
  sampleRecipients: string[]
  selectedFileCount: number
  totalRecipientCount: number
  previewFile?: {
    fileId: string
    studentName: string
    fileName: string
  }
}

type EmailJob = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  totalItems: number
  processedItems: number
  sentItems: number
  skippedItems: number
  failedItems: number
  error?: string
  items: Array<{
    fileId: string
    studentName: string
    recipients: string[]
    status: 'pending' | 'sent' | 'skipped' | 'failed'
    error?: string
  }>
  creatorName?: string
  startedAt?: string
}

export default function SubAdminExportedGradebooks() {
  const [batches, setBatches] = useState<ExportedBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [includeFather, setIncludeFather] = useState(true)
  const [includeMother, setIncludeMother] = useState(true)
  const [includeStudent, setIncludeStudent] = useState(true)
  const [customMessage, setCustomMessage] = useState('')
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [jobId, setJobId] = useState('')
  const [emailJob, setEmailJob] = useState<EmailJob | null>(null)
  const [sendLoading, setSendLoading] = useState(false)
  const [scopeLevel, setScopeLevel] = useState('')
  const [scopeClassName, setScopeClassName] = useState('')
  const [scopeStudentId, setScopeStudentId] = useState('')
  const [zipDownloadLoading, setZipDownloadLoading] = useState(false)
  const [jobHistory, setJobHistory] = useState<EmailJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [rightTab, setRightTab] = useState<'config' | 'history'>('config')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmStep, setConfirmStep] = useState(1)
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [activeFileForTest, setActiveFileForTest] = useState<string | null>(null)
  const [testEmailValue, setTestEmailValue] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)

  const [assignedClasses, setAssignedClasses] = useState<any[]>([])
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({})
  const [selectedContext, setSelectedContext] = useState<{ level: string; className: string; semester: string } | null>(null)
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [selectedYearName, setSelectedYearName] = useState<string>('')

  const token = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
  
  const loadInitialData = async () => {
    try {
      setLoading(true)
      setError('')
      const [batchesRes, classesRes, yearsRes] = await Promise.all([
        api.get('/gradebook-exports/batches'),
        api.get('/subadmin/classes'),
        api.get('/school-years')
      ])
      
      const nextBatches = Array.isArray(batchesRes.data) ? batchesRes.data : []
      const nextYears = Array.isArray(yearsRes.data) ? yearsRes.data : []
      const activeYear = nextYears.find((y: any) => y.active)
      
      setBatches(nextBatches)
      setAssignedClasses(Array.isArray(classesRes.data) ? classesRes.data : [])
      setSchoolYears(nextYears)
      
      if (activeYear && !selectedYearName) {
        setSelectedYearName(activeYear.name)
      } else if (nextYears.length > 0 && !selectedYearName) {
        setSelectedYearName(nextYears[0].name)
      }

      if (nextBatches.length > 0 && !selectedGroupKey && !selectedContext) {
        const first = nextBatches[0]
        setSelectedGroupKey(`${first.groupLabel}-${first.yearName}-${first.semester}`)
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de charger les données')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadInitialData() }, [])

  // Build Library Tree structure for the SELECTED YEAR
  // Level -> Class -> Semester -> { files, batches }
  const libraryTree: Record<string, Record<string, Record<string, { files: ExportedFile[], batches: ExportedBatch[] }>>> = {}

  // Filter batches by selected year
  const filteredBatchesByYear = batches.filter(b => b.yearName === selectedYearName)

  // Initialize tree with assigned levels/classes (only if viewing active year, 
  // otherwise we only show what was actually exported in previous years)
  const activeYear = schoolYears.find(y => y.active)
  if (selectedYearName === activeYear?.name) {
    assignedClasses.forEach(c => {
      const level = c.level || 'Sans niveau'
      const className = c.name || 'Sans classe'
      if (!libraryTree[level]) libraryTree[level] = {}
      if (!libraryTree[level][className]) libraryTree[level][className] = {
        'Semestre 1': { files: [], batches: [] },
        'Semestre 2': { files: [], batches: [] }
      }
    })
  }

  // Then populate with exported data for this year
  filteredBatchesByYear.forEach(batch => {
    batch.files.forEach(file => {
      const level = file.level || 'Sans niveau'
      const className = file.className || 'Sans classe'
      const semester = batch.semester || 'Semestre 1'

      if (!libraryTree[level]) libraryTree[level] = {}
      if (!libraryTree[level][className]) libraryTree[level][className] = {}
      if (!libraryTree[level][className][semester]) libraryTree[level][className][semester] = { files: [], batches: [] }
      
      const context = libraryTree[level][className][semester]
      
      if (!context.batches.some(b => b._id === batch._id)) {
        context.batches.push(batch)
      }
      
      if (!context.files.some(f => f._id === file._id)) {
        context.files.push(file)
      }
    })
  })

  // Keep the old lots grouping for compatibility or reference if needed, 
  // but we will primarily use libraryTree now.
  const groupedLots: any[] = []
  const lotMap = new Map<string, any>()
  
  batches.forEach(batch => {
    const key = `${batch.groupLabel}-${batch.yearName}-${batch.semester}`
    if (!lotMap.has(key)) {
      lotMap.set(key, {
        key,
        groupLabel: batch.groupLabel,
        yearName: batch.yearName,
        semester: batch.semester,
        batches: [],
        createdAt: batch.createdAt
      })
      groupedLots.push(lotMap.get(key))
    }
    const lot = lotMap.get(key)
    lot.batches.push(batch)
    if (new Date(batch.createdAt) > new Date(lot.createdAt)) lot.createdAt = batch.createdAt
  })

  const selectedLot = groupedLots.find(l => l.key === selectedGroupKey) || null

  // Contextual filtering logic
  let activeBatches: ExportedBatch[] = []
  let activeFiles: ExportedFile[] = []

  if (selectedContext) {
    const { level, className, semester } = selectedContext
    const context = libraryTree[level]?.[className]?.[semester]
    if (context) {
      activeBatches = context.batches
      activeFiles = context.files.map(f => {
        // Find which batch this file belongs to in this context
        const batch = context.batches.find(b => b.files.some(bf => bf._id === f._id))
        return { ...f, batchId: batch?._id }
      })
    }
  } else if (selectedLot) {
    activeBatches = selectedLot.batches
    activeFiles = selectedLot.batches.flatMap((b: any) => b.files.map((f: any) => ({ ...f, batchId: b._id })))
  }

  const allFilesForLot: ExportedFile[] = activeFiles

  const uniqueFileVersionPairs = Array.from(
    new Map(allFilesForLot.map(f => [`${f.assignmentId}-${f.version}`, f])).values()
  ).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))

  const filteredBatchFiles = uniqueFileVersionPairs.filter((file) => {
    if (scopeLevel && String(file.level || '') !== scopeLevel) return false
    if (scopeClassName && String(file.className || '') !== scopeClassName) return false
    if (scopeStudentId && String(file._id) !== scopeStudentId) return false
    return true
  })

  const levelOptions = Array.from(new Set(allFilesForLot.map((file) => String(file.level || '').trim()).filter(Boolean))).sort()
  const classOptions = Array.from(new Set(allFilesForLot
    .filter((file) => !scopeLevel || String(file.level || '') === scopeLevel)
    .map((file) => String(file.className || '').trim())
    .filter(Boolean))).sort()
  const studentOptions = uniqueFileVersionPairs.filter((file) => {
    if (scopeLevel && String(file.level || '') !== scopeLevel) return false
    if (scopeClassName && String(file.className || '') !== scopeClassName) return false
    return true
  })

  useEffect(() => {
    if (!selectedLot && !selectedContext) {
      setSelectedFileIds([])
      setScopeLevel('')
      setScopeClassName('')
      setScopeStudentId('')
      return
    }
    const bId = selectedContext 
      ? libraryTree[selectedContext.level]?.[selectedContext.className]?.[selectedContext.semester]?.batches[0]?._id
      : selectedLot?.batches[0]?._id
    
    if (bId) loadJobHistory(bId)
  }, [selectedGroupKey, selectedContext])

  const loadJobHistory = async (batchId: string) => {
    if (!batchId) { setJobHistory([]); return }
    try {
      setHistoryLoading(true)
      const res = await api.get(`/gradebook-exports/batches/${batchId}/email-jobs`)
      setJobHistory(res.data)
    } finally { setHistoryLoading(false) }
  }

  useEffect(() => {
    if (!jobId) return
    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.get(`/gradebook-exports/email-jobs/${jobId}`)
        setEmailJob(response.data)
        if (response.data?.status === 'completed' || response.data?.status === 'failed') window.clearInterval(intervalId)
      } catch { window.clearInterval(intervalId) }
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [jobId])

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) => current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId])
  }

  const selectScopeFiles = () => {
    if (!selectedLot) return
    setSelectedFileIds(filteredBatchFiles.map((file) => file._id))
  }

  const previewEmail = async () => {
    if ((!selectedLot && !selectedContext) || selectedFileIds.length === 0) return
    try {
      setPreviewLoading(true)
      const bId = selectedContext 
        ? libraryTree[selectedContext.level]?.[selectedContext.className]?.[selectedContext.semester]?.batches[0]?._id
        : selectedLot?.batches[0]?._id
      
      const response = await api.post(`/gradebook-exports/batches/${bId}/email-preview`, { selectedFileIds, includeFather, includeMother, includeStudent, customMessage })
      setEmailPreview(response.data)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur aperçu')
    } finally { setPreviewLoading(false) }
  }

  const sendEmails = async () => {
    if ((!selectedLot && !selectedContext) || selectedFileIds.length === 0) return
    try {
      setSendLoading(true)
      setShowConfirmModal(false)
      const bId = selectedContext 
        ? libraryTree[selectedContext.level]?.[selectedContext.className]?.[selectedContext.semester]?.batches[0]?._id
        : selectedLot?.batches[0]?._id

      const res = await api.post(`/gradebook-exports/batches/${bId}/send`, { 
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        customMessage
      })
      setJobId(res.data.jobId)
      setRightTab('history')
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur envoi') } finally { setSendLoading(false) }
  }

  const downloadFileUrl = (fileId: string, batchId: string) => {
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/gradebook-exports/batches/${batchId}/files/${fileId}/download${query}`
  }

  const downloadSelectedFiles = async (quality?: 'high' | 'compressed') => {
    if ((!selectedLot && !selectedContext) || selectedFileIds.length === 0) return
    setZipDownloadLoading(true)
    try {
      const bId = selectedContext 
        ? libraryTree[selectedContext.level]?.[selectedContext.className]?.[selectedContext.semester]?.batches[0]?._id
        : selectedLot?.batches[0]?._id

      const response = await api.post(`/gradebook-exports/batches/${bId}/download`, { 
        selectedFileIds,
        quality
      }, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const label = selectedContext ? `${selectedContext.className}-${selectedContext.semester}` : selectedLot?.groupLabel
      link.download = `${label || 'exports'}${quality ? `-${quality.toUpperCase()}` : ''}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally { setZipDownloadLoading(false) }
  }

  const deleteBatch = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce lot ?')) return
    try {
      await api.delete(`/gradebook-exports/batches/${batchId}`)
      setBatches(current => current.filter(b => b._id !== batchId))
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur') }
  }

  const deleteFile = async (fileId: string) => {
    if (!window.confirm('Supprimer ce fichier ?')) return
    try {
      // Find which batch this file belongs to
      const file = allFilesForLot.find(f => f._id === fileId)
      const bId = file?.batchId
      if (!bId) throw new Error('Batch not found')

      const res = await api.delete(`/gradebook-exports/batches/${bId}/files/${fileId}`)
      if (res.data.batchDeleted) {
        setBatches(current => current.filter(b => b._id !== bId))
      } else {
        setBatches(current => current.map(b => b._id === bId ? { ...b, exportedCount: Math.max(0, b.exportedCount - 1), files: b.files.filter(f => f._id !== fileId) } : b))
        setSelectedFileIds(current => current.filter(id => id !== fileId))
      }
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur') }
  }

  const sendTestEmails = async () => {
    if (!testEmailValue || selectedFileIds.length === 0) return
    try {
      setTestLoading(true)
      setTestSuccess(false)
      // We'll reuse the main send logic but with an override
      const bId = selectedContext 
        ? libraryTree[selectedContext.level]?.[selectedContext.className]?.[selectedContext.semester]?.batches[0]?._id
        : selectedLot?.batches[0]?._id
      if (!bId) return
      
      await api.post(`/gradebook-exports/batches/${bId}/send`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        customMessage,
        testEmailOverride: testEmailValue
      })
      setTestSuccess(true)
      setTimeout(() => setTestSuccess(false), 5000)
    } catch (e: any) {
      alert(e.response?.data?.message || 'Échec du test')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="exports-container">
      <div className="exports-header">
        <div>
          <h1 className="exports-title">Centre de Distribution</h1>
          <p className="exports-subtitle">Gérez vos lots exportés et distribuez les carnets par email aux familles.</p>
        </div>
        <button className="btn btn-icon" onClick={loadInitialData} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 24, padding: '16px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="main-workspace-grid">
        {/* COLUMN 1: NAVIGATION / LIBRARY */}
        <aside className="workspace-column sidebar">
          <div className="glass-card full-height flex-column">
            <div className="card-header">
              <Archive size={18} />
              <div className="card-title">Bibliothèque</div>
            </div>
            
            <div className="year-selector">
              {(() => {
                const activeYear = schoolYears.find(y => y.active)
                const activeSeq = activeYear?.sequence || 999999
                
                return schoolYears
                  .filter(y => (y.sequence || 0) <= activeSeq)
                  .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                  .slice(0, 3)
                  .map((year) => (
                    <button
                      key={year._id}
                      className={`year-pill ${selectedYearName === year.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedYearName(year.name)
                        setSelectedContext(null)
                        setSelectedGroupKey('')
                      }}
                    >
                      {year.name}
                    </button>
                  ))
              })()}
            </div>

            <div className="library-tree scrollable" style={{ padding: '0 0 12px 0', flex: 1 }}>
              {loading && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Chargement...</div>}
              {!loading && batches.length === 0 && assignedClasses.length === 0 && (
                <div className="empty-state mini">
                  <FolderArchive size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <span>Aucun export</span>
                </div>
              )}
              
              {Object.keys(libraryTree).sort().map((level) => {
                const levelTotalFiles = Object.values(libraryTree[level]).reduce((sum, cls) => 
                  sum + Object.values(cls).reduce((subSum, sem) => subSum + sem.files.length, 0), 0
                )
                
                return (
                  <div key={level} className="tree-node level-node">
                    <div 
                      className={`tree-label level-label ${expandedLevels[level] ? 'expanded' : ''}`}
                      onClick={() => setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }))}
                    >
                      <FolderArchive size={14} />
                      <span>{level}</span>
                      <span className="node-count">{levelTotalFiles} carnets</span>
                    </div>
                    
                    {expandedLevels[level] && (
                      <div className="tree-children">
                        {Object.keys(libraryTree[level]).sort().map((className) => {
                          const classTotalFiles = Object.values(libraryTree[level][className]).reduce((sum, sem) => 
                            sum + sem.files.length, 0
                          )
                          
                          return (
                            <div key={className} className="tree-node class-node">
                              <div 
                                className={`tree-label class-label ${expandedClasses[`${level}-${className}`] ? 'expanded' : ''}`}
                                onClick={() => setExpandedClasses(prev => ({ ...prev, [`${level}-${className}`]: !prev[`${level}-${className}`] }))}
                              >
                                <Users size={14} />
                                <span>{className}</span>
                                <span className="node-count">{classTotalFiles} carnets</span>
                              </div>

                              {expandedClasses[`${level}-${className}`] && (
                                <div className="tree-children">
                                  {Object.keys(libraryTree[level][className]).sort().map((semester) => {
                                    const data = libraryTree[level][className][semester]
                                    const isSelected = selectedContext?.level === level && 
                                                    selectedContext?.className === className && 
                                                    selectedContext?.semester === semester
                                    return (
                                      <div 
                                        key={semester} 
                                        className={`tree-label semester-label ${isSelected ? 'active' : ''}`}
                                        onClick={() => {
                                          setSelectedContext({ level, className, semester })
                                          setSelectedGroupKey('')
                                        }}
                                      >
                                        <div className="semester-info">
                                          <span className="semester-name">{semester}</span>
                                          <span className="semester-count">{data.files.length} carnets</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* COLUMN 2: CORE CONTENT / FILES */}
        <main className="workspace-column main-content">
          <section className="glass-card full-height flex-column">
            <div className="card-header sticky">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <FileDown size={18} />
                <div className="card-title">Contenu</div>
                {selectedContext && (
                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="batch-badge-title">{selectedContext.className}</span>
                      <span className="semester-badge">{selectedContext.semester}</span>
                   </div>
                )}
                {selectedLot && (
                  <span className="batch-badge-title">
                    {selectedLot.groupLabel}
                  </span>
                )}
              </div>
              {(selectedLot || selectedContext) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-action-small" onClick={() => setSelectedFileIds(allFilesForLot.map((file) => file._id))} title="Tout sélectionner">
                    <CheckSquare size={14} /> Tout
                  </button>
                  <button className="btn-action-small" onClick={() => setSelectedFileIds([])} title="Tout désélectionner">
                    <Square size={14} /> Aucun
                  </button>
                  {(() => {
                    // Check if all selected items have SD/HD available
                    const selectedFiles = allFilesForLot.filter(f => selectedFileIds.includes(f._id))
                    
                    const allHaveSD = selectedFiles.length > 0 && selectedFiles.every(f => {
                      const allInstances = activeBatches.flatMap(b => b.files).filter(inst => inst.assignmentId === f.assignmentId && inst.version === f.version)
                      return allInstances.some(inst => inst.quality === 'compressed')
                    })
                    
                    const allHaveHD = selectedFiles.length > 0 && selectedFiles.every(f => {
                      const allInstances = activeBatches.flatMap(b => b.files).filter(inst => inst.assignmentId === f.assignmentId && inst.version === f.version)
                      return allInstances.some(inst => inst.quality === 'high')
                    })

                    return (
                      <>
                        <button 
                          className="btn-action-small shiny" 
                          onClick={() => downloadSelectedFiles('compressed')} 
                          disabled={selectedFileIds.length === 0 || zipDownloadLoading || !allHaveSD}
                          title={!allHaveSD ? "Certains élèves sélectionnés n'ont pas de version SD dans ce lot" : ""}
                        >
                          <Archive size={14} /> {zipDownloadLoading ? '...' : `SD (${selectedFileIds.length})`}
                        </button>
                        <button 
                          className="btn-action-small shiny" 
                          onClick={() => downloadSelectedFiles('high')} 
                          disabled={selectedFileIds.length === 0 || zipDownloadLoading || !allHaveHD}
                          title={!allHaveHD ? "Certains élèves sélectionnés n'ont pas de version HD dans ce lot" : ""}
                        >
                          <Archive size={14} /> {zipDownloadLoading ? '...' : `HD (${selectedFileIds.length})`}
                        </button>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className="flex-column" style={{ flex: 1, minHeight: 0 }}>
              {(!selectedLot && !selectedContext) ? (
                <div className="empty-state">
                  <FolderArchive className="empty-state-icon" />
                  <p>Sélectionnez un niveau ou un lot dans la bibliothèque pour gérer les carnets.</p>
                </div>
              ) : (
                <>
                  <div className="filter-bar">
                    <select value={scopeLevel} onChange={(e) => { setScopeLevel(e.target.value); setScopeClassName(''); setScopeStudentId('') }} className="modern-select compact">
                      <option value="">Tous les niveaux</option>
                      {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>

                    <select value={scopeClassName} onChange={(e) => { setScopeClassName(e.target.value); setScopeStudentId('') }} className="modern-select compact">
                      <option value="">Toutes les classes</option>
                      {classOptions.map((className) => <option key={className} value={className}>{className}</option>)}
                    </select>

                    <select value={scopeStudentId} onChange={(e) => setScopeStudentId(e.target.value)} className="modern-select compact">
                      <option value="">Tous les élèves</option>
                      {studentOptions.map((file) => <option key={file._id} value={file._id}>{`${file.firstName} ${file.lastName}`.trim()}</option>)}
                    </select>

                    <button className="btn secondary compact" onClick={selectScopeFiles} disabled={filteredBatchFiles.length === 0}>
                      Sélectionner filtrés
                    </button>
                  </div>

                  <div className="file-list-grid scrollable">
                    {filteredBatchFiles.length === 0 && (
                      <div className="empty-state mini">Aucun PDF trouvé</div>
                    )}
                    {filteredBatchFiles.map((file) => {
                      const checked = selectedFileIds.includes(file._id)
                      const recipientCount = [file.emails?.father, file.emails?.mother, file.emails?.student].filter(Boolean).length
                      return (
                        <div key={file._id} className={`file-card ${checked ? 'selected' : ''}`}>
                          <div className="file-card-top">
                            <input type="checkbox" className="file-item-checkbox" checked={checked} onChange={() => toggleFileSelection(file._id)} />
                            <div className="file-card-info">
                              <div className="file-card-name">
                                {`${file.firstName} ${file.lastName}`}
                                {file.version > 1 && <span className="version-badge">V{file.version}</span>}
                              </div>
                              <div className="file-card-meta">
                                {file.level} • {file.className}
                              </div>
                            </div>
                            <div className="email-status-group">
                              <span className={`status-icon ${file.emails?.father ? 'active' : ''}`} title={file.emails?.father || 'Père: Manquant'}>
                                P
                              </span>
                              <span className={`status-icon ${file.emails?.mother ? 'active' : ''}`} title={file.emails?.mother || 'Mère: Manquant'}>
                                M
                              </span>
                              <span className={`status-icon ${file.emails?.student ? 'active' : ''}`} title={file.emails?.student || 'Élève: Manquant'}>
                                E
                              </span>
                            </div>
                          </div>
                          <div className="file-card-actions">
                            {(() => {
                              // Find instances for THIS student AND THIS VERSION across the ACTIVE batches (same context/lot)
                              const allInstances = activeBatches.flatMap(b => b.files.map(f => ({ ...f, batchId: b._id }))).filter(f => f.assignmentId === file.assignmentId && f.version === file.version)
                              const hdInstance = allInstances.find(f => f.quality === 'high')
                              const sdInstance = allInstances.find(f => f.quality === 'compressed')
                              
                              return (
                                <>
                                  <a 
                                    href={sdInstance ? downloadFileUrl(sdInstance._id, sdInstance.batchId) : '#'} 
                                    className={`btn-text ${!sdInstance ? 'disabled' : ''}`}
                                    onClick={(e) => !sdInstance && e.preventDefault()}
                                    title={sdInstance ? "Télécharger SD" : "SD non disponible dans ce lot"}
                                  >
                                    <FileDown size={14} /> SD
                                  </a>
                                  <a 
                                    href={hdInstance ? downloadFileUrl(hdInstance._id, hdInstance.batchId) : '#'} 
                                    className={`btn-text ${!hdInstance ? 'disabled' : ''}`}
                                    onClick={(e) => !hdInstance && e.preventDefault()}
                                    title={hdInstance ? "Télécharger HD" : "HD non disponible dans ce lot"}
                                  >
                                    <FileDown size={14} /> HD
                                  </a>
                                </>
                              )
                            })()}
                            <button className="btn-text delete" onClick={() => deleteFile(file._id)}>
                              <Trash2 size={14} /> Supprimer
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </main>

        {/* COLUMN 3: ACTIONS & HISTORY */}
        <aside className="workspace-column actions-panel">
          <div className="glass-card full-height flex-column">
            <div className="workspace-tabs">
              <button 
                className={`tab-btn ${rightTab === 'config' ? 'active' : ''}`}
                onClick={() => setRightTab('config')}
              >
                <Send size={16} /> Distribution
              </button>
              <button 
                className={`tab-btn ${rightTab === 'history' ? 'active' : ''}`}
                onClick={() => setRightTab('history')}
              >
                <Archive size={16} /> Historique {jobHistory.length > 0 && <span className="tab-count">{jobHistory.length}</span>}
              </button>
            </div>

            <div className="tab-content scrollable">
              {rightTab === 'config' ? (
                <div className="config-pane">
                  <div className="config-section">
                    <h3 className="section-title">Destinataires</h3>
                    <div className="checkbox-group">
                      <label className={`checkbox-item ${includeFather ? 'checked' : ''}`}>
                        <input type="checkbox" checked={includeFather} onChange={(e) => setIncludeFather(e.target.checked)} />
                        <span>Père</span>
                      </label>
                      <label className={`checkbox-item ${includeMother ? 'checked' : ''}`}>
                        <input type="checkbox" checked={includeMother} onChange={(e) => setIncludeMother(e.target.checked)} />
                        <span>Mère</span>
                      </label>
                      <label className={`checkbox-item ${includeStudent ? 'checked' : ''}`}>
                        <input type="checkbox" checked={includeStudent} onChange={(e) => setIncludeStudent(e.target.checked)} />
                        <span>Élève</span>
                      </label>
                    </div>
                  </div>

                  <div className="action-footer" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="btn secondary" style={{ width: '100%' }} onClick={previewEmail} disabled={!selectedLot || selectedFileIds.length === 0 || previewLoading}>
                      {previewLoading ? <RefreshCcw size={16} className="spin" /> : <Eye size={16} />} Aperçu du modèle d'email
                    </button>
                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%' }} 
                      onClick={() => { setConfirmStep(1); setShowConfirmModal(true); }} 
                      disabled={!selectedLot || selectedFileIds.length === 0 || sendLoading}
                    >
                      <Send size={18} /> Lancer la distribution ({selectedFileIds.length})
                    </button>
                  </div>

                  {emailPreview && (
                    <div className="preview-mini-card">
                      <div className="preview-header">
                        <div className="preview-label">Aperçu du modèle</div>
                        <div className="preview-subject">{emailPreview.subject}</div>
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                          <strong>Destinataires:</strong> {emailPreview.sampleRecipients.join(', ') || 'Aucun !'}
                        </div>
                      </div>
                      <div 
                        className="email-preview-box mini scrollable" 
                        dangerouslySetInnerHTML={{ __html: emailPreview.html }} 
                      />
                    </div>
                  )}

                  {emailJob && (
                    <div className="job-status-card" style={{ marginTop: 12 }}>
                      <div className="status-header">
                        <span className="status-title">Progression</span>
                        <span className={`status-tag ${emailJob.status}`}>{emailJob.status}</span>
                      </div>
                      <div className="status-bar-wrapper">
                        <div 
                          className="status-bar-fill" 
                          style={{ 
                            width: `${emailJob.totalItems > 0 ? (emailJob.processedItems / emailJob.totalItems) * 100 : 0}%`,
                            background: emailJob.status === 'completed' ? '#22c55e' : undefined
                          }} 
                        />
                      </div>
                      <div className="status-stats">
                        <span className="stat sent">{emailJob.sentItems} Envoyés</span>
                        <span className="stat failed">{emailJob.failedItems} Échecs</span>
                        <span className="stat total">{emailJob.processedItems}/{emailJob.totalItems}</span>
                      </div>
                      
                      <div className="job-items-list mini scrollable">
                        {emailJob.items.map((item) => (
                          <div key={item.fileId} className={`job-item-row ${item.status}`}>
                            <span className="item-name" style={{ fontWeight: 600 }}>{item.studentName}</span>
                            <span className="item-status" style={{ 
                              color: item.status === 'sent' ? '#16a34a' : item.status === 'failed' ? '#dc2626' : '#64748b',
                              fontSize: 10,
                              fontWeight: 700
                            }}>
                              {item.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="history-pane">
                  {historyLoading ? (
                    <div className="empty-state mini">Chargement...</div>
                  ) : jobHistory.length === 0 ? (
                    <div className="empty-state mini">Aucun historique</div>
                  ) : (
                    <div className="history-list">
                      {jobHistory.map((job) => {
                        const jid = (job as any)._id || job.id
                        const active = (emailJob as any)?._id === jid || emailJob?.id === jid
                        return (
                          <button
                            key={jid}
                            className={`history-item ${active ? 'active' : ''}`}
                            onClick={() => {
                              setJobId('')
                              setEmailJob(job)
                            }}
                          >
                            <div className="history-item-top">
                              <span className="history-user" style={{ color: active ? '#4f46e5' : undefined }}>
                                <Users size={12} style={{ marginRight: 4 }} /> {job.creatorName}
                              </span>
                              <span className={`history-status-badge ${job.status}`}>{job.status}</span>
                            </div>
                            <div className="history-item-bottom">
                              <span className="history-date">{new Date(job.startedAt || '').toLocaleString()}</span>
                              <span className="history-count" style={{ fontWeight: 700 }}>{job.sentItems}/{job.totalItems}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  
                  {/* Selected Job Details from History */}
                  {emailJob && rightTab === 'history' && (
                    <div className="job-status-card" style={{ marginTop: 24, borderTop: '2px solid #e2e8f0', paddingTop: 20 }}>
                      <div className="status-header">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="status-title">Détails de l'envoi</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Par {emailJob.creatorName}</span>
                        </div>
                        <span className={`status-tag ${emailJob.status}`}>{emailJob.status}</span>
                      </div>
                      
                      <div className="status-stats" style={{ margin: '16px 0' }}>
                        <span className="stat sent">{emailJob.sentItems} Envoyés</span>
                        <span className="stat failed">{emailJob.failedItems} Échecs</span>
                        <span className="stat total">{emailJob.processedItems}/{emailJob.totalItems}</span>
                      </div>

                      <div className="job-items-list mini scrollable" style={{ maxHeight: 400 }}>
                        {emailJob.items.map((item) => (
                          <div key={item.fileId} className={`job-item-row ${item.status}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="item-name" style={{ fontWeight: 700, fontSize: 13 }}>{item.studentName}</span>
                              <span className="item-status" style={{ 
                                color: item.status === 'sent' ? '#16a34a' : item.status === 'failed' ? '#dc2626' : '#64748b',
                                fontSize: 10, fontWeight: 800
                              }}>
                                {item.status.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <Mail size={12} /> {item.recipients && item.recipients.length > 0 ? item.recipients.join(', ') : 'Aucun destinataire'}
                            </div>
                            {item.error && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>Erreur: {item.error}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Two-step Confirmation Modal */}
      {showConfirmModal && (
        <div 
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, 
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div 
            style={{
              background: 'white', borderRadius: 20, padding: 32, width: '90%', maxWidth: 440,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ 
                width: 48, height: 48, borderRadius: 12, background: '#fef2f2', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' 
              }}>
                <AlertCircle size={28} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>Confirmation requise</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Étape {confirmStep} sur 2</p>
              </div>
            </div>

            {confirmStep === 1 ? (
              <>
                <p style={{ margin: '0 0 24px', fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
                  Vous êtes sur le point de lancer l'envoi de <strong>{selectedFileIds.length} carnets</strong> scolaires par email.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowConfirmModal(false)}>
                    Annuler
                  </button>
                  <button className="btn btn-shiny" style={{ flex: 2 }} onClick={() => setConfirmStep(2)}>
                    Continuer
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                  <p style={{ margin: 0, fontSize: 14, color: '#92400e', fontWeight: 600 }}>
                    ⚠️ Action irréversible
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b45309' }}>
                    Une fois lancé, les emails seront envoyés directement aux parents et élèves sélectionnés.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn secondary" style={{ flex: 1 }} onClick={() => setConfirmStep(1)}>
                    Retour
                  </button>
                  <button className="btn btn-shiny" style={{ flex: 2, background: '#dc2626' }} onClick={sendEmails}>
                    Confirmer l'envoi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
