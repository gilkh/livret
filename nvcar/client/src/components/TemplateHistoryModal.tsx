import { useState, useEffect } from 'react'
import api from '../api'

interface VersionDistribution {
    [yearId: string]: {
        yearName: string
        classes: {
            [classId: string]: {
                className: string
                level: string
                count: number
                students: string[]
            }
        }
    }
}

interface VersionInfo {
    version: number
    createdAt: string
    createdBy: string
    changeDescription: string
    assignmentCount: number
    distribution: VersionDistribution
}

interface TemplateHistoryModalProps {
    templateId: string
    templateName: string
    onClose: () => void
}

// 3-click confirmation states
type RollbackState = 'idle' | 'confirm1' | 'confirm2' | 'rolling'

export function TemplateHistoryModal({
    templateId,
    templateName,
    onClose
}: TemplateHistoryModalProps) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [templateInfo, setTemplateInfo] = useState<any>(null)
    const [currentVersionInfo, setCurrentVersionInfo] = useState<VersionInfo | null>(null)
    const [versionHistory, setVersionHistory] = useState<VersionInfo[]>([])
    const [totalAssignments, setTotalAssignments] = useState(0)
    const [versionsInUse, setVersionsInUse] = useState<number[]>([])
    const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set())
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

    // Rollback state - tracks which version is being rolled back and what stage
    const [rollbackStates, setRollbackStates] = useState<Record<number, RollbackState>>({})

    useEffect(() => {
        loadHistory()
    }, [templateId])

    // Reset rollback state after timeout if user doesn't complete the confirmation
    useEffect(() => {
        const activeRollbacks = Object.entries(rollbackStates).filter(([_, state]) => state !== 'idle' && state !== 'rolling')
        if (activeRollbacks.length > 0) {
            const timer = setTimeout(() => {
                setRollbackStates(prev => {
                    const newState = { ...prev }
                    for (const [version, state] of Object.entries(newState)) {
                        if (state !== 'rolling') {
                            newState[Number(version)] = 'idle'
                        }
                    }
                    return newState
                })
            }, 5000) // Reset after 5 seconds of inactivity
            return () => clearTimeout(timer)
        }
    }, [rollbackStates])

    const loadHistory = async () => {
        try {
            setLoading(true)
            setError('')
            const res = await api.get(`/template-propagation/${templateId}/history`)
            setTemplateInfo(res.data.template)
            setCurrentVersionInfo(res.data.currentVersionInfo)
            setVersionHistory(res.data.versionHistory || [])
            setTotalAssignments(res.data.totalAssignments || 0)
            setVersionsInUse(res.data.versionsInUse || [])

            // Auto-expand current version
            if (res.data.currentVersionInfo) {
                setExpandedVersions(new Set([res.data.currentVersionInfo.version]))
            }
        } catch (e: any) {
            setError(e.response?.data?.message || 'Erreur lors du chargement de l\'historique')
        } finally {
            setLoading(false)
        }
    }

    const handleRollbackClick = async (targetVersion: number) => {
        const currentState = rollbackStates[targetVersion] || 'idle'

        if (currentState === 'idle') {
            // First click - show confirmation
            setRollbackStates(prev => ({ ...prev, [targetVersion]: 'confirm1' }))
        } else if (currentState === 'confirm1') {
            // Second click - show final confirmation
            setRollbackStates(prev => ({ ...prev, [targetVersion]: 'confirm2' }))
        } else if (currentState === 'confirm2') {
            // Third click - execute rollback
            await executeRollback(targetVersion)
        }
    }

    const executeRollback = async (targetVersion: number) => {
        try {
            setRollbackStates(prev => ({ ...prev, [targetVersion]: 'rolling' }))
            setError('')
            setSuccessMessage('')

            // Get all assignments that are NOT on this version (to roll them back TO this version)
            const res = await api.get(`/template-propagation/${templateId}/assignments`)
            const allAssignments = res.data.assignments || []

            // Find assignments that should be rolled back (currently on newer versions)
            const assignmentsToRollback = allAssignments
                .filter((a: any) => a.templateVersion > targetVersion)
                .map((a: any) => a._id)

            if (assignmentsToRollback.length === 0) {
                setError('Aucun carnet à restaurer vers cette version.')
                setRollbackStates(prev => ({ ...prev, [targetVersion]: 'idle' }))
                return
            }

            // Execute the rollback
            const rollbackRes = await api.post(`/template-propagation/${templateId}/rollback`, {
                assignmentIds: assignmentsToRollback,
                targetVersion
            })

            setSuccessMessage(`✅ ${rollbackRes.data.rolledBackCount} carnet(s) restauré(s) vers la version ${targetVersion}`)

            // Reload history to show updated state
            await loadHistory()

            // Reset rollback state
            setRollbackStates(prev => ({ ...prev, [targetVersion]: 'idle' }))

            // Clear success message after a few seconds
            setTimeout(() => setSuccessMessage(''), 5000)
        } catch (e: any) {
            setError(e.response?.data?.message || 'Erreur lors de la restauration')
            setRollbackStates(prev => ({ ...prev, [targetVersion]: 'idle' }))
        }
    }

    const cancelRollback = (version: number, e: React.MouseEvent) => {
        e.stopPropagation()
        setRollbackStates(prev => ({ ...prev, [version]: 'idle' }))
    }

    const getRollbackButtonContent = (state: RollbackState) => {
        const styles = {
            idle: {
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d'
            },
            confirm1: {
                background: '#fed7aa',
                color: '#c2410c',
                border: '1px solid #fdba74'
            },
            confirm2: {
                background: '#fecaca',
                color: '#dc2626',
                border: '1px solid #f87171'
            },
            rolling: {
                background: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #93c5fd'
            }
        }

        const text = {
            idle: '⏪ Restaurer',
            confirm1: '⚠️ Confirmer?',
            confirm2: '🔴 VRAIMENT?',
            rolling: '⏳ En cours...'
        }

        return { style: styles[state], text: text[state] }
    }

    const toggleVersion = (version: number) => {
        const newExpanded = new Set(expandedVersions)
        if (newExpanded.has(version)) {
            newExpanded.delete(version)
        } else {
            newExpanded.add(version)
        }
        setExpandedVersions(newExpanded)
    }

    const toggleYear = (key: string) => {
        const newExpanded = new Set(expandedYears)
        if (newExpanded.has(key)) {
            newExpanded.delete(key)
        } else {
            newExpanded.add(key)
        }
        setExpandedYears(newExpanded)
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

    const renderDistribution = (distribution: VersionDistribution, version: number) => {
        const yearEntries = Object.entries(distribution)
        if (yearEntries.length === 0) {
            return (
                <div style={{
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: 8,
                    color: '#6b7280',
                    textAlign: 'center',
                    fontSize: 13
                }}>
                    📭 Aucun carnet n'utilise cette version
                </div>
            )
        }

        return (
            <div style={{ marginTop: 12 }}>
                {yearEntries.map(([yearId, yearData]) => {
                    const yearKey = `${version}-${yearId}`
                    const isYearExpanded = expandedYears.has(yearKey)
                    const totalStudentsInYear = Object.values(yearData.classes).reduce((sum, c) => sum + c.count, 0)

                    return (
                        <div key={yearId} style={{
                            background: '#f9fafb',
                            borderRadius: 8,
                            marginBottom: 8,
                            overflow: 'hidden',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    background: '#fff'
                                }}
                                onClick={() => toggleYear(yearKey)}
                            >
                                <span style={{ fontSize: 16, marginRight: 8 }}>🗓️</span>
                                <span style={{ flex: 1, fontWeight: 500, color: '#374151', fontSize: 14 }}>
                                    {yearData.yearName}
                                </span>
                                <span style={{
                                    fontSize: 12,
                                    background: '#dbeafe',
                                    color: '#1d4ed8',
                                    padding: '2px 8px',
                                    borderRadius: 10,
                                    marginRight: 8
                                }}>
                                    {totalStudentsInYear} élève(s)
                                </span>
                                <span style={{ fontSize: 14, color: '#9ca3af' }}>
                                    {isYearExpanded ? '▼' : '▶'}
                                </span>
                            </div>

                            {isYearExpanded && (
                                <div style={{ padding: '8px 12px 12px' }}>
                                    {Object.entries(yearData.classes).map(([classId, classData]) => (
                                        <div key={classId} style={{
                                            padding: '8px 12px',
                                            background: '#fff',
                                            borderRadius: 6,
                                            marginBottom: 6,
                                            border: '1px solid #e5e7eb'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                marginBottom: 6
                                            }}>
                                                <span style={{ fontSize: 14, marginRight: 8 }}>📚</span>
                                                <span style={{ fontWeight: 500, color: '#4b5563', fontSize: 13 }}>
                                                    {classData.className}
                                                </span>
                                                {classData.level && (
                                                    <span style={{
                                                        marginLeft: 8,
                                                        fontSize: 11,
                                                        background: '#e0e7ff',
                                                        color: '#3730a3',
                                                        padding: '2px 6px',
                                                        borderRadius: 8
                                                    }}>
                                                        {classData.level}
                                                    </span>
                                                )}
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    fontSize: 12,
                                                    color: '#6b7280'
                                                }}>
                                                    {classData.count} élève(s)
                                                </span>
                                            </div>
                                            <div style={{
                                                fontSize: 12,
                                                color: '#9ca3af',
                                                lineHeight: 1.5
                                            }}>
                                                👤 {classData.students.slice(0, 5).join(', ')}
                                                {classData.students.length > 5 && (
                                                    <span style={{ color: '#6b7280' }}>
                                                        {' '}et {classData.students.length - 5} autre(s)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderRollbackButton = (version: number) => {
        const state = rollbackStates[version] || 'idle'
        const { style, text } = getRollbackButtonContent(state)
        const isActive = state !== 'idle' && state !== 'rolling'

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isActive && (
                    <button
                        onClick={(e) => cancelRollback(version, e)}
                        style={{
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            color: '#6b7280',
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 500
                        }}
                    >
                        ✕ Annuler
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        handleRollbackClick(version)
                    }}
                    disabled={state === 'rolling'}
                    style={{
                        padding: '4px 12px',
                        ...style,
                        borderRadius: 6,
                        cursor: state === 'rolling' ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        animation: state === 'confirm2' ? 'pulse 0.5s infinite' : 'none'
                    }}
                >
                    {text}
                </button>
            </div>
        )
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
                    <p style={{ margin: 0, color: '#6b7280' }}>Chargement de l'historique...</p>
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
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.02); }
                }
            `}</style>
            <div style={{
                background: '#fff',
                borderRadius: 16,
                width: '90%',
                maxWidth: 800,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 28px',
                    borderBottom: '1px solid #e5e7eb',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    borderRadius: '16px 16px 0 0',
                    color: '#fff'
                }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        📜 Historique des versions
                    </h2>
                    <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9 }}>
                        {templateName}
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

                    {successMessage && (
                        <div style={{
                            padding: '12px 16px',
                            background: '#d1fae5',
                            color: '#065f46',
                            borderRadius: 8,
                            marginBottom: 16,
                            fontSize: 14,
                            fontWeight: 500
                        }}>
                            {successMessage}
                        </div>
                    )}

                    {/* Summary */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 16,
                        marginBottom: 24
                    }}>
                        <div style={{
                            background: '#eff6ff',
                            borderRadius: 12,
                            padding: 16,
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>
                                {templateInfo?.currentVersion || 1}
                            </div>
                            <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}>
                                Version actuelle
                            </div>
                        </div>
                        <div style={{
                            background: '#f0fdf4',
                            borderRadius: 12,
                            padding: 16,
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>
                                {totalAssignments}
                            </div>
                            <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>
                                Carnets affectés
                            </div>
                        </div>
                        <div style={{
                            background: '#faf5ff',
                            borderRadius: 12,
                            padding: 16,
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#9333ea' }}>
                                {versionsInUse.length}
                            </div>
                            <div style={{ fontSize: 12, color: '#a855f7', marginTop: 4 }}>
                                Version(s) utilisée(s)
                            </div>
                        </div>
                    </div>

                    {/* Info about rollback */}
                    <div style={{
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 20
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ fontSize: 20 }}>💡</span>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, color: '#92400e', fontSize: 14 }}>
                                    Restauration vers une version antérieure
                                </p>
                                <p style={{ margin: '6px 0 0', color: '#a16207', fontSize: 13 }}>
                                    Cliquez 3 fois sur "Restaurer" pour revenir à une version précédente.
                                    Cette action déplacera tous les carnets des versions plus récentes vers la version sélectionnée.
                                    <strong> Les données saisies par les enseignants seront préservées.</strong>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Current Version */}
                    {currentVersionInfo && (
                        <div style={{
                            border: '2px solid #10b981',
                            borderRadius: 12,
                            marginBottom: 16,
                            overflow: 'hidden'
                        }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '14px 16px',
                                    background: '#ecfdf5',
                                    cursor: 'pointer'
                                }}
                                onClick={() => toggleVersion(currentVersionInfo.version)}
                            >
                                <div style={{
                                    background: '#10b981',
                                    color: '#fff',
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    fontWeight: 700,
                                    fontSize: 14,
                                    marginRight: 12
                                }}>
                                    v{currentVersionInfo.version}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: '#065f46', fontSize: 15 }}>
                                        ✨ Version actuelle
                                    </div>
                                    <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                                        {currentVersionInfo.assignmentCount} carnet(s) utilisent cette version
                                    </div>
                                </div>
                                <span style={{ fontSize: 16, color: '#10b981' }}>
                                    {expandedVersions.has(currentVersionInfo.version) ? '▼' : '▶'}
                                </span>
                            </div>

                            {expandedVersions.has(currentVersionInfo.version) && (
                                <div style={{ padding: '12px 16px', background: '#fff' }}>
                                    {renderDistribution(currentVersionInfo.distribution, currentVersionInfo.version)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Version History */}
                    {versionHistory.length > 0 && (
                        <>
                            <h3 style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}>
                                📚 Historique des modifications
                            </h3>
                            {versionHistory.map((version) => {
                                const isCurrentVersion = version.version === templateInfo?.currentVersion
                                if (isCurrentVersion) return null // Already shown above

                                return (
                                    <div key={version.version} style={{
                                        border: '1px solid #e5e7eb',
                                        borderRadius: 10,
                                        marginBottom: 10,
                                        overflow: 'hidden',
                                        opacity: version.assignmentCount === 0 ? 0.7 : 1
                                    }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                background: '#f9fafb',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => toggleVersion(version.version)}
                                        >
                                            <div style={{
                                                background: version.assignmentCount > 0 ? '#3b82f6' : '#9ca3af',
                                                color: '#fff',
                                                padding: '3px 8px',
                                                borderRadius: 5,
                                                fontWeight: 600,
                                                fontSize: 13,
                                                marginRight: 12
                                            }}>
                                                v{version.version}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500, color: '#374151', fontSize: 14 }}>
                                                    {version.changeDescription}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                                    📅 {formatDate(version.createdAt)}
                                                    {version.assignmentCount > 0 && (
                                                        <span style={{ marginLeft: 12 }}>
                                                            👥 {version.assignmentCount} carnet(s)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Rollback button for previous versions */}
                                            {renderRollbackButton(version.version)}
                                            <span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 10 }}>
                                                {expandedVersions.has(version.version) ? '▼' : '▶'}
                                            </span>
                                        </div>

                                        {expandedVersions.has(version.version) && (
                                            <div style={{ padding: '12px 14px', background: '#fff' }}>
                                                {renderDistribution(version.distribution, version.version)}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </>
                    )}

                    {versionHistory.length === 0 && !currentVersionInfo && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#6b7280'
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📭</div>
                            <p style={{ margin: 0 }}>Aucun historique disponible pour ce template.</p>
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
                            background: '#6366f1',
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
