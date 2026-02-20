import { useEffect, useState, useMemo } from 'react'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import './SubAdminMyTeachers.css'

type TeacherClass = {
    classId: string
    className: string
    level: string
    isProfPolyvalent: boolean
    languages: string[]
}

type TeacherInfo = {
    teacherId: string
    displayName: string
    email: string
    classes: TeacherClass[]
}

export default function SubAdminMyTeachers() {
    const [teachers, setTeachers] = useState<TeacherInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const { activeYearId, isLoading: yearLoading } = useSchoolYear()

    useEffect(() => {
        const loadData = async () => {
            if (yearLoading) return

            if (!activeYearId) {
                setLoading(false)
                return
            }
            try {
                setLoading(true)
                const res = await api.get(`/subadmin-assignments/my-teachers?schoolYearId=${activeYearId}`)
                setTeachers(res.data)
            } catch (e: any) {
                setError('Impossible de charger les enseignants')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [activeYearId, yearLoading])

    const filteredTeachers = useMemo(() => {
        if (!searchTerm) return teachers
        const lowerSearch = searchTerm.toLowerCase()
        return teachers.filter(t => 
            t.displayName.toLowerCase().includes(lowerSearch) || 
            t.email.toLowerCase().includes(lowerSearch) ||
            t.classes.some(c => c.className.toLowerCase().includes(lowerSearch) || c.level.toLowerCase().includes(lowerSearch))
        )
    }, [teachers, searchTerm])

    const getTeacherRoles = (classes: TeacherClass[]) => {
        const roles = new Set<string>()
        classes.forEach(c => {
            if (c.isProfPolyvalent) roles.add('Polyvalent')
            if (c.languages && c.languages.length > 0) {
                c.languages.forEach(l => {
                    const lowerL = l.toLowerCase()
                    if (lowerL === 'ar' || lowerL === 'lb' || lowerL.includes('arabe') || lowerL.includes('arabic')) roles.add('Arabe')
                    else if (lowerL === 'en' || lowerL === 'uk' || lowerL === 'gb' || lowerL.includes('anglais') || lowerL.includes('english')) roles.add('Anglais')
                    else if (lowerL === 'fr' || lowerL.includes('français') || lowerL.includes('french')) roles.add('Polyvalent')
                    else roles.add(l)
                })
            } else if (!c.isProfPolyvalent) {
                // If not polyvalent and no languages, maybe just "Autre" or we don't add anything
            }
        })
        return Array.from(roles)
    }

    return (
        <div className="my-teachers-container">
            <div className="my-teachers-header">
                <div className="header-content">
                    <h1 className="page-title">Mes Enseignants</h1>
                    <p className="page-subtitle">Consultez la liste des enseignants assignés à vos niveaux</p>
                </div>
                <div className="header-actions">
                    <div className="search-box">
                        <span className="search-icon">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Rechercher un enseignant, une classe..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>
            </div>

            {loading && (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Chargement des enseignants...</p>
                </div>
            )}

            {error && (
                <div className="error-state">
                    <span className="error-icon">⚠️</span>
                    <p>{error}</p>
                </div>
            )}

            {!loading && !error && filteredTeachers.length === 0 && (
                <div className="empty-state">
                    <span className="empty-icon">👥</span>
                    <h3>Aucun enseignant trouvé</h3>
                    <p>Aucun enseignant ne correspond à votre recherche ou n'est assigné à vos niveaux.</p>
                </div>
            )}

            {!loading && !error && filteredTeachers.length > 0 && (
                <div className="teachers-grid">
                    {filteredTeachers.map(teacher => {
                        const roles = getTeacherRoles(teacher.classes)
                        return (
                            <div key={teacher.teacherId} className="teacher-card">
                                <div className="teacher-card-header">
                                    <div className="teacher-avatar">
                                        {teacher.displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="teacher-info">
                                        <h3 className="teacher-name">{teacher.displayName}</h3>
                                        <p className="teacher-email">{teacher.email}</p>
                                    </div>
                                </div>
                                
                                <div className="teacher-roles">
                                    {roles.length > 0 ? roles.map((role, idx) => (
                                        <span key={idx} className={`role-badge role-${role.toLowerCase()}`}>
                                            {role}
                                        </span>
                                    )) : (
                                        <span className="role-badge role-unknown">Non spécifié</span>
                                    )}
                                </div>

                                <div className="teacher-classes">
                                    <h4 className="classes-title">Classes assignées ({teacher.classes.length})</h4>
                                    <div className="classes-list">
                                        {teacher.classes.map((cls, idx) => (
                                            <div key={idx} className="class-item">
                                                <span className="class-name">{cls.className}</span>
                                                <span className="class-level">{cls.level}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
