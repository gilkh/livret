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

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            LOGIN: 'Connexion',
            LOGOUT: 'Déconnexion',
            EDIT_TEMPLATE: 'Édition template',
            SIGN_TEMPLATE: 'Signature template',
            EXPORT_PDF: 'Export PDF',
            CREATE_ASSIGNMENT: 'Création assignation',
            DELETE_ASSIGNMENT: 'Suppression assignation',
        }
        return labels[action] || action
    }

    const getActionColor = (action: string) => {
        const colors: Record<string, string> = {
            LOGIN: '#e3f2fd',
            LOGOUT: '#fce4ec',
            EDIT_TEMPLATE: '#fff3e0',
            SIGN_TEMPLATE: '#e1bee7',
            EXPORT_PDF: '#c8e6c9',
            CREATE_ASSIGNMENT: '#bbdefb',
            DELETE_ASSIGNMENT: '#ffcdd2',
        }
        return colors[action] || '#f5f5f5'
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
        <div style={{ padding: 24 }}>
            <div className="card">
                <h2 className="title">Journal d'activité</h2>
                <div className="note">Suivi de toutes les actions des utilisateurs</div>

                {/* Statistics */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}>
                        <div className="card" style={{ background: '#e3f2fd' }}>
                            <div className="note">Total</div>
                            <div className="title" style={{ fontSize: 24 }}>{stats.totalLogs}</div>
                        </div>
                        <div className="card" style={{ background: '#c8e6c9' }}>
                            <div className="note">Dernières 24h</div>
                            <div className="title" style={{ fontSize: 24 }}>{stats.recentLogs}</div>
                        </div>
                        {stats.actionCounts.slice(0, 3).map(ac => (
                            <div key={ac._id} className="card" style={{ background: getActionColor(ac._id) }}>
                                <div className="note">{getActionLabel(ac._id)}</div>
                                <div className="title" style={{ fontSize: 24 }}>{ac.count}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filters */}
                <div style={{ display: 'flex', gap: 12, marginTop: 24, marginBottom: 16 }}>
                    <select
                        value={filterAction}
                        onChange={e => { setFilterAction(e.target.value); setPage(0) }}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                    >
                        <option value="">Toutes les actions</option>
                        <option value="LOGIN">Connexion</option>
                        <option value="EDIT_TEMPLATE">Édition template</option>
                        <option value="SIGN_TEMPLATE">Signature template</option>
                        <option value="EXPORT_PDF">Export PDF</option>
                        <option value="CREATE_ASSIGNMENT">Création assignation</option>
                        <option value="DELETE_ASSIGNMENT">Suppression assignation</option>
                    </select>

                    <input
                        type="text"
                        placeholder="Filtrer par ID utilisateur"
                        value={filterUser}
                        onChange={e => { setFilterUser(e.target.value); setPage(0) }}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }}
                    />

                    <button className="btn secondary" onClick={() => { setFilterAction(''); setFilterUser(''); setPage(0) }}>
                        Réinitialiser
                    </button>
                </div>

                {/* Logs Table */}
                {loading ? (
                    <div className="note">Chargement...</div>
                ) : (
                    <>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #ddd' }}>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Date/Heure</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Utilisateur</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Rôle</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Action</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>Détails</th>
                                    <th style={{ textAlign: 'left', padding: 8 }}>IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log._id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: 8, fontSize: 12 }}>
                                            {new Date(log.timestamp).toLocaleString('fr-FR', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                            <div style={{ fontWeight: 'bold' }}>{log.userName}</div>
                                            <div className="note" style={{ fontSize: 10 }}>{log.userId}</div>
                                        </td>
                                        <td style={{ padding: 8 }}>{getRoleLabel(log.userRole)}</td>
                                        <td style={{ padding: 8 }}>
                                            <span className="pill" style={{ background: getActionColor(log.action) }}>
                                                {getActionLabel(log.action)}
                                            </span>
                                        </td>
                                        <td style={{ padding: 8, fontSize: 12 }}>
                                            {log.details && Object.keys(log.details).length > 0 && (
                                                <details>
                                                    <summary style={{ cursor: 'pointer' }}>Détails</summary>
                                                    <pre style={{ fontSize: 10, marginTop: 4, padding: 4, background: '#f5f5f5', borderRadius: 4, overflow: 'auto', maxWidth: 300 }}>
                                                        {JSON.stringify(log.details, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                        </td>
                                        <td style={{ padding: 8, fontSize: 11 }}>{log.ipAddress}</td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: 16, textAlign: 'center' }}>
                                            <div className="note">Aucun log trouvé</div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                                <button
                                    className="btn secondary"
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                >
                                    ← Précédent
                                </button>
                                <div className="note">
                                    Page {page + 1} / {totalPages} ({total} logs)
                                </div>
                                <button
                                    className="btn secondary"
                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
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
