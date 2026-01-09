import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import ScrollToTopButton from '../components/ScrollToTopButton'
import Toast, { ToastType } from '../components/Toast'
import './TeacherQuickGrading.css'

type LanguageItem = {
    code: string
    label: string
    emoji?: string
    logo?: string
    active: boolean
    levels?: string[]
}

type TextRow = {
    blockId: string
    pageIndex: number
    blockIndex: number
    rowIndex?: number
    title?: string
    label: string
    level?: string
    items: LanguageItem[]
    isTableRow?: boolean
    tableBlockId?: string | null
    rowId?: string | null
}

type Student = {
    _id: string
    firstName: string
    lastName: string
    level?: string
    className?: string
}

type Assignment = {
    _id: string
    status: string
    data?: Record<string, any>
    dataVersion?: number
}

export default function TeacherQuickGrading() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [textRows, setTextRows] = useState<TextRow[]>([])
    const [dropdowns, setDropdowns] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
    const [savingItems, setSavingItems] = useState<Set<string>>(new Set())
    const [canEdit, setCanEdit] = useState(false)
    const [allowedLanguages, setAllowedLanguages] = useState<string[]>([])
    const [isProfPolyvalent, setIsProfPolyvalent] = useState(false)
    const [isMyWorkCompletedSem1, setIsMyWorkCompletedSem1] = useState(false)
    const [isMyWorkCompletedSem2, setIsMyWorkCompletedSem2] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)
    const [search, setSearch] = useState('')

    const { activeYear } = useSchoolYear()
    const socket = useSocket()

    // Extract text rows from template
    const extractTextRows = useCallback((template: any, assignmentData: any, studentLevel: string) => {
        const rows: TextRow[] = []
        const drops: any[] = []

        if (!template?.pages) return { rows, drops }

        template.pages.forEach((page: any, pageIdx: number) => {
            if (!page?.blocks) return

            const findClosestTitleText = (currentBlockIndex: number, currentY: number, currentX?: number) => {
                const blocks = page.blocks || []
                const candidates = blocks
                    .slice(0, Math.max(0, currentBlockIndex))
                    .filter((b: any) => b?.type === 'text' && b?.props && typeof b.props.text === 'string')
                    .map((b: any) => ({
                        text: (b.props.text || '').trim(),
                        x: typeof b.props.x === 'number' ? b.props.x : Number(b.props.x ?? 0),
                        y: typeof b.props.y === 'number' ? b.props.y : Number(b.props.y ?? 0),
                        fontSize: typeof b.props.fontSize === 'number' ? b.props.fontSize : Number(b.props.fontSize ?? 0)
                    }))
                    .filter((t: any) => {
                        if (!t.text) return false
                        const lower = t.text.toLowerCase()
                        if (lower === 'titre' || lower === 'title') return false
                        if (!(t.y <= currentY)) return false
                        if (typeof currentX === 'number' && Number.isFinite(currentX) && Number.isFinite(t.x)) {
                            if (Math.abs(t.x - currentX) > 600) return false
                        }
                        return true
                    })

                const nearby = candidates.filter((t: any) => t.fontSize >= 14 && (currentY - t.y) <= 700)
                const pool = nearby.length > 0 ? nearby : candidates
                if (pool.length === 0) return ''

                const best = pool.reduce((acc: any, cur: any) => (cur.y > acc.y ? cur : acc), pool[0])
                return best?.text || ''
            }

            page.blocks.forEach((block: any, blockIdx: number) => {
                if (!block?.props) return

                // Extract standalone language toggles
                if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    const blockId = block.props.blockId || `${pageIdx}_${blockIdx}`
                    const blockLevel = block.props.level

                    // Skip if block has a specific level that doesn't match student
                    if (blockLevel && studentLevel && blockLevel !== studentLevel) return

                    const dataKey = block.props.blockId
                        ? `language_toggle_${block.props.blockId}`
                        : `language_toggle_${pageIdx}_${blockIdx}`

                    const savedItems = assignmentData?.[dataKey]
                    const sourceItems = block.props.items || []

                    const items: LanguageItem[] = sourceItems.map((item: any, i: number) => ({
                        ...item,
                        active: savedItems?.[i]?.active ?? item.active ?? false
                    }))

                    // Filter items by student level if they have level restrictions
                    const filteredItems = items.filter(item =>
                        !item.levels || item.levels.length === 0 || (studentLevel && item.levels.includes(studentLevel))
                    )

                    if (filteredItems.length > 0) {
                        const blockY = typeof block.props.y === 'number' ? block.props.y : Number(block.props.y ?? 0)
                        const blockX = typeof block.props.x === 'number' ? block.props.x : Number(block.props.x ?? 0)
                        const titleText = findClosestTitleText(blockIdx, blockY, blockX)
                        const baseLabel = block.props.label || `Texte ${rows.length + 1}`

                        rows.push({
                            blockId,
                            pageIndex: pageIdx,
                            blockIndex: blockIdx,
                            title: titleText || undefined,
                            label: baseLabel,
                            level: blockLevel,
                            items: filteredItems
                        })
                    }
                }

                // Extract expanded table rows with language toggles
                if (block.type === 'table' && block.props.expandedRows) {
                    const cells = block.props.cells || []
                    const expandedLanguages = block.props.expandedLanguages || []
                    const rowLanguages = block.props.rowLanguages || {}
                    const rowIds = Array.isArray(block.props.rowIds) ? block.props.rowIds : []
                    const tableBlockId = typeof block.props.blockId === 'string' && block.props.blockId.trim()
                        ? block.props.blockId.trim()
                        : null
                    const tableLevel = block.props.level
                    const tableY = typeof block.props.y === 'number' ? block.props.y : Number(block.props.y ?? 0)
                    const tableX = typeof block.props.x === 'number' ? block.props.x : Number(block.props.x ?? 0)

                    // First, try to find the linked gradebook_pocket title block
                    let tableTitleText = ''
                    const titleBlockId = block.props.titleBlockId
                    if (titleBlockId) {
                        const linkedTitleBlock = page.blocks.find((b: any) => b?.props?.blockId === titleBlockId)
                        if (linkedTitleBlock && linkedTitleBlock.type === 'gradebook_pocket') {
                            tableTitleText = linkedTitleBlock.props?.number || ''
                        }
                    }
                    // Fall back to expandedTitleText property on the table
                    if (!tableTitleText && block.props.expandedTitleText) {
                        tableTitleText = block.props.expandedTitleText
                    }
                    // Finally fall back to searching for nearby text blocks
                    if (!tableTitleText) {
                        tableTitleText = findClosestTitleText(blockIdx, tableY, tableX)
                    }

                    // Skip if table has a specific level that doesn't match student
                    if (tableLevel && studentLevel && tableLevel !== studentLevel) return

                    cells.forEach((row: any[], rowIdx: number) => {
                        // Get the row label from the first cell
                        const firstCell = row[0]
                        const rowLabel = firstCell?.text || firstCell?.value || `Ligne ${rowIdx + 1}`

                        // Get row-specific languages or fall back to table-level languages
                        const rowLangs = rowLanguages[rowIdx] || expandedLanguages
                        if (!Array.isArray(rowLangs) || rowLangs.length === 0) return

                        // Build the data key for this row
                        const rowId = typeof rowIds[rowIdx] === 'string' && rowIds[rowIdx].trim()
                            ? rowIds[rowIdx].trim()
                            : null
                        const toggleKeyStable = tableBlockId && rowId
                            ? `table_${tableBlockId}_row_${rowId}`
                            : null
                        const toggleKeyLegacy = `table_${pageIdx}_${blockIdx}_row_${rowIdx}`
                        const dataKey = toggleKeyStable || toggleKeyLegacy

                        // Get saved items or use source
                        const savedItems = toggleKeyStable
                            ? (assignmentData?.[toggleKeyStable] || assignmentData?.[toggleKeyLegacy])
                            : assignmentData?.[toggleKeyLegacy]

                        const items: LanguageItem[] = rowLangs.map((lang: any, i: number) => ({
                            ...lang,
                            active: savedItems?.[i]?.active ?? lang.active ?? false
                        }))

                        // Filter items by student level if they have level restrictions (check both level and levels)
                        const filteredItems = items.filter(item => {
                            const itemLevel = (item as any).level
                            const itemLevels = item.levels
                            if (itemLevel && studentLevel && itemLevel !== studentLevel) return false
                            if (itemLevels && itemLevels.length > 0 && studentLevel && !itemLevels.includes(studentLevel)) return false
                            return true
                        })

                        if (filteredItems.length > 0) {
                            rows.push({
                                blockId: dataKey,
                                pageIndex: pageIdx,
                                blockIndex: blockIdx,
                                rowIndex: rowIdx,
                                title: tableTitleText || undefined,
                                label: rowLabel,
                                level: tableLevel,
                                items: filteredItems,
                                isTableRow: true,
                                tableBlockId,
                                rowId
                            } as any)
                        }
                    })
                }

                // Extract dropdowns for prof polyvalent
                if (block.type === 'dropdown') {
                    const dropdownSemesters = block.props.semesters || [1, 2]
                    const dropdownLevels = block.props.levels || []

                    // Check level match
                    if (dropdownLevels.length > 0 && studentLevel && !dropdownLevels.includes(studentLevel)) return

                    const dataKey = block.props.dropdownNumber
                        ? `dropdown_${block.props.dropdownNumber}`
                        : block.props.variableName || `dropdown_${pageIdx}_${blockIdx}`

                    drops.push({
                        blockId: `dropdown_${pageIdx}_${blockIdx}`,
                        pageIndex: pageIdx,
                        blockIndex: blockIdx,
                        label: block.props.label || `Dropdown ${block.props.dropdownNumber || ''}`,
                        options: block.props.options || [],
                        dataKey,
                        semesters: dropdownSemesters,
                        currentValue: assignmentData?.[dataKey] || ''
                    })
                }
            })
        })

        return { rows, drops }
    }, [])


    // Load data
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/teacher/template-assignments/${assignmentId}`)

                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setCanEdit(r.data.canEdit)
                setAllowedLanguages(r.data.allowedLanguages || [])
                setIsProfPolyvalent(r.data.isProfPolyvalent || false)
                setIsMyWorkCompletedSem1(r.data.isMyWorkCompletedSem1 || false)
                setIsMyWorkCompletedSem2(r.data.isMyWorkCompletedSem2 || false)
                setActiveSemester(r.data.activeSemester || 1)

                const { rows, drops } = extractTextRows(
                    r.data.template,
                    r.data.assignment?.data,
                    r.data.student?.level || ''
                )
                setTextRows(rows)
                setDropdowns(drops)
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId, extractTextRows])

    // Socket updates
    useEffect(() => {
        if (assignmentId && socket) {
            const roomId = `assignment:${assignmentId}`
            socket.emit('join-room', roomId)

            const handleUpdate = (payload: any) => {
                if (payload.type === 'language-toggle') {
                    setTextRows(prev => prev.map(row => {
                        if (!row.isTableRow && row.pageIndex === payload.pageIndex && row.blockIndex === payload.blockIndex) {
                            return { ...row, items: payload.items }
                        }
                        return row
                    }))
                }

                if (payload.type === 'assignment-data') {
                    if (payload.assignmentId && payload.assignmentId !== assignment?._id) return
                    setAssignment(prev => prev ? { ...prev, data: { ...(prev.data || {}), ...payload.data } } : prev)

                    // Update table rows if their data key is in the payload
                    setTextRows(prev => prev.map(row => {
                        if (row.isTableRow && payload.data?.[row.blockId]) {
                            return { ...row, items: payload.data[row.blockId] }
                        }
                        return row
                    }))

                    // Update dropdowns
                    setDropdowns(prev => prev.map(d => {
                        if (payload.data?.[d.dataKey] !== undefined) {
                            return { ...d, currentValue: payload.data[d.dataKey] }
                        }
                        return d
                    }))
                }
            }

            socket.on('update-received', handleUpdate)

            return () => {
                socket.emit('leave-room', roomId)
                socket.off('update-received', handleUpdate)
            }
        }
    }, [assignmentId, socket, assignment?._id])

    // Check if language is allowed for teacher
    const isLanguageAllowed = useCallback((code: string) => {
        const c = (code || '').toLowerCase()
        if (isProfPolyvalent) return c === 'fr'
        if (allowedLanguages.length === 0) return true
        if (allowedLanguages.includes(c)) return true
        if ((c === 'lb' || c === 'ar') && allowedLanguages.includes('ar')) return true
        if ((c === 'uk' || c === 'gb') && allowedLanguages.includes('en')) return true
        return false
    }, [isProfPolyvalent, allowedLanguages])

    // Toggle language
    const toggleLanguage = async (row: TextRow, itemIndex: number) => {
        if (!canEdit) return

        const item = row.items[itemIndex]
        if (!isLanguageAllowed(item.code)) return

        const savingKey = `${row.blockId}_${itemIndex}`
        setSavingItems(prev => new Set(prev).add(savingKey))

        try {
            const newItems = row.items.map((it, i) =>
                i === itemIndex ? { ...it, active: !it.active } : it
            )

            // Optimistic update
            setTextRows(prev => prev.map(r =>
                r.blockId === row.blockId ? { ...r, items: newItems } : r
            ))

            // For table rows, use the /data endpoint
            if (row.isTableRow) {
                const dataKey = row.blockId // blockId is already the data key for table rows
                await api.patch(`/teacher/template-assignments/${assignmentId}/data`, {
                    data: { [dataKey]: newItems }
                })

                // Broadcast via socket
                if (socket) {
                    socket.emit('broadcast-update', {
                        roomId: `assignment:${assignmentId}`,
                        payload: {
                            type: 'assignment-data',
                            assignmentId,
                            data: { [dataKey]: newItems }
                        }
                    })
                }
            } else {
                // For standalone language toggles, use the /language-toggle endpoint
                const payload: any = {
                    pageIndex: row.pageIndex,
                    blockIndex: row.blockIndex,
                    blockId: row.blockId,
                    items: newItems
                }

                if (assignment?.dataVersion) {
                    payload.expectedDataVersion = assignment.dataVersion
                }

                const res = await api.patch(
                    `/teacher/template-assignments/${assignmentId}/language-toggle`,
                    payload
                )

                // Update dataVersion
                if (res.data?.dataVersion) {
                    setAssignment(prev => prev ? { ...prev, dataVersion: res.data.dataVersion } : prev)
                }

                // Broadcast via socket
                if (socket) {
                    socket.emit('broadcast-update', {
                        roomId: `assignment:${assignmentId}`,
                        payload: {
                            type: 'language-toggle',
                            pageIndex: row.pageIndex,
                            blockIndex: row.blockIndex,
                            items: newItems,
                            changeId: res.data?.changeId,
                            dataVersion: res.data?.dataVersion
                        }
                    })
                }
            }
        } catch (e: any) {
            // Revert on error
            setTextRows(prev => prev.map(r =>
                r.blockId === row.blockId ? { ...r, items: row.items } : r
            ))

            if (e?.response?.status === 409) {
                setToast({ message: 'Conflit détecté. Rechargez la page.', type: 'error' })
            } else {
                setToast({ message: 'Erreur lors de la sauvegarde', type: 'error' })
            }
        } finally {
            setSavingItems(prev => {
                const next = new Set(prev)
                next.delete(savingKey)
                return next
            })
        }
    }

    // Update dropdown
    const updateDropdown = async (dropdown: any, value: string) => {
        if (!canEdit || !isProfPolyvalent) return

        try {
            const newData = { [dropdown.dataKey]: value }

            // Optimistic update
            setDropdowns(prev => prev.map(d =>
                d.blockId === dropdown.blockId ? { ...d, currentValue: value } : d
            ))

            await api.patch(`/teacher/template-assignments/${assignmentId}/data`, { data: newData })

            // Broadcast via socket
            if (socket) {
                socket.emit('broadcast-update', {
                    roomId: `assignment:${assignmentId}`,
                    payload: {
                        type: 'assignment-data',
                        assignmentId,
                        data: newData
                    }
                })
            }

            setToast({ message: 'Enregistré', type: 'success' })
        } catch (e: any) {
            setToast({ message: 'Erreur lors de la sauvegarde', type: 'error' })
        }
    }

    // Toggle completion
    const toggleCompletionSem = async (semester: number) => {
        if (!assignment) return

        try {
            const isCompleted = semester === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2
            const action = isCompleted ? 'unmark-done' : 'mark-done'

            const r = await api.post(`/teacher/templates/${assignmentId}/${action}`, { semester })
            setAssignment(r.data)

            if (semester === 1) {
                setIsMyWorkCompletedSem1(!isCompleted)
            } else {
                setIsMyWorkCompletedSem2(!isCompleted)
            }

            setToast({
                message: !isCompleted ? 'Semestre marqué comme terminé' : 'Semestre rouvert',
                type: 'success'
            })
        } catch (e: any) {
            setToast({ message: 'Erreur lors de la mise à jour', type: 'error' })
        }
    }

    // Get emoji for language
    const getEmoji = (item: LanguageItem) => {
        if (item.emoji && item.emoji.length >= 2) return item.emoji
        const c = (item.code || '').toLowerCase()
        if (c === 'lb' || c === 'ar') return '🇱🇧'
        if (c === 'fr') return '🇫🇷'
        if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
        return '🏳️'
    }

    // Filter and search
    const filteredRows = useMemo(() => {
        let result = textRows

        // Search only
        if (search.trim()) {
            const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            result = result.filter(row =>
                row.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
            )
        }

        return result
    }, [textRows, search])

    // Filtered dropdowns by semester
    const filteredDropdowns = useMemo(() => {
        return dropdowns.filter(d => d.semesters.includes(activeSemester))
    }, [dropdowns, activeSemester])

    if (loading) {
        return (
            <div className="container">
                <div className="card">
                    <div className="note" style={{ textAlign: 'center', padding: 40 }}>
                        Chargement...
                    </div>
                </div>
            </div>
        )
    }

    if (error && !student) {
        return (
            <div className="container">
                <div className="card">
                    <div className="note" style={{ color: 'crimson', textAlign: 'center', padding: 40 }}>
                        {error}
                    </div>
                </div>
            </div>
        )
    }


    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <ScrollToTopButton />
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            <div className="card" style={{ marginBottom: 24 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                    <button
                        className="btn secondary"
                        onClick={() => window.history.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#f1f5f9',
                            color: '#475569',
                            fontWeight: 500,
                            border: '1px solid #e2e8f0',
                            padding: '10px 16px',
                            borderRadius: 8
                        }}
                    >
                        ← Retour
                    </button>

                    <Link
                        to={`/teacher/templates/${assignmentId}/edit`}
                        className="btn secondary"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#e0e7ff',
                            color: '#4338ca',
                            fontWeight: 500,
                            border: '1px solid #c7d2fe',
                            padding: '10px 16px',
                            borderRadius: 8,
                            textDecoration: 'none'
                        }}
                    >
                        📄 Vue complète
                    </Link>

                    <div style={{ flex: 1 }} />

                    {canEdit && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                className="btn"
                                onClick={() => toggleCompletionSem(1)}
                                disabled={activeSemester !== 1}
                                style={{
                                    padding: '10px 16px',
                                    fontSize: 14,
                                    background: activeSemester !== 1 ? '#e2e8f0' : (isMyWorkCompletedSem1 ? '#fff' : '#10b981'),
                                    color: activeSemester !== 1 ? '#94a3b8' : (isMyWorkCompletedSem1 ? '#ef4444' : '#fff'),
                                    border: activeSemester !== 1 ? '1px solid #cbd5e1' : (isMyWorkCompletedSem1 ? '1px solid #ef4444' : 'none'),
                                    cursor: activeSemester !== 1 ? 'not-allowed' : 'pointer',
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    opacity: activeSemester !== 1 ? 0.7 : 1
                                }}
                            >
                                {isMyWorkCompletedSem1 ? '❌ Rouvrir S1' : '✅ Terminer S1'}
                            </button>
                            <button
                                className="btn"
                                onClick={() => toggleCompletionSem(2)}
                                disabled={activeSemester !== 2}
                                style={{
                                    padding: '10px 16px',
                                    fontSize: 14,
                                    background: activeSemester !== 2 ? '#e2e8f0' : (isMyWorkCompletedSem2 ? '#fff' : '#10b981'),
                                    color: activeSemester !== 2 ? '#94a3b8' : (isMyWorkCompletedSem2 ? '#ef4444' : '#fff'),
                                    border: activeSemester !== 2 ? '1px solid #cbd5e1' : (isMyWorkCompletedSem2 ? '1px solid #ef4444' : 'none'),
                                    cursor: activeSemester !== 2 ? 'not-allowed' : 'pointer',
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    opacity: activeSemester !== 2 ? 0.7 : 1
                                }}
                            >
                                {isMyWorkCompletedSem2 ? '❌ Rouvrir S2' : '✅ Terminer S2'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Student Info */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{
                        fontSize: 24,
                        margin: 0,
                        color: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap'
                    }}>
                        <span>⚡ Notation rapide</span>
                        <span style={{ color: '#6c5ce7' }}>
                            {student?.firstName} {student?.lastName}
                        </span>
                        {student?.level && (
                            <span style={{
                                fontSize: 14,
                                background: '#e0e7ff',
                                color: '#4338ca',
                                padding: '4px 12px',
                                borderRadius: 16,
                                fontWeight: 600
                            }}>
                                {student.level}
                            </span>
                        )}
                        {student?.className && (
                            <span style={{
                                fontSize: 14,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '4px 12px',
                                borderRadius: 16,
                                fontWeight: 600
                            }}>
                                {student.className}
                            </span>
                        )}
                        <span style={{
                            fontSize: 14,
                            background: activeSemester === 2 ? '#dbeafe' : '#fef3c7',
                            color: activeSemester === 2 ? '#1e40af' : '#92400e',
                            padding: '4px 12px',
                            borderRadius: 16,
                            fontWeight: 700,
                            border: `1px solid ${activeSemester === 2 ? '#93c5fd' : '#fcd34d'}`
                        }}>
                            S{activeSemester}
                        </span>
                    </h2>
                    <p style={{ color: '#64748b', marginTop: 8, fontSize: 14 }}>
                        Cliquez sur les drapeaux pour activer/désactiver les langues pour chaque texte.
                        {isProfPolyvalent && ' (Prof polyvalent: Français uniquement)'}
                    </p>
                </div>

                {/* Search */}
                <div style={{
                    marginBottom: 24
                }}>
                    <input
                        type="text"
                        placeholder="🔎 Rechercher un texte..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            maxWidth: 400,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            outline: 'none'
                        }}
                    />
                </div>


                {/* Dropdowns for Prof Polyvalent */}
                {isProfPolyvalent && filteredDropdowns.length > 0 && (
                    <div style={{
                        marginBottom: 24,
                        padding: 16,
                        background: '#fef3c7',
                        borderRadius: 12,
                        border: '1px solid #fcd34d'
                    }}>
                        <h3 style={{ fontSize: 16, color: '#92400e', marginBottom: 12, fontWeight: 600 }}>
                            📝 Champs supplémentaires (Prof Polyvalent)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                            {filteredDropdowns.map(dropdown => (
                                <div key={dropdown.blockId}>
                                    <label style={{ fontSize: 13, color: '#78350f', fontWeight: 500, marginBottom: 4, display: 'block' }}>
                                        {dropdown.label}
                                    </label>
                                    <select
                                        value={dropdown.currentValue}
                                        onChange={e => updateDropdown(dropdown, e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid #fcd34d',
                                            fontSize: 14,
                                            background: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Sélectionner...</option>
                                        {dropdown.options.map((opt: string, i: number) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Text Rows Table */}
                <div style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{
                                    padding: '14px 16px',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#475569',
                                    borderBottom: '2px solid #e2e8f0',
                                    width: 80
                                }}>
                                    Titre
                                </th>
                                <th style={{
                                    padding: '14px 16px',
                                    textAlign: 'left',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#475569',
                                    borderBottom: '2px solid #e2e8f0'
                                }}>
                                    Texte
                                </th>
                                <th style={{
                                    padding: '14px 16px',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#475569',
                                    borderBottom: '2px solid #e2e8f0',
                                    width: 200
                                }}>
                                    Langues
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{
                                        padding: 40,
                                        textAlign: 'center',
                                        color: '#94a3b8',
                                        fontSize: 14
                                    }}>
                                        {search.trim()
                                            ? 'Aucun texte ne correspond à la recherche.'
                                            : 'Aucun texte trouvé pour ce niveau.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, idx) => {
                                    return (
                                        <tr
                                            key={row.blockId}
                                            style={{
                                                background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#f8fafc'}
                                        >
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #e2e8f0',
                                                textAlign: 'center',
                                                verticalAlign: 'middle'
                                            }}>
                                                {row.title && (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: 36,
                                                        height: 36,
                                                        borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                                                        color: '#fff',
                                                        fontWeight: 700,
                                                        fontSize: 14,
                                                        boxShadow: '0 2px 6px rgba(108, 92, 231, 0.3)'
                                                    }}>
                                                        {row.title}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #e2e8f0',
                                                fontSize: 14,
                                                color: '#1e293b'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontWeight: 500 }}>{row.label}</span>
                                                    {row.level && (
                                                        <span style={{
                                                            fontSize: 11,
                                                            background: '#e0e7ff',
                                                            color: '#4338ca',
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            fontWeight: 600
                                                        }}>
                                                            {row.level}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #e2e8f0',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    gap: 8
                                                }}>
                                                    {row.items.map((item, i) => {
                                                        const allowed = isLanguageAllowed(item.code)
                                                        const isSaving = savingItems.has(`${row.blockId}_${i}`)
                                                        const emoji = getEmoji(item)
                                                        const emojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`

                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={() => toggleLanguage(row, i)}
                                                                disabled={!canEdit || !allowed || isSaving}
                                                                title={`${item.label || item.code}${!allowed ? ' (non autorisé)' : ''}`}
                                                                style={{
                                                                    width: 44,
                                                                    height: 44,
                                                                    borderRadius: '50%',
                                                                    border: item.active ? '3px solid #6c5ce7' : '2px solid #e2e8f0',
                                                                    background: item.active ? '#f0f4ff' : '#fff',
                                                                    cursor: canEdit && allowed ? 'pointer' : 'not-allowed',
                                                                    opacity: allowed ? 1 : 0.4,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    transition: 'all 0.2s ease',
                                                                    transform: item.active ? 'scale(1.1)' : 'scale(1)',
                                                                    boxShadow: item.active ? '0 2px 8px rgba(108, 92, 231, 0.3)' : 'none',
                                                                    position: 'relative'
                                                                }}
                                                            >
                                                                {isSaving ? (
                                                                    <span style={{ fontSize: 16 }}>⏳</span>
                                                                ) : (
                                                                    <img
                                                                        src={emojiUrl}
                                                                        alt={item.label || item.code}
                                                                        style={{
                                                                            width: 28,
                                                                            height: 28,
                                                                            objectFit: 'contain',
                                                                            filter: item.active ? 'none' : 'grayscale(50%)'
                                                                        }}
                                                                    />
                                                                )}
                                                                {item.active && (
                                                                    <span style={{
                                                                        position: 'absolute',
                                                                        bottom: -2,
                                                                        right: -2,
                                                                        background: '#10b981',
                                                                        color: 'white',
                                                                        borderRadius: '50%',
                                                                        width: 16,
                                                                        height: 16,
                                                                        fontSize: 10,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: 'bold'
                                                                    }}>
                                                                        ✓
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Legend */}
                <div style={{
                    marginTop: 24,
                    padding: 16,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0'
                }}>
                    <h4 style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                        Légende des langues
                    </h4>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                            <img src="https://emojicdn.elk.sh/🇫🇷?style=apple" alt="FR" style={{ width: 20, height: 20 }} />
                            Français (Polyvalent)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                            <img src="https://emojicdn.elk.sh/🇱🇧?style=apple" alt="AR" style={{ width: 20, height: 20 }} />
                            Arabe
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                            <img src="https://emojicdn.elk.sh/🇬🇧?style=apple" alt="EN" style={{ width: 20, height: 20 }} />
                            Anglais
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
