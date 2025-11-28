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
      <div className="card">
        <h2 className="title">Gestion des utilisateurs</h2>
        <div className="grid2">
          <div className="card">
            <h3>Créer un utilisateur</h3>
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', marginTop: 8 }} />
            <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', marginTop: 8 }} />
            <input placeholder="Nom affiché" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', marginTop: 8 }} />
            <select value={role} onChange={e => setRole(e.target.value as any)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', marginTop: 8 }}>
              <option value="ADMIN">Admin</option>
              <option value="SUBADMIN">Sous-admin</option>
              <option value="TEACHER">Enseignant</option>
            </select>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={createUser}>Créer</button>
            </div>
          </div>
          <div className="card">
            <h3>Liste des utilisateurs</h3>
            {users.map(u => (
              <div key={u._id} className="competency">
                <div>{u.displayName} — {u.email}</div>
                <div className="pill">{u.role}</div>
                <div className="toolbar" style={{ marginTop: 6, gap: 8 }}>
                  <input placeholder="Nouveau mot de passe" type="password" value={resetMap[u._id] || ''} onChange={e => setResetMap({ ...resetMap, [u._id]: e.target.value })} style={{ padding: 6, borderRadius: 6, border: '1px solid #ddd' }} />
                  <button className="btn secondary" onClick={() => resetPassword(u._id)}>Réinitialiser le mot de passe</button>
                  <button className="btn secondary" onClick={() => deleteUser(u._id)} style={{ background: '#ff7675', color: 'white' }}>Supprimer</button>
                  {u.role !== 'ADMIN' && (
                    <button 
                      className="btn" 
                      onClick={() => viewAsUser(u)}
                      disabled={impersonating === u._id}
                      style={{ backgroundColor: '#4CAF50' }}
                      title="Open user dashboard in new tab"
                    >
                      {impersonating === u._id ? '🔄 Opening...' : '🚪 Login As'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
