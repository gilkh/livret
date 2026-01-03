import { useEffect, useState, useMemo, useCallback } from 'react'
import {
    Shield,
    Globe,
    Building,
    GraduationCap,
    User,
    X,
    Plus,
    Info,
    Check,
    AlertTriangle,
    Loader2,
    Users
} from 'lucide-react'
import api from '../api'
import './AdminPermissions.css'

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

type ClassInfo = {
    _id: string
    name: string
    level: string
}

type StudentInfo = {
    _id: string
    firstName: string
    lastName: string
    classId: string
}

type LevelInfo = {
    _id: string
    name: string
}

// Toast component
const Toast = ({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000)
        return () => clearTimeout(timer)
    }, [onClose])

    return (
        <div className={`permissions-toast ${type}`}>
            {type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
            <span>{message}</span>
        </div>
    )
}

// Permission badge component
const PermissionBadge = ({
    scope,
    label,
    onRemove
}: {
    scope: BypassScope;
    label: string;
    onRemove: () => void
}) => {
    const icons: Record<string, JSX.Element> = {
        ALL: <Globe size={12} />,
        LEVEL: <GraduationCap size={12} />,
        CLASS: <Building size={12} />,
        STUDENT: <User size={12} />
    }

    return (
        <div className={`permission-badge type-${scope.type}`}>
            <span className="permission-badge-icon">{icons[scope.type]}</span>
            <span>{label}</span>
            <button
                className="permission-badge-remove"
                onClick={onRemove}
                title="Supprimer cette permission"
            >
                <X size={12} />
            </button>
        </div>
    )
}

