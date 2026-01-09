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
            top: '24px',
            right: '24px',
            backgroundColor: bgColors[type],
            color: 'white',
            padding: '20px 32px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25), 0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 2000,
            animation: 'slideInFromTop 0.4s ease-out',
            fontWeight: 500,
            maxWidth: '520px',
            fontSize: '16px',
            border: '2px solid rgba(255, 255, 255, 0.3)'
        }}>
            <div style={{
                backgroundColor: 'rgba(255,255,255,0.25)',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {icons[type]}
            </div>
            <div style={{ fontSize: '16px', lineHeight: 1.4 }}>{message}</div>
            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    disabled={!!actionDisabled}
                    style={{
                        background: 'rgba(255,255,255,0.25)',
                        border: '2px solid rgba(255,255,255,0.5)',
                        color: 'white',
                        cursor: actionDisabled ? 'not-allowed' : 'pointer',
                        borderRadius: 8,
                        padding: '10px 16px',
                        fontWeight: 700,
                        fontSize: '15px',
                        opacity: actionDisabled ? 0.7 : 1,
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease'
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
                    color: 'rgba(255,255,255,0.9)',
                    cursor: 'pointer',
                    marginLeft: '8px',
                    fontSize: '24px',
                    padding: 0,
                    fontWeight: 'bold'
                }}
            >
                ×
            </button>
            <style>{`
                @keyframes slideInFromTop {
                    from { opacity: 0; transform: translateY(-100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>,
        document.body
    )
}
