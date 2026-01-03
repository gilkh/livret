import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import './AdminAuditLogs.css'

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
    roleCounts?: Array<{ _id: string; count: number }>
}

// Action categories for grouping
const ACTION_CATEGORIES: Record<string, string> = {
    LOGIN: 'auth',
    LOGOUT: 'auth',
    LOGIN_MICROSOFT: 'auth',
    EDIT_TEMPLATE: 'template',
    UPDATE_TEMPLATE_DATA: 'template',
    SIGN_TEMPLATE: 'signature',
    UNSIGN_TEMPLATE: 'signature',
    UPLOAD_SIGNATURE: 'signature',
    DELETE_SIGNATURE: 'signature',
    CREATE_ASSIGNMENT: 'assignment',
    DELETE_ASSIGNMENT: 'assignment',
    MARK_ASSIGNMENT_DONE: 'assignment',
    UNMARK_ASSIGNMENT_DONE: 'assignment',
    EXPORT_PDF: 'export',
    CREATE_OUTLOOK_USER: 'user',
    UPDATE_OUTLOOK_USER: 'user',
    DELETE_OUTLOOK_USER: 'user',
    CREATE_USER: 'user',
    UPDATE_USER: 'user',
    DELETE_USER: 'user',
    REACTIVATE_USER: 'user',
    START_IMPERSONATION: 'impersonation',
    STOP_IMPERSONATION: 'impersonation',
    PROMOTE_STUDENT: 'student',
    CREATE_STUDENT: 'student',
    UPDATE_STUDENT: 'student',
    DELETE_STUDENT: 'student',
    CREATE_BACKUP: 'system',
    RESTORE_BACKUP: 'system',
    EMPTY_DATABASE: 'danger',
    UPDATE_SCHOOL_YEAR: 'system',
    UPDATE_SETTINGS: 'system',
    RESET_PASSWORD: 'user',
}

const ACTION_LABELS: Record<string, string> = {
    LOGIN: 'Connexion',
    LOGOUT: 'Déconnexion',
    LOGIN_MICROSOFT: 'Connexion Microsoft',
    EDIT_TEMPLATE: 'Édition template',
    UPDATE_TEMPLATE_DATA: 'Mise à jour données',
    SIGN_TEMPLATE: 'Signature template',
    UNSIGN_TEMPLATE: 'Annulation signature',
    UPLOAD_SIGNATURE: 'Upload signature',
    DELETE_SIGNATURE: 'Suppression signature',
    CREATE_ASSIGNMENT: 'Création assignation',
    DELETE_ASSIGNMENT: 'Suppression assignation',
    MARK_ASSIGNMENT_DONE: 'Assignation terminée',
    UNMARK_ASSIGNMENT_DONE: 'Assignation non terminée',
    EXPORT_PDF: 'Export PDF',
    CREATE_OUTLOOK_USER: 'Création utilisateur Outlook',
    UPDATE_OUTLOOK_USER: 'Mise à jour utilisateur Outlook',
    DELETE_OUTLOOK_USER: 'Suppression utilisateur Outlook',
    CREATE_USER: 'Création utilisateur',
    UPDATE_USER: 'Modification utilisateur',
    DELETE_USER: 'Suppression utilisateur',
    REACTIVATE_USER: 'Réactivation utilisateur',
    RESET_PASSWORD: 'Réinitialisation mot de passe',
    START_IMPERSONATION: 'Début impersonnation',
    STOP_IMPERSONATION: 'Fin impersonnation',
    PROMOTE_STUDENT: 'Promotion élève',
    CREATE_STUDENT: 'Création élève',
    UPDATE_STUDENT: 'Modification élève',
    DELETE_STUDENT: 'Suppression élève',
    CREATE_BACKUP: 'Création sauvegarde',
    RESTORE_BACKUP: 'Restauration sauvegarde',
    EMPTY_DATABASE: 'Vidage base de données',
    UPDATE_SCHOOL_YEAR: 'Changement année scolaire',
    UPDATE_SETTINGS: 'Modification paramètres',
}

