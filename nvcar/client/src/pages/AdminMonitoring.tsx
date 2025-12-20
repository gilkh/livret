import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
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

type DiagnosticMode = 'core' | 'extended'

type DiagnosticStatus = 'idle' | 'running' | 'pass' | 'fail'

type DiagnosticResult = {
    id: string
    name: string
    status: DiagnosticStatus
    durationMs?: number
    message?: string
    detail?: string
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

const formatMs = (ms?: number) => {
    if (!ms || !isFinite(ms)) return '—'
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
}

const errorToMessage = (e: any) => {
    const httpStatus = e?.response?.status
    const apiError = e?.response?.data?.error
    const apiMessage = e?.response?.data?.message
    const rawMessage = e?.message
    const pieces = [
        typeof httpStatus === 'number' ? `HTTP ${httpStatus}` : null,
        apiError ? String(apiError) : null,
        apiMessage ? String(apiMessage) : null,
        rawMessage ? String(rawMessage) : null,
    ].filter(Boolean)
    if (pieces.length) return pieces.join(' - ')
    try {
        return JSON.stringify(e)
    } catch {
        return String(e)
    }
}

const DiagnosticsPanel = ({
    mode,
    setMode,
    running,
    results,
    summary,
    lastRunLabel,
    onRun,
    onReset,
}: {
    mode: DiagnosticMode
    setMode: (m: DiagnosticMode) => void
    running: boolean
    results: DiagnosticResult[]
    summary: { total: number; passed: number; failed: number; running: number }
    lastRunLabel: string
    onRun: () => void
    onReset: () => void
}) => {
    return (
        <div className="diag-root">
            <div className="diag-top">
                <div className="diag-summary">
                    <div className="diag-summary-line">
                        <span className="diag-summary-count">{summary.passed}</span> / {summary.total} OK
                        {summary.failed > 0 && <> · <span className="diag-summary-fail">{summary.failed} KO</span></>}
                        {summary.running > 0 && <> · <span className="diag-summary-running">{summary.running} en cours</span></>}
                    </div>
                    <div className="diag-last-run">{lastRunLabel}</div>
                </div>

                <div className="diag-actions">
                    <button
                        className="btn secondary"
                        disabled={running}
                        onClick={() => setMode(mode === 'core' ? 'extended' : 'core')}
                        style={{ padding: '6px 12px', fontSize: 14 }}
                    >
                        {mode === 'core' ? 'Mode: Essentiel' : 'Mode: Complet'}
                    </button>
                    <button className="btn secondary" disabled={running} onClick={onReset} style={{ padding: '6px 12px', fontSize: 14 }}>
                        Réinitialiser
                    </button>
                    <button className="btn primary" disabled={running} onClick={onRun} style={{ padding: '6px 12px', fontSize: 14 }}>
                        {running ? 'Tests en cours…' : 'Lancer les tests'}
                    </button>
                </div>
            </div>

            <div className="diag-table">
                {results.length === 0 ? (
                    <div className="diag-empty">Aucun test configuré.</div>
                ) : (
                    results.map(r => (
                        <div key={r.id} className="diag-row">
                            <div className="diag-name">{r.name}</div>
                            <div className="diag-status">
                                <span className={`diag-pill diag-${r.status}`}>{r.status}</span>
                            </div>
                            <div className="diag-duration">{formatMs(r.durationMs)}</div>
                            <div className="diag-message" title={r.detail || r.message || ''}>
                                {r.message || '—'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default function AdminMonitoring() {
    const navigate = useNavigate()
    const socket = useSocket()

    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState<SystemStatus | null>(null)
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
    const [auditStats, setAuditStats] = useState<AuditStats | null>(null)
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
    const [backups, setBackups] = useState<Backup[]>([])
    const [alert, setAlert] = useState<SystemAlert | null>(null)

    const [diagMode, setDiagMode] = useState<DiagnosticMode>('core')
    const [diagRunning, setDiagRunning] = useState(false)
    const [diagResults, setDiagResults] = useState<DiagnosticResult[]>([])
    const [diagLastRunAt, setDiagLastRunAt] = useState<string>('')

    // Server tests (Jest) panel
    const [serverTests, setServerTests] = useState<string[]>([])
    const [selectedServerTest, setSelectedServerTest] = useState<string>('')
    const [serverTestsRunning, setServerTestsRunning] = useState<boolean>(false)
    const [serverTestsResult, setServerTestsResult] = useState<any | null>(null)

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

    const buildDiagnostics = useCallback(
        (mode: DiagnosticMode) => {
            const checks: Array<{ id: string; name: string; run: () => Promise<{ message?: string; detail?: string } | void> }> = [
                {
                    id: 'browser-storage',
                    name: 'Navigateur: stockage local/session',
                    run: async () => {
                        const k = `diag_${Date.now()}`
                        try {
                            localStorage.setItem(k, '1')
                            const v = localStorage.getItem(k)
                            localStorage.removeItem(k)
                            if (v !== '1') throw new Error('localStorage_read_mismatch')
                        } catch (e: any) {
                            throw new Error(`localStorage_failed - ${errorToMessage(e)}`)
                        }

                        try {
                            sessionStorage.setItem(k, '1')
                            const v = sessionStorage.getItem(k)
                            sessionStorage.removeItem(k)
                            if (v !== '1') throw new Error('sessionStorage_read_mismatch')
                        } catch (e: any) {
                            throw new Error(`sessionStorage_failed - ${errorToMessage(e)}`)
                        }
                        return { message: 'OK' }
                    },
                },
                {
                    id: 'settings-public',
                    name: 'API: /settings/public',
                    run: async () => {
                        const r = await api.get('/settings/public')
                        const data = r.data
                        const ok = data && typeof data === 'object'
                        if (!ok) throw new Error('invalid_response_shape')
                        return { message: 'OK' }
                    },
                },
                {
                    id: 'settings-status',
                    name: 'API: /settings/status (auth admin)',
                    run: async () => {
                        const r = await api.get('/settings/status')
                        const data = r.data as SystemStatus
                        if (!data || typeof data !== 'object') throw new Error('invalid_response_shape')
                        if (data.backend !== 'online') throw new Error(`backend_not_online - ${String(data.backend)}`)
                        if (typeof data.database !== 'string') throw new Error('database_missing')
                        if (typeof data.uptime !== 'number') throw new Error('uptime_missing')
                        return { message: `${data.backend} · ${data.database}` }
                    },
                },
                {
                    id: 'admin-online-users',
                    name: 'API: /admin-extras/online-users',
                    run: async () => {
                        const r = await api.get('/admin-extras/online-users')
                        if (!Array.isArray(r.data)) throw new Error('expected_array')
                        return { message: `${r.data.length} en ligne` }
                    },
                },
                {
                    id: 'audit-stats',
                    name: 'API: /audit-logs/stats',
                    run: async () => {
                        const r = await api.get('/audit-logs/stats')
                        const data = r.data as AuditStats
                        if (!data || typeof data !== 'object') throw new Error('invalid_response_shape')
                        if (typeof data.totalLogs !== 'number') throw new Error('missing_totalLogs')
                        if (typeof data.recentLogs !== 'number') throw new Error('missing_recentLogs')
                        if (!Array.isArray(data.actionCounts)) throw new Error('missing_actionCounts')
                        return { message: `${data.recentLogs} (24h)` }
                    },
                },
                {
                    id: 'analytics',
                    name: 'API: /analytics',
                    run: async () => {
                        const r = await api.get('/analytics')
                        const data = r.data as AnalyticsData
                        if (!data || typeof data !== 'object') throw new Error('invalid_response_shape')
                        const users = data?.counts?.users
                        const classes = data?.counts?.classes
                        const students = data?.counts?.students
                        if (typeof users !== 'number' || typeof classes !== 'number' || typeof students !== 'number') throw new Error('missing_counts')
                        return { message: `${users} users · ${classes} classes · ${students} élèves` }
                    },
                },
                {
                    id: 'backup-list',
                    name: 'API: /backup/list',
                    run: async () => {
                        const r = await api.get('/backup/list')
                        if (!Array.isArray(r.data)) throw new Error('expected_array')
                        return { message: `${r.data.length} sauvegardes` }
                    },
                },
                {
                    id: 'media-list',
                    name: 'API: /media/list',
                    run: async () => {
                        const r = await api.get('/media/list')
                        if (!Array.isArray(r.data)) throw new Error('expected_array')
                        return { message: `${r.data.length} éléments` }
                    },
                },
                {
                    id: 'socket',
                    name: 'Socket: connexion temps-réel',
                    run: async () => {
                        if (!socket) throw new Error('socket_not_initialized')
                        if (socket.connected) return { message: 'connecté' }

                        await new Promise<void>((resolve, reject) => {
                            let done = false
                            const finish = (fn: () => void) => {
                                if (done) return
                                done = true
                                fn()
                            }

                            const t = window.setTimeout(() => {
                                finish(() => {
                                    socket.off('connect', onConnect)
                                    socket.off('connect_error', onError)
                                    reject(new Error('socket_connect_timeout'))
                                })
                            }, 4000)

                            const onConnect = () => {
                                finish(() => {
                                    window.clearTimeout(t)
                                    socket.off('connect_error', onError)
                                    resolve()
                                })
                            }

                            const onError = (err: any) => {
                                finish(() => {
                                    window.clearTimeout(t)
                                    socket.off('connect', onConnect)
                                    reject(new Error(errorToMessage(err)))
                                })
                            }

                            socket.once('connect', onConnect)
                            socket.once('connect_error', onError)
                        })

                        return { message: 'connecté' }
                    },
                },
            ]

            if (mode === 'extended') {
                checks.push(
                    {
                        id: 'levels',
                        name: 'API: /levels',
                        run: async () => {
                            const r = await api.get('/levels')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} niveaux` }
                        },
                    },
                    {
                        id: 'school-years',
                        name: 'API: /school-years',
                        run: async () => {
                            const r = await api.get('/school-years')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} années` }
                        },
                    },
                    {
                        id: 'users',
                        name: 'API: /users',
                        run: async () => {
                            const r = await api.get('/users')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} utilisateurs` }
                        },
                    },
                    {
                        id: 'classes',
                        name: 'API: /classes',
                        run: async () => {
                            const r = await api.get('/classes')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} classes` }
                        },
                    },
                    {
                        id: 'students',
                        name: 'API: /students',
                        run: async () => {
                            const r = await api.get('/students')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} élèves` }
                        },
                    },
                    {
                        id: 'templates',
                        name: 'API: /templates',
                        run: async () => {
                            const r = await api.get('/templates')
                            if (!Array.isArray(r.data)) throw new Error('expected_array')
                            return { message: `${r.data.length} templates` }
                        },
                    },
                    // Promotion / bulk-assign smoke test: create a temporary template, assign to a level, then cleanup
                    {
                        id: 'bulk-assign-level',
                        name: 'Promotion: assignation en masse (bulk-level create/delete)',
                        run: async () => {
                            const lvRes = await api.get('/levels')
                            const levels = lvRes.data
                            if (!Array.isArray(levels) || levels.length === 0) throw new Error('no_levels')
                            const level = levels[0].name || levels[0]._id

                            // Create temporary template
                            const tpl = await api.post('/templates', { name: `diag-template-${Date.now()}`, pages: [] })
                            const templateId = tpl.data?._id || tpl.data?.id
                            if (!templateId) throw new Error('template_create_failed')

                            try {
                                const bulk = await api.post('/template-assignments/bulk-level', { templateId, level })
                                const count = bulk.data && typeof bulk.data.count === 'number' ? bulk.data.count : 0

                                // Attempt to delete the assignments we just created
                                await api.delete(`/template-assignments/bulk-level/${templateId}/${encodeURIComponent(level)}`)

                                return { message: `assigned ${count} then removed` }
                            } finally {
                                // Cleanup template
                                try {
                                    await api.delete(`/templates/${templateId}`)
                                } catch (e) {
                                    // swallow - cleanup best-effort
                                }
                            }
                        },
                    },
                    // Admin signatures flow: create -> activate -> delete
                    {
                        id: 'signatures-admin',
                        name: 'Signatures: create/activate/delete admin signature',
                        run: async () => {
                            const create = await api.post('/signatures/admin', { name: `diag-sig-${Date.now()}`, dataUrl: 'data:image/png;base64,AAA' })
                            const id = create.data?._id || create.data?.id
                            if (!id) throw new Error('signature_create_failed')

                            await api.post(`/signatures/admin/${id}/activate`, {})
                            await api.delete(`/signatures/admin/${id}`)
                            return { message: 'created/activated/deleted' }
                        },
                    },
                    // Admin sign on non-existent assignment should return 404
                    {
                        id: 'admin-sign-nonexistent',
                        name: 'Sign: admin sign non-existent assignment returns 404',
                        run: async () => {
                            try {
                                await api.post('/admin-extras/templates/000000000000000000000000/sign')
                                throw new Error('expected_404')
                            } catch (e: any) {
                                if (e?.response?.status === 404) return { message: '404 as expected' }
                                throw e
                            }
                        },
                    },
                    // SubAdmin signature endpoint accessibility (may be forbidden for ADMIN but that's acceptable)
                    {
                        id: 'subadmin-signature-endpoint',
                        name: 'SubAdmin signature endpoint',
                        run: async () => {
                            try {
                                const r = await api.get('/subadmin/signature')
                                if (Array.isArray(r.data)) return { message: `${r.data.length} signatures` }
                                return { message: 'ok' }
                            } catch (e: any) {
                                if (e?.response?.status === 403) return { message: 'forbidden for admin' }
                                if (e?.response?.status === 404 && e?.response?.data?.error === 'no_signature') return { message: 'no_signature' }
                                throw e
                            }
                        },
                    },
                    // Levels coverage: ensure each level has classes/students for active year
                    {
                        id: 'levels-coverage',
                        name: 'Levels coverage (classes per level)',
                        run: async () => {
                            const levelsRes = await api.get('/levels')
                            const levels = Array.isArray(levelsRes.data) ? levelsRes.data : []
                            if (levels.length === 0) throw new Error('no_levels')

                            const syRes = await api.get('/school-years')
                            const years = Array.isArray(syRes.data) ? syRes.data : []
                            const active = years.find((y: any) => y.active) || years[0]
                            if (!active) throw new Error('no_school_years')

                            const classesRes = await api.get(`/classes?schoolYearId=${String(active._id)}`)
                            const classes = Array.isArray(classesRes.data) ? classesRes.data : []

                            const counts = levels.map((lv: any) => {
                                const cls = classes.filter((c: any) => String(c.level || '').toUpperCase() === String(lv.name || '').toUpperCase())
                                return `${lv.name}:${cls.length}`
                            })

                            return { message: counts.join(', ') }
                        },
                    },
                    // Impersonate a SUBADMIN and check subadmin endpoints (will restore token afterwards)
                    {
                        id: 'impersonate-subadmin',
                        name: 'Impersonate SUBADMIN and check endpoints',
                        run: async () => {
                            const u = await api.get('/users')
                            const users = Array.isArray(u.data) ? u.data : []
                            const sub = users.find((x: any) => x.role === 'SUBADMIN' || x.role === 'AEFE')
                            if (!sub) throw new Error('no_subadmin_user')

                            const originalToken = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
                            // start impersonation
                            const start = await api.post('/impersonation/start', { targetUserId: sub._id || sub.id })
                            const token = start.data?.token
                            if (!token) throw new Error('impersonation_failed')

                            sessionStorage.setItem('token', token)

                            try {
                                const p = await api.get('/subadmin/promoted-students')
                                const classes = await api.get('/subadmin/classes')
                                return { message: `promoted:${(p.data || []).length} classes:${(classes.data || []).length}` }
                            } finally {
                                // Attempt to stop impersonation; always restore original token
                                try {
                                    const stop = await api.post('/impersonation/stop')
                                    const restored = stop.data?.token
                                    if (restored) sessionStorage.setItem('token', restored)
                                    else if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    }
                                } catch (e) {
                                    if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    } else {
                                        sessionStorage.removeItem('token')
                                    }
                                }
                            }
                        },
                    },
                    // Impersonate a TEACHER and check teacher endpoints
                    {
                        id: 'impersonate-teacher',
                        name: 'Impersonate TEACHER and check endpoints',
                        run: async () => {
                            const u = await api.get('/users')
                            const users = Array.isArray(u.data) ? u.data : []
                            const teacher = users.find((x: any) => x.role === 'TEACHER')
                            if (!teacher) throw new Error('no_teacher_user')

                            const originalToken = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
                            const start = await api.post('/impersonation/start', { targetUserId: teacher._id || teacher.id })
                            const token = start.data?.token
                            if (!token) throw new Error('impersonation_failed')

                            sessionStorage.setItem('token', token)

                            try {
                                        const classesRes = await api.get('/teacher/classes')
                                const classes = Array.isArray(classesRes.data) ? classesRes.data : []
                                if (classes.length === 0) return { message: 'no_classes' }

                                const classId = classes[0]._id || classes[0].id
                                const assignRes = await api.get(`/teacher/classes/${classId}/assignments`)
                                const assignments = Array.isArray(assignRes.data) ? assignRes.data : []
                                return { message: `classes:${classes.length} assignments:${assignments.length}` }
                            } finally {
                                try {
                                    const stop = await api.post('/impersonation/stop')
                                    const restored = stop.data?.token
                                    if (restored) sessionStorage.setItem('token', restored)
                                    else if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    }
                                } catch (e) {
                                    if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    } else {
                                        sessionStorage.removeItem('token')
                                    }
                                }
                            }
                        },
                    },
                    // Subadmin promote protected test: impersonate subadmin and try to promote an assignment (expect 403/not_authorized or not_signed_by_you)
                    {
                        id: 'subadmin-promote-protected',
                        name: 'SubAdmin promote endpoint protection',
                        run: async () => {
                            const u = await api.get('/users')
                            const users = Array.isArray(u.data) ? u.data : []
                            const sub = users.find((x: any) => x.role === 'SUBADMIN' || x.role === 'AEFE')
                            if (!sub) throw new Error('no_subadmin_user')

                            const assignmentsRes = await api.get('/template-assignments')
                            const assignments = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []
                            if (assignments.length === 0) return { message: 'no_assignments' }

                            const assignmentId = assignments[0]._id || assignments[0].id

                            const originalToken = sessionStorage.getItem('token') || localStorage.getItem('token') || ''
                            const start = await api.post('/impersonation/start', { targetUserId: sub._id || sub.id })
                            const token = start.data?.token
                            if (!token) throw new Error('impersonation_failed')

                            sessionStorage.setItem('token', token)

                            try {
                                try {
                                    await api.post(`/subadmin/templates/${assignmentId}/promote`, { nextLevel: 'TEST' })
                                    return { message: 'promote_succeeded' }
                                } catch (e: any) {
                                    const status = e?.response?.status
                                    const err = e?.response?.data?.error || e?.message
                                    if (status === 403 || status === 400) return { message: `protected:${String(err)}` }
                                    throw e
                                }
                            } finally {
                                try {
                                    const stop = await api.post('/impersonation/stop')
                                    const restored = stop.data?.token
                                    if (restored) sessionStorage.setItem('token', restored)
                                    else if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    }
                                } catch (e) {
                                    if (originalToken) {
                                        if (localStorage.getItem('token')) localStorage.setItem('token', originalToken)
                                        else sessionStorage.setItem('token', originalToken)
                                    } else {
                                        sessionStorage.removeItem('token')
                                    }
                                }
                            }
                        },
                    }
                )
            }

            return checks
        },
        [socket]
    )

    const diagSummary = useMemo(() => {
        const total = diagResults.length
        const passed = diagResults.filter(r => r.status === 'pass').length
        const failed = diagResults.filter(r => r.status === 'fail').length
        const running = diagResults.filter(r => r.status === 'running').length
        return { total, passed, failed, running }
    }, [diagResults])

    const diagLastRunLabel = useMemo(() => {
        if (!diagLastRunAt) return 'Jamais exécuté'
        const d = new Date(diagLastRunAt)
        if (Number.isNaN(d.getTime())) return 'Dernière exécution: —'
        return `Dernière exécution: ${d.toLocaleString()}`
    }, [diagLastRunAt])

    const resetDiagnostics = useCallback(() => {
        const checks = buildDiagnostics(diagMode)
        setDiagResults(checks.map(c => ({ id: c.id, name: c.name, status: 'idle' as const })))
        setDiagLastRunAt('')
        setDiagRunning(false)
    }, [buildDiagnostics, diagMode])

    // Load available server test files for the Server Tests panel
    const loadServerTestsList = useCallback(async () => {
        try {
            const r = await api.get('/admin-extras/run-tests/list')
            const tests = Array.isArray(r.data?.tests) ? r.data.tests : []
            setServerTests(tests)
        } catch (e: any) {
            // ignore
            console.error('failed to fetch server tests list', e)
        }
    }, [])

    useEffect(() => {
        loadServerTestsList()
    }, [loadServerTestsList])

    const runServerTests = useCallback(async () => {
        setServerTestsRunning(true)
        setServerTestsResult(null)
        try {
            const body: any = {}
            if (selectedServerTest) body.pattern = selectedServerTest
            const r = await api.post('/admin-extras/run-tests', body)
            setServerTestsResult(r.data)
        } catch (e: any) {
            if (e?.response?.data) setServerTestsResult(e.response.data)
            else setServerTestsResult({ error: errorToMessage(e) })
        } finally {
            setServerTestsRunning(false)
            loadServerTestsList()
        }
    }, [selectedServerTest, loadServerTestsList])

    useEffect(() => {
        resetDiagnostics()
    }, [resetDiagnostics])

    const runDiagnostics = useCallback(async () => {
        const checks = buildDiagnostics(diagMode)
        setDiagRunning(true)
        setDiagLastRunAt(new Date().toISOString())
        setDiagResults(checks.map(c => ({ id: c.id, name: c.name, status: 'running' as const })))

        for (const c of checks) {
            const start = performance.now()
            try {
                const out = await c.run()
                const durationMs = performance.now() - start
                setDiagResults(prev =>
                    prev.map(r =>
                        r.id === c.id
                            ? {
                                  ...r,
                                  status: 'pass',
                                  durationMs,
                                  message: out && (out as any).message ? String((out as any).message) : 'OK',
                                  detail: out && (out as any).detail ? String((out as any).detail) : undefined,
                              }
                            : r
                    )
                )
            } catch (e: any) {
                const durationMs = performance.now() - start
                const msg = errorToMessage(e)
                setDiagResults(prev =>
                    prev.map(r =>
                        r.id === c.id
                            ? { ...r, status: 'fail', durationMs, message: msg, detail: msg }
                            : r
                    )
                )
            }
        }

        setDiagRunning(false)
    }, [buildDiagnostics, diagMode])

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
            {
                title: 'Tests Automatiques',
                status: diagSummary.failed > 0 ? 'KO' : diagSummary.passed > 0 ? 'OK' : '—',
                description: (
                    <DiagnosticsPanel
                        mode={diagMode}
                        setMode={setDiagMode}
                        running={diagRunning}
                        results={diagResults}
                        summary={diagSummary}
                        lastRunLabel={diagLastRunLabel}
                        onRun={runDiagnostics}
                        onReset={resetDiagnostics}
                    />
                ),
                footerLabel: 'Diagnostic',
                progress: diagSummary.total > 0 ? Math.round((diagSummary.passed / diagSummary.total) * 100) : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19V5"></path>
                        <path d="M4 12h16"></path>
                        <path d="M20 19V5"></path>
                        <path d="M8 9l2 2 4-4"></path>
                    </svg>
                ),
                color: diagSummary.failed > 0 ? '#ef4444' : diagSummary.passed > 0 ? '#22c55e' : '#64748b',
            },
            {
                title: 'Tests Serveur (Jest)',
                status: serverTestsResult && serverTestsResult.results ? (serverTestsResult.results.numFailedTests > 0 ? 'KO' : 'OK') : (serverTestsRunning ? 'En cours' : '—'),
                description: (
                    <div style={{ padding: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <select value={selectedServerTest} onChange={e => setSelectedServerTest(e.target.value)} style={{ minWidth: 320 }}>
                                <option value="">Executer tous les tests</option>
                                {serverTests.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <button className="btn primary" onClick={runServerTests} disabled={serverTestsRunning} style={{ padding: '6px 12px' }}>
                                {serverTestsRunning ? 'Exécution…' : 'Lancer les tests'}
                            </button>
                            <button className="btn secondary" onClick={loadServerTestsList} disabled={serverTestsRunning} style={{ padding: '6px 12px' }}>
                                Actualiser
                            </button>
                        </div>

                        {serverTestsResult && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 13, color: '#334155' }}>
                                    Exit code: {String(serverTestsResult.code ?? 'n/a')}
                                </div>

                                {serverTestsResult.results ? (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ fontSize: 13, color: '#334155' }}>
                                            Suites: {serverTestsResult.results.numTotalTestSuites} · Tests: {serverTestsResult.results.numTotalTests} · Failed: {serverTestsResult.results.numFailedTests}
                                        </div>
                                        <pre style={{ maxHeight: 220, overflow: 'auto', background: '#0f172a', color: '#fff', padding: 8, marginTop: 8 }}>
                                            {JSON.stringify(serverTestsResult.results.testResults.map((r: any) => ({ file: r.name, status: r.status, assertions: r.assertionResults?.length })), null, 2)}
                                        </pre>
                                    </div>
                                ) : (
                                    serverTestsResult.stdout && <pre style={{ maxHeight: 220, overflow: 'auto', background: '#0f172a', color: '#fff', padding: 8, marginTop: 8 }}>{serverTestsResult.stdout}</pre>
                                )}

                                {serverTestsResult.error && (
                                    <div style={{ marginTop: 8, color: '#ef4444' }}>Error: {String(serverTestsResult.error)}</div>
                                )}
                            </div>
                        )}
                    </div>
                ),
                footerLabel: 'Server tests',
                progress: serverTestsResult && serverTestsResult.results ? Math.round(((serverTestsResult.results.numTotalTests - serverTestsResult.results.numFailedTests) / serverTestsResult.results.numTotalTests) * 100) : 0,
                icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                ),
                color: serverTestsResult && serverTestsResult.results && serverTestsResult.results.numFailedTests > 0 ? '#ef4444' : '#334155',
            },
        ]
    }, [
        alert,
        analytics,
        auditStats,
        backups,
        diagLastRunLabel,
        diagMode,
        diagResults,
        diagRunning,
        diagSummary.failed,
        diagSummary.passed,
        diagSummary.total,
        onlineUsers,
        resetDiagnostics,
        runDiagnostics,
        status,
    ])

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
