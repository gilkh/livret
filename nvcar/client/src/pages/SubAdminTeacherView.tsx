import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import api from '../api'

type Change = {
    _id: string
    changeType: string
    timestamp: Date
    templateName?: string
    studentName?: string
    pageIndex: number
    blockIndex: number
    before?: any
    after?: any
}

export default function SubAdminTeacherView() {
    const { teacherId } = useParams<{ teacherId: string }>()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe')
    const apiPrefix = isAefeUser ? '/aefe' : '/subadmin'
    const [changes, setChanges] = useState<Change[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadChanges = async () => {
            try {
                setLoading(true)
                const r = await api.get(`${apiPrefix}/teachers/${teacherId}/changes`)
                setChanges(r.data)
            } catch (e: any) {
                setError('Impossible de charger les modifications')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (teacherId) loadChanges()
    }, [teacherId, apiPrefix])

    return (
        <div className="container">
            <div className="card">
                <button className="btn secondary" onClick={() => window.history.back()} style={{ 
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>← Retour</button>
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>📝 Modifications de l'enseignant</h2>
                <div className="note" style={{ fontSize: 14, color: '#64748b' }}>Historique des modifications apportées aux carnets par l'enseignant</div>

                {loading && <div className="note" style={{ textAlign: 'center', padding: 24 }}>Chargement...</div>}
                {error && <div className="note" style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', marginTop: 16 }}>{error}</div>}

                <div style={{ marginTop: 20 }}>
                    {changes.map(c => (
                        <div key={c._id} className="card" style={{ 
                            marginBottom: 16,
                            border: '1px solid #e2e8f0',
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1 }}>
                                    <div className="title" style={{ fontSize: 18, marginBottom: 4, color: '#1e293b', fontWeight: 600 }}>{c.templateName || 'Carnet'}</div>
                                    <div className="note" style={{ fontSize: 13, color: '#64748b' }}>👤 {c.studentName || 'Élève'}</div>
                                </div>
                                <div className="note" style={{ 
                                    fontSize: 12, 
                                    color: '#6c5ce7',
                                    background: '#f5f3ff',
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid #e9d5ff',
                                    fontWeight: 500
                                }}>
                                    📅 {new Date(c.timestamp).toLocaleString('fr-FR')}
                                </div>
                            </div>

                            <div className="note" style={{ 
                                fontSize: 13, 
                                color: '#475569',
                                marginTop: 8,
                                padding: 8,
                                background: '#f8fafc',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0'
                            }}>
                                <span style={{ fontWeight: 600 }}>Type:</span> {c.changeType} | 
                                <span style={{ fontWeight: 600 }}> Page</span> {c.pageIndex + 1}, 
                                <span style={{ fontWeight: 600 }}> Bloc</span> {c.blockIndex + 1}
                            </div>

                            {c.before && c.after && (
                                <div style={{ 
                                    marginTop: 12, 
                                    padding: 14, 
                                    background: '#fafafa', 
                                    borderRadius: 8,
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <div style={{ fontSize: 13, marginBottom: 8 }}>
                                        <strong style={{ color: '#dc2626' }}>❌ Avant:</strong> 
                                        <div style={{ 
                                            marginTop: 4, 
                                            padding: 8, 
                                            background: '#fee2e2', 
                                            borderRadius: 6,
                                            fontSize: 12,
                                            fontFamily: 'monospace',
                                            color: '#991b1b',
                                            wordBreak: 'break-all'
                                        }}>
                                            {JSON.stringify(c.before.items?.map((i: any) => ({ code: i.code, active: i.active })))}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 13, marginTop: 10 }}>
                                        <strong style={{ color: '#10b981' }}>✅ Après:</strong> 
                                        <div style={{ 
                                            marginTop: 4, 
                                            padding: 8, 
                                            background: '#d1fae5', 
                                            borderRadius: 6,
                                            fontSize: 12,
                                            fontFamily: 'monospace',
                                            color: '#065f46',
                                            wordBreak: 'break-all'
                                        }}>
                                            {JSON.stringify(c.after.items?.map((i: any) => ({ code: i.code, active: i.active })))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {!loading && changes.length === 0 && (
                        <div className="note" style={{ 
                            textAlign: 'center', 
                            padding: 32,
                            color: '#64748b',
                            background: '#f8fafc',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0'
                        }}>
                            📭 Aucune modification enregistrée.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
