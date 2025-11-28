import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const r = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', r.data.token)
      localStorage.setItem('role', r.data.role)
      localStorage.setItem('displayName', r.data.displayName || email)

      // Redirect based on role
      if (r.data.role === 'ADMIN') {
        navigate('/admin')
      } else if (r.data.role === 'SUBADMIN') {
        navigate('/subadmin/dashboard')
      } else if (r.data.role === 'TEACHER') {
        navigate('/teacher/classes')
      } else {
        navigate('/')
      }
    } catch (e: any) {
      setError('Identifiants invalides')
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Welcome Section */}
        <div className="login-welcome">
          <div className="login-brand">
            <img src="/champville_logo.png" alt="Champville Logo" className="login-logo" />
            <h1 className="login-school-name">Collège des Frères Maristes Champville</h1>
            <p className="login-tagline">Livret</p>
          </div>
          <div className="login-decoration">
            <div className="floating-shape shape-1"></div>
            <div className="floating-shape shape-2"></div>
            <div className="floating-shape shape-3"></div>
          </div>
        </div>

        {/* Login Form Section */}
        <div className="login-form-section">
          <div className="login-card">
            <div className="login-header">
              <h2 className="login-title">Bienvenue</h2>
              <p className="login-subtitle">Connectez-vous à votre compte</p>
            </div>

            <form onSubmit={submit} className="login-form">
              <div className="form-group">
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className={`form-input ${focusedField === 'email' || email ? 'has-value' : ''}`}
                  required
                />
                <label htmlFor="email" className="form-label">Adresse email</label>
              </div>

              <div className="form-group">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className={`form-input ${focusedField === 'password' || password ? 'has-value' : ''}`}
                  required
                />
                <label htmlFor="password" className="form-label">Mot de passe</label>
              </div>

              {error && (
                <div className="login-error">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z" fill="currentColor" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="login-submit-btn">
                <span>Se connecter</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 0l10 10-10 10V0z" fill="currentColor" />
                </svg>
              </button>
            </form>

            <div className="login-footer">
              <p>Système de gestion académique</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
