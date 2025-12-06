import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import './AdminAllGradebooks.css'

type Assignment = {
    _id: string
    status: string
    template?: { name: string }
    student?: { firstName: string; lastName: string }
    signature?: { signedAt: Date; subAdminId: string }
    className?: string
    level?: string
}

export default function AdminAllGradebooks() {
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [filter, setFilter] = useState<'all' | 'signed' | 'unsigned'>('all')
    const [search, setSearch] = useState('')
    const [levelFilter, setLevelFilter] = useState<string>('')
    const [sortBy, setSortBy] = useState<'name' | 'signed_first' | 'unsigned_first' | 'date_desc'>('name')
    const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const res = await api.get('/admin-extras/all-gradebooks')
                setAssignments(res.data)
            } catch (e: any) {
                setError('Impossible de charger les données')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const stats = useMemo(() => {
        const total = assignments.length
        const signed = assignments.filter(a => !!a.signature).length
        const unsigned = total - signed
        return { total, signed, unsigned }
    }, [assignments])

    const levels = useMemo(() => {
        const s = new Set<string>()
        assignments.forEach(a => { if (a.level) s.add(a.level) })
        return Array.from(s).sort()
    }, [assignments])

    const filteredAssignments = useMemo(() => {
        let list = assignments
        if (filter === 'signed') list = list.filter(a => !!a.signature)
        if (filter === 'unsigned') list = list.filter(a => !a.signature)
        if (levelFilter) list = list.filter(a => (a.level || '') === levelFilter)
        if (search.trim()) {
            const q = search.trim().toLowerCase()
            list = list.filter(a => {
                const n = `${a.student?.firstName || ''} ${a.student?.lastName || ''}`.toLowerCase()
                const c = (a.className || '').toLowerCase()
                const t = (a.template?.name || '').toLowerCase()
                return n.includes(q) || c.includes(q) || t.includes(q)
            })
        }
        if (sortBy === 'name') {
            list = [...list].sort((x, y) => {
                const ax = `${x.student?.firstName || ''} ${x.student?.lastName || ''}`.toLowerCase()
                const ay = `${y.student?.firstName || ''} ${y.student?.lastName || ''}`.toLowerCase()
                return ax.localeCompare(ay)
            })
        } else if (sortBy === 'signed_first') {
            list = [...list].sort((x, y) => Number(!!y.signature) - Number(!!x.signature))
        } else if (sortBy === 'unsigned_first') {
            list = [...list].sort((x, y) => Number(!!x.signature) - Number(!!y.signature))
        } else if (sortBy === 'date_desc') {
            list = [...list].sort((x, y) => {
                const dx = x.signature ? new Date(x.signature.signedAt).getTime() : 0
                const dy = y.signature ? new Date(y.signature.signedAt).getTime() : 0
                return dy - dx
            })
        }
        return list
    }, [assignments, filter, levelFilter, search, sortBy])

    // Group by Level -> Class
    const grouped = filteredAssignments.reduce((acc, curr) => {
        const level = curr.level || 'Sans niveau'
        const className = curr.className || 'Sans classe'
        if (!acc[level]) acc[level] = {}
        if (!acc[level][className]) acc[level][className] = []
        acc[level][className].push(curr)
        return acc
    }, {} as Record<string, Record<string, Assignment[]>>)

    const sortedLevels = Object.keys(grouped).sort()

    return (
        <div className="all-gradebooks-container">
            <div className="header-bar">
                <div className="title-wrap">
                    <h1 className="page-title">Tous les carnets</h1>
                    <div className="subtitle">Vue globale par niveau et classe</div>
                </div>
                <div className="stats-bar">
                    <div className="stat-pill">
                        <span className="stat-label">Total</span>
                        <span className="stat-value">{stats.total}</span>
                    </div>
                    <div className="stat-pill success">
                        <span className="stat-label">Signés</span>
                        <span className="stat-value">{stats.signed}</span>
                    </div>
                    <div className="stat-pill warning">
                        <span className="stat-label">Non signés</span>
                        <span className="stat-value">{stats.unsigned}</span>
                    </div>
                </div>
            </div>

            <div className="filters-toolbar">
                <div className="segmented">
                    <button className={`segment ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Tous</button>
                    <button className={`segment ${filter === 'signed' ? 'active' : ''}`} onClick={() => setFilter('signed')}>Signés</button>
                    <button className={`segment ${filter === 'unsigned' ? 'active' : ''}`} onClick={() => setFilter('unsigned')}>Non signés</button>
                </div>
                <div className="filters-inline">
                    <input className="search-input" placeholder="Rechercher élève, classe, modèle" value={search} onChange={e => setSearch(e.target.value)} />
                    <select className="select" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
                        <option value="">Tous les niveaux</option>
                        {levels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                        <option value="name">A→Z</option>
                        <option value="signed_first">Signés d'abord</option>
                        <option value="unsigned_first">Non signés d'abord</option>
                        <option value="date_desc">Par date signature</option>
                    </select>
                </div>
            </div>

            {loading && (
                <div className="loading-card">
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                    <div className="skeleton-grid">
                        <div className="skeleton-card" />
                        <div className="skeleton-card" />
                        <div className="skeleton-card" />
                        <div className="skeleton-card" />
                    </div>
                </div>
            )}

            {error && (
                <div className="error-banner">{error}</div>
            )}

            {!loading && sortedLevels.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <div>Aucun carnet trouvé pour ces critères.</div>
                </div>
            )}

            {!loading && sortedLevels.map(level => {
                const isExpanded = expandedLevels[level] ?? true
                const toggle = () => setExpandedLevels(p => ({ ...p, [level]: !(p[level] ?? true) }))
                const classes = Object.keys(grouped[level]).sort()
                return (
                    <div key={level} className="level-section">
                        <div className="level-header" onClick={toggle}>
                            <div className="level-title">
                                <span className="level-badge">{level}</span>
                                <span className="level-count">{classes.length} classes</span>
                            </div>
                            <button className={`collapse-btn ${isExpanded ? 'open' : ''}`}>{isExpanded ? 'Replier' : 'Déplier'}</button>
                        </div>
                        {isExpanded && (
                            <div className="level-body">
                                {classes.map(className => (
                                    <div key={className} className="class-block">
                                        <div className="class-header">
                                            <h3 className="class-title">{className}</h3>
                                            <div className="class-count">{grouped[level][className].length} carnets</div>
                                        </div>
                                        <div className="cards-grid">
                                            {grouped[level][className].map(assignment => {
                                                const signed = !!assignment.signature
                                                const signedDate = signed ? new Date(assignment.signature!.signedAt).toLocaleDateString() : ''
                                                const pdfUrl = (() => {
                                                    const token = localStorage.getItem('token')
                                                    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                                                    const tid = assignment.template?._id
                                                    const sid = assignment.student?._id
                                                    if (!tid || !sid) return ''
                                                    return `${base}/pdf-v2/student/${sid}?templateId=${tid}&token=${token}`
                                                })()
                                                return (
                                                    <div key={assignment._id} className={`gradebook-card ${signed ? 'signed' : 'unsigned'}`}>
                                                        <div className="card-main">
                                                            <div className="card-title">{assignment.student?.firstName} {assignment.student?.lastName}</div>
                                                            <div className="card-subtitle">{assignment.template?.name}</div>
                                                        </div>
                                                        <div className="card-meta">
                                                            {signed ? (
                                                                <span className="badge success">Signé le {signedDate}</span>
                                                            ) : (
                                                                <span className="badge warning">Non signé</span>
                                                            )}
                                                            <span className="status-pill">{assignment.status}</span>
                                                        </div>
                                                        <div className="card-actions">
                                                            <Link to={`/admin/gradebooks/${assignment._id}/review`} className="action-btn primary">Voir</Link>
                                                            <a className={`action-btn ${pdfUrl ? 'secondary' : 'disabled'}`} href={pdfUrl || undefined} target="_blank">PDF</a>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
