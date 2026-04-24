import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Edit2, Trash2, Mail, Save, X, Eye, Image as ImageIcon, Send, RefreshCcw, CheckCircle, AlertCircle, History, Package, FolderArchive, FileDown, Archive, Layout } from 'lucide-react'
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
  const [allJobs, setAllJobs] = useState<any[]>([])
  const jobInterval = useRef<number | null>(null)

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

  const uniqueFileVersionPairs = useMemo(() => {
    if (!selectedLot) return []
    const allFiles = selectedLot.batches.flatMap(b => b.files || [])
    const unique = Array.from(
      new Map(allFiles.map(f => [`${f.assignmentId}-${f.version}`, f])).values()
    )
    return unique.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  }, [selectedLot])

  useEffect(() => {
    loadTemplatesData()
    if (activeTab === 'distribution') {
      loadBatches()
    }
    if (activeTab === 'history') {
      fetchAllJobs()
    }
  }, [activeTab])

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
    if (!selectedLot) return
    if (selectedFileIds.length === uniqueFileVersionPairs.length) setSelectedFileIds([])
    else setSelectedFileIds(uniqueFileVersionPairs.map(f => f._id))
  }

  const previewEmail = async () => {
    if (!selectedLot || selectedFileIds.length === 0) return
    setPreviewLoading(true)
    try {
      const res = await api.post(`/gradebook-exports/batches/${selectedLot.batches[0]._id}/email-preview`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        templateId: selectedTemplateId || undefined
      })
      setEmailPreview(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setPreviewLoading(false)
    }
  }

  const launchDistribution = async (isTest = false) => {
    if (!selectedLot || selectedFileIds.length === 0) return
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
      selectedLot.batches.forEach(b => {
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

      // If multiple batches, we'll start them all. 
      // For simplicity in UI, we'll track the last job ID for polling if multiple exist.
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
    if (!selectedLot || selectedFileIds.length === 0) return
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

      const response = await api.post(`/gradebook-exports/zip-files`, {
        selectedFileIds: targetIds,
        label: `${selectedLot.groupLabel}_${quality || 'exports'}`
      }, { responseType: 'blob' })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${selectedLot.groupLabel}_${quality || 'exports'}.zip`)
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
    if (!selectedLot) return []
    return selectedLot.batches.flatMap(b => b.files.map(f => ({ ...f, batchId: b._id }))).filter(f => f.assignmentId === assignmentId && f.version === version)
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
        <div className="distribution-layout">
          <div className="batches-sidebar glass-panel">
            <h3>Bibliothèque</h3>
            <div className="batches-list">
              {!loading && groupedLots.length === 0 && (
                <div className="empty-state mini">
                  <FolderArchive size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <span>Aucun export</span>
                </div>
              )}
              {groupedLots.map(lot => {
                const selected = lot.key === selectedGroupKey
                const totalCount = lot.batches.reduce((sum, b) => sum + b.exportedCount, 0)
                return (
                  <div 
                    key={lot.key} 
                    className={`batch-item compact ${selected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedGroupKey(lot.key)
                      setEmailPreview(null)
                    }}
                  >
                    <div className="batch-label">{lot.groupLabel}</div>
                    <div className="batch-meta-row">
                      {lot.yearName && <span>{lot.yearName}</span>}
                      {lot.semester && <span> • {lot.semester}</span>}
                    </div>
                    <div className="batch-footer">
                      <span className="batch-date-small">{new Date(lot.createdAt).toLocaleDateString()}</span>
                      <span className="count-tag">{totalCount} fichiers</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="distribution-main">
            {selectedLot ? (
              <div className="glass-card distribution-card">
                <div className="dist-card-header">
                  <div style={{ flex: 1 }}>
                    <h2>{selectedLot.groupLabel}</h2>
                    <p>{uniqueFileVersionPairs.length} élèves / versions</p>
                  </div>
                  <div className="dist-actions">
                    <button 
                      className="btn secondary shiny" 
                      onClick={() => downloadSelectedFiles('compressed')} 
                      disabled={selectedFileIds.length === 0 || zipDownloadLoading}
                    >
                      <Archive size={16} /> SD ({selectedFileIds.length})
                    </button>
                    <button 
                      className="btn secondary shiny" 
                      onClick={() => downloadSelectedFiles('high')} 
                      disabled={selectedFileIds.length === 0 || zipDownloadLoading}
                    >
                      <Archive size={16} /> HD ({selectedFileIds.length})
                    </button>
                    <button className="btn secondary" onClick={previewEmail} disabled={previewLoading || selectedFileIds.length === 0}>
                      {previewLoading ? <RefreshCcw size={16} className="spin" /> : <Eye size={16} />} Aperçu
                    </button>

                    <div className="quality-send-selector">
                      <button 
                        className={`q-toggle ${preferredQuality === 'compressed' ? 'active' : ''}`}
                        onClick={() => setPreferredQuality('compressed')}
                        title="Qualité Standard (Léger)"
                      >SD</button>
                      <button 
                        className={`q-toggle ${preferredQuality === 'high' ? 'active' : ''}`}
                        onClick={() => setPreferredQuality('high')}
                        title="Haute Qualité (HD)"
                      >HD</button>
                    </div>

                    <button className="btn btn-primary" onClick={() => launchDistribution(false)} disabled={sending || selectedFileIds.length === 0}>
                      <Send size={18} /> Lancer ({selectedFileIds.length})
                    </button>
                  </div>
                </div>

                <div className="dist-settings glass-panel">
                  <div className="settings-row">
                    <div className="check-group">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={includeFather} onChange={e => setIncludeFather(e.target.checked)} />
                        Père
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={includeMother} onChange={e => setIncludeMother(e.target.checked)} />
                        Mère
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={includeStudent} onChange={e => setIncludeStudent(e.target.checked)} />
                        Élève
                      </label>
                    </div>

                    <div className="template-select-box">
                      <select 
                        className="modern-input mini" 
                        value={selectedTemplateId} 
                        onChange={e => setSelectedTemplateId(e.target.value)}
                        style={{ width: '220px' }}
                      >
                        <option value="">Sélection automatique</option>
                        {templates.map(t => (
                          <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="test-email-group">
                      <input 
                        type="email" 
                        placeholder="Email de test..." 
                        className="modern-input mini" 
                        value={testEmail} 
                        onChange={e => setTestEmail(e.target.value)} 
                      />
                      <button className="btn secondary mini" onClick={() => launchDistribution(true)} disabled={sending || !testEmail}>
                        Test
                      </button>
                    </div>
                  </div>
                </div>

                {emailJob && (
                  <div className={`job-status-banner ${emailJob.status === 'completed' ? 'success' : emailJob.status === 'failed' ? 'failed' : ''}`}>
                    <div className="job-info">
                      <div className="job-status-title">
                        {emailJob.status === 'running' && <RefreshCcw size={16} className="spin" />}
                        {emailJob.status === 'completed' && <CheckCircle size={16} />}
                        {emailJob.status === 'failed' && <AlertCircle size={16} />}
                        <span>
                          {emailJob.isTest ? '[TEST] ' : ''}
                          {emailJob.status === 'running' ? 'Envoi en cours...' : 
                           emailJob.status === 'completed' ? 'Envoi terminé avec succès' : 
                           'Échec de l\'envoi'}
                        </span>
                      </div>
                      <span className="job-count">{emailJob.processedItems}/{emailJob.totalItems}</span>
                    </div>

                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(emailJob.processedItems / emailJob.totalItems) * 100}%` }} />
                    </div>

                    {emailJob.status === 'completed' && (
                      <div className="job-details-footer">
                        <div className="detail-item">
                          <strong>Par :</strong> {emailJob.creatorName || 'Système'}
                        </div>
                        {emailJob.isTest && emailJob.options?.testEmailOverride && (
                          <div className="detail-item">
                            <strong>Vers :</strong> {emailJob.options.testEmailOverride}
                          </div>
                        )}
                        <div className="detail-item">
                          <strong>Résumé :</strong> {emailJob.sentItems} envoyés, {emailJob.failedItems} erreurs, {emailJob.skippedItems} ignorés
                        </div>
                      </div>
                    )}
                    
                    {emailJob.status === 'failed' && emailJob.error && (
                      <div className="job-error-msg">
                        {emailJob.error}
                      </div>
                    )}
                  </div>
                )}

                {emailPreview && (
                  <div className="preview-container glass-panel">
                    <h4>Aperçu du modèle</h4>
                    <div className="preview-subject-line"><strong>Sujet:</strong> {emailPreview.subject}</div>
                    <div className="preview-body-frame" dangerouslySetInnerHTML={{ __html: emailPreview.html }} />
                  </div>
                )}

                <div className="files-selection">
                  <div className="selection-header">
                    <h4>Sélection des élèves</h4>
                    <button className="btn-text" onClick={toggleAllFiles}>
                      {selectedFileIds.length === uniqueFileVersionPairs.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div className="files-grid">
                    {uniqueFileVersionPairs?.map(f => {
                      const instances = getStudentInstances(f.assignmentId, f.version)
                      const hd = instances.find(inst => inst.quality === 'high')
                      const sd = instances.find(inst => inst.quality === 'compressed')
                      
                      return (
                        <div 
                          key={`${f.assignmentId}-${f.version}`} 
                          className={`file-item ${selectedFileIds.includes(f._id) ? 'selected' : ''}`}
                          onClick={() => toggleFile(f._id)}
                        >
                          <div className="file-check">
                            {selectedFileIds.includes(f._id) ? <CheckCircle size={16} /> : <div className="circle-placeholder" />}
                          </div>
                          <div className="file-content">
                            <div className="file-student">
                              {f.firstName} {f.lastName}
                              {f.version > 1 && <span className="version-badge">V{f.version}</span>}
                            </div>
                            <div className="file-meta">{f.level} • {f.className}</div>
                            <div className="file-email-dots">
                              <span className={`email-dot ${f.emails?.father ? 'active' : ''}`} title={f.emails?.father || 'Père: Manquant'}>P</span>
                              <span className={`email-dot ${f.emails?.mother ? 'active' : ''}`} title={f.emails?.mother || 'Mère: Manquant'}>M</span>
                              <span className={`email-dot ${f.emails?.student ? 'active' : ''}`} title={f.emails?.student || 'Élève: Manquant'}>E</span>
                            </div>
                          </div>
                          <div className="file-row-actions" onClick={e => e.stopPropagation()}>
                            {sd && (
                              <a href={downloadFileUrl(sd._id, sd.batchId)} className="btn-icon-small" title="Télécharger SD">
                                <FileDown size={14} /> <span className="quality-label">SD</span>
                              </a>
                            )}
                            {hd && (
                              <a href={downloadFileUrl(hd._id, hd.batchId)} className="btn-icon-small" title="Télécharger HD">
                                <FileDown size={14} /> <span className="quality-label">HD</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Send size={48} className="empty-icon" />
                <p>Sélectionnez un lot dans la bibliothèque pour commencer la distribution.</p>
              </div>
            )}
          </div>
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
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Auteur</th>
                  <th>Destinataire(s)</th>
                  <th>Statut</th>
                  <th>Progression</th>
                </tr>
              </thead>
              <tbody>
                {allJobs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="empty-history">Aucun historique trouvé</td>
                  </tr>
                )}
                {allJobs.map(job => (
                  <tr key={job._id}>
                    <td>{new Date(job.createdAt || job.startedAt).toLocaleString()}</td>
                    <td>
                      <span className={`type-badge ${job.isTest ? 'test' : 'real'}`}>
                        {job.isTest ? 'TEST' : 'ENVOI RÉEL'}
                      </span>
                    </td>
                    <td>{job.creatorName || 'Système'}</td>
                    <td className="recipients-cell">
                      {job.isTest ? (
                        <span className="test-email">{job.options?.testEmailOverride}</span>
                      ) : (
                        <span>{job.totalItems} élèves</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${job.status}`}>
                        {job.status === 'completed' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Échec'}
                      </span>
                    </td>
                    <td>
                      <div className="history-progress">
                        <div className="progress-mini">
                          <div className="progress-mini-fill" style={{ width: `${(job.processedItems / job.totalItems) * 100}%` }} />
                        </div>
                        <span>{job.processedItems}/{job.totalItems}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
