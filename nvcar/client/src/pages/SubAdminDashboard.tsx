import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../api'
import ProgressionChart from '../components/ProgressionChart'
import { useSchoolYear } from '../context/SchoolYearContext'
import { openBatchPdfExport } from '../utils/pdfExport'
import { AlertTriangle, CheckCircle2, Download, PenTool, TrendingUp, Users, BookOpen, Lightbulb, ArrowRight } from 'lucide-react'

type Teacher = { _id: string; email: string; displayName: string }
type PendingTemplate = {
    _id: string
    studentId?: string
    status: string
    isCompleted?: boolean
    completedAt?: Date
    template?: { name: string }
    student?: { firstName: string; lastName: string; avatarUrl?: string }
    signature?: { signedAt: Date; subAdminId: string }
    signatures?: {
        standard?: { signedAt: Date; subAdminId: string } | null
        final?: { signedAt: Date; subAdminId: string } | null
    }
    className?: string
    level?: string
    isPromoted?: boolean
}
type ClassInfo = {
    _id: string
    name: string
    pendingSignatures: number
    totalAssignments: number
    signedAssignments: number
}
type PromotedStudent = {
    _id: string
    firstName: string
    lastName: string
    avatarUrl?: string
    fromLevel: string
    toLevel: string
    date: string
    assignmentId?: string | null
}

