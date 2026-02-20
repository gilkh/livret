import { useEffect, useState } from 'react'
import api from '../api'

type OnlineUser = {
    _id: string
    displayName: string
    email: string
    role: string
    lastActive: string
}

type CurrentAlert = {
    _id?: string
    message: string
    type?: 'warning' | 'success'
    expiresAt?: string
}

export default function AdminOnlineUsers() {
    const [users, setUsers] = useState<OnlineUser[]>([])
    const [currentAlert, setCurrentAlert] = useState<CurrentAlert | null>(null)
    const [alertMsg, setAlertMsg] = useState('')
    const [duration, setDuration] = useState('')
    const [loading, setLoading] = useState(true)

    const loadUsers = async () => {
        try {
            const [usersRes, alertRes] = await Promise.all([
                api.get('/admin-extras/online-users'),
                api.get('/admin-extras/alert'),
            ])
            setUsers(usersRes.data)
            setCurrentAlert(alertRes.data || null)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadUsers()
        const interval = setInterval(loadUsers, 30000) // Poll every 30s
        return () => clearInterval(interval)
    }, [])

    const sendAlert = async () => {
        if (!alertMsg.trim()) return
        if (!confirm('Envoyer cette alerte à TOUS les utilisateurs connectés ?')) return
        try {
            await api.post('/admin-extras/alert', { 
                message: alertMsg,
                duration: duration ? parseInt(duration) : undefined
            })
            setAlertMsg('')
            setDuration('')
            loadUsers()
            alert('Alerte envoyée')
        } catch (e) {
            alert('Erreur')
        }
    }

    const stopAlert = async () => {
        if (!confirm('Arrêter l\'alerte en cours ?')) return
        try {
            await api.post('/admin-extras/alert/stop')
            loadUsers()
            alert('Alerte arrêtée. Un message vert de maintenance annulée a été envoyé.')
        } catch (e) {
            alert('Erreur')
        }
    }

    const logoutAll = async () => {
        if (!confirm('Êtes-vous sûr de vouloir déconnecter TOUS les utilisateurs (sauf admins) ?')) return
        try {
            await api.post('/admin-extras/logout-all')
            alert('Tous les utilisateurs ont été déconnectés.')
            loadUsers()
        } catch (e) {
            alert('Erreur')
        }
    }

    return (
        <div className="container">
            <h2 className="title">Utilisateurs en Ligne & Alertes</h2>
            
            <div className="grid2" style={{ gap: 24 }}>
                {/* Online Users List */}
                <div className="card" style={{ gridRow: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Utilisateurs Actifs</h3>
                            <p className="note" style={{ margin: 0 }}>Dernières 5 minutes</p>
                        </div>
                        <button className="btn secondary" onClick={loadUsers} style={{ padding: '4px 12px', fontSize: 14 }}>Actualiser</button>
                    </div>
                    
                    {loading ? <p>Chargement...</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {users.map(u => (
                                <div key={u._id} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 12, 
                                    padding: 12, 
                                    background: '#f8fafc', 
                                    borderRadius: 8,
                                    borderLeft: '4px solid #22c55e'
                                }}>
                                    <div style={{ 
                                        width: 40, height: 40, 
                                        borderRadius: '50%', 
                                        background: '#e2e8f0', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        fontWeight: 600,
                                        color: '#475569'
                                    }}>
                                        {u.displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>{u.email}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ 
                                            fontSize: 11, 
                                            fontWeight: 600, 
                                            padding: '2px 6px', 
                                            borderRadius: 4, 
                                            background: u.role === 'ADMIN' ? '#fef3c7' : '#e0f2fe',
                                            color: u.role === 'ADMIN' ? '#d97706' : '#0284c7',
                                            display: 'inline-block',
                                            marginBottom: 4
                                        }}>
                                            {u.role}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                            {new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {users.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                                    Aucun utilisateur actif récemment.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Send Alert */}
                    <div className="card">
                        <h3>Envoyer une Alerte</h3>
                        <p className="note">Affiche un message bloquant sur l'écran de tous les utilisateurs.</p>

                        {currentAlert && (
                            <div style={{
                                marginBottom: 12,
                                padding: 12,
                                borderRadius: 8,
                                border: currentAlert.type === 'success' ? '1px solid #86efac' : '1px solid #fdba74',
                                background: currentAlert.type === 'success' ? '#f0fdf4' : '#fff7ed',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: currentAlert.type === 'success' ? '#166534' : '#9a3412' }}>
                                            {currentAlert.type === 'success' ? 'Notice active (verte)' : 'Alerte en cours'}
                                        </div>
                                        <div style={{ fontSize: 13, color: currentAlert.type === 'success' ? '#166534' : '#7c2d12' }}>
                                            {currentAlert.message}
                                        </div>
                                    </div>
                                    <button className="btn secondary" onClick={stopAlert} style={{ borderColor: '#dc2626', color: '#dc2626', whiteSpace: 'nowrap' }}>
                                        Arrêter
                                    </button>
                                </div>
                            </div>
                        )}
                        <textarea 
                            value={alertMsg}
                            onChange={e => setAlertMsg(e.target.value)}
                            placeholder="Message d'alerte (ex: Maintenance dans 10 min...)"
                            style={{ width: '100%', height: 100, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginBottom: 12 }}
                        />
                        
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>Durée (minutes, optionnel)</label>
                            <input 
                                type="number" 
                                value={duration} 
                                onChange={e => setDuration(e.target.value)}
                                placeholder="Ex: 10"
                                style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn" onClick={sendAlert} disabled={!alertMsg}>Envoyer Alerte</button>
                            <button className="btn secondary" onClick={stopAlert} style={{ borderColor: '#dc2626', color: '#dc2626' }}>Arrêter Alerte</button>
                        </div>
                    </div>

                    {/* Logout All */}
                    <div className="card" style={{ border: '1px solid #fecaca', background: '#fff5f5' }}>
                        <h3 style={{ color: '#dc2626' }}>Zone de Danger</h3>
                        <p className="note">Déconnecter tous les utilisateurs non-admins immédiatement.</p>
                        <button className="btn" style={{ background: '#dc2626', color: 'white' }} onClick={logoutAll}>
                            Déconnecter Tout le Monde
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
