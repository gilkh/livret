import { useEffect, useState } from 'react'
import { FileDown, RefreshCcw, Mail, Eye, Archive, CheckCircle2, XCircle, AlertCircle, Send, CheckSquare, Square, FolderArchive, MailPlus } from 'lucide-react'
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
}

export default function SubAdminExportedGradebooks() {
  const [batches, setBatches] = useState<ExportedBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [activePreviewFileId, setActivePreviewFileId] = useState('')
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
  const [debugInfo, setDebugInfo] = useState('init...')

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
  const selectedFiles = selectedBatch
    ? selectedBatch.files.filter((file) => selectedFileIds.includes(file._id))
    : []
  const activePreviewFile = selectedBatch?.files.find((file) => file._id === activePreviewFileId) || selectedFiles[0] || filteredBatchFiles[0] || selectedBatch?.files[0] || null
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
      setDebugInfo('Fetching /gradebook-exports/batches ...')
      const response = await api.get('/gradebook-exports/batches')
      const contentType = response.headers?.['content-type'] || 'unknown'
      const isArray = Array.isArray(response.data)
      const dataLen = isArray ? response.data.length : typeof response.data
      setDebugInfo(`OK status=${response.status} contentType=${contentType} isArray=${isArray} count=${dataLen} token=${token ? token.substring(0, 15) + '...' : 'NONE'}`)
      console.log('[DEBUG] Fetched batches:', response.data)
      const nextBatches = Array.isArray(response.data) ? response.data : []
      setBatches(nextBatches)

      if (nextBatches.length > 0) {
        const firstBatch = nextBatches[0]
        setSelectedBatchId((current) => nextBatches.some((batch: ExportedBatch) => batch._id === current) ? current : firstBatch._id)
      } else {
        setSelectedBatchId('')
      }
    } catch (e: any) {
      console.error('[DEBUG] Fetch batches error:', e)
      const errStatus = e.response?.status || 'no_response'
      const errData = e.response?.data ? JSON.stringify(e.response.data).substring(0, 200) : 'no_data'
      const errMsg = e.message || 'unknown'
      setDebugInfo(`ERROR status=${errStatus} message=${errMsg} data=${errData} token=${token ? token.substring(0, 15) + '...' : 'NONE'}`)
      setError(e.response?.data?.message || e.message || 'Impossible de charger les exports PDF')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBatches()
  }, [])

  useEffect(() => {
    if (!selectedBatch) {
      setSelectedFileIds([])
      setActivePreviewFileId('')
      setScopeLevel('')
      setScopeClassName('')
      setScopeStudentId('')
      return
    }

    setSelectedFileIds(selectedBatch.files.map((file) => file._id))
    setActivePreviewFileId(selectedBatch.files[0]?._id || '')
    setScopeLevel('')
    setScopeClassName('')
    setScopeStudentId('')
    setEmailPreview(null)
    setEmailJob(null)
    setJobId('')
  }, [selectedBatchId])

  useEffect(() => {
    if (!jobId) return

    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.get(`/gradebook-exports/email-jobs/${jobId}`)
        setEmailJob(response.data)
        if (response.data?.status === 'completed' || response.data?.status === 'failed') {
          window.clearInterval(intervalId)
        }
      } catch {
        window.clearInterval(intervalId)
      }
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [jobId])

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) => {
      if (current.includes(fileId)) {
        const next = current.filter((id) => id !== fileId)
        if (activePreviewFileId === fileId) {
          setActivePreviewFileId(next[0] || '')
        }
        return next
      }
      return [...current, fileId]
    })
  }

  const selectScopeFiles = () => {
    if (!selectedBatch) return
    const scopedIds = filteredBatchFiles.map((file) => file._id)
    setSelectedFileIds(scopedIds)
    setActivePreviewFileId(scopedIds[0] || '')
  }

  const previewEmail = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return

    try {
      setPreviewLoading(true)
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/email-preview`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        customMessage
      })
      setEmailPreview(response.data)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de préparer l\'aperçu email')
    } finally {
      setPreviewLoading(false)
    }
  }

  const sendEmails = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return

    try {
      setSendLoading(true)
      setError('')
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/send`, {
        selectedFileIds,
        includeFather,
        includeMother,
        includeStudent,
        customMessage
      })
      setJobId(response.data.jobId)
      setEmailJob(null)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible d\'envoyer les emails')
    } finally {
      setSendLoading(false)
    }
  }

  const batchPdfUrl = (fileId: string) => {
    if (!selectedBatchId || !fileId) return ''
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/gradebook-exports/batches/${selectedBatchId}/files/${fileId}/pdf${query}`
  }

  const downloadFileUrl = (fileId: string) => {
    if (!selectedBatchId || !fileId) return ''
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/gradebook-exports/batches/${selectedBatchId}/files/${fileId}/download${query}`
  }

  const downloadSelectedFiles = async () => {
    if (!selectedBatch || selectedFileIds.length === 0) return
    try {
      setZipDownloadLoading(true)
      setError('')
      const response = await api.post(`/gradebook-exports/batches/${selectedBatch._id}/download`, {
        selectedFileIds,
      }, { responseType: 'blob' })

      const disposition = String(response.headers?.['content-disposition'] || '')
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^";]+)\"?/i)
      const encodedName = match?.[1]
      const plainName = match?.[2]
      const fileName = encodedName ? decodeURIComponent(encodedName) : (plainName || `${selectedBatch.groupLabel || 'exports'}.zip`)

      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de télécharger la sélection')
    } finally {
      setZipDownloadLoading(false)
    }
  }

  return (
    <div className="exports-container">
      {/* TEMPORARY DEBUG BANNER - REMOVE AFTER DEBUGGING */}
      <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: 'monospace', fontSize: 13, color: '#92400e', wordBreak: 'break-all' }}>
        <strong>🐛 DEBUG:</strong> {debugInfo}
      </div>

      <div className="exports-header">
        <div>
          <h1 className="exports-title">Exports PDF</h1>
          <p className="exports-subtitle">
            Bibliothèque des carnets exportés sur le serveur, avec aperçu PDF, préparation d'email et envoi groupé.
          </p>
        </div>
        <button className="btn btn-icon" onClick={loadBatches} style={{ whiteSpace: 'nowrap' }} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'spin' : ''} />
          Actualiser
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 24, padding: '16px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div className="glass-card">
          <div className="card-header">
            <Archive size={20} />
            <div>
              <div className="card-title">Lots sauvegardés</div>
              <div className="card-subtitle">Carnets exportés récemment</div>
            </div>
          </div>
          <div className="batch-list">
            {loading && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Chargement...</div>}
            {!loading && batches.length === 0 && (
              <div className="empty-state" style={{ padding: 24, border: 'none' }}>
                <FolderArchive size={32} className="empty-state-icon" style={{ opacity: 0.3, marginBottom: 12 }} />
                <span style={{ fontSize: 13 }}>Aucun export sauvegardé.</span>
              </div>
            )}
            {batches.map((batch) => {
              const selected = batch._id === selectedBatchId
              return (
                <button
                  key={batch._id}
                  onClick={() => setSelectedBatchId(batch._id)}
                  className={`batch-item ${selected ? 'active' : ''}`}
                >
                  <div className="batch-label">{batch.groupLabel || batch.archiveFileName}</div>
                  <div className="batch-date">
                    {new Date(batch.createdAt).toLocaleString()}
                  </div>
                  <div className="badge-group">
                    <span className="badge blue">
                      {batch.exportedCount} PDF
                    </span>
                    {batch.failedCount > 0 && (
                      <span className="badge red">
                        {batch.failedCount} erreur(s)
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(400px, 0.85fr)', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="glass-card">
              <div className="card-header">
                <FileDown size={20} />
                <div>
                  <div className="card-title">PDF enregistrés</div>
                  <div className="card-subtitle">Sélectionnez et filtrez les fichiers du lot</div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                {!selectedBatch ? (
                  <div className="empty-state">
                    <FolderArchive className="empty-state-icon" />
                    Choisissez un lot à gauche pour voir les fichiers.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                        {selectedBatch.groupLabel || selectedBatch.archiveFileName}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn secondary" onClick={() => setSelectedFileIds(selectedBatch.files.map((file) => file._id))} title="Tout sélectionner">
                          <CheckSquare size={16} /> Tous
                        </button>
                        <button className="btn secondary" onClick={selectScopeFiles} disabled={filteredBatchFiles.length === 0} title="Sélectionner les résultats du filtre">
                          Filtrés
                        </button>
                        <button className="btn secondary" onClick={() => setSelectedFileIds([])} title="Tout désélectionner">
                          <Square size={16} /> Aucun
                        </button>
                        <button className="btn btn-icon btn-shiny" onClick={downloadSelectedFiles} disabled={selectedFileIds.length === 0 || zipDownloadLoading} style={{ marginLeft: 8 }}>
                          <Archive size={16} />
                          {zipDownloadLoading ? 'ZIP...' : `ZIP (${selectedFileIds.length})`}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                      <select value={scopeLevel} onChange={(e) => { setScopeLevel(e.target.value); setScopeClassName(''); setScopeStudentId('') }} className="modern-select">
                        <option value="">Tous les niveaux</option>
                        {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>

                      <select value={scopeClassName} onChange={(e) => { setScopeClassName(e.target.value); setScopeStudentId('') }} className="modern-select">
                        <option value="">Toutes les classes</option>
                        {classOptions.map((className) => <option key={className} value={className}>{className}</option>)}
                      </select>

                      <select value={scopeStudentId} onChange={(e) => setScopeStudentId(e.target.value)} className="modern-select">
                        <option value="">Tous les élèves</option>
                        {studentOptions.map((file) => <option key={file._id} value={file._id}>{`${file.firstName} ${file.lastName}`.trim()}</option>)}
                      </select>
                    </div>

                    <div className="file-list">
                      {filteredBatchFiles.length === 0 && (
                        <div className="empty-state">
                          Aucun PDF correspondant à ce filtre.
                        </div>
                      )}
                      {filteredBatchFiles.map((file) => {
                        const checked = selectedFileIds.includes(file._id)
                        const recipientCount = [file.emails?.father, file.emails?.mother, file.emails?.student].filter(Boolean).length
                        return (
                          <div key={file._id} className={`file-item ${activePreviewFileId === file._id ? 'active' : ''}`}>
                            <input type="checkbox" className="file-item-checkbox" checked={checked} onChange={() => toggleFileSelection(file._id)} />
                            <div className="file-item-info">
                              <div className="file-item-name">{`${file.firstName} ${file.lastName}`}</div>
                              <div className="file-item-meta">
                                {file.yearName || 'Année ?'} · {file.level || 'Niveau ?'} · {file.className || 'Classe ?'}
                              </div>
                              <div className="file-item-filename">{file.fileName}</div>
                            </div>
                            <div className="file-item-actions">
                              <button className="btn secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setActivePreviewFileId(file._id)}>
                                <Eye size={14} /> Aperçu
                              </button>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: recipientCount > 0 ? '#166534' : '#b91c1c', background: recipientCount > 0 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 12 }}>
                                <Mail size={12} /> {recipientCount}
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

            <section className="glass-card">
              <div className="card-header">
                <Eye size={20} />
                <div>
                  <div className="card-title">Aperçu PDF</div>
                  <div className="card-subtitle">Visualisation du fichier sélectionné</div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                {activePreviewFile ? (
                  <div className="pdf-preview-container">
                    <iframe
                      title={activePreviewFile.fileName}
                      src={batchPdfUrl(activePreviewFile._id)}
                      className="pdf-preview-iframe"
                    />
                  </div>
                ) : (
                  <div className="empty-state">
                    <Eye className="empty-state-icon" />
                    Sélectionnez "Aperçu" sur un fichier pour le visualiser.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="glass-card">
              <div className="card-header">
                <MailPlus size={20} />
                <div>
                  <div className="card-title">Préparation de l'email</div>
                  <div className="card-subtitle">Configurer l'envoi groupé</div>
                </div>
              </div>
              <div style={{ padding: 20, display: 'grid', gap: 20 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label className={`checkbox-label ${includeFather ? 'checked' : ''}`}>
                    <input type="checkbox" className="file-item-checkbox" checked={includeFather} onChange={(e) => setIncludeFather(e.target.checked)} />
                    <span style={{ fontWeight: 500 }}>Envoyer au père</span>
                  </label>
                  <label className={`checkbox-label ${includeMother ? 'checked' : ''}`}>
                    <input type="checkbox" className="file-item-checkbox" checked={includeMother} onChange={(e) => setIncludeMother(e.target.checked)} />
                    <span style={{ fontWeight: 500 }}>Envoyer à la mère</span>
                  </label>
                  <label className={`checkbox-label ${includeStudent ? 'checked' : ''}`}>
                    <input type="checkbox" className="file-item-checkbox" checked={includeStudent} onChange={(e) => setIncludeStudent(e.target.checked)} />
                    <span style={{ fontWeight: 500 }}>Envoyer à l'élève</span>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 10, fontWeight: 600, color: '#1e293b' }}>Message complémentaire</label>
                  <textarea
                    className="modern-textarea"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Ce message sera inséré dans l'email envoyé, en dessous des détails de l'élève..."
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button className="btn secondary btn-icon" style={{ flex: 1 }} onClick={previewEmail} disabled={!selectedBatch || selectedFileIds.length === 0 || previewLoading}>
                    {previewLoading ? <RefreshCcw size={18} className="spin" /> : <Eye size={18} />}
                    Générer un Aperçu
                  </button>
                  <button className="btn btn-icon btn-shiny" style={{ flex: 1 }} onClick={sendEmails} disabled={!selectedBatch || selectedFileIds.length === 0 || sendLoading}>
                    {sendLoading ? <RefreshCcw size={18} className="spin" /> : <Send size={18} />}
                    Lancer l'envoi ({selectedFileIds.length})
                  </button>
                </div>
              </div>
            </section>

            <section className="glass-card">
              <div className="card-header">
                <Eye size={20} />
                <div>
                  <div className="card-title">Aperçu du modèle d'email</div>
                  <div className="card-subtitle">Exemple généré basé sur le premier fichier sélectionné</div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                {!emailPreview ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <MailPlus className="empty-state-icon" />
                    Cliquez sur "Générer un Aperçu" pour visualiser.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Objet</div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{emailPreview.subject}</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                      <span className="badge blue">
                        {emailPreview.selectedFileCount} Fichiers sélectionnés
                      </span>
                      <span className="badge green">
                        {emailPreview.totalRecipientCount} Destinataires totaux
                      </span>
                    </div>

                    <div style={{ padding: 12, background: '#fffbeb', borderRadius: 10, border: '1px solid #fef3c7', fontSize: 13, color: '#92400e' }}>
                      <strong>Exemple de destinataires:</strong> {emailPreview.sampleRecipients.length > 0 ? emailPreview.sampleRecipients.join(', ') : 'Aucun email valide pour cet élève !'}
                    </div>

                    <div
                      className="email-preview-box"
                      dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                    />
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card">
              <div className="card-header">
                <Send size={20} />
                <div>
                  <div className="card-title">Suivi des Envois</div>
                  <div className="card-subtitle">Progression en temps réel</div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                {!emailJob ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <CheckCircle2 className="empty-state-icon" />
                    Lancez l'envoi pour suivre la progression ici.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 20 }}>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                        <span>Progression: {emailJob.processedItems}/{emailJob.totalItems}</span>
                        <span style={{ 
                          textTransform: 'uppercase', 
                          fontSize: 12, 
                          color: emailJob.status === 'completed' ? '#16a34a' : emailJob.status === 'failed' ? '#dc2626' : '#2563eb'
                        }}>
                          {emailJob.status === 'running' ? 'En cours...' : emailJob.status === 'completed' ? 'Terminé' : emailJob.status === 'failed' ? 'Échec' : 'En attente'}
                        </span>
                      </div>
                      <div className="progress-bar-container">
                        <div 
                          className="progress-bar-fill" 
                          style={{ width: `${emailJob.totalItems > 0 ? (emailJob.processedItems / emailJob.totalItems) * 100 : 0}%`, background: emailJob.status === 'completed' ? 'linear-gradient(90deg, #10b981, #34d399)' : undefined }} 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span className="badge green"><CheckCircle2 size={14} /> {emailJob.sentItems} Envoyés</span>
                      <span className="badge amber"><AlertCircle size={14} /> {emailJob.skippedItems} Ignorés</span>
                      <span className="badge red"><XCircle size={14} /> {emailJob.failedItems} Échecs</span>
                    </div>

                    {emailJob.error && (
                      <div style={{ color: '#b91c1c', fontSize: 13, background: '#fef2f2', padding: 12, borderRadius: 10 }}>
                        <strong>Erreur globale:</strong> {emailJob.error}
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: 10, maxHeight: 300, overflow: 'auto', paddingRight: 4 }}>
                      {emailJob.items.map((item) => (
                        <div key={item.fileId} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <strong style={{ fontSize: 14, color: '#0f172a' }}>{item.studentName || 'Élève inconnu'}</strong>
                            <span className={`badge ${item.status === 'sent' ? 'green' : item.status === 'failed' ? 'red' : item.status === 'skipped' ? 'amber' : 'blue'}`}>
                              {item.status === 'sent' ? 'Envoyé' : item.status === 'failed' ? 'Échec' : item.status === 'skipped' ? 'Ignoré' : 'En attente'}
                            </span>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Mail size={12} />
                            {item.recipients.length > 0 ? item.recipients.join(', ') : 'Aucun email'}
                          </div>
                          {item.error && (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                              {item.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