const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Administrateur',
    SUBADMIN: 'Sous-Admin',
    TEACHER: 'Enseignant',
}

// Icons as inline SVG for better performance
const Icons = {
    activity: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
    ),
    search: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
    ),
    refresh: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
    ),
    download: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
    ),
    chevronLeft: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
    ),
    chevronRight: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    ),
    inbox: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
        </svg>
    ),
    close: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    ),
    crown: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8l4 10h12l4-10-6 4-4-8-4 8-6-4z"></path>
        </svg>
    ),
    shield: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
    ),
    book: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
    ),
    users: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    ),
    eye: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>
    ),
}

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeRoleTab, setActiveRoleTab] = useState<string>('ALL')
    const [filterAction, setFilterAction] = useState('')
    const [filterUser, setFilterUser] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
    const limit = 50

    useEffect(() => {
        loadData()
    }, [page, filterAction, filterUser, startDate, endDate, activeRoleTab])

    useEffect(() => {
        loadStats()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            const params: any = { limit, skip: page * limit }
            if (filterAction) params.action = filterAction
            if (filterUser) params.userId = filterUser
            if (startDate) params.startDate = startDate
            if (endDate) params.endDate = endDate
            if (activeRoleTab !== 'ALL') params.userRole = activeRoleTab

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

    const roleCounts = useMemo(() => {
        if (!stats?.roleCounts) return { ADMIN: 0, SUBADMIN: 0, TEACHER: 0 }
        const counts: Record<string, number> = { ADMIN: 0, SUBADMIN: 0, TEACHER: 0 }
        stats.roleCounts.forEach(rc => {
            counts[rc._id] = rc.count
        })
        return counts
    }, [stats])

    const resetFilters = () => {
        setFilterAction('')
        setFilterUser('')
        setStartDate('')
        setEndDate('')
        setActiveRoleTab('ALL')
        setPage(0)
    }

    const exportLogs = async () => {
        try {
            const params: any = { limit: 10000 }
            if (filterAction) params.action = filterAction
            if (filterUser) params.userId = filterUser
            if (startDate) params.startDate = startDate
            if (endDate) params.endDate = endDate
            if (activeRoleTab !== 'ALL') params.userRole = activeRoleTab

            const r = await api.get('/audit-logs', { params })
            const data = r.data.logs

            // Create CSV
            const headers = ['Date', 'Utilisateur', 'Rôle', 'Action', 'Détails', 'IP']
            const rows = data.map((log: AuditLog) => [
                new Date(log.timestamp).toLocaleString('fr-FR'),
                log.userName,
                ROLE_LABELS[log.userRole] || log.userRole,
                ACTION_LABELS[log.action] || log.action,
                JSON.stringify(log.details || {}),
                log.ipAddress
            ])

            const csv = [headers, ...rows].map(row => row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
        } catch (e) {
            console.error('Failed to export logs', e)
        }
    }

    const formatTimestamp = (ts: Date) => {
        const d = new Date(ts)
        return {
            date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        }
    }

    const formatDetails = (details: any) => {
        if (!details || Object.keys(details).length === 0) return null
        return Object.entries(details)
            .filter(([key]) => !['passwordHash', '_id', '__v'].includes(key))
            .slice(0, 4) // Limit to 4 details for display
            .map(([key, value]) => ({
                key: key === 'email' ? 'Email'
                    : key === 'role' ? 'Rôle'
                        : key === 'targetUserEmail' ? 'Cible'
                            : key === 'studentName' ? 'Élève'
                                : key === 'className' ? 'Classe'
                                    : key === 'templateName' ? 'Template'
                                        : key,
                value: String(value).substring(0, 50)
            }))
    }

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'ADMIN': return Icons.crown
            case 'SUBADMIN': return Icons.shield
            case 'TEACHER': return Icons.book
            default: return null
        }
    }

    const getActionCategory = (action: string) => {
        return ACTION_CATEGORIES[action] || 'auth'
    }

    const totalPages = Math.ceil(total / limit)

    // Get unique actions for filter dropdown
    const uniqueActions = useMemo(() => {
        const actions = Object.keys(ACTION_LABELS)
        return actions.sort((a, b) => (ACTION_LABELS[a] || a).localeCompare(ACTION_LABELS[b] || b))
    }, [])

    return (
        <div className="audit-logs-page">
            {/* Header */}
            <div className="audit-header">
                <h1>
                    {Icons.activity}
                    Journal d'activité
                </h1>
                <p className="audit-subtitle">Suivi de toutes les actions des utilisateurs du système</p>
            </div>

            {/* Statistics Cards */}
            {stats && (
                <div className="audit-stats-grid">
                    <div className="audit-stat-card total">
                        <div className="audit-stat-label">Total des logs</div>
                        <div className="audit-stat-value">{stats.totalLogs.toLocaleString()}</div>
                    </div>
                    <div className="audit-stat-card recent">
                        <div className="audit-stat-label">Dernières 24h</div>
                        <div className="audit-stat-value">{stats.recentLogs.toLocaleString()}</div>
                    </div>
                    <div className="audit-stat-card admin">
                        <div className="audit-stat-label">Admin</div>
                        <div className="audit-stat-value">{roleCounts.ADMIN.toLocaleString()}</div>
                    </div>
                    <div className="audit-stat-card subadmin">
                        <div className="audit-stat-label">Sous-Admin</div>
                        <div className="audit-stat-value">{roleCounts.SUBADMIN.toLocaleString()}</div>
                    </div>
                    <div className="audit-stat-card teacher">
                        <div className="audit-stat-label">Enseignants</div>
                        <div className="audit-stat-value">{roleCounts.TEACHER.toLocaleString()}</div>
                    </div>
                </div>
            )}

            {/* Role Filter Tabs */}
            <div className="audit-role-tabs">
                <button
                    className={`audit-role-tab ${activeRoleTab === 'ALL' ? 'active' : ''}`}
                    onClick={() => { setActiveRoleTab('ALL'); setPage(0) }}
                >
                    {Icons.users}
                    Tous
                    <span className="audit-role-tab-count">{stats?.totalLogs || 0}</span>
                </button>
                <button
                    className={`audit-role-tab admin-tab ${activeRoleTab === 'ADMIN' ? 'active' : ''}`}
                    onClick={() => { setActiveRoleTab('ADMIN'); setPage(0) }}
                >
                    {Icons.crown}
                    Administrateurs
                    <span className="audit-role-tab-count">{roleCounts.ADMIN}</span>
                </button>
                <button
                    className={`audit-role-tab subadmin-tab ${activeRoleTab === 'SUBADMIN' ? 'active' : ''}`}
                    onClick={() => { setActiveRoleTab('SUBADMIN'); setPage(0) }}
                >
                    {Icons.shield}
                    Sous-Admins
                    <span className="audit-role-tab-count">{roleCounts.SUBADMIN}</span>
                </button>
                <button
                    className={`audit-role-tab teacher-tab ${activeRoleTab === 'TEACHER' ? 'active' : ''}`}
                    onClick={() => { setActiveRoleTab('TEACHER'); setPage(0) }}
                >
                    {Icons.book}
                    Enseignants
                    <span className="audit-role-tab-count">{roleCounts.TEACHER}</span>
                </button>
            </div>

            {/* Filters */}
            <div className="audit-filters">
                <div className="audit-filters-row">
                    <div className="audit-filter-group">
                        <label className="audit-filter-label">Action</label>
                        <select
                            className="audit-filter-select"
                            value={filterAction}
                            onChange={e => { setFilterAction(e.target.value); setPage(0) }}
                        >
                            <option value="">Toutes les actions</option>
                            {uniqueActions.map(action => (
                                <option key={action} value={action}>{ACTION_LABELS[action] || action}</option>
                            ))}
                        </select>
                    </div>
                    <div className="audit-filter-group">
                        <label className="audit-filter-label">Utilisateur (ID ou nom)</label>
                        <input
                            type="text"
                            className="audit-filter-input"
                            placeholder="Rechercher..."
                            value={filterUser}
                            onChange={e => { setFilterUser(e.target.value); setPage(0) }}
                        />
                    </div>
                    <div className="audit-filter-group" style={{ minWidth: 140 }}>
                        <label className="audit-filter-label">Date début</label>
                        <input
                            type="date"
                            className="audit-filter-input"
                            value={startDate}
                            onChange={e => { setStartDate(e.target.value); setPage(0) }}
                        />
                    </div>
                    <div className="audit-filter-group" style={{ minWidth: 140 }}>
                        <label className="audit-filter-label">Date fin</label>
                        <input
                            type="date"
                            className="audit-filter-input"
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setPage(0) }}
                        />
                    </div>
                    <button className="audit-filter-btn reset" onClick={resetFilters}>
                        {Icons.refresh}
                        Réinitialiser
                    </button>
                    <button className="audit-filter-btn export" onClick={exportLogs}>
                        {Icons.download}
                        Exporter CSV
                    </button>
                </div>

                {/* Quick Action Filters */}
                <div className="audit-quick-filters">
                    <button
                        className={`audit-quick-filter ${filterAction === 'LOGIN' || filterAction === 'LOGIN_MICROSOFT' ? 'active' : ''}`}
                        onClick={() => setFilterAction(filterAction === 'LOGIN' ? '' : 'LOGIN')}
                    >
                        Connexions
                    </button>
                    <button
                        className={`audit-quick-filter ${filterAction === 'SIGN_TEMPLATE' ? 'active' : ''}`}
                        onClick={() => setFilterAction(filterAction === 'SIGN_TEMPLATE' ? '' : 'SIGN_TEMPLATE')}
                    >
                        Signatures
                    </button>
                    <button
                        className={`audit-quick-filter ${filterAction === 'EXPORT_PDF' ? 'active' : ''}`}
                        onClick={() => setFilterAction(filterAction === 'EXPORT_PDF' ? '' : 'EXPORT_PDF')}
                    >
                        Exports PDF
                    </button>
                    <button
                        className={`audit-quick-filter ${filterAction === 'PROMOTE_STUDENT' ? 'active' : ''}`}
                        onClick={() => setFilterAction(filterAction === 'PROMOTE_STUDENT' ? '' : 'PROMOTE_STUDENT')}
                    >
                        Promotions
                    </button>
                    <button
                        className={`audit-quick-filter ${filterAction === 'START_IMPERSONATION' ? 'active' : ''}`}
                        onClick={() => setFilterAction(filterAction === 'START_IMPERSONATION' ? '' : 'START_IMPERSONATION')}
                    >
                        Impersonnations
                    </button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="audit-logs-container">
                {loading ? (
                    <div className="audit-loading">
                        <div className="audit-loading-spinner"></div>
                        <span className="audit-loading-text">Chargement des logs...</span>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="audit-empty-state">
                        {Icons.inbox}
                        <h3>Aucun log trouvé</h3>
                        <p>Modifiez vos filtres pour voir plus de résultats</p>
                    </div>
                ) : (
                    <>
                        <div className="audit-logs-table-wrapper">
                            <table className="audit-logs-table">
                                <thead>
                                    <tr>
                                        <th>Date/Heure</th>
                                        <th>Utilisateur</th>
                                        <th>Rôle</th>
                                        <th>Action</th>
                                        <th>Détails</th>
                                        <th>IP</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => {
                                        const ts = formatTimestamp(log.timestamp)
                                        const details = formatDetails(log.details)
                                        const category = getActionCategory(log.action)
                                        return (
                                            <tr key={log._id}>
                                                <td>
                                                    <div className="audit-timestamp">
                                                        <span className="audit-timestamp-date">{ts.date}</span>
                                                        <span className="audit-timestamp-time">{ts.time}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="audit-user-cell">
                                                        <span className="audit-user-name">{log.userName || 'Inconnu'}</span>
                                                        <span className="audit-user-id">{log.userId.substring(0, 12)}...</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`audit-role-badge ${log.userRole.toLowerCase()}`}>
                                                        {getRoleIcon(log.userRole)}
                                                        {ROLE_LABELS[log.userRole] || log.userRole}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`audit-action-badge ${category}`}>
                                                        {ACTION_LABELS[log.action] || log.action}
                                                    </span>
                                                </td>
                                                <td className="audit-details-cell">
                                                    {details && details.length > 0 ? (
                                                        <div className="audit-details-content">
                                                            {details.map((d, i) => (
                                                                <span key={i} className="audit-detail-chip">
                                                                    <span className="label">{d.key}:</span> {d.value}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className="audit-ip">{log.ipAddress || 'N/A'}</span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => setSelectedLog(log)}
                                                        title="Voir les détails"
                                                    >
                                                        {Icons.eye}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="audit-pagination">
                                <div className="audit-pagination-info">
                                    Affichage de <strong>{page * limit + 1}</strong> à <strong>{Math.min((page + 1) * limit, total)}</strong> sur <strong>{total}</strong> logs
                                </div>
                                <div className="audit-pagination-buttons">
                                    <button
                                        className="audit-page-btn"
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                    >
                                        {Icons.chevronLeft}
                                        Précédent
                                    </button>
                                    <button
                                        className="audit-page-btn active"
                                        disabled
                                    >
                                        {page + 1} / {totalPages}
                                    </button>
                                    <button
                                        className="audit-page-btn"
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={page >= totalPages - 1}
                                    >
                                        Suivant
                                        {Icons.chevronRight}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="audit-detail-modal" onClick={() => setSelectedLog(null)}>
                    <div className="audit-detail-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="audit-detail-modal-header">
                            <h2>Détails du log</h2>
                            <button className="audit-detail-modal-close" onClick={() => setSelectedLog(null)}>
                                {Icons.close}
                            </button>
                        </div>
                        <div className="audit-detail-modal-body">
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">ID</div>
                                <div className="audit-detail-value" style={{ fontFamily: 'monospace' }}>{selectedLog._id}</div>
                            </div>
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">Date/Heure</div>
                                <div className="audit-detail-value">
                                    {new Date(selectedLog.timestamp).toLocaleString('fr-FR', {
                                        dateStyle: 'full',
                                        timeStyle: 'medium'
                                    })}
                                </div>
                            </div>
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">Utilisateur</div>
                                <div className="audit-detail-value">
                                    <strong>{selectedLog.userName}</strong>
                                    <br />
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{selectedLog.userId}</span>
                                </div>
                            </div>
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">Rôle</div>
                                <div className="audit-detail-value">
                                    <span className={`audit-role-badge ${selectedLog.userRole.toLowerCase()}`}>
                                        {getRoleIcon(selectedLog.userRole)}
                                        {ROLE_LABELS[selectedLog.userRole] || selectedLog.userRole}
                                    </span>
                                </div>
                            </div>
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">Action</div>
                                <div className="audit-detail-value">
                                    <span className={`audit-action-badge ${getActionCategory(selectedLog.action)}`}>
                                        {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                                    </span>
                                </div>
                            </div>
                            <div className="audit-detail-row">
                                <div className="audit-detail-label">IP</div>
                                <div className="audit-detail-value">
                                    <span className="audit-ip">{selectedLog.ipAddress || 'N/A'}</span>
                                </div>
                            </div>
                            {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                                <div className="audit-detail-row">
                                    <div className="audit-detail-label">Détails</div>
                                    <div className="audit-detail-value">
                                        <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
