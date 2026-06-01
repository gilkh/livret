import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Edit2, Trash2, Mail, Save, X, Eye, Image as ImageIcon, Send, RefreshCcw, CheckCircle, AlertCircle, History, Package, FolderArchive, FileDown, Archive, Layout, CheckSquare, Square, Users, CheckCircle2, XCircle, MailPlus, Layers, Download, Upload, AlertTriangle, Clock, Filter, Search, Calendar, TrendingUp, BarChart3, ChevronDown, ChevronRight, User, MailOpen, MailX, MailCheck } from 'lucide-react'
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
  schoolYearId?: string
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
  _id: string
  id: string
  batchId: string
  createdBy: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  totalItems: number
  processedItems: number
  sentItems: number
  skippedItems: number
  failedItems: number
  partialItems: number
  totalEmails: number
  processedEmails: number
  sentEmails: number
  failedEmails: number
  error?: string
  items: Array<{
    fileId: string
    studentId: string
    studentName: string
    recipients: string[]
    recipientDetails?: Array<{
      email: string
      type: 'father' | 'mother' | 'student' | 'override'
      status: 'pending' | 'sent' | 'failed'
      error?: string
    }>
    status: 'pending' | 'sent' | 'skipped' | 'failed' | 'partial'
    error?: string
  }>
  creatorName?: string
  startedAt?: string
  completedAt?: string
  createdAt?: string
  updatedAt?: string
  isTest?: boolean
  options?: {
    includeFather?: boolean
    includeMother?: boolean
    includeStudent?: boolean
    customMessage?: string
    overrideEmail?: string
    testEmailOverride?: string
    templateId?: string
    quality?: string
    selectedFileIds?: string[]
    [key: string]: any
  }
  batchInfo?: {
    groupLabel: string
    yearName: string
    semester: string
    createdBy: string
    creatorRole: string
  }
  creatorInfo?: {
    displayName: string
    role: string
  }
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
    linkedClasses: [] as string[],
    schoolYearId: ''
  })
  
  const [editorType, setEditorType] = useState<'visual' | 'html'>('visual')
  const [searchQuery, setSearchQuery] = useState('')

  // Templates tab year filter & import/export
  const [selectedTemplateYearId, setSelectedTemplateYearId] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [conflictMap, setConflictMap] = useState<Record<string, { templateId: string; templateName: string }>>({})
  const [exportSuccess, setExportSuccess] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [serverExports, setServerExports] = useState<{ fileName: string; size: number; mtime: string; exportedByName?: string; timestamp?: string }[]>([])
  const [loadingExports, setLoadingExports] = useState(false)

  const filteredTemplates = useMemo(() => {
    let result = templates
    if (selectedTemplateYearId) {
      result = result.filter(t =>
        !t.schoolYearId || t.schoolYearId === selectedTemplateYearId
      )
    }
    if (searchQuery) {
      const lowSearch = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.name.toLowerCase().includes(lowSearch) || 
        t.subject.toLowerCase().includes(lowSearch) ||
        (t.linkedLevels || []).some(l => l.toLowerCase().includes(lowSearch)) ||
        (t.linkedClasses || []).some(c => c.toLowerCase().includes(lowSearch))
      )
    }
    return result
  }, [templates, selectedTemplateYearId, searchQuery])

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
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('')
  const [historyFilterType, setHistoryFilterType] = useState<string>('')
  const [historyFilterAuthor, setHistoryFilterAuthor] = useState<string>('')
  const [historyFilterYear, setHistoryFilterYear] = useState<string>('')
  const [historyPage, setHistoryPage] = useState(1)
  const historyPageSize = 20

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


  // History filtering and stats
  const historyAuthors = useMemo(() => {
    const authors = new Map<string, string>()
    allJobs.forEach(job => {
      const name = job.creatorInfo?.displayName || job.creatorName || 'Système'
      const id = job.createdBy?.toString() || name
      if (!authors.has(id)) authors.set(id, name)
    })
    return Array.from(authors.entries()).map(([id, name]) => ({ id, name }))
  }, [allJobs])

  const historyYears = useMemo(() => {
    const years = new Set<string>()
    allJobs.forEach(job => {
      if (job.batchInfo?.yearName) years.add(job.batchInfo.yearName)
    })
    return Array.from(years).sort().reverse()
  }, [allJobs])

  const filteredHistoryJobs = useMemo(() => {
    let result = [...allJobs]
    if (historySearch) {
      const low = historySearch.toLowerCase()
      result = result.filter(job => {
        const author = job.creatorInfo?.displayName || job.creatorName || ''
        const batchLabel = job.batchInfo?.groupLabel || ''
        const yearName = job.batchInfo?.yearName || ''
        const semester = job.batchInfo?.semester || ''
        const items = job.items?.map(i => i.studentName).join(' ') || ''
        return author.toLowerCase().includes(low)
          || batchLabel.toLowerCase().includes(low)
          || yearName.toLowerCase().includes(low)
          || semester.toLowerCase().includes(low)
          || items.toLowerCase().includes(low)
      })
    }
    if (historyFilterStatus) {
      result = result.filter(job => job.status === historyFilterStatus)
    }
    if (historyFilterType) {
      result = result.filter(job => historyFilterType === 'test' ? job.isTest : !job.isTest)
    }
    if (historyFilterAuthor) {
      result = result.filter(job => {
        const name = job.creatorInfo?.displayName || job.creatorName || 'Système'
        const id = job.createdBy?.toString() || name
        return id === historyFilterAuthor
      })
    }
    if (historyFilterYear) {
      result = result.filter(job => job.batchInfo?.yearName === historyFilterYear)
    }
    return result
  }, [allJobs, historySearch, historyFilterStatus, historyFilterType, historyFilterAuthor, historyFilterYear])

  const pagedHistoryJobs = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize
    return filteredHistoryJobs.slice(start, start + historyPageSize)
  }, [filteredHistoryJobs, historyPage, historyPageSize])

  const historyTotalPages = Math.ceil(filteredHistoryJobs.length / historyPageSize)

  const historyStats = useMemo(() => {
    const total = allJobs.length
    const completed = allJobs.filter(j => j.status === 'completed').length
    const failed = allJobs.filter(j => j.status === 'failed').length
    const running = allJobs.filter(j => j.status === 'running').length
    const realJobs = allJobs.filter(j => !j.isTest)
    const testJobs = allJobs.filter(j => j.isTest)
    const totalEmailsSent = realJobs.reduce((sum, j) => sum + (j.sentEmails || j.sentItems || 0), 0)
    const totalEmailsFailed = realJobs.reduce((sum, j) => sum + (j.failedEmails || j.failedItems || 0), 0)
    const totalStudentsNotified = realJobs.reduce((sum, j) => sum + (j.sentItems || 0), 0)
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, failed, running, realJobs: realJobs.length, testJobs: testJobs.length, totalEmailsSent, totalEmailsFailed, totalStudentsNotified, successRate }
  }, [allJobs])

  const getJobDuration = (job: EmailJob) => {
    const start = job.startedAt || job.createdAt
    const end = job.completedAt || job.updatedAt
    if (!start || !end) return null
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }


  useEffect(() => {
    loadTemplatesData()
    if (activeTab === 'templates' || activeTab === 'distribution') {
      loadYears()
    }
    if (activeTab === 'distribution') {
      loadBatches()
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

      if (activeYear) {
        if (!selectedYearName) setSelectedYearName(activeYear.name)
        if (!selectedTemplateYearId) setSelectedTemplateYearId(activeYear._id)
      } else if (availableYears.length > 0) {
        const sorted = [...availableYears].sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
        if (!selectedYearName) setSelectedYearName(sorted[0].name)
        if (!selectedTemplateYearId) setSelectedTemplateYearId(sorted[0]._id)
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
      linkedClasses: [],
      schoolYearId: selectedTemplateYearId || ''
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
      linkedClasses: tpl.linkedClasses || [],
      schoolYearId: tpl.schoolYearId || ''
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

  const handleExport = async (templateId: string) => {
    setExportingId(templateId)
    setExportSuccess('')
    try {
      const exportRes = await api.post(`/email-templates/${templateId}/export`)
      const { fileName, path: filePath } = exportRes.data
      setExportSuccess(`Modèle exporté avec succès: ${fileName} — Emplacement: ${filePath}`)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur lors de l\'export')
    } finally {
      setExportingId(null)
    }
  }

  const openImportModal = async () => {
    setShowImportModal(true)
    setLoadingExports(true)
    try {
      const res = await api.get('/email-templates/exports')
      setServerExports(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error(err)
      setServerExports([])
    } finally {
      setLoadingExports(false)
    }
  }

  const handleImportFromServer = async (fileName: string) => {
    setImporting(true)
    try {
      const res = await api.post(`/email-templates/import-server/${fileName}`)
      setTemplates(prev => [res.data, ...prev])
      setShowImportModal(false)
      alert('Modèle importé avec succès')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  const loadConflicts = async (yearId: string) => {
    if (!yearId) {
      setConflictMap({})
      return
    }
    try {
      const res = await api.get(`/email-templates/conflicts?schoolYearId=${yearId}`)
      const map: Record<string, { templateId: string; templateName: string }> = {}
      for (const tpl of (res.data || [])) {
        for (const l of tpl.linkedLevels || []) {
          map[`level:${l}`] = { templateId: tpl._id, templateName: tpl.name }
        }
        for (const c of tpl.linkedClasses || []) {
          map[`class:${c}`] = { templateId: tpl._id, templateName: tpl.name }
        }
      }
      setConflictMap(map)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (showForm && formState.schoolYearId) {
      loadConflicts(formState.schoolYearId)
    } else {
      setConflictMap({})
    }
  }, [showForm, formState.schoolYearId])

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
          <div className="section-header-actions">
            <div className="template-year-bar">
              <select
                className="modern-select compact"
                value={selectedTemplateYearId}
                onChange={(e) => setSelectedTemplateYearId(e.target.value)}
              >
                <option value="">Toutes les années</option>
                {schoolYears
                  .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                  .map((year: any) => (
                    <option key={year._id} value={year._id}>{year.name}</option>
                  ))
                }
              </select>
            </div>
            <div className="search-filter-group">
              <div className="search-input-wrapper">
                <ImageIcon size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Rechercher un modèle..." 
                  className="modern-input search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn-secondary-outline"
              onClick={openImportModal}
              disabled={importing}
            >
              {importing ? <RefreshCcw size={18} className="spin-slow" /> : <Upload size={18} />}
              Importer
            </button>
            <button className="btn-premium" onClick={handleCreate}>
              <Plus size={20} /> Nouveau Modèle
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {exportSuccess && (
            <div className="success-banner">
              <CheckCircle size={18} />
              <span>{exportSuccess}</span>
              <button onClick={() => setExportSuccess('')} className="dismiss-btn">&times;</button>
            </div>
          )}

          {!showForm ? (
            <div className="templates-grid">
              {loading && (
                <div className="loading-container">
                  <RefreshCcw size={40} className="spin-slow" />
                  <p>Chargement de vos modèles...</p>
                </div>
              )}
              
              {!loading && templates.length === 0 && (
                <div className="empty-state-modern">
                  <div className="empty-icon-wrap">
                    <MailPlus size={64} />
                  </div>
                  <h3>Aucun modèle configuré</h3>
                  <p>Commencez par créer votre premier modèle d'email pour automatiser vos envois.</p>
                  <button className="btn btn-primary mt-4" onClick={handleCreate}>
                    <Plus size={18} /> Créer un modèle
                  </button>
                </div>
              )}

              {!loading && templates.length > 0 && filteredTemplates.length === 0 && (
                <div className="empty-state-modern">
                  <div className="empty-icon-wrap">
                    <ImageIcon size={64} />
                  </div>
                  <h3>Aucun résultat</h3>
                  <p>Aucun modèle ne correspond à votre recherche "{searchQuery}".</p>
                  <button className="btn btn-secondary mt-4" onClick={() => setSearchQuery('')}>
                    Effacer la recherche
                  </button>
                </div>
              )}

              {!loading && filteredTemplates.map(tpl => {
                const yearName = tpl.schoolYearId
                  ? schoolYears.find((y: any) => y._id === tpl.schoolYearId)?.name
                  : null
                const levelCount = tpl.linkedLevels?.length || 0
                const classCount = tpl.linkedClasses?.length || 0
                const isDefault = !levelCount && !classCount

                return (
                <div key={tpl._id} className="tpl-card">
                  <div className="tpl-card-accent" />

                  <div className="tpl-card-top">
                    <div className="tpl-card-identity">
                      <div className="tpl-card-icon">
                        <Mail size={18} />
                      </div>
                      <div className="tpl-card-title-block">
                        <h3 className="tpl-card-name">{tpl.name}</h3>
                        <span className={`tpl-card-year ${!yearName ? 'tpl-card-year-generic' : ''}`}>
                          {yearName || 'Toutes les ann\u00e9es'}
                        </span>
                      </div>
                    </div>
                    <div className="tpl-card-actions">
                      <button
                        className="tpl-act-btn tpl-act-export"
                        onClick={() => handleExport(tpl._id)}
                        title="Exporter"
                        disabled={exportingId === tpl._id}
                      >
                        {exportingId === tpl._id ? <RefreshCcw size={15} className="spin-slow" /> : <Download size={15} />}
                      </button>
                      <button className="tpl-act-btn tpl-act-edit" onClick={() => handleEdit(tpl)} title="Modifier">
                        <Edit2 size={15} />
                      </button>
                      <button className="tpl-act-btn tpl-act-delete" onClick={() => handleDelete(tpl._id)} title="Supprimer">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="tpl-card-subject">
                    <span className="tpl-subject-label">Objet</span>
                    <span className="tpl-subject-value">{tpl.subject}</span>
                  </div>

                  {tpl.blocks && tpl.blocks.length > 0 && (
                    <div className="tpl-card-preview">
                      <div className="tpl-preview-strip">
                        {tpl.blocks.slice(0, 3).map((block, i) => (
                          <div key={i} className={`tpl-preview-block tpl-preview-${block.type}`}>
                            {block.type === 'heading' && <div className="tpl-mock-heading" />}
                            {block.type === 'text' && <div className="tpl-mock-text"><div /><div className="short" /></div>}
                            {block.type === 'image' && <div className="tpl-mock-image"><ImageIcon size={12} /></div>}
                            {block.type === 'divider' && <div className="tpl-mock-divider" />}
                            {block.type === 'button' && <div className="tpl-mock-button" />}
                          </div>
                        ))}
                        {tpl.blocks.length > 3 && <div className="tpl-preview-more">+{tpl.blocks.length - 3}</div>}
                      </div>
                    </div>
                  )}

                  <div className="tpl-card-links">
                    {isDefault ? (
                      <div className="tpl-link-chip tpl-link-default">
                        <CheckCircle2 size={13} />
                        <span>Mod\u00e8le par d\u00e9faut</span>
                      </div>
                    ) : (
                      <>
                        {levelCount > 0 && (
                          <div className="tpl-link-chip tpl-link-levels" title={tpl.linkedLevels.join(', ')}>
                            <Layers size={13} />
                            <span>{levelCount} niveau{levelCount > 1 ? 'x' : ''}</span>
                          </div>
                        )}
                        {classCount > 0 && (
                          <div className="tpl-link-chip tpl-link-classes" title={tpl.linkedClasses.join(', ')}>
                            <Users size={13} />
                            <span>{classCount} classe{classCount > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="tpl-card-footer">
                    <button
                      className="tpl-use-btn"
                      onClick={() => {
                        setSelectedTemplateId(tpl._id)
                        setActiveTab('distribution')
                      }}
                    >
                      <Send size={14} />
                      <span>Utiliser</span>
                    </button>
                  </div>
                </div>
                )
              })}
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

                  <div className="form-group flex-1">
                    <label>Année scolaire</label>
                    <select
                      className="modern-input"
                      value={formState.schoolYearId}
                      onChange={e => setFormState({...formState, schoolYearId: e.target.value})}
                    >
                      <option value="">Toutes les années</option>
                      {schoolYears
                        .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                        .map((year: any) => (
                          <option key={year._id} value={year._id}>{year.name}</option>
                        ))
                      }
                    </select>
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
                        {allLevels?.map(level => {
                          const conflict = conflictMap[`level:${level.name}`]
                          const isConflict = conflict && conflict.templateId !== editingTemplate?._id
                          return (
                            <label key={level._id || level.name} className="checkbox-label-modern">
                              <input 
                                type="checkbox" 
                                checked={formState.linkedLevels.includes(level.name)}
                                onChange={() => toggleLevel(level.name)}
                              />
                              <span className="check-custom"></span>
                              {level.name}
                              {isConflict && (
                                <span className="conflict-warning" title={`Déjà assigné à: ${conflict.templateName}`}>
                                  <AlertTriangle size={12} /> {conflict.templateName}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    
                    <div className="link-section glass-panel mt-4">
                      <h4><Layout size={16} /> Lier aux Classes</h4>
                      <div className="checkbox-grid-compact">
                        {allClasses?.map(cls => {
                          const conflict = conflictMap[`class:${cls.name}`]
                          const isConflict = conflict && conflict.templateId !== editingTemplate?._id
                          return (
                            <label key={cls._id || cls.name} className="checkbox-label-modern">
                              <input 
                                type="checkbox" 
                                checked={formState.linkedClasses.includes(cls.name)}
                                onChange={() => toggleClass(cls.name)}
                              />
                              <span className="check-custom"></span>
                              {cls.name}
                              {isConflict && (
                                <span className="conflict-warning" title={`Déjà assigné à: ${conflict.templateName}`}>
                                  <AlertTriangle size={12} /> {conflict.templateName}
                                </span>
                              )}
                            </label>
                          )
                        })}
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
        <div className="history-page-v2">
          {/* Stats Dashboard */}
          <div className="history-stats-grid">
            <div className="history-stat-card stat-total">
              <div className="stat-icon-wrap"><BarChart3 size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.total}</span>
                <span className="stat-label">Envois totaux</span>
              </div>
            </div>
            <div className="history-stat-card stat-sent">
              <div className="stat-icon-wrap"><MailCheck size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.totalEmailsSent}</span>
                <span className="stat-label">Emails envoyés</span>
              </div>
            </div>
            <div className="history-stat-card stat-students">
              <div className="stat-icon-wrap"><Users size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.totalStudentsNotified}</span>
                <span className="stat-label">Élèves notifiés</span>
              </div>
            </div>
            <div className="history-stat-card stat-rate">
              <div className="stat-icon-wrap"><TrendingUp size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.successRate}%</span>
                <span className="stat-label">Taux de réussite</span>
              </div>
            </div>
            <div className="history-stat-card stat-failed">
              <div className="stat-icon-wrap"><MailX size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.totalEmailsFailed}</span>
                <span className="stat-label">Emails échoués</span>
              </div>
            </div>
            <div className="history-stat-card stat-tests">
              <div className="stat-icon-wrap"><MailOpen size={20} /></div>
              <div className="stat-body">
                <span className="stat-value">{historyStats.testJobs}</span>
                <span className="stat-label">Envois test</span>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="history-filters-bar">
            <div className="history-search-wrap">
              <Search size={16} className="history-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par auteur, année, élève..."
                className="history-search-input"
                value={historySearch}
                onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1) }}
              />
            </div>
            <select className="history-filter-select" value={historyFilterStatus} onChange={e => { setHistoryFilterStatus(e.target.value); setHistoryPage(1) }}>
              <option value="">Tous les statuts</option>
              <option value="completed">Terminé</option>
              <option value="running">En cours</option>
              <option value="failed">Échoué</option>
              <option value="queued">En attente</option>
            </select>
            <select className="history-filter-select" value={historyFilterType} onChange={e => { setHistoryFilterType(e.target.value); setHistoryPage(1) }}>
              <option value="">Tous les types</option>
              <option value="real">Envoi réel</option>
              <option value="test">Test</option>
            </select>
            <select className="history-filter-select" value={historyFilterAuthor} onChange={e => { setHistoryFilterAuthor(e.target.value); setHistoryPage(1) }}>
              <option value="">Tous les auteurs</option>
              {historyAuthors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="history-filter-select" value={historyFilterYear} onChange={e => { setHistoryFilterYear(e.target.value); setHistoryPage(1) }}>
              <option value="">Toutes les années</option>
              {historyYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {(historySearch || historyFilterStatus || historyFilterType || historyFilterAuthor || historyFilterYear) && (
              <button className="history-clear-filters" onClick={() => { setHistorySearch(''); setHistoryFilterStatus(''); setHistoryFilterType(''); setHistoryFilterAuthor(''); setHistoryFilterYear(''); setHistoryPage(1) }}>
                <X size={14} /> Réinitialiser
              </button>
            )}
            <div className="history-filters-spacer" />
            <span className="history-count-label">{filteredHistoryJobs.length} résultat{filteredHistoryJobs.length !== 1 ? 's' : ''}</span>
            <button className="btn secondary mini" onClick={fetchAllJobs} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'spin' : ''} /> Actualiser
            </button>
          </div>

          {/* Job Cards List */}
          <div className="history-jobs-list">
            {loading && allJobs.length === 0 && (
              <div className="history-loading-state">
                <RefreshCcw size={40} className="spin-slow" />
                <p>Chargement de l'historique...</p>
              </div>
            )}

            {!loading && allJobs.length === 0 && (
              <div className="history-empty-state">
                <div className="empty-icon-wrap"><History size={64} /></div>
                <h3>Aucun envoi enregistré</h3>
                <p>Les envois d'emails apparaîtront ici une fois distribués.</p>
              </div>
            )}

            {!loading && allJobs.length > 0 && filteredHistoryJobs.length === 0 && (
              <div className="history-empty-state">
                <div className="empty-icon-wrap"><Search size={64} /></div>
                <h3>Aucun résultat</h3>
                <p>Aucun envoi ne correspond à vos filtres.</p>
                <button className="btn secondary" onClick={() => { setHistorySearch(''); setHistoryFilterStatus(''); setHistoryFilterType(''); setHistoryFilterAuthor(''); setHistoryFilterYear(''); setHistoryPage(1) }}>
                  Effacer les filtres
                </button>
              </div>
            )}

            {pagedHistoryJobs.map(job => {
              const isExpanded = expandedJobId === job._id
              const template = templates.find(t => t._id === job.options?.templateId)
              const duration = getJobDuration(job)
              const sentCount = job.sentEmails || job.sentItems || 0
              const failedCount = job.failedEmails || job.failedItems || 0
              const skippedCount = job.skippedItems || 0
              const partialCount = job.partialItems || 0
              const totalEmailCount = job.totalEmails || job.totalItems || 0
              const progressPct = job.totalItems > 0 ? Math.round((job.processedItems / job.totalItems) * 100) : 0
              const authorName = job.creatorInfo?.displayName || job.creatorName || 'Système'
              const authorRole = job.creatorInfo?.role || job.batchInfo?.creatorRole || ''

              return (
                <div key={job._id} className={`history-job-card ${isExpanded ? 'expanded' : ''} ${job.status}`}>
                  <div className="job-card-main" onClick={() => setExpandedJobId(isExpanded ? null : job._id)}>
                    <div className={`job-status-indicator ${job.status}`}>
                      {job.status === 'completed' && <CheckCircle2 size={18} />}
                      {job.status === 'running' && <RefreshCcw size={18} className="spin" />}
                      {job.status === 'failed' && <XCircle size={18} />}
                      {job.status === 'queued' && <Clock size={18} />}
                    </div>
                    <div className="job-card-content">
                      <div className="job-card-top-row">
                        <div className="job-card-title-area">
                          <span className={`type-badge ${job.isTest ? 'test' : 'real'}`}>
                            {job.isTest ? 'TEST' : 'ENVOI RÉEL'}
                          </span>
                          <span className="job-author-name">
                            <User size={13} /> {authorName}
                          </span>
                          {authorRole && (
                            <span className={`job-author-role role-${authorRole.toLowerCase()}`}>
                              {authorRole}
                            </span>
                          )}
                        </div>
                        <div className="job-card-date-area">
                          <Calendar size={13} />
                          <span className="job-date">{new Date(job.createdAt || job.startedAt || '').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span className="job-time">{new Date(job.createdAt || job.startedAt || '').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {duration && (
                            <span className="job-duration"><Clock size={12} /> {duration}</span>
                          )}
                        </div>
                      </div>
                      <div className="job-card-meta-row">
                        {job.batchInfo?.yearName && (
                          <span className="job-meta-chip chip-year"><Layers size={12} /> {job.batchInfo.yearName}</span>
                        )}
                        {job.batchInfo?.semester && (
                          <span className="job-meta-chip chip-semester"><Calendar size={12} /> {job.batchInfo.semester}</span>
                        )}
                        {job.batchInfo?.groupLabel && (
                          <span className="job-meta-chip chip-group"><FolderArchive size={12} /> {job.batchInfo.groupLabel}</span>
                        )}
                        <span className="job-meta-sep">|</span>
                        <span className="job-recipients-config">
                          <span className={`icon-pill ${job.options?.includeFather ? 'active' : ''}`} title="Père">P</span>
                          <span className={`icon-pill ${job.options?.includeMother ? 'active' : ''}`} title="Mère">M</span>
                          <span className={`icon-pill ${job.options?.includeStudent ? 'active' : ''}`} title="Élève">E</span>
                        </span>
                        {job.options?.quality && (
                          <span className="quality-badge">{job.options.quality === 'high' ? 'HD' : 'SD'}</span>
                        )}
                        {template && (
                          <span className="job-template-chip"><Mail size={12} /> {template.name}</span>
                        )}
                        {job.options?.testEmailOverride && (
                          <span className="job-override-chip" title={`Envoyé à: ${job.options.testEmailOverride}`}>@ {job.options.testEmailOverride}</span>
                        )}
                      </div>
                      <div className="job-card-stats-row">
                        <div className="job-stat-group">
                          <span className="js-stat js-total" title="Total élèves"><Users size={13} /> {job.totalItems}</span>
                          <span className="js-stat js-sent" title="Envoyés"><MailCheck size={13} /> {sentCount}</span>
                          {partialCount > 0 && <span className="js-stat js-partial" title="Partiels"><AlertCircle size={13} /> {partialCount}</span>}
                          {skippedCount > 0 && <span className="js-stat js-skipped" title="Ignorés"><AlertTriangle size={13} /> {skippedCount}</span>}
                          {failedCount > 0 && <span className="js-stat js-failed" title="Échoués"><MailX size={13} /> {failedCount}</span>}
                        </div>
                        {totalEmailCount > 0 && (
                          <div className="job-emails-count">
                            <Mail size={12} /> {job.sentEmails || 0}/{totalEmailCount} emails
                          </div>
                        )}
                        <div className="job-progress-bar-wrap">
                          <div className="job-progress-bar">
                            <div className={`job-progress-fill status-${job.status}`} style={{ width: `${progressPct}%` }} />
                          </div>
                          <span className="job-progress-pct">{progressPct}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="job-expand-btn">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="job-card-details">
                      <div className="details-top-bar">
                        <h4>Détail de l'envoi</h4>
                        <div className="details-summary-pills">
                          <span className="detail-pill pill-sent">{sentCount} envoyé{sentCount !== 1 ? 's' : ''}</span>
                          {failedCount > 0 && <span className="detail-pill pill-failed">{failedCount} échoué{failedCount !== 1 ? 's' : ''}</span>}
                          {skippedCount > 0 && <span className="detail-pill pill-skipped">{skippedCount} ignoré{skippedCount !== 1 ? 's' : ''}</span>}
                          {partialCount > 0 && <span className="detail-pill pill-partial">{partialCount} partiel{partialCount !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      {job.error && (
                        <div className="job-global-error-banner">
                          <AlertCircle size={16} /> Erreur globale: {job.error}
                        </div>
                      )}
                      <div className="details-time-info">
                        {job.startedAt && (
                          <span><Clock size={13} /> Début: {new Date(job.startedAt).toLocaleString('fr-FR')}</span>
                        )}
                        {job.completedAt && (
                          <span><CheckCircle2 size={13} /> Fin: {new Date(job.completedAt).toLocaleString('fr-FR')}</span>
                        )}
                        {duration && (
                          <span><TrendingUp size={13} /> Durée: {duration}</span>
                        )}
                      </div>
                      {job.options?.customMessage && (
                        <div className="details-custom-msg">
                          <Mail size={13} /> Message personnalisé: {job.options.customMessage}
                        </div>
                      )}
                      <div className="details-items-list">
                        <table className="job-items-table-v2">
                          <thead>
                            <tr>
                              <th>Élève</th>
                              <th>Destinataires</th>
                              <th>Statut</th>
                              <th>Détail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {job.items?.map((item, idx) => (
                              <tr key={idx} className={`item-row-${item.status}`}>
                                <td>
                                  <div className="item-student-cell">
                                    <User size={14} />
                                    <span>{item.studentName || 'Élève inconnu'}</span>
                                  </div>
                                </td>
                                <td>
                                  <div className="item-recipients-v2">
                                    {item.recipientDetails && item.recipientDetails.length > 0 ? (
                                      item.recipientDetails.map((rd, ri) => (
                                        <span key={ri} className={`recipient-chip rc-${rd.status} rc-${rd.type}`} title={rd.error || rd.email}>
                                          <span className="rc-type">{rd.type === 'father' ? 'P' : rd.type === 'mother' ? 'M' : rd.type === 'student' ? 'E' : '@'}</span>
                                          <span className="rc-email">{rd.email}</span>
                                          {rd.status === 'failed' && <XCircle size={10} className="rc-failed-icon" />}
                                          {rd.status === 'sent' && <CheckCircle size={10} className="rc-sent-icon" />}
                                        </span>
                                      ))
                                    ) : (
                                      item.recipients?.map((r, ri) => (
                                        <span key={ri} className="recipient-chip rc-default" title={r}>{r}</span>
                                      ))
                                    )}
                                    {(!item.recipients?.length && !item.recipientDetails?.length) && (
                                      <span className="no-recipients">Aucun</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className={`item-status-badge isb-${item.status}`}>
                                    {item.status === 'sent' ? 'Envoyé' : item.status === 'skipped' ? 'Ignoré' : item.status === 'partial' ? 'Partiel' : item.status === 'failed' ? 'Échoué' : 'En attente'}
                                  </span>
                                </td>
                                <td className="item-error-cell">
                                  {item.error ? (
                                    <span className="item-error-text" title={item.error}>{item.error}</span>
                                  ) : (
                                    <span className="item-no-error">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {(!job.items || job.items.length === 0) && (
                              <tr><td colSpan={4} className="no-items-row">Aucun détail disponible pour cet envoi</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="history-pagination">
              <button className="page-btn" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>
                Précédent
              </button>
              <span className="page-info">Page {historyPage} / {historyTotalPages}</span>
              <button className="page-btn" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(p => p + 1)}>
                Suivant
              </button>
            </div>
          )}          
        </div>
      )}

      {/* Import from server modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <div className="import-modal-header">
              <div className="import-modal-title">
                <FolderArchive size={20} />
                <h3>Importer un modèle</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="import-modal-body">
              {loadingExports ? (
                <div className="import-loading">
                  <RefreshCcw size={28} className="spin-slow" />
                  <p>Chargement des exports...</p>
                </div>
              ) : serverExports.length === 0 ? (
                <div className="import-empty">
                  <Archive size={48} />
                  <h4>Aucun export trouvé</h4>
                  <p>Le dossier des exports est vide. Exportez d'abord un modèle pour pouvoir le réimporter.</p>
                </div>
              ) : (
                <div className="import-file-list">
                  <p className="import-hint">
                    Sélectionnez un fichier exporté depuis le dossier du serveur:
                  </p>
                  {serverExports.map((file, idx) => (
                    <div key={idx} className="import-file-item">
                      <div className="import-file-info">
                        <div className="import-file-name">
                          <Archive size={16} />
                          <span>{file.fileName}</span>
                        </div>
                        <div className="import-file-meta">
                          <span>{(file.size / 1024).toFixed(1)} Ko</span>
                          <span className="meta-sep">&middot;</span>
                          <span>{new Date(file.mtime).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {file.exportedByName && (
                            <>
                              <span className="meta-sep">&middot;</span>
                              <span>{file.exportedByName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn-import-pick"
                        disabled={importing}
                        onClick={() => handleImportFromServer(file.fileName)}
                      >
                        {importing ? (
                          <RefreshCcw size={14} className="spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        Importer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
