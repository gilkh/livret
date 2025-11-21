import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const r = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', r.data.token)
      localStorage.setItem('role', r.data.role)
      if (r.data.role === 'ADMIN') navigate('/admin')
      else if (r.data.role === 'SUBADMIN') navigate('/admin')
      else navigate('/')
    } catch (e: any) {
      setError('Identifiants invalides')
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420, margin: '64px auto' }}>
        <h2 className="title">Connexion</h2>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
            <button className="btn" type="submit">Se connecter</button>
            {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}
          </div>
        </form>
      </div>
    </div>
  )
}
