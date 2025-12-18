import { useState } from 'react'
import api from '../api'
import { CheckCircle2, Send, AlertCircle, Clock } from 'lucide-react'

export default function SubAdminSemesterRequest() {
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const [requestType, setRequestType] = useState<'work_done' | 'semester_switch' | 'next_semester'>('work_done')
    const [message, setMessage] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setLoading(true)
            setError('')

            let suggestedText = ''
            let originalText = ''

            if (requestType === 'work_done') {
                originalText = 'Travail Semestre 1'
                suggestedText = 'Travail du Semestre 1 terminé. Prêt pour la suite.'
            } else if (requestType === 'semester_switch') {
                originalText = 'Passage Semestre 2'
                suggestedText = 'Demande de passage au Semestre 2.'
            } else if (requestType === 'next_semester') {
                originalText = 'Nouvelle Période'
                suggestedText = 'Demande d\'ouverture du prochain semestre / année.'
            }

            if (message) {
                suggestedText += `\n\nNote: ${message}`
            }

            await api.post('/suggestions', {
                type: 'semester_request',
                originalText,
                suggestedText
            })

            setSuccess(true)
            setMessage('')
        } catch (e: any) {
            setError('Erreur lors de l\'envoi de la demande: ' + (e.response?.data?.message || e.message))
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="container">
                <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{
                        width: 80,
                        height: 80,
                        background: '#dcfce7',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 24px'
                    }}>
                        <CheckCircle2 size={40} color="#16a34a" />
                    </div>
                    <h2 style={{ fontSize: 28, color: '#1e293b', marginBottom: 12 }}>Demande envoyée !</h2>
                    <p style={{ color: '#64748b', fontSize: 16, maxWidth: 500, margin: '0 auto 32px' }}>
                        Votre demande a été transmise à l'administrateur. Vous recevrez une notification une fois qu'elle aura été traitée.
                    </p>
                    <button
                        className="btn primary"
                        onClick={() => setSuccess(false)}
                        style={{ padding: '12px 32px' }}
                    >
                        Envoyer une autre demande
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="container">
            <div className="card">
                <div style={{ marginBottom: 32 }}>
                    <h2 className="title" style={{ fontSize: 32, marginBottom: 8, color: '#1e293b' }}>🚀 Demandes de Semestre</h2>
                    <p className="note" style={{ fontSize: 16 }}>Communiquez vos avancements et demandez les changements de période à l'administration.</p>
                </div>

                <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
                    <div style={{ marginBottom: 28 }}>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 12 }}>
                            Type de demande
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            <div
                                onClick={() => setRequestType('work_done')}
                                style={{
                                    padding: '16px 20px',
                                    border: `2px solid ${requestType === 'work_done' ? '#3b82f6' : '#e2e8f0'}`,
                                    borderRadius: 12,
                                    background: requestType === 'work_done' ? '#eff6ff' : 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{
                                    width: 40,
                                    height: 40,
                                    background: requestType === 'work_done' ? '#3b82f6' : '#f1f5f9',
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: requestType === 'work_done' ? 'white' : '#64748b'
                                }}>
                                    <CheckCircle2 size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Travail terminé (Semestre 1)</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Informer l'admin que les carnets du S1 sont prêts.</div>
                                </div>
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    border: `2px solid ${requestType === 'work_done' ? '#3b82f6' : '#cbd5e1'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {requestType === 'work_done' && <div style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: '50%' }} />}
                                </div>
                            </div>

                            <div
                                onClick={() => setRequestType('semester_switch')}
                                style={{
                                    padding: '16px 20px',
                                    border: `2px solid ${requestType === 'semester_switch' ? '#3b82f6' : '#e2e8f0'}`,
                                    borderRadius: 12,
                                    background: requestType === 'semester_switch' ? '#eff6ff' : 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{
                                    width: 40,
                                    height: 40,
                                    background: requestType === 'semester_switch' ? '#3b82f6' : '#f1f5f9',
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: requestType === 'semester_switch' ? 'white' : '#64748b'
                                }}>
                                    <Clock size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Demander le passage au Semestre 2</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Ouvrir la saisie pour la deuxième période de l'année.</div>
                                </div>
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    border: `2px solid ${requestType === 'semester_switch' ? '#3b82f6' : '#cbd5e1'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {requestType === 'semester_switch' && <div style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: '50%' }} />}
                                </div>
                            </div>

                            <div
                                onClick={() => setRequestType('next_semester')}
                                style={{
                                    padding: '16px 20px',
                                    border: `2px solid ${requestType === 'next_semester' ? '#3b82f6' : '#e2e8f0'}`,
                                    borderRadius: 12,
                                    background: requestType === 'next_semester' ? '#eff6ff' : 'white',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{
                                    width: 40,
                                    height: 40,
                                    background: requestType === 'next_semester' ? '#3b82f6' : '#f1f5f9',
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: requestType === 'next_semester' ? 'white' : '#64748b'
                                }}>
                                    <Send size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Demander le prochain semestre</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Préparer la structure pour la période suivante.</div>
                                </div>
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    border: `2px solid ${requestType === 'next_semester' ? '#3b82f6' : '#cbd5e1'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {requestType === 'next_semester' && <div style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: '50%' }} />}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 28 }}>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                            Message ou commentaire (optionnel)
                        </label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Ajoutez des détails si nécessaire..."
                            style={{
                                width: '100%',
                                minHeight: 120,
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid #e2e8f0',
                                fontSize: 14,
                                resize: 'vertical',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: 12,
                            background: '#fef2f2',
                            border: '1px solid #fee2e2',
                            borderRadius: 8,
                            color: '#dc2626',
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 20
                        }}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn primary"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            fontSize: 16,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10
                        }}
                    >
                        {loading ? 'Envoi en cours...' : (
                            <>
                                <Send size={20} />
                                Envoyer la demande
                            </>
                        )}
                    </button>
                </form>

                <div style={{ marginTop: 40, padding: 24, background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: 16, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={18} color="#3b82f6" />
                        Important
                    </h4>
                    <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                        Ces demandes permettent à l'administration de synchroniser les périodes scolaires pour l'ensemble de l'établissement.
                        Assurez-vous que tous les carnets de votre section sont correctement complétés avant de signaler que le travail est terminé.
                    </p>
                </div>
            </div>
        </div>
    )
}
