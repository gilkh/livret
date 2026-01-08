import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
    message: string
    type?: ToastType
    onClose: () => void
    duration?: number
    actionLabel?: string
    onAction?: () => void
    actionDisabled?: boolean
}

export default function Toast({ message, type = 'info', onClose, duration = 3000, actionLabel, onAction, actionDisabled }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose()
        }, duration)

        return () => clearTimeout(timer)
    }, [duration, onClose, message])

    const bgColors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6'
    }

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    }

    return createPortal(
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: bgColors[type],
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 2000,
            animation: 'slideInRight 0.3s ease-out',
            fontWeight: 500,
            maxWidth: '400px'
        }}>
            <div style={{ 
                backgroundColor: 'rgba(255,255,255,0.2)', 
                borderRadius: '50%', 
                width: '24px', 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold'
            }}>
                {icons[type]}
            </div>
            <div>{message}</div>
            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    disabled={!!actionDisabled}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.35)',
                        color: 'white',
                        cursor: actionDisabled ? 'not-allowed' : 'pointer',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontWeight: 600,
                        opacity: actionDisabled ? 0.7 : 1,
                        whiteSpace: 'nowrap'
                    }}
                >
                    {actionLabel}
                </button>
            )}
            <button 
                onClick={onClose}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    marginLeft: '8px',
                    fontSize: '18px',
                    padding: 0
                }}
            >
                ×
            </button>
            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>,
        document.body
    )
}
