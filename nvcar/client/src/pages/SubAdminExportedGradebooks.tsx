import { useEffect, useState } from 'react'
import { FileDown, RefreshCcw, Mail, Eye, Archive, CheckCircle2, XCircle, AlertCircle, Send, CheckSquare, Square, FolderArchive, MailPlus, Trash2 } from 'lucide-react'
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
  const [activeFileForTest, setActiveFileForTest] = useState<string | null>(null)
  const [testEmailValue, setTestEmailValue] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)

  const token = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
  const selectedBatch = batches.find((batch) => batch._id === selectedBatchId) || null
  const filteredBatchFiles = selectedBatch
    ? selectedBatch.files.filter((file) => {
      if (scopeLevel && String(file.level || '') !== scopeLevel) return false
      if (scopeClassName && String(file.className || '') !== scopeClassName) return false
      if (scopeStudentId && String(file._id) !== scopeStudentId) return false
      return true
    })
    : []
  const levelOptions = selectedBatch
    ? Array.from(new Set(selectedBatch.files.map((file) => String(file.level || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
    : []
  const classOptions = selectedBatch
    ? Array.from(new Set(selectedBatch.files
      .filter((file) => !scopeLevel || String(file.level || '') === scopeLevel)
      .map((file) => String(file.className || '').trim())
      .filter(Boolean))).sort((a, b) => a.localeCompare(b))
    : []
  const studentOptions = selectedBatch
    ? selectedBatch.files.filter((file) => {
      if (scopeLevel && String(file.level || '') !== scopeLevel) return false
      if (scopeClassName && String(file.className || '') !== scopeClassName) return false
      return true
    })
    : []

  const loadBatches = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get('/gradebook-exports/batches')
      const nextBatches = Array.isArray(response.data) ? response.data : []
      setBatches(nextBatches)
      if (nextBatches.length > 0 && !selectedBatchId) setSelectedBatchId(nextBatches[0]._id)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de charger les exports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBatches() }, [])

  useEffect(() => {
    if (!selectedBatch) {
      setSelectedFileIds([])
      setScopeLevel('')
      setScopeClassName('')
      setScopeStudentId('')
      return
    }
    setSelectedFileIds(selectedBatch.files.map((file) => file._id))
    loadJobHistory(selectedBatchId)
  }, [selectedBatchId])

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
    if (!selectedBatch) return
    setSelectedFileIds(filteredBatchFiles.map((file) => file._id))
  }

  const previewEmail = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return
    try {
      setPreviewLoading(true)
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/email-preview`, { selectedFileIds, includeFather, includeMother, includeStudent, customMessage })
      setEmailPreview(response.data)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur aperçu')
    } finally { setPreviewLoading(false) }
  }

  const sendEmails = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return
    try {
      setSendLoading(true)
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/send`, { selectedFileIds, includeFather, includeMother, includeStudent, customMessage })
      setJobId(response.data.jobId)
      setEmailJob(null)
      loadJobHistory(selectedBatch._id)
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur envoi') } finally { setSendLoading(false) }
  }

  const downloadFileUrl = (fileId: string) => {
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/gradebook-exports/batches/${selectedBatchId}/files/${fileId}/download${query}`
  }

  const downloadSelectedFiles = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return
    setZipDownloadLoading(true)
    try {
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/download`, { selectedFileIds }, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedBatch.groupLabel || 'exports'}.zip`
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
      const res = await api.delete(`/gradebook-exports/batches/${selectedBatchId}/files/${fileId}`)
      if (res.data.batchDeleted) {
        setBatches(current => current.filter(b => b._id !== selectedBatchId))
        setSelectedBatchId('')
      } else {
        setBatches(current => current.map(b => b._id === selectedBatchId ? { ...b, exportedCount: Math.max(0, b.exportedCount - 1), files: b.files.filter(f => f._id !== fileId) } : b))
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
      await api.post(`/gradebook-exports/batches/${selectedBatch._id}/send`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        customMessage,
        testEmailOverride: testEmailValue // New parameter
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
        <button className="btn btn-icon" onClick={loadBatches} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 24, padding: '16px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="main-workspace-grid">
        {/* COLUMN 1: NAVIGATION / BATCHES */}
        <aside className="workspace-column sidebar">
          <div className="glass-card full-height">
            <div className="card-header">
              <Archive size={18} />
              <div className="card-title">Bibliothèque</div>
            </div>
            <div className="batch-list scrollable" style={{ padding: 12 }}>
              {loading && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Chargement...</div>}
              {!loading && batches.length === 0 && (
                <div className="empty-state mini">
                  <FolderArchive size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <span>Aucun export</span>
                </div>
              )}
              {batches.map((batch) => {
                const selected = batch._id === selectedBatchId
                return (
                  <button
                    key={batch._id}
                    onClick={() => setSelectedBatchId(batch._id)}
                    className={`batch-item compact ${selected ? 'active' : ''}`}
                  >
                    <div className="batch-label">{batch.groupLabel || batch.archiveFileName}</div>
                    <div className="batch-meta-row">
                      {batch.yearName && <span>{batch.yearName}</span>}
                      {batch.semester && <span>• {batch.semester}</span>}
                    </div>
                    <div className="batch-footer">
                      <span className="batch-date-small">{new Date(batch.createdAt).toLocaleDateString()}</span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span className="count-tag">{batch.exportedCount}</span>
                        <button className="btn-delete-xsmall" onClick={(e) => deleteBatch(batch._id, e)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </button>
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
                <div className="card-title">Contenu du lot</div>
                {selectedBatch && (
                  <span className="batch-badge-title">
                    {selectedBatch.groupLabel || selectedBatch.archiveFileName}
                  </span>
                )}
              </div>
              {selectedBatch && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-action-small" onClick={() => setSelectedFileIds(selectedBatch.files.map((file) => file._id))} title="Tout sélectionner">
                    <CheckSquare size={14} /> Tout
                  </button>
                  <button className="btn-action-small" onClick={() => setSelectedFileIds([])} title="Tout désélectionner">
                    <Square size={14} /> Aucun
                  </button>
                  <button className="btn-action-small shiny" onClick={downloadSelectedFiles} disabled={selectedFileIds.length === 0 || zipDownloadLoading}>
                    <Archive size={14} /> {zipDownloadLoading ? '...' : `ZIP (${selectedFileIds.length})`}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-column" style={{ flex: 1, minHeight: 0 }}>
              {!selectedBatch ? (
                <div className="empty-state">
                  <FolderArchive className="empty-state-icon" />
                  <p>Sélectionnez un lot dans la bibliothèque pour gérer les carnets.</p>
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
                              <div className="file-card-name">{`${file.firstName} ${file.lastName}`}</div>
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
                            <a href={downloadFileUrl(file._id)} className="btn-text" download={file.fileName}>
                              <FileDown size={14} /> Download
                            </a>
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

                  <div className="config-section">
                    <h3 className="section-title">Message personnalisé</h3>
                    <textarea
                      className="modern-textarea compact"
                      style={{ minHeight: 80 }}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Ajoutez une note personnelle à l'email..."
                    />
                  </div>

                  <div className="action-footer">
                    <button className="btn secondary" onClick={previewEmail} disabled={!selectedBatch || selectedFileIds.length === 0 || previewLoading}>
                      {previewLoading ? <RefreshCcw size={16} className="spin" /> : <Eye size={16} />} Aperçu
                    </button>
                    <button className="btn btn-shiny" style={{ flex: 1 }} onClick={sendEmails} disabled={!selectedBatch || selectedFileIds.length === 0 || sendLoading}>
                      {sendLoading ? <RefreshCcw size={16} className="spin" /> : <Send size={16} />} 
                      Lancer ({selectedFileIds.length})
                    </button>
                  </div>

                  <div className="config-section test-panel">
                    <h3 className="section-title">Test de distribution</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input 
                        type="email" 
                        className="modern-input compact" 
                        placeholder="Email de destination..." 
                        value={testEmailValue}
                        onChange={(e) => setTestEmailValue(e.target.value)}
                      />
                      <button 
                        className="btn secondary compact" 
                        onClick={sendTestEmails}
                        disabled={testLoading || !testEmailValue || selectedFileIds.length === 0}
                      >
                        {testLoading ? '...' : 'Tester'}
                      </button>
                    </div>
                    {testSuccess && (
                      <div className="test-success-banner">
                        <CheckCircle2 size={14} /> Envoi de test initié !
                      </div>
                    )}
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
                              <span className="history-user">{job.creatorName}</span>
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
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

    </div>
  )
}
