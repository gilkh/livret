import { useEffect, useState } from 'react'
import api from '../api'
import { useLocation } from 'react-router-dom'

export default function SystemAlertBanner() {
    const [alert, setAlert] = useState<{ message: string } | null>(null)
    const location = useLocation()
    const isAdmin = location.pathname.startsWith('/admin')

    useEffect(() => {
        const checkAlert = async () => {
            try {
                const res = await api.get('/admin-extras/alert')
                if (res.data && res.data.message) {
                    setAlert(res.data)
                } else {
                    setAlert(null)
                }
            } catch (e) {
                // ignore errors
            }
        }

        // Check immediately and then every 30s
        checkAlert()
        const interval = setInterval(checkAlert, 30000)
        return () => clearInterval(interval)
    }, [])

    if (!alert) return null

    // If admin, show as banner but don't block
    if (isAdmin) {
        return (
            <div style={{ background: '#fff7ed', borderBottom: '1px solid #fdba74', padding: '8px 16px', textAlign: 'center', color: '#c2410c' }}>
                <strong>Alerte Active:</strong> {alert.message}
            </div>
        )
    }

    // For others, show overlay
    return (
        <div style={{ 
            position: 'fixed', 
            top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.8)', 
            zIndex: 9999,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
        }}>
            <div style={{ background: 'white', padding: 32, borderRadius: 12, maxWidth: 500, textAlign: 'center' }}>
                <h2 style={{ color: '#dc2626', marginTop: 0 }}>⚠️ Alerte Système</h2>
                <p style={{ fontSize: 18 }}>{alert.message}</p>
            </div>
        </div>
    )
}
