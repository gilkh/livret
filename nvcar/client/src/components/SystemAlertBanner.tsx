import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useSocket } from '../context/SocketContext'

export default function SystemAlertBanner() {
    const socket = useSocket()
    const [alert, setAlert] = useState<{ _id?: string; message: string; type?: 'warning' | 'success'; expiresAt?: string } | null>(null)
    const [dismissedAlertKey, setDismissedAlertKey] = useState<string | null>(() => sessionStorage.getItem('dismissed_system_alert_key'))
    const [now, setNow] = useState<number>(Date.now())

    const getAlertKey = (value: { _id?: string; message: string; type?: 'warning' | 'success' } | null) => {
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
        const checkAlert = async () => {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token')
            if (!token) {
                setAlert(null)
                setDismissedAlertKey(null)
                sessionStorage.removeItem('dismissed_system_alert_key')
                return
            }

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

        // Check immediately, then poll frequently, and refresh on tab focus/visibility.
        checkAlert()
        const interval = setInterval(checkAlert, 5000)

        const onFocus = () => { checkAlert() }
        const onVisibility = () => {
            if (document.visibilityState === 'visible') checkAlert()
        }
        const onStorage = (e: StorageEvent) => {
            if (!e.key || e.key === 'token') checkAlert()
        }

        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('storage', onStorage)

        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('storage', onStorage)
        }
    }, [])

    useEffect(() => {
        if (!socket) return

        const onAlertUpdated = (payload: { _id?: string; message: string; expiresAt?: string } | null) => {
            if (payload && payload.message) {
                setAlert(payload)
                return
            }
            setAlert(null)
            setDismissedAlertKey(null)
            sessionStorage.removeItem('dismissed_system_alert_key')
        }

        socket.on('system-alert-updated', onAlertUpdated)
        return () => {
            socket.off('system-alert-updated', onAlertUpdated)
        }
    }, [socket])

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    const alertKey = getAlertKey(alert)
    const dismissed = !!alertKey && dismissedAlertKey === alertKey
    const alertType = alert?.type === 'success' ? 'success' : 'warning'

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

    if (alertType === 'success') {
        return (
            <div style={{
                position: 'fixed',
                top: 16,
                right: 16,
                zIndex: 9998,
                width: 420,
                maxWidth: 'calc(100vw - 32px)',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                borderRadius: 12,
                padding: 14,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: '#166534' }}>✅ Maintenance annulée</strong>
                    <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                        {formatRemaining(remainingMs)}
                    </span>
                </div>
                <div style={{ color: '#166534', fontSize: 14, lineHeight: 1.4 }}>{alert.message}</div>
            </div>
        )
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
