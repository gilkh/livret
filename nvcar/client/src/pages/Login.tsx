import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [error, setError] = useState<string | null>(null)
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
      const redirectUri = window.location.origin
      const r = await api.post('/microsoft/callback', { code, redirect_uri: redirectUri })
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
      const redirectUri = window.location.origin
      const r = await api.get(`/microsoft/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`)
      window.location.href = r.data.authUrl
    } catch (e: any) {
      setError('Impossible de se connecter avec Microsoft')
      setIsLoadingMicrosoft(false)
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
                <p style={{ marginTop: 12, fontSize: '0.9rem', color: '#6b7280' }}>
                  Veuillez ne pas fermer cette fenêtre. Vous allez être redirigé automatiquement.
                </p>
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
              <p className="login-helper-text">
                Utilisez votre adresse Microsoft Champville pour accéder à votre espace.
              </p>
            </div>

            {error && (
              <div className="login-error" style={{ marginBottom: '20px' }} role="alert" aria-live="polite">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {showMicrosoftLogin ? (
              <button 
                type="button"
                onClick={handleMicrosoftLogin}
                className="login-microsoft-btn"
              >
                <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                <span>Se connecter avec Microsoft</span>
              </button>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  La connexion Microsoft est actuellement désactivée.
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#6b7280', marginTop: -8 }}>
                  En cas de problème, veuillez contacter l&apos;administration ou le support informatique.
                </div>
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
