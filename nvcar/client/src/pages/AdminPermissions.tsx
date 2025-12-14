import { useEffect, useState, useMemo } from 'react'
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


export default function AdminPermissions() {
    const [subadmins, setSubadmins] = useState<SubAdmin[]>([])
    const [loading, setLoading] = useState(true)

    // Options for dropdowns
    const [levels, setLevels] = useState<any[]>([])
    const [classes, setClasses] = useState<any[]>([])
    const [students, setStudents] = useState<any[]>([])

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

    const loadOptions = async () => {
        try {
            const [resLevels, resYears] = await Promise.all([
                api.get('/levels'),
                api.get('/school-years')
            ])
            setLevels(resLevels.data)
            
            const activeYear = resYears.data.find((y: any) => y.active)
            if (activeYear) {
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
    }, [])

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

    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
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
        </div>
    )
}

