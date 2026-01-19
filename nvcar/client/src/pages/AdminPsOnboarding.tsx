import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import './AdminPsOnboarding.css'

interface StudentOnboarding {
    _id: string
    firstName: string
    lastName: string
    dateOfBirth: string
    avatarUrl?: string
    previousClassName: string | null
    previousClassId: string | null
    hasEnrollment: boolean
    assignmentId: string | null
    isCompletedSem1: boolean
    isCompletedSem2: boolean
    signatures: {
        sem1: { signedAt: string, signedBy: string } | null
        sem2: { signedAt: string, signedBy: string } | null
    }
    isPromoted: boolean
    promotedAt: string | null
}

interface PsClass {
    _id: string
    name: string
    level: string
}

interface Subadmin {
    _id: string
    displayName: string
    hasSignature: boolean
    signatureUrl: string | null
}

interface Toast {
    message: string
    type: 'success' | 'error'
}

export default function AdminPsOnboarding() {
    const navigate = useNavigate()

    // Data
    const [students, setStudents] = useState<StudentOnboarding[]>([])
    const [previousYearClasses, setPreviousYearClasses] = useState<PsClass[]>([])
    const [previousYear, setPreviousYear] = useState<{ _id: string, name: string } | null>(null)
    const [activeYear, setActiveYear] = useState<{ _id: string, name: string } | null>(null)
    const [allYears, setAllYears] = useState<{ _id: string, name: string, active: boolean }[]>([])
    const [selectedYearId, setSelectedYearId] = useState<string>('')
    const [subadmins, setSubadmins] = useState<Subadmin[]>([])

    // UI State
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [toast, setToast] = useState<Toast | null>(null)
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())

    // Filters
    const [filterClass, setFilterClass] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'unsigned' | 'signed' | 'promoted'>('all')

    // Signature options
    const [signatureSource, setSignatureSource] = useState<'admin' | 'subadmin'>('admin')
    const [selectedSubadminId, setSelectedSubadminId] = useState<string>('')
    const [signatureType, setSignatureType] = useState<'sem1' | 'sem2' | 'both'>('both')

    // Custom signature dates (for PS onboarding only)
    const [sem1Date, setSem1Date] = useState<string>('')
    const [sem2Date, setSem2Date] = useState<string>('')

    // Load years on mount
    useEffect(() => {
        loadYears()
    }, [])

    // Load data when year selection changes
    useEffect(() => {
        if (selectedYearId) {
            loadData(selectedYearId)
        }
    }, [selectedYearId])

    // Toast auto-hide
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    const loadYears = async () => {
        try {
            const res = await api.get('/school-years')
            const years = res.data || []
            setAllYears(years)
            // Default to active year unless admin chooses otherwise
            const activeY = years.find((y: any) => y.active)
            if (activeY) {
                setSelectedYearId(activeY._id)
            } else if (years.length > 0) {
                setSelectedYearId(years[0]._id)
            }
        } catch (e: any) {
            console.error('Failed to load years:', e)
            setToast({ message: 'Erreur lors du chargement des années', type: 'error' })
        }
    }

    // Batch unpromote
    const handleBatchUnpromote = async () => {
        if (!previousYear) return

        const targetIds = selectedIds.size > 0
            ? Array.from(selectedIds)
            : filteredStudents.filter(s => s.isPromoted).map(s => s._id)

        if (targetIds.length === 0) {
            setToast({ message: 'Aucun élève promu à annuler', type: 'error' })
            return
        }

        for (let i = 0; i < 3; i++) {
            if (!confirm(`[${i + 1}/3] Annuler la promotion (MS → PS) pour ${targetIds.length} élève(s) ?`)) return
        }

        setProcessing(true)
        try {
            const res = await api.post('/admin-extras/ps-onboarding/batch-unpromote', {
                scope: selectedIds.size > 0 ? 'student' : 'all',
                studentIds: selectedIds.size > 0 ? targetIds : undefined,
                schoolYearId: selectedYearId
            })
            await loadData(selectedYearId)
            setSelectedIds(new Set())
            setToast({
                message: `Annulation promotions: ${res.data.success} réussies, ${res.data.failed} échouées, ${res.data.skipped} ignorées`,
                type: res.data.failed > 0 ? 'error' : 'success'
            })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        } finally {
            setProcessing(false)
        }
    }

    const loadData = async (yearId: string) => {
        setLoading(true)
        try {
            const [studentsRes, subadminsRes] = await Promise.all([
                api.get('/admin-extras/ps-onboarding/students', { params: { schoolYearId: yearId } }),
                api.get('/admin-extras/ps-onboarding/subadmins')
            ])
            setStudents(studentsRes.data.students || [])
            setPreviousYearClasses(studentsRes.data.previousYearClasses || [])
            setPreviousYear(studentsRes.data.selectedYear || null)
            setActiveYear(studentsRes.data.activeYear || null)
            setSubadmins(subadminsRes.data || [])
            // Reset selection when year changes
            setSelectedIds(new Set())
            setFilterClass('all')
        } catch (e: any) {
            console.error('Failed to load data:', e)
            setToast({ message: 'Erreur lors du chargeur des données', type: 'error' })
        } finally {
            setLoading(false)
        }
    }

    // Computed stats
    const stats = useMemo(() => {
        const total = students.length
        const assigned = students.filter(s => s.hasEnrollment).length
        const signedBoth = students.filter(s => s.signatures.sem1 && s.signatures.sem2).length
        const promoted = students.filter(s => s.isPromoted).length
        return { total, assigned, signedBoth, promoted }
    }, [students])

    // Filtered students
    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            if (filterClass !== 'all' && s.previousClassId !== filterClass) return false
            if (filterStatus === 'unassigned' && s.hasEnrollment) return false
            if (filterStatus === 'unsigned' && s.signatures.sem2) return false
            if (filterStatus === 'signed' && !s.signatures.sem2) return false
            if (filterStatus === 'promoted' && !s.isPromoted) return false
            return true
        })
    }, [students, filterClass, filterStatus])

    // Grouped by class
    const groupedStudents = useMemo(() => {
        const groups: Record<string, StudentOnboarding[]> = {}
        const unassigned: StudentOnboarding[] = []

        filteredStudents.forEach(s => {
            if (!s.previousClassName) {
                unassigned.push(s)
            } else {
                if (!groups[s.previousClassName]) groups[s.previousClassName] = []
                groups[s.previousClassName].push(s)
            }
        })

        return { groups, unassigned }
    }, [filteredStudents])

    // Selection handlers
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredStudents.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredStudents.map(s => s._id)))
        }
    }

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleExpandClass = (className: string) => {
        const next = new Set(expandedClasses)
        if (next.has(className)) next.delete(className)
        else next.add(className)
        setExpandedClasses(next)
    }

    const toggleSelectClass = (classStudents: StudentOnboarding[]) => {
        const classIds = classStudents.map(s => s._id)
        const allSelected = classIds.every(id => selectedIds.has(id))
        const next = new Set(selectedIds)
        if (allSelected) {
            classIds.forEach(id => next.delete(id))
        } else {
            classIds.forEach(id => next.add(id))
        }
        setSelectedIds(next)
    }

    // Assign class
    const handleAssignClass = async (studentId: string, classId: string) => {
        if (!previousYear) return
        try {
            await api.post('/admin-extras/ps-onboarding/assign-class', {
                studentId,
                classId,
                schoolYearId: previousYear._id
            })
            await loadData(selectedYearId)
            setToast({ message: 'Classe assignée avec succès', type: 'success' })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        }
    }

    // Batch sign
    const handleBatchSign = async (type: 'sem1' | 'sem2' | 'both') => {
        if (!previousYear) return
        if (signatureSource === 'subadmin' && !selectedSubadminId) {
            setToast({ message: 'Veuillez sélectionner un sous-admin', type: 'error' })
            return
        }

        const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : filteredStudents.map(s => s._id)
        if (targetIds.length === 0) {
            setToast({ message: 'Aucun élève sélectionné', type: 'error' })
            return
        }

        if (!confirm(`Signer ${type === 'both' ? 'Sem1 + Sem2' : type.toUpperCase()} pour ${targetIds.length} élève(s) ?`)) return

        setProcessing(true)
        try {
            const res = await api.post('/admin-extras/ps-onboarding/batch-sign', {
                scope: selectedIds.size > 0 ? 'student' : 'all',
                studentIds: selectedIds.size > 0 ? targetIds : undefined,
                signatureType: type,
                signatureSource,
                subadminId: signatureSource === 'subadmin' ? selectedSubadminId : undefined,
                schoolYearId: previousYear._id,
                sem1SignedAt: sem1Date ? new Date(sem1Date).toISOString() : undefined,
                sem2SignedAt: sem2Date ? new Date(sem2Date).toISOString() : undefined
            })
            await loadData(selectedYearId)
            setSelectedIds(new Set())
            setToast({
                message: `Signatures créées: ${res.data.success} réussies, ${res.data.failed} échouées`,
                type: res.data.failed > 0 ? 'error' : 'success'
            })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        } finally {
            setProcessing(false)
        }
    }

    // Batch unsign
    const handleBatchUnsign = async () => {
        if (!previousYear) return

        const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : filteredStudents.map(s => s._id)
        if (targetIds.length === 0) {
            setToast({ message: 'Aucun élève sélectionné', type: 'error' })
            return
        }

        for (let i = 0; i < 3; i++) {
            if (!confirm(`[${i + 1}/3] Annuler les signatures pour ${targetIds.length} élève(s) ?`)) return
        }

        setProcessing(true)
        try {
            const res = await api.post('/admin-extras/ps-onboarding/batch-unsign', {
                scope: selectedIds.size > 0 ? 'student' : 'all',
                studentIds: selectedIds.size > 0 ? targetIds : undefined,
                signatureType: 'both',
                schoolYearId: previousYear._id
            })
            await loadData(selectedYearId)
            setSelectedIds(new Set())
            setToast({ message: `${res.data.deleted} signatures supprimées`, type: 'success' })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        } finally {
            setProcessing(false)
        }
    }

    // Batch promote
    const handleBatchPromote = async () => {
        if (!previousYear) return

        const targetIds = selectedIds.size > 0
            ? Array.from(selectedIds)
            : filteredStudents.filter(s => s.signatures.sem1 && s.signatures.sem2 && !s.isPromoted).map(s => s._id)

        if (selectedIds.size > 0) {
            const selectedStudents = filteredStudents.filter(s => selectedIds.has(s._id))
            const ineligible = selectedStudents.filter(s => !(s.signatures.sem1 && s.signatures.sem2) || s.isPromoted)
            if (ineligible.length > 0) {
                setToast({ message: `Sélection invalide: ${ineligible.length} élève(s) non éligible(s) (doit être signé Sem1+Sem2 et non promu)`, type: 'error' })
                return
            }
        }

        if (targetIds.length === 0) {
            setToast({ message: 'Aucun élève éligible (doit être signé Sem1+Sem2 et non promu)', type: 'error' })
            return
        }

        for (let i = 0; i < 3; i++) {
            if (!confirm(`[${i + 1}/3] Promouvoir ${targetIds.length} élève(s) de PS vers MS ?`)) return
        }

        setProcessing(true)
        try {
            const res = await api.post('/admin-extras/ps-onboarding/batch-promote', {
                scope: selectedIds.size > 0 ? 'student' : 'all',
                studentIds: selectedIds.size > 0 ? targetIds : undefined,
                schoolYearId: selectedYearId
            })
            await loadData(selectedYearId)
            setSelectedIds(new Set())
            setToast({
                message: `Promotions: ${res.data.success} réussies, ${res.data.failed} échouées, ${res.data.skipped} ignorées`,
                type: res.data.failed > 0 ? 'error' : 'success'
            })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        } finally {
            setProcessing(false)
        }
    }

    // Batch export PDFs (without signature blocks)
    const handleBatchExport = async () => {
        if (!previousYear) return

        const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : filteredStudents.map(s => s._id)
        if (targetIds.length === 0) {
            setToast({ message: 'Aucun élève à exporter', type: 'error' })
            return
        }

        if (!confirm(`Exporter ${targetIds.length} carnet(s) en PDF ?`)) return

        setProcessing(true)
        try {
            // First get the assignment IDs
            const res = await api.post('/admin-extras/ps-onboarding/batch-export', {
                scope: selectedIds.size > 0 ? 'student' : 'all',
                studentIds: selectedIds.size > 0 ? targetIds : undefined,
                schoolYearId: previousYear._id
            })

            if (!res.data.assignmentIds || res.data.assignmentIds.length === 0) {
                setToast({ message: 'Aucun carnet trouvé pour ces élèves', type: 'error' })
                return
            }

            setToast({ message: `Génération de ${res.data.count} PDF(s) en cours...`, type: 'success' })

            // Now trigger the PDF zip download with hideSignatures=true
            const token = localStorage.getItem('token') || ''
            const zipRes = await fetch('/pdf-v2/assignments/zip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assignmentIds: res.data.assignmentIds,
                    groupLabel: res.data.groupLabel,
                    hideSignatures: true
                })
            })

            if (!zipRes.ok) {
                throw new Error('Erreur lors de la génération du ZIP')
            }

            // Download the ZIP file
            const blob = await zipRes.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `carnets-${res.data.groupLabel || 'PS'}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)

            setToast({ message: `Export terminé: ${res.data.count} carnet(s)`, type: 'success' })
        } catch (e: any) {
            setToast({ message: 'Erreur: ' + (e.response?.data?.message || e.message), type: 'error' })
        } finally {
            setProcessing(false)
        }
    }

    // Format date
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-'
        try {
            return new Date(dateStr).toLocaleDateString('fr-FR')
        } catch {
            return dateStr
        }
    }

    // Get initials
    const getInitials = (firstName: string, lastName: string) => {
        return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
    }

    if (loading) {
        return (
            <div className="ps-onboarding">
                <div className="ps-loading">
                    <div className="ps-loading-spinner" />
                    <p>Chargement des données...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="ps-onboarding">
            {/* Header */}
            <div className="ps-onboarding-header">
                <div className="ps-header-top">
                    <button className="ps-back-btn" onClick={() => navigate('/admin')}>
                        ← Retour
                    </button>
                    <div className="ps-year-selector">
                        <span className="ps-filter-label">📅 Année à traiter:</span>
                        <select
                            className="ps-filter-select"
                            value={selectedYearId}
                            onChange={e => setSelectedYearId(e.target.value)}
                            style={{ minWidth: 180 }}
                        >
                            {allYears.map(y => (
                                <option key={y._id} value={y._id}>
                                    {y.name} {y.active ? '(Active)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="ps-title-area">
                        <h1>📚 Onboarding PS → MS</h1>
                        <p>
                            Préparer les élèves PS de {previousYear?.name || 'l\'année sélectionnée'} pour leur passage en MS
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="ps-stats-grid">
                    <div className="ps-stat-card">
                        <div className="ps-stat-icon total">👥</div>
                        <div className="ps-stat-info">
                            <h3>{stats.total}</h3>
                            <p>Total élèves PS</p>
                        </div>
                    </div>
                    <div className="ps-stat-card">
                        <div className="ps-stat-icon assigned">✅</div>
                        <div className="ps-stat-info">
                            <h3>{stats.assigned}</h3>
                            <p>Avec classe</p>
                        </div>
                    </div>
                    <div className="ps-stat-card">
                        <div className="ps-stat-icon signed">✍️</div>
                        <div className="ps-stat-info">
                            <h3>{stats.signedBoth}</h3>
                            <p>Signés (Sem1+2)</p>
                        </div>
                    </div>
                    <div className="ps-stat-card">
                        <div className="ps-stat-icon promoted">🎓</div>
                        <div className="ps-stat-info">
                            <h3>{stats.promoted}</h3>
                            <p>Promus</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="ps-filter-bar">
                <div className="ps-filter-group">
                    <span className="ps-filter-label">Classe:</span>
                    <select
                        className="ps-filter-select"
                        value={filterClass}
                        onChange={e => setFilterClass(e.target.value)}
                    >
                        <option value="all">Toutes les classes</option>
                        {previousYearClasses.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className="ps-filter-group">
                    <span className="ps-filter-label">Statut:</span>
                    <select
                        className="ps-filter-select"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as any)}
                    >
                        <option value="all">Tous</option>
                        <option value="unassigned">Non affectés</option>
                        <option value="unsigned">Non signés</option>
                        <option value="signed">Signés</option>
                        <option value="promoted">Promus</option>
                    </select>
                </div>
                <label className="ps-select-all">
                    <input
                        type="checkbox"
                        checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0}
                        onChange={toggleSelectAll}
                    />
                    Tout sélectionner ({filteredStudents.length})
                </label>
            </div>

            {/* Student Groups */}
            {filteredStudents.length === 0 ? (
                <div className="ps-empty-state">
                    <div className="emoji">🔍</div>
                    <h3>Aucun élève trouvé</h3>
                    <p>Aucun élève ne correspond aux critères de filtrage.</p>
                </div>
            ) : (
                <div className="ps-student-groups">
                    {/* Unassigned group */}
                    {groupedStudents.unassigned.length > 0 && (() => {
                        const unassigned = groupedStudents.unassigned
                        const signedS1 = unassigned.filter(s => s.signatures.sem1).length
                        const signedS2 = unassigned.filter(s => s.signatures.sem2).length
                        const promoted = unassigned.filter(s => s.isPromoted).length
                        const isExpanded = expandedClasses.has('__unassigned__')
                        return (
                        <div className="ps-group">
                            <div className="ps-group-header" onClick={() => toggleExpandClass('__unassigned__')} style={{ cursor: 'pointer' }}>
                                <div className="ps-group-title">
                                    <span className="ps-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                    <input
                                        type="checkbox"
                                        checked={unassigned.every(s => selectedIds.has(s._id))}
                                        onChange={(e) => { e.stopPropagation(); toggleSelectClass(unassigned) }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ marginRight: 8 }}
                                    />
                                    <h3>⚠️ Non affectés</h3>
                                    <span className="ps-group-badge unassigned">{unassigned.length}</span>
                                    {!isExpanded && (
                                        <div className="ps-group-summary">
                                            <span className={`ps-summary-badge ${signedS1 === unassigned.length ? 'complete' : 'partial'}`}>
                                                S1: {signedS1}/{unassigned.length}
                                            </span>
                                            <span className={`ps-summary-badge ${signedS2 === unassigned.length ? 'complete' : 'partial'}`}>
                                                S2: {signedS2}/{unassigned.length}
                                            </span>
                                            <span className={`ps-summary-badge ${promoted === unassigned.length ? 'complete' : 'partial'}`}>
                                                🎓 {promoted}/{unassigned.length}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {expandedClasses.has('__unassigned__') && <div className="ps-student-list">
                                {groupedStudents.unassigned.map(student => (
                                    <div key={student._id} className="ps-student-row">
                                        <div className="ps-student-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(student._id)}
                                                onChange={() => toggleSelect(student._id)}
                                            />
                                        </div>
                                        <div className="ps-student-info">
                                            <div className="ps-student-avatar">
                                                {student.avatarUrl ? (
                                                    <img src={student.avatarUrl} alt="" />
                                                ) : (
                                                    getInitials(student.firstName, student.lastName)
                                                )}
                                            </div>
                                            <div>
                                                <p className="ps-student-name">{student.firstName} {student.lastName}</p>
                                                <p className="ps-student-dob">Né(e) le {formatDate(student.dateOfBirth)}</p>
                                            </div>
                                        </div>
                                        <select
                                            className="ps-student-class-select"
                                            value=""
                                            onChange={e => handleAssignClass(student._id, e.target.value)}
                                        >
                                            <option value="">Sélectionner classe...</option>
                                            {previousYearClasses.map(c => (
                                                <option key={c._id} value={c._id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <div className="ps-signature-status">
                                            <span className={`ps-sig-badge ${student.signatures.sem1 ? 'signed' : 'pending'}`}>
                                                S1 {student.signatures.sem1 ? '✓' : '○'}
                                            </span>
                                            <span className={`ps-sig-badge ${student.signatures.sem2 ? 'signed' : 'pending'}`}>
                                                S2 {student.signatures.sem2 ? '✓' : '○'}
                                            </span>
                                        </div>
                                        <div className="ps-promotion-status">
                                            <span className={`ps-promo-badge ${student.isPromoted ? 'promoted' : 'not-promoted'}`}>
                                                {student.isPromoted ? '🎓 Promu' : '○ Non promu'}
                                            </span>
                                        </div>
                                        <div className="ps-student-actions">
                                            <button
                                                className="ps-view-btn"
                                                onClick={() => window.open(`/student/${student._id}`, '_blank')}
                                                title="Voir le livret"
                                            >
                                                📄
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>}
                        </div>
                    )})()}

                    {/* Assigned groups by class */}
                    {Object.entries(groupedStudents.groups).map(([className, classStudents]) => {
                        const signedS1 = classStudents.filter(s => s.signatures.sem1).length
                        const signedS2 = classStudents.filter(s => s.signatures.sem2).length
                        const promoted = classStudents.filter(s => s.isPromoted).length
                        const isExpanded = expandedClasses.has(className)
                        return (
                        <div key={className} className="ps-group">
                            <div className="ps-group-header" onClick={() => toggleExpandClass(className)} style={{ cursor: 'pointer' }}>
                                <div className="ps-group-title">
                                    <span className="ps-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                    <input
                                        type="checkbox"
                                        checked={classStudents.every(s => selectedIds.has(s._id))}
                                        onChange={(e) => { e.stopPropagation(); toggleSelectClass(classStudents) }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ marginRight: 8 }}
                                    />
                                    <h3>📖 {className}</h3>
                                    <span className="ps-group-badge">{classStudents.length}</span>
                                    {!isExpanded && (
                                        <div className="ps-group-summary">
                                            <span className={`ps-summary-badge ${signedS1 === classStudents.length ? 'complete' : 'partial'}`}>
                                                S1: {signedS1}/{classStudents.length}
                                            </span>
                                            <span className={`ps-summary-badge ${signedS2 === classStudents.length ? 'complete' : 'partial'}`}>
                                                S2: {signedS2}/{classStudents.length}
                                            </span>
                                            <span className={`ps-summary-badge ${promoted === classStudents.length ? 'complete' : 'partial'}`}>
                                                🎓 {promoted}/{classStudents.length}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {expandedClasses.has(className) && <div className="ps-student-list">
                                {classStudents.map(student => (
                                    <div key={student._id} className="ps-student-row">
                                        <div className="ps-student-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(student._id)}
                                                onChange={() => toggleSelect(student._id)}
                                            />
                                        </div>
                                        <div className="ps-student-info">
                                            <div className="ps-student-avatar">
                                                {student.avatarUrl ? (
                                                    <img src={student.avatarUrl} alt="" />
                                                ) : (
                                                    getInitials(student.firstName, student.lastName)
                                                )}
                                            </div>
                                            <div>
                                                <p className="ps-student-name">{student.firstName} {student.lastName}</p>
                                                <p className="ps-student-dob">Né(e) le {formatDate(student.dateOfBirth)}</p>
                                            </div>
                                        </div>
                                        <div className="ps-student-class-display">
                                            {student.previousClassName}
                                        </div>
                                        <div className="ps-signature-status">
                                            <span className={`ps-sig-badge ${student.signatures.sem1 ? 'signed' : 'pending'}`}>
                                                S1 {student.signatures.sem1 ? '✓' : '○'}
                                            </span>
                                            <span className={`ps-sig-badge ${student.signatures.sem2 ? 'signed' : 'pending'}`}>
                                                S2 {student.signatures.sem2 ? '✓' : '○'}
                                            </span>
                                        </div>
                                        <div className="ps-promotion-status">
                                            <span className={`ps-promo-badge ${student.isPromoted ? 'promoted' : 'not-promoted'}`}>
                                                {student.isPromoted ? '🎓 Promu' : '○ Non promu'}
                                            </span>
                                        </div>
                                        <div className="ps-student-actions">
                                            <button
                                                className="ps-view-btn"
                                                onClick={() => window.open(`/student/${student._id}`, '_blank')}
                                                title="Voir le livret"
                                            >
                                                📄
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>}
                        </div>
                    )})}
                </div>
            )}

            {/* Actions Panel */}
            <div className="ps-actions-panel">
                <div className="ps-actions-header">
                    <h3>⚡ Actions en lot</h3>
                    {selectedIds.size > 0 && (
                        <span className="ps-selection-count">{selectedIds.size} sélectionné(s)</span>
                    )}
                </div>

                <div className="ps-actions-grid">
                    {/* Signature Section */}
                    <div className="ps-action-section">
                        <h4>✍️ Signatures</h4>
                        <div className="ps-signature-options">
                            <p className="ps-option-label" style={{ marginBottom: 8 }}>Sélectionner une signature:</p>
                            <div className="ps-signature-grid">
                                {subadmins.filter(sa => sa.hasSignature && sa.signatureUrl).map(sa => (
                                    <div
                                        key={sa._id}
                                        className={`ps-signature-card ${selectedSubadminId === sa._id ? 'selected' : ''}`}
                                        onClick={() => { setSignatureSource('subadmin'); setSelectedSubadminId(sa._id) }}
                                    >
                                        <img src={sa.signatureUrl!} alt={sa.displayName} className="ps-signature-preview" />
                                        <span className="ps-signature-name">{sa.displayName}</span>
                                        {selectedSubadminId === sa._id && <span className="ps-signature-check">✓</span>}
                                    </div>
                                ))}
                            </div>
                            {subadmins.filter(sa => sa.hasSignature).length === 0 && (
                                <p className="ps-no-signatures">Aucun sous-admin avec signature configurée</p>
                            )}
                        </div>

                        {/* Custom signature dates */}
                        <div className="ps-date-pickers" style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, color: '#64748b' }}>📅 Date Sem1 (Signé le):</label>
                                <input
                                    type="date"
                                    value={sem1Date}
                                    onChange={e => setSem1Date(e.target.value)}
                                    className="ps-filter-select"
                                    style={{ padding: '6px 10px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, color: '#64748b' }}>📅 Date Sem2 (Signé le):</label>
                                <input
                                    type="date"
                                    value={sem2Date}
                                    onChange={e => setSem2Date(e.target.value)}
                                    className="ps-filter-select"
                                    style={{ padding: '6px 10px' }}
                                />
                            </div>
                        </div>

                        <div className="ps-sign-buttons">
                            <button
                                className="ps-btn primary"
                                onClick={() => handleBatchSign('sem1')}
                                disabled={processing || !selectedSubadminId}
                            >
                                {processing ? '⏳...' : `✍️ Sem1 ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                            </button>
                            <button
                                className="ps-btn primary"
                                onClick={() => handleBatchSign('sem2')}
                                disabled={processing || !selectedSubadminId}
                            >
                                {processing ? '⏳...' : `✍️ Sem2 ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                            </button>
                            <button
                                className="ps-btn success"
                                onClick={() => handleBatchSign('both')}
                                disabled={processing || !selectedSubadminId}
                            >
                                {processing ? '⏳...' : `✍️ Les Deux ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                            </button>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <button
                                className="ps-btn danger"
                                onClick={handleBatchUnsign}
                                disabled={processing}
                            >
                                {processing ? '⏳ En cours...' : `↩️ Annuler signatures ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                            </button>
                        </div>
                    </div>

                    {/* Promotion Section */}
                    <div className="ps-action-section">
                        <h4>🎓 Promotion PS → MS</h4>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                            Les élèves doivent être signés (Sem2) pour être promus.<br />
                            Après promotion, ils apparaîtront dans la page Ressources comme "Promus" pour l'assignation de classe MS.
                        </p>
                        <div className="ps-promote-buttons">
                            <button
                                className="ps-btn success"
                                onClick={handleBatchPromote}
                                disabled={processing}
                            >
                                {processing ? '⏳ En cours...' : `🎓 Promouvoir ${selectedIds.size > 0 ? `(${selectedIds.size})` : 'éligibles'}`}
                            </button>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <button
                                className="ps-btn danger"
                                onClick={handleBatchUnpromote}
                                disabled={processing}
                            >
                                {processing ? '⏳ En cours...' : `↩️ Annuler promotion ${selectedIds.size > 0 ? `(${selectedIds.size})` : 'promus'}`}
                            </button>
                        </div>
                    </div>

                    {/* Export Section */}
                    <div className="ps-action-section">
                        <h4>📄 Export PDF</h4>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                            Exporter les carnets en PDF (sans les blocs de signature).
                        </p>
                        <div className="ps-export-buttons">
                            <button
                                className="ps-btn primary"
                                onClick={handleBatchExport}
                                disabled={processing}
                            >
                                {processing ? '⏳ Export...' : `📄 Exporter ${selectedIds.size > 0 ? `(${selectedIds.size})` : 'tous'}`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`ps-toast ${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}
        </div>
    )
}
