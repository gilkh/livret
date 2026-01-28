import { useEffect, useState, useMemo } from 'react'
import api, { impersonationApi } from '../api'
import Modal from '../components/Modal'
import Toast, { ToastType } from '../components/Toast'
import {
  Mail,
  Trash2,
  Key,
  LogIn,
  Calendar,
  Shield,
  Plus,
  Users as UsersIcon,
  Copy,
  Check,
  UserPlus,
  RotateCcw,
  Archive,
  UserX,
  Sparkles,
  Filter,
  RefreshCw,
  X,
  GraduationCap,
  Languages
} from 'lucide-react'
import SearchableSelect from '../components/SearchableSelect'
import './Users.css'

type User = {
  _id: string;
  email: string;
  role: 'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE';
  displayName: string;
  status?: 'active' | 'inactive' | 'deleted';
  deletedAt?: string;
  authProvider?: 'local' | 'microsoft';
  isOutlook?: boolean;
}
type OutlookUser = { _id: string; email: string; role: 'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE'; displayName?: string; lastLogin?: string }
type TeacherClassAssignment = {
  _id: string;
  teacherId: string;
  classId: string;
  className?: string;
  languages?: string[];
  isProfPolyvalent?: boolean;
}
type SubAdminLevelAssignment = {
  subAdminId: string;
  levels: string[];
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Helper component for Local User Card
const UserCard = ({
  user,
  roleStyle,
  onUpdateName,
  onDelete,
  onResetPassword,
  onImpersonate,
  impersonatingId,
  assignmentTitle,
  assignmentItems
}: {
  user: User,
  roleStyle: any,
  onUpdateName: (id: string, name: string) => void,
  onDelete: (id: string) => void,
  onResetPassword: (id: string, pass: string) => void,
  onImpersonate: (user: User) => void,
  impersonatingId: string | null,
  assignmentTitle?: string | null,
  assignmentItems?: string[]
}) => {
  const [name, setName] = useState(user.displayName || '')
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Sync local state with prop when prop changes (e.g. after reload)
  useEffect(() => {
    setName(user.displayName || '')
  }, [user.displayName])

  const handleBlur = () => {
    setIsEditing(false)
    if (name !== (user.displayName || '')) {
      onUpdateName(user._id, name)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      setName(user.displayName || '')
      e.currentTarget.blur()
    }
  }

  const handleReset = () => {
    if (!password) return
    onResetPassword(user._id, password)
    setPassword('')
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(user.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="user-card">
      <div className="user-card-top" style={{ background: `linear-gradient(135deg, ${roleStyle.bg}, #ffffff)` }}>
        <div className="user-avatar" style={{ backgroundColor: roleStyle.color }}>
          {getInitials(name || user.email)}
        </div>
        <div className="user-role-badge" style={{ color: roleStyle.color, borderColor: roleStyle.border }}>
          {user.role}
        </div>
      </div>

      <div className="user-card-content">
        <div className="user-identity">
          <input
            className="user-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Cliquez pour ajouter un nom"
            title="Cliquez pour modifier le nom"
            aria-label="Nom d'affichage"
            style={isEditing ? { borderBottomColor: '#8b5cf6' } : undefined}
          />
          <div className="user-email-row" onClick={copyEmail} title="Cliquer pour copier l'email" role="button" tabIndex={0}>
            <Mail size={14} />
            <span className="user-email-text">{user.email}</span>
            {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} className="copy-icon" />}
          </div>
          {assignmentTitle && (
            <div className="user-assignments">
              <span className="assignment-label">{assignmentTitle}</span>
              {assignmentItems && assignmentItems.length > 0 ? (
                <div className="assignment-pills">
                  {assignmentItems.map((item, index) => (
                    <span key={`${item}-${index}`} className="assignment-pill">{item}</span>
                  ))}
                </div>
              ) : (
                <span className="assignment-empty">Non assigné</span>
              )}
            </div>
          )}
        </div>

        <div className="user-actions-area">
          <div className="password-reset-group">
            <Key size={16} className="input-icon" />
            <input
              className="reset-input"
              placeholder="Nouveau mot de passe"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              aria-label="Nouveau mot de passe"
            />
            {password && (
              <button
                className="btn-icon-action primary"
                onClick={handleReset}
                title="Valider le nouveau mot de passe"
                aria-label="Confirmer le changement de mot de passe"
              >
                <Check size={14} />
              </button>
            )}
          </div>

          <div className="card-buttons">
            {user.role !== 'ADMIN' && (
              <button
                className={`btn-action ${impersonatingId === user._id ? 'active' : ''}`}
                onClick={() => onImpersonate(user)}
                disabled={impersonatingId === user._id}
                title="Se connecter en tant que cet utilisateur"
                aria-label="Imiter cet utilisateur"
              >
                <LogIn size={16} />
              </button>
            )}

            <button
              className="btn-action danger"
              onClick={() => onDelete(user._id)}
              title="Désactiver cet utilisateur"
              aria-label="Désactiver l'utilisateur"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper component for Outlook User Card
const OutlookUserCard = ({
  user,
  roleStyle,
  onUpdateName,
  onDelete,
  onUpdateRole,
  onImpersonate,
  impersonatingId,
  assignmentTitle,
  assignmentItems
}: {
  user: OutlookUser,
  roleStyle: any,
  onUpdateName: (id: string, name: string) => void,
  onDelete: (id: string) => void,
  onUpdateRole: (id: string, role: string) => void,
  onImpersonate: (user: OutlookUser) => void,
  impersonatingId: string | null,
  assignmentTitle?: string | null,
  assignmentItems?: string[]
}) => {
  const [name, setName] = useState(user.displayName || '')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    setName(user.displayName || '')
  }, [user.displayName])

  const handleBlur = () => {
    setIsEditing(false)
    if (name !== (user.displayName || '')) {
      onUpdateName(user._id, name)
    }
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(user.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="user-card outlook-card">
      <div className="user-card-top">
        <div className="user-avatar" style={{ backgroundColor: '#0078d4' }}>
          {getInitials(name || user.email)}
        </div>
        <div className="microsoft-badge">
          <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="" style={{ width: 18, height: 18 }} />
        </div>
      </div>

      <div className="user-card-content">
        <div className="user-identity">
          <input
            className="user-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setName(user.displayName || '')
                e.currentTarget.blur()
              }
            }}
            placeholder="Cliquez pour ajouter un nom"
            aria-label="Nom d'affichage"
            style={isEditing ? { borderBottomColor: '#0078d4' } : undefined}
          />
          <div className="user-email-row" onClick={copyEmail} title="Cliquer pour copier l'email" role="button" tabIndex={0}>
            <Mail size={14} />
            <span className="user-email-text">{user.email}</span>
            {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} className="copy-icon" />}
          </div>
          {assignmentTitle && (
            <div className="user-assignments">
              <span className="assignment-label">{assignmentTitle}</span>
              {assignmentItems && assignmentItems.length > 0 ? (
                <div className="assignment-pills">
                  {assignmentItems.map((item, index) => (
                    <span key={`${item}-${index}`} className="assignment-pill">{item}</span>
                  ))}
                </div>
              ) : (
                <span className="assignment-empty">Non assigné</span>
              )}
            </div>
          )}
          {user.lastLogin && (
            <div className="last-login">
              <Calendar size={14} />
              Dernière connexion: {new Date(user.lastLogin).toLocaleDateString('fr-FR')}
            </div>
          )}
        </div>

        <div className="user-actions-area">
          <select
            className="role-select"
            value={user.role}
            onChange={e => onUpdateRole(user._id, e.target.value)}
            style={{ color: roleStyle.color, borderColor: roleStyle.border }}
            aria-label="Changer le rôle"
          >
            <option value="TEACHER">👨‍🏫 Enseignant</option>
            <option value="SUBADMIN">📋 Préfet</option>
            <option value="AEFE">🏛️ RPP et Direction</option>
            <option value="ADMIN">⚡ Admin</option>
          </select>

          <div className="card-buttons">
            {user.role !== 'ADMIN' && (
              <button
                className={`btn-action ${impersonatingId === user._id ? 'active' : ''}`}
                onClick={() => onImpersonate(user)}
                disabled={impersonatingId === user._id}
                title="Se connecter en tant que cet utilisateur"
                aria-label="Imiter cet utilisateur"
              >
                <LogIn size={16} />
              </button>
            )}

            <button
              className="btn-action danger"
              onClick={() => onDelete(user._id)}
              title="Supprimer cet utilisateur"
              aria-label="Supprimer l'utilisateur"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [deletedUsers, setDeletedUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE'>('TEACHER')
  const [displayName, setDisplayName] = useState('')
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherClassAssignment[]>([])
  const [subAdminAssignments, setSubAdminAssignments] = useState<SubAdminLevelAssignment[]>([])

  // Outlook Users state
  const [outlookUsers, setOutlookUsers] = useState<OutlookUser[]>([])
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookRole, setOutlookRole] = useState<'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE'>('TEACHER')
  const [outlookDisplayName, setOutlookDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState<'local' | 'microsoft' | 'deleted'>('local')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterClass, setFilterClass] = useState<string>('')
  const [filterLanguage, setFilterLanguage] = useState<string>('')
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean,
    title: string,
    content: React.ReactNode,
    onConfirm: () => void
  } | null>(null)

  const tripleConfirm = (message: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!confirm(`${message}\n\nConfirmation ${attempt}/3`)) return false
    }
    return true
  }

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
  }

  const parseEmails = (raw: string) => {
    return raw
      .split(';')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0)
  }

  const teacherAssignmentsByTeacher = useMemo(() => {
    return teacherAssignments.reduce<Record<string, TeacherClassAssignment[]>>((acc, assignment) => {
      if (!acc[assignment.teacherId]) acc[assignment.teacherId] = []
      acc[assignment.teacherId].push(assignment)
      return acc
    }, {})
  }, [teacherAssignments])

  const subAdminLevelsByUser = useMemo(() => {
    return subAdminAssignments.reduce<Record<string, string[]>>((acc, assignment) => {
      acc[assignment.subAdminId] = assignment.levels
      return acc
    }, {})
  }, [subAdminAssignments])

  // Compute available classes for filter dropdown
  const availableClasses = useMemo(() => {
    const classSet = new Set<string>()
    teacherAssignments.forEach(a => {
      if (a.className) classSet.add(a.className)
    })
    return Array.from(classSet).sort()
  }, [teacherAssignments])

  // Compute available languages for filter dropdown
  const availableLanguages = useMemo(() => {
    const langSet = new Set<string>()
    teacherAssignments.forEach(a => {
      if (a.isProfPolyvalent) {
        langSet.add('POLY')
      } else if (a.languages && a.languages.length > 0) {
        a.languages.forEach(lang => {
          const normalized = lang.toLowerCase()
          if (normalized.includes('arab')) langSet.add('AR')
          else if (normalized.includes('anglais') || normalized.includes('english')) langSet.add('EN')
          else langSet.add(lang.toUpperCase())
        })
      }
    })
    return Array.from(langSet).sort()
  }, [teacherAssignments])

  const formatLanguage = (lang: string) => {
    const normalized = lang.toLowerCase()
    if (normalized.includes('arab')) return 'AR'
    if (normalized.includes('anglais') || normalized.includes('english')) return 'EN'
    if (normalized.includes('poly')) return 'POLY'
    return lang.toUpperCase()
  }

  const formatLanguageLabel = (lang: string) => {
    if (lang === 'AR') return '🇸🇦 Arabe'
    if (lang === 'EN') return '🇬🇧 Anglais'
    if (lang === 'POLY') return '📚 Polyvalent'
    return lang
  }

  const classOptions = useMemo(
    () => availableClasses.map(cls => ({ value: cls, label: cls })),
    [availableClasses]
  )

  const languageOptions = useMemo(
    () => availableLanguages.map(lang => ({ value: lang, label: formatLanguageLabel(lang) })),
    [availableLanguages]
  )

  const formatTeacherAssignment = (assignment: TeacherClassAssignment) => {
    const classLabel = assignment.className || assignment.classId
    if (assignment.isProfPolyvalent) return `${classLabel} (POLY)`
    if (assignment.languages && assignment.languages.length > 0) {
      return `${classLabel} (${assignment.languages.map(formatLanguage).join(', ')})`
    }
    return `${classLabel} (TOUTES)`
  }

  const getAssignmentInfo = (user: User | OutlookUser) => {
    if (user.role === 'SUBADMIN' || user.role === 'AEFE') {
      return {
        title: 'Niveaux',
        items: subAdminLevelsByUser[user._id] || []
      }
    }
    if (user.role === 'TEACHER') {
      const items = (teacherAssignmentsByTeacher[user._id] || []).map(formatTeacherAssignment)
      return {
        title: 'Classes',
        items
      }
    }
    return null
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return { bg: '#fff0f6', color: '#c41d7f', border: '#ffadd2' }
      case 'SUBADMIN': return { bg: '#e6f7ff', color: '#096dd9', border: '#91d5ff' }
      case 'AEFE': return { bg: '#fff7e6', color: '#d46b08', border: '#ffd591' }
      case 'TEACHER': return { bg: '#f6ffed', color: '#389e0d', border: '#b7eb8f' }
      default: return { bg: '#f5f5f5', color: '#595959', border: '#d9d9d9' }
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Administrateur'
      case 'SUBADMIN': return 'Préfet'
      case 'AEFE': return 'RPP ET DIRECTION'
      case 'TEACHER': return 'Enseignant'
      default: return role
    }
  }

  const renderRoleSection = (role: 'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE', userList: (User | OutlookUser)[], isOutlook: boolean) => {
    const term = searchTerm.trim().toLowerCase()
    const baseUsers = userList.filter(u => u.role === role)

    // Apply text search filter
    let filteredUsers = term
      ? baseUsers.filter(u => {
        const name = (u as User).displayName || (u as OutlookUser).displayName || ''
        return name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
      })
      : baseUsers

    // Apply class filter (only for teachers)
    if (filterClass && role === 'TEACHER') {
      filteredUsers = filteredUsers.filter(u => {
        const assignments = teacherAssignmentsByTeacher[u._id] || []
        return assignments.some(a => a.className === filterClass)
      })
    }

    // Apply language filter (only for teachers)
    if (filterLanguage && role === 'TEACHER') {
      filteredUsers = filteredUsers.filter(u => {
        const assignments = teacherAssignmentsByTeacher[u._id] || []
        return assignments.some(a => {
          if (filterLanguage === 'POLY' && a.isProfPolyvalent) return true
          if (a.languages && a.languages.length > 0) {
            return a.languages.some(lang => {
              const normalized = lang.toLowerCase()
              if (filterLanguage === 'AR' && normalized.includes('arab')) return true
              if (filterLanguage === 'EN' && (normalized.includes('anglais') || normalized.includes('english'))) return true
              return lang.toUpperCase() === filterLanguage
            })
          }
          return false
        })
      })
    }

    if (filteredUsers.length === 0) return null

    const roleStyle = getRoleColor(role)

    return (
      <div className="role-section" key={role}>
        <h4 className="role-header" style={{ borderBottomColor: roleStyle.border }}>
          <span style={{ color: roleStyle.color }} className="role-title">{getRoleLabel(role)}s</span>
          <span className="role-count" style={{ background: roleStyle.bg, color: roleStyle.color }}>
            {filteredUsers.length}
          </span>
        </h4>

        <div className="users-grid">
          {filteredUsers.map(u => (
            isOutlook ? (
              <OutlookUserCard
                key={u._id}
                user={u as OutlookUser}
                roleStyle={roleStyle}
                onUpdateName={updateOutlookUserDisplayName}
                onDelete={deleteOutlookUser}
                onUpdateRole={updateOutlookUserRole}
                onImpersonate={viewAsOutlookUser}
                impersonatingId={impersonating}
                assignmentTitle={getAssignmentInfo(u)?.title}
                assignmentItems={getAssignmentInfo(u)?.items}
              />
            ) : (
              <UserCard
                key={u._id}
                user={u as User}
                roleStyle={roleStyle}
                onUpdateName={updateUserDisplayName}
                onDelete={deleteUser}
                onResetPassword={resetPassword}
                onImpersonate={viewAsUser}
                impersonatingId={impersonating}
                assignmentTitle={getAssignmentInfo(u)?.title}
                assignmentItems={getAssignmentInfo(u)?.items}
              />
            )
          ))}
        </div>
      </div>
    )
  }

  const load = async () => {
    const r = await api.get('/users')
    // `/users` returns a merged list (local + Outlook whitelist). Local tab should show
    // only local-password accounts.
    setUsers(
      r.data
        .filter((u: User) => u.status !== 'deleted')
        .filter((u: User) => !u.isOutlook)
        .filter((u: User) => (u.authProvider || 'local') !== 'microsoft')
    )
  }

  const loadOutlookUsers = async () => {
    try {
      const r = await api.get('/outlook-users')
      setOutlookUsers(r.data)
    } catch (e) {
      console.error('Failed to load Outlook users:', e)
    }
  }

  const loadAssignments = async () => {
    try {
      const [yearsRes, subAdminRes] = await Promise.all([
        api.get('/school-years'),
        api.get('/subadmin-assignments/levels')
      ])
      const activeYear = yearsRes.data.find((year: { _id: string; active?: boolean }) => year.active)
      const teacherRes = await api.get(
        activeYear ? `/teacher-assignments?schoolYearId=${activeYear._id}` : '/teacher-assignments'
      )
      setTeacherAssignments(teacherRes.data)
      setSubAdminAssignments(subAdminRes.data)
    } catch (e) {
      console.error('Failed to load assignments:', e)
    }
  }

  const loadDeletedUsers = async () => {
    try {
      const r = await api.get('/users/deleted')
      setDeletedUsers(r.data)
    } catch (e) {
      console.error('Failed to load deleted users:', e)
    }
  }

  useEffect(() => {
    load()
    loadOutlookUsers()
    loadDeletedUsers()
    loadAssignments()
  }, [])

  const localCount = users.length
  const outlookCount = outlookUsers.length
  const deletedCount = deletedUsers.length

  const createUser = async () => {
    const emails = parseEmails(email)
    if (emails.length === 0 || !password) {
      showToast('Email et mot de passe requis', 'error')
      return
    }
    try {
      const singleDisplayName = emails.length === 1 ? displayName : ''
      const results = await Promise.allSettled(
        emails.map(entry => api.post('/users', { email: entry, password, role, displayName: singleDisplayName }))
      )
      setEmail(''); setPassword(''); setDisplayName(''); setRole('TEACHER')
      await load()
      const failures = results.filter(result => result.status === 'rejected')
      if (failures.length > 0) {
        showToast(`${failures.length} création(s) ont échoué`, 'error')
      } else {
        showToast('Utilisateur créé avec succès', 'success')
      }
    } catch (e) {
      showToast('Erreur lors de la création', 'error')
    }
  }

  const resetPassword = async (id: string, pwd: string) => {
    if (!pwd) return
    try {
      await api.patch(`/users/${id}/password`, { password: pwd })
      showToast('Mot de passe réinitialisé', 'success')
    } catch (e) {
      showToast('Erreur lors de la réinitialisation', 'error')
    }
  }

  const deleteUser = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Désactiver l\'utilisateur',
      content: 'L\'utilisateur sera désactivé et ne pourra plus se connecter. Vous pourrez le réactiver plus tard si nécessaire.',
      onConfirm: async () => {
        if (!tripleConfirm('Confirmer la désactivation de cet utilisateur')) {
          setConfirmModal(null)
          return
        }
        await api.delete(`/users/${id}`)
        await load()
        await loadDeletedUsers()
        setConfirmModal(null)
        showToast('Utilisateur désactivé. Vous pouvez le réactiver dans l\'onglet "Supprimés"', 'success')
      }
    })
  }

  const reactivateUser = async (id: string) => {
    try {
      await api.post(`/users/${id}/reactivate`)
      await load()
      await loadDeletedUsers()
      showToast('Utilisateur réactivé avec succès', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erreur lors de la réactivation', 'error')
    }
  }

  const addOutlookUser = async () => {
    const emails = parseEmails(outlookEmail)
    if (emails.length === 0) return
    try {
      const singleDisplayName = emails.length === 1 ? outlookDisplayName.trim() : ''
      const results = await Promise.allSettled(
        emails.map(entry => api.post('/outlook-users', {
          email: entry,
          role: outlookRole,
          displayName: singleDisplayName || undefined
        }))
      )
      setOutlookEmail('')
      setOutlookDisplayName('')
      setOutlookRole('TEACHER')
      await loadOutlookUsers()
      const failures = results.filter(result => result.status === 'rejected')
      if (failures.length > 0) {
        showToast(`${failures.length} ajout(s) ont échoué`, 'error')
      } else {
        showToast('Utilisateur Outlook ajouté', 'success')
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Erreur lors de l\'ajout', 'error')
    }
  }

  const deleteOutlookUser = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Supprimer utilisateur Outlook',
      content: 'Supprimer cet utilisateur Outlook ?',
      onConfirm: async () => {
        if (!tripleConfirm('Confirmer la suppression de cet utilisateur Outlook')) {
          setConfirmModal(null)
          return
        }
        try {
          await api.delete(`/outlook-users/${id}`)
          await loadOutlookUsers()
          setConfirmModal(null)
          showToast('Utilisateur supprimé', 'success')
        } catch (e) {
          showToast('Erreur lors de la suppression', 'error')
        }
      }
    })
  }

  const updateOutlookUserRole = async (id: string, role: string) => {
    try {
      await api.patch(`/outlook-users/${id}`, { role })
      await loadOutlookUsers()
      showToast('Rôle mis à jour', 'success')
    } catch (e) {
      showToast('Erreur lors de la mise à jour', 'error')
    }
  }

  const updateUserDisplayName = async (id: string, displayName: string) => {
    try {
      await api.patch(`/users/${id}`, { displayName })
      await load()
      showToast('Nom mis à jour', 'success')
    } catch (e) {
      showToast('Erreur lors de la mise à jour du nom', 'error')
    }
  }

  const updateOutlookUserDisplayName = async (id: string, displayName: string) => {
    try {
      await api.patch(`/outlook-users/${id}`, { displayName })
      await loadOutlookUsers()
      showToast('Nom mis à jour', 'success')
    } catch (e) {
      showToast('Erreur lors de la mise à jour du nom', 'error')
    }
  }

  const viewAsUser = async (user: User) => {
    if (user.role === 'ADMIN') {
      showToast('Impossible d\'imiter un autre administrateur', 'error')
      return
    }

    try {
      setImpersonating(user._id)
      const data = await impersonationApi.start(user._id)

      // Determine the URL based on user role
      let targetUrl = '/'
      if (user.role === 'TEACHER') {
        targetUrl = '/teacher/classes'
      } else if (user.role === 'SUBADMIN') {
        targetUrl = '/subadmin/dashboard'
      } else if (user.role === 'AEFE') {
        targetUrl = '/aefe/dashboard'
      }

      // Open in new tab with the impersonation token
      const newWindow = window.open('about:blank', '_blank')
      if (newWindow) {
        newWindow.sessionStorage.setItem('token', data.token)
        newWindow.sessionStorage.setItem('role', user.role)
        newWindow.sessionStorage.setItem('displayName', user.displayName)

        newWindow.location.href = window.location.origin + targetUrl
      }

      setImpersonating(null)
    } catch (error) {
      console.error('Failed to impersonate:', error)
      showToast('Échec de l\'imitation', 'error')
      setImpersonating(null)
    }
  }

  const viewAsOutlookUser = async (user: OutlookUser) => {
    if (user.role === 'ADMIN') {
      showToast('Impossible d\'imiter un autre administrateur', 'error')
      return
    }

    try {
      setImpersonating(user._id)
      const data = await impersonationApi.start(user._id)

      // Determine the URL based on user role
      let targetUrl = '/'
      if (user.role === 'TEACHER') {
        targetUrl = '/teacher/classes'
      } else if (user.role === 'SUBADMIN') {
        targetUrl = '/subadmin/dashboard'
      } else if (user.role === 'AEFE') {
        targetUrl = '/aefe/dashboard'
      }

      // Open in new tab with the impersonation token
      const newWindow = window.open('about:blank', '_blank')
      if (newWindow) {
        newWindow.sessionStorage.setItem('token', data.token)
        newWindow.sessionStorage.setItem('role', user.role)
        newWindow.sessionStorage.setItem('displayName', user.displayName || user.email)

        newWindow.location.href = window.location.origin + targetUrl
      }

      setImpersonating(null)
    } catch (error) {
      console.error('Failed to impersonate Outlook user:', error)
      showToast('Échec de l\'imitation', 'error')
      setImpersonating(null)
    }
  }

  return (
    <div className="users-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.title || ''}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" onClick={() => setConfirmModal(null)}>Annuler</button>
            <button className="btn" onClick={confirmModal?.onConfirm}>Confirmer</button>
          </div>
        }
      >
        {confirmModal?.content}
      </Modal>

      <div className="users-header">
        <h2 className="users-title">
          <Sparkles size={28} style={{ display: 'inline', marginRight: 12, verticalAlign: 'middle' }} />
          Gestion des utilisateurs
        </h2>
        <p className="users-description">
          Gérez les accès, les rôles et les permissions de tous les utilisateurs de la plateforme en toute simplicité.
        </p>
      </div>

      <div className="users-toolbar">
        <div className="search-group">
          <input
            className="search-input"
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="Rechercher par nom ou email"
          />
        </div>

        {/* Filters Section */}
        {(availableClasses.length > 0 || availableLanguages.length > 0) && (
          <div className={`filters-panel ${filterClass || filterLanguage ? 'has-active-filters' : ''}`}>
            <div className="filters-panel-header">
              <div className="filters-panel-title">
                <Filter size={16} />
                <span>Filtres enseignants</span>
              </div>
              <div className="filters-panel-actions">
                {(filterClass || filterLanguage) && (
                  <span className="filter-active-badge">
                    {(filterClass ? 1 : 0) + (filterLanguage ? 1 : 0)} actif{(filterClass && filterLanguage) ? 's' : ''}
                  </span>
                )}
                {(filterClass || filterLanguage) && (
                  <button
                    className="filter-reset-btn"
                    onClick={() => {
                      setFilterClass('')
                      setFilterLanguage('')
                    }}
                    title="Réinitialiser tous les filtres"
                  >
                    <RefreshCw size={14} />
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            <div className="filters-panel-body">
              {availableClasses.length > 0 && (
                <div className="filter-card">
                  <div className="filter-card-header">
                    <div className="filter-card-title">Classe</div>
                  </div>
                  <div className="filter-card-control">
                    <div className="filter-control-icon class">
                      <GraduationCap size={12} />
                    </div>
                    <SearchableSelect
                      options={classOptions}
                      value={filterClass}
                      onChange={setFilterClass}
                      placeholder="Toutes les classes"
                      className="filter-searchable"
                    />
                  </div>
                  {filterClass && (
                    <div className="filter-chip">
                      <GraduationCap size={12} />
                      <span>{filterClass}</span>
                      <button
                        className="filter-chip-clear"
                        onClick={() => setFilterClass('')}
                        aria-label="Effacer le filtre de classe"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {availableLanguages.length > 0 && (
                <div className="filter-card">
                  <div className="filter-card-header">
                    <div className="filter-card-title">Langue</div>
                  </div>
                  <div className="filter-card-control">
                    <div className="filter-control-icon lang">
                      <Languages size={12} />
                    </div>
                    <SearchableSelect
                      options={languageOptions}
                      value={filterLanguage}
                      onChange={setFilterLanguage}
                      placeholder="Toutes les langues"
                      className="filter-searchable"
                    />
                  </div>
                  {filterLanguage && (
                    <div className="filter-chip">
                      <Languages size={12} />
                      <span>{formatLanguageLabel(filterLanguage)}</span>
                      <button
                        className="filter-chip-clear"
                        onClick={() => setFilterLanguage('')}
                        aria-label="Effacer le filtre de langue"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="users-stats">
          <span className="users-stat-chip" title="Comptes avec mot de passe local">
            <UsersIcon size={16} />
            {localCount} locaux
          </span>
          <span className="users-stat-chip" title="Comptes Microsoft/Outlook">
            <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="" style={{ width: 16, height: 16 }} />
            {outlookCount} Microsoft
          </span>
          {deletedCount > 0 && (
            <span className="users-stat-chip" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }} title="Comptes désactivés">
              <UserX size={16} />
              {deletedCount} supprimés
            </span>
          )}
        </div>
      </div>

      <div className="tabs-container">
        <button
          className={`tab-button ${activeTab === 'local' ? 'active' : ''}`}
          onClick={() => setActiveTab('local')}
        >
          <UsersIcon size={18} />
          Comptes Locaux
          <span className="tab-count">{localCount}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'microsoft' ? 'active microsoft' : ''}`}
          onClick={() => setActiveTab('microsoft')}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" style={{ width: 18, height: 18 }} />
          Comptes Microsoft
          <span className="tab-count">{outlookCount}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'deleted' ? 'active deleted' : ''}`}
          onClick={() => setActiveTab('deleted')}
          style={{ marginLeft: 'auto' }}
        >
          <UserX size={18} />
          Supprimés
          {deletedCount > 0 && (
            <span className="tab-count" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>{deletedCount}</span>
          )}
        </button>
      </div>

      {activeTab === 'local' && (
        <div className="animate-fade-in">
          <div className="add-user-card">
            <div className="add-user-header">
              <div style={{ background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', padding: 12, borderRadius: 14, color: '#4f46e5' }}>
                <UserPlus size={24} />
              </div>
              <div>
                <h3 className="add-user-title">Nouvel utilisateur local</h3>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Créez un compte avec email et mot de passe</span>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  placeholder="utilisateur@ecole.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mot de passe</label>
                <input
                  className="form-input"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nom affiché</label>
                <input
                  className="form-input"
                  placeholder="Jean Dupont"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Rôle</label>
                <select className="form-select" value={role} onChange={e => setRole(e.target.value as any)}>
                  <option value="TEACHER">👨‍🏫 Enseignant</option>
                  <option value="SUBADMIN">📋 Préfet</option>
                  <option value="AEFE">🏛️ RPP et Direction</option>
                  <option value="ADMIN">⚡ Administrateur</option>
                </select>
              </div>
              <button className="btn-add" onClick={createUser}>
                <Plus size={18} />
                Créer le compte
              </button>
            </div>
          </div>

          {renderRoleSection('ADMIN', users, false)}
          {renderRoleSection('SUBADMIN', users, false)}
          {renderRoleSection('AEFE', users, false)}
          {renderRoleSection('TEACHER', users, false)}
        </div>
      )}

      {activeTab === 'microsoft' && (
        <div className="animate-fade-in">
          <div className="add-user-card" style={{ background: 'linear-gradient(135deg, #f0f9ff, #ffffff)', borderColor: '#bae6fd' }}>
            <div className="add-user-header">
              <div style={{ background: 'white', padding: 12, borderRadius: 14, boxShadow: '0 2px 8px rgba(0,120,212,0.15)' }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="" style={{ width: 24, height: 24 }} />
              </div>
              <div>
                <h3 className="add-user-title">Autoriser un compte Microsoft</h3>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>L'utilisateur se connectera avec son compte Outlook/Microsoft</span>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email Microsoft</label>
                <input
                  className="form-input"
                  placeholder="utilisateur@outlook.com"
                  value={outlookEmail}
                  onChange={e => setOutlookEmail(e.target.value)}
                  type="email"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nom (optionnel)</label>
                <input
                  className="form-input"
                  placeholder="Jean Dupont"
                  value={outlookDisplayName}
                  onChange={e => setOutlookDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Rôle</label>
                <select className="form-select" value={outlookRole} onChange={e => setOutlookRole(e.target.value as any)}>
                  <option value="TEACHER">👨‍🏫 Enseignant</option>
                  <option value="SUBADMIN">📋 Préfet</option>
                  <option value="AEFE">🏛️ RPP et Direction</option>
                  <option value="ADMIN">⚡ Administrateur</option>
                </select>
              </div>
              <button className="btn-add" onClick={addOutlookUser} style={{ background: 'linear-gradient(135deg, #0078d4, #00a4ef)' }}>
                <Plus size={18} />
                Autoriser
              </button>
            </div>
          </div>

          {renderRoleSection('ADMIN', outlookUsers as User[], true)}
          {renderRoleSection('SUBADMIN', outlookUsers as User[], true)}
          {renderRoleSection('AEFE', outlookUsers as User[], true)}
          {renderRoleSection('TEACHER', outlookUsers as User[], true)}
        </div>
      )}

      {activeTab === 'deleted' && (
        <div className="animate-fade-in">
          <div className="deleted-users-header">
            <div style={{
              background: '#fee2e2',
              padding: 14,
              borderRadius: 14,
              color: '#dc2626'
            }}>
              <Archive size={26} />
            </div>
            <div>
              <h3>Utilisateurs désactivés</h3>
              <p>
                Ces comptes ont été désactivés et ne peuvent plus se connecter. Vous pouvez les réactiver à tout moment.
              </p>
            </div>
          </div>

          {deletedUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <UserX size={32} />
              </div>
              <p className="empty-state-text">Aucun utilisateur désactivé</p>
            </div>
          ) : (
            <div className="users-grid">
              {deletedUsers.map(user => {
                const roleStyle = getRoleColor(user.role)
                return (
                  <div key={user._id} className="user-card" style={{ opacity: 0.85, borderColor: '#fecaca' }}>
                    <div className="user-card-top" style={{ background: 'linear-gradient(135deg, #fef2f2, #ffffff)' }}>
                      <div className="user-avatar" style={{ backgroundColor: '#9ca3af' }}>
                        {getInitials(user.displayName || user.email)}
                      </div>
                      <div className="user-role-badge" style={{ color: '#6b7280', borderColor: '#d1d5db' }}>
                        {user.role}
                      </div>
                    </div>

                    <div className="user-card-content">
                      <div className="user-identity">
                        <div style={{ fontWeight: 700, color: '#374151', fontSize: '1.1rem', marginBottom: 4 }}>
                          {user.displayName || user.email}
                        </div>
                        <div className="user-email-row" style={{ cursor: 'default' }}>
                          <Mail size={14} />
                          <span className="user-email-text">{user.email}</span>
                        </div>
                        {user.deletedAt && (
                          <div style={{
                            fontSize: '0.8rem',
                            color: '#ef4444',
                            marginTop: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            background: '#fef2f2',
                            borderRadius: 8,
                            width: 'fit-content'
                          }}>
                            <Calendar size={14} />
                            Désactivé le {new Date(user.deletedAt).toLocaleDateString('fr-FR')}
                          </div>
                        )}
                      </div>

                      <div className="user-actions-area" style={{ marginTop: 16 }}>
                        <button
                          className="btn-action"
                          onClick={() => reactivateUser(user._id)}
                          style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: 'white',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 20px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            width: '100%',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                          }}
                          title="Réactiver l'utilisateur"
                        >
                          <RotateCcw size={16} />
                          Réactiver le compte
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
