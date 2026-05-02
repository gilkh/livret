import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Edit2, Trash2, Mail, Save, X, Eye, Image as ImageIcon, Send, RefreshCcw, CheckCircle, AlertCircle, History, Package, FolderArchive, FileDown, Archive, Layout, CheckSquare, Square, Users, CheckCircle2, XCircle, MailPlus } from 'lucide-react'
import api from '../api'
import './AdminEmailTemplates.css'
import EmailBlockEditor, { DEFAULT_BLOCKS, blocksToHtml, EmailBlock } from '../components/EmailBlockEditor'

type EmailTemplate = {
  _id: string
  name: string
  subject: string
  bodyHtml: string
  blocks?: EmailBlock[]
  linkedLevels: string[]
  linkedClasses: string[]
}

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

type ExportBatch = {
  _id: string
  groupLabel: string
  yearName: string
  semester: string
  createdAt: string
  files: ExportedFile[]
  exportedCount: number
}

type GroupedLot = {
  key: string
  groupLabel: string
  yearName: string
  semester: string
  batches: ExportBatch[]
  createdAt: string
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
  createdAt?: string
  isTest?: boolean
  options?: any
}

export default function AdminEmailTemplates() {
  const [activeTab, setActiveTab] = useState<'templates' | 'distribution' | 'history'>('templates')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [showForm, setShowForm] = useState(false)
  
  // Options for levels and classes
  const [allLevels, setAllLevels] = useState<{name: string}[]>([])
  const [allClasses, setAllClasses] = useState<{name: string}[]>([])

  const [formState, setFormState] = useState({
    name: '',
    subject: '',
    bodyHtml: '',
    blocks: [] as EmailBlock[],
    linkedLevels: [] as string[],
    linkedClasses: [] as string[]
  })
  
  const [editorType, setEditorType] = useState<'visual' | 'html'>('visual')

  // Distribution State
  const [batches, setBatches] = useState<ExportBatch[]>([])
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [includeFather, setIncludeFather] = useState(true)
  const [includeMother, setIncludeMother] = useState(true)
  const [includeStudent, setIncludeStudent] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [emailJob, setEmailJob] = useState<any>(null)
  const [emailPreview, setEmailPreview] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [zipDownloadLoading, setZipDownloadLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [preferredQuality, setPreferredQuality] = useState<'compressed' | 'high'>('compressed')
  const [allJobs, setAllJobs] = useState<EmailJob[]>([])
  const jobInterval = useRef<number | null>(null)

  // Advanced Distribution State (from SubAdminExportedGradebooks)
  const [selectedYearName, setSelectedYearName] = useState<string>('')
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [selectedContext, setSelectedContext] = useState<{ level: string; className?: string; semester?: string } | null>(null)
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({})
  const [scopeLevel, setScopeLevel] = useState('')
  const [scopeClassName, setScopeClassName] = useState('')
  const [scopeStudentId, setScopeStudentId] = useState('')
  const [rightTab, setRightTab] = useState<'config' | 'history'>('config')
  const [customMessage, setCustomMessage] = useState('')
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmStep, setConfirmStep] = useState(1)
  const [batchHistory, setBatchHistory] = useState<EmailJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  // Grouping Logic
  const groupedLots = useMemo(() => {
    const lots: GroupedLot[] = []
    const lotMap = new Map<string, GroupedLot>()
    
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
        lots.push(lotMap.get(key)!)
      }
      const lot = lotMap.get(key)!
      lot.batches.push(batch)
      if (new Date(batch.createdAt) > new Date(lot.createdAt)) {
        lot.createdAt = batch.createdAt
      }
    })
    return lots
  }, [batches])

  const selectedLot = useMemo(() => {
    return groupedLots.find(l => l.key === selectedGroupKey) || null
  }, [groupedLots, selectedGroupKey])


  useEffect(() => {
    loadTemplatesData()
    if (activeTab === 'distribution') {
      loadBatches()
      loadYears()
    }
    if (activeTab === 'history') {
      fetchAllJobs()
    }
  }, [activeTab])

  const loadYears = async () => {
    try {
      const res = await api.get('/school-years')
      const years = Array.isArray(res.data) ? res.data : []
      setSchoolYears(years)
      
      const activeYear = years.find((y: any) => y.active)
      const activeSeq = activeYear?.sequence || 999999
      const availableYears = years.filter((y: any) => (y.sequence || 0) <= activeSeq)

      if (activeYear && !selectedYearName) {
        setSelectedYearName(activeYear.name)
      } else if (availableYears.length > 0 && !selectedYearName) {
        // Pick the most recent available year
        const sorted = [...availableYears].sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
        setSelectedYearName(sorted[0].name)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Build Library Tree (Ported from SubAdminExportedGradebooks)
  const libraryTree = useMemo(() => {
    const tree: Record<string, Record<string, Record<string, { files: ExportedFile[], batches: ExportBatch[] }>>> = {}
    
    // Filter batches by selected year
    const filteredBatchesByYear = batches.filter(b => b.yearName === selectedYearName)

    // Initialize tree with available levels/classes from metadata if we're in the current year
    const activeYear = schoolYears.find(y => y.active)
    if (selectedYearName === activeYear?.name) {
      allClasses.forEach(c => {
        const level = (allLevels.find(l => l.name === c.name) as any)?.level || 'Sans niveau' // This logic might vary depending on how classes/levels are linked
        // Simplified: using class's own level if available or a default
        const actualLevel = (c as any).level || 'Sans niveau'
        if (!tree[actualLevel]) tree[actualLevel] = {}
        if (!tree[actualLevel][c.name]) tree[actualLevel][c.name] = {
          'Semestre 1': { files: [], batches: [] },
          'Semestre 2': { files: [], batches: [] }
        }
      })
    }

    // Populate with exported data
    filteredBatchesByYear.forEach(batch => {
      batch.files.forEach(file => {
        const level = file.level || 'Sans niveau'
        const className = file.className || 'Sans classe'
        const semester = batch.semester || 'Semestre 1'

        if (!tree[level]) tree[level] = {}
        if (!tree[level][className]) tree[level][className] = {}
        if (!tree[level][className][semester]) tree[level][className][semester] = { files: [], batches: [] }
        
        const context = tree[level][className][semester]
        if (!context.batches.some(b => b._id === batch._id)) context.batches.push(batch)
        if (!context.files.some(f => f._id === file._id)) context.files.push(file)
      })
    })

    return tree
  }, [batches, selectedYearName, allClasses, allLevels, schoolYears])

  // Contextual filtering logic (Ported)
  const { activeBatches, activeFiles } = useMemo(() => {
    let batches: ExportBatch[] = []
    let files: any[] = []

    if (selectedContext) {
      const { level, className, semester } = selectedContext
      const levelsToScan = level ? [level] : Object.keys(libraryTree)
      levelsToScan.forEach(l => {
        const classesToScan = className ? [className] : Object.keys(libraryTree[l] || {})
        classesToScan.forEach(c => {
          const semestersToScan = semester ? [semester] : Object.keys(libraryTree[l]?.[c] || {})
          semestersToScan.forEach(s => {
            const ctx = libraryTree[l]?.[c]?.[s]
            if (ctx) {
              batches.push(...ctx.batches)
              ctx.files.forEach(f => {
                const batch = ctx.batches.find(b => b.files.some(bf => bf._id === f._id))
                files.push({ ...f, batchId: batch?._id, semester: s })
              })
            }
          })
        })
      })
    } else if (selectedLot) {
      batches = selectedLot.batches
      files = selectedLot.batches.flatMap(b => b.files.map(f => ({ ...f, batchId: b._id, semester: b.semester })))
    }

    return {
      activeBatches: Array.from(new Map(batches.map(b => [b._id, b])).values()),
      activeFiles: files
    }
  }, [selectedContext, selectedLot, libraryTree])

  const uniqueFileVersionPairs = useMemo(() => {
    return Array.from(
      new Map(activeFiles.map(f => [`${f.assignmentId}-${f.version}`, f])).values()
    ).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
  }, [activeFiles])

  const filteredBatchFiles = useMemo(() => {
    return uniqueFileVersionPairs.filter((file) => {
      if (scopeLevel && String(file.level || '') !== scopeLevel) return false
      if (scopeClassName && String(file.className || '') !== scopeClassName) return false
      if (scopeStudentId && String(file._id) !== scopeStudentId) return false
      return true
    })
  }, [uniqueFileVersionPairs, scopeLevel, scopeClassName, scopeStudentId])

  const levelOptions = useMemo(() => Array.from(new Set(activeFiles.map((file) => String(file.level || '').trim()).filter(Boolean))).sort(), [activeFiles])
  const classOptions = useMemo(() => Array.from(new Set(activeFiles
    .filter((file) => !scopeLevel || String(file.level || '') === scopeLevel)
    .map((file) => String(file.className || '').trim())
    .filter(Boolean))).sort(), [activeFiles, scopeLevel])
  const studentOptions = useMemo(() => uniqueFileVersionPairs.filter((file) => {
    if (scopeLevel && String(file.level || '') !== scopeLevel) return false
    if (scopeClassName && String(file.className || '') !== scopeClassName) return false
    return true
  }), [uniqueFileVersionPairs, scopeLevel, scopeClassName])

  useEffect(() => {
    if (!selectedLot && !selectedContext) {
      setBatchHistory([])
      return
    }
    const bId = selectedContext 
      ? (Object.values(Object.values(libraryTree[selectedContext.level] || {})[0] || {})[0] as any)?.batches[0]?._id
      : selectedLot?.batches[0]?._id
    
    if (bId) loadBatchHistory(bId)
  }, [selectedGroupKey, selectedContext, libraryTree])

  const loadBatchHistory = async (batchId: string) => {
    try {
      setHistoryLoading(true)
      const res = await api.get(`/gradebook-exports/batches/${batchId}/email-jobs`)
      setBatchHistory(res.data)
    } catch (err) {
      console.error(err)
    } finally { setHistoryLoading(false) }
  }

  const loadTemplatesData = async () => {
    setLoading(true)
    try {
      const [tplRes, lvlRes, clsRes] = await Promise.all([
        api.get('/email-templates'),
        api.get('/levels'),
        api.get('/classes')
      ])
      
      let fetchedTemplates = Array.isArray(tplRes.data) ? tplRes.data : []
      setTemplates(fetchedTemplates)
      setAllLevels(Array.isArray(lvlRes.data) ? lvlRes.data : [])
      setAllClasses(Array.isArray(clsRes.data) ? clsRes.data : [])
    } catch (err: any) {
      console.error('Error loading templates data:', err)
      setError(err.response?.data?.error || 'Erreur lors du chargement des modèles')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllJobs = async () => {
    setLoading(true)
    try {
      const res = await api.get('/gradebook-exports/email-jobs')
      setAllJobs(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadBatches = async () => {
    try {
      const res = await api.get('/gradebook-exports/batches')
      const nextBatches = Array.isArray(res.data) ? res.data : []
      setBatches(nextBatches)
      if (nextBatches.length > 0 && !selectedGroupKey) {
        const first = nextBatches[0]
        setSelectedGroupKey(`${first.groupLabel}-${first.yearName}-${first.semester}`)
      }
    } catch (err) {
      console.error('Failed to load batches', err)
      setBatches([])
    }
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    const newBlocks = JSON.parse(JSON.stringify(DEFAULT_BLOCKS))
    setFormState({
      name: '',
      subject: 'Carnet scolaire de {{studentName}}',
      bodyHtml: blocksToHtml(newBlocks),
      blocks: newBlocks,
      linkedLevels: [],
      linkedClasses: []
    })
    setEditorType('visual')
    setShowForm(true)
  }

  const handleEdit = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl)
    setFormState({
      name: tpl.name,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      blocks: tpl.blocks || [],
      linkedLevels: tpl.linkedLevels || [],
      linkedClasses: tpl.linkedClasses || []
    })
    setEditorType(tpl.blocks && tpl.blocks.length > 0 ? 'visual' : 'html')
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce modèle ?')) return
    try {
      await api.delete(`/email-templates/${id}`)
      setTemplates(templates.filter(t => t._id !== id))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingTemplate) {
        const res = await api.put(`/email-templates/${editingTemplate._id}`, formState)
        setTemplates(templates.map(t => t._id === res.data._id ? res.data : t))
      } else {
        const res = await api.post('/email-templates', formState)
        setTemplates([res.data, ...templates])
      }
      setShowForm(false)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur')
    }
  }

  const toggleLevel = (level: string) => {
    setFormState(prev => {
      const isSelected = prev.linkedLevels.includes(level)
      return {
        ...prev,
        linkedLevels: isSelected ? prev.linkedLevels.filter(l => l !== level) : [...prev.linkedLevels, level]
      }
    })
  }

  const toggleClass = (className: string) => {
    setFormState(prev => {
      const isSelected = prev.linkedClasses.includes(className)
      return {
        ...prev,
        linkedClasses: isSelected ? prev.linkedClasses.filter(c => c !== className) : [...prev.linkedClasses, className]
      }
    })
  }

  // Distribution Handlers
  const toggleFile = (id: string) => {
    setSelectedFileIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toggleAllFiles = () => {
    if (selectedFileIds.length === uniqueFileVersionPairs.length) setSelectedFileIds([])
    else setSelectedFileIds(uniqueFileVersionPairs.map(f => f._id))
  }

  const previewEmail = async () => {
    if (activeBatches.length === 0 || selectedFileIds.length === 0) return
    setPreviewLoading(true)
    try {
      const res = await api.post(`/gradebook-exports/batches/${activeBatches[0]._id}/email-preview`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        templateId: selectedTemplateId || undefined
      })
      setEmailPreview(res.data)
      setShowPreviewModal(true)
    } catch (err) {
      console.error(err)
    } finally {
      setPreviewLoading(false)
    }
  }

  const launchDistribution = async (isTest = false) => {
    if (activeBatches.length === 0 || selectedFileIds.length === 0) return
    if (!isTest && !window.confirm(`Voulez-vous vraiment envoyer ces emails à ${selectedFileIds.length} élèves en qualité ${preferredQuality === 'high' ? 'HD' : 'SD'} ?`)) return

    setSending(true)
    try {
      // Find matching quality files for all selected student/version pairs
      const selectedPairs = uniqueFileVersionPairs.filter(p => selectedFileIds.includes(p._id))
      const targetIds: string[] = []
      
      selectedPairs.forEach(pair => {
        const instances = getStudentInstances(pair.assignmentId, pair.version)
        // Prioritize preferred quality, fallback to whatever is available
        const match = instances.find(inst => inst.quality === preferredQuality) || instances[0]
        if (match) targetIds.push(match._id)
      })

      // Group targetIds by their parent batch
      const batchGroups: Record<string, string[]> = {}
      activeBatches.forEach(b => {
        const matchingIds = targetIds.filter(id => b.files.some(f => String(f._id) === id))
        if (matchingIds.length > 0) {
          batchGroups[b._id] = matchingIds
        }
      })

      const batchIds = Object.keys(batchGroups)
      if (batchIds.length === 0) {
        setSending(false)
        return
      }

      let lastJobId = ''
      for (const bId of batchIds) {
        const res = await api.post(`/gradebook-exports/batches/${bId}/send`, {
          selectedFileIds: batchGroups[bId],
          includeFather,
          includeMother,
          includeStudent,
          testEmailOverride: isTest ? testEmail : undefined,
          templateId: selectedTemplateId || undefined
        })
        lastJobId = res.data.jobId
      }
      
      if (lastJobId) {
        pollJob(lastJobId)
        if (isTest) setTestSuccess(true)
      }
    } catch (err) {
      console.error(err)
      setSending(false)
    }
  }

  const downloadFileUrl = (fileId: string, batchId: string) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/gradebook-exports/batches/${batchId}/files/${fileId}/download${query}`
  }

  const downloadSelectedFiles = async (quality?: 'high' | 'compressed') => {
    if (activeBatches.length === 0 || selectedFileIds.length === 0) return
    setZipDownloadLoading(true)
    try {
      // Resolve IDs for the chosen quality
      const selectedPairs = uniqueFileVersionPairs.filter(p => selectedFileIds.includes(p._id))
      const targetIds: string[] = []
      
      selectedPairs.forEach(pair => {
        const instances = getStudentInstances(pair.assignmentId, pair.version)
        const match = instances.find(inst => inst.quality === quality) || instances[0]
        if (match) targetIds.push(match._id)
      })

      const label = selectedContext ? (selectedContext.className || selectedContext.level) : (selectedLot?.groupLabel || 'exports')

      const response = await api.post(`/gradebook-exports/zip-files`, {
        selectedFileIds: targetIds,
        label: `${label}_${quality || 'exports'}`
      }, { responseType: 'blob' })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${label}_${quality || 'exports'}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e: any) {
      console.error(e)
      alert('Erreur lors du téléchargement')
    } finally {
      setZipDownloadLoading(false)
    }
  }

  const pollJob = (jobId: string) => {
    if (jobInterval.current) window.clearInterval(jobInterval.current)
    jobInterval.current = window.setInterval(async () => {
      try {
        const res = await api.get(`/gradebook-exports/email-jobs/${jobId}`)
        setEmailJob(res.data)
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          if (jobInterval.current) window.clearInterval(jobInterval.current)
          setSending(false)
        }
      } catch (err) {
        if (jobInterval.current) window.clearInterval(jobInterval.current)
        setSending(false)
      }
    }, 2000)
  }

  const getStudentInstances = (assignmentId: string, version: number) => {
    return activeFiles.filter(f => f.assignmentId === assignmentId && f.version === version)
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Gestion des Emails</h1>
        <div className="tab-navigation">
          <button className={`tab-link ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <Mail size={18} /> Modèles
          </button>
          <button className={`tab-link ${activeTab === 'distribution' ? 'active' : ''}`} onClick={() => setActiveTab('distribution')}>
            <Send size={18} /> Distribution
          </button>
          <button className={`tab-link ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <History size={18} /> Historique
          </button>
        </div>
      </div>

      {activeTab === 'templates' && (
        <>
          <div className="section-actions">
            <button className="btn btn-primary" onClick={handleCreate}>
              <Plus size={18} /> Nouveau Modèle
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {!showForm ? (
            <div className="templates-grid">
              {loading && <div className="loading">Chargement...</div>}
              {!loading && templates.length === 0 && (
                <div className="empty-state">
                  <Mail size={48} className="empty-icon" />
                  <p>Aucun modèle d'email configuré.</p>
                </div>
              )}
              {templates.map(tpl => (
                <div key={tpl._id} className="template-card">
                  <div className="template-card-header">
                    <h3>{tpl.name}</h3>
                    <div className="template-actions">
                      <button className="btn-icon" onClick={() => handleEdit(tpl)} title="Modifier">
                        <Edit2 size={16} />
                      </button>
                      <button className="btn-icon delete" onClick={() => handleDelete(tpl._id)} title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="template-card-body">
                    <p><strong>Sujet :</strong> {tpl.subject}</p>
                    
                    <div className="template-links">
                      {tpl.linkedLevels?.length > 0 && (
                        <div className="link-group">
                          <span className="link-label">Niveaux:</span>
                          <div className="link-tags">
                            {tpl.linkedLevels?.map(l => <span key={l} className="tag level-tag">{l}</span>)}
                          </div>
                        </div>
                      )}
                      {tpl.linkedClasses?.length > 0 && (
                        <div className="link-group">
                          <span className="link-label">Classes:</span>
                          <div className="link-tags">
                            {tpl.linkedClasses?.map(l => <span key={l} className="tag class-tag">{l}</span>)}
                          </div>
                        </div>
                      )}
                      {(!tpl.linkedLevels?.length && !tpl.linkedClasses?.length) && (
                        <span className="tag default-tag">Modèle par défaut</span>
                      )}
                    </div>

                    <button 
                      className="btn secondary btn-full mt-4" 
                      onClick={() => {
                        setSelectedTemplateId(tpl._id)
                        setActiveTab('distribution')
                      }}
                    >
                      <Send size={14} /> Utiliser pour l'envoi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="template-editor glass-card full-width">
              <form onSubmit={handleSubmit} className="editor-form-modern">
              <div className="editor-header">
                <div className="editor-title-group">
                  <Mail className="title-icon" />
                  <h2>{editingTemplate ? 'Modifier le modèle' : 'Nouveau modèle'}</h2>
                </div>
                <div className="editor-header-center-actions">
                  <button type="submit" className="btn btn-primary">
                    <Save size={16} /> Enregistrer le modèle
                  </button>
                  <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>
                    Annuler
                  </button>
                </div>
                <div className="editor-header-actions">
                  <div className="editor-toggle">
                    <button type="button" className={editorType === 'visual' ? 'active' : ''} onClick={() => setEditorType('visual')}>
                      <Layout size={16} /> Visuel
                    </button>
                    <button type="button" className={editorType === 'html' ? 'active' : ''} onClick={() => setEditorType('html')}>
                      <ImageIcon size={16} /> HTML
                    </button>
                  </div>
                  <button type="button" className="btn-icon close" onClick={() => setShowForm(false)}>
                    <X size={24} />
                  </button>
                </div>
              </div>
                <div className="editor-top-meta">
                  <div className="form-group flex-1">
                    <label>Nom du modèle (Interne)</label>
                    <input 
                      type="text" 
                      className="modern-input" 
                      value={formState.name} 
                      onChange={e => setFormState({...formState, name: e.target.value})} 
                      required 
                      placeholder="Ex: Modèle Maternelle"
                    />
                  </div>
                  
                  <div className="form-group flex-2">
                    <label>Sujet de l'email</label>
                    <input 
                      type="text" 
                      className="modern-input" 
                      value={formState.subject} 
                      onChange={e => setFormState({...formState, subject: e.target.value})} 
                      required 
                    />
                    <small className="help-text">Variables: {'{{studentName}}, {{yearName}}, {{level}}, {{className}}, {{schoolName}}'}</small>
                  </div>
                </div>
                
                <div className="editor-main-layout">
                  <div className="editor-canvas-column">
                    {editorType === 'visual' ? (
                      <EmailBlockEditor 
                        blocks={formState.blocks} 
                        onChange={(blocks, html) => setFormState(prev => ({ ...prev, blocks, bodyHtml: html }))} 
                      />
                    ) : (
                      <div className="html-editor-wrap">
                        <textarea 
                          className="modern-textarea code-editor"
                          value={formState.bodyHtml}
                          onChange={e => setFormState({...formState, bodyHtml: e.target.value})}
                          required
                          style={{ height: '500px', fontFamily: 'monospace' }}
                        />
                        <div className="html-preview-hint">Aperçu en temps réel non disponible en mode HTML. Utilisez le mode Visuel pour une édition plus facile.</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="editor-assign-column">
                    <div className="link-section glass-panel">
                      <h4><Package size={16} /> Lier aux Niveaux</h4>
                      <div className="checkbox-grid-compact">
                        {allLevels?.map(level => (
                          <label key={level._id || level.name} className="checkbox-label-modern">
                            <input 
                              type="checkbox" 
                              checked={formState.linkedLevels.includes(level.name)}
                              onChange={() => toggleLevel(level.name)}
                            />
                            <span className="check-custom"></span>
                            {level.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div className="link-section glass-panel mt-4">
                      <h4><Layout size={16} /> Lier aux Classes</h4>
                      <div className="checkbox-grid-compact">
                        {allClasses?.map(cls => (
                          <label key={cls._id || cls.name} className="checkbox-label-modern">
                            <input 
                              type="checkbox" 
                              checked={formState.linkedClasses.includes(cls.name)}
                              onChange={() => toggleClass(cls.name)}
                            />
                            <span className="check-custom"></span>
                            {cls.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                  </div>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {activeTab === 'distribution' && (
        <div className="distribution-workspace-v2">
          <div className="main-workspace-grid">
            {/* COLUMN 1: NAVIGATION / LIBRARY */}
            <aside className="workspace-column sidebar">
              <div className="glass-card full-height flex-column">
                <div className="card-header">
                  <Archive size={18} />
                  <div className="card-title">Bibliothèque</div>
                </div>
                
                <div className="year-selector-v2">
                  <Archive size={16} className="text-muted" />
                  <select 
                    value={selectedYearName} 
                    onChange={(e) => {
                      setSelectedYearName(e.target.value)
                      setSelectedContext(null)
                      setSelectedGroupKey('')
                    }}
                    className="modern-select transparent"
                  >
                    {schoolYears
                      .filter(y => {
                        const activeY = schoolYears.find(sy => sy.active)
                        return (y.sequence || 0) <= (activeY?.sequence || 999999)
                      })
                      .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                      .map(year => (
                        <option key={year._id} value={year.name}>{year.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="library-tree scrollable">
                  {!loading && batches.length === 0 && (
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
                          className={`tree-label level-label ${expandedLevels[level] ? 'expanded' : ''} ${selectedContext?.level === level && !selectedContext.className ? 'active' : ''}`}
                          onClick={() => setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }))}
                        >
                          <FolderArchive size={14} />
                          <span style={{ flex: 1 }}>{level}</span>
                          <span className="node-count">{levelTotalFiles}</span>
                          <button 
                            className="btn-tree-select" 
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedContext({ level })
                              setSelectedGroupKey('')
                            }}
                          >
                            <CheckSquare size={12} />
                          </button>
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
                                    className={`tree-label class-label ${expandedClasses[`${level}-${className}`] ? 'expanded' : ''} ${selectedContext?.level === level && selectedContext.className === className && !selectedContext.semester ? 'active' : ''}`}
                                    onClick={() => setExpandedClasses(prev => ({ ...prev, [`${level}-${className}`]: !prev[`${level}-${className}`] }))}
                                  >
                                    <Users size={14} />
                                    <span style={{ flex: 1 }}>{className}</span>
                                    <span className="node-count">{classTotalFiles}</span>
                                    <button 
                                      className="btn-tree-select" 
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedContext({ level, className })
                                        setSelectedGroupKey('')
                                      }}
                                    >
                                      <CheckSquare size={12} />
                                    </button>
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
                                              <span className="semester-count">{data.files.length} files</span>
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
                          <span className="batch-badge-title">{selectedContext.className || selectedContext.level}</span>
                          {selectedContext.semester && <span className="semester-badge">{selectedContext.semester}</span>}
                       </div>
                    )}
                  </div>
                  {(selectedLot || selectedContext) && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-action-small" onClick={() => setSelectedFileIds(uniqueFileVersionPairs.map((file) => file._id))}>
                        <CheckSquare size={14} /> Tout
                      </button>
                      <button className="btn-action-small" onClick={() => setSelectedFileIds([])}>
                        <Square size={14} /> Aucun
                      </button>
                      <button 
                        className="btn-action-small shiny" 
                        onClick={() => downloadSelectedFiles('compressed')} 
                        disabled={selectedFileIds.length === 0 || zipDownloadLoading}
                      >
                        <Archive size={14} /> {zipDownloadLoading ? '...' : `SD (${selectedFileIds.length})`}
                      </button>
                      <button 
                        className="btn-action-small shiny" 
                        onClick={() => downloadSelectedFiles('high')} 
                        disabled={selectedFileIds.length === 0 || zipDownloadLoading}
                      >
                        <Archive size={14} /> {zipDownloadLoading ? '...' : `HD (${selectedFileIds.length})`}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-column" style={{ flex: 1, minHeight: 0 }}>
                  {(!selectedLot && !selectedContext) ? (
                    <div className="empty-state">
                      <FolderArchive size={48} className="empty-state-icon" />
                      <p>Sélectionnez un niveau ou un lot dans la bibliothèque.</p>
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

                        <button className="btn secondary compact" onClick={() => setSelectedFileIds(filteredBatchFiles.map(f => f._id))} disabled={filteredBatchFiles.length === 0}>
                          Sélectionner filtrés
                        </button>
                      </div>

                      <div className="file-list-grid scrollable">
                        {filteredBatchFiles.map((file) => {
                          const checked = selectedFileIds.includes(file._id)
                          const instances = getStudentInstances(file.assignmentId, file.version)
                          const hd = instances.find(f => f.quality === 'high')
                          const sd = instances.find(f => f.quality === 'compressed')
                          return (
                            <div key={file._id} className={`file-card ${checked ? 'selected' : ''}`} onClick={() => toggleFile(file._id)}>
                              <div className="file-card-top">
                                <input type="checkbox" checked={checked} onChange={(e) => { e.stopPropagation(); toggleFile(file._id); }} />
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
                                  <div className={`status-pill p ${file.emails?.father ? 'active' : ''}`} title={file.emails?.father || 'Père: Manquant'}>P</div>
                                  <div className={`status-pill m ${file.emails?.mother ? 'active' : ''}`} title={file.emails?.mother || 'Mère: Manquant'}>M</div>
                                  <div className={`status-pill e ${file.emails?.student ? 'active' : ''}`} title={file.emails?.student || 'Élève: Manquant'}>E</div>
                                </div>
                              </div>
                              <div className="file-card-actions" onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {sd && <a href={downloadFileUrl(sd._id, sd.batchId)} className="btn-text" title="SD"><FileDown size={14} /> SD</a>}
                                  {hd && <a href={downloadFileUrl(hd._id, hd.batchId)} className="btn-text" title="HD"><FileDown size={14} /> HD</a>}
                                </div>
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
                <div className="workspace-tabs-v2">
                  <button className={`w-tab ${rightTab === 'config' ? 'active' : ''}`} onClick={() => setRightTab('config')}>Configuration</button>
                  <button className={`w-tab ${rightTab === 'history' ? 'active' : ''}`} onClick={() => setRightTab('history')}>Historique Lot</button>
                </div>

                <div className="tab-content scrollable">
                  {rightTab === 'config' ? (
                    <div className="config-pane">
                      <div className="config-section">
                        <h4><Users size={16} /> Destinataires</h4>
                        <div className="checkbox-stack">
                          <label className={`checkbox-label ${includeFather ? 'checked' : ''}`}>
                            <input type="checkbox" checked={includeFather} onChange={e => setIncludeFather(e.target.checked)} />
                            <span>Père</span>
                          </label>
                          <label className={`checkbox-label ${includeMother ? 'checked' : ''}`}>
                            <input type="checkbox" checked={includeMother} onChange={e => setIncludeMother(e.target.checked)} />
                            <span>Mère</span>
                          </label>
                          <label className={`checkbox-label ${includeStudent ? 'checked' : ''}`}>
                            <input type="checkbox" checked={includeStudent} onChange={e => setIncludeStudent(e.target.checked)} />
                            <span>Élève</span>
                          </label>
                        </div>
                      </div>

                      <div className="config-section">
                        <h4><MailPlus size={16} /> Modèle d'email</h4>
                        <select className="modern-select" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
                          <option value="">Sélection automatique</option>
                          {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                        </select>
                      </div>

                      <div className="config-section">
                        <h4><Layout size={16} /> Qualité de l'envoi</h4>
                        <div className="quality-selector-v2">
                          <button className={`q-btn ${preferredQuality === 'compressed' ? 'active' : ''}`} onClick={() => setPreferredQuality('compressed')}>Qualité SD</button>
                          <button className={`q-btn ${preferredQuality === 'high' ? 'active' : ''}`} onClick={() => setPreferredQuality('high')}>Qualité HD</button>
                        </div>
                      </div>

                      <div className="config-section">
                        <h4>Test d'envoi</h4>
                        <div className="test-group-v2">
                          <input type="email" placeholder="Email de test..." className="modern-input" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                          <button className="btn secondary" onClick={() => launchDistribution(true)} disabled={sending || !testEmail}>Test</button>
                        </div>
                      </div>

                      <div className="action-footer">
                        <button className="btn secondary full-width" onClick={previewEmail} disabled={previewLoading || selectedFileIds.length === 0}>
                          {previewLoading ? <RefreshCcw size={16} className="spin" /> : <Eye size={16} />} Aperçu des emails
                        </button>
                        <button className="btn btn-primary full-width shiny" onClick={() => launchDistribution(false)} disabled={sending || selectedFileIds.length === 0}>
                          <Send size={18} /> Lancer la distribution ({selectedFileIds.length})
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="batch-history-pane">
                      {historyLoading ? (
                        <div className="loading-placeholder">Chargement...</div>
                      ) : batchHistory.length === 0 ? (
                        <div className="empty-state mini">Aucun envoi pour ce lot</div>
                      ) : (
                        <div className="history-list-mini">
                          {batchHistory.map(job => (
                            <div key={job.id || (job as any)._id} className="history-item-mini">
                              <div className="history-item-header">
                                <span className={`status-dot ${job.status}`} />
                                <span className="history-date">{new Date(job.createdAt || job.startedAt || '').toLocaleString()}</span>
                                <span className={`type-badge mini ${job.isTest ? 'test' : 'real'}`}>{job.isTest ? 'TEST' : 'RÉEL'}</span>
                              </div>
                              <div className="history-item-meta">
                                <div><strong>Par:</strong> {job.creatorName || 'Système'}</div>
                                <div><strong>Élèves:</strong> {job.totalItems} • <strong>Envoyés:</strong> {job.sentItems || job.processedItems}</div>
                                <div className="job-opts-mini">
                                  {job.options?.includeFather && <span title="Père">P</span>}
                                  {job.options?.includeMother && <span title="Mère">M</span>}
                                  {job.options?.includeStudent && <span title="Élève">E</span>}
                                  <span className="sep">|</span>
                                  <span>{job.options?.quality === 'high' ? 'HD' : 'SD'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* Job Banner (Polling) */}
          {emailJob && (
            <div className={`job-status-banner-v2 ${emailJob.status}`}>
              <div className="job-info">
                <div className="job-status-title">
                  {emailJob.status === 'running' && <RefreshCcw size={16} className="spin" />}
                  {emailJob.status === 'completed' && <CheckCircle2 size={16} />}
                  <span>{emailJob.status === 'running' ? 'Distribution en cours...' : 'Distribution terminée'}</span>
                </div>
                <span className="job-count">{emailJob.processedItems}/{emailJob.totalItems}</span>
              </div>
              <div className="progress-bar-v2">
                <div className="progress-fill" style={{ width: `${(emailJob.processedItems / emailJob.totalItems) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Preview Modal */}
          {showPreviewModal && emailPreview && (
            <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
              <div className="modal-content glass-card preview-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Aperçu de la distribution</h3>
                  <button className="btn-icon" onClick={() => setShowPreviewModal(false)}><X size={20} /></button>
                </div>
                <div className="modal-body">
                   <div className="preview-meta">
                     <p><strong>Destinataires estimés:</strong> {emailPreview.totalRecipientCount}</p>
                     <p><strong>Sujet:</strong> {emailPreview.subject}</p>
                   </div>
                   <div className="preview-frame" dangerouslySetInnerHTML={{ __html: emailPreview.html }} />
                </div>
                <div className="modal-footer">
                  <button className="btn secondary" onClick={() => setShowPreviewModal(false)}>Fermer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-layout glass-panel">
          <div className="history-header">
            <h3><History size={20} /> Historique des envois</h3>
            <button className="btn secondary mini" onClick={fetchAllJobs} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'spin' : ''} /> Actualiser
            </button>
          </div>
          
          <div className="history-table-wrap">
            <table className="history-table-detailed">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type / Auteur</th>
                  <th>Configuration</th>
                  <th>Résultat</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {allJobs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="empty-history">Aucun historique trouvé</td>
                  </tr>
                )}
                {allJobs.map(job => {
                  const isExpanded = expandedJobId === job._id
                  const template = templates.find(t => t._id === job.options?.templateId)
                  return (
                    <React.Fragment key={job._id}>
                      <tr className={`history-main-row ${isExpanded ? 'expanded' : ''}`} onClick={() => setExpandedJobId(isExpanded ? null : job._id)}>
                        <td>
                          <div className="date-time">
                            <span className="d">{new Date(job.createdAt || job.startedAt).toLocaleDateString()}</span>
                            <span className="t">{new Date(job.createdAt || job.startedAt).toLocaleTimeString()}</span>
                          </div>
                        </td>
                        <td>
                          <div className="job-identity">
                            <span className={`type-badge ${job.isTest ? 'test' : 'real'}`}>
                              {job.isTest ? 'TEST' : 'ENVOI RÉEL'}
                            </span>
                            <span className="author">{job.creatorName || 'Système'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="job-config-info">
                            <div className="recipients-icons">
                              <span className={`icon-pill ${job.options?.includeFather ? 'active' : ''}`} title="Père">P</span>
                              <span className={`icon-pill ${job.options?.includeMother ? 'active' : ''}`} title="Mère">M</span>
                              <span className={`icon-pill ${job.options?.includeStudent ? 'active' : ''}`} title="Élève">E</span>
                            </div>
                            <span className="quality-badge">{job.options?.quality === 'high' ? 'HD' : 'SD'}</span>
                            <span className="tpl-name" title={template?.name || 'Automatique'}>
                              {template?.name || 'Auto'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="job-stats-summary">
                            <span className="stat total" title="Total">{job.totalItems} <Users size={12} /></span>
                            <span className="stat sent" title="Envoyés">{job.sentItems} <CheckCircle2 size={12} /></span>
                            {job.failedItems > 0 && <span className="stat failed" title="Échecs">{job.failedItems} <XCircle size={12} /></span>}
                            {job.skippedItems > 0 && <span className="stat skipped" title="Ignorés">{job.skippedItems} <AlertCircle size={12} /></span>}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${job.status}`}>
                            {job.status === 'completed' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Échec'}
                          </span>
                        </td>
                        <td>
                          <button className="btn-icon">
                            {isExpanded ? <Plus size={16} style={{ transform: 'rotate(45deg)' }} /> : <Eye size={16} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="history-details-row">
                          <td colSpan={6}>
                            <div className="job-details-content">
                              <div className="details-header">
                                <h4>Détail de l'envoi</h4>
                                {job.error && <div className="job-global-error">Erreur globale: {job.error}</div>}
                              </div>
                              <div className="items-list-scroll">
                                <table className="job-items-table">
                                  <thead>
                                    <tr>
                                      <th>Élève</th>
                                      <th>Destinataires</th>
                                      <th>Statut</th>
                                      <th>Détail / Erreur</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {job.items?.map((item, idx) => (
                                      <tr key={idx}>
                                        <td>{item.studentName || 'Élève inconnu'}</td>
                                        <td>
                                          <div className="item-recipients">
                                            {item.recipients?.map((r, ri) => (
                                              <span key={ri} className="recipient-pill" title={r}>{r}</span>
                                            ))}
                                            {!item.recipients?.length && <span className="text-muted">Aucun</span>}
                                          </div>
                                        </td>
                                        <td>
                                          <span className={`status-pill-small ${item.status}`}>
                                            {item.status === 'sent' ? 'Envoyé' : item.status === 'skipped' ? 'Ignoré' : 'Échec'}
                                          </span>
                                        </td>
                                        <td className="item-error-cell">{item.error || '-'}</td>
                                      </tr>
                                    ))}
                                    {(!job.items || job.items.length === 0) && (
                                      <tr><td colSpan={4} className="text-center p-4 text-muted">Aucun détail disponible pour cet envoi</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
