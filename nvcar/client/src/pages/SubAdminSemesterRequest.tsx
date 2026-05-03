import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import {
    CheckCircle2,
    Send,
    AlertCircle,
    Clock,
    Calendar,
    ArrowRight,
    Sparkles,
    FileText,
    ChevronRight,
    History,
    PlusCircle,
    XCircle,
    MessageSquare,
    RotateCcw
} from 'lucide-react'
import { useSchoolYear } from '../context/SchoolYearContext'

type RequestType = 'semester_switch' | 'next_year_request' | 'reopen_gradebook'

interface RequestOption {
    id: RequestType
    icon: React.ReactNode
    title: string
    description: string
    gradient: string
    borderColor: string
    bgColor: string
    iconBg: string
    apiType: string
    originalText: string
    suggestedText: string
}

interface Suggestion {
    _id: string
    type: string
    status: 'pending' | 'approved' | 'rejected'
    suggestedText: string
    originalText?: string
    adminComment?: string
    createdAt: string
    templateId?: string
}

export default function SubAdminSemesterRequest() {
    const navigate = useNavigate()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const { activeYear, isLoading: schoolYearLoading } = useSchoolYear()
    const [requestType, setRequestType] = useState<RequestType | null>(null)
    const [message, setMessage] = useState('')
    const [hovered, setHovered] = useState<RequestType | null>(null)
    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new')
    const [historyItems, setHistoryItems] = useState<Suggestion[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const activeSemester = activeYear?.activeSemester === 2 ? 2 : 1
    const loadingInfo = schoolYearLoading

    const fetchHistory = async () => {
        try {
            setLoadingHistory(true)
            const r = await api.get('/suggestions/mine')
            setHistoryItems(Array.isArray(r.data) ? r.data : [])
        } catch (e) {
            console.error('Failed to fetch history:', e)
        } finally {
            setLoadingHistory(false)
        }
    }

    useEffect(() => {
        fetchHistory()
    }, [])

    const requestOptions: RequestOption[] = [
        {
            id: 'semester_switch',
            icon: <Clock size={24} />,
            title: 'Passage au Semestre 2',
            description: 'Demander l\'ouverture de la saisie pour la deuxième période de l\'année scolaire.',
            gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            borderColor: '#3b82f6',
            bgColor: '#eff6ff',
            iconBg: '#3b82f6',
            apiType: 'semester_request',
            originalText: 'Passage Semestre 2',
            suggestedText: 'Demande de passage au Semestre 2.'
        },
        {
            id: 'next_year_request',
            icon: <Calendar size={24} />,
            title: 'Passage à l\'Année Suivante',
            description: 'Demander la transition vers la prochaine année scolaire et la promotion des élèves.',
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            borderColor: '#8b5cf6',
            bgColor: '#f5f3ff',
            iconBg: '#8b5cf6',
            apiType: 'next_year_request',
            originalText: 'Passage Année Suivante',
            suggestedText: 'Demande de passage à l\'année scolaire suivante.'
        },
        {
            id: 'reopen_gradebook',
            icon: <RotateCcw size={24} />,
            title: 'Réouverture de Carnet',
            description: 'Demander le déblocage d\'un carnet déjà clôturé ou validé pour correction.',
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderColor: '#f59e0b',
            bgColor: '#fffbeb',
            iconBg: '#f59e0b',
            apiType: 'reopen_request',
            originalText: 'Réouverture de Carnet',
            suggestedText: 'Demande de réouverture pour correction.'
        }
    ]

    const selectedOption = requestOptions.find(o => o.id === requestType)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedOption) {
            setError('Veuillez sélectionner un type de demande.')
            return
        }

        try {
            setLoading(true)
            setError('')

            let suggestedText = selectedOption.suggestedText
            if (message) {
                suggestedText += `\n\nNote: ${message}`
            }

            await api.post('/suggestions', {
                type: selectedOption.apiType,
                originalText: selectedOption.originalText,
                suggestedText
            })

            setSuccess(true)
            setMessage('')
            setRequestType(null)
            fetchHistory() // Refresh history after success
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || e.message
            setError('Erreur lors de l\'envoi de la demande: ' + errorMsg)
        } finally {
            setLoading(false)
        }
    }

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'approved':
                return { bg: '#dcfce7', text: '#166534', icon: <CheckCircle2 size={14} /> }
            case 'rejected':
                return { bg: '#fee2e2', text: '#991b1b', icon: <XCircle size={14} /> }
            default:
                return { bg: '#fef3c7', text: '#92400e', icon: <Clock size={14} /> }
        }
    }

    const getFriendlyType = (type: string) => {
        switch (type) {
            case 'semester_request': return 'Passage Semestre 2'
            case 'next_year_request': return 'Passage Année Suivante'
            case 'reopen_request': return 'Réouverture'
            case 'template_edit': return 'Modif. Carnet'
            default: return type
        }
    }

    if (loadingInfo) {
        return (
            <div className="container">
                <div className="card" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 400,
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        border: '4px solid #e2e8f0',
                        borderTopColor: '#3b82f6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="container">
                <div className="card" style={{
                    textAlign: 'center',
                    padding: '80px 40px',
                    borderRadius: 24,
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{
                        width: 110,
                        height: 110,
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        borderRadius: '35%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 32px',
                        boxShadow: '0 20px 40px -12px rgba(34, 197, 94, 0.4)',
                        animation: 'successPulse 2s ease-in-out infinite'
                    }}>
                        <CheckCircle2 size={56} color="white" />
                    </div>
                    <h2 style={{
                        fontSize: 34,
                        color: '#1e293b',
                        marginBottom: 16,
                        fontWeight: 800,
                        letterSpacing: '-0.02em'
                    }}>
                        Demande transmise !
                    </h2>
                    <p style={{
                        color: '#64748b',
                        fontSize: 18,
                        maxWidth: 520,
                        margin: '0 auto 48px',
                        lineHeight: 1.7
                    }}>
                        Votre demande a été envoyée avec succès à l'administration.
                        Vous pouvez suivre son état dans l'onglet historique.
                    </p>
                    <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            className="btn secondary"
                            onClick={() => navigate(isAefeUser ? '/aefe/dashboard' : '/subadmin/dashboard')}
                            style={{
                                padding: '16px 32px',
                                borderRadius: 14,
                                fontSize: 16,
                                fontWeight: 600
                            }}
                        >
                            Tableau de bord
                        </button>
                        <button
                            className="btn primary"
                            onClick={() => { setSuccess(false); setActiveTab('history'); }}
                            style={{
                                padding: '16px 32px',
                                borderRadius: 14,
                                fontSize: 16,
                                fontWeight: 600,
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10
                            }}
                        >
                            <History size={20} />
                            Voir l'historique
                        </button>
                    </div>
                    <style>{`
                        @keyframes successPulse {
                            0%, 100% { transform: scale(1); rotate: 0deg; }
                            50% { transform: scale(1.05); rotate: 5deg; }
                        }
                    `}</style>
                </div>
            </div>
        )
    }

    return (
        <div className="container" style={{ paddingBottom: 60 }}>
            <div className="card" style={{
                padding: '0',
                borderRadius: 24,
                boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
                position: 'relative',
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.4)'
            }}>
                {/* Header Banner */}
                <div style={{
                    padding: '40px 48px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    position: 'relative'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{
                            width: 64,
                            height: 64,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            borderRadius: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)'
                        }}>
                            <Send size={30} color="white" />
                        </div>
                        <div>
                            <h1 style={{
                                fontSize: 32,
                                color: '#1e293b',
                                fontWeight: 800,
                                margin: 0,
                                letterSpacing: '-0.02em'
                            }}>
                                Centre de Demandes
                            </h1>
                            <p style={{
                                fontSize: 16,
                                color: '#64748b',
                                margin: '4px 0 0 0',
                                fontWeight: 500
                            }}>
                                Administration & Périodes scolaires
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                        <button
                            className="btn suggest-carnets-btn"
                            onClick={() => navigate(isAefeUser ? '/aefe/suggestion/gradebooks' : '/subadmin/suggestion/gradebooks')}
                            style={{
                                padding: '12px 24px',
                                borderRadius: 14,
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                color: '#1e293b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                                fontWeight: 700,
                                fontSize: 14
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#8b5cf6'
                                e.currentTarget.style.transform = 'translateY(-2px)'
                                e.currentTarget.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.15)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#e2e8f0'
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)'
                            }}
                        >
                            <FileText size={18} color="#8b5cf6" />
                            <span>Modifier les carnets</span>
                            <ChevronRight size={16} color="#94a3b8" />
                        </button>

                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            background: activeSemester === 1 ? '#fffbeb' : '#f0fdf4',
                            borderRadius: 12,
                            border: `1px solid ${activeSemester === 1 ? '#fef3c7' : '#dcfce7'}`
                        }}>
                            <div style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: activeSemester === 1 ? '#f59e0b' : '#22c55e',
                                animation: 'pulseStatus 2s infinite'
                            }} />
                            <span style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: activeSemester === 1 ? '#b45309' : '#15803d',
                                letterSpacing: '0.02em',
                                textTransform: 'uppercase'
                            }}>
                                Période Actuelle: Semestre {activeSemester} {activeYear?.name ? `(${activeYear.name})` : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tabs Selection */}
                <div style={{
                    display: 'flex',
                    background: '#f8fafc',
                    padding: '0 48px',
                    borderBottom: '1px solid #e2e8f0'
                }}>
                    <button
                        onClick={() => setActiveTab('new')}
                        style={{
                            padding: '20px 24px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: `3px solid ${activeTab === 'new' ? '#3b82f6' : 'transparent'}`,
                            color: activeTab === 'new' ? '#3b82f6' : '#64748b',
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'all 0.2s'
                        }}
                    >
                        <PlusCircle size={20} />
                        Nouvelle Demande
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        style={{
                            padding: '20px 24px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: `3px solid ${activeTab === 'history' ? '#3b82f6' : 'transparent'}`,
                            color: activeTab === 'history' ? '#3b82f6' : '#64748b',
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'all 0.2s'
                        }}
                    >
                        <History size={20} />
                        Historique
                        {historyItems.filter(i => i.status === 'pending').length > 0 && (
                            <span style={{
                                background: '#3b82f6',
                                color: 'white',
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 10,
                                marginLeft: 4
                            }}>
                                {historyItems.filter(i => i.status === 'pending').length}
                            </span>
                        )}
                    </button>
                </div>

                <div style={{ padding: '48px' }}>
                    {activeTab === 'new' ? (
                        /* New Request Form */
                        <form onSubmit={handleSubmit} style={{ animation: 'fadeIn 0.4s ease-out' }}>
                            <div style={{ marginBottom: 40 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    color: '#334155',
                                    marginBottom: 20,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Choisissez une action
                                </label>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                    gap: 20
                                }}>
                                    {requestOptions.map(option => {
                                        const isSelected = requestType === option.id
                                        const isHovered = hovered === option.id
                                        const isDisabled = (option.id === 'semester_switch' && activeSemester !== 1) || (option.id === 'next_year_request' && activeSemester !== 2)
                                        const disabledReason = option.id === 'semester_switch' ? 'Déjà au semestre 2' : 'Disponible au semestre 2'

                                        return (
                                            <div
                                                key={option.id}
                                                onClick={() => !isDisabled && setRequestType(option.id)}
                                                onMouseEnter={() => !isDisabled && setHovered(option.id)}
                                                onMouseLeave={() => setHovered(null)}
                                                style={{
                                                    padding: '28px',
                                                    border: `2px solid ${isSelected ? option.borderColor : isHovered ? '#cbd5e1' : '#f1f5f9'}`,
                                                    borderRadius: 20,
                                                    background: isSelected ? option.bgColor : 'white',
                                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transform: (isSelected || (isHovered && !isDisabled)) ? 'translateY(-4px)' : 'translateY(0)',
                                                    boxShadow: isSelected
                                                        ? `0 15px 30px -10px ${option.borderColor}40`
                                                        : (isHovered && !isDisabled)
                                                            ? '0 10px 20px -5px rgba(0, 0, 0, 0.08)'
                                                            : 'none',
                                                    opacity: isDisabled ? 0.5 : 1,
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                {/* Visual indicator for disabled state */}
                                                {isDisabled && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        background: 'rgba(241, 245, 249, 0.4)',
                                                        zIndex: 2
                                                    }} />
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, position: 'relative', zIndex: 3 }}>
                                                    <div style={{
                                                        width: 56,
                                                        height: 56,
                                                        background: isSelected ? option.gradient : '#f8fafc',
                                                        borderRadius: 16,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: isSelected ? 'white' : '#64748b',
                                                        transition: 'all 0.3s ease',
                                                        flexShrink: 0,
                                                        boxShadow: isSelected ? '0 8px 16px -4px rgba(0,0,0,0.1)' : 'none'
                                                    }}>
                                                        {option.icon}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{
                                                            fontWeight: 800,
                                                            color: '#1e293b',
                                                            marginBottom: 8,
                                                            fontSize: 17
                                                        }}>
                                                            {option.title}
                                                        </div>
                                                        <div style={{
                                                            fontSize: 14,
                                                            color: '#64748b',
                                                            lineHeight: 1.6,
                                                            fontWeight: 500
                                                        }}>
                                                            {option.description}
                                                        </div>
                                                        {isDisabled && (
                                                            <div style={{
                                                                marginTop: 12,
                                                                padding: '6px 12px',
                                                                background: '#fffbeb',
                                                                borderRadius: 8,
                                                                fontSize: 12,
                                                                color: '#92400e',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 6,
                                                                fontWeight: 700
                                                            }}>
                                                                <AlertCircle size={14} />
                                                                Déjà au Semestre 2
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div style={{ marginBottom: 40 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    color: '#334155',
                                    marginBottom: 12,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Précisions supplémentaires
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder="Ex: 'Classe de CP-A à rouvrir', 'Problème de signature'..."
                                        style={{
                                            width: '100%',
                                            minHeight: 140,
                                            padding: '20px',
                                            borderRadius: 18,
                                            border: '2px solid #f1f5f9',
                                            background: '#f8fafc',
                                            fontSize: 16,
                                            resize: 'vertical',
                                            outline: 'none',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            fontFamily: 'inherit',
                                            lineHeight: 1.6,
                                            color: '#1e293b'
                                        }}
                                        onFocus={e => {
                                            e.target.style.borderColor = '#3b82f6'
                                            e.target.style.background = 'white'
                                            e.target.style.boxShadow = '0 10px 25px -10px rgba(59, 130, 246, 0.15)'
                                        }}
                                        onBlur={e => {
                                            e.target.style.borderColor = '#f1f5f9'
                                            e.target.style.background = '#f8fafc'
                                            e.target.style.boxShadow = 'none'
                                        }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 16,
                                        right: 16,
                                        color: '#94a3b8',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        pointerEvents: 'none'
                                    }}>
                                        {message.length} caractères
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div style={{
                                    padding: '20px',
                                    background: '#fff1f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: 16,
                                    color: '#be123c',
                                    fontSize: 15,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    marginBottom: 32,
                                    animation: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both'
                                }}>
                                    <AlertCircle size={22} />
                                    <span style={{ fontWeight: 600 }}>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="btn primary"
                                disabled={loading || !requestType}
                                style={{
                                    width: '100%',
                                    padding: '22px',
                                    fontSize: 18,
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 14,
                                    borderRadius: 18,
                                    background: requestType
                                        ? selectedOption?.gradient || 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                        : '#f1f5f9',
                                    border: 'none',
                                    color: requestType ? 'white' : '#94a3b8',
                                    cursor: !requestType || loading ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: requestType ? '0 15px 30px -8px rgba(59, 130, 246, 0.4)' : 'none'
                                }}
                            >
                                {loading ? (
                                    <>
                                        <div className="spinner" style={{ width: 24, height: 24, borderTopColor: 'white' }} />
                                        Transmission en cours...
                                    </>
                                ) : (
                                    <>
                                        <Send size={22} />
                                        Envoyer ma demande
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        /* History List */
                        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                    Vos dernières demandes
                                </h3>
                                <button
                                    onClick={fetchHistory}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#3b82f6',
                                        fontSize: 14,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                >
                                    <RotateCcw size={16} />
                                    Actualiser
                                </button>
                            </div>

                            {loadingHistory ? (
                                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                    <div className="spinner" style={{ margin: '0 auto 16px', width: 32, height: 32 }} />
                                    <div style={{ color: '#64748b', fontWeight: 600 }}>Chargement de l'historique...</div>
                                </div>
                            ) : historyItems.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '80px 40px',
                                    background: '#f8fafc',
                                    borderRadius: 24,
                                    border: '2px dashed #e2e8f0'
                                }}>
                                    <div style={{
                                        width: 64,
                                        height: 64,
                                        background: 'white',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 20px',
                                        color: '#cbd5e1',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <History size={32} />
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Aucun historique</div>
                                    <div style={{ color: '#94a3b8', fontSize: 15 }}>Vous n'avez pas encore effectué de demandes administratives.</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {historyItems.map(item => {
                                        const status = getStatusStyle(item.status)
                                        return (
                                            <div key={item._id} style={{
                                                background: 'white',
                                                border: '1px solid #f1f5f9',
                                                borderRadius: 18,
                                                padding: '20px 24px',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: 20
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = '#e2e8f0'
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)'
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = '#f1f5f9'
                                                e.currentTarget.style.boxShadow = 'none'
                                            }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                                        <span style={{
                                                            fontSize: 11,
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            color: '#64748b',
                                                            background: '#f1f5f9',
                                                            padding: '4px 10px',
                                                            borderRadius: 6,
                                                            letterSpacing: '0.05em'
                                                        }}>
                                                            {getFriendlyType(item.type)}
                                                        </span>
                                                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                                                            {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                                                                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        fontSize: 15,
                                                        color: '#1e293b',
                                                        fontWeight: 600,
                                                        lineHeight: 1.5,
                                                        whiteSpace: 'pre-wrap',
                                                        maxWidth: 500
                                                    }}>
                                                        {item.suggestedText}
                                                    </div>
                                                    {item.adminComment && (
                                                        <div style={{
                                                            marginTop: 12,
                                                            padding: '10px 14px',
                                                            background: '#f8fafc',
                                                            borderRadius: 10,
                                                            fontSize: 13,
                                                            color: '#475569',
                                                            borderLeft: '4px solid #3b82f6',
                                                            display: 'flex',
                                                            gap: 10
                                                        }}>
                                                            <MessageSquare size={16} style={{ flexShrink: 0, marginTop: 2, color: '#3b82f6' }} />
                                                            <div>
                                                                <span style={{ fontWeight: 800, color: '#334155' }}>Réponse admin:</span> {item.adminComment}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{
                                                    padding: '8px 16px',
                                                    background: status.bg,
                                                    color: status.text,
                                                    borderRadius: 12,
                                                    fontSize: 13,
                                                    fontWeight: 800,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    textTransform: 'capitalize',
                                                    flexShrink: 0
                                                }}>
                                                    {status.icon}
                                                    {item.status === 'pending' ? 'En attente' : item.status === 'approved' ? 'Approuvé' : 'Refusé'}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Important Info Footer */}
                <div style={{
                    padding: '32px 48px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20
                }}>
                    <div style={{
                        width: 48,
                        height: 48,
                        background: '#3b82f6',
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
                    }}>
                        <AlertCircle size={24} color="white" />
                    </div>
                    <div>
                        <h4 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 4px 0' }}>Informations de traitement</h4>
                        <p style={{ fontSize: 13, color: '#64748b', margin: 0, fontWeight: 500 }}>
                            Les demandes sont généralement traitées sous 24h. Assurez-vous que les carnets concernés sont prêts pour le changement de période.
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulseStatus {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.2); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
            `}</style>
        </div>
    )
}
