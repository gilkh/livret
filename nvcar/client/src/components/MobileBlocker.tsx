import { useState, useEffect, useRef } from 'react'
import api from '../api'
import './MobileBlocker.css'

interface MobileBlockerProps {
    minWidth: number
    schoolName?: string
}

export default function MobileBlocker({ minWidth, schoolName }: MobileBlockerProps) {
    const [isBlocked, setIsBlocked] = useState(false)
    const [currentWidth, setCurrentWidth] = useState(window.innerWidth)
    const hasLoggedRef = useRef(false)

    useEffect(() => {
        const checkWidth = () => {
            const width = window.innerWidth
            setCurrentWidth(width)
            setIsBlocked(width < minWidth)
        }

        checkWidth()
        window.addEventListener('resize', checkWidth)
        return () => window.removeEventListener('resize', checkWidth)
    }, [minWidth])

    // Log mobile access attempt when blocked
    useEffect(() => {
        if (isBlocked && !hasLoggedRef.current) {
            hasLoggedRef.current = true

            // Send log to backend
            api.post('/settings/mobile-access-log', {
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight,
                path: window.location.pathname
            }).catch(err => {
                console.error('Failed to log mobile access:', err)
            })
        }
    }, [isBlocked])

    if (!isBlocked) return null

    return (
        <div className="mobile-blocker-overlay">
            {/* Animated background shapes */}
            <div className="mobile-blocker-bg">
                <div className="bg-shape bg-shape-1" />
                <div className="bg-shape bg-shape-2" />
                <div className="bg-shape bg-shape-3" />
            </div>

            <div className="mobile-blocker-content">
                {/* Icon */}
                <div className="mobile-blocker-icon">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                        {/* X mark over phone */}
                        <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" strokeWidth="2" />
                    </svg>
                </div>

                {/* School name if available */}
                {schoolName && (
                    <p className="mobile-blocker-school">{schoolName}</p>
                )}

                {/* Main message */}
                <h1 className="mobile-blocker-title">
                    Accès non disponible
                </h1>

                <p className="mobile-blocker-message">
                    Cette application est optimisée pour les <strong>ordinateurs portables</strong> et <strong>ordinateurs de bureau</strong>.
                </p>

                <p className="mobile-blocker-submessage">
                    Pour accéder à l'application, veuillez utiliser un appareil avec un écran plus grand.
                </p>

                {/* Device illustration */}
                <div className="mobile-blocker-devices">
                    <div className="device-group">
                        <div className="device laptop">
                            <div className="device-screen">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                            </div>
                            <div className="device-base" />
                        </div>
                        <span className="device-label">Laptop</span>
                        <div className="device-check">✓</div>
                    </div>

                    <div className="device-group">
                        <div className="device desktop">
                            <div className="device-screen">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                            </div>
                            <div className="device-stand" />
                        </div>
                        <span className="device-label">Bureau</span>
                        <div className="device-check">✓</div>
                    </div>
                </div>

                {/* Technical info */}
                <div className="mobile-blocker-info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>Largeur minimale requise : {minWidth}px • Votre écran : {currentWidth}px</span>
                </div>
            </div>
        </div>
    )
}
