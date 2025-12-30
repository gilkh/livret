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
    ChevronRight
} from 'lucide-react'

type RequestType = 'semester_switch' | 'next_year_request'

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

export default function SubAdminSemesterRequest() {
    const navigate = useNavigate()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe/')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const [requestType, setRequestType] = useState<RequestType | null>(null)
    const [message, setMessage] = useState('')
    const [hovered, setHovered] = useState<RequestType | null>(null)
    const [activeSemester, setActiveSemester] = useState<number>(1)
    const [loadingInfo, setLoadingInfo] = useState(true)

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const r = await api.get('/school-years/active')
                if (r.data?.activeSemester) {
                    setActiveSemester(r.data.activeSemester)
                }
            } catch (e) {
                // Default to 1
            } finally {
                setLoadingInfo(false)
            }
        }
        fetchInfo()
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
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || e.message
            setError('Erreur lors de l\'envoi de la demande: ' + errorMsg)
        } finally {
            setLoading(false)
        }
    }

    if (loadingInfo) {
        return (
            <div className="container">
                <div className="card" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 300
                }}>
                    <div style={{
                        width: 48,
                        height: 48,
                        border: '3px solid #e2e8f0',
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
                <div className="card" style={{ textAlign: 'center', padding: '80px 40px' }}>
                    <div style={{
                        width: 100,
                        height: 100,
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 32px',
                        boxShadow: '0 20px 40px -12px rgba(34, 197, 94, 0.35)',
                        animation: 'pulse 2s ease-in-out infinite'
                    }}>
                        <CheckCircle2 size={48} color="white" />
                    </div>
                    <h2 style={{
                        fontSize: 32,
                        color: '#1e293b',
                        marginBottom: 16,
                        fontWeight: 700
                    }}>
                        Demande envoyée avec succès !
                    </h2>
                    <p style={{
                        color: '#64748b',
                        fontSize: 17,
                        maxWidth: 500,
                        margin: '0 auto 40px',
                        lineHeight: 1.7
                    }}>
                        Votre demande a été transmise à l'administration.
                        Vous recevrez une notification une fois qu'elle aura été traitée.
                    </p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            className="btn secondary"
                            onClick={() => navigate(isAefeUser ? '/aefe/dashboard' : '/subadmin/dashboard')}
                            style={{
                                padding: '14px 28px',
                                borderRadius: 12,
                                fontSize: 15
                            }}
                        >
                            Retour au tableau de bord
                        </button>
                        <button
                            className="btn primary"
                            onClick={() => setSuccess(false)}
                            style={{
                                padding: '14px 28px',
                                borderRadius: 12,
                                fontSize: 15,
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                border: 'none'
                            }}
                        >
                            <Sparkles size={18} style={{ marginRight: 8 }} />
                            Nouvelle demande
                        </button>
                    </div>
                    <style>{`
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                        }
                    `}</style>
                </div>
            </div>
        )
    }

    return (
        <div className="container">
            <div className="card" style={{
                padding: '40px 48px',
                borderRadius: 20,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Decorative gradient blob */}
                <div style={{
                    position: 'absolute',
                    top: -100,
                    right: -100,
                    width: 300,
                    height: 300,
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
                    borderRadius: '50%',
                    pointerEvents: 'none'
                }} />

                {/* Header Section */}
                <div style={{ marginBottom: 40, position: 'relative' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        marginBottom: 16
                    }}>
                        <div style={{
                            width: 56,
                            height: 56,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            borderRadius: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.4)'
                        }}>
                            <Send size={26} color="white" />
                        </div>
                        <div>
                            <h1 style={{
                                fontSize: 32,
                                color: '#1e293b',
                                fontWeight: 800,
                                margin: 0,
                                letterSpacing: '-0.02em'
                            }}>
                                Demandes Administratives
                            </h1>
                            <p style={{
                                fontSize: 15,
                                color: '#64748b',
                                margin: '4px 0 0 0'
                            }}>
                                Communiquez avec l'administration pour les changements de période
                            </p>
                        </div>
                    </div>

                    {/* Current status badge */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        background: activeSemester === 1 ? '#fef3c7' : '#dcfce7',
                        borderRadius: 10,
                        marginTop: 8
                    }}>
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: activeSemester === 1 ? '#f59e0b' : '#22c55e'
                        }} />
                        <span style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: activeSemester === 1 ? '#92400e' : '#166534'
                        }}>
                            Période actuelle: Semestre {activeSemester}
                        </span>
                    </div>
                </div>

                {/* Quick Actions */}
                <div style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 32,
                    flexWrap: 'wrap'
                }}>
                    <button
                        className="btn"
                        onClick={() => navigate(isAefeUser ? '/aefe/suggestion/gradebooks' : '/subadmin/suggestion/gradebooks')}
                        style={{
                            padding: '12px 20px',
                            borderRadius: 12,
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = '#f8fafc'
                            e.currentTarget.style.borderColor = '#cbd5e1'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'white'
                            e.currentTarget.style.borderColor = '#e2e8f0'
                        }}
                    >
                        <FileText size={18} color="#64748b" />
                        <span style={{ fontWeight: 500 }}>Suggérer modifications carnets</span>
                        <ChevronRight size={16} color="#94a3b8" />
                    </button>
                </div>

                {/* Request Type Selection */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 32 }}>
                        <label style={{
                            display: 'block',
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#334155',
                            marginBottom: 16,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Type de demande
                        </label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 16
                        }}>
                            {requestOptions.map(option => {
                                const isSelected = requestType === option.id
                                const isHovered = hovered === option.id
                                const isDisabled = option.id === 'semester_switch' && activeSemester !== 1

                                return (
                                    <div
                                        key={option.id}
                                        onClick={() => !isDisabled && setRequestType(option.id)}
                                        onMouseEnter={() => !isDisabled && setHovered(option.id)}
                                        onMouseLeave={() => setHovered(null)}
                                        style={{
                                            padding: '24px',
                                            border: `2px solid ${isSelected ? option.borderColor : isHovered ? '#cbd5e1' : '#e2e8f0'}`,
                                            borderRadius: 16,
                                            background: isSelected ? option.bgColor : 'white',
                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            transform: isSelected || isHovered ? 'translateY(-2px)' : 'translateY(0)',
                                            boxShadow: isSelected
                                                ? `0 12px 24px -8px ${option.borderColor}40`
                                                : isHovered
                                                    ? '0 8px 16px -4px rgba(0, 0, 0, 0.1)'
                                                    : 'none',
                                            opacity: isDisabled ? 0.5 : 1,
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Gradient overlay when selected */}
                                        {isSelected && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: 4,
                                                background: option.gradient
                                            }} />
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                            <div style={{
                                                width: 52,
                                                height: 52,
                                                background: isSelected ? option.gradient : '#f1f5f9',
                                                borderRadius: 14,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: isSelected ? 'white' : '#64748b',
                                                transition: 'all 0.3s ease',
                                                flexShrink: 0
                                            }}>
                                                {option.icon}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontWeight: 700,
                                                    color: '#1e293b',
                                                    marginBottom: 6,
                                                    fontSize: 16
                                                }}>
                                                    {option.title}
                                                </div>
                                                <div style={{
                                                    fontSize: 14,
                                                    color: '#64748b',
                                                    lineHeight: 1.5
                                                }}>
                                                    {option.description}
                                                </div>
                                                {isDisabled && (
                                                    <div style={{
                                                        marginTop: 10,
                                                        padding: '6px 10px',
                                                        background: '#fef3c7',
                                                        borderRadius: 6,
                                                        fontSize: 12,
                                                        color: '#92400e',
                                                        display: 'inline-block'
                                                    }}>
                                                        Déjà au Semestre 2
                                                    </div>
                                                )}
                                            </div>
                                            {/* Radio indicator */}
                                            <div style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: '50%',
                                                border: `2px solid ${isSelected ? option.borderColor : '#d1d5db'}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s ease',
                                                flexShrink: 0
                                            }}>
                                                {isSelected && (
                                                    <div style={{
                                                        width: 12,
                                                        height: 12,
                                                        background: option.gradient,
                                                        borderRadius: '50%'
                                                    }} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Message Input */}
                    <div style={{ marginBottom: 28 }}>
                        <label style={{
                            display: 'block',
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: 10
                        }}>
                            Message ou commentaire <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optionnel)</span>
                        </label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Ajoutez des précisions si nécessaire..."
                            style={{
                                width: '100%',
                                minHeight: 120,
                                padding: 16,
                                borderRadius: 14,
                                border: '2px solid #e2e8f0',
                                fontSize: 15,
                                resize: 'vertical',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit',
                                lineHeight: 1.6
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = '#3b82f6'
                                e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = '#e2e8f0'
                                e.target.style.boxShadow = 'none'
                            }}
                        />
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div style={{
                            padding: 16,
                            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                            border: '1px solid #fecaca',
                            borderRadius: 12,
                            color: '#dc2626',
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 24
                        }}>
                            <div style={{
                                width: 36,
                                height: 36,
                                background: '#fee2e2',
                                borderRadius: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <AlertCircle size={20} />
                            </div>
                            <span style={{ fontWeight: 500 }}>{error}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="btn primary"
                        disabled={loading || !requestType}
                        style={{
                            width: '100%',
                            padding: '18px',
                            fontSize: 16,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            borderRadius: 14,
                            background: requestType
                                ? selectedOption?.gradient || 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                : '#e2e8f0',
                            border: 'none',
                            color: requestType ? 'white' : '#94a3b8',
                            cursor: !requestType || loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: requestType ? '0 8px 20px -4px rgba(59, 130, 246, 0.4)' : 'none'
                        }}
                    >
                        {loading ? (
                            <>
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: 'white',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                Envoi en cours...
                            </>
                        ) : (
                            <>
                                <Send size={20} />
                                Envoyer la demande
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                {/* Info Box */}
                <div style={{
                    marginTop: 40,
                    padding: 28,
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderRadius: 16,
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16
                    }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <AlertCircle size={22} color="white" />
                        </div>
                        <div>
                            <h4 style={{
                                fontSize: 16,
                                color: '#1e293b',
                                marginBottom: 8,
                                fontWeight: 700
                            }}>
                                Informations importantes
                            </h4>
                            <ul style={{
                                fontSize: 14,
                                color: '#64748b',
                                lineHeight: 1.8,
                                margin: 0,
                                paddingLeft: 18
                            }}>
                                <li>Les demandes sont traitées par l'administration centrale</li>
                                <li>Assurez-vous que tous les carnets sont completés avant de demander un changement de période</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); }}
            `}</style>
        </div>
    )
}
