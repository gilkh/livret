import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false)
  const [showMicrosoftLogin, setShowMicrosoftLogin] = useState(true)
  const navigate = useNavigate()
  const processingRef = useRef(false)

  // Handle Microsoft OAuth callback
  useEffect(() => {
    // Fetch public settings
    api.get('/settings/public').then(res => {
      if (res.data.login_enabled_microsoft !== undefined) {
        setShowMicrosoftLogin(res.data.login_enabled_microsoft)
      }
    }).catch(console.error)

    if (processingRef.current) return
    
    // Log everything for debugging
    console.log('=== Microsoft OAuth Debug ===')
    console.log('Full URL:', window.location.href)
    console.log('Search params:', window.location.search)
    console.log('Hash:', window.location.hash)
    
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const error = urlParams.get('error')
    const errorDescription = urlParams.get('error_description')
    
    // Also check hash params (in case response_mode is different)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const hashCode = hashParams.get('code')
    const hashError = hashParams.get('error')
    
    console.log('Query code:', code)
    console.log('Query error:', error)
    console.log('Hash code:', hashCode)
    console.log('Hash error:', hashError)
    console.log('=========================')
    
    const finalCode = code || hashCode
    const finalError = error || hashError
    
    if (finalError) {
      setError(`Microsoft login error: ${finalError} - ${errorDescription || hashParams.get('error_description')}`)
    } else if (finalCode) {
      processingRef.current = true
      handleMicrosoftCallback(finalCode)
    }
  }, [])

  const handleMicrosoftCallback = async (code: string) => {
    setIsLoadingMicrosoft(true)
    setError(null)
    try {
      console.log('Microsoft callback - exchanging code for token...')
      const r = await api.post('/microsoft/callback', { code })
      console.log('Microsoft login successful:', r.data)
      
      localStorage.setItem('token', r.data.token)
      localStorage.setItem('role', r.data.role)
      localStorage.setItem('displayName', r.data.displayName || '')

      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname)

      // Force a small delay to ensure state is updated before navigation
      setTimeout(() => {
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
      }, 100)
    } catch (e: any) {
      console.error('Microsoft authentication error:', e)
      const errorMsg = e.response?.data?.error || 'Échec de l\'authentification Microsoft'
      const errorDetails = e.response?.data?.details
      const readableDetails = errorDetails
        ? typeof errorDetails === 'string'
          ? errorDetails
          : JSON.stringify(errorDetails)
        : null
      
      if (errorMsg.includes('not authorized') || errorMsg.includes('Email not authorized')) {
        setError('Votre adresse email n\'est pas autorisée. Veuillez contacter l\'administrateur.')
      } else if (readableDetails) {
        setError(`${errorMsg}: ${readableDetails}`)
      } else {
        setError(errorMsg)
      }
      
      setIsLoadingMicrosoft(false)
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }

  const handleMicrosoftLogin = async () => {
    setError(null)
    setIsLoadingMicrosoft(true)
    try {
      const r = await api.get('/microsoft/auth-url')
      window.location.href = r.data.authUrl
    } catch (e: any) {
      setError('Impossible de se connecter avec Microsoft')
      setIsLoadingMicrosoft(false)
    }
  }

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

  if (isLoadingMicrosoft) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-form-section">
            <div className="login-card">
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: '3rem', marginBottom: 20 }}>🔄</div>
                <p>Connexion avec Microsoft en cours...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
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

            {/* Divider */}
            {showMicrosoftLogin && (
              <>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: '24px 0',
                  gap: 12
                }}>
                  <div style={{ flex: 1, height: 1, background: '#e0e0e0' }}></div>
                  <span style={{ color: '#999', fontSize: '0.85rem' }}>OU</span>
                  <div style={{ flex: 1, height: 1, background: '#e0e0e0' }}></div>
                </div>

                {/* Microsoft Login Button */}
                <button 
                  type="button"
                  onClick={handleMicrosoftLogin}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    background: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    fontSize: '1rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    color: '#333'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#f5f5f5'
                    e.currentTarget.style.borderColor = '#0078d4'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'white'
                    e.currentTarget.style.borderColor = '#e0e0e0'
                  }}
                >
                  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  <span>Se connecter avec Microsoft</span>
                </button>
              </>
            )}

            <div className="login-footer">
              <p>Système de gestion académique</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
