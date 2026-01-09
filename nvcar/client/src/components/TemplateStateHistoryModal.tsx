import { useState, useEffect } from 'react'
import api from '../api'

interface VersionHistoryEntry {
    version: number
    createdAt: string
    createdBy: string
    createdByName?: string
    changeDescription: string
    saveType: 'manual' | 'auto'
    pageCount: number
    blockCount: number
}

interface TemplateStateHistoryModalProps {
    templateId: string
    templateName: string
    currentVersion: number
    onClose: () => void
    onRestore?: (version: number) => void
}

export function TemplateStateHistoryModal({
    templateId,
    templateName,
    currentVersion,
    onClose,
    onRestore
}: TemplateStateHistoryModalProps) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>([])
    const [expandedVersion, setExpandedVersion] = useState<number | null>(null)

    useEffect(() => {
        loadHistory()
    }, [templateId])

    const loadHistory = async () => {
        try {
            setLoading(true)
            setError('')
            const res = await api.get(`/templates/${templateId}/state-history`)
            setVersionHistory(res.data.versionHistory || [])
        } catch (e: any) {
            setError(e.response?.data?.message || 'Erreur lors du chargement de l\'historique')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'Date inconnue'
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const getRelativeTime = (dateStr: string) => {
        if (!dateStr) return ''
        try {
            const date = new Date(dateStr)
            const now = new Date()
            const diff = now.getTime() - date.getTime()
            const minutes = Math.floor(diff / 60000)
            const hours = Math.floor(minutes / 60)
            const days = Math.floor(hours / 24)

            if (minutes < 1) return 'À l\'instant'
            if (minutes < 60) return `Il y a ${minutes} min`
            if (hours < 24) return `Il y a ${hours}h`
            if (days < 7) return `Il y a ${days} jour${days > 1 ? 's' : ''}`
            return formatDate(dateStr)
        } catch {
            return ''
        }
    }

    if (loading) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                backdropFilter: 'blur(4px)'
            }}>
                <div style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 40,
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
                    <p style={{ margin: 0, color: '#6b7280' }}>Chargement de l'historique du template...</p>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: '#fff',
                borderRadius: 16,
                width: '90%',
                maxWidth: 700,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 28px',
                    borderBottom: '1px solid #e5e7eb',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    borderRadius: '16px 16px 0 0',
                    color: '#fff'
                }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        🗂️ Template History
                    </h2>
                    <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9 }}>
                        {templateName} - Version actuelle: v{currentVersion}
                    </p>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            borderRadius: 8,
                            marginBottom: 16,
                            fontSize: 14
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Info box */}
                    <div style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 20
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ fontSize: 20 }}>💡</span>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, color: '#1e40af', fontSize: 14 }}>
                                    Historique des sauvegardes du template
                                </p>
                                <p style={{ margin: '6px 0 0', color: '#3b82f6', fontSize: 13 }}>
                                    Cet historique montre toutes les versions sauvegardées du template,
                                    incluant les sauvegardes manuelles et automatiques.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Version List */}
                    {versionHistory.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#6b7280'
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📭</div>
                            <p style={{ margin: 0 }}>Aucun historique disponible pour ce template.</p>
                            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                L'historique commence à s'enregistrer après la première sauvegarde avec des affectations.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {versionHistory.map((version, idx) => {
                                const isCurrentVersion = version.version === currentVersion
                                const isExpanded = expandedVersion === version.version

                                return (
                                    <div
                                        key={version.version}
                                        style={{
                                            border: isCurrentVersion ? '2px solid #10b981' : '1px solid #e5e7eb',
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            background: isCurrentVersion ? '#f0fdf4' : '#fff'
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '14px 16px',
                                                cursor: 'pointer',
                                                gap: 12
                                            }}
                                            onClick={() => setExpandedVersion(isExpanded ? null : version.version)}
                                        >
                                            {/* Version badge */}
                                            <div style={{
                                                background: isCurrentVersion ? '#10b981' : '#6b7280',
                                                color: '#fff',
                                                padding: '4px 10px',
                                                borderRadius: 6,
                                                fontWeight: 700,
                                                fontSize: 14
                                            }}>
                                                v{version.version}
                                            </div>

                                            {/* Save type indicator */}
                                            <div style={{
                                                background: version.saveType === 'auto' ? '#fef3c7' : '#dbeafe',
                                                color: version.saveType === 'auto' ? '#d97706' : '#2563eb',
                                                padding: '2px 8px',
                                                borderRadius: 10,
                                                fontSize: 11,
                                                fontWeight: 600
                                            }}>
                                                {version.saveType === 'auto' ? '⏱️ Auto' : '💾 Manuel'}
                                            </div>

                                            {/* Main info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                                                    {version.changeDescription || (isCurrentVersion ? '✨ Version actuelle' : 'Sauvegarde')}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                                    📅 {getRelativeTime(version.createdAt)}
                                                    {version.createdByName && (
                                                        <span style={{ marginLeft: 12 }}>
                                                            👤 {version.createdByName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div style={{
                                                display: 'flex',
                                                gap: 8,
                                                fontSize: 11,
                                                color: '#9ca3af'
                                            }}>
                                                <span>📄 {version.pageCount} pages</span>
                                                <span>🧱 {version.blockCount} blocs</span>
                                            </div>

                                            {/* Expand icon */}
                                            <span style={{ fontSize: 14, color: '#9ca3af' }}>
                                                {isExpanded ? '▼' : '▶'}
                                            </span>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div style={{
                                                padding: '12px 16px',
                                                background: '#f9fafb',
                                                borderTop: '1px solid #e5e7eb'
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                                    <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Date de sauvegarde</div>
                                                        <div style={{ fontWeight: 500, color: '#374151', fontSize: 13 }}>{formatDate(version.createdAt)}</div>
                                                    </div>
                                                    <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Sauvegardé par</div>
                                                        <div style={{ fontWeight: 500, color: '#374151', fontSize: 13 }}>{version.createdByName || version.createdBy || 'Inconnu'}</div>
                                                    </div>
                                                </div>

                                                {!isCurrentVersion && onRestore && (
                                                    <button
                                                        onClick={() => onRestore(version.version)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px 16px',
                                                            background: '#fef3c7',
                                                            color: '#92400e',
                                                            border: '1px solid #fcd34d',
                                                            borderRadius: 8,
                                                            cursor: 'pointer',
                                                            fontWeight: 600,
                                                            fontSize: 13,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 8
                                                        }}
                                                    >
                                                        ⏪ Restaurer cette version
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 28px',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: '#f9fafb',
                    borderRadius: '0 0 16px 16px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 28px',
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 14
                        }}
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    )
}
