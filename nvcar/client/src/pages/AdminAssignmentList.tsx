import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type TeacherClassAssignment = {
    _id: string
    teacherId: string
    classId: string
    assignedAt: Date
    className?: string
    teacherName?: string
}

type TemplateAssignment = {
    _id: string
    templateId: string
    studentId: string
    assignedTeachers: string[]
    status: string
    assignedAt: Date
    templateName?: string
    studentName?: string
    className?: string
    classId?: string
}

type SubAdminAssignment = {
    _id: string
    subAdminId: string
    teacherId: string
    assignedAt: Date
    subAdminName?: string
    teacherName?: string
}

export default function AdminAssignmentList() {
    const [teacherClassAssignments, setTeacherClassAssignments] = useState<TeacherClassAssignment[]>([])
    const [templateAssignments, setTemplateAssignments] = useState<TemplateAssignment[]>([])
    const [subAdminAssignments, setSubAdminAssignments] = useState<SubAdminAssignment[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            const [tcRes, taRes, saRes] = await Promise.all([
                api.get('/teacher-assignments'),
                api.get('/template-assignments'),
                api.get('/subadmin-assignments'),
            ])
            setTeacherClassAssignments(tcRes.data)
            setTemplateAssignments(taRes.data)
            setSubAdminAssignments(saRes.data)
        } catch (e) {
            console.error('Failed to load assignments', e)
        } finally {
            setLoading(false)
        }
    }

    const deleteTeacherClass = async (id: string) => {
        if (!confirm('Supprimer cette assignation enseignant-classe ?')) return
        try {
            await api.delete(`/teacher-assignments/${id}`)
            setMessage('✓ Assignation supprimée')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const deleteTemplateAssignment = async (id: string) => {
        if (!confirm('Supprimer cette assignation de carnet ?')) return
        try {
            await api.delete(`/template-assignments/${id}`)
            setMessage('✓ Assignation supprimée')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const deleteSubAdminAssignment = async (id: string) => {
        if (!confirm('Supprimer cette assignation sous-admin-enseignant ?')) return
        try {
            await api.delete(`/subadmin-assignments/${id}`)
            setMessage('✓ Assignation supprimée')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    const deleteClassTemplateAssignment = async (ids: string[]) => {
        if (!confirm(`Supprimer ces ${ids.length} assignations ?`)) return
        try {
            await Promise.all(ids.map(id => api.delete(`/template-assignments/${id}`)))
            setMessage('✓ Assignations supprimées')
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        }
    }

    // Group template assignments by class
    const classTemplateAssignments = templateAssignments.reduce((acc, curr) => {
        if (!curr.className || !curr.classId) return acc
        const key = `${curr.templateId}-${curr.classId}`
        if (!acc[key]) {
            acc[key] = {
                key,
                templateId: curr.templateId,
                classId: curr.classId,
                templateName: curr.templateName,
                className: curr.className,
                count: 0,
                ids: []
            }
        }
        acc[key].count++
        acc[key].ids.push(curr._id)
        return acc
    }, {} as Record<string, { key: string, templateId: string, classId: string, templateName: string, className: string, count: number, ids: string[] }>)

    const classTemplateList = Object.values(classTemplateAssignments)

    if (loading) return (
        <div className="container">
            <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <div className="note">Chargement des données...</div>
            </div>
        </div>
    )

    return (
        <div className="container">
            <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h2 className="title" style={{ fontSize: '2rem', marginBottom: 8 }}>Liste des assignations</h2>
                        <p className="note">Vue d'ensemble de toutes les relations configurées</p>
                    </div>
                    <div className="toolbar">
                        <Link to="/admin/assignments" className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>+</span> Nouvelle assignation
                        </Link>
                        <Link to="/admin" className="btn secondary">Retour</Link>
                    </div>
                </div>

                {message && (
                    <div style={{ 
                        marginTop: 16, 
                        padding: '12px 16px', 
                        background: message.includes('✓') ? '#f6ffed' : '#fff1f0', 
                        border: `1px solid ${message.includes('✓') ? '#b7eb8f' : '#ffa39e'}`,
                        color: message.includes('✓') ? '#389e0d' : '#cf1322',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        {message}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                
                {/* Teacher-Class Assignments */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8, fontSize: 20 }}>👨‍🏫</div>
                        <div>
                            <h3 style={{ margin: 0 }}>Enseignant → Classe</h3>
                            <div className="note">{teacherClassAssignments.length} assignation(s) active(s)</div>
                        </div>
                    </div>
                    
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Enseignant</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Classe</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Date</th>
                                    <th style={{ textAlign: 'right', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teacherClassAssignments.map(a => (
                                    <tr key={a._id} style={{ background: '#fff', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderLeft: '1px solid #f0f0f0', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
                                            <div style={{ fontWeight: 500 }}>{a.teacherName || a.teacherId}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            <div className="pill" style={{ background: '#f0f5ff', color: '#2f54eb', display: 'inline-block' }}>{a.className || a.classId}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', color: '#8c8c8c', fontSize: '0.9rem' }}>
                                            {new Date(a.assignedAt).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', borderTopRightRadius: 8, borderBottomRightRadius: 8, textAlign: 'right' }}>
                                            <button className="btn secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }} onClick={() => deleteTeacherClass(a._id)}>Supprimer</button>
                                        </td>
                                    </tr>
                                ))}
                                {teacherClassAssignments.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#8c8c8c', background: '#fafafa', borderRadius: 8 }}>Aucune assignation trouvée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Template-Class Assignments (Grouped) */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ background: '#fff7e6', padding: 8, borderRadius: 8, fontSize: 20 }}>📚</div>
                        <div>
                            <h3 style={{ margin: 0 }}>Carnet → Classe</h3>
                            <div className="note">{classTemplateList.length} assignation(s) de groupe</div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Template</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Classe</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Élèves concernés</th>
                                    <th style={{ textAlign: 'right', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classTemplateList.map(a => (
                                    <tr key={a.key} style={{ background: '#fff' }}>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderLeft: '1px solid #f0f0f0', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
                                            <div style={{ fontWeight: 500 }}>{a.templateName || a.templateId}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            <div className="pill" style={{ background: '#fff7e6', color: '#fa8c16', display: 'inline-block' }}>{a.className}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            {a.count} élève(s)
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', borderTopRightRadius: 8, borderBottomRightRadius: 8, textAlign: 'right' }}>
                                            <button className="btn secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }} onClick={() => deleteClassTemplateAssignment(a.ids)}>Tout supprimer</button>
                                        </td>
                                    </tr>
                                ))}
                                {classTemplateList.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#8c8c8c', background: '#fafafa', borderRadius: 8 }}>Aucune assignation de groupe trouvée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Template Assignments */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ background: '#f6ffed', padding: 8, borderRadius: 8, fontSize: 20 }}>🎓</div>
                        <div>
                            <h3 style={{ margin: 0 }}>Carnet → Élève</h3>
                            <div className="note">{templateAssignments.length} assignation(s) active(s)</div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Template</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Élève</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Classe</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Statut</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Date</th>
                                    <th style={{ textAlign: 'right', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {templateAssignments.map(a => (
                                    <tr key={a._id} style={{ background: '#fff' }}>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderLeft: '1px solid #f0f0f0', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
                                            <div style={{ fontWeight: 500 }}>{a.templateName || a.templateId}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            {a.studentName || a.studentId}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            <div className="pill" style={{ background: '#f0f5ff', color: '#2f54eb', display: 'inline-block' }}>{a.className || '-'}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            <span className="pill" style={{
                                                background: a.status === 'signed' ? '#f9f0ff' : a.status === 'completed' ? '#f6ffed' : a.status === 'in_progress' ? '#e6f7ff' : '#f5f5f5',
                                                color: a.status === 'signed' ? '#722ed1' : a.status === 'completed' ? '#52c41a' : a.status === 'in_progress' ? '#1890ff' : '#8c8c8c',
                                                fontSize: '0.8rem',
                                                padding: '4px 10px'
                                            }}>
                                                {a.status === 'in_progress' ? 'En cours' : a.status === 'completed' ? 'Terminé' : a.status === 'signed' ? 'Signé' : a.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', color: '#8c8c8c', fontSize: '0.9rem' }}>
                                            {new Date(a.assignedAt).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', borderTopRightRadius: 8, borderBottomRightRadius: 8, textAlign: 'right' }}>
                                            <button className="btn secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }} onClick={() => deleteTemplateAssignment(a._id)}>Supprimer</button>
                                        </td>
                                    </tr>
                                ))}
                                {templateAssignments.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#8c8c8c', background: '#fafafa', borderRadius: 8 }}>Aucune assignation trouvée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SubAdmin Assignments */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ background: '#fff0f6', padding: 8, borderRadius: 8, fontSize: 20 }}>👔</div>
                        <div>
                            <h3 style={{ margin: 0 }}>Sous-Admin → Enseignant</h3>
                            <div className="note">{subAdminAssignments.length} assignation(s) active(s)</div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Sous-Admin</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Enseignant</th>
                                    <th style={{ textAlign: 'left', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Date</th>
                                    <th style={{ textAlign: 'right', padding: '0 16px', color: '#8c8c8c', fontWeight: 500, fontSize: '0.9rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subAdminAssignments.map(a => (
                                    <tr key={a._id} style={{ background: '#fff' }}>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderLeft: '1px solid #f0f0f0', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
                                            <div style={{ fontWeight: 500 }}>{a.subAdminName || a.subAdminId}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                                            {a.teacherName || a.teacherId}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', color: '#8c8c8c', fontSize: '0.9rem' }}>
                                            {new Date(a.assignedAt).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', borderTopRightRadius: 8, borderBottomRightRadius: 8, textAlign: 'right' }}>
                                            <button className="btn secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }} onClick={() => deleteSubAdminAssignment(a._id)}>Supprimer</button>
                                        </td>
                                    </tr>
                                ))}
                                {subAdminAssignments.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#8c8c8c', background: '#fafafa', borderRadius: 8 }}>Aucune assignation trouvée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
