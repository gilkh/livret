import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import './AdminMonitoring.css'

type SystemStatus = {
    backend: string
    database: string
    uptime: number
}

type OnlineUser = {
    _id: string
    displayName: string
    email: string
    role: string
    lastActive: string
}

type AuditStats = {
    totalLogs: number
    recentLogs: number
    actionCounts: { _id: string; count: number }[]
}

type AnalyticsData = {
    counts: {
        users: number
        classes: number
        students: number
    }
    distribution: {
        usersByRole: Record<string, number>
        assignmentsByStatus: Record<string, number>
    }
}

type Backup = { name: string; size: number; date: string }

type SystemAlert = {
    message: string
    createdAt?: string
    expiresAt?: string
}

const formatDuration = (seconds: number) => {
    if (!isFinite(seconds) || seconds <= 0) return '0m'
    const s = Math.floor(seconds)
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    if (days > 0) return `${days}j ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
}

const formatBytes = (bytes: number) => {
    if (!isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let n = bytes
    let i = 0
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024
        i++
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function AdminMonitoring() {
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState<SystemStatus | null>(null)
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
    const [auditStats, setAuditStats] = useState<AuditStats | null>(null)
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
    const [backups, setBackups] = useState<Backup[]>([])
    const [alert, setAlert] = useState<SystemAlert | null>(null)

    const loadAll = useCallback(async () => {
        setLoading(true)
        const results = await Promise.allSettled([
            api.get('/settings/status'),
            api.get('/admin-extras/online-users'),
            api.get('/audit-logs/stats'),
            api.get('/analytics'),
            api.get('/backup/list'),
            api.get('/admin-extras/alert'),
        ])

        const [statusRes, onlineRes, auditRes, analyticsRes, backupsRes, alertRes] = results

        if (statusRes.status === 'fulfilled') setStatus(statusRes.value.data)
        if (onlineRes.status === 'fulfilled') setOnlineUsers(onlineRes.value.data || [])
        if (auditRes.status === 'fulfilled') setAuditStats(auditRes.value.data)
        if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value.data)
        if (backupsRes.status === 'fulfilled') setBackups(backupsRes.value.data || [])
        if (alertRes.status === 'fulfilled') setAlert(alertRes.value.data || null)

        setLoading(false)
    }, [])

    useEffect(() => {
        loadAll()
    }, [navigate, loadAll])

    const cards = useMemo(() => {
        const backendOk = status?.backend === 'online'
        const dbStatus = status?.database || 'unknown'
        const dbOk = dbStatus === 'connected'
        const uptime = status?.uptime ?? 0

        const topAction = auditStats?.actionCounts?.[0]?._id
        const topActionCount = auditStats?.actionCounts?.[0]?.count

        const latestBackup = backups?.[0]
        const backupsCount = backups?.length ?? 0

        const userCount = analytics?.counts?.users
        const classCount = analytics?.counts?.classes
        const studentCount = analytics?.counts?.students

        const onlineCount = onlineUsers.length
        const mostRecentActive = onlineUsers
            .map(u => new Date(u.lastActive).getTime())
            .filter(n => Number.isFinite(n))
            .sort((a, b) => b - a)[0]

        const localVersion = (import.meta as any)?.env?.VITE_APP_VERSION as string | undefined
        const buildInfo = localVersion ? `Version ${localVersion}` : `Client ${new Date().toLocaleDateString()}`

        return [
            {
                title: 'Statut Système',
                status: backendOk && dbOk ? 'OK' : backendOk ? 'Dégradé' : 'Hors ligne',
                description: (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Backend</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: backendOk ? '#16a34a' : '#dc2626' }}>{backendOk ? 'Online' : 'Offline'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Base</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: dbOk ? '#16a34a' : '#d97706' }}>{dbStatus}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Uptime</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{formatDuration(uptime)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{buildInfo}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/settings')} style={{ padding: '6px 12px', fontSize: 14 }}>Paramètres</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Disponibilité',
                progress: backendOk && dbOk ? 100 : backendOk ? 60 : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 7h-9"></path>
                        <path d="M14 17H5"></path>
                        <circle cx="17" cy="17" r="3"></circle>
                        <circle cx="7" cy="7" r="3"></circle>
                    </svg>
                ),
                color: backendOk && dbOk ? '#22c55e' : backendOk ? '#f59e0b' : '#ef4444',
            },
            {
                title: 'Utilisateurs Actifs',
                status: onlineCount > 0 ? `${onlineCount}` : '0',
                description: (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Période</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>5 minutes</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dernier ping</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{mostRecentActive ? new Date(mostRecentActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/online-users')} style={{ padding: '6px 12px', fontSize: 14 }}>Voir détails</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Activité',
                progress: Math.min(100, onlineCount > 0 ? 100 : 20),
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <path d="M20 8v6"></path>
                        <path d="M23 11h-6"></path>
                    </svg>
                ),
                color: '#3b82f6',
            },
            {
                title: 'Audit & Traçabilité',
                status: auditStats ? 'Actif' : 'Indisponible',
                description: (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total logs</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{auditStats ? auditStats.totalLogs.toLocaleString() : '—'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>24h</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{auditStats ? auditStats.recentLogs.toLocaleString() : '—'}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Action principale</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{topAction ? `${topAction} (${topActionCount})` : '—'}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/audit-logs')} style={{ padding: '6px 12px', fontSize: 14 }}>Ouvrir journal</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Traçabilité',
                progress: auditStats ? 100 : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                ),
                color: '#8b5cf6',
            },
            {
                title: 'Statistiques Globales',
                status: analytics ? 'OK' : 'Indisponible',
                description: (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Utilisateurs</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{typeof userCount === 'number' ? userCount.toLocaleString() : '—'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Classes</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{typeof classCount === 'number' ? classCount.toLocaleString() : '—'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Élèves</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{typeof studentCount === 'number' ? studentCount.toLocaleString() : '—'}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/analytics')} style={{ padding: '6px 12px', fontSize: 14 }}>Voir analytics</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Données',
                progress: analytics ? 100 : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                ),
                color: '#f59e0b',
            },
            {
                title: 'Sauvegardes',
                status: backupsCount > 0 ? `${backupsCount}` : '0',
                description: (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dernière</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                                    {latestBackup?.date ? new Date(latestBackup.date).toLocaleString() : '—'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Taille</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                                    {typeof latestBackup?.size === 'number' ? formatBytes(latestBackup.size) : '—'}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/settings')} style={{ padding: '6px 12px', fontSize: 14 }}>Gérer backups</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Résilience',
                progress: backupsCount > 0 ? 100 : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                ),
                color: '#06b6d4',
            },
            {
                title: 'Alerte Système',
                status: alert?.message ? 'Active' : 'Aucune',
                description: (
                    <>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Message</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: alert?.message ? '#c2410c' : '#0f172a' }}>
                                {alert?.message ? alert.message : '—'}
                            </div>
                            {alert?.expiresAt && (
                                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                    Expire: {new Date(alert.expiresAt).toLocaleString()}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate('/admin/online-users')} style={{ padding: '6px 12px', fontSize: 14 }}>Gérer alertes</button>
                            <button className="btn secondary" onClick={loadAll} style={{ padding: '6px 12px', fontSize: 14 }}>Actualiser</button>
                        </div>
                    </>
                ),
                footerLabel: 'Communication',
                progress: alert?.message ? 100 : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                ),
                color: '#fb7185',
            },
        ]
    }, [alert, analytics, auditStats, backups, onlineUsers, status])

    return (
        <div className="monitoring-page">
            <div className="monitoring-header">
                <button className="back-btn" onClick={() => navigate('/admin/settings')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    Retour aux Paramètres
                </button>
                <h1 className="monitoring-title">État de la Surveillance & Diagnostics</h1>
                <p className="monitoring-subtitle">Vue d’ensemble des indicateurs clés (statut, activité, audit, sauvegardes).</p>
            </div>

            <div className="monitoring-grid">
                {cards.map((item, index) => (
                    <div key={index} className="monitoring-card" style={{ '--accent-color': item.color } as any}>
                        <div className="card-icon">
                            {item.icon}
                        </div>
                        <div className="card-content">
                            <div className="card-header">
                                <h3>{item.title}</h3>
                                <span className="status-badge">{item.status}</span>
                            </div>
                            <div className="card-description">{item.description}</div>
                            <div className="card-footer">
                                <span className="priority-tag">{item.footerLabel}</span>
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${item.progress}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="monitoring-footer-info">
                <div className="info-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </div>
                <div className="info-text">
                    <h3>Instantané</h3>
                    <p>{loading ? 'Chargement des indicateurs…' : 'Les indicateurs sont mis à jour à la demande via “Actualiser”.'}</p>
                </div>
            </div>
        </div>
    )
}
