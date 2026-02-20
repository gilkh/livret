import { useEffect, useMemo, useState } from 'react'
import api from '../api'

export default function SystemAlertBanner() {
    const [alert, setAlert] = useState<{ _id?: string; message: string; expiresAt?: string } | null>(null)
    const [dismissedAlertKey, setDismissedAlertKey] = useState<string | null>(() => sessionStorage.getItem('dismissed_system_alert_key'))
    const [now, setNow] = useState<number>(Date.now())

    const getAlertKey = (value: { _id?: string; message: string } | null) => {
        if (!value) return null
        return value._id || value.message
    }

    const handleDismiss = () => {
        const key = getAlertKey(alert)
        if (!key) return
        sessionStorage.setItem('dismissed_system_alert_key', key)
        setDismissedAlertKey(key)
    }

    useEffect(() => {
        const token = localStorage.getItem('token')
        if (!token) return

        const checkAlert = async () => {
            try {
                const res = await api.get('/admin-extras/alert')
                if (res.data && res.data.message) {
                    setAlert(res.data)
                } else {
                    setAlert(null)
                    setDismissedAlertKey(null)
                    sessionStorage.removeItem('dismissed_system_alert_key')
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

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    const alertKey = getAlertKey(alert)
    const dismissed = !!alertKey && dismissedAlertKey === alertKey

    const remainingMs = useMemo(() => {
        if (!alert?.expiresAt) return null
        return new Date(alert.expiresAt).getTime() - now
    }, [alert?.expiresAt, now])

    useEffect(() => {
        if (remainingMs !== null && remainingMs <= 0) {
            sessionStorage.removeItem('dismissed_system_alert_key')
            setDismissedAlertKey(null)
        }
    }, [remainingMs])

    if (!alert) return null

    if (remainingMs !== null && remainingMs <= 0) {
        return null
    }

    const formatRemaining = (ms: number | null) => {
        if (ms === null) return 'Jusqu\'à arrêt admin'
        const totalSeconds = Math.max(0, Math.floor(ms / 1000))
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${String(seconds).padStart(2, '0')}`
    }

    if (dismissed) {
        return (
            <div style={{
                position: 'fixed',
                top: 16,
                right: 16,
                zIndex: 9998,
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                background: '#fff',
                border: '1px solid #fed7aa',
                boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                borderRadius: 12,
                padding: 14,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: '#c2410c' }}>⚠️ Alerte active</strong>
                    <span style={{ fontSize: 12, color: '#9a3412', fontWeight: 600 }}>
                        {formatRemaining(remainingMs)}
                    </span>
                </div>
                <div style={{ color: '#7c2d12', fontSize: 14, lineHeight: 1.4 }}>{alert.message}</div>
            </div>
        )
    }

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
                <p style={{ fontSize: 13, color: '#7c2d12', marginTop: 10 }}>
                    Durée restante: <strong>{formatRemaining(remainingMs)}</strong>
                </p>
                <div style={{ marginTop: 20 }}>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Fermer et continuer
                    </button>
                </div>
            </div>
        </div>
    )
}
