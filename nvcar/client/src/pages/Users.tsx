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
  RefreshCw
} from 'lucide-react'
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
  impersonatingId
}: {
  user: User,
  roleStyle: any,
  onUpdateName: (id: string, name: string) => void,
  onDelete: (id: string) => void,
  onResetPassword: (id: string, pass: string) => void,
  onImpersonate: (user: User) => void,
  impersonatingId: string | null
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
  onUpdateRole
}: {
  user: OutlookUser,
  roleStyle: any,
  onUpdateName: (id: string, name: string) => void,
  onDelete: (id: string) => void,
  onUpdateRole: (id: string, role: string) => void
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

  // Outlook Users state
  const [outlookUsers, setOutlookUsers] = useState<OutlookUser[]>([])
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookRole, setOutlookRole] = useState<'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE'>('TEACHER')
  const [outlookDisplayName, setOutlookDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState<'local' | 'microsoft' | 'deleted'>('local')
  const [searchTerm, setSearchTerm] = useState('')
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
    const filteredUsers = term
      ? baseUsers.filter(u => {
        const name = (u as User).displayName || (u as OutlookUser).displayName || ''
        return name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
      })
      : baseUsers
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

  const loadDeletedUsers = async () => {
    try {
      const r = await api.get('/users/deleted')
      setDeletedUsers(r.data)
    } catch (e) {
      console.error('Failed to load deleted users:', e)
    }
  }

  const loadOutlookUsers = async () => {
    try {
      const r = await api.get('/outlook-users')
      setOutlookUsers(r.data)
    } catch (e) {
      console.error('Failed to load Outlook users:', e)
    }
  }

  useEffect(() => {
    load()
    loadOutlookUsers()
    loadDeletedUsers()
  }, [])

  const localCount = users.length
  const outlookCount = outlookUsers.length
  const deletedCount = deletedUsers.length

  const createUser = async () => {
    if (!email || !password) {
      showToast('Email et mot de passe requis', 'error')
      return
    }
    try {
      await api.post('/users', { email, password, role, displayName })
      setEmail(''); setPassword(''); setDisplayName(''); setRole('TEACHER')
      await load()
      showToast('Utilisateur créé avec succès', 'success')
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
    if (!outlookEmail.trim()) return
    try {
      await api.post('/outlook-users', {
        email: outlookEmail.trim().toLowerCase(),
        role: outlookRole,
        displayName: outlookDisplayName.trim() || undefined
      })
      setOutlookEmail('')
      setOutlookDisplayName('')
      setOutlookRole('TEACHER')
      await loadOutlookUsers()
      showToast('Utilisateur Outlook ajouté', 'success')
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