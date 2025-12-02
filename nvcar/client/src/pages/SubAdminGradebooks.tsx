import { useEffect, useState } from 'react'
import api from '../api'
import { GradebookRenderer } from '../components/GradebookRenderer'
import './SubAdminGradebooks.css'

export default function SubAdminGradebooks() {
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

    // --- Effects for Saved View ---
    useEffect(() => {
        api.get('/saved-gradebooks/years').then(r => setSavedYears(r.data))
    }, [])

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
                    let templateData = t.data
                    
                    // Handle versioning
                    const assignment = r.data.data?.assignment
                    if (assignment?.templateVersion && templateData.versionHistory) {
                        const version = templateData.versionHistory.find((v: any) => v.version === assignment.templateVersion)
                        if (version) {
                            templateData = {
                                ...templateData,
                                pages: version.pages,
                                variables: version.variables || {},
                                watermark: version.watermark
                            }
                        }
                    }
                    
                    setSavedTemplate(templateData)
                }
                setLoadingSaved(false)
            })
        }
    }, [selectedSavedStudentId])

    return (
        <div className="subadmin-gradebooks-container">
            <div className="subadmin-header">
                <h1 className="subadmin-title">Consultation des Carnets</h1>
            </div>
            
            <div className="filters-card">
                <div className="filter-group">
                    <label className="filter-label">Année Scolaire</label>
                    <select 
                        className="filter-select"
                        value={selectedSavedYear} 
                        onChange={e => setSelectedSavedYear(e.target.value)}
                    >
                        <option value="">Sélectionner une année...</option>
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
                        <option value="">Sélectionner un niveau...</option>
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
                        <option value="">Sélectionner un élève...</option>
                        {savedStudents.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                    </select>
                </div>
            </div>

            {loadingSaved && (
                <div className="loading-state">
                    Chargement du carnet en cours...
                </div>
            )}

            {savedGradebook && savedTemplate && (
                <div className="preview-card">
                    <div className="preview-header">
                        <h3 className="preview-title">
                            Carnet de {savedGradebook.data.student.firstName} {savedGradebook.data.student.lastName}
                        </h3>
                        <button 
                            className="download-btn" 
                            onClick={() => {
                                const token = localStorage.getItem('token')
                                const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                                window.open(`${base}/pdf-v2/saved/${savedGradebook._id}?token=${token}`, '_blank')
                            }}
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                            Télécharger PDF
                        </button>
                    </div>
                    <div className="renderer-wrapper">
                        <GradebookRenderer 
                            template={savedTemplate} 
                            student={savedGradebook.data.student} 
                            assignment={savedGradebook.data.assignment} 
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
