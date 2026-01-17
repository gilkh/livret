import { UploadCloud, FileArchive, CheckCircle, XCircle, File } from 'lucide-react'
import { useRef } from 'react'
import api from '../../api'

interface FileDropZoneProps {
  onFileSelect: (file: File) => void
  isDragActive: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  loading: boolean
  importReport: any
  onUpdateReport?: React.Dispatch<React.SetStateAction<any>>
  onClose: () => void
}

export default function FileDropZone({
  onFileSelect,
  isDragActive,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  loading,
  importReport,
  onUpdateReport,
  onClose
}: FileDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
        <div 
            style={{ 
                background: '#fff', borderRadius: 24, padding: 0, width: 600, maxWidth: '90vw',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
        >
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Importation de photos en masse</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <XCircle size={24} />
              </button>
            </div>
            
            <div style={{ padding: 32 }}>
              {!importReport ? (
                <>
                  <div style={{ marginBottom: 24, background: '#f0f9ff', padding: 20, borderRadius: 12, border: '1px solid #bae6fd' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: '#0ea5e9', color: 'white', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>i</div>
                        Instructions
                      </h4>
                      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                          <li>Préparez vos photos au format <strong>.jpg</strong> ou <strong>.png</strong>.</li>
                          <li>Placez-les dans des dossiers <strong>niveau</strong> puis <strong>classe</strong> (ex: <code>Photos Maternelles/Maternelles/MS/MS A</code>).</li>
                          <li>Nommez chaque fichier selon l'un de ces formats :
                              <ul style={{ marginTop: 4, marginBottom: 4, color: '#475569' }}>
                                  <li><code>Prénom Nom.jpg</code></li>
                                  <li><code>Prénom_Nom.jpg</code></li>
                                  <li><code>ID_Unique.jpg</code></li>
                              </ul>
                          </li>
                          <li>Compressez les fichiers dans une archive <strong>ZIP</strong> ou <strong>RAR</strong>.</li>
                      </ol>
                  </div>

                  <div 
                      onDragEnter={onDragEnter}
                      onDragLeave={onDragLeave}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onClick={() => !loading && fileInputRef.current?.click()}
                      style={{
                          border: `2px dashed ${isDragActive ? '#6c5ce7' : '#cbd5e1'}`,
                          borderRadius: 16,
                          padding: 48,
                          textAlign: 'center',
                          background: isDragActive ? '#f5f3ff' : '#f8fafc',
                          cursor: loading ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                          marginBottom: 0,
                          position: 'relative'
                      }}
                  >
                      {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div className="spinner" style={{ marginBottom: 16 }}></div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Traitement en cours...</div>
                          <div style={{ fontSize: 14, color: '#64748b' }}>Cela peut prendre quelques instants</div>
                        </div>
                      ) : (
                        <>
                          <div style={{ 
                            width: 64, height: 64, background: isDragActive ? '#ede9fe' : '#e2e8f0', 
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px', color: isDragActive ? '#6c5ce7' : '#64748b',
                            transition: 'all 0.2s'
                          }}>
                            <UploadCloud size={32} />
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>
                              Glissez-déposez votre fichier ZIP/RAR
                          </div>
                          <div style={{ color: '#64748b', fontSize: 14 }}>ou cliquez pour parcourir vos fichiers</div>
                        </>
                      )}
                      
                      <input 
                          type="file" 
                          accept=".zip,.rar" 
                          ref={fileInputRef} 
                          style={{ display: 'none' }} 
                          disabled={loading}
                          onChange={e => {
                              if (e.target.files && e.target.files[0]) onFileSelect(e.target.files[0])
                          }}
                      />
                  </div>
                </>
              ) : (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ width: 60, height: 60, background: '#dcfce7', borderRadius: '50%', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <CheckCircle size={32} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Importation terminée</h3>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>Voici le résumé de l'opération</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{importReport.success}</div>
                      <div style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>Photos importées</div>
                    </div>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{importReport.failed}</div>
                      <div style={{ fontSize: 13, color: '#b91c1c', fontWeight: 500 }}>Échecs</div>
                    </div>
                  </div>

                  {importReport.report.length > 0 && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                          Détails des fichiers
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', background: '#fff' }}>
                            {importReport.report.map((r: any, i: number) => (
                                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <FileArchive size={14} color="#94a3b8" />
                                        <span style={{ color: '#334155' }}>{r.filename}</span>
                                      </div>
                                      {r.status === 'matched' ? (
                                        <span className="pill green" style={{ fontSize: 11, padding: '2px 8px' }}>✓ {r.student}</span>
                                      ) : r.status === 'needs_review' && r.reason === 'multiple_matches' ? (
                                        <span className="pill orange" style={{ fontSize: 11, padding: '2px 8px', background: '#fef3c7', color: '#b45309' }}>Plusieurs élèves</span>
                                      ) : r.status === 'needs_review' ? (
                                        <span className="pill orange" style={{ fontSize: 11, padding: '2px 8px', background: '#ffedd5', color: '#9a3412' }}>À valider</span>
                                      ) : r.status === 'invalid_class' ? (
                                        <span className="pill red" style={{ fontSize: 11, padding: '2px 8px' }}>Classe introuvable</span>
                                      ) : (
                                        <span className="pill red" style={{ fontSize: 11, padding: '2px 8px' }}>Introuvable</span>
                                      )}
                                    </div>
                                    {(r.className || r.level || r.reason || r.expectedClass || r.foundClass) && (
                                      <div style={{ marginTop: 6, marginLeft: 24, fontSize: 12, color: '#64748b' }}>
                                        {r.level && <div>Niveau: <strong>{r.level}</strong></div>}
                                        {r.className && <div>Classe: <strong>{r.className}</strong></div>}
                                        {r.reason && <div>Raison: <strong>{r.reason}</strong></div>}
                                        {r.expectedClass && <div>Classe attendue: <strong>{r.expectedClass}</strong></div>}
                                        {r.foundClass && <div>Classe trouvée: <strong>{r.foundClass}</strong></div>}
                                      </div>
                                    )}
                                    {(r.status === 'no_match' || r.status === 'needs_review') && r.similarStudents && r.similarStudents.length > 0 && (
                                      <div style={{ marginTop: 8, marginLeft: 24, padding: '8px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                                        <div style={{ color: '#92400e', fontWeight: 500, marginBottom: 4 }}>Élèves similaires :</div>
                                        {r.similarStudents.map((s: any, j: number) => (
                                          <div key={j} style={{ color: '#78350f', padding: '2px 0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <span>• {s.name}{s.birthYear ? ` (${s.birthYear})` : ''}{s.className ? ` — ${s.className}` : ''}</span>
                                              {r.pendingId && (
                                                <button
                                                  onClick={async () => {
                                                    try {
                                                      await api.post('/media/confirm-photo', { pendingId: r.pendingId, studentId: s._id })
                                                      onUpdateReport?.((prev: any) => {
                                                        if (!prev?.report) return prev
                                                        const nextReport = [...prev.report]
                                                        const current = { ...nextReport[i] }
                                                        current.status = 'matched'
                                                        current.student = s.name
                                                        current.similarStudents = []
                                                        nextReport[i] = current
                                                        return { ...prev, report: nextReport }
                                                      })
                                                    } catch (e) {
                                                      alert('Erreur lors de la validation')
                                                    }
                                                  }}
                                                  style={{
                                                    padding: '2px 8px',
                                                    borderRadius: 6,
                                                    border: '1px solid #f59e0b',
                                                    background: '#fff7ed',
                                                    color: '#9a3412',
                                                    fontSize: 11,
                                                    cursor: 'pointer'
                                                  }}
                                                >
                                                  Utiliser
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </div>
                            ))}
                        </div>
                      </div>
                  )}

                  <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                    <button className="btn secondary" style={{ flex: 1 }} onClick={onClose}>Fermer</button>
                  </div>
                </div>
              )}
            </div>
        </div>
    </div>
  )
}
