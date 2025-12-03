import { useEffect, useState } from 'react'
import api, { impersonationApi } from '../api'

type User = { _id: string; email: string; role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'; displayName: string }
type OutlookUser = { _id: string; email: string; role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'; displayName?: string; lastLogin?: string }

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'>('TEACHER')
  const [displayName, setDisplayName] = useState('')
  const [resetMap, setResetMap] = useState<Record<string, string>>({})
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Outlook Users state
  const [outlookUsers, setOutlookUsers] = useState<OutlookUser[]>([])
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookRole, setOutlookRole] = useState<'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE'>('TEACHER')
  const [outlookDisplayName, setOutlookDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState<'local' | 'microsoft'>('local')

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
      case 'SUBADMIN': return 'Sous-Administrateur'
      case 'AEFE': return 'AEFE'
      case 'TEACHER': return 'Enseignant'
      default: return role
    }
  }

  const renderRoleSection = (role: 'ADMIN'|'SUBADMIN'|'TEACHER'|'AEFE', userList: (User|OutlookUser)[], isOutlook: boolean) => {
    const filteredUsers = userList.filter(u => u.role === role)
    if (filteredUsers.length === 0) return null

    const roleStyle = getRoleColor(role)

    return (
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ 
          borderBottom: `2px solid ${roleStyle.border}`, 
          paddingBottom: 8, 
          marginBottom: 16,
          color: roleStyle.color,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {getRoleLabel(role)}s
          <span style={{ 
            fontSize: '0.8rem', 
            background: roleStyle.bg, 
            padding: '2px 8px', 
            borderRadius: 12 
          }}>{filteredUsers.length}</span>
        </h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredUsers.map(u => (
            <div key={u._id} className="card" style={{ padding: 16, borderTop: `4px solid ${roleStyle.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                  {isOutlook ? (
                     <input
                        defaultValue={(u as OutlookUser).displayName || ''}
                        onBlur={(e) => {
                            if (e.target.value !== ((u as OutlookUser).displayName || '')) {
                                updateOutlookUserDisplayName(u._id, e.target.value)
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        placeholder="Nom d'affichage"
                        style={{ border: 'none', borderBottom: '1px dashed #ccc', width: '100%', padding: '2px 0' }}
                     />
                  ) : u.displayName}
                </div>
              </div>
              
              <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 16, wordBreak: 'break-all' }}>
                {u.email}
              </div>

              {isOutlook && (u as OutlookUser).lastLogin && (
                 <div style={{ fontSize: '0.75rem', color: '#999', marginBottom: 12 }}>
                    Dernière connexion: {new Date((u as OutlookUser).lastLogin!).toLocaleDateString('fr-FR')}
                 </div>
              )}

              <div style={{ paddingTop: 12, borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isOutlook && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input 
                        placeholder="Nouveau mot de passe" 
                        type="password" 
                        value={resetMap[u._id] || ''} 
                        onChange={e => setResetMap({ ...resetMap, [u._id]: e.target.value })} 
                        style={{ padding: '6px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.85rem', flex: 1 }} 
                    />
                    <button className="btn secondary" onClick={() => resetPassword(u._id)} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Reset</button>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                   {isOutlook ? (
                      <select 
                        value={u.role}
                        onChange={e => updateOutlookUserRole(u._id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem' }}
                      >
                        <option value="TEACHER">Enseignant</option>
                        <option value="SUBADMIN">Sous-admin</option>
                        <option value="AEFE">AEFE</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                   ) : (
                     <div>
                        {u.role !== 'ADMIN' && (
                            <button 
                            className="btn" 
                            onClick={() => viewAsUser(u)}
                            disabled={impersonating === u._id}
                            style={{ backgroundColor: '#4CAF50', padding: '4px 8px', fontSize: '0.8rem', marginRight: 8 }}
                            title="Se connecter en tant que..."
                            >
                            {impersonating === u._id ? '...' : 'Login As'}
                            </button>
                        )}
                     </div>
                   )}
                   
                   <button 
                      className="btn secondary" 
                      onClick={() => isOutlook ? deleteOutlookUser(u._id) : deleteUser(u._id)} 
                      style={{ background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e', padding: '4px 8px', fontSize: '0.8rem' }}
                   >
                      Supprimer
                   </button>
                </div>
              </div>
            </div>
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

  const createUser = async () => {
    await api.post('/users', { email, password, role, displayName })
    setEmail(''); setPassword(''); setDisplayName(''); setRole('TEACHER')
    await load()
  }

  const resetPassword = async (id: string) => {
    const pwd = resetMap[id] || ''
    if (!pwd) return
    await api.patch(`/users/${id}/password`, { password: pwd })
    const next = { ...resetMap }; delete next[id]; setResetMap(next)
  }

  const deleteUser = async (id: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return
    await api.delete(`/users/${id}`)
    await load()
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
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur lors de l\'ajout')
    }
  }

  const deleteOutlookUser = async (id: string) => {
    if (!confirm('Supprimer cet utilisateur Outlook ?')) return
    try {
      await api.delete(`/outlook-users/${id}`)
      await loadOutlookUsers()
    } catch (e) {
      alert('Erreur lors de la suppression')
    }
  }

  const updateOutlookUserRole = async (id: string, role: string) => {
    try {
      await api.patch(`/outlook-users/${id}`, { role })
      await loadOutlookUsers()
    } catch (e) {
      alert('Erreur lors de la mise à jour')
    }
  }

  const updateOutlookUserDisplayName = async (id: string, displayName: string) => {
    try {
      await api.patch(`/outlook-users/${id}`, { displayName })
      // Don't reload to avoid losing focus if we were typing, 
      // but here we use onBlur so it's fine.
      // Actually, reloading might reset the input if we use defaultValue.
      // Let's just reload to be safe and consistent.
      await loadOutlookUsers()
    } catch (e) {
      alert('Erreur lors de la mise à jour du nom')
    }
  }

  const viewAsUser = async (user: User) => {
    if (user.role === 'ADMIN') {
      alert('Cannot impersonate another admin')
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
        // Store the impersonation data in the new window's localStorage
        newWindow.localStorage.setItem('token', data.token)
        newWindow.localStorage.setItem('role', user.role)
        newWindow.localStorage.setItem('displayName', user.displayName)
        
        // Navigate to the target URL
        newWindow.location.href = window.location.origin + targetUrl
      }
      
      setImpersonating(null)
    } catch (error) {
      console.error('Failed to impersonate:', error)
      alert('Failed to impersonate user')
      setImpersonating(null)
    }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 32 }}>
        <h2 className="title" style={{ fontSize: '2rem', marginBottom: 8 }}>Gestion des utilisateurs</h2>
        <p className="note">Gérez les accès et les rôles des utilisateurs de la plateforme.</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #e0e0e0' }}>
        <button 
          onClick={() => setActiveTab('local')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'local' ? '3px solid #1890ff' : '3px solid transparent',
            color: activeTab === 'local' ? '#1890ff' : '#666',
            fontWeight: activeTab === 'local' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '1.1rem',
            transition: 'all 0.2s'
          }}
        >
          👤 Comptes Locaux
        </button>
        <button 
          onClick={() => setActiveTab('microsoft')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'microsoft' ? '3px solid #0078d4' : '3px solid transparent',
            color: activeTab === 'microsoft' ? '#0078d4' : '#666',
            fontWeight: activeTab === 'microsoft' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '1.1rem',
            transition: 'all 0.2s'
          }}
        >
          🔐 Comptes Microsoft
        </button>
      </div>

      {activeTab === 'local' && (
        <div className="animate-fade-in">
          <div className="card" style={{ marginBottom: 32, background: '#f9f9f9', border: '1px dashed #d9d9d9' }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ajouter un utilisateur local</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Email</label>
                    <input placeholder="user@school.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9' }} />
                </div>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Mot de passe</label>
                    <input placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9' }} />
                </div>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Nom affiché</label>
                    <input placeholder="John Doe" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9' }} />
                </div>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Rôle</label>
                    <select value={role} onChange={e => setRole(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9', backgroundColor: 'white' }}>
                      <option value="ADMIN">Admin</option>
                      <option value="SUBADMIN">Sous-admin</option>
                      <option value="AEFE">AEFE</option>
                      <option value="TEACHER">Enseignant</option>
                    </select>
                </div>
                <button className="btn" onClick={createUser} style={{ height: 42 }}>+ Créer</button>
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
           <div className="card" style={{ marginBottom: 32, background: '#f0f7ff', border: '1px dashed #bae7ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Ajouter un utilisateur Outlook</h3>
                <span className="note">Les utilisateurs se connectent avec leur compte Microsoft</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Email Outlook</label>
                    <input placeholder="user@outlook.com" value={outlookEmail} onChange={e => setOutlookEmail(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9' }} />
                </div>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Nom (Optionnel)</label>
                    <input placeholder="John Doe" value={outlookDisplayName} onChange={e => setOutlookDisplayName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9' }} />
                </div>
                <div>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Rôle</label>
                    <select value={outlookRole} onChange={e => setOutlookRole(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #d9d9d9', backgroundColor: 'white' }}>
                      <option value="ADMIN">Admin</option>
                      <option value="SUBADMIN">Sous-admin</option>
                      <option value="AEFE">AEFE</option>
                      <option value="TEACHER">Enseignant</option>
                    </select>
                </div>
                <button className="btn" onClick={addOutlookUser} style={{ height: 42, backgroundColor: '#0078d4' }}>+ Autoriser</button>
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
