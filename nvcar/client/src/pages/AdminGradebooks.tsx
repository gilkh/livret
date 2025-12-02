import { useEffect, useState } from 'react'
import api from '../api'
import { GradebookRenderer } from '../components/GradebookRenderer'
import './AdminGradebooks.css'

export default function AdminGradebooks() {
    const [viewMode, setViewMode] = useState<'saved' | 'manual'>('saved')

    // --- Saved Gradebooks State ---
    const [savedYears, setSavedYears] = useState<any[]>([])
    const [selectedSavedYear, setSelectedSavedYear] = useState<string>('')
    const [savedLevels, setSavedLevels] = useState<string[]>([])
    const [selectedSavedLevel, setSelectedSavedLevel] = useState<string>('')
    const [savedStudents, setSavedStudents] = useState<any[]>([])
    const [selectedSavedStudentId, setSelectedSavedStudentId] = useState<string>('')
    const [savedGradebook, setSavedGradebook] = useState<any>(null)
    const [savedTemplate, setSavedTemplate] = useState<any>(null)
    const [loadingSaved, setLoadingSaved] = useState(false)

    // --- Manual Save State ---
    const [years, setYears] = useState<any[]>([])
    const [year, setYear] = useState<any | null>(null)
    const [classes, setClasses] = useState<any[]>([])
    const [classId, setClassId] = useState('')
    const [students, setStudents] = useState<any[]>([])
    const [studentId, setStudentId] = useState('')
    const [templates, setTemplates] = useState<any[]>([])
    const [templateId, setTemplateId] = useState('')
    const [pwd, setPwd] = useState('')
    const [files, setFiles] = useState<{ name: string, path: string, type: string }[]>([])

    // --- Effects for Saved View ---
    useEffect(() => {
        if (viewMode === 'saved') {
            api.get('/saved-gradebooks/years').then(r => setSavedYears(r.data))
        }
    }, [viewMode])

    useEffect(() => {
        if (selectedSavedYear) {
            api.get(`/saved-gradebooks/years/${selectedSavedYear}/levels`).then(r => setSavedLevels(r.data))
            setSelectedSavedLevel('')
            setSavedStudents([])
            setSavedGradebook(null)
        }
    }, [selectedSavedYear])

    useEffect(() => {
        if (selectedSavedYear && selectedSavedLevel) {
            api.get(`/saved-gradebooks/years/${selectedSavedYear}/levels/${selectedSavedLevel}/students`).then(r => setSavedStudents(r.data))
            setSelectedSavedStudentId('')
            setSavedGradebook(null)
        }
    }, [selectedSavedLevel])

    useEffect(() => {
        if (selectedSavedStudentId) {
            setLoadingSaved(true)
            api.get(`/saved-gradebooks/${selectedSavedStudentId}`).then(async r => {
                setSavedGradebook(r.data)
                if (r.data.templateId) {
                    const t = await api.get(`/templates/${r.data.templateId}`)
                    setSavedTemplate(t.data)
                }
                setLoadingSaved(false)
            })
        }
    }, [selectedSavedStudentId])

    // --- Effects for Manual View ---
    const loadYears = async () => { const r = await api.get('/school-years'); setYears(r.data) }
    const loadClasses = async (yr: string) => { const r = await api.get('/classes', { params: { schoolYearId: yr } }); setClasses(r.data) }
    const loadStudents = async (cls: string) => { const r = await api.get(`/students/by-class/${cls}`); setStudents(r.data) }
    const loadTemplates = async () => { const r = await api.get('/templates'); setTemplates(r.data) }
    const listSaved = async () => { if (!year || !classId) { setFiles([]); return } const r = await api.get('/media/list', { params: { folder: `gradebooks/${year._id}/${classId}` } }); setFiles(r.data) }
    
    useEffect(() => { 
        if (viewMode === 'manual') {
            loadYears(); loadTemplates() 
        }
    }, [viewMode])
    
    useEffect(() => { if (year) { loadClasses(year._id); setClassId(''); setStudents([]); setFiles([]) } }, [year])
    useEffect(() => { if (classId) { loadStudents(classId); listSaved() } }, [classId])

    // --- Manual Actions ---
    const uploadBlob = async (folder: string, filename: string, blob: Blob, mime: string) => {
        const fd = new FormData()
        fd.append('file', new File([blob], filename, { type: mime }))
        await fetch(`http://localhost:4000/media/upload?folder=${encodeURIComponent(folder)}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
    }
    const saveStudent = async () => {
        if (!year || !classId || !studentId) return
        const q: string[] = []
        if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
        if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
        const url = `http://localhost:4000/pdf/student/${studentId}${q.length ? '?' + q.join('&') : ''}`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
        const blob = await r.blob()
        const name = `student-${studentId}.pdf`
        await uploadBlob(`gradebooks/${year._id}/${classId}`, name, blob, 'application/pdf')
        await listSaved()
    }
    const saveClass = async () => {
        if (!year || !classId) return
        const q: string[] = []
        if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
        if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
        const url = `http://localhost:4000/pdf/class/${classId}/batch${q.length ? '?' + q.join('&') : ''}`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
        const blob = await r.blob()
        const name = `class-${classId}.zip`
        await uploadBlob(`gradebooks/${year._id}/${classId}`, name, blob, 'application/zip')
        await listSaved()
    }
    const saveYear = async () => {
        if (!year) return
        for (const c of classes) {
            const q: string[] = []
            if (templateId) q.push(`templateId=${encodeURIComponent(templateId)}`)
            if (pwd) q.push(`pwd=${encodeURIComponent(pwd)}`)
            const url = `http://localhost:4000/pdf/class/${c._id}/batch${q.length ? '?' + q.join('&') : ''}`
            const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
            const blob = await r.blob()
            const name = `class-${c._id}.zip`
            await uploadBlob(`gradebooks/${year._id}/${c._id}`, name, blob, 'application/zip')
        }
        await listSaved()
    }

    return (
        <div className="gradebooks-container">
            <div className="gradebooks-header">
                <h2 className="gradebooks-title">Carnets sauvegardés</h2>
                <div className="mode-switcher">
                    <button 
                        className={`mode-btn ${viewMode === 'saved' ? 'active' : ''}`}
                        onClick={() => setViewMode('saved')}
                    >
                        Archives
                    </button>
                    <button 
                        className={`mode-btn ${viewMode === 'manual' ? 'active' : ''}`}
                        onClick={() => setViewMode('manual')}
                    >
                        Sauvegarde Manuelle
                    </button>
                </div>
            </div>

            {viewMode === 'saved' && (
                <div className="content-area">
                    <div className="filters-bar">
                        <div className="filter-group">
                            <label className="filter-label">Année Scolaire</label>
                            <select 
                                className="filter-select"
                                value={selectedSavedYear} 
                                onChange={e => setSelectedSavedYear(e.target.value)}
                            >
                                <option value="">Sélectionner une année</option>
                                {savedYears.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="filter-group">
                            <label className="filter-label">Niveau</label>
                            <select 
                                className="filter-select"
                                value={selectedSavedLevel} 
                                onChange={e => setSelectedSavedLevel(e.target.value)}
                                disabled={!selectedSavedYear}
                            >
                                <option value="">Sélectionner un niveau</option>
                                {savedLevels.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Élève</label>
                            <select 
                                className="filter-select"
                                value={selectedSavedStudentId} 
                                onChange={e => setSelectedSavedStudentId(e.target.value)}
                                disabled={!selectedSavedLevel}
                            >
                                <option value="">Sélectionner un élève</option>
                                {savedStudents.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                            </select>
                        </div>
                    </div>

                    {loadingSaved && (
                        <div className="empty-state">
                            <div className="empty-icon">⏳</div>
                            <div>Chargement du carnet...</div>
                        </div>
                    )}

                    {savedGradebook && savedTemplate && (
                        <div>
                            <div className="preview-actions">
                                <button className="action-btn" onClick={() => window.print()}>
                                    <span>🖨️ Imprimer / PDF</span>
                                </button>
                            </div>
                            <div className="preview-container">
                                <GradebookRenderer 
                                    template={savedTemplate} 
                                    student={savedGradebook.data.student} 
                                    assignment={savedGradebook.data.assignment} 
                                />
                            </div>
                        </div>
                    )}
                    
                    {!savedGradebook && !loadingSaved && (
                        <div className="empty-state">
                            <div className="empty-icon">📚</div>
                            <div>
                                {selectedSavedStudentId 
                                    ? "Aucun carnet trouvé pour cet élève." 
                                    : "Sélectionnez une année, un niveau et un élève pour voir le carnet archivé."}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'manual' && (
                <div className="content-area">
                    <div className="filters-bar">
                        <div className="filter-group">
                            <label className="filter-label">Année Scolaire</label>
                            <select 
                                className="filter-select"
                                value={year?._id || ''} 
                                onChange={e => { const y = years.find(yy => yy._id === e.target.value); setYear(y || null) }}
                            >
                                <option value="">Sélectionner une année</option>
                                {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Classe</label>
                            <select 
                                className="filter-select"
                                value={classId} 
                                onChange={e => setClassId(e.target.value)}
                                disabled={!year}
                            >
                                <option value="">Sélectionner une classe</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Élève (Optionnel)</label>
                            <select 
                                className="filter-select"
                                value={studentId} 
                                onChange={e => setStudentId(e.target.value)}
                                disabled={!classId}
                            >
                                <option value="">Tous les élèves</option>
                                {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Modèle (Optionnel)</label>
                            <select 
                                className="filter-select"
                                value={templateId} 
                                onChange={e => setTemplateId(e.target.value)}
                            >
                                <option value="">Modèle par défaut</option>
                                {templates.map(t => <option key={String(t._id)} value={String(t._id)}>{t.name}</option>)}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Mot de passe (Optionnel)</label>
                            <input 
                                className="filter-input"
                                placeholder="Mot de passe export" 
                                value={pwd} 
                                onChange={e => setPwd(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div className="manual-actions">
                        <button className="action-btn" onClick={saveYear} disabled={!year}>
                            <span>💾 Sauvegarder Année</span>
                        </button>
                        <button className="action-btn" onClick={saveClass} disabled={!classId}>
                            <span>💾 Sauvegarder Classe</span>
                        </button>
                        <button className="action-btn" onClick={saveStudent} disabled={!studentId}>
                            <span>💾 Sauvegarder Élève</span>
                        </button>
                    </div>

                    <div className="files-section">
                        <h4 className="files-title">📂 Fichiers enregistrés</h4>
                        {files.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">📁</div>
                                <div>Aucun fichier trouvé pour cette sélection.</div>
                            </div>
                        ) : (
                            <div className="files-grid">
                                {files.map(u => (
                                    <div key={u.path} className="file-card">
                                        <div className="file-name">{u.name}</div>
                                        <div className="file-actions">
                                            <a className="download-link" href={`http://localhost:4000/uploads${u.path}`} target="_blank">
                                                ⬇️ Télécharger
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