// Subadmin card component
const SubAdminCard = ({
    user,
    levels,
    classes,
    students,
    onAddScope,
    onRemoveScope
}: {
    user: SubAdmin
    levels: LevelInfo[]
    classes: ClassInfo[]
    students: StudentInfo[]
    onAddScope: (userId: string, scope: BypassScope) => Promise<boolean>
    onRemoveScope: (userId: string, index: number) => Promise<boolean>
}) => {
    const [selectedLevel, setSelectedLevel] = useState<string>('')
    const [selectedClass, setSelectedClass] = useState<string>('')
    const [selectedStudent, setSelectedStudent] = useState<string>('')
    const [isAdding, setIsAdding] = useState(false)

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

    const handleAdd = async () => {
        setIsAdding(true)
        let scope: BypassScope | null = null

        if (selectedStudent) {
            scope = { type: 'STUDENT', value: selectedStudent }
        } else if (selectedClass) {
            scope = { type: 'CLASS', value: selectedClass }
        } else if (selectedLevel) {
            scope = { type: 'LEVEL', value: selectedLevel }
        }

        if (scope) {
            const success = await onAddScope(user._id, scope)
            if (success) {
                setSelectedLevel('')
                setSelectedClass('')
                setSelectedStudent('')
            }
        }
        setIsAdding(false)
    }

    const handleAddGlobal = async () => {
        setIsAdding(true)
        await onAddScope(user._id, { type: 'ALL' })
        setIsAdding(false)
    }

    const getButtonText = () => {
        if (selectedStudent) {
            const s = students.find(st => st._id === selectedStudent)
            return s ? `Autoriser ${s.firstName} ${s.lastName}` : "Autoriser l'élève"
        }
        if (selectedClass) {
            const c = classes.find(cl => cl._id === selectedClass)
            return c ? `Autoriser ${c.name}` : "Autoriser la classe"
        }
        if (selectedLevel) return `Autoriser tout ${selectedLevel}`
        return "Sélectionnez d'abord..."
    }

    const getScopeLabel = (scope: BypassScope) => {
        if (scope.type === 'ALL') return 'Accès Global'
        if (scope.type === 'LEVEL') return `Niveau ${scope.value}`
        if (scope.type === 'CLASS') {
            const c = classes.find(cl => cl._id === scope.value)
            return c ? c.name : `Classe ${scope.value?.slice(-6)}`
        }
        if (scope.type === 'STUDENT') {
            const s = students.find(st => st._id === scope.value)
            return s ? `${s.firstName} ${s.lastName}` : `Élève ${scope.value?.slice(-6)}`
        }
        return `${scope.type}: ${scope.value}`
    }

    const hasGlobalAccess = user.bypassScopes?.some(s => s.type === 'ALL')
    const initials = (user.displayName || user.email || '??')
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()

    return (
        <div className="subadmin-card">
            {/* Header */}
            <div className="subadmin-card-header">
                <div className="subadmin-info">
                    <div className="subadmin-avatar">{initials}</div>
                    <div className="subadmin-details">
                        <h3>{user.displayName || 'Sans nom'}</h3>
                        <span>{user.email}</span>
                    </div>
                </div>
                <button
                    className={`global-access-btn ${hasGlobalAccess ? 'active' : 'inactive'}`}
                    onClick={handleAddGlobal}
                    disabled={hasGlobalAccess || isAdding}
                >
                    {hasGlobalAccess ? (
                        <>
                            <Check size={16} />
                            Accès Global Actif
                        </>
                    ) : (
                        <>
                            <Globe size={16} />
                            Accorder Accès Global
                        </>
                    )}
                </button>
            </div>

            {/* Body */}
            <div className="subadmin-card-body">
                {/* Active Permissions */}
                <div className="active-permissions">
                    <p className="section-label">
                        <Shield size={14} />
                        Permissions Actives
                        <span className="count">{user.bypassScopes?.length || 0}</span>
                    </p>

                    {(!user.bypassScopes || user.bypassScopes.length === 0) ? (
                        <p className="permissions-empty-state">
                            Aucune permission spéciale — ce préfet ne peut signer que les carnets dont l'enseignant a marqué "terminé"
                        </p>
                    ) : (
                        <div className="permissions-list">
                            {user.bypassScopes.map((scope, idx) => (
                                <PermissionBadge
                                    key={`${scope.type}-${scope.value || idx}`}
                                    scope={scope}
                                    label={getScopeLabel(scope)}
                                    onRemove={() => onRemoveScope(user._id, idx)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Add Permission Form */}
                <div className="add-permission-form">
                    <p className="add-permission-form-title">
                        <Plus size={16} />
                        Ajouter une exception (bypass)
                    </p>

                    <div className="form-row">
                        <div className="form-field">
                            <label>
                                <span className="step">1</span>
                                Niveau
                            </label>
                            <select
                                value={selectedLevel}
                                onChange={e => setSelectedLevel(e.target.value)}
                                disabled={isAdding}
                            >
                                <option value="">-- Sélectionner --</option>
                                {levels.map(l => (
                                    <option key={l._id} value={l.name}>{l.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-field">
                            <label>
                                <span className="step">2</span>
                                Classe (optionnel)
                            </label>
                            <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                disabled={!selectedLevel || isAdding}
                            >
                                <option value="">-- Tout le niveau --</option>
                                {filteredClasses.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-field">
                            <label>
                                <span className="step">3</span>
                                Élève (optionnel)
                            </label>
                            <select
                                value={selectedStudent}
                                onChange={e => setSelectedStudent(e.target.value)}
                                disabled={!selectedClass || isAdding}
                            >
                                <option value="">-- Toute la classe --</option>
                                {filteredStudents.map(s => (
                                    <option key={s._id} value={s._id}>
                                        {s.firstName} {s.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            className={`add-permission-btn ${selectedLevel ? 'enabled' : 'disabled'}`}
                            onClick={handleAdd}
                            disabled={!selectedLevel || isAdding}
                        >
                            {isAdding ? (
                                <Loader2 size={16} className="spinner" />
                            ) : (
                                <>
                                    <Plus size={16} />
                                    {getButtonText()}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}


export default function AdminPermissions() {
    const [subadmins, setSubadmins] = useState<SubAdmin[]>([])
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    // Options for dropdowns
    const [levels, setLevels] = useState<LevelInfo[]>([])
    const [classes, setClasses] = useState<ClassInfo[]>([])
    const [students, setStudents] = useState<StudentInfo[]>([])

    const loadData = async () => {
        try {
            setLoading(true)
            const res = await api.get('/admin-extras/subadmins')
            setSubadmins(res.data)
        } catch (e) {
            console.error(e)
            setToast({ message: 'Erreur lors du chargement des préfets', type: 'error' })
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

    const addScope = useCallback(async (userId: string, scope: BypassScope): Promise<boolean> => {
        const user = subadmins.find(u => u._id === userId)
        if (!user) return false

        // Check for duplicates
        const isDuplicate = user.bypassScopes?.some(s =>
            s.type === scope.type && s.value === scope.value
        )
        if (isDuplicate) {
            setToast({ message: 'Cette permission existe déjà', type: 'error' })
            return false
        }

        const updatedScopes = [...(user.bypassScopes || []), scope]

        try {
            await api.post('/admin-extras/permissions', { userId, bypassScopes: updatedScopes })
            setSubadmins(prev => prev.map(u => u._id === userId ? { ...u, bypassScopes: updatedScopes } : u))

            const typeLabels: Record<string, string> = {
                ALL: 'Accès global',
                LEVEL: 'Niveau',
                CLASS: 'Classe',
                STUDENT: 'Élève'
            }
            setToast({ message: `${typeLabels[scope.type]} ajouté avec succès`, type: 'success' })
            return true
        } catch (e) {
            setToast({ message: 'Erreur lors de la mise à jour', type: 'error' })
            return false
        }
    }, [subadmins])

    const removeScope = useCallback(async (userId: string, index: number): Promise<boolean> => {
        const user = subadmins.find(u => u._id === userId)
        if (!user) return false

        const removedScope = user.bypassScopes?.[index]
        const updatedScopes = [...(user.bypassScopes || [])]
        updatedScopes.splice(index, 1)

        try {
            await api.post('/admin-extras/permissions', { userId, bypassScopes: updatedScopes })
            setSubadmins(prev => prev.map(u => u._id === userId ? { ...u, bypassScopes: updatedScopes } : u))

            const typeLabels: Record<string, string> = {
                ALL: 'Accès global',
                LEVEL: 'Niveau',
                CLASS: 'Classe',
                STUDENT: 'Élève'
            }
            setToast({ message: `${typeLabels[removedScope?.type || 'ALL']} supprimé`, type: 'success' })
            return true
        } catch (e) {
            setToast({ message: 'Erreur lors de la suppression', type: 'error' })
            return false
        }
    }, [subadmins])

    return (
        <div className="admin-permissions">
            {/* Header */}
            <header className="permissions-header">
                <div className="permissions-header-content">
                    <h1 className="permissions-title">
                        <Shield size={28} />
                        Permissions de Signature
                    </h1>
                    <p className="permissions-subtitle">
                        Configurez les exceptions aux règles de signature pour les préfets. Ces permissions permettent de signer des carnets même si l'enseignant n'a pas encore marqué son travail comme terminé.
                    </p>
                </div>
            </header>

            {/* Info Banner */}
            <div className="permissions-info-banner">
                <div className="permissions-info-banner-icon">
                    <Info size={20} />
                </div>
                <div className="permissions-info-banner-content">
                    <h3>Comment ça fonctionne ?</h3>
                    <p>
                        Par défaut, un préfet ne peut signer un carnet que si <strong>tous les enseignants concernés</strong> ont marqué leur partie comme "terminée".
                        Ces permissions créent des <strong>exceptions (bypass)</strong> à cette règle.
                    </p>
                    <ul>
                        <li><strong>Accès Global :</strong> Peut signer n'importe quel carnet sans restriction</li>
                        <li><strong>Par Niveau :</strong> Peut signer les carnets du niveau spécifié (ex: tous les GS)</li>
                        <li><strong>Par Classe :</strong> Peut signer les carnets d'une classe spécifique</li>
                        <li><strong>Par Élève :</strong> Peut signer le carnet d'un élève spécifique</li>
                    </ul>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="permissions-loading">
                    <div className="permissions-spinner" />
                    <span>Chargement des préfets...</span>
                </div>
            ) : subadmins.length === 0 ? (
                <div className="permissions-empty">
                    <div className="permissions-empty-icon">
                        <Users size={32} />
                    </div>
                    <h3>Aucun préfet trouvé</h3>
                    <p>
                        Il n'y a pas encore de sous-administrateurs (préfets) dans le système.
                        Ajoutez-en depuis la page Utilisateurs.
                    </p>
                </div>
            ) : (
                <div className="permissions-grid">
                    {subadmins.map(user => (
                        <SubAdminCard
                            key={user._id}
                            user={user}
                            levels={levels}
                            classes={classes}
                            students={students}
                            onAddScope={addScope}
                            onRemoveScope={removeScope}
                        />
                    ))}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    )
}
