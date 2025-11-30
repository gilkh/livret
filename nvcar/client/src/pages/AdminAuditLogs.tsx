import { useState, useEffect } from 'react'
import api from '../api'

type AuditLog = {
    _id: string
    userId: string
    userName: string
    userRole: string
    action: string
    details: any
    timestamp: Date
    ipAddress: string
}

type Stats = {
    totalLogs: number
    recentLogs: number
    actionCounts: Array<{ _id: string; count: number }>
}

const ACTION_LABELS: Record<string, string> = {
    LOGIN: 'Connexion',
    LOGOUT: 'Déconnexion',
    EDIT_TEMPLATE: 'Édition template',
    SIGN_TEMPLATE: 'Signature template',
    EXPORT_PDF: 'Export PDF',
    CREATE_ASSIGNMENT: 'Création assignation',
    DELETE_ASSIGNMENT: 'Suppression assignation',
    CREATE_OUTLOOK_USER: 'Création utilisateur Outlook',
    UPDATE_OUTLOOK_USER: 'Mise à jour utilisateur Outlook',
    DELETE_OUTLOOK_USER: 'Suppression utilisateur Outlook',
    START_IMPERSONATION: 'Début impersonnation',
    STOP_IMPERSONATION: 'Fin impersonnation',
}

const ACTION_COLORS: Record<string, string> = {
    LOGIN: '#e3f2fd',
    LOGOUT: '#fce4ec',
    EDIT_TEMPLATE: '#fff3e0',
    SIGN_TEMPLATE: '#e1bee7',
    EXPORT_PDF: '#c8e6c9',
    CREATE_ASSIGNMENT: '#bbdefb',
    DELETE_ASSIGNMENT: '#ffcdd2',
    CREATE_OUTLOOK_USER: '#b2dfdb',
    UPDATE_OUTLOOK_USER: '#b3e5fc',
    DELETE_OUTLOOK_USER: '#ffccbc',
    START_IMPERSONATION: '#fff9c4',
    STOP_IMPERSONATION: '#f0f4c3',
}

const formatDetails = (details: any) => {
    if (!details) return null
    return Object.entries(details)
        .filter(([key]) => !['passwordHash', '_id', '__v'].includes(key))
        .map(([key, value]) => {
            const label = key === 'email' ? 'Email'
                : key === 'role' ? 'Rôle'
                : key === 'targetUserEmail' ? 'Cible'
                : key
            return `${label}: ${value}`
        })
        .join(' | ')
}

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const [filterAction, setFilterAction] = useState('')
    const [filterUser, setFilterUser] = useState('')
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const limit = 50

    useEffect(() => {
        loadData()
    }, [page, filterAction, filterUser])

    useEffect(() => {
        loadStats()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            const params: any = { limit, skip: page * limit }
            if (filterAction) params.action = filterAction
            if (filterUser) params.userId = filterUser

            const r = await api.get('/audit-logs', { params })
            setLogs(r.data.logs)
            setTotal(r.data.total)
        } catch (e) {
            console.error('Failed to load audit logs', e)
        } finally {
            setLoading(false)
        }
    }

    const loadStats = async () => {
        try {
            const r = await api.get('/audit-logs/stats')
            setStats(r.data)
        } catch (e) {
            console.error('Failed to load stats', e)
        }
    }

    const getRoleLabel = (role: string) => {
        const labels: Record<string, string> = {
            ADMIN: 'Admin',
            SUBADMIN: 'Sous-Admin',
            TEACHER: 'Enseignant',
        }
        return labels[role] || role
    }

    const totalPages = Math.ceil(total / limit)

    return (
        <div className="container">
            <div style={{ marginBottom: 24 }}>
                <h2 className="title">Journal d'activité</h2>
                <p className="note">Suivi de toutes les actions des utilisateurs</p>
            </div>

            {/* Statistics */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                    <div className="card" style={{ background: '#e3f2fd', padding: 16 }}>
                        <div className="note">Total</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1565c0' }}>{stats.totalLogs}</div>
                    </div>
                    <div className="card" style={{ background: '#c8e6c9', padding: 16 }}>
                        <div className="note">Dernières 24h</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2e7d32' }}>{stats.recentLogs}</div>
                    </div>
                    {stats.actionCounts.slice(0, 3).map(ac => (
                        <div key={ac._id} className="card" style={{ background: ACTION_COLORS[ac._id] || '#f5f5f5', padding: 16 }}>
                            <div className="note">{ACTION_LABELS[ac._id] || ac._id}</div>
                            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#333' }}>{ac.count}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ padding: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <select
                        value={filterAction}
                        onChange={e => { setFilterAction(e.target.value); setPage(0) }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', minWidth: 200 }}
                    >
                        <option value="">Toutes les actions</option>
                        {Object.entries(ACTION_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        placeholder="Filtrer par ID utilisateur"
                        value={filterUser}
                        onChange={e => { setFilterUser(e.target.value); setPage(0) }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', flex: 1, minWidth: 200 }}
                    />

                    <button className="btn secondary" onClick={() => { setFilterAction(''); setFilterUser(''); setPage(0) }}>
                        Réinitialiser
                    </button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>Chargement...</div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>Date/Heure</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>Utilisateur</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>Rôle</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>Action</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>Détails</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, color: '#666' }}>IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log._id} style={{ borderBottom: '1px solid #f1f2f6' }}>
                                            <td style={{ padding: '12px 16px', fontSize: 13 }}>
                                                {new Date(log.timestamp).toLocaleString('fr-FR', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 500 }}>{log.userName || 'Inconnu'}</div>
                                                <div style={{ fontSize: 11, color: '#999' }}>{log.userId}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ 
                                                    fontSize: 11, 
                                                    padding: '4px 8px', 
                                                    borderRadius: 4, 
                                                    background: '#f1f2f6',
                                                    color: '#666'
                                                }}>
                                                    {getRoleLabel(log.userRole)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ 
                                                    fontSize: 12, 
                                                    padding: '4px 8px', 
                                                    borderRadius: 99, 
                                                    background: ACTION_COLORS[log.action] || '#f5f5f5',
                                                    color: '#333',
                                                    fontWeight: 500
                                                }}>
                                                    {ACTION_LABELS[log.action] || log.action}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, maxWidth: 300 }}>
                                                {log.details && Object.keys(log.details).length > 0 && (
                                                    <div style={{ color: '#666' }}>
                                                        {formatDetails(log.details)}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 12, color: '#999' }}>{log.ipAddress}</td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#999' }}>
                                                Aucun log trouvé
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 16, borderTop: '1px solid #eee' }}>
                                <button
                                    className="btn secondary"
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                    style={{ opacity: page === 0 ? 0.5 : 1 }}
                                >
                                    ← Précédent
                                </button>
                                <div style={{ fontSize: 14, color: '#666' }}>
                                    Page {page + 1} / {totalPages} ({total} logs)
                                </div>
                                <button
                                    className="btn secondary"
                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                    style={{ opacity: page >= totalPages - 1 ? 0.5 : 1 }}
                                >
                                    Suivant →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
