import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../api'

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
  const photoInputRef = useRef<HTMLInputElement>(null)
  const batchPhotoInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  
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

  return (
    <div className="container" style={{ maxWidth: 1600, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="title" style={{ margin: 0 }}>Gestion des Élèves</h2>
        <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => setShowPhotoImport(true)}>
                📸 Import Photos (Batch)
            </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 350px', gap: 24, height: 'calc(100vh - 120px)' }}>
        
        {/* LEFT SIDEBAR: Structure */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Année Scolaire</label>
                <select 
                    value={selectedYearId} 
                    onChange={e => setSelectedYearId(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
                >
                    {years.map(y => (
                        <option key={y._id} value={y._id}>{y.name} {y.active ? '(Active)' : ''}</option>
                    ))}
                </select>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                <div 
                    onClick={() => { setViewUnassigned(true); setSelectedClass(null) }}
                    style={{ 
                        padding: '10px 12px', 
                        borderRadius: 6, 
                        cursor: 'pointer', 
                        background: viewUnassigned ? '#e6f7ff' : 'transparent',
                        color: viewUnassigned ? '#1890ff' : '#333',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 10
                    }}
                >
                    <span style={{ fontWeight: 600 }}>🚫 Non assignés</span>
                    <span className="pill" style={{ background: '#f5f5f5', color: '#666' }}>{groupedStudents.unassigned.length}</span>
                </div>

                {Object.entries(groupedStudents.grouped).map(([level, classes]) => {
                    const classNames = Object.keys(classes).sort()
                    if (classNames.length === 0) return null
                    
                    const isExpanded = expandedLevels.has(level)
                    return (
                        <div key={level} style={{ marginBottom: 4 }}>
                            <div 
                                onClick={() => {
                                    const next = new Set(expandedLevels)
                                    if (next.has(level)) next.delete(level)
                                    else next.add(level)
                                    setExpandedLevels(next)
                                }}
                                style={{ 
                                    padding: '8px 12px', 
                                    cursor: 'pointer', 
                                    fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    color: '#555'
                                }}
                            >
                                <span style={{ fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>
                                {level}
                            </div>
                            
                            {isExpanded && (
                                <div style={{ paddingLeft: 20 }}>
                                    {classNames.map(cls => (
                                        <div 
                                            key={cls}
                                            onClick={() => { setSelectedClass(cls); setViewUnassigned(false) }}
                                            style={{ 
                                                padding: '6px 10px', 
                                                borderRadius: 6, 
                                                cursor: 'pointer',
                                                background: selectedClass === cls && !viewUnassigned ? '#e6f7ff' : 'transparent',
                                                color: selectedClass === cls && !viewUnassigned ? '#1890ff' : '#666',
                                                fontSize: 14,
                                                display: 'flex', justifyContent: 'space-between'
                                            }}
                                        >
                                            <span>{cls}</span>
                                            <span style={{ fontSize: 11, opacity: 0.6 }}>{classes[cls].length}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>

        {/* CENTER: Student Grid */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 20 }}>
                    {viewUnassigned ? '🚫 Élèves non assignés' : selectedClass ? `🏫 ${selectedClass}` : 'Sélectionnez une classe'}
                </div>
                <div style={{ flex: 1 }} />
                <input 
                    placeholder="🔍 Rechercher..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    style={{ padding: '8px 12px', borderRadius: 20, border: '1px solid #ddd', width: 200 }}
                />
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9f9f9' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Chargement...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                        {(viewUnassigned 
                            ? groupedStudents.unassigned 
                            : (selectedClass 
                                ? Object.values(groupedStudents.grouped).flatMap(l => l[selectedClass] || [])
                                : [])
                        ).map(s => (
                            <div 
                                key={s._id}
                                onClick={() => selectStudent(s)}
                                style={{ 
                                    background: '#fff', 
                                    borderRadius: 12, 
                                    padding: 12, 
                                    boxShadow: selectedStudent?._id === s._id ? '0 0 0 2px #1890ff' : '0 2px 8px rgba(0,0,0,0.05)',
                                    cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                                    transition: 'transform 0.1s'
                                }}
                            >
                                <div style={{ 
                                    width: 80, height: 80, borderRadius: '50%', marginBottom: 10,
                                    background: '#f0f0f0', overflow: 'hidden',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {s.avatarUrl ? (
                                        <img src={s.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: 24, opacity: 0.3 }}>👤</span>
                                    )}
                                </div>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.firstName}</div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: '#666' }}>{s.lastName}</div>
                                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{s.logicalKey}</div>
                            </div>
                        ))}
                    </div>
                )}
                
                {!viewUnassigned && !selectedClass && (
                    <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                        <div style={{ fontSize: 40, marginBottom: 10 }}>👈</div>
                        Sélectionnez une classe ou un niveau dans le menu de gauche
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT: Details */}
        <div style={{ height: '100%', overflow: 'hidden' }}>
            {selectedStudent ? (
                <div className="card" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div 
                            style={{ 
                                width: 120, height: 120, borderRadius: '50%', margin: '0 auto 16px',
                                background: '#f0f0f0', overflow: 'hidden', position: 'relative',
                                cursor: 'pointer', border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            onClick={() => photoInputRef.current?.click()}
                        >
                             {selectedStudent.avatarUrl ? (
                                <img src={selectedStudent.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.2 }}>👤</div>
                            )}
                            <div style={{ 
                                position: 'absolute', bottom: 0, left: 0, right: 0, 
                                background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: 4 
                            }}>
                                Modifier
                            </div>
                        </div>
                        <h2 style={{ margin: '0 0 4px' }}>{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                        <div style={{ color: '#666' }}>{selectedStudent.className || 'Non assigné'}</div>
                    </div>
                    
                    <input type="file" ref={photoInputRef} style={{ display: 'none' }} accept="image/*" onChange={handlePhotoUpload} />

                    <div style={{ display: 'grid', gap: 16 }}>
                        <div className="card" style={{ background: '#f9f9f9', padding: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Informations</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                                <div>
                                    <div style={{ color: '#666' }}>Date de naissance</div>
                                    <div>{new Date(selectedStudent.dateOfBirth).toLocaleDateString()}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#666' }}>ID</div>
                                    <div style={{ wordBreak: 'break-all' }}>{selectedStudent.logicalKey}</div>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <div style={{ color: '#666' }}>Parent</div>
                                    <div>{selectedStudent.parentName} {selectedStudent.parentPhone && `(${selectedStudent.parentPhone})`}</div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ background: '#f9f9f9', padding: 12 }}>
                             <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Historique</div>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {studentHistory.map((h, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                                        <div>
                                            <div>{h.year}</div>
                                            <div style={{ color: '#666', fontSize: 11 }}>{h.className}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div className={`pill ${h.promotionStatus === 'promoted' ? 'green' : h.promotionStatus === 'retained' ? 'red' : 'grey'}`} style={{ fontSize: 10 }}>
                                                {h.promotionStatus}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {studentHistory.length === 0 && <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic' }}>Aucun historique</div>}
                             </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', textAlign: 'center' }}>
                    <div>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                        Sélectionnez un élève pour voir les détails
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* BATCH IMPORT MODAL */}
      {showPhotoImport && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setShowPhotoImport(false)}>
            <div 
                style={{ 
                    background: '#fff', borderRadius: 16, padding: 32, width: 600, maxWidth: '90vw',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <h2 style={{ marginTop: 0 }}>Importation de photos en masse</h2>
                
                <div style={{ marginBottom: 24, background: '#f0f7ff', padding: 16, borderRadius: 8, border: '1px solid #bae7ff' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#0050b3' }}>Instructions</h4>
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#333', lineHeight: 1.6 }}>
                        <li>Préparez vos photos au format <strong>.jpg</strong> ou <strong>.png</strong>.</li>
                        <li>Nommez chaque fichier selon l'un de ces formats :
                            <ul style={{ marginTop: 4 }}>
                                <li><code>Prénom Nom.jpg</code> (ex: Jean Dupont.jpg)</li>
                                <li><code>Prénom_Nom.jpg</code> (ex: Jean_Dupont.jpg)</li>
                                <li><code>ID_Unique.jpg</code> (ex: jean_dupont_2015-05-20.jpg)</li>
                            </ul>
                        </li>
                        <li>Sélectionnez tous les fichiers et créez une archive <strong>ZIP</strong>.</li>
                        <li>Déposez le fichier ZIP ci-dessous.</li>
                    </ol>
                </div>

                <div 
                    ref={dropZoneRef}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => batchPhotoInputRef.current?.click()}
                    style={{
                        border: `2px dashed ${dragActive ? '#1890ff' : '#ccc'}`,
                        borderRadius: 12,
                        padding: 40,
                        textAlign: 'center',
                        background: dragActive ? '#f0f9ff' : '#fafafa',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        marginBottom: 20
                    }}
                >
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                        {loading ? 'Traitement en cours...' : 'Glissez-déposez votre fichier ZIP ici'}
                    </div>
                    <div style={{ color: '#666' }}>ou cliquez pour sélectionner</div>
                    <input 
                        type="file" 
                        accept=".zip" 
                        ref={batchPhotoInputRef} 
                        style={{ display: 'none' }} 
                        onChange={e => {
                            if (e.target.files && e.target.files[0]) processBatchFile(e.target.files[0])
                        }}
                    />
                </div>

                {importReport && (
                    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 16 }}>
                        <div style={{ fontWeight: 600, color: '#389e0d', marginBottom: 8 }}>Rapport d'importation</div>
                        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                            <div>✅ Succès: <strong>{importReport.success}</strong></div>
                            <div>❌ Échecs: <strong>{importReport.failed}</strong></div>
                        </div>
                        {importReport.report.length > 0 && (
                            <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 12, border: '1px solid #eee', background: '#fff' }}>
                                {importReport.report.map((r: any, i: number) => (
                                    <div key={i} style={{ padding: '4px 8px', borderBottom: '1px solid #f5f5f5', color: r.status === 'matched' ? 'green' : 'red', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{r.filename}</span>
                                        <span>{r.status === 'matched' ? 'OK' : 'Introuvable'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                <div style={{ marginTop: 24, textAlign: 'right' }}>
                    <button className="btn secondary" onClick={() => setShowPhotoImport(false)}>Fermer</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
