import { useEffect, useState } from 'react'
import api, { impersonationApi } from '../api'

type User = { _id: string; email: string; role: 'ADMIN'|'SUBADMIN'|'TEACHER'; displayName: string }

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN'|'SUBADMIN'|'TEACHER'>('TEACHER')
  const [displayName, setDisplayName] = useState('')
  const [resetMap, setResetMap] = useState<Record<string, string>>({})
  const [impersonating, setImpersonating] = useState<string | null>(null)

  const load = async () => {
    const r = await api.get('/users')
    setUsers(r.data)
  }
  useEffect(() => { load() }, [])

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
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h2 className="title" style={{ fontSize: '1.8rem', marginBottom: 8 }}>Gestion des utilisateurs</h2>
            <p className="note">Manage user access and roles</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Create User Panel */}
        <div className="card" style={{ position: 'sticky', top: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#e6f7ff', padding: 8, borderRadius: 8, fontSize: 20 }}>👤</div>
            <h3 style={{ margin: 0 }}>Nouveau</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
                <label className="note" style={{ display: 'block', marginBottom: 4 }}>Email</label>
                <input placeholder="user@school.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none', transition: 'border-color 0.2s' }} />
            </div>
            <div>
                <label className="note" style={{ display: 'block', marginBottom: 4 }}>Mot de passe</label>
                <input placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }} />
            </div>
            <div>
                <label className="note" style={{ display: 'block', marginBottom: 4 }}>Nom affiché</label>
                <input placeholder="John Doe" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }} />
            </div>
            <div>
                <label className="note" style={{ display: 'block', marginBottom: 4 }}>Rôle</label>
                <select value={role} onChange={e => setRole(e.target.value as any)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none', backgroundColor: 'white' }}>
                  <option value="ADMIN">Admin</option>
                  <option value="SUBADMIN">Sous-admin</option>
                  <option value="TEACHER">Enseignant</option>
                </select>
            </div>
            <button className="btn" onClick={createUser} style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <span>+</span> Créer l'utilisateur
            </button>
          </div>
        </div>

        {/* User List Panel */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>Liste des utilisateurs ({users.length})</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {users.map(u => (
              <div key={u._id} style={{ padding: 16, borderRadius: 12, border: '1px solid #f0f0f0', background: '#fff', transition: 'box-shadow 0.2s', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#2d3436' }}>{u.displayName}</div>
                        <div style={{ color: '#636e72', fontSize: '0.9rem' }}>{u.email}</div>
                    </div>
                    <div className={`pill ${u.role === 'ADMIN' ? 'admin' : u.role === 'SUBADMIN' ? 'subadmin' : 'teacher'}`} 
                         style={{ 
                             fontSize: '0.75rem', 
                             background: u.role === 'ADMIN' ? '#fff0f6' : u.role === 'SUBADMIN' ? '#e6f7ff' : '#f6ffed',
                             color: u.role === 'ADMIN' ? '#c41d7f' : u.role === 'SUBADMIN' ? '#096dd9' : '#389e0d'
                         }}>
                        {u.role}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
                  <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                    <input 
                        placeholder="Nouveau mot de passe" 
                        type="password" 
                        value={resetMap[u._id] || ''} 
                        onChange={e => setResetMap({ ...resetMap, [u._id]: e.target.value })} 
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.9rem', width: '100%', maxWidth: 200 }} 
                    />
                    <button className="btn secondary" onClick={() => resetPassword(u._id)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Reset</button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    {u.role !== 'ADMIN' && (
                        <button 
                        className="btn" 
                        onClick={() => viewAsUser(u)}
                        disabled={impersonating === u._id}
                        style={{ backgroundColor: '#4CAF50', padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
                        title="Open user dashboard in new tab"
                        >
                        {impersonating === u._id ? '🔄' : '🚪'} Login As
                        </button>
                    )}
                    <button className="btn secondary" onClick={() => deleteUser(u._id)} style={{ background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e', padding: '6px 12px', fontSize: '0.85rem' }}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
