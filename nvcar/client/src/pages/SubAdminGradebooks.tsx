import { useEffect, useState } from 'react'
import api from '../api'
import TemplateReviewPreview from '../components/TemplateReviewPreview'
import SearchableSelect from '../components/SearchableSelect'
import ScrollToTopButton from '../components/ScrollToTopButton'
import { openPdfExport, buildSavedGradebookPdfUrl } from '../utils/pdfExport'
import './SubAdminGradebooks.css'

export default function SubAdminGradebooks() {
    const [mode, setMode] = useState<'saved' | 'exited'>('saved')

    // --- Saved Gradebooks State ---
    const [savedYears, setSavedYears] = useState<any[]>([])
    const [selectedSavedYear, setSelectedSavedYear] = useState<string>('')
    const [savedLevels, setSavedLevels] = useState<string[]>([])
    const [selectedSavedLevel, setSelectedSavedLevel] = useState<string>('')
    const [savedStudents, setSavedStudents] = useState<any[]>([])
    const [selectedSavedStudentId, setSelectedSavedStudentId] = useState<string>('')

    const [exitedYears, setExitedYears] = useState<any[]>([])
    const [selectedExitedYear, setSelectedExitedYear] = useState<string>('')
    const [exitedStudents, setExitedStudents] = useState<any[]>([])
    const [selectedExitedStudentId, setSelectedExitedStudentId] = useState<string>('')
    const [exitedGradebooks, setExitedGradebooks] = useState<any[]>([])
    const [selectedExitedGradebookId, setSelectedExitedGradebookId] = useState<string>('')

    const [savedGradebook, setSavedGradebook] = useState<any>(null)
    const [savedTemplate, setSavedTemplate] = useState<any>(null)
    const [loadingSaved, setLoadingSaved] = useState(false)

    const loadSavedGradebook = async (savedGradebookId: string) => {
        setLoadingSaved(true)
        try {
            const r = await api.get(`/saved-gradebooks/${savedGradebookId}`)
            setSavedGradebook(r.data)

            // Use template data from the saved gradebook snapshot if available
            if (r.data.data?.template) {
                setSavedTemplate(r.data.data.template)
            } else if (r.data.templateId) {
                // Fallback: fetch template separately if not in snapshot
                const t = await api.get(`/templates/${r.data.templateId}`)
                let templateData = t.data

                const assignment = r.data.data?.assignment
                if (assignment?.templateVersion && templateData.versionHistory) {
                    const version = templateData.versionHistory.find((v: any) => v.version === assignment.templateVersion)
                    if (version) {
                        templateData = {
                            ...templateData,
                            pages: version.pages,
                            variables: version.variables || {},
                            watermark: version.watermark,
                        }
                    }
                }

                setSavedTemplate(templateData)
            } else {
                setSavedTemplate(null)
            }
        } catch {
            setSavedGradebook(null)
            setSavedTemplate(null)
        } finally {
            setLoadingSaved(false)
        }
    }

    // --- Effects for Saved View ---
    useEffect(() => {
        if (mode === 'saved') {
            api.get('/saved-gradebooks/years').then(r => setSavedYears(r.data))
        } else {
            api.get('/saved-gradebooks/exited/years').then(r => setExitedYears(r.data))
        }
    }, [mode])

    useEffect(() => {
        setSelectedSavedYear('')
        setSavedLevels([])
        setSelectedSavedLevel('')
        setSavedStudents([])
        setSelectedSavedStudentId('')

        setSelectedExitedYear('')
        setExitedStudents([])
        setSelectedExitedStudentId('')
        setExitedGradebooks([])
        setSelectedExitedGradebookId('')

        setSavedGradebook(null)
        setSavedTemplate(null)
    }, [mode])

    useEffect(() => {
        if (mode === 'saved' && selectedSavedYear) {
            api.get(`/saved-gradebooks/years/${selectedSavedYear}/levels`).then(r => setSavedLevels(r.data))
            setSelectedSavedLevel('')
            setSavedStudents([])
            setSavedGradebook(null)
            setSavedTemplate(null)
        }
    }, [mode, selectedSavedYear])

    useEffect(() => {
        if (mode === 'saved' && selectedSavedYear && selectedSavedLevel) {
            api.get(`/saved-gradebooks/years/${selectedSavedYear}/levels/${selectedSavedLevel}/students`).then(r => setSavedStudents(r.data))
            setSelectedSavedStudentId('')
            setSavedGradebook(null)
            setSavedTemplate(null)
        }
    }, [mode, selectedSavedYear, selectedSavedLevel])

    useEffect(() => {
        if (mode === 'saved' && selectedSavedStudentId) {
            loadSavedGradebook(selectedSavedStudentId)
        }
    }, [mode, selectedSavedStudentId])

    useEffect(() => {
        if (mode === 'exited' && selectedExitedYear) {
            api.get(`/saved-gradebooks/exited/years/${selectedExitedYear}/students`).then(r => setExitedStudents(r.data))
            setSelectedExitedStudentId('')
            setExitedGradebooks([])
            setSelectedExitedGradebookId('')
            setSavedGradebook(null)
            setSavedTemplate(null)
        }
    }, [mode, selectedExitedYear])

    useEffect(() => {
        if (mode === 'exited' && selectedExitedStudentId) {
            api.get(`/saved-gradebooks/student/${selectedExitedStudentId}`).then(r => {
                const list = Array.isArray(r.data) ? r.data : []
                setExitedGradebooks(list)
                const byYear = selectedExitedYear ? list.find((g: any) => String(g.schoolYearId) === String(selectedExitedYear)) : null
                const picked = byYear || list[0]
                setSelectedExitedGradebookId(picked?._id ? String(picked._id) : '')
            })
        }
    }, [mode, selectedExitedStudentId, selectedExitedYear])

    useEffect(() => {
        if (mode === 'exited' && selectedExitedGradebookId) {
            loadSavedGradebook(selectedExitedGradebookId)
        }
    }, [mode, selectedExitedGradebookId])

    return (
        <div className="subadmin-gradebooks-container">
            <ScrollToTopButton />
            <div className="subadmin-header">
                <h1 className="subadmin-title">Consultation des Carnets</h1>
            </div>

            <div className="filters-card">
                <div className="filter-group">
                    <label className="filter-label">Type</label>
                    <select className="filter-select" value={mode} onChange={e => setMode(e.target.value as any)}>
                        <option value="saved">En cours</option>
                        <option value="exited">Archives</option>
                    </select>
                </div>

                {mode === 'saved' && (
                    <>
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
                            <SearchableSelect
                                options={savedStudents.map(s => ({ value: s._id, label: `${s.firstName} ${s.lastName}` }))}
                                value={selectedSavedStudentId}
                                onChange={val => setSelectedSavedStudentId(val)}
                                disabled={!selectedSavedLevel}
                                placeholder="Sélectionner un élève..."
                            />
                        </div>
                    </>
                )}

                {mode === 'exited' && (
                    <>
                        <div className="filter-group">
                            <label className="filter-label">Année de sortie</label>
                            <select
                                className="filter-select"
                                value={selectedExitedYear}
                                onChange={e => setSelectedExitedYear(e.target.value)}
                            >
                                <option value="">Sélectionner une année...</option>
                                {exitedYears.map(y => (
                                    <option key={y._id} value={y._id}>
                                        {y.name}{typeof y.count === 'number' ? ` (${y.count})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Élève</label>
                            <SearchableSelect
                                options={exitedStudents.map(s => ({
                                    value: s.studentId,
                                    label: `${s.firstName} ${s.lastName}`,
                                    subLabel: s.exitLevel ? `(${s.exitLevel})` : undefined
                                }))}
                                value={selectedExitedStudentId}
                                onChange={val => setSelectedExitedStudentId(val)}
                                disabled={!selectedExitedYear}
                                placeholder="Sélectionner un élève..."
                            />
                        </div>

                        <div className="filter-group">
                            <label className="filter-label">Carnet</label>
                            <select
                                className="filter-select"
                                value={selectedExitedGradebookId}
                                onChange={e => setSelectedExitedGradebookId(e.target.value)}
                                disabled={!selectedExitedStudentId}
                            >
                                <option value="">Sélectionner un carnet...</option>
                                {exitedGradebooks
                                    .filter(g => !selectedExitedYear || String(g.schoolYearId) === String(selectedExitedYear))
                                    .map(g => (
                                        <option key={g._id} value={g._id}>
                                            {g.yearName || g.schoolYearId}{g.level ? ` - ${g.level}` : ''}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </>
                )}
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
                                const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                                const pdfUrl = buildSavedGradebookPdfUrl(base, savedGradebook._id)
                                const studentFullName = `${savedGradebook.data.student.firstName} ${savedGradebook.data.student.lastName}`
                                openPdfExport(pdfUrl, studentFullName, 'single', 1)
                            }}
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                            Télécharger PDF
                        </button>
                    </div>
                    <div className="renderer-wrapper">
                        <TemplateReviewPreview
                            template={savedTemplate}
                            student={savedGradebook.data.student}
                            assignment={savedGradebook.data.assignment}
                            signature={savedGradebook.data.signatures?.find((s: any) => s.type === 'standard') ||
                                savedGradebook.data.assignment?.data?.signatures?.find((s: any) => s.type === 'standard') ||
                                savedGradebook.data.signature}
                            finalSignature={savedGradebook.data.signatures?.find((s: any) => s.type === 'end_of_year') ||
                                savedGradebook.data.assignment?.data?.signatures?.find((s: any) => s.type === 'end_of_year') ||
                                savedGradebook.data.finalSignature}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
