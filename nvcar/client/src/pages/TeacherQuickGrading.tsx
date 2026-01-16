import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useLevels } from '../context/LevelContext'
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
    sourceIndex?: number // Original index in source items array
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
    sourceItems?: LanguageItem[] // All source items (unfiltered) for correct saving
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
    languageCompletions?: {
        code: string
        completed?: boolean
        completedSem1?: boolean
        completedSem2?: boolean
    }[]
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
    const [completionLanguages, setCompletionLanguages] = useState<string[]>([])
    const [languageCompletion, setLanguageCompletion] = useState<Record<string, { completed?: boolean; completedSem1?: boolean; completedSem2?: boolean }>>({})
    const [isMyWorkCompletedSem1, setIsMyWorkCompletedSem1] = useState(false)
    const [isMyWorkCompletedSem2, setIsMyWorkCompletedSem2] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)
    const [search, setSearch] = useState('')

    const { activeYear } = useSchoolYear()
    const socket = useSocket()
    const { levels } = useLevels()

    const isActiveSemesterCompleted = activeSemester === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2
    const canEditActiveSemester = canEdit && !isActiveSemesterCompleted

    // Helper function to check if an item's level is at or below the student's current level
    // This allows teachers to edit toggles for PS, MS, GS based on student's current level
    // PS students: can only edit PS toggles
    // MS students: can edit PS and MS toggles
    // GS students: can edit PS, MS, and GS toggles
    const isLevelAtOrBelow = useCallback((itemLevel: string | undefined, itemLevels: string[] | undefined, studentLevel: string) => {
        if (!studentLevel) return true

        // Create a map of level name to order
        const levelOrderMap: Record<string, number> = {}
        levels.forEach(l => { levelOrderMap[l.name.toUpperCase()] = l.order })

        const studentOrder = levelOrderMap[studentLevel.toUpperCase()]
        if (studentOrder === undefined) return true // Unknown level, allow

        // Check single level property
        if (itemLevel) {
            const itemOrder = levelOrderMap[itemLevel.toUpperCase()]
            if (itemOrder === undefined) return true // Unknown item level, allow
            return itemOrder <= studentOrder
        }

        // Check levels array - item is accessible if ANY of its levels are at or below student level
        if (itemLevels && itemLevels.length > 0) {
            return itemLevels.some(lvl => {
                const itemOrder = levelOrderMap[lvl.toUpperCase()]
                if (itemOrder === undefined) return true // Unknown item level, allow
                return itemOrder <= studentOrder
            })
        }

        // No level restrictions, allow
        return true
    }, [levels])

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
                    const sourceItemsRaw = block.props.items || []

                    // Build items with source indices for proper saving later
                    const allItems: LanguageItem[] = sourceItemsRaw.map((item: any, i: number) => ({
                        ...item,
                        active: savedItems?.[i]?.active ?? item.active ?? false,
                        sourceIndex: i
                    }))

                    // Filter items by student level - show items at or below student's current level
                    const filteredItems = allItems.filter(item =>
                        isLevelAtOrBelow(undefined, item.levels, studentLevel)
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
                            items: filteredItems,
                            sourceItems: allItems // Store all items for correct saving
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

                        // Build items with source indices for proper saving later
                        const allItems: LanguageItem[] = rowLangs.map((lang: any, i: number) => ({
                            ...lang,
                            active: savedItems?.[i]?.active ?? lang.active ?? false,
                            sourceIndex: i
                        }))

                        // Filter items by student level - show items at or below student's current level
                        const filteredItems = allItems.filter(item => {
                            const itemLevel = (item as any).level
                            const itemLevels = item.levels
                            return isLevelAtOrBelow(itemLevel, itemLevels, studentLevel)
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
                                sourceItems: allItems, // Store all items for correct saving
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
                    const dropdownLevels: string[] = block.props.levels || []

                    // For dropdowns: ONLY show if it's exclusively for the student's current level
                    // (not shared with other levels like language toggles)
                    // This means: levels must be empty (no restriction) OR contain ONLY the student's current level
                    if (dropdownLevels.length > 0 && studentLevel) {
                        const studentLevelUpper = studentLevel.toUpperCase()
                        const levelsUpper = dropdownLevels.map((l: string) => l.toUpperCase())

                        // Dropdown must be EXCLUSIVELY for the student's current level
                        // i.e., levels array should only contain the student's level
                        const isExclusivelyForCurrentLevel = levelsUpper.length === 1 && levelsUpper[0] === studentLevelUpper
                        if (!isExclusivelyForCurrentLevel) return
                    }

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
                        levels: dropdownLevels, // Store levels for filtering
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
                setCompletionLanguages(r.data.completionLanguages || [])
                setLanguageCompletion(r.data.languageCompletion || buildLanguageCompletionMap(r.data.assignment))
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
        if (!canEditActiveSemester) return

        const item = row.items[itemIndex]
        if (!isLanguageAllowed(item.code)) return

        const savingKey = `${row.blockId}_${itemIndex}`
        setSavingItems(prev => new Set(prev).add(savingKey))

        try {
            // Update the filtered items for display
            const newFilteredItems = row.items.map((it, i) =>
                i === itemIndex ? { ...it, active: !it.active } : it
            )

            // Build the full source items array with the updated item at its correct position
            // This ensures we save all items with correct indices, not just the filtered ones
            const sourceItems = row.sourceItems || row.items
            const itemToToggle = row.items[itemIndex]
            const sourceIndex = itemToToggle.sourceIndex

            const newSourceItems = sourceItems.map((it, i) => {
                if (sourceIndex !== undefined && i === sourceIndex) {
                    return { ...it, active: !it.active }
                }
                // Also check by matching the item if sourceIndex is not available
                if (sourceIndex === undefined && it.code === itemToToggle.code) {
                    return { ...it, active: !it.active }
                }
                return it
            })

            // Optimistic update for display
            setTextRows(prev => prev.map(r =>
                r.blockId === row.blockId ? { ...r, items: newFilteredItems, sourceItems: newSourceItems } : r
            ))

            // For table rows, use the /data endpoint
            if (row.isTableRow) {
                const dataKey = row.blockId // blockId is already the data key for table rows
                await api.patch(`/teacher/template-assignments/${assignmentId}/data`, {
                    data: { [dataKey]: newSourceItems }
                })

                // Broadcast via socket
                if (socket) {
                    socket.emit('broadcast-update', {
                        roomId: `assignment:${assignmentId}`,
                        payload: {
                            type: 'assignment-data',
                            assignmentId,
                            data: { [dataKey]: newSourceItems }
                        }
                    })
                }
            } else {
                // For standalone language toggles, use the /language-toggle endpoint
                const payload: any = {
                    pageIndex: row.pageIndex,
                    blockIndex: row.blockIndex,
                    blockId: row.blockId,
                    items: newSourceItems
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
                            items: newSourceItems,
                            changeId: res.data?.changeId,
                            dataVersion: res.data?.dataVersion
                        }
                    })
                }
            }
        } catch (e: any) {
            // Revert on error
            setTextRows(prev => prev.map(r =>
                r.blockId === row.blockId ? { ...r, items: row.items, sourceItems: row.sourceItems } : r
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
        if (!canEditActiveSemester || (!isProfPolyvalent && allowedLanguages.length > 0)) return

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

    const normalizeLanguageCode = (code?: string) => {
        const c = (code || '').toLowerCase()
        if (!c) return ''
        if (c === 'lb' || c === 'ar') return 'ar'
        if (c === 'en' || c === 'uk' || c === 'gb') return 'en'
        if (c === 'fr') return 'fr'
        return c
    }

    const getLanguageLabel = (code?: string) => {
        const c = normalizeLanguageCode(code)
        if (c === 'ar') return 'Arabe'
        if (c === 'en') return 'Anglais'
        if (c === 'fr') return 'Polyvalent'
        return code || 'Langue'
    }

    const buildLanguageCompletionMap = (assignmentValue?: Assignment | null) => {
        const map: Record<string, { completed?: boolean; completedSem1?: boolean; completedSem2?: boolean }> = {}
        const entries = assignmentValue?.languageCompletions || []
        entries.forEach(entry => {
            const code = normalizeLanguageCode(entry.code)
            if (!code) return
            map[code] = {
                completed: entry.completed,
                completedSem1: entry.completedSem1,
                completedSem2: entry.completedSem2
            }
        })
        return map
    }

    const isLanguageCompletedForSemester = (semester: number, code: string) => {
        const entry = languageCompletion[normalizeLanguageCode(code)]
        if (!entry) return false
        if (semester === 1) return !!(entry.completedSem1 || entry.completed)
        return !!entry.completedSem2
    }

    const areAllLanguagesCompleted = (
        semester: number,
        mapOverride?: Record<string, { completed?: boolean; completedSem1?: boolean; completedSem2?: boolean }>,
        languagesOverride?: string[]
    ) => {
        const map = mapOverride || languageCompletion
        const langs = (languagesOverride && languagesOverride.length > 0) ? languagesOverride : completionLanguages
        if (langs.length === 0) return false
        return langs.every(code => {
            const entry = map[normalizeLanguageCode(code)]
            if (!entry) return false
            if (semester === 1) return !!(entry.completedSem1 || entry.completed)
            return !!entry.completedSem2
        })
    }

    // Toggle completion
    const toggleCompletionSem = async (semester: number, languages?: string[]) => {
        if (!assignment) return

        try {
            const targetLanguages = (languages && languages.length > 0) ? languages : completionLanguages
            const isCompleted = targetLanguages.length > 0
                ? targetLanguages.every(code => isLanguageCompletedForSemester(semester, code))
                : (semester === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2)
            const action = isCompleted ? 'unmark-done' : 'mark-done'

            const r = await api.post(`/teacher/templates/${assignmentId}/${action}`, { semester, languages: targetLanguages })
            setAssignment(r.data)

            const nextMap = buildLanguageCompletionMap(r.data)
            setLanguageCompletion(nextMap)
            if (completionLanguages.length === 0 && targetLanguages.length > 0) {
                setCompletionLanguages(targetLanguages.map(normalizeLanguageCode).filter(Boolean))
            }

            const nextSem1 = areAllLanguagesCompleted(1, nextMap, targetLanguages)
            const nextSem2 = areAllLanguagesCompleted(2, nextMap, targetLanguages)

            if (semester === 1) {
                setIsMyWorkCompletedSem1(nextSem1)
            } else {
                setIsMyWorkCompletedSem2(nextSem2)
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

        // Sort by title using natural/alphanumeric sorting (handles numbers properly)
        result = [...result].sort((a, b) => {
            const titleA = (a.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            const titleB = (b.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            // Items without title go to the end
            if (!titleA && titleB) return 1
            if (titleA && !titleB) return -1
            // Use numeric collation so "o2" comes before "o10"
            return titleA.localeCompare(titleB, 'fr', { numeric: true, sensitivity: 'base' })
        })

        return result
    }, [textRows, search])

    // Filtered dropdowns by semester AND exact current level only
    // Teachers can only edit dropdowns for the student's EXACT current level (not previous levels)
    // Unlike language toggles, dropdowns are restricted to the current level only
    const filteredDropdowns = useMemo(() => {
        const studentLevel = student?.level || ''
        const studentLevelUpper = studentLevel.toUpperCase()

        return dropdowns.filter(d => {
            // Must match active semester
            if (!d.semesters.includes(activeSemester)) return false

            // For dropdowns with level restrictions:
            // Only show if the dropdown is EXCLUSIVELY for the student's current level
            // (dropdowns with levels: ['PS', 'MS'] will NOT show for an MS student)
            if (d.levels && d.levels.length > 0 && studentLevel) {
                const levelsUpper = d.levels.map((l: string) => l.toUpperCase())
                // Dropdown must be exclusively for the student's level (only 1 level that matches)
                return levelsUpper.length === 1 && levelsUpper[0] === studentLevelUpper
            }

            // Dropdowns without level restrictions are always shown
            return true
        })
    }, [dropdowns, activeSemester, student?.level])

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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1, 2].map(sem => {
                                const isActive = activeSemester === sem
                                const disabled = !isActive
                                const allCompleted = completionLanguages.length > 0
                                    ? completionLanguages.every(code => isLanguageCompletedForSemester(sem, code))
                                    : (sem === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2)

                                return (
                                    <div key={sem} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '6px 10px',
                                        background: disabled ? 'transparent' : '#f0f9ff',
                                        borderRadius: 8,
                                        border: disabled ? '1px solid transparent' : '1px solid #bae6fd'
                                    }}>
                                        <div style={{
                                            fontWeight: 800,
                                            fontSize: 13,
                                            color: disabled ? '#94a3b8' : '#0369a1',
                                            minWidth: 30
                                        }}>
                                            S{sem}
                                        </div>

                                        {!disabled && (
                                            <div style={{ height: 20, width: 1, background: '#cbd5e1' }}></div>
                                        )}

                                        {completionLanguages.length > 1 && (
                                            <button
                                                className="btn"
                                                onClick={() => toggleCompletionSem(sem, completionLanguages)}
                                                disabled={disabled}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: 12,
                                                    borderRadius: 6,
                                                    border: '1px solid #e2e8f0',
                                                    background: disabled ? '#f1f5f9' : (allCompleted ? '#dcfce7' : '#fff'),
                                                    color: disabled ? '#94a3b8' : (allCompleted ? '#166534' : '#475569'),
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    fontWeight: 600,
                                                    boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6
                                                }}
                                                title={disabled ? `Semestre ${sem} inactif` : (allCompleted ? "Tout rouvrir" : "Tout terminer")}
                                            >
                                                {allCompleted ? '✅ Tout Terminé' : '⚡ Tout Valider'}
                                            </button>
                                        )}

                                        {completionLanguages.length === 0 && (
                                            <button
                                                className="btn"
                                                onClick={() => toggleCompletionSem(sem)}
                                                disabled={disabled}
                                                style={{
                                                    padding: '5px 12px',
                                                    fontSize: 13,
                                                    borderRadius: 6,
                                                    border: '1px solid #e2e8f0',
                                                    background: disabled ? '#f1f5f9' : (allCompleted ? '#dcfce7' : '#fff'),
                                                    color: disabled ? '#94a3b8' : (allCompleted ? '#166534' : '#0f172a'),
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    fontWeight: 600,
                                                    boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {allCompleted ? `✅ S${sem} Terminé` : `Valider S${sem}`}
                                            </button>
                                        )}

                                        {completionLanguages.length > 0 && completionLanguages.map(code => {
                                            const done = isLanguageCompletedForSemester(sem, code)
                                            return (
                                                <button
                                                    key={code}
                                                    onClick={() => toggleCompletionSem(sem, [code])}
                                                    disabled={disabled}
                                                    className="btn"
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: 12,
                                                        borderRadius: 100, // Pill shape
                                                        border: `1px solid ${done ? '#22c55e' : '#cbd5e1'}`,
                                                        background: disabled ? '#f1f5f9' : (done ? '#22c55e' : '#fff'),
                                                        color: disabled ? '#94a3b8' : (done ? '#fff' : '#475569'),
                                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                                        fontWeight: 600,
                                                        transition: 'all 0.2s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6
                                                    }}
                                                >
                                                    {done && <span>✓</span>}
                                                    {getLanguageLabel(code)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })}
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


                {/* Dropdowns for Prof Polyvalent or teachers with all languages */}
                {(isProfPolyvalent || allowedLanguages.length === 0) && filteredDropdowns.length > 0 && (
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
                                        disabled={!canEditActiveSemester}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid #fcd34d',
                                            fontSize: 14,
                                            background: 'white',
                                            cursor: canEditActiveSemester ? 'pointer' : 'not-allowed',
                                            opacity: canEditActiveSemester ? 1 : 0.6
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
                                    minWidth: 80,
                                    maxWidth: 160
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
                                                    <span
                                                        title={row.title}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            minWidth: 32,
                                                            height: 32,
                                                            padding: row.title.length > 2 ? '4px 12px' : '4px 8px',
                                                            borderRadius: row.title.length > 2 ? 16 : '50%',
                                                            background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                                                            color: '#fff',
                                                            fontWeight: 700,
                                                            fontSize: row.title.length > 3 ? 12 : 14,
                                                            boxShadow: '0 2px 6px rgba(108, 92, 231, 0.3)',
                                                            maxWidth: 120,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            cursor: 'default'
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
                                                                disabled={!canEditActiveSemester || !allowed || isSaving}
                                                                title={`${item.label || item.code}${!allowed ? ' (non autorisé)' : ''}`}
                                                                style={{
                                                                    width: 44,
                                                                    height: 44,
                                                                    borderRadius: '50%',
                                                                    border: item.active ? '3px solid #6c5ce7' : '2px solid #e2e8f0',
                                                                    background: item.active ? '#f0f4ff' : '#fff',
                                                                    cursor: canEditActiveSemester && allowed ? 'pointer' : 'not-allowed',
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
