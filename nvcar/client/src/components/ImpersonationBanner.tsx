import { useEffect, useState } from 'react'
import { impersonationApi } from '../api'

interface ImpersonationStatus {
  isImpersonating: boolean
  impersonatedUser?: {
    id: string
    email: string
    role: string
    displayName: string
  }
  actualAdmin?: {
    id: string
    email: string
    displayName: string
  }
}

export default function ImpersonationBanner() {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkImpersonationStatus()
  }, [])

  const checkImpersonationStatus = async () => {
    try {
      const data = await impersonationApi.getStatus()
      setStatus(data)
    } catch (error) {
      console.error('Failed to check impersonation status:', error)
    }
  }

  const handleStopImpersonation = async () => {
    try {
      setLoading(true)
      await impersonationApi.stop()
      
      // Clear the impersonated session
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('displayName')
      
      // Close the tab (this works if opened by window.open)
      window.close()
      
      // If window.close() doesn't work (user manually opened URL), redirect to login
      setTimeout(() => {
        if (!window.closed) {
          alert('Please close this tab manually or use the close button')
          window.location.href = '/login'
        }
      }, 500)
    } catch (error) {
      console.error('Failed to stop impersonation:', error)
      alert('Failed to exit impersonation mode')
    } finally {
      setLoading(false)
    }
  }

  if (!status || !status.isImpersonating) {
    return null
  }

  return (
    <div style={{
      backgroundColor: '#ff9800',
      color: '#000',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '2px solid #f57c00',
      fontWeight: 'bold',
      fontSize: '14px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>⚠️</span>
        <div>
          <div>
            <strong>ADMIN MODE:</strong> Logged in as {status.impersonatedUser?.displayName} ({status.impersonatedUser?.role})
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
            Full account access • Original admin: {status.actualAdmin?.displayName}
          </div>
        </div>
      </div>
      <button
        onClick={handleStopImpersonation}
        disabled={loading}
        style={{
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          padding: '8px 20px',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        {loading ? '🔄 Exiting...' : '🚪 Exit & Close Tab'}
      </button>
    </div>
  )
}
