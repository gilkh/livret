import { useState, useEffect } from 'react'
import api from '../api'

interface AssignmentInfo {
    _id: string
    studentId: string
    studentName: string
    classId: string
    className: string
    level: string
    schoolYearId: string
    schoolYearName: string
    templateVersion: number
    hasData: boolean
    status: string
}

interface GroupedData {
    [yearId: string]: {
        yearName: string
        classes: {
            [classId: string]: {
                className: string
                level: string
                assignments: AssignmentInfo[]
            }
        }
    }
}

interface TemplatePropagationModalProps {
    templateId: string
    templateName: string
    currentVersion: number
    onClose: () => void
    onSave: (propagateToAssignmentIds: string[] | 'all' | 'none', changeDescription?: string) => Promise<void>
}

export function TemplatePropagationModal({
    templateId,
    templateName,
    currentVersion,
    onClose,
    onSave
}: TemplatePropagationModalProps) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [groupedByYear, setGroupedByYear] = useState<GroupedData>({})
    const [totalCount, setTotalCount] = useState(0)
    const [versionsInUse, setVersionsInUse] = useState<number[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [selectionMode, setSelectionMode] = useState<'all' | 'none' | 'custom'>('all')
    const [changeDescription, setChangeDescription] = useState('')
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())

    useEffect(() => {
        loadAssignments()
    }, [templateId])

    const loadAssignments = async () => {
        try {
            setLoading(true)
            setError('')
            const res = await api.get(`/template-propagation/${templateId}/assignments`)
            setGroupedByYear(res.data.groupedByYear || {})
            setTotalCount(res.data.totalCount || 0)
            setVersionsInUse(res.data.versionsInUse || [])

            // Initially select all
            const allIds = new Set<string>()
            for (const yearData of Object.values(res.data.groupedByYear || {})) {
                for (const classData of Object.values((yearData as any).classes || {})) {
                    for (const assignment of (classData as any).assignments || []) {
                        allIds.add(assignment._id)
                    }
                }
            }
            setSelectedIds(allIds)

            // Expand all years by default
            setExpandedYears(new Set(Object.keys(res.data.groupedByYear || {})))
        } catch (e: any) {
            setError(e.response?.data?.message || 'Erreur lors du chargement')
        } finally {
            setLoading(false)
        }
    }

    const toggleYear = (yearId: string) => {
        const newExpanded = new Set(expandedYears)
        if (newExpanded.has(yearId)) {
            newExpanded.delete(yearId)
        } else {
            newExpanded.add(yearId)
        }
        setExpandedYears(newExpanded)
    }

    const toggleClass = (classKey: string) => {
        const newExpanded = new Set(expandedClasses)
        if (newExpanded.has(classKey)) {
            newExpanded.delete(classKey)
        } else {
            newExpanded.add(classKey)
        }
        setExpandedClasses(newExpanded)
    }

    const selectAll = () => {
        const allIds = new Set<string>()
        for (const yearData of Object.values(groupedByYear)) {
            for (const classData of Object.values(yearData.classes)) {
                for (const assignment of classData.assignments) {
                    allIds.add(assignment._id)
                }
            }
        }
        setSelectedIds(allIds)
        setSelectionMode('all')
    }

    const selectNone = () => {
        setSelectedIds(new Set())
        setSelectionMode('none')
    }

    const selectYear = (yearId: string, select: boolean) => {
        const newSelected = new Set(selectedIds)
        const yearData = groupedByYear[yearId]
        if (yearData) {
            for (const classData of Object.values(yearData.classes)) {
                for (const assignment of classData.assignments) {
                    if (select) {
                        newSelected.add(assignment._id)
                    } else {
                        newSelected.delete(assignment._id)
                    }
                }
            }
        }
        setSelectedIds(newSelected)
        setSelectionMode('custom')
    }

    const selectClass = (yearId: string, classId: string, select: boolean) => {
        const newSelected = new Set(selectedIds)
        const yearData = groupedByYear[yearId]
        const classData = yearData?.classes?.[classId]
        if (classData) {
            for (const assignment of classData.assignments) {
                if (select) {
                    newSelected.add(assignment._id)
                } else {
                    newSelected.delete(assignment._id)
                }
            }
        }
        setSelectedIds(newSelected)
        setSelectionMode('custom')
    }

    const toggleAssignment = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
        setSelectionMode('custom')
    }

    const isYearSelected = (yearId: string) => {
        const yearData = groupedByYear[yearId]
        if (!yearData) return false
        for (const classData of Object.values(yearData.classes)) {
            for (const assignment of classData.assignments) {
                if (!selectedIds.has(assignment._id)) return false
            }
        }
        return true
    }

    const isYearPartiallySelected = (yearId: string) => {
        const yearData = groupedByYear[yearId]
        if (!yearData) return false
        let hasSelected = false
        let hasUnselected = false
        for (const classData of Object.values(yearData.classes)) {
            for (const assignment of classData.assignments) {
                if (selectedIds.has(assignment._id)) hasSelected = true
                else hasUnselected = true
            }
        }
        return hasSelected && hasUnselected
    }

    const isClassSelected = (yearId: string, classId: string) => {
        const yearData = groupedByYear[yearId]
        const classData = yearData?.classes?.[classId]
        if (!classData) return false
        for (const assignment of classData.assignments) {
            if (!selectedIds.has(assignment._id)) return false
        }
        return true
    }

    const isClassPartiallySelected = (yearId: string, classId: string) => {
        const yearData = groupedByYear[yearId]
        const classData = yearData?.classes?.[classId]
        if (!classData) return false
        let hasSelected = false
        let hasUnselected = false
        for (const assignment of classData.assignments) {
            if (selectedIds.has(assignment._id)) hasSelected = true
            else hasUnselected = true
        }
        return hasSelected && hasUnselected
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            setError('')

            let propagateValue: string[] | 'all' | 'none'
            if (selectionMode === 'all') {
                propagateValue = 'all'
            } else if (selectionMode === 'none' || selectedIds.size === 0) {
                propagateValue = 'none'
            } else {
                propagateValue = Array.from(selectedIds)
            }

            await onSave(propagateValue, changeDescription || undefined)
        } catch (e: any) {
            setError(e.response?.data?.message || 'Erreur lors de la sauvegarde')
        } finally {
            setSaving(false)
        }
    }

    const getStatusBadge = (status: string) => {
        const colors: Record<string, { bg: string; color: string }> = {
            'draft': { bg: '#fef3c7', color: '#92400e' },
            'in_progress': { bg: '#dbeafe', color: '#1e40af' },
            'completed': { bg: '#d1fae5', color: '#065f46' },
            'signed': { bg: '#e0e7ff', color: '#3730a3' }
        }
        const c = colors[status] || { bg: '#f3f4f6', color: '#4b5563' }
        const labels: Record<string, string> = {
            'draft': 'Brouillon',
            'in_progress': 'En cours',
            'completed': 'Complété',
            'signed': 'Signé'
        }
        return (
            <span style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                background: c.bg,
                color: c.color,
                fontWeight: 500
            }}>
                {labels[status] || status}
            </span>
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
                    <p style={{ margin: 0, color: '#6b7280' }}>Chargement des carnets affectés...</p>
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
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '16px 16px 0 0',
                    color: '#fff'
                }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                        📋 Propagation des modifications
                    </h2>
                    <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9 }}>
                        Template: <strong>{templateName}</strong> (Version {currentVersion})
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

                    {totalCount === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#6b7280'
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📭</div>
                            <p style={{ margin: 0 }}>Aucun carnet n'est affecté par ce template.</p>
                            <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                                Vous pouvez sauvegarder les modifications sans impact.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Info box */}
                            <div style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 10,
                                padding: 16,
                                marginBottom: 20
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <span style={{ fontSize: 24 }}>💡</span>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: 600, color: '#1e40af', fontSize: 15 }}>
                                            {totalCount} carnet(s) utilisent ce template
                                        </p>
                                        <p style={{ margin: '6px 0 0', color: '#3b82f6', fontSize: 13 }}>
                                            Sélectionnez les carnets qui doivent recevoir les nouvelles modifications.
                                            Les données saisies par les enseignants seront préservées.
                                        </p>
                                        {versionsInUse.length > 1 && (
                                            <p style={{ margin: '8px 0 0', color: '#6366f1', fontSize: 13 }}>
                                                ℹ️ Versions actuellement utilisées: {versionsInUse.join(', ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quick actions */}
                            <div style={{
                                display: 'flex',
                                gap: 12,
                                marginBottom: 20
                            }}>
                                <button
                                    onClick={selectAll}
                                    style={{
                                        padding: '10px 20px',
                                        background: selectionMode === 'all' ? '#4f46e5' : '#f3f4f6',
                                        color: selectionMode === 'all' ? '#fff' : '#374151',
                                        border: 'none',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: 14,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    ✅ Tout sélectionner
                                </button>
                                <button
                                    onClick={selectNone}
                                    style={{
                                        padding: '10px 20px',
                                        background: selectionMode === 'none' ? '#4f46e5' : '#f3f4f6',
                                        color: selectionMode === 'none' ? '#fff' : '#374151',
                                        border: 'none',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: 14,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    ⬜ Aucun (garder versions actuelles)
                                </button>
                            </div>

                            {/* Selection summary */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 16,
                                padding: '10px 14px',
                                background: '#faf5ff',
                                borderRadius: 8,
                                border: '1px solid #e9d5ff'
                            }}>
                                <span style={{ fontSize: 14, color: '#7c3aed', fontWeight: 500 }}>
                                    📊 {selectedIds.size} sur {totalCount} carnet(s) sélectionné(s)
                                </span>
                            </div>

                            {/* Year/Class/Student tree */}
                            <div style={{ marginBottom: 20 }}>
                                {Object.entries(groupedByYear).map(([yearId, yearData]) => (
                                    <div key={yearId} style={{
                                        border: '1px solid #e5e7eb',
                                        borderRadius: 10,
                                        marginBottom: 12,
                                        overflow: 'hidden'
                                    }}>
                                        {/* Year header */}
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px 16px',
                                                background: '#f9fafb',
                                                cursor: 'pointer',
                                                borderBottom: expandedYears.has(yearId) ? '1px solid #e5e7eb' : 'none'
                                            }}
                                            onClick={() => toggleYear(yearId)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isYearSelected(yearId)}
                                                ref={(el) => {
                                                    if (el) el.indeterminate = isYearPartiallySelected(yearId)
                                                }}
                                                onChange={(e) => {
                                                    e.stopPropagation()
                                                    selectYear(yearId, !isYearSelected(yearId))
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ width: 18, height: 18, marginRight: 12, cursor: 'pointer' }}
                                            />
                                            <span style={{
                                                flex: 1,
                                                fontWeight: 600,
                                                color: '#111827',
                                                fontSize: 15
                                            }}>
                                                🗓️ {yearData.yearName || yearId}
                                            </span>
                                            <span style={{ fontSize: 12, color: '#6b7280', marginRight: 8 }}>
                                                {Object.values(yearData.classes).reduce((sum, c) => sum + c.assignments.length, 0)} élèves
                                            </span>
                                            <span style={{ fontSize: 18, color: '#9ca3af' }}>
                                                {expandedYears.has(yearId) ? '▼' : '▶'}
                                            </span>
                                        </div>

                                        {/* Classes */}
                                        {expandedYears.has(yearId) && (
                                            <div style={{ padding: '8px 0' }}>
                                                {Object.entries(yearData.classes).map(([classId, classData]) => {
                                                    const classKey = `${yearId}-${classId}`
                                                    return (
                                                        <div key={classId}>
                                                            {/* Class header */}
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    padding: '10px 16px 10px 32px',
                                                                    cursor: 'pointer',
                                                                    background: expandedClasses.has(classKey) ? '#f3f4f6' : 'transparent'
                                                                }}
                                                                onClick={() => toggleClass(classKey)}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isClassSelected(yearId, classId)}
                                                                    ref={(el) => {
                                                                        if (el) el.indeterminate = isClassPartiallySelected(yearId, classId)
                                                                    }}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation()
                                                                        selectClass(yearId, classId, !isClassSelected(yearId, classId))
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ width: 16, height: 16, marginRight: 10, cursor: 'pointer' }}
                                                                />
                                                                <span style={{
                                                                    flex: 1,
                                                                    fontWeight: 500,
                                                                    color: '#374151',
                                                                    fontSize: 14
                                                                }}>
                                                                    📚 {classData.className}
                                                                    {classData.level && (
                                                                        <span style={{
                                                                            marginLeft: 8,
                                                                            fontSize: 12,
                                                                            background: '#e0e7ff',
                                                                            color: '#3730a3',
                                                                            padding: '2px 8px',
                                                                            borderRadius: 10
                                                                        }}>
                                                                            {classData.level}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span style={{ fontSize: 12, color: '#9ca3af', marginRight: 8 }}>
                                                                    {classData.assignments.length} élève(s)
                                                                </span>
                                                                <span style={{ fontSize: 14, color: '#9ca3af' }}>
                                                                    {expandedClasses.has(classKey) ? '▼' : '▶'}
                                                                </span>
                                                            </div>

                                                            {/* Students */}
                                                            {expandedClasses.has(classKey) && (
                                                                <div style={{ padding: '4px 0' }}>
                                                                    {classData.assignments.map((assignment) => (
                                                                        <label
                                                                            key={assignment._id}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                padding: '8px 16px 8px 56px',
                                                                                cursor: 'pointer',
                                                                                background: selectedIds.has(assignment._id) ? '#f0fdf4' : 'transparent',
                                                                                transition: 'background 0.15s'
                                                                            }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.background = selectedIds.has(assignment._id) ? '#dcfce7' : '#f9fafb'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.background = selectedIds.has(assignment._id) ? '#f0fdf4' : 'transparent'}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedIds.has(assignment._id)}
                                                                                onChange={() => toggleAssignment(assignment._id)}
                                                                                style={{ width: 14, height: 14, marginRight: 10, cursor: 'pointer' }}
                                                                            />
                                                                            <span style={{
                                                                                flex: 1,
                                                                                color: '#4b5563',
                                                                                fontSize: 13
                                                                            }}>
                                                                                👤 {assignment.studentName}
                                                                            </span>
                                                                            <span style={{
                                                                                fontSize: 11,
                                                                                color: '#9ca3af',
                                                                                marginRight: 8
                                                                            }}>
                                                                                v{assignment.templateVersion}
                                                                            </span>
                                                                            {assignment.hasData && (
                                                                                <span style={{
                                                                                    fontSize: 10,
                                                                                    background: '#fef3c7',
                                                                                    color: '#92400e',
                                                                                    padding: '2px 6px',
                                                                                    borderRadius: 4,
                                                                                    marginRight: 8
                                                                                }}>
                                                                                    📝 Données
                                                                                </span>
                                                                            )}
                                                                            {getStatusBadge(assignment.status)}
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Change description */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#374151',
                                    marginBottom: 8
                                }}>
                                    📝 Description des modifications (optionnel)
                                </label>
                                <textarea
                                    value={changeDescription}
                                    onChange={(e) => setChangeDescription(e.target.value)}
                                    placeholder="Ex: Ajout des colonnes pour le 2ème semestre, correction du tableau d'évaluation..."
                                    style={{
                                        width: '100%',
                                        padding: 12,
                                        border: '1px solid #d1d5db',
                                        borderRadius: 8,
                                        resize: 'vertical',
                                        minHeight: 60,
                                        fontSize: 14,
                                        fontFamily: 'inherit',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 28px',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f9fafb',
                    borderRadius: '0 0 16px 16px'
                }}>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '12px 24px',
                            background: '#fff',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 14
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '12px 28px',
                            background: saving ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}
                    >
                        {saving ? (
                            <>
                                <span>⏳</span>
                                Sauvegarde en cours...
                            </>
                        ) : (
                            <>
                                <span>💾</span>
                                Sauvegarder {selectedIds.size > 0 ? `(${selectedIds.size} mise(s) à jour)` : '(aucune mise à jour)'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
