import { useEffect, useState } from 'react'
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
  MoreVertical,
  Check,
  Search,
  UserPlus
} from 'lucide-react'
import './Users.css'

type User = { _id: string; email: string; role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'; displayName: string }
type OutlookUser = { _id: string; email: string; role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'; displayName?: string; lastLogin?: string }

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

  // Sync local state with prop when prop changes (e.g. after reload)
  useEffect(() => {
    setName(user.displayName || '')
  }, [user.displayName])

  const handleBlur = () => {
    if (name !== (user.displayName || '')) {
      onUpdateName(user._id, name)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Nom d'affichage"
            title="Cliquez pour modifier"
          />
          <div className="user-email-row" onClick={copyEmail} title="Copier l'email">
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
            />
            {password && (
              <button 
                className="btn-icon-action primary"
                onClick={handleReset}
                title="Valider le nouveau mot de passe"
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
                title="Se connecter en tant que..."
              >
                <LogIn size={16} />
              </button>
            )}
            
            <button 
              className="btn-action danger"
              onClick={() => onDelete(user._id)}
              title="Supprimer"
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

  useEffect(() => {
    setName(user.displayName || '')
  }, [user.displayName])

  const handleBlur = () => {
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
      <div className="user-card-top" style={{ background: `linear-gradient(135deg, #f0f7ff, #ffffff)` }}>
         <div className="user-avatar" style={{ backgroundColor: '#0078d4' }}>
            {getInitials(name || user.email)}
         </div>
         <div className="microsoft-badge">
            <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" style={{ width: 16, height: 16 }} />
         </div>
      </div>

      <div className="user-card-content">
        <div className="user-identity">
           <input
            className="user-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="Nom d'affichage"
          />
          <div className="user-email-row" onClick={copyEmail} title="Copier l'email">
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
           >
             <option value="TEACHER">Enseignant</option>
             <option value="SUBADMIN">Préfet</option>
             <option value="AEFE">RPP ET DIRECTION</option>
             <option value="ADMIN">Admin</option>
           </select>
           
           <button 
              className="btn-action danger" 
              onClick={() => onDelete(user._id)}
              title="Supprimer"
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'>('TEACHER')
  const [displayName, setDisplayName] = useState('')
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Outlook Users state
  const [outlookUsers, setOutlookUsers] = useState<OutlookUser[]>([])
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookRole, setOutlookRole] = useState<'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'>('TEACHER')
  const [outlookDisplayName, setOutlookDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState<'local' | 'microsoft'>('local')
  const [searchTerm, setSearchTerm] = useState('')
  const [toast, setToast] = useState<{message: string, type: ToastType} | null>(null)
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
    switch(role) {
      case 'ADMIN': return { bg: '#fff0f6', color: '#c41d7f', border: '#ffadd2' }
      case 'SUBADMIN': return { bg: '#e6f7ff', color: '#096dd9', border: '#91d5ff' }
      case 'AEFE': return { bg: '#fff7e6', color: '#d46b08', border: '#ffd591' }
      case 'TEACHER': return { bg: '#f6ffed', color: '#389e0d', border: '#b7eb8f' }
      default: return { bg: '#f5f5f5', color: '#595959', border: '#d9d9d9' }
    }
  }

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'ADMIN': return 'Administrateur'
      case 'SUBADMIN': return 'Préfet'
      case 'AEFE': return 'RPP ET DIRECTION'
      case 'TEACHER': return 'Enseignant'
      default: return role
    }
  }

  const renderRoleSection = (role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE', userList: (User|OutlookUser)[], isOutlook: boolean) => {
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
    setUsers(r.data)
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
  }, [])

  const localCount = users.length
  const outlookCount = outlookUsers.length

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
        title: 'Confirmer la suppression',
        content: 'Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.',
        onConfirm: async () => {
            if (!tripleConfirm('Confirmer la suppression de cet utilisateur')) {
                setConfirmModal(null)
                return
            }
            await api.delete(`/users/${id}`)
            await load()
            setConfirmModal(null)
            showToast('Utilisateur supprimé', 'success')
        }
    })
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
        <h2 className="users-title">Gestion des utilisateurs</h2>
        <p className="users-description">Gérez les accès et les rôles des utilisateurs de la plateforme.</p>
      </div>

      <div className="users-toolbar">
        <div className="search-group">
          <input
            className="search-input"
            type="text"
            placeholder="Rechercher par nom ou email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="users-stats">
          <span className="users-stat-chip">
            <UserPlus size={16} />
            Locaux: {localCount}
          </span>
          <span className="users-stat-chip">
            <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" style={{ width: 16, height: 16 }} />
            Microsoft: {outlookCount}
          </span>
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
      </div>

      {activeTab === 'local' && (
        <div className="animate-fade-in">
          <div className="add-user-card">
            <div className="add-user-header">
              <div style={{ background: '#e3f2fd', padding: 10, borderRadius: 10, color: '#1976d2' }}>
                <UserPlus size={22} />
              </div>
              <h3 className="add-user-title">Ajouter un utilisateur local</h3>
            </div>
            
            <div className="form-grid">
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" placeholder="user@school.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Mot de passe</label>
                    <input className="form-input" placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Nom affiché</label>
                    <input className="form-input" placeholder="John Doe" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Rôle</label>
                    <select className="form-select" value={role} onChange={e => setRole(e.target.value as any)}>
                      <option value="ADMIN">Admin</option>
                      <option value="SUBADMIN">Préfet</option>
                      <option value="AEFE">RPP ET DIRECTION</option>
                      <option value="TEACHER">Enseignant</option>
                    </select>
                </div>
                <button className="btn-add" onClick={createUser}>
                  <Plus size={18} />
                  Créer
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
           <div className="add-user-card" style={{ background: '#f0f7ff', borderColor: '#bae7ff' }}>
            <div className="add-user-header">
              <div style={{ background: 'white', padding: 10, borderRadius: 10 }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <h3 className="add-user-title">Ajouter un utilisateur Outlook</h3>
                <span className="users-description" style={{ fontSize: '0.9rem' }}>Les utilisateurs se connectent avec leur compte Microsoft</span>
              </div>
            </div>
            
            <div className="form-grid">
                <div className="form-group">
                    <label className="form-label">Email Outlook</label>
                    <input className="form-input" placeholder="user@outlook.com" value={outlookEmail} onChange={e => setOutlookEmail(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Nom (Optionnel)</label>
                    <input className="form-input" placeholder="John Doe" value={outlookDisplayName} onChange={e => setOutlookDisplayName(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Rôle</label>
                    <select className="form-select" value={outlookRole} onChange={e => setOutlookRole(e.target.value as any)}>
                      <option value="ADMIN">Admin</option>
                      <option value="SUBADMIN">Préfet</option>
                      <option value="AEFE">RPP ET DIRECTION</option>
                      <option value="TEACHER">Enseignant</option>
                    </select>
                </div>
                <button className="btn-add" onClick={addOutlookUser} style={{ backgroundColor: '#0078d4' }}>
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
    </div>
  )
}