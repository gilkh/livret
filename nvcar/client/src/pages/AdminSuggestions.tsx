import { useEffect, useState } from 'react'
import api from '../api'

type Suggestion = {
    _id: string
    subAdminId: string
    templateId: string
    pageIndex: number
    blockIndex: number
    originalText: string
    suggestedText: string
    status: 'pending' | 'approved' | 'rejected'
    adminComment?: string
    createdAt: string
    subAdmin?: { displayName: string; email: string }
    template?: { name: string }
}

export default function AdminSuggestions() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [processing, setProcessing] = useState<string | null>(null)

    useEffect(() => {
        loadSuggestions()
    }, [])

    const loadSuggestions = async () => {
        try {
            setLoading(true)
            const r = await api.get('/suggestions')
            setSuggestions(r.data)
        } catch (e: any) {
            setError('Impossible de charger les suggestions')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (id: string, status: 'approved' | 'rejected') => {
        try {
            setProcessing(id)
            await api.patch(`/suggestions/${id}`, { status })
            
            // Update local state
            setSuggestions(prev => prev.map(s => 
                s._id === id ? { ...s, status } : s
            ))
        } catch (e: any) {
            alert('Erreur lors de la mise à jour')
        } finally {
            setProcessing(null)
        }
    }

    return (
        <div className="container">
            <div className="card">
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>💡 Suggestions de modifications</h2>
                <div className="note" style={{ fontSize: 14, color: '#64748b' }}>Examinez les suggestions de modifications de texte proposées par les sous-admins</div>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', marginTop: 16 }}>{error}</div>}

                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {suggestions.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucune suggestion en attente</div>
                    )}
                    
                    {suggestions.map(s => (
                        <div key={s._id} style={{ 
                            padding: 20, 
                            border: '1px solid #e2e8f0', 
                            borderRadius: 12,
                            background: s.status === 'pending' ? 'white' : s.status === 'approved' ? '#f0fdf4' : '#fef2f2',
                            opacity: s.status === 'pending' ? 1 : 0.8
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{s.template?.name || 'Template inconnu'}</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>
                                        Par {s.subAdmin?.displayName || s.subAdmin?.email || 'Sous-admin'} • {new Date(s.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ 
                                    padding: '4px 12px', 
                                    borderRadius: 20, 
                                    fontSize: 12, 
                                    fontWeight: 600,
                                    background: s.status === 'pending' ? '#fef3c7' : s.status === 'approved' ? '#dcfce7' : '#fee2e2',
                                    color: s.status === 'pending' ? '#d97706' : s.status === 'approved' ? '#166534' : '#991b1b'
                                }}>
                                    {s.status === 'pending' ? 'En attente' : s.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Original</div>
                                    <div style={{ fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap' }}>{s.originalText}</div>
                                </div>
                                <div style={{ padding: 12, background: '#f0fdfa', borderRadius: 8, border: '1px solid #ccfbf1' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#0d9488', marginBottom: 4, textTransform: 'uppercase' }}>Suggestion</div>
                                    <div style={{ fontSize: 14, color: '#115e59', whiteSpace: 'pre-wrap' }}>{s.suggestedText}</div>
                                </div>
                            </div>

                            {s.status === 'pending' && (
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button 
                                        className="btn secondary" 
                                        onClick={() => handleAction(s._id, 'rejected')}
                                        disabled={!!processing}
                                        style={{ background: '#fff', border: '1px solid #ef4444', color: '#ef4444' }}
                                    >
                                        {processing === s._id ? '...' : 'Rejeter'}
                                    </button>
                                    <button 
                                        className="btn primary" 
                                        onClick={() => handleAction(s._id, 'approved')}
                                        disabled={!!processing}
                                        style={{ background: '#10b981', border: 'none' }}
                                    >
                                        {processing === s._id ? '...' : 'Approuver et Appliquer'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
