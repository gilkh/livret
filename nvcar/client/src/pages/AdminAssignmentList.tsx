import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { 
    Search, 
    Users, 
    BookOpen, 
    ShieldCheck, 
    Trash2, 
    Plus, 
    ArrowLeft, 
    Calendar, 
    XCircle,
    CheckCircle2,
    Filter,
    Loader2
} from 'lucide-react'
import api from '../api'
import './AdminAssignments.css'

type TeacherClassAssignment = {
    _id: string
    teacherId: string
    classId: string
    assignedAt: string
    className?: string
    teacherName?: string
    languages?: string[]
}

type TemplateAssignment = {
    _id: string
    templateId: string
    studentId: string
    assignedTeachers: string[]
    status: string
    assignedAt: string
    templateName?: string
    studentName?: string
    className?: string
    classId?: string
    level?: string
}

type SubAdminLevelAssignment = {
    subAdminId: string
    subAdminName: string
    level: string
}

type GroupedTemplateAssignment = {
    key: string
    templateId: string
    level: string
    templateName: string
    count: number
    ids: string[]
}

export default function AdminAssignmentList() {
    const [teacherClassAssignments, setTeacherClassAssignments] = useState<TeacherClassAssignment[]>([])
    const [templateAssignments, setTemplateAssignments] = useState<TemplateAssignment[]>([])
    const [subAdminAssignments, setSubAdminAssignments] = useState<SubAdminLevelAssignment[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | null }>({ text: '', type: null })
    const [activeTab, setActiveTab] = useState<'teachers' | 'templates' | 'subadmins'>('teachers')
    const [searchTerm, setSearchTerm] = useState('')

    const tripleConfirm = (msg: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!confirm(`${msg}\n\nConfirmation ${attempt}/3`)) return false
        }
        return true
    }

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            const [tcRes, taRes, saRes] = await Promise.all([
                api.get('/teacher-assignments'),
                api.get('/template-assignments'),
                api.get('/subadmin-assignments/levels'),
            ])
            setTeacherClassAssignments(tcRes.data)
            setTemplateAssignments(taRes.data)
            
            const flattened: SubAdminLevelAssignment[] = []
            saRes.data.forEach((item: any) => {
                item.levels.forEach((level: string) => {
                    flattened.push({
                        subAdminId: item.subAdminId,
                        subAdminName: item.subAdminName,
                        level: level
                    })
                })
            })
            setSubAdminAssignments(flattened)
        } catch (e) {
            console.error('Failed to load assignments', e)
            showToast('Erreur lors du chargement des données', 'error')
        } finally {
            setLoading(false)
        }
    }

    const showToast = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type })
        setTimeout(() => setMessage({ text: '', type: null }), 4000)
    }

    const deleteTeacherClass = async (id: string) => {
        if (!tripleConfirm('Supprimer cette assignation enseignant-classe ?')) return
        try {
            await api.delete(`/teacher-assignments/${id}`)
            showToast('Assignation supprimée avec succès', 'success')
            loadData()
        } catch (e) {
            showToast('Échec de la suppression', 'error')
        }
    }

    const deleteSubAdminAssignment = async (subAdminId: string, level: string) => {
        if (!tripleConfirm(`Supprimer l'assignation ${level} pour ce sous-admin ?`)) return
        try {
            await api.delete(`/subadmin-assignments/levels/${subAdminId}/${level}`)
            showToast('Assignation supprimée avec succès', 'success')
            loadData()
        } catch (e) {
            showToast('Échec de la suppression', 'error')
        }
    }

    const deleteGroupedTemplateAssignment = async (ids: string[]) => {
        if (!tripleConfirm(`Supprimer ces ${ids.length} assignations de carnet ?`)) return
        try {
            await Promise.all(ids.map(id => api.delete(`/template-assignments/${id}`)))
            showToast(`${ids.length} assignations supprimées`, 'success')
            loadData()
        } catch (e) {
            showToast('Échec de la suppression groupée', 'error')
        }
    }

    const levelTemplateList = useMemo(() => {
        const grouped = templateAssignments.reduce((acc, curr) => {
            if (!curr.level) return acc
            const key = `${curr.templateId}-${curr.level}`
            if (!acc[key]) {
                acc[key] = {
                    key,
                    templateId: curr.templateId,
                    level: curr.level,
                    templateName: curr.templateName || 'Template inconnu',
                    count: 0,
                    ids: []
                }
            }
            acc[key].count++
            acc[key].ids.push(curr._id)
            return acc
        }, {} as Record<string, GroupedTemplateAssignment>)
        return Object.values(grouped)
    }, [templateAssignments])

    const filteredTeachers = teacherClassAssignments.filter(a => 
        (a.teacherName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.className || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredTemplates = levelTemplateList.filter(a => 
        (a.templateName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.level || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredSubAdmins = subAdminAssignments.filter(a => 
        (a.subAdminName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.level || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (loading) return (
        <div className="aa-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <Loader2 className="aa-spin" size={48} color="var(--primary)" />
                <p style={{ marginTop: 16, color: '#64748b' }}>Chargement des assignations...</p>
            </div>
        </div>
    )

    return (
        <div className="aa-page">
            {message.text && (
                <div className={`aa-toast ${message.type === 'success' ? 'aa-toast-success' : 'aa-toast-error'}`}>
                    {message.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    {message.text}
                </div>
            )}

            <header className="aa-header">
                <div className="aa-header-content">
                    <div className="aa-header-left">
                        <div className="aa-header-icon">
                            <Filter size={24} />
                        </div>
                        <div>
                            <h1 className="aa-title">Liste des assignations</h1>
                            <p className="aa-subtitle">
                                <Calendar size={14} /> Vue d'ensemble des relations configurées
                            </p>
                        </div>
                    </div>
                    <div className="aa-header-actions">
                        <Link to="/admin/assignments" className="aa-btn aa-btn-primary">
                            <Plus size={18} /> Nouvelle assignation
                        </Link>
                        <Link to="/admin" className="aa-btn aa-btn-secondary">
                            <ArrowLeft size={18} /> Retour
                        </Link>
                    </div>
                </div>
            </header>

            <nav className="aa-tabs">
                <button 
                    className={`aa-tab ${activeTab === 'teachers' ? 'aa-tab-active' : ''}`}
                    onClick={() => setActiveTab('teachers')}
                    style={{ '--tab-color': '#6366f1', '--tab-bg': '#eef2ff' } as any}
                >
                    <Users size={18} />
                    <span className="aa-tab-label">Enseignant → Classe</span>
                    <span className="aa-tab-count">{teacherClassAssignments.length}</span>
                </button>
                <button 
                    className={`aa-tab ${activeTab === 'templates' ? 'aa-tab-active' : ''}`}
                    onClick={() => setActiveTab('templates')}
                    style={{ '--tab-color': '#f59e0b', '--tab-bg': '#fff7ed' } as any}
                >
                    <BookOpen size={18} />
                    <span className="aa-tab-label">Carnet → Niveau</span>
                    <span className="aa-tab-count">{levelTemplateList.length}</span>
                </button>
                <button 
                    className={`aa-tab ${activeTab === 'subadmins' ? 'aa-tab-active' : ''}`}
                    onClick={() => setActiveTab('subadmins')}
                    style={{ '--tab-color': '#ec4899', '--tab-bg': '#fdf2f8' } as any}
                >
                    <ShieldCheck size={18} />
                    <span className="aa-tab-label">Sous-Admin → Niveau</span>
                    <span className="aa-tab-count">{subAdminAssignments.length}</span>
                </button>
            </nav>

            <main className="aa-content">
                <div className="aa-panel">
                    <div className="aa-panel-header">
                        <div className="aa-search-field" style={{ flex: 1, maxWidth: '400px' }}>
                            <Search className="aa-search-icon" size={18} />
                            <input 
                                type="text" 
                                className="aa-input" 
                                placeholder="Rechercher une assignation..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="aa-import-table-wrapper">
                        <table className="aa-import-table">
                            <thead>
                                {activeTab === 'teachers' && (
                                    <tr>
                                        <th style={{ width: '35%' }}>Enseignant</th>
                                        <th style={{ width: '20%' }}>Classe</th>
                                        <th style={{ width: '20%' }}>Langues</th>
                                        <th style={{ width: '15%' }}>Date</th>
                                        <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                )}
                                {activeTab === 'templates' && (
                                    <tr>
                                        <th style={{ width: '40%' }}>Template</th>
                                        <th style={{ width: '25%' }}>Niveau</th>
                                        <th style={{ width: '25%' }}>Élèves concernés</th>
                                        <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                )}
                                {activeTab === 'subadmins' && (
                                    <tr>
                                        <th style={{ width: '50%' }}>Sous-Admin</th>
                                        <th style={{ width: '40%' }}>Niveau</th>
                                        <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {activeTab === 'teachers' && filteredTeachers.map(a => (
                                    <tr key={a._id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ 
                                                    width: 32, height: 32, borderRadius: '50%', 
                                                    background: '#eef2ff', color: '#6366f1',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 600, fontSize: '0.8rem'
                                                }}>
                                                    {(a.teacherName || '?')[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{a.teacherName || a.teacherId}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="aa-tag aa-tag-purple">
                                                {a.className || a.classId}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {a.languages && a.languages.length > 0 ? (
                                                    a.languages.map(lang => (
                                                        <span key={lang} className="aa-tag" style={{ background: '#f0f9ff', color: '#0369a1', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                                            {lang}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="aa-tag aa-tag-muted">Toutes</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Calendar size={12} />
                                                {new Date(a.assignedAt).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button 
                                                className="aa-btn-icon aa-btn-icon-danger"
                                                onClick={() => deleteTeacherClass(a._id)}
                                                title="Supprimer"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {activeTab === 'templates' && filteredTemplates.map(a => (
                                    <tr key={a.key}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ 
                                                    width: 32, height: 32, borderRadius: 8, 
                                                    background: '#fff7ed', color: '#f59e0b',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <BookOpen size={16} />
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{a.templateName}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="aa-tag" style={{ background: '#fff7ed', color: '#c2410c' }}>
                                                {a.level}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 500, color: '#475569' }}>
                                                {a.count} élève(s)
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button 
                                                className="aa-btn-icon aa-btn-icon-danger"
                                                onClick={() => deleteGroupedTemplateAssignment(a.ids)}
                                                title="Supprimer tout le groupe"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {activeTab === 'subadmins' && filteredSubAdmins.map((a, idx) => (
                                    <tr key={`${a.subAdminId}-${a.level}-${idx}`}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ 
                                                    width: 32, height: 32, borderRadius: '50%', 
                                                    background: '#fdf2f8', color: '#db2777',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 600, fontSize: '0.8rem'
                                                }}>
                                                    {(a.subAdminName || '?')[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{a.subAdminName || a.subAdminId}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="aa-tag" style={{ background: '#fdf2f8', color: '#be185d' }}>
                                                {a.level}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button 
                                                className="aa-btn-icon aa-btn-icon-danger"
                                                onClick={() => deleteSubAdminAssignment(a.subAdminId, a.level)}
                                                title="Supprimer"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Empty States */}
                                {activeTab === 'teachers' && filteredTeachers.length === 0 && (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="aa-empty-state">
                                                <Users size={48} strokeWidth={1} />
                                                <p>Aucune assignation enseignant-classe trouvée</p>
                                                {searchTerm && <button className="aa-btn aa-btn-xs" style={{ marginTop: 8 }} onClick={() => setSearchTerm('')}>Effacer la recherche</button>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {activeTab === 'templates' && filteredTemplates.length === 0 && (
                                    <tr>
                                        <td colSpan={4}>
                                            <div className="aa-empty-state">
                                                <BookOpen size={48} strokeWidth={1} />
                                                <p>Aucune assignation carnet-niveau trouvée</p>
                                                {searchTerm && <button className="aa-btn aa-btn-xs" style={{ marginTop: 8 }} onClick={() => setSearchTerm('')}>Effacer la recherche</button>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {activeTab === 'subadmins' && filteredSubAdmins.length === 0 && (
                                    <tr>
                                        <td colSpan={3}>
                                            <div className="aa-empty-state">
                                                <ShieldCheck size={48} strokeWidth={1} />
                                                <p>Aucune assignation sous-admin trouvée</p>
                                                {searchTerm && <button className="aa-btn aa-btn-xs" style={{ marginTop: 8 }} onClick={() => setSearchTerm('')}>Effacer la recherche</button>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    )
}
