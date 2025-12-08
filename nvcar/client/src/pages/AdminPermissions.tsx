import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type BypassScope = {
    type: 'ALL' | 'LEVEL' | 'CLASS' | 'STUDENT'
    value?: string
}

type SubAdmin = {
    _id: string
    displayName: string
    email: string
    bypassScopes: BypassScope[]
}

// Helper component for each SubAdmin card to manage its own form state
const SubAdminCard = ({ 
    user, 
    levels, 
    classes, 
    students, 
    onAddScope, 
    onRemoveScope 
}: { 
    user: SubAdmin, 
    levels: any[], 
    classes: any[], 
    students: any[], 
    onAddScope: (userId: string, scope: BypassScope) => void,
    onRemoveScope: (userId: string, index: number) => void
}) => {
    const [selectedLevel, setSelectedLevel] = useState<string>('')
    const [selectedClass, setSelectedClass] = useState<string>('')
    const [selectedStudent, setSelectedStudent] = useState<string>('')

    // Reset downstream selections when upstream changes
    useEffect(() => { setSelectedClass(''); setSelectedStudent('') }, [selectedLevel])
    useEffect(() => { setSelectedStudent('') }, [selectedClass])

    // Filter options
    const filteredClasses = useMemo(() => {
        if (!selectedLevel) return []
        return classes.filter(c => c.level === selectedLevel)
    }, [classes, selectedLevel])

    const filteredStudents = useMemo(() => {
        if (!selectedClass) return []
        return students.filter(s => s.classId === selectedClass)
    }, [students, selectedClass])

    const handleAdd = () => {
        if (selectedStudent) {
            onAddScope(user._id, { type: 'STUDENT', value: selectedStudent })
        } else if (selectedClass) {
            onAddScope(user._id, { type: 'CLASS', value: selectedClass })
        } else if (selectedLevel) {
            onAddScope(user._id, { type: 'LEVEL', value: selectedLevel })
        }
        // Reset after add
        setSelectedLevel('')
    }

    const handleAddGlobal = () => {
        onAddScope(user._id, { type: 'ALL' })
    }

    const getButtonText = () => {
        if (selectedStudent) return "Autoriser cet Élève"
        if (selectedClass) return "Autoriser cette Classe"
        if (selectedLevel) return "Autoriser ce Niveau"
        return "Sélectionner..."
    }

    const getScopeLabel = (scope: BypassScope) => {
        if (scope.type === 'ALL') return 'TOUT (Global)'
        if (scope.type === 'LEVEL') return `Niveau: ${scope.value}`
        if (scope.type === 'CLASS') {
            const c = classes.find(c => c._id === scope.value)
            return `Classe: ${c ? c.name : scope.value}`
        }
        if (scope.type === 'STUDENT') {
            const s = students.find(s => s._id === scope.value)
            return `Élève: ${s ? `${s.firstName} ${s.lastName}` : scope.value}`
        }
        return `${scope.type}: ${scope.value}`
    }

    return (
        <div className="card" style={{ padding: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{user.displayName}</h3>
                    <div style={{ color: '#64748b', fontSize: 14 }}>{user.email}</div>
                </div>
                <button 
                    onClick={handleAddGlobal}
                    disabled={user.bypassScopes?.some(s => s.type === 'ALL')}
                    className="btn"
                    style={{ 
                        background: user.bypassScopes?.some(s => s.type === 'ALL') ? '#e2e8f0' : '#3b82f6',
                        color: user.bypassScopes?.some(s => s.type === 'ALL') ? '#94a3b8' : 'white',
                        fontSize: 13,
                        padding: '6px 12px'
                    }}
                >
                    {user.bypassScopes?.some(s => s.type === 'ALL') ? 'Accès Global Actif' : '+ Accès Global'}
                </button>
            </div>

            {/* Active Permissions List */}
            <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>Permissions Actives</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(!user.bypassScopes || user.bypassScopes.length === 0) && (
                        <span style={{ fontSize: 14, color: '#cbd5e1', fontStyle: 'italic' }}>Aucune permission spécifique.</span>
                    )}
                    {user.bypassScopes?.map((scope, idx) => (
                        <div key={idx} style={{ 
                            background: '#eff6ff', 
                            border: '1px solid #bfdbfe', 
                            padding: '6px 12px', 
                            borderRadius: 20,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: '#1e40af'
                        }}>
                            <span style={{ fontWeight: 500 }}>{getScopeLabel(scope)}</span>
                            <button 
                                onClick={() => onRemoveScope(user._id, idx)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'flex', alignItems: 'center' }}
                                title="Supprimer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add New Permission Form */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#475569' }}>Ajouter une permission spécifique</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' }}>
                    {/* Level Select */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>1. Niveau</label>
                        <select 
                            value={selectedLevel} 
                            onChange={e => setSelectedLevel(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, width: '100%' }}
                        >
                            <option value="">-- Choisir --</option>
                            {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                        </select>
                    </div>

                    {/* Class Select */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>2. Classe (Optionnel)</label>
                        <select 
                            value={selectedClass} 
                            onChange={e => setSelectedClass(e.target.value)}
                            disabled={!selectedLevel}
                            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', opacity: !selectedLevel ? 0.5 : 1 }}
                        >
                            <option value="">-- Tout le niveau --</option>
                            {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* Student Select */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>3. Élève (Optionnel)</label>
                        <select 
                            value={selectedStudent} 
                            onChange={e => setSelectedStudent(e.target.value)}
                            disabled={!selectedClass}
                            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', opacity: !selectedClass ? 0.5 : 1 }}
                        >
                            <option value="">-- Toute la classe --</option>
                            {filteredStudents.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
                        </select>
                    </div>

                    {/* Add Button */}
                    <button 
                        className="btn" 
                        onClick={handleAdd}
                        disabled={!selectedLevel}
                        style={{ 
                            height: 38, 
                            background: !selectedLevel ? '#cbd5e1' : '#10b981',
                            cursor: !selectedLevel ? 'not-allowed' : 'pointer',
                            color: 'white',
                            fontWeight: 500
                        }}
                    >
                        {getButtonText()}
                    </button>
                </div>
            </div>
        </div>
    )
}

const NavPermissionSection = ({ role, label, items, permissions, onToggle }: any) => {
    return (
        <div className="card" style={{ padding: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{label} - Menu Navigation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {items.map((item: any) => {
                    const isEnabled = permissions[role]?.[item.key] !== false // Default true
                    return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                onChange={() => onToggle(role, item.key)}
                                id={`perm-${role}-${item.key}`}
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            <label htmlFor={`perm-${role}-${item.key}`} style={{ cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                                {item.label}
                            </label>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const StudentPromotions = ({ levels, classes, students, activeSchoolYearId, onRefresh }: { levels: any[], classes: any[], students: any[], activeSchoolYearId: string, onRefresh: () => void }) => {
    const [selectedLevel, setSelectedLevel] = useState('')
    const [selectedClass, setSelectedClass] = useState('')
    const [promoting, setPromoting] = useState<string | null>(null)
    
    const filteredClasses = useMemo(() => {
        if (!selectedLevel) return []
        return classes.filter(c => c.level === selectedLevel)
    }, [classes, selectedLevel])

    const filteredStudents = useMemo(() => {
        if (!selectedClass) return []
        return students.filter(s => s.classId === selectedClass)
    }, [students, selectedClass])

    const handlePromote = async (studentId: string, currentLevel: string) => {
        if (!confirm("Confirmer le passage de cet élève au niveau supérieur ?")) return
        setPromoting(studentId)
        try {
            await api.post(`/students/${studentId}/promote`, {})
            alert("Élève promu avec succès")
            onRefresh()
        } catch (e: any) {
            alert("Erreur: " + (e.response?.data?.message || e.message))
        } finally {
            setPromoting(null)
        }
    }

    return (
        <div className="card" style={{ padding: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'center' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Niveau</label>
                    <select 
                        value={selectedLevel} 
                        onChange={e => { setSelectedLevel(e.target.value); setSelectedClass('') }}
                        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                        <option value="">-- Choisir --</option>
                        {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                    </select>
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Classe</label>
                    <select 
                        value={selectedClass} 
                        onChange={e => setSelectedClass(e.target.value)} 
                        disabled={!selectedLevel}
                        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', opacity: !selectedLevel ? 0.5 : 1 }}
                    >
                        <option value="">-- Choisir --</option>
                        {filteredClasses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                 </div>
            </div>

            {selectedClass && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee', color: '#64748b', fontSize: 13 }}>
                            <th style={{ padding: 10 }}>Élève</th>
                            <th style={{ padding: 10 }}>Niveau Actuel</th>
                            <th style={{ padding: 10 }}>Statut</th>
                            <th style={{ padding: 10 }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.map(s => {
                            const isPromoted = s.promotions?.some((p: any) => p.schoolYearId === activeSchoolYearId)
                            return (
                                <tr key={s._id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                    <td style={{ padding: 10 }}>{s.firstName} {s.lastName}</td>
                                    <td style={{ padding: 10 }}>{s.level}</td>
                                    <td style={{ padding: 10 }}>
                                        {isPromoted ? (
                                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>Promu</span>
                                        ) : (
                                            <span style={{ color: '#64748b', fontSize: 12 }}>En cours</span>
                                        )}
                                    </td>
                                    <td style={{ padding: 10 }}>
                                        {!isPromoted && (
                                            <button 
                                                className="btn" 
                                                onClick={() => handlePromote(s._id, s.level)}
                                                disabled={promoting === s._id}
                                                style={{ padding: '4px 12px', fontSize: 12, height: 'auto' }}
                                            >
                                                {promoting === s._id ? '...' : 'Promouvoir'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredStudents.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun élève dans cette classe.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export default function AdminPermissions() {
    const [subadmins, setSubadmins] = useState<SubAdmin[]>([])
    const [loading, setLoading] = useState(true)
    const [navPermissions, setNavPermissions] = useState<any>({})

    // Options for dropdowns
    const [levels, setLevels] = useState<any[]>([])
    const [classes, setClasses] = useState<any[]>([])
    const [students, setStudents] = useState<any[]>([])
    const [activeSchoolYearId, setActiveSchoolYearId] = useState('')

    const loadData = async () => {
        try {
            setLoading(true)
            const res = await api.get('/admin-extras/subadmins')
            setSubadmins(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const loadSettings = async () => {
        try {
            const res = await api.get('/settings/public')
            setNavPermissions(res.data.nav_permissions || {})
        } catch (e) {
            console.error(e)
        }
    }

    const loadOptions = async () => {
        try {
            const [resLevels, resYears] = await Promise.all([
                api.get('/levels'),
                api.get('/school-years')
            ])
            setLevels(resLevels.data)
            
            const activeYear = resYears.data.find((y: any) => y.active)
            if (activeYear) {
                setActiveSchoolYearId(activeYear._id)
                const [resClasses, resStudents] = await Promise.all([
                    api.get(`/classes?schoolYearId=${activeYear._id}`),
                    api.get(`/students?schoolYearId=${activeYear._id}`)
                ])
                setClasses(resClasses.data)
                setStudents(resStudents.data)
            }
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => {
        loadData()
        loadOptions()
        loadSettings()
    }, [])

    const toggleNavPermission = async (role: string, key: string) => {
        const newPermissions = { ...navPermissions }
        if (!newPermissions[role]) newPermissions[role] = {}
        
        // Toggle
        const current = newPermissions[role][key] !== false
        newPermissions[role][key] = !current
        
        setNavPermissions(newPermissions)
        
        try {
            await api.post('/settings', {
                key: 'nav_permissions',
                value: newPermissions
            })
        } catch (e) {
            console.error("Error saving permissions", e)
            alert("Erreur lors de la sauvegarde des permissions")
        }
    }

    const addScope = async (userId: string, scope: BypassScope) => {
        const user = subadmins.find(u => u._id === userId)
        if (!user) return

        const updatedScopes = [...(user.bypassScopes || []), scope]
        
        try {
            await api.post('/admin-extras/permissions', { userId, bypassScopes: updatedScopes })
            setSubadmins(prev => prev.map(u => u._id === userId ? { ...u, bypassScopes: updatedScopes } : u))
        } catch (e) {
            alert('Erreur lors de la mise à jour')
        }
    }

    const removeScope = async (userId: string, index: number) => {
        const user = subadmins.find(u => u._id === userId)
        if (!user) return

        const updatedScopes = [...(user.bypassScopes || [])]
        updatedScopes.splice(index, 1)

        try {
            await api.post('/admin-extras/permissions', { userId, bypassScopes: updatedScopes })
            setSubadmins(prev => prev.map(u => u._id === userId ? { ...u, bypassScopes: updatedScopes } : u))
        } catch (e) {
            alert('Erreur lors de la mise à jour')
        }
    }

    const teacherItems = [
        { key: 'classes', label: 'Mes Classes' }
    ]

    const subAdminItems = [
        { key: 'dashboard', label: 'Tableau de bord' },
        { key: 'progress', label: 'Progression' },
        { key: 'teacher-progress', label: 'Suivi Enseignants' },
        { key: 'gradebooks', label: 'Carnet' },
        { key: 'eleves', label: 'Élèves' },
        { key: 'signature', label: 'Ma signature' }
    ]

    const aefeItems = [
        { key: 'dashboard', label: 'Tableau de bord' },
        { key: 'progress', label: 'Progression' },
        { key: 'teacher-progress', label: 'Suivi Enseignants' },
        { key: 'gradebooks', label: 'Carnet' }
    ]

    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: 32 }}>
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8 }}>Permissions & Navigation</h2>
                <p className="note" style={{ fontSize: 16, color: '#64748b' }}>
                    Gérez les permissions globales et les accès spécifiques.
                </p>
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    <Link to="/admin/all-gradebooks" className="btn primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        Voir tous les carnets (Admin)
                    </Link>
                    <Link to="/admin/signatures" className="btn secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        Signatures
                    </Link>
                </div>
            </div>

            {/* Nav Permissions Section */}
            <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 20, marginBottom: 16, color: '#475569' }}>Visibilité Menu Navigation</h2>
                <NavPermissionSection 
                    role="TEACHER" 
                    label="Enseignants" 
                    items={teacherItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
                <NavPermissionSection 
                    role="SUBADMIN" 
                    label="Préfets" 
                    items={subAdminItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
                <NavPermissionSection 
                    role="AEFE" 
                    label="RPP ET DIRECTION" 
                    items={aefeItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
            </div>

            <div style={{ marginBottom: 32 }}>
                <h2 className="title" style={{ fontSize: 20, marginBottom: 8 }}>Permissions Préfets (Signatures)</h2>
                <p className="note" style={{ fontSize: 16, color: '#64748b' }}>
                    Configurez les exceptions aux règles de signature pour les préfets.
                    <br/>
                    Vous pouvez accorder des permissions globales, par niveau, par classe ou par élève.
                </p>
            </div>

            {loading ? <p>Chargement...</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {subadmins.map(u => (
                        <SubAdminCard 
                            key={u._id} 
                            user={u} 
                            levels={levels} 
                            classes={classes} 
                            students={students}
                            onAddScope={addScope}
                            onRemoveScope={removeScope}
                        />
                    ))}
                    {subadmins.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, background: '#f8fafc', borderRadius: 12, color: '#64748b' }}>
                            Aucun Préfet trouvé.
                        </div>
                    )}
                </div>
            )}

            {/* Student Promotions Section */}
            <div style={{ marginTop: 40, marginBottom: 32 }}>
                <h2 className="title" style={{ fontSize: 20, marginBottom: 8 }}>Passage des Élèves (Admin)</h2>
                <p className="note" style={{ fontSize: 16, color: '#64748b' }}>
                    Promouvoir les élèves au niveau supérieur sans restriction de signature.
                </p>
            </div>

            <StudentPromotions 
                levels={levels} 
                classes={classes} 
                students={students} 
                activeSchoolYearId={activeSchoolYearId}
                onRefresh={loadOptions}
            />

        </div>
    )
}

