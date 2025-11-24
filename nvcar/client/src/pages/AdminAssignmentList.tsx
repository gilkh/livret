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

    if (loading) return <div className="container"><div className="card"><div className="note">Chargement...</div></div></div>

    return (
        <div style={{ padding: 24 }}>
            <div className="card">
                <h2 className="title">Gestion des assignations</h2>
                <div className="toolbar" style={{ marginBottom: 16 }}>
                    <Link to="/admin/assignments" className="btn">Créer nouvelle assignation</Link>
                    <Link to="/admin" className="btn secondary">← Retour</Link>
                </div>

                {message && <div className="note" style={{ marginBottom: 12, padding: 12, background: message.includes('✓') ? '#e8f5e9' : '#ffebee', borderRadius: 8 }}>{message}</div>}

                {/* Teacher-Class Assignments */}
                <h3 style={{ marginTop: 24 }}>Assignations Enseignant-Classe ({teacherClassAssignments.length})</h3>
                <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd' }}>
                            <th style={{ textAlign: 'left', padding: 8 }}>Enseignant</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Classe</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                            <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teacherClassAssignments.map(a => (
                            <tr key={a._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: 8 }}>{a.teacherId}</td>
                                <td style={{ padding: 8 }}>{a.classId}</td>
                                <td style={{ padding: 8 }}>{new Date(a.assignedAt).toLocaleDateString()}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>
                                    <button className="btn secondary" style={{ fontSize: 12 }} onClick={() => deleteTeacherClass(a._id)}>Supprimer</button>
                                </td>
                            </tr>
                        ))}
                        {teacherClassAssignments.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center' }} className="note">Aucune assignation</td></tr>
                        )}
                    </tbody>
                </table>

                {/* Template Assignments */}
                <h3 style={{ marginTop: 24 }}>Assignations Carnet-Élève ({templateAssignments.length})</h3>
                <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd' }}>
                            <th style={{ textAlign: 'left', padding: 8 }}>Template</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Élève</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Statut</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                            <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {templateAssignments.map(a => (
                            <tr key={a._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: 8 }}>{a.templateId}</td>
                                <td style={{ padding: 8 }}>{a.studentId}</td>
                                <td style={{ padding: 8 }}>
                                    <span className="pill" style={{
                                        background: a.status === 'signed' ? '#e1bee7' : a.status === 'completed' ? '#c8e6c9' : a.status === 'in_progress' ? '#bbdefb' : '#e0e0e0'
                                    }}>
                                        {a.status}
                                    </span>
                                </td>
                                <td style={{ padding: 8 }}>{new Date(a.assignedAt).toLocaleDateString()}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>
                                    <button className="btn secondary" style={{ fontSize: 12 }} onClick={() => deleteTemplateAssignment(a._id)}>Supprimer</button>
                                </td>
                            </tr>
                        ))}
                        {templateAssignments.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center' }} className="note">Aucune assignation</td></tr>
                        )}
                    </tbody>
                </table>

                {/* SubAdmin Assignments */}
                <h3 style={{ marginTop: 24 }}>Assignations Sous-Admin-Enseignant ({subAdminAssignments.length})</h3>
                <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ddd' }}>
                            <th style={{ textAlign: 'left', padding: 8 }}>Sous-Admin</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Enseignant</th>
                            <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                            <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subAdminAssignments.map(a => (
                            <tr key={a._id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: 8 }}>{a.subAdminId}</td>
                                <td style={{ padding: 8 }}>{a.teacherId}</td>
                                <td style={{ padding: 8 }}>{new Date(a.assignedAt).toLocaleDateString()}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>
                                    <button className="btn secondary" style={{ fontSize: 12 }} onClick={() => deleteSubAdminAssignment(a._id)}>Supprimer</button>
                                </td>
                            </tr>
                        ))}
                        {subAdminAssignments.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center' }} className="note">Aucune assignation</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