export default function SubAdminDashboard() {
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe')
    const apiPrefix = isAefeUser ? '/aefe' : '/subadmin'
    const routePrefix = isAefeUser ? '/aefe' : '/subadmin'
    const { activeYear, isLoading: schoolYearLoading } = useSchoolYear()
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [pending, setPending] = useState<PendingTemplate[]>([])
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [promotedStudents, setPromotedStudents] = useState<PromotedStudent[]>([])
    const [filter, setFilter] = useState<'all' | 'signed' | 'unsigned'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({})
    const [expandedPromotions, setExpandedPromotions] = useState<Record<string, boolean>>({})
    const [promotionDownloads, setPromotionDownloads] = useState<Record<string, { status: 'idle' | 'preparing' | 'downloading' | 'done' | 'error'; progress: number; error?: string }>>({})
    const [hasSignature, setHasSignature] = useState<boolean | null>(null)

    // Check if user has a signature
    useEffect(() => {
        const checkSignature = async () => {
            try {
                const r = await api.get(`${apiPrefix}/signature`)
                setHasSignature(!!r.data.signatureUrl)
            } catch (e: any) {
                if (e.response?.status === 404) {
                    setHasSignature(false)
                } else {
                    console.error('Error checking signature:', e)
                }
            }
        }
        checkSignature()
    }, [apiPrefix])

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [teachersRes, pendingRes, classesRes, promotedRes] = await Promise.all([
                    api.get(`${apiPrefix}/teachers`),
                    api.get(`${apiPrefix}/pending-signatures`),
                    api.get(`${apiPrefix}/classes`),
                    api.get(`${apiPrefix}/promoted-students`),
                ])
                setTeachers(teachersRes.data)
                setPending(pendingRes.data)
                setClasses(classesRes.data)
                setPromotedStudents(promotedRes.data)
            } catch (e: any) {
                setError('Impossible de charger les données: ' + (e.response?.data?.message || e.message))
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [apiPrefix])

    const isSem1Signed = (p: PendingTemplate) => {
        return !!(p.signatures?.standard || p.signature)
    }

    const isSem2Signed = (p: PendingTemplate) => {
        return !!p.signatures?.final
    }

    const isAnySigned = (p: PendingTemplate) => {
        return isSem1Signed(p) || isSem2Signed(p)
    }

    const filteredPending = pending.filter(p => {
        if (filter === 'all') return true
        if (filter === 'signed') return isAnySigned(p)
        if (filter === 'unsigned') return !isAnySigned(p)
        return true
    })

    const groupTemplates = (templates: PendingTemplate[]) => {
        const grouped: Record<string, Record<string, PendingTemplate[]>> = {}

        templates.forEach(t => {
            const level = t.level || 'Sans niveau'
            const className = t.className || 'Sans classe'

            if (!grouped[level]) grouped[level] = {}
            if (!grouped[level][className]) grouped[level][className] = []

            grouped[level][className].push(t)
        })

        return grouped
    }

    const groupedTemplates = groupTemplates(filteredPending)
    const groupedAllTemplates = groupTemplates(pending)
    const sortedLevels = Object.keys(groupedTemplates).sort()

    const toggleClass = (level: string, className: string) => {
        const key = `${level}-${className}`
        setExpandedClasses(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const togglePromotionGroup = (group: string) => {
        setExpandedPromotions(prev => ({ ...prev, [group]: !prev[group] }))
    }

    const downloadPromotionGroupZip = async (group: string, students: PromotedStudent[]) => {
        const assignmentIds = students.map(s => s.assignmentId).filter(Boolean) as string[]
        if (assignmentIds.length === 0) return

        // Use the new progress page in a new tab for batch exports
        const base = (api.defaults.baseURL || '').replace(/\/$/, '')
        openBatchPdfExport(base, assignmentIds, group, `Carnets - ${group}`)
    }

    // Calculate statistics
    const totalStudents = pending.length
    const sem1SignedCount = pending.filter(isSem1Signed).length
    const sem2SignedCount = pending.filter(isSem2Signed).length

    const levelStatsSem1 = Object.keys(groupedAllTemplates).reduce((acc, level) => {
        const templatesInLevel = Object.values(groupedAllTemplates[level]).flat()
        const total = templatesInLevel.length
        const signed = templatesInLevel.filter(isSem1Signed).length
        acc[level] = { total, signed }
        return acc
    }, {} as Record<string, { total: number, signed: number }>)

    const breakdownSem1 = Object.entries(levelStatsSem1)
        .map(([level, stats]) => ({
            label: level,
            total: stats.total,
            completed: stats.signed
        }))
        .sort((a, b) => a.label.localeCompare(b.label))

    const levelStatsSem2 = Object.keys(groupedAllTemplates).reduce((acc, level) => {
        const templatesInLevel = Object.values(groupedAllTemplates[level]).flat()
        const total = templatesInLevel.length
        const signed = templatesInLevel.filter(isSem2Signed).length
        acc[level] = { total, signed }
        return acc
    }, {} as Record<string, { total: number, signed: number }>)

    const breakdownSem2 = Object.entries(levelStatsSem2)
        .map(([level, stats]) => ({
            label: level,
            total: stats.total,
            completed: stats.signed
        }))
        .sort((a, b) => a.label.localeCompare(b.label))

    const activeSemester = activeYear?.activeSemester === 2 ? 2 : 1
    const activeSemesterLabel = activeSemester === 1 ? 'Semestre 1' : 'Semestre 2'
    const activeCompletedCount = activeSemester === 1 ? sem1SignedCount : sem2SignedCount
    const activeBreakdown = activeSemester === 1 ? breakdownSem1 : breakdownSem2

    return (
        <div className="container">
            <div className="card">
                {/* Minimal Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 28,
                    flexWrap: 'wrap',
                    gap: 16
                }}>
                    <div>
                        <h2 style={{
                            fontSize: 26,
                            margin: 0,
                            color: '#0f172a',
                            fontWeight: 700,
                            letterSpacing: '-0.02em'
                        }}>
                            Tableau de bord
                        </h2>
                        {!isAefeUser && (
                            <p style={{
                                margin: '6px 0 0 0',
                                fontSize: 14,
                                color: '#64748b',
                                fontWeight: 400
                            }}>
                                {totalStudents > 0 ? `${totalStudents} élève${totalStudents > 1 ? 's' : ''} • ${classes.length} classe${classes.length > 1 ? 's' : ''}` : 'Aucun élève'}
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #e2e8f0'
                        }}>
                            {activeSemesterLabel}
                        </span>
                        {activeYear?.name && (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 8,
                                background: '#eef2ff',
                                color: '#4f46e5',
                                border: '1px solid #c7d2fe'
                            }}>
                                {activeYear.name}
                            </span>
                        )}
                    </div>
                </div>

                {/* Signature Warning Notice */}
                {hasSignature === false && !isAefeUser && (
                    <Link to={`${routePrefix}/signature`} style={{ textDecoration: 'none' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            marginBottom: 16,
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: 8,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#fee2e2'
                                e.currentTarget.style.borderColor = '#f87171'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fef2f2'
                                e.currentTarget.style.borderColor = '#fecaca'
                            }}>
                            <PenTool size={14} color="#dc2626" />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
                                Signature manquante — Cliquez pour ajouter
                            </span>
                        </div>
                    </Link>
                )}


                {loading && (
                    <div style={{
                        textAlign: 'center',
                        padding: 40,
                        color: '#64748b',
                        fontSize: 14
                    }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            border: '3px solid #e2e8f0',
                            borderTopColor: '#6366f1',
                            borderRadius: '50%',
                            margin: '0 auto 12px',
                            animation: 'spin 1s linear infinite'
                        }} />
                        Chargement...
                    </div>
                )}
                {error && (
                    <div style={{
                        color: '#dc2626',
                        background: '#fef2f2',
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: '1px solid #fecaca',
                        fontSize: 14,
                        fontWeight: 500,
                        marginBottom: 20
                    }}>
                        {error}
                    </div>
                )}

                {/* AEFE users see a simplified navigation dashboard */}
                {isAefeUser && !loading && (
                    <div style={{ padding: '20px 0' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 24,
                            marginBottom: 32
                        }}>
                            {/* Progression Card */}
                            <a
                                href="/aefe/progress"
                                style={{
                                    textDecoration: 'none',
                                    display: 'block',
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    borderRadius: 20,
                                    padding: 28,
                                    color: 'white',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 40px -10px rgba(102, 126, 234, 0.5)',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 20px 50px -10px rgba(102, 126, 234, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 40px -10px rgba(102, 126, 234, 0.5)';
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: -20,
                                    right: -20,
                                    width: 120,
                                    height: 120,
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    bottom: -30,
                                    right: 40,
                                    width: 80,
                                    height: 80,
                                    background: 'rgba(255,255,255,0.08)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: 14,
                                        padding: 12,
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <TrendingUp size={28} strokeWidth={2} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Progression</h3>
                                </div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.9, lineHeight: 1.6 }}>
                                    Suivez la progression globale des élèves et les statistiques de complétion par niveau
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, opacity: 0.9 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>Accéder</span>
                                    <ArrowRight size={18} />
                                </div>
                            </a>

                            {/* Suivi Enseignants Card */}
                            <a
                                href="/aefe/teacher-progress"
                                style={{
                                    textDecoration: 'none',
                                    display: 'block',
                                    background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                                    borderRadius: 20,
                                    padding: 28,
                                    color: 'white',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 40px -10px rgba(17, 153, 142, 0.5)',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 20px 50px -10px rgba(17, 153, 142, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 40px -10px rgba(17, 153, 142, 0.5)';
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: -20,
                                    right: -20,
                                    width: 120,
                                    height: 120,
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    bottom: -30,
                                    right: 40,
                                    width: 80,
                                    height: 80,
                                    background: 'rgba(255,255,255,0.08)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: 14,
                                        padding: 12,
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <Users size={28} strokeWidth={2} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Suivi Enseignants</h3>
                                </div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.9, lineHeight: 1.6 }}>
                                    Consultez le travail des enseignants et leur avancement dans la saisie des carnets
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, opacity: 0.9 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>Accéder</span>
                                    <ArrowRight size={18} />
                                </div>
                            </a>

                            {/* Carnet Card */}
                            <a
                                href="/aefe/gradebooks"
                                style={{
                                    textDecoration: 'none',
                                    display: 'block',
                                    background: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
                                    borderRadius: 20,
                                    padding: 28,
                                    color: 'white',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 40px -10px rgba(255, 107, 107, 0.5)',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 20px 50px -10px rgba(255, 107, 107, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 40px -10px rgba(255, 107, 107, 0.5)';
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: -20,
                                    right: -20,
                                    width: 120,
                                    height: 120,
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    bottom: -30,
                                    right: 40,
                                    width: 80,
                                    height: 80,
                                    background: 'rgba(255,255,255,0.08)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: 14,
                                        padding: 12,
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <BookOpen size={28} strokeWidth={2} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Carnet</h3>
                                </div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.9, lineHeight: 1.6 }}>
                                    Accédez aux carnets des élèves pour les consulter et les télécharger
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, opacity: 0.9 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>Accéder</span>
                                    <ArrowRight size={18} />
                                </div>
                            </a>

                            {/* Suggestion Card */}
                            <a
                                href="/aefe/suggestion"
                                style={{
                                    textDecoration: 'none',
                                    display: 'block',
                                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                    borderRadius: 20,
                                    padding: 28,
                                    color: 'white',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 40px -10px rgba(79, 172, 254, 0.5)',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 20px 50px -10px rgba(79, 172, 254, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 40px -10px rgba(79, 172, 254, 0.5)';
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: -20,
                                    right: -20,
                                    width: 120,
                                    height: 120,
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    bottom: -30,
                                    right: 40,
                                    width: 80,
                                    height: 80,
                                    background: 'rgba(255,255,255,0.08)',
                                    borderRadius: '50%'
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: 14,
                                        padding: 12,
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <Lightbulb size={28} strokeWidth={2} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Suggestion</h3>
                                </div>
                                <p style={{ margin: 0, fontSize: 14, opacity: 0.9, lineHeight: 1.6 }}>
                                    Proposez des suggestions d'appréciations aux enseignants pour améliorer les carnets
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, opacity: 0.9 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>Accéder</span>
                                    <ArrowRight size={18} />
                                </div>
                            </a>
                        </div>
                    </div>
                )}

                {/* Regular SubAdmin dashboard content - hidden for AEFE users */}
                {!isAefeUser && (
                    <>
                        {/* Progression Chart */}
                        {!loading && (
                            <ProgressionChart
                                title={`📊 Progression — ${activeSemesterLabel}`}
                                total={totalStudents}
                                completed={activeCompletedCount}
                                breakdown={activeBreakdown}
                            />
                        )}

                        {/* Promoted Students Section */}
                        {promotedStudents.length > 0 && (
                            <div style={{ marginBottom: 32 }}>
                                <h3 style={{ fontSize: 22, color: '#1e293b', fontWeight: 600, marginBottom: 16 }}>🎓 Élèves Promus (En attente d'affectation)</h3>

                                {Object.entries(promotedStudents.reduce((acc, student) => {
                                    const key = `${student.fromLevel || '?'} → ${student.toLevel || '?'}`
                                    if (!acc[key]) acc[key] = []
                                    acc[key].push(student)
                                    return acc
                                }, {} as Record<string, PromotedStudent[]>)).sort().map(([group, students]) => {
                                    const isExpanded = expandedPromotions[group]
                                    return (
                                        <div key={group} style={{ marginBottom: 20, borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', background: 'white' }}>
                                            {(() => {
                                                const s = promotionDownloads[group] || { status: 'idle' as const, progress: 0 }
                                                const availableCount = students.filter(st => !!st.assignmentId).length
                                                const totalCount = students.length
                                                const isBusy = s.status === 'preparing' || s.status === 'downloading'
                                                const canDownload = availableCount > 0
                                                const isDisabled = !canDownload || isBusy

                                                let buttonLabel = `Télécharger (${availableCount})`
                                                if (s.status === 'preparing') buttonLabel = 'Préparation…'
                                                if (s.status === 'downloading') buttonLabel = s.progress === -1 ? 'Génération…' : `Téléchargement ${s.progress}%`
                                                if (s.status === 'done') buttonLabel = 'Téléchargé'
                                                if (s.status === 'error') buttonLabel = 'Réessayer'

                                                const showStatus = s.status !== 'idle'
                                                const showProgress = s.status === 'preparing' || s.status === 'downloading'

                                                const showSpinner = s.status === 'preparing' || (s.status === 'downloading' && s.progress === -1)

                                                return (
                                                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                            <div
                                                                onClick={() => togglePromotionGroup(group)}
                                                                style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: 12, color: '#64748b' }}>{isExpanded ? '▼' : '▶'}</span>
                                                                    <h4 style={{ fontSize: 16, color: '#0f172a', margin: 0, fontWeight: 700 }}>{group}</h4>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#ffffff', fontSize: 12, color: '#475569', fontWeight: 600 }}>
                                                                        {availableCount}/{totalCount} carnets
                                                                    </span>
                                                                    {!canDownload && (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: '1px solid #fed7aa', background: '#fff7ed', fontSize: 12, color: '#9a3412', fontWeight: 700 }}>
                                                                            Aucun carnet disponible
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {showStatus && (
                                                                    <div aria-live="polite" style={{ marginTop: 8, fontSize: 13, color: s.status === 'error' ? '#b91c1c' : '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        {showSpinner && <span className="spinner" aria-hidden="true" />}
                                                                        {s.status === 'done' && <CheckCircle2 size={16} color="#16a34a" />}
                                                                        {s.status === 'error' && <AlertTriangle size={16} color="#b91c1c" />}
                                                                        {s.status === 'preparing' && 'Préparation de l’archive…'}
                                                                        {s.status === 'downloading' && (s.progress === -1 ? 'Génération des carnets…' : `Téléchargement en cours… ${s.progress}%`)}
                                                                        {s.status === 'done' && 'Téléchargement terminé'}
                                                                        {s.status === 'error' && (s.error || 'Erreur pendant le téléchargement')}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                                                                <button
                                                                    onClick={() => downloadPromotionGroupZip(group, students)}
                                                                    disabled={isDisabled}
                                                                    className="btn"
                                                                    style={{
                                                                        padding: '10px 12px',
                                                                        fontSize: 13,
                                                                        background: s.status === 'error' ? '#b91c1c' : '#0f172a',
                                                                        color: 'white',
                                                                        borderRadius: 10,
                                                                        border: `1px solid ${s.status === 'error' ? '#b91c1c' : '#0f172a'}`,
                                                                        opacity: isDisabled ? 0.55 : 1,
                                                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: 8
                                                                    }}
                                                                >
                                                                    <Download size={16} />
                                                                    {buttonLabel}
                                                                </button>

                                                                {showProgress && (
                                                                    <div style={{ width: 260 }}>
                                                                        {s.progress === -1 ? (
                                                                            <div className="progress-track progress-indeterminate" />
                                                                        ) : (
                                                                            <div className="progress-track">
                                                                                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, s.progress))}%` }} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })()}

                                            {isExpanded && (
                                                <div style={{
                                                    background: 'white',
                                                    borderRadius: 0,
                                                    overflow: 'hidden'
                                                }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Élève</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Date de promotion</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#64748b', fontWeight: 600 }}>Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {students.map(student => (
                                                                <tr key={student._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                            {student.avatarUrl && (
                                                                                <img
                                                                                    src={student.avatarUrl}
                                                                                    alt=""
                                                                                    style={{
                                                                                        width: 24,
                                                                                        height: 24,
                                                                                        borderRadius: '50%',
                                                                                        objectFit: 'cover',
                                                                                        border: '1px solid #e2e8f0'
                                                                                    }}
                                                                                />
                                                                            )}
                                                                            <span>{student.firstName} {student.lastName}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                                                                        {new Date(student.date).toLocaleDateString('fr-FR')}
                                                                    </td>
                                                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                        {student.assignmentId && (
                                                                            <Link
                                                                                to={`${routePrefix}/templates/${student.assignmentId}/review`}
                                                                                style={{
                                                                                    display: 'inline-block',
                                                                                    padding: '6px 12px',
                                                                                    background: '#3b82f6',
                                                                                    color: 'white',
                                                                                    borderRadius: 6,
                                                                                    textDecoration: 'none',
                                                                                    fontSize: 13,
                                                                                    fontWeight: 500
                                                                                }}
                                                                            >
                                                                                Voir le carnet
                                                                            </Link>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Tous les carnets Section (Moved to Top) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 22, color: '#1e293b', fontWeight: 600 }}>📋 Tous les carnets</h3>
                            <select
                                value={filter}
                                onChange={e => setFilter(e.target.value as any)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    border: '1px solid #cbd5e1',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: '#475569',
                                    background: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">Tous</option>
                                <option value="signed">Signés</option>
                                <option value="unsigned">Non signés</option>
                            </select>
                        </div>

                        {sortedLevels.length > 0 ? (
                            sortedLevels.map(level => (
                                <div key={level} style={{ marginBottom: 24 }}>
                                    <h4 style={{ fontSize: 18, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
                                        Niveau: {level}
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {Object.keys(groupedTemplates[level]).sort().map(className => {
                                            const templates = groupedTemplates[level][className]
                                            const key = `${level}-${className}`
                                            const isExpanded = expandedClasses[key]
                                            const sem1SignedInClass = templates.filter(isSem1Signed).length
                                            const sem2SignedInClass = templates.filter(isSem2Signed).length
                                            const totalCount = templates.length

                                            return (
                                                <div key={className} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                                    <div
                                                        onClick={() => toggleClass(level, className)}
                                                        style={{
                                                            padding: '12px 16px',
                                                            background: '#f8fafc',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: 12, color: '#64748b' }}>{isExpanded ? '▼' : '▶'}</span>
                                                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{className}</span>
                                                        </div>
                                                        <div style={{ fontSize: 14, color: '#64748b' }}>
                                                            <span style={{ color: '#334155', fontWeight: 600 }}>S1</span> {sem1SignedInClass}/{totalCount}
                                                            <span style={{ color: '#94a3b8', margin: '0 8px' }}>•</span>
                                                            <span style={{ color: '#334155', fontWeight: 600 }}>S2</span> {sem2SignedInClass}/{totalCount}
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, background: 'white', borderTop: '1px solid #e2e8f0' }}>
                                                            {Object.values(
                                                                templates.reduce((acc, t) => {
                                                                    const key = t.studentId || (t.student ? `${t.student.firstName} ${t.student.lastName}` : 'unknown')
                                                                    if (!acc[key]) acc[key] = []
                                                                    acc[key].push(t)
                                                                    return acc
                                                                }, {} as Record<string, PendingTemplate[]>)
                                                            ).sort((a, b) => {
                                                                const nameA = a[0]?.student ? `${a[0].student.lastName} ${a[0].student.firstName}` : ''
                                                                const nameB = b[0]?.student ? `${b[0].student.lastName} ${b[0].student.firstName}` : ''
                                                                return nameA.localeCompare(nameB)
                                                            }).map(studentTemplates => {
                                                                const student = studentTemplates[0].student
                                                                const isPromoted = studentTemplates.some(t => t.isPromoted)

                                                                return (
                                                                    <div key={studentTemplates[0].studentId || Math.random().toString()} className="card" style={{
                                                                        border: isPromoted ? '1px solid #86efac' : '1px solid #e2e8f0',
                                                                        background: isPromoted ? '#f0fdf4' : '#fff',
                                                                        padding: 16,
                                                                        borderRadius: 10,
                                                                        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                                                    }}>
                                                                        <div style={{ marginBottom: 12 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                                                {student?.avatarUrl && (
                                                                                    <img
                                                                                        src={student.avatarUrl}
                                                                                        alt=""
                                                                                        style={{
                                                                                            width: 32,
                                                                                            height: 32,
                                                                                            borderRadius: '50%',
                                                                                            objectFit: 'cover',
                                                                                            border: '1px solid #e2e8f0'
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                <h3 style={{ fontSize: 18, color: '#1e293b', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {student ? `${student.firstName} ${student.lastName}` : 'Élève Inconnu'}
                                                                                </h3>
                                                                                {isPromoted ? (
                                                                                    <span style={{
                                                                                        fontSize: 10,
                                                                                        background: '#166534',
                                                                                        color: '#fff',
                                                                                        padding: '2px 8px',
                                                                                        borderRadius: 12,
                                                                                        fontWeight: 600,
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}>
                                                                                        Promu
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{
                                                                                        fontSize: 10,
                                                                                        background: '#f1f5f9',
                                                                                        color: '#64748b',
                                                                                        padding: '2px 8px',
                                                                                        borderRadius: 12,
                                                                                        fontWeight: 600,
                                                                                        whiteSpace: 'nowrap',
                                                                                        border: '1px solid #cbd5e1'
                                                                                    }}>
                                                                                        Non promu
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                            {studentTemplates.map(p => (
                                                                                <Link key={p._id} to={`${routePrefix}/templates/${p._id}/review`} style={{ textDecoration: 'none' }}>
                                                                                    <div style={{
                                                                                        padding: '8px 10px',
                                                                                        background: '#f8fafc',
                                                                                        borderRadius: 6,
                                                                                        border: '1px solid #e2e8f0',
                                                                                        transition: 'all 0.2s',
                                                                                        display: 'flex',
                                                                                        justifyContent: 'space-between',
                                                                                        alignItems: 'center'
                                                                                    }}
                                                                                        onMouseEnter={(e) => {
                                                                                            e.currentTarget.style.borderColor = '#94a3b8';
                                                                                            e.currentTarget.style.background = '#f1f5f9';
                                                                                        }}
                                                                                        onMouseLeave={(e) => {
                                                                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                                                                            e.currentTarget.style.background = '#f8fafc';
                                                                                        }}>
                                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                                Ouvrir
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                                                                                                    <span style={{ color: '#64748b' }}>Mi-année</span>
                                                                                                    {p.signatures?.standard ? (
                                                                                                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>
                                                                                                            ✓ Signé
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                                                            ⏳
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                                                                                                    <span style={{ color: '#64748b' }}>Fin d'année</span>
                                                                                                    {p.signatures?.final ? (
                                                                                                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>
                                                                                                            ✓ Signé
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                                                            ⏳
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>
                                                                                            →
                                                                                        </div>
                                                                                    </div>
                                                                                </Link>
                                                                            ))}
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
                                </div>
                            ))
                        ) : (
                            !loading && (
                                <div className="note">
                                    {filter === 'all' ? 'Aucun carnet.' : filter === 'signed' ? 'Aucun carnet signé.' : 'Aucun carnet non signé.'}
                                </div>
                            )
                        )}

                    </>
                )}
            </div>
        </div>
    )
}
