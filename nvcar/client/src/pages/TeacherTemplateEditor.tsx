import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import ScrollToTopButton from '../components/ScrollToTopButton'
import ScrollPageDownButton from '../components/ScrollPageDownButton'
import { GradebookPocket } from '../components/GradebookPocket'
import { CroppedImage } from '../components/CroppedImage'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[]; signingPage?: number }
type Student = { _id: string; firstName: string; lastName: string; level?: string; className?: string; dateOfBirth?: Date; avatarUrl?: string }
type Assignment = {
    _id: string
    status: string
    data?: Record<string, any>
    languageCompletions?: {
        code: string
        completed?: boolean
        completedSem1?: boolean
        completedSem2?: boolean
    }[]
}

const pageWidth = 800
const pageHeight = 1120

export default function TeacherTemplateEditor() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saveStatus, setSaveStatus] = useState('')
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [allowedLanguages, setAllowedLanguages] = useState<string[]>([])
    const [isProfPolyvalent, setIsProfPolyvalent] = useState(false)
    const [completionLanguages, setCompletionLanguages] = useState<string[]>([])
    const [languageCompletion, setLanguageCompletion] = useState<Record<string, { completed?: boolean; completedSem1?: boolean; completedSem2?: boolean }>>({})
    const [isMyWorkCompleted, setIsMyWorkCompleted] = useState(false) // Keep for backward compat if needed, or remove?
    const [isMyWorkCompletedSem1, setIsMyWorkCompletedSem1] = useState(false)
    const [isMyWorkCompletedSem2, setIsMyWorkCompletedSem2] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)
    const [zoomLevel, setZoomLevel] = useState(1)
    const [isFitToScreen, setIsFitToScreen] = useState(false)
    const [quickGradingEnabled, setQuickGradingEnabled] = useState(true)
    const containerRef = useRef<HTMLDivElement | null>(null)

    const computeFitScale = () => {
        const containerWidth = containerRef.current ? containerRef.current.clientWidth : window.innerWidth
        const availableWidth = Math.max(0, Math.min(window.innerWidth, containerWidth) - 48) // 48px padding
        return availableWidth / pageWidth
    }

    const { levels } = useLevels()
    const { activeYear } = useSchoolYear()
    const socket = useSocket()

    // Helper function to check if an item's level is at or below the student's current level
    // This allows teachers to edit toggles for PS, MS, GS based on student's current level
    // PS students: can only edit PS toggles
    // MS students: can edit PS and MS toggles
    // GS students: can edit PS, MS, and GS toggles
    const isLevelAtOrBelow = (itemLevel: string | undefined, itemLevels: string[] | undefined, studentLevel: string | undefined) => {
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
    }

    // Helper function to check if an item is EXCLUSIVELY for the student's current level
    // This is stricter than isLevelAtOrBelow - used for dropdowns where teachers
    // should only edit the current level's dropdown, not previous levels
    const isLevelExactMatch = (itemLevels: string[] | undefined, studentLevel: string | undefined) => {
        if (!studentLevel) return true

        // No level restrictions means it's available to all
        if (!itemLevels || itemLevels.length === 0) return true

        const studentLevelUpper = studentLevel.toUpperCase()
        const levelsUpper = itemLevels.map(l => l.toUpperCase())

        // Dropdown must be EXCLUSIVELY for the student's current level
        // i.e., levels array should only contain the student's level
        return levelsUpper.length === 1 && levelsUpper[0] === studentLevelUpper
    }

    const visiblePages = useMemo(() => {
        if (!template) return []
        return template.pages.map((p, i) => ({ page: p, originalIndex: i }))
            .filter((_, i) => template.signingPage === undefined || i !== (template.signingPage - 1))
    }, [template])

    const fixUrl = (url: string) => {
        if (!url) return url
        if (typeof window === 'undefined') return url
        // Replace localhost:4000 with current window hostname:4000
        // This handles the case where images were saved with localhost but we are accessing via IP
        if (url.includes('localhost:4000')) {
            const host = window.location.hostname
            const protocol = window.location.protocol
            return url.replace(/http(s)?:\/\/localhost:4000/, `${protocol}//${host}:4000`)
        }
        return url
    }

    useEffect(() => {
        const handleResize = () => {
            if (isFitToScreen) {
                setZoomLevel(computeFitScale())
            }
        }

        if (isFitToScreen) {
            handleResize()
            window.addEventListener('resize', handleResize)
        }

        return () => window.removeEventListener('resize', handleResize)
    }, [isFitToScreen])

    useEffect(() => {
        if (assignmentId && socket) {
            const roomId = `assignment:${assignmentId}`
            socket.emit('join-room', roomId)

            const handleUpdate = (payload: any) => {
                if (payload.type === 'language-toggle') {
                    setTemplate(prev => {
                        if (!prev) return prev
                        const newTemplate = { ...prev }
                        const { pageIndex, blockIndex, items } = payload
                        if (newTemplate.pages[pageIndex]?.blocks[blockIndex]) {
                            newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                        }
                        return newTemplate
                    })
                }

                if (payload.type === 'assignment-data') {
                    setAssignment(prev => {
                        if (!prev) return prev
                        if (payload.assignmentId && payload.assignmentId !== prev._id) return prev
                        const nextData = { ...(prev.data || {}), ...(payload.data || {}) }
                        return { ...prev, data: nextData }
                    })
                }
            }

            socket.on('update-received', handleUpdate)

            return () => {
                socket.emit('leave-room', roomId)
                socket.off('update-received', handleUpdate)
            }
        }
    }, [assignmentId, socket])

    const emitAssignmentDataUpdate = (dataPatch: Record<string, any>) => {
        if (!socket || !assignmentId) return
        const payload = {
            type: 'assignment-data',
            assignmentId,
            data: dataPatch,
            dataVersion: (assignment as any)?.dataVersion
        }
        socket.emit('broadcast-update', {
            roomId: `assignment:${assignmentId}`,
            payload
        }, (ack: any) => {
            if (!ack || ack.status !== 'ok') {
                console.warn('Socket update ack failed or not received', ack)
            }
        })
    }

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [assignmentRes, settingsRes] = await Promise.all([
                    api.get(`/teacher/template-assignments/${assignmentId}`),
                    api.get('/settings/public').catch(() => ({ data: {} }))
                ])
                const r = assignmentRes
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setCanEdit(r.data.canEdit)
                setAllowedLanguages(r.data.allowedLanguages || [])
                setIsProfPolyvalent(r.data.isProfPolyvalent || false)
                setCompletionLanguages(r.data.completionLanguages || [])
                setLanguageCompletion(r.data.languageCompletion || buildLanguageCompletionMap(r.data.assignment))
                setIsMyWorkCompleted(r.data.isMyWorkCompleted || false)
                setIsMyWorkCompletedSem1(r.data.isMyWorkCompletedSem1 || false)
                setIsMyWorkCompletedSem2(r.data.isMyWorkCompletedSem2 || false)
                setActiveSemester(r.data.activeSemester || 1)

                // Check if quick grading is enabled
                if (settingsRes.data.teacher_quick_grading_enabled !== undefined) {
                    setQuickGradingEnabled(settingsRes.data.teacher_quick_grading_enabled)
                }
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdown(null)
        if (openDropdown) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [openDropdown])

    const updateLanguageToggle = async (pageIndex: number, blockIndex: number, items: any[]) => {
        try {
            setSaveStatus('Enregistrement...')
            const block = template?.pages?.[pageIndex]?.blocks?.[blockIndex]
            const blockId = block?.props?.blockId

            const payload: any = { pageIndex, blockIndex, blockId, items }
            const expected = (assignment as any)?.dataVersion
            if (typeof expected === 'number') payload.expectedDataVersion = expected

            const res = await api.patch(`/teacher/template-assignments/${assignmentId}/language-toggle`, payload)

            // Update local state
            if (template) {
                const newTemplate = { ...template }
                newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                setTemplate(newTemplate)

                if (socket) {
                    socket.emit('broadcast-update', {
                        roomId: `assignment:${assignmentId}`,
                        payload: {
                            type: 'language-toggle',
                            pageIndex,
                            blockIndex,
                            items,
                            changeId: res.data?.changeId,
                            dataVersion: res.data?.dataVersion
                        }
                    }, (ack: any) => {
                        if (!ack || ack.status !== 'ok') console.warn('Socket ack failed')
                    })
                }
            }

            // Update local cached assignment dataVersion if server returned it
            if (res && res.data && typeof res.data.dataVersion === 'number') {
                setAssignment(prev => prev ? ({ ...prev, data: prev.data, dataVersion: res.data.dataVersion } as any) : prev)
            }

            setSaveStatus('Enregistré avec succès ✓')
            setTimeout(() => setSaveStatus(''), 3000)
        } catch (e: any) {
            if (e?.response?.status === 409) {
                setError('Conflit détecté — vos modifications n\'ont pas été appliquées. Rechargez et réessayez.')
                try {
                    const fresh = await api.get(`/teacher/template-assignments/${assignmentId}`)
                    setTemplate(fresh.data.template)
                    setAssignment(fresh.data.assignment)
                } catch (err) {
                    console.error('Failed to reload after conflict', err)
                }
            } else {
                setError('Échec de l\'enregistrement')
            }
            setSaveStatus('')
            console.error(e)
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

    const isActiveSemesterClosed = useMemo(() => {
        if (completionLanguages.length > 0) {
            return areAllLanguagesCompleted(activeSemester)
        }
        return activeSemester === 1 ? isMyWorkCompletedSem1 : isMyWorkCompletedSem2
    }, [activeSemester, completionLanguages, isMyWorkCompletedSem1, isMyWorkCompletedSem2, languageCompletion])

    const canEditActive = canEdit && !isActiveSemesterClosed

    const toggleCompletionSem = async (semester: number, languages?: string[]) => {
        if (!assignment) return
        try {
            setSaveStatus('Enregistrement...')
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
                // Sync legacy
                setIsMyWorkCompleted(nextSem1)
            } else {
                setIsMyWorkCompletedSem2(nextSem2)
            }

            setSaveStatus(!isCompleted ? 'Terminé avec succès ✓' : 'Rouvert avec succès')
            setTimeout(() => setSaveStatus(''), 3000)
        } catch (e: any) {
            setError('Erreur lors de la mise à jour du statut')
            console.error(e)
        }
    }

    const getNextLevel = (current: string) => {
        if (!current) return null

        // Use dynamic levels if available
        if (levels && levels.length > 0) {
            const currentLvl = levels.find(l => l.name === current)
            if (currentLvl) {
                const nextLvl = levels.find(l => l.order === currentLvl.order + 1)
                if (nextLvl) return nextLvl.name
            }
        }

        const c = (current || '').toUpperCase()
        if (c === 'TPS') return 'PS'
        if (c === 'PS') return 'MS'
        if (c === 'MS') return 'GS'
        if (c === 'GS') return 'EB1'
        if (c === 'KG1') return 'KG2'
        if (c === 'KG2') return 'KG3'
        if (c === 'KG3') return 'EB1'
        return null
    }

    const getBlockLevel = (b: Block) => {
        if (b.props.level) return b.props.level
        const label = (b.props.label || '').toUpperCase()
        if (/\bTPS\b/.test(label)) return 'TPS'
        if (/\bPS\b/.test(label)) return 'PS'
        if (/\bMS\b/.test(label)) return 'MS'
        if (/\bGS\b/.test(label)) return 'GS'
        if (/\bEB1\b/.test(label)) return 'EB1'
        if (/\bKG1\b/.test(label)) return 'KG1'
        if (/\bKG2\b/.test(label)) return 'KG2'
        if (/\bKG3\b/.test(label)) return 'KG3'
        return null
    }

    const computeNextSchoolYearName = (year: string | undefined) => {
        if (!year) return ''
        const m = year.match(/(\d{4})\s*([/\-])\s*(\d{4})/)
        if (!m) return ''
        const start = parseInt(m[1], 10)
        const sep = m[2]
        const end = parseInt(m[3], 10)
        if (Number.isNaN(start) || Number.isNaN(end)) return ''
        return `${start + 1}${sep}${end + 1}`
    }

    const getPromotionYearLabel = (promo: any, blockLevel: string | null) => {
        const year = String(promo?.year || '')
        if (year) {
            const next = computeNextSchoolYearName(year)
            if (next) return next
        }

        const nextFromActive = computeNextSchoolYearName(activeYear?.name)
        if (nextFromActive) return nextFromActive

        if (!year) return ''

        const history = assignment?.data?.signatures || []
        const level = String(promo?.from || blockLevel || '')
        const endSig = Array.isArray(history)
            ? history
                .filter((s: any) => (s?.type === 'end_of_year') && s?.schoolYearName)
                .find((s: any) => {
                    if (!level) return true
                    if (s?.level) return String(s.level) === level
                    return false
                })
            : null

        if (endSig?.schoolYearName) return String(endSig.schoolYearName)

        const next = computeNextSchoolYearName(year)
        return next || year
    }

    if (loading) return <div className="container"><div className="card"><div className="note">Chargement...</div></div></div>
    if (error && !template) return <div className="container"><div className="card"><div className="note" style={{ color: 'crimson' }}>{error}</div></div></div>
    if (!template) return <div className="container"><div className="card"><div className="note">Carnet introuvable</div></div></div>

    return (
        <div style={{ padding: 24 }}>
            <ScrollToTopButton />
            <ScrollPageDownButton />
            <div className="card">
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className="btn secondary" onClick={() => window.history.back()} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#f1f5f9',
                        color: '#475569',
                        fontWeight: 500,
                        border: '1px solid #e2e8f0'
                    }}>← Retour</button>
                    {quickGradingEnabled && (
                        <a href={`/teacher/templates/${assignmentId}/quick`} className="btn secondary" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#fef3c7',
                            color: '#92400e',
                            fontWeight: 500,
                            border: '1px solid #fcd34d',
                            textDecoration: 'none'
                        }}>⚡ Notation rapide</a>
                    )}
                </div>

                <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span>✏️ Édition du carnet - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</span>
                            {student?.level && (
                                <span style={{
                                    fontSize: 14,
                                    background: '#e0e7ff',
                                    color: '#4338ca',
                                    padding: '4px 10px',
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
                                    padding: '4px 10px',
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
                                padding: '4px 10px',
                                borderRadius: 16,
                                fontWeight: 700,
                                border: `1px solid ${activeSemester === 2 ? '#93c5fd' : '#fcd34d'}`
                            }}>
                                S{activeSemester}
                            </span>
                        </h2>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: assignment?.status === 'signed' ? '#d1fae5' : assignment?.status === 'completed' ? '#dbeafe' : '#fef3c7', color: assignment?.status === 'signed' ? '#065f46' : assignment?.status === 'completed' ? '#1e40af' : '#92400e', border: `1px solid ${assignment?.status === 'signed' ? '#6ee7b7' : assignment?.status === 'completed' ? '#93c5fd' : '#fcd34d'}` }}>
                            {assignment?.status === 'draft' && '📝 Brouillon'}
                            {assignment?.status === 'in_progress' && '🔄 En cours'}
                            {assignment?.status === 'completed' && '✅ Terminé'}
                            {assignment?.status === 'signed' && '✔️ Signé'}
                            {!['draft', 'in_progress', 'completed', 'signed'].includes(assignment?.status || '') && assignment?.status}
                        </div>
                    </div>
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
                                            minWidth: 50
                                        }}>
                                            SEM {sem}
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
                                                {allCompleted ? `✅ Semestre ${sem} Terminé` : `Valider Semestre ${sem}`}
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

                {saveStatus && <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14, textAlign: 'center', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}>✓ {saveStatus}</div>}
                {error && <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14, textAlign: 'center', boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)' }}>✗ {error}</div>}

                <div style={{ marginTop: 20, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)} style={{
                        background: continuousScroll ? 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)' : '#f1f5f9',
                        color: continuousScroll ? 'white' : '#475569',
                        fontWeight: 500,
                        border: '1px solid #cbd5e1',
                        padding: '10px 16px',
                        boxShadow: continuousScroll ? '0 2px 8px rgba(108, 92, 231, 0.3)' : 'none'
                    }}>
                        {continuousScroll ? '📄 Vue page par page' : '📚 Vue continue'}
                    </button>

                    <div style={{ height: 24, width: 1, background: '#cbd5e1', margin: '0 8px' }} />

                    {/* Zoom Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <button
                            className="btn secondary"
                            onClick={() => {
                                setIsFitToScreen(false)
                                setZoomLevel(prev => Math.max(0.2, prev - 0.1))
                            }}
                            style={{ padding: '6px 10px', fontSize: 16, lineHeight: 1 }}
                            title="Zoom Out"
                        >−</button>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 40, textAlign: 'center' }}>
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <button
                            className="btn secondary"
                            onClick={() => {
                                setIsFitToScreen(false)
                                setZoomLevel(prev => Math.min(2, prev + 0.1))
                            }}
                            style={{ padding: '6px 10px', fontSize: 16, lineHeight: 1 }}
                            title="Zoom In"
                        >+</button>
                    </div>

                    <button
                        className="btn secondary"
                        onClick={() => {
                            if (!isFitToScreen) {
                                setZoomLevel(computeFitScale())
                                setIsFitToScreen(true)
                            } else {
                                setIsFitToScreen(false)
                                setZoomLevel(1)
                            }
                        }}
                        style={{
                            background: isFitToScreen ? '#e0e7ff' : 'white',
                            color: isFitToScreen ? '#4338ca' : '#475569',
                            border: '1px solid #e2e8f0',
                            padding: '8px 12px',
                            fontWeight: 500
                        }}
                    >
                        {isFitToScreen ? '↔ Ajusté' : '↔ Ajuster'}
                    </button>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                        <button
                            className="btn secondary"
                            onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                            disabled={selectedPage === 0 || continuousScroll}
                            style={{
                                padding: '10px 16px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                opacity: (selectedPage === 0 || continuousScroll) ? 0.5 : 1,
                                cursor: (selectedPage === 0 || continuousScroll) ? 'not-allowed' : 'pointer',
                                fontWeight: 500
                            }}
                        >
                            ← Précédent
                        </button>
                        <select
                            value={selectedPage}
                            onChange={e => {
                                const pageNum = Number(e.target.value)
                                setSelectedPage(pageNum)
                                if (continuousScroll) {
                                    // Scroll to the selected page
                                    setTimeout(() => {
                                        const originalIndex = visiblePages[pageNum]?.originalIndex
                                        const pageElement = document.getElementById(`page-${originalIndex}`)
                                        if (pageElement) {
                                            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                        }
                                    }, 100)
                                }
                            }}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: 14,
                                fontWeight: 500,
                                color: '#475569',
                                background: 'white',
                                minWidth: 150
                            }}
                        >
                            {visiblePages.map((item, i) => <option key={i} value={i}>{item.page.title || `Page ${item.originalIndex + 1}`}</option>)}
                        </select>
                        <button
                            className="btn secondary"
                            onClick={() => setSelectedPage(Math.min(visiblePages.length - 1, selectedPage + 1))}
                            disabled={selectedPage === visiblePages.length - 1 || continuousScroll}
                            style={{
                                padding: '10px 16px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                opacity: (selectedPage === visiblePages.length - 1 || continuousScroll) ? 0.5 : 1,
                                cursor: (selectedPage === visiblePages.length - 1 || continuousScroll) ? 'not-allowed' : 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Suivant →
                        </button>
                    </div>
                </div>

                <div ref={containerRef} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 24,
                    alignItems: 'center',
                    overflowX: 'hidden', // Prevent horizontal scroll on parent
                    width: '100%' // Ensure it takes full width
                }}>

                    {(continuousScroll ? visiblePages : (visiblePages[selectedPage] ? [visiblePages[selectedPage]] : [])).map((item, viewIdx) => {
                        const page = item.page
                        const actualPageIndex = item.originalIndex

                        return (
                            <div
                                key={actualPageIndex}
                                style={{
                                    // Layout boundary matching the SCALED size
                                    width: pageWidth * zoomLevel,
                                    height: pageHeight * zoomLevel,
                                    position: 'relative',
                                    // box-shadow and margin logic moved here or kept on inner?
                                    // Keeping card style on inner to ensure shadow scales or stays tight?
                                    // Actually, if we scale inner, shadow scales too.
                                    // Let's put layout sizing here.
                                    transition: 'width 0.2s ease-out, height 0.2s ease-out'
                                }}
                            >
                                <div
                                    id={`page-${actualPageIndex}`}
                                    className="card page-canvas"
                                    style={{
                                        height: pageHeight,
                                        width: pageWidth,
                                        background: page.bgColor || '#fff',
                                        overflow: 'hidden',
                                        position: 'absolute', // Absolute to allow transform to work freely within relative parent
                                        top: 0,
                                        left: 0,
                                        transform: `scale(${zoomLevel})`,
                                        transformOrigin: 'top left',
                                        transition: 'transform 0.2s ease-out',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                        border: '1px solid #e2e8f0'
                                    }}
                                >
                                    {continuousScroll && (
                                        <div style={{
                                            position: 'absolute',
                                            top: -36,
                                            left: 0,
                                            color: '#64748b',
                                            fontSize: 15,
                                            fontWeight: 600,
                                            background: '#f8fafc',
                                            padding: '4px 12px',
                                            borderRadius: 6,
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            📄 Page {actualPageIndex + 1}
                                        </div>
                                    )}

                                    <div className="page-margins" />
                                    {page.blocks.map((b, idx) => {
                                        if (!b || !b.props) return null;
                                        return (
                                            <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
                                                {b.type === 'text' && (
                                                    <div style={{
                                                        color: b.props.color,
                                                        fontSize: b.props.fontSize,
                                                        fontWeight: b.props.bold ? 700 : 400,
                                                        textDecoration: b.props.underline ? 'underline' : 'none',
                                                        width: b.props.width,
                                                        height: b.props.height,
                                                        overflow: 'hidden',
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        {Array.isArray(b.props.runs) && b.props.runs.length ? (
                                                            (b.props.runs as any[]).map((r, i) => (
                                                                <span
                                                                    key={i}
                                                                    style={{
                                                                        color: (r && typeof r === 'object' && typeof r.color === 'string' && r.color) ? r.color : (b.props.color || undefined),
                                                                        fontWeight: (r && typeof r === 'object' && typeof r.bold === 'boolean') ? (r.bold ? 700 : 400) : (b.props.bold ? 700 : 400),
                                                                        textDecoration: (r && typeof r === 'object' && typeof r.underline === 'boolean') ? (r.underline ? 'underline' : 'none') : (b.props.underline ? 'underline' : 'none'),
                                                                    }}
                                                                >
                                                                    {r?.text || ''}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            b.props.text
                                                        )}
                                                    </div>
                                                )}
                                                {b.type === 'image' && <CroppedImage src={fixUrl(b.props.url)} displayWidth={b.props.width || 120} displayHeight={b.props.height || 120} cropData={b.props.cropData} borderRadius={8} />}
                                                {b.type === 'student_photo' && (
                                                    student?.avatarUrl ? (
                                                        <img src={fixUrl(student.avatarUrl)} style={{ width: b.props.width || 100, height: b.props.height || 100, objectFit: 'cover', borderRadius: 8 }} alt="Student" />
                                                    ) : (
                                                        <div style={{ width: b.props.width || 100, height: b.props.height || 100, borderRadius: 8, background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                                                            <div style={{ fontSize: 24 }}>👤</div>
                                                        </div>
                                                    )
                                                )}
                                                {b.type === 'gradebook_pocket' && (
                                                    <GradebookPocket
                                                        number={b.props.number || '1'}
                                                        width={b.props.width || 120}
                                                        fontSize={b.props.fontSize}
                                                    />
                                                )}
                                                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                                {b.type === 'language_toggle' && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                                        {(b.props.items || []).map((it: any, i: number) => {
                                                            // Check level and language
                                                            // Allow editing if item's level is at or below student's current level
                                                            const isLevelAllowed = isLevelAtOrBelow(undefined, it.levels, student?.level);
                                                            const isLanguageAllowed = (() => {
                                                                const code = it.code
                                                                if (isProfPolyvalent) {
                                                                    return code === 'fr'
                                                                }
                                                                return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code))
                                                            })();
                                                            const isAllowed = isLevelAllowed && isLanguageAllowed;
                                                            const isLanguageDone = isLanguageCompletedForSemester(activeSemester, it.code)
                                                            const canToggle = canEditActive && isAllowed && !isLanguageDone

                                                            const r = b.props.radius || 40
                                                            const size = r * 2
                                                            return (
                                                                <div
                                                                    key={i}
                                                                    style={{
                                                                        width: size,
                                                                        height: size,
                                                                        borderRadius: '50%',
                                                                        overflow: 'hidden',
                                                                        position: 'relative',
                                                                        cursor: canToggle ? 'pointer' : 'not-allowed',
                                                                        boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                                        transition: 'all 0.2s ease',
                                                                        opacity: canToggle ? 1 : (it.active ? 0.9 : 0.5),
                                                                        pointerEvents: canToggle ? 'auto' : 'none'
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!canToggle) return
                                                                        const newItems = [...(b.props.items || [])]
                                                                        newItems[i] = { ...newItems[i], active: !newItems[i].active }
                                                                        updateLanguageToggle(actualPageIndex, idx, newItems)
                                                                    }}
                                                                >
                                                                    {it.logo ? <img src={fixUrl(it.logo)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                {b.type === 'language_toggle_v2' && (
                                                    <div style={{
                                                        display: 'flex',
                                                        flexDirection: (b.props.direction as any) || 'row',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: b.props.spacing || 12,
                                                        background: b.props.backgroundColor || 'transparent',
                                                        borderRadius: b.props.borderRadius || 12,
                                                        padding: b.props.padding || 8,
                                                        width: b.props.width,
                                                        height: b.props.height,
                                                        boxSizing: 'border-box'
                                                    }}>
                                                        {(b.props.items || []).map((it: any, i: number) => {
                                                            // Check level and language
                                                            // Allow editing if item's level is at or below student's current level
                                                            const isLevelAllowed = isLevelAtOrBelow(undefined, it.levels, student?.level);
                                                            const isLanguageAllowed = (() => {
                                                                const code = it.code
                                                                if (isProfPolyvalent) {
                                                                    return code === 'fr'
                                                                }
                                                                return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code))
                                                            })();
                                                            const isAllowed = isLevelAllowed && isLanguageAllowed;
                                                            const isLanguageDone = isLanguageCompletedForSemester(activeSemester, it.code)
                                                            const canToggle = canEditActive && isAllowed && !isLanguageDone

                                                            const size = 40
                                                            const getEmoji = (item: any) => {
                                                                const e = item.emoji
                                                                if (e && e.length >= 2) return e
                                                                const c = (item.code || '').toLowerCase()
                                                                if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                                if (c === 'fr') return '🇫🇷'
                                                                if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                                return '🏳️'
                                                            }
                                                            const emoji = getEmoji(it)
                                                            const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`
                                                            return (
                                                                <div
                                                                    key={i}
                                                                    title={it.label}
                                                                    style={{
                                                                        width: size,
                                                                        height: size,
                                                                        minWidth: size,
                                                                        borderRadius: '50%',
                                                                        background: it.active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                                                        border: it.active ? '2px solid #2563eb' : '0.25px solid #fff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        cursor: canToggle ? 'pointer' : 'not-allowed',
                                                                        boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                        transition: 'all 0.2s ease',
                                                                        transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                                                        opacity: canToggle ? (it.active ? 1 : 0.6) : (it.active ? 0.9 : 0.4),
                                                                        pointerEvents: canToggle ? 'auto' : 'none',
                                                                        filter: 'none'
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!canToggle) return
                                                                        const newItems = [...(b.props.items || [])]
                                                                        newItems[i] = { ...newItems[i], active: !newItems[i].active }
                                                                        updateLanguageToggle(actualPageIndex, idx, newItems)
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                                                >
                                                                    {emoji ? (
                                                                        <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                                    ) : it.logo ? (
                                                                        <img src={fixUrl(it.logo)} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                                    ) : (
                                                                        <span style={{ fontSize: 20, lineHeight: 1 }}>{getEmoji(it)}</span>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                                                {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                                                {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{(() => {
                                                    let text = b.props.text || ''
                                                    if (student) {
                                                        const fatherName = String((student as any)?.fatherName || (student as any)?.parentName || '').trim()
                                                        const fatherInitial = fatherName ? fatherName.charAt(0).toUpperCase() : ''
                                                        const fatherInitialWithDot = fatherInitial ? `${fatherInitial}.` : ''
                                                        const fullNameFatherInitial = [student.firstName, fatherInitialWithDot, student.lastName].filter(Boolean).join(' ')
                                                        const dob = student.dateOfBirth ? new Date(student.dateOfBirth) : new Date(NaN)
                                                        const dobDdMmYyyy = isNaN(dob.getTime()) ? '' : `${String(dob.getUTCDate()).padStart(2, '0')}/${String(dob.getUTCMonth() + 1).padStart(2, '0')}/${String(dob.getUTCFullYear())}`

                                                        text = text
                                                            .replace(/{student.firstName}/g, student.firstName)
                                                            .replace(/{student.lastName}/g, student.lastName)
                                                            .replace(/{student.dob}/g, student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '')
                                                            .replace(/{student.fatherInitial}/g, fatherInitialWithDot)
                                                            .replace(/{student.fullNameFatherInitial}/g, fullNameFatherInitial)
                                                            .replace(/{student.dob_ddmmyyyy}/g, dobDdMmYyyy)
                                                    }
                                                    if (assignment?.data) {
                                                        Object.entries(assignment.data).forEach(([k, v]) => {
                                                            text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
                                                        })
                                                    }
                                                    return text
                                                })()}</div>}
                                                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{student ? `${student.firstName} ${student.lastName}` : 'Nom, Classe, Naissance'}</div>}
                                                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                                                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                                                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{(b.props.labels || []).join(' / ')}</div>}
                                                {b.type === 'dropdown' && (() => {
                                                    // Check if dropdown is allowed for current level
                                                    // For dropdowns: ONLY allow editing if it's exclusively for the student's current level
                                                    // (unlike language toggles which allow previous levels)
                                                    const isLevelAllowed = isLevelExactMatch(b.props.levels, student?.level)
                                                    // Check if dropdown is allowed for current semester (default to both semesters if not specified)
                                                    const dropdownSemesters = b.props.semesters || [1, 2]
                                                    const isSemesterAllowed = dropdownSemesters.includes(activeSemester)
                                                    const isDropdownAllowed = isLevelAllowed && isSemesterAllowed
                                                    const canEditDropdown = canEditActive && (isProfPolyvalent || allowedLanguages.length === 0) && isDropdownAllowed

                                                    return (
                                                        <div style={{
                                                            width: b.props.width || 200,
                                                            position: 'relative',
                                                        }}>
                                                            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>Dropdown #{b.props.dropdownNumber || '?'}</div>
                                                            {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                                                            <div
                                                                style={{
                                                                    width: '100%',
                                                                    minHeight: b.props.height || 32,
                                                                    fontSize: b.props.fontSize || 12,
                                                                    color: b.props.color || '#333',
                                                                    padding: '4px 24px 4px 8px',
                                                                    borderRadius: 4,
                                                                    border: '1px solid #ccc',
                                                                    borderLeft: canEditDropdown ? '4px solid #10b981' : '1px solid #ccc',
                                                                    background: canEditDropdown ? '#fff' : '#f9f9f9',
                                                                    cursor: canEditDropdown ? 'pointer' : 'not-allowed',
                                                                    opacity: isDropdownAllowed ? 1 : 0.7,
                                                                    position: 'relative',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    wordWrap: 'break-word',
                                                                    whiteSpace: 'pre-wrap'
                                                                }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    if (!canEditDropdown) return
                                                                    const key = `dropdown_${actualPageIndex}_${idx}`
                                                                    setOpenDropdown(openDropdown === key ? null : key)
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const currentValue = b.props.dropdownNumber
                                                                        ? assignment?.data?.[`dropdown_${b.props.dropdownNumber}`]
                                                                        : b.props.variableName ? assignment?.data?.[b.props.variableName] : ''
                                                                    return currentValue || 'Sélectionner...'
                                                                })()}
                                                                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</div>
                                                            </div>
                                                            {openDropdown === `dropdown_${actualPageIndex}_${idx}` && (
                                                                <div
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: '100%',
                                                                        left: 0,
                                                                        right: 0,
                                                                        maxHeight: 300,
                                                                        overflowY: 'auto',
                                                                        background: '#fff',
                                                                        border: '1px solid #ccc',
                                                                        borderRadius: 4,
                                                                        marginTop: 2,
                                                                        zIndex: 9999,
                                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <div
                                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: b.props.fontSize || 12, color: '#999', borderBottom: '1px solid #eee' }}
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation()
                                                                            if (assignment) {
                                                                                const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                                if (key) {
                                                                                    const newData = { ...assignment.data, [key]: '' }
                                                                                    setAssignment({ ...assignment, data: newData })
                                                                                    try {
                                                                                        await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [key]: '' } })
                                                                                        emitAssignmentDataUpdate({ [key]: '' })
                                                                                        setSaveStatus('Enregistré avec succès ✓')
                                                                                        setTimeout(() => setSaveStatus(''), 3000)
                                                                                    } catch (err) {
                                                                                        setError('Erreur sauvegarde')
                                                                                    }
                                                                                }
                                                                            }
                                                                            setOpenDropdown(null)
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                                    >
                                                                        Sélectionner...
                                                                    </div>
                                                                    {(b.props.options || []).map((opt: string, i: number) => (
                                                                        <div
                                                                            key={i}
                                                                            style={{
                                                                                padding: '8px 12px',
                                                                                cursor: 'pointer',
                                                                                fontSize: b.props.fontSize || 12,
                                                                                wordWrap: 'break-word',
                                                                                whiteSpace: 'pre-wrap',
                                                                                borderBottom: i < (b.props.options || []).length - 1 ? '1px solid #eee' : 'none'
                                                                            }}
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation()
                                                                                if (assignment) {
                                                                                    const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                                    if (key) {
                                                                                        const newData = { ...assignment.data, [key]: opt }
                                                                                        setAssignment({ ...assignment, data: newData })
                                                                                        try {
                                                                                            await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [key]: opt } })
                                                                                            emitAssignmentDataUpdate({ [key]: opt })
                                                                                            setSaveStatus('Enregistré avec succès ✓')
                                                                                            setTimeout(() => setSaveStatus(''), 3000)
                                                                                        } catch (err) {
                                                                                            setError('Erreur sauvegarde')
                                                                                        }
                                                                                    }
                                                                                }
                                                                                setOpenDropdown(null)
                                                                            }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.background = '#e8ecf8'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                                        >
                                                                            {opt}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
                                                {b.type === 'dropdown_reference' && (() => {
                                                    const dropdownNum = b.props.dropdownNumber || 1
                                                    const raw = assignment?.data?.[`dropdown_${dropdownNum}`]
                                                    const value = typeof raw === 'string' ? raw.trim() : raw
                                                    // Hide if no value selected (same as SubAdmin view)
                                                    if (!value) return null
                                                    return (
                                                        <div style={{
                                                            color: b.props.color || '#333',
                                                            fontSize: b.props.fontSize || 12,
                                                            width: b.props.width || 200,
                                                            minHeight: b.props.height || 'auto',
                                                            wordWrap: 'break-word',
                                                            whiteSpace: 'pre-wrap'
                                                        }}>
                                                            {String(value)}
                                                        </div>
                                                    )
                                                })()}
                                                {b.type === 'table' && (
                                                    (() => {
                                                        const parseNum = (v: any) => {
                                                            const n = typeof v === 'number' ? v : parseFloat(String(v || '0'))
                                                            return isNaN(n) ? 0 : n
                                                        }
                                                        const cols: number[] = (b.props.columnWidths || []).map(parseNum)
                                                        const rows: number[] = (b.props.rowHeights || []).map(parseNum)
                                                        const cells: any[][] = b.props.cells || []
                                                        const gapCol = parseNum(b.props.colGap)
                                                        const gapRow = parseNum(b.props.rowGap)
                                                        const expandedRows = b.props.expandedRows || false
                                                        const expandedRowHeight = parseNum(b.props.expandedRowHeight || 34)
                                                        const expandedDividerWidth = parseNum(b.props.expandedDividerWidth || 0.5)
                                                        const expandedDividerColor = b.props.expandedDividerColor || 'rgba(255, 255, 255, 0.2)'
                                                        const expandedPadding = 4
                                                        const expandedTopGap = 6
                                                        const expandedLanguages = b.props.expandedLanguages || [
                                                            { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                                            { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                                            { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                                        ]
                                                        const toggleStyle = b.props.expandedToggleStyle || 'v2'

                                                        let width = 0
                                                        for (let i = 0; i < cols.length; i++) {
                                                            width += (cols[i] || 0)
                                                            width += gapCol
                                                        }
                                                        if (cols.length > 0) width -= gapCol

                                                        let height = 0
                                                        for (let i = 0; i < rows.length; i++) {
                                                            height += (rows[i] || 0)
                                                            if (expandedRows) {
                                                                // Total height of expanded section = height set + paddingBottom
                                                                // In CSS content-box (default), height adds up.
                                                                height += (expandedRowHeight + expandedPadding)
                                                            }
                                                            height += gapRow
                                                        }
                                                        if (rows.length > 0) height -= gapRow

                                                        return (
                                                            <div style={{
                                                                position: 'relative',
                                                                width,
                                                                height,
                                                                display: expandedRows ? 'flex' : 'grid',
                                                                flexDirection: 'column',
                                                                gap: `${gapRow}px ${gapCol}px`,
                                                                gridTemplateColumns: !expandedRows ? cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' ') : undefined,
                                                                gridTemplateRows: !expandedRows ? rows.map(h => `${Math.max(1, Math.round(h))}px`).join(' ') : undefined,
                                                                overflow: 'visible',
                                                                background: (gapRow > 0 || gapCol > 0) ? 'transparent' : (b.props.backgroundColor || 'transparent'),
                                                                borderRadius: (gapRow > 0 || gapCol > 0) ? 0 : (b.props.borderRadius || 0)
                                                            }}>
                                                                {!expandedRows ? (
                                                                    cells.flatMap((row, ri) => row.map((cell, ci) => {
                                                                        const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b

                                                                        const radius = b.props.borderRadius || 0
                                                                        const isFirstCol = ci === 0
                                                                        const isLastCol = ci === cols.length - 1
                                                                        const isFirstRow = ri === 0
                                                                        const isLastRow = ri === rows.length - 1
                                                                        const treatAsCards = gapRow > 0

                                                                        const style: React.CSSProperties = {
                                                                            background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                                                            borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                                                            borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                                                            borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                                                            borderBottom: bb?.width ? `${bb.width}px solid ${bb.color || '#000'}` : 'none',
                                                                            padding: 15,
                                                                            boxSizing: 'border-box',
                                                                            borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                            borderBottomLeftRadius: (isFirstCol && (treatAsCards || isLastRow)) ? radius : 0,
                                                                            borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                            borderBottomRightRadius: (isLastCol && (treatAsCards || isLastRow)) ? radius : 0,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            overflow: 'hidden'
                                                                        }
                                                                        return (
                                                                            <div key={`${ri}-${ci}`} style={style}>
                                                                                {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                                                            </div>
                                                                        )
                                                                    }))
                                                                ) : (
                                                                    cells.map((row, ri) => {
                                                                        const radius = b.props.borderRadius || 0
                                                                        const isFirstRow = ri === 0
                                                                        const isLastRow = ri === rows.length - 1
                                                                        const treatAsCards = gapRow > 0
                                                                        const rowBgColor = row[0]?.fill || b.props.backgroundColor || '#f8f9fa'
                                                                        const mainRowHeight = rows[ri] || 40

                                                                        return (
                                                                            <div key={`row-unit-${ri}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', marginBottom: (expandedRows && !isLastRow) ? gapRow : 0 }}>

                                                                                {/* Main Row Grid */}
                                                                                <div style={{
                                                                                    display: 'grid',
                                                                                    gridTemplateColumns: cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' '),
                                                                                    columnGap: gapCol,
                                                                                    height: mainRowHeight
                                                                                }}>
                                                                                    {row.map((cell: any, ci: number) => {
                                                                                        const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b
                                                                                        const isFirstCol = ci === 0
                                                                                        const isLastCol = ci === cols.length - 1

                                                                                        const style: React.CSSProperties = {
                                                                                            background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                                                                            borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                                                                            borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                                                                            borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                                                                            borderBottom: 'none',
                                                                                            padding: 15,
                                                                                            boxSizing: 'border-box',
                                                                                            borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                                            borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                                                            borderBottomLeftRadius: 0,
                                                                                            borderBottomRightRadius: 0,
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            overflow: 'hidden'
                                                                                        }
                                                                                        return (
                                                                                            <div key={`cell-${ri}-${ci}`} style={style}>
                                                                                                {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>

                                                                                {/* Expanded Row Section */}
                                                                                <div style={{
                                                                                    background: rowBgColor,
                                                                                    borderBottomLeftRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                                    borderBottomRightRadius: (treatAsCards || isLastRow) ? radius : 0,
                                                                                    height: expandedRowHeight,
                                                                                    position: 'relative',
                                                                                    paddingBottom: expandedPadding
                                                                                }}>
                                                                                    {/* Divider Line */}
                                                                                    <div style={{
                                                                                        position: 'absolute', top: 0, left: 0, right: 0,
                                                                                        height: expandedDividerWidth,
                                                                                        background: expandedDividerColor,
                                                                                        margin: '0 15px'
                                                                                    }} />

                                                                                    {/* Language Toggles */}
                                                                                    <div style={{
                                                                                        height: '100%',
                                                                                        display: 'flex',
                                                                                        alignItems: 'flex-start',
                                                                                        paddingLeft: 15,
                                                                                        paddingTop: expandedTopGap,
                                                                                        gap: 8
                                                                                    }}>
                                                                                        {(() => {
                                                                                            const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                                                                                            const rowIds = Array.isArray(b?.props?.rowIds) ? b.props.rowIds : []
                                                                                            const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null
                                                                                            const toggleKeyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null
                                                                                            const toggleKeyLegacy = `table_${actualPageIndex}_${idx}_row_${ri}`
                                                                                            const toggleKey = toggleKeyStable || toggleKeyLegacy
                                                                                            const rowLangs = b.props.rowLanguages?.[ri] || expandedLanguages
                                                                                            const currentItems =
                                                                                                (toggleKeyStable ? assignment?.data?.[toggleKeyStable] : null) ||
                                                                                                assignment?.data?.[toggleKeyLegacy] ||
                                                                                                rowLangs

                                                                                            return currentItems.map((lang: any, li: number) => {
                                                                                                // Allow editing if item's level is at or below student's current level
                                                                                                // (e.g. MS student can edit PS toggles)
                                                                                                const isLevelAllowed = isLevelAtOrBelow(lang.level, lang.levels, student?.level);

                                                                                                const isLanguageAllowed = (() => {
                                                                                                    const code = lang.code
                                                                                                    if (isProfPolyvalent) {
                                                                                                        return code === 'fr'
                                                                                                    }
                                                                                                    return allowedLanguages.length === 0 || (code && allowedLanguages.includes(code)) ||
                                                                                                        (code === 'lb' && allowedLanguages.includes('ar')) ||
                                                                                                        (code === 'ar' && allowedLanguages.includes('ar')) ||
                                                                                                        ((code === 'uk' || code === 'gb') && allowedLanguages.includes('en'))
                                                                                                })();
                                                                                                const isAllowed = isLevelAllowed && isLanguageAllowed;
                                                                                                const isLanguageDone = isLanguageCompletedForSemester(activeSemester, lang.code)
                                                                                                const canToggle = canEditActive && isAllowed && !isLanguageDone

                                                                                                const size = Math.max(12, Math.min(expandedRowHeight - 12, 20))
                                                                                                const isActive = lang.active

                                                                                                if (toggleStyle === 'v1') {
                                                                                                    const logo = lang.logo || (() => {
                                                                                                        const c = (lang.code || '').toLowerCase()
                                                                                                        if (c === 'en' || c === 'uk' || c === 'gb') return 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg'
                                                                                                        if (c === 'fr') return 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg'
                                                                                                        if (c === 'ar' || c === 'lb') return 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg'
                                                                                                        return ''
                                                                                                    })()

                                                                                                    return (
                                                                                                        <div
                                                                                                            key={li}
                                                                                                            style={{
                                                                                                                width: size,
                                                                                                                height: size,
                                                                                                                borderRadius: '50%',
                                                                                                                overflow: 'hidden',
                                                                                                                position: 'relative',
                                                                                                                boxShadow: isActive ? '0 0 0 2px #6c5ce7' : 'none',
                                                                                                                opacity: canToggle ? (isActive ? 1 : 0.6) : (isActive ? 0.9 : 0.5),
                                                                                                                cursor: canToggle ? 'pointer' : 'default',
                                                                                                                zIndex: 100
                                                                                                            }}
                                                                                                            onMouseDown={async (e) => {
                                                                                                                e.stopPropagation()
                                                                                                                e.preventDefault()
                                                                                                                if (!canToggle) return
                                                                                                                const newItems = [...currentItems]
                                                                                                                newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                                if (assignment) {
                                                                                                                    const newData = { ...assignment.data, [toggleKey]: newItems }
                                                                                                                    setAssignment({ ...assignment, data: newData })
                                                                                                                    try {
                                                                                                                        await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [toggleKey]: newItems } })
                                                                                                                        emitAssignmentDataUpdate({ [toggleKey]: newItems })
                                                                                                                    } catch (err) {
                                                                                                                        setError('Erreur sauvegarde')
                                                                                                                    }
                                                                                                                }
                                                                                                            }}
                                                                                                        >
                                                                                                            {logo ? <img src={logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isActive ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                                                                        </div>
                                                                                                    )
                                                                                                }

                                                                                                const getEmoji = (item: any) => {
                                                                                                    const e = item.emoji
                                                                                                    if (e && e.length >= 2) return e
                                                                                                    const c = (item.code || '').toLowerCase()
                                                                                                    if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                                                                    if (c === 'fr') return '🇫🇷'
                                                                                                    if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                                                                    return '🏳️'
                                                                                                }
                                                                                                const emoji = getEmoji(lang)
                                                                                                const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`

                                                                                                return (
                                                                                                    <div
                                                                                                        key={li}
                                                                                                        title={
                                                                                                            isAllowed
                                                                                                                ? lang.label
                                                                                                                : `${lang.label}${lang?.level && student?.level ? ` (niveau ${lang.level} ≠ ${student.level})` : ''}`
                                                                                                        }
                                                                                                        style={{
                                                                                                            width: size,
                                                                                                            height: size,
                                                                                                            minWidth: size,
                                                                                                            borderRadius: '50%',
                                                                                                            background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                                                                                            border: isActive ? '0.25px solid #fff' : '0.25px solid #fff',
                                                                                                            display: 'flex',
                                                                                                            alignItems: 'center',
                                                                                                            justifyContent: 'center',
                                                                                                            transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                                                                                            boxShadow: 'none',
                                                                                                            opacity: canToggle ? (isActive ? 1 : 0.6) : (isActive ? 0.9 : 0.5),
                                                                                                            cursor: canToggle ? 'pointer' : 'default',
                                                                                                            zIndex: 100
                                                                                                        }}
                                                                                                        onMouseDown={async (e) => {
                                                                                                            e.stopPropagation()
                                                                                                            e.preventDefault()
                                                                                                            if (!canToggle) return
                                                                                                            const newItems = [...currentItems]
                                                                                                            newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                            if (assignment) {
                                                                                                                const newData = { ...assignment.data, [toggleKey]: newItems }
                                                                                                                setAssignment({ ...assignment, data: newData })
                                                                                                                try {
                                                                                                                    await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [toggleKey]: newItems } })
                                                                                                                    emitAssignmentDataUpdate({ [toggleKey]: newItems })
                                                                                                                } catch (err) {
                                                                                                                    setError('Erreur sauvegarde')
                                                                                                                }
                                                                                                            }
                                                                                                        }}
                                                                                                    >
                                                                                                        <img src={appleEmojiUrl} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                                                                    </div>
                                                                                                )
                                                                                            })
                                                                                        })()}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })
                                                                )}
                                                            </div>
                                                        )
                                                    })()
                                                )}
                                                {b.type === 'qr' && (
                                                    <img
                                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=${b.props.width || 120}x${b.props.height || 120}&data=${encodeURIComponent(b.props.url || '')}`}
                                                        style={{
                                                            width: b.props.width || 120,
                                                            height: b.props.height || 120
                                                        }}
                                                        alt="QR Code"
                                                    />
                                                )}
                                                {b.type === 'promotion_info' && (
                                                    <div style={{
                                                        width: b.props.width || (b.props.field ? 150 : 300),
                                                        height: b.props.height || (b.props.field ? 30 : 100),
                                                        border: b.props.field ? 'none' : '1px solid #6c5ce7',
                                                        padding: b.props.field ? 0 : 10,
                                                        borderRadius: 8,
                                                        fontSize: b.props.fontSize || 12,
                                                        color: b.props.color || '#2d3436',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        textAlign: 'center'
                                                    }}>
                                                        {(() => {
                                                            // Level filtering: if block has a specific level, check if it matches student's level
                                                            if (b.props.level && student?.level && b.props.level !== student.level) {
                                                                return null
                                                            }

                                                            // Target Level filtering: only show if student is in the level preceding targetLevel
                                                            if (b.props.targetLevel && student?.level) {
                                                                const next = getNextLevel(student.level)
                                                                if (next !== b.props.targetLevel) return null
                                                            }

                                                            const promotions = assignment?.data?.promotions || []
                                                            const blockLevel = getBlockLevel(b)
                                                            const explicitTarget = b.props.targetLevel as string | undefined

                                                            if (b.props.field === 'student') return <div>{student?.firstName} {student?.lastName}</div>
                                                            if (b.props.field === 'studentFirstName') return <div>{student?.firstName}</div>
                                                            if (b.props.field === 'studentLastName') return <div>{student?.lastName}</div>
                                                            if (b.props.field === 'currentLevel') return <div>{student?.level}</div>

                                                            let promo: any = null

                                                            // Strategy 1: Match by explicit target level
                                                            if (explicitTarget) {
                                                                promo = promotions.find((p: any) => p.to === explicitTarget)
                                                            }

                                                            // Strategy 2: Match by block level (from)
                                                            if (!promo && blockLevel) {
                                                                promo = promotions.find((p: any) => p.from === blockLevel)
                                                            }

                                                            // Strategy 3: If only one promotion exists and no specific target/level
                                                            if (!promo && !explicitTarget && !blockLevel) {
                                                                if (promotions.length === 1) {
                                                                    promo = { ...(promotions[0] as any) }
                                                                }
                                                            }

                                                            // Strategy 4: Fallback - create prediction based on active year
                                                            if (!promo) {
                                                                let startYear;
                                                                if (activeYear && activeYear.name) {
                                                                    const m = activeYear.name.match(/(\d{4})/)
                                                                    if (m) {
                                                                        startYear = parseInt(m[1], 10)
                                                                    }
                                                                }

                                                                if (!startYear) {
                                                                    const currentYear = new Date().getFullYear()
                                                                    const month = new Date().getMonth()
                                                                    startYear = month >= 8 ? currentYear : currentYear - 1
                                                                }

                                                                const displayYear = `${startYear}/${startYear + 1}`
                                                                const baseLevel = blockLevel || student?.level || ''
                                                                const targetLevel = explicitTarget || getNextLevel(baseLevel) || '?'

                                                                promo = {
                                                                    year: displayYear,
                                                                    from: baseLevel,
                                                                    to: targetLevel,
                                                                    class: student?.className || ''
                                                                }
                                                            } else {
                                                                // Enrich existing promo with current data if missing
                                                                if (!promo.class && student?.className) promo.class = student.className
                                                                if (!promo.from) {
                                                                    if (blockLevel) promo.from = blockLevel
                                                                    else if (student?.level) promo.from = student.level
                                                                }
                                                            }

                                                            if (promo) {
                                                                const yearLabel = getPromotionYearLabel(promo, blockLevel)
                                                                if (!b.props.field) {
                                                                    return (
                                                                        <>
                                                                            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                                            <div>{student?.firstName} {student?.lastName}</div>
                                                                            <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Année {yearLabel}</div>
                                                                        </>
                                                                    )
                                                                } else if (b.props.field === 'level') {
                                                                    return <div style={{ fontWeight: 'bold' }}>{promo.to}</div>
                                                                } else if (b.props.field === 'student') {
                                                                    return <div>{student?.firstName} {student?.lastName}</div>
                                                                } else if (b.props.field === 'studentFirstName') {
                                                                    return <div>{student?.firstName}</div>
                                                                } else if (b.props.field === 'studentLastName') {
                                                                    return <div>{student?.lastName}</div>
                                                                } else if (b.props.field === 'year') {
                                                                    return <div>{yearLabel}</div>
                                                                } else if (b.props.field === 'currentYear') {
                                                                    const label = activeYear?.name || promo.year || ''
                                                                    return <div>{String(label)}</div>
                                                                } else if (b.props.field === 'class') {
                                                                    const raw = promo.class || ''
                                                                    const parts = raw.split(/\s*[-\s]\s*/)
                                                                    const section = parts.length ? parts[parts.length - 1] : raw
                                                                    return <div>{section}</div>
                                                                } else if (b.props.field === 'currentLevel') {
                                                                    return <div>{promo.from || ''}</div>
                                                                }
                                                            }
                                                            return null
                                                        })()}
                                                    </div>
                                                )}
                                                {b.type === 'teacher_text' && (
                                                    <div style={{
                                                        width: b.props.width || 300,
                                                        height: b.props.height || 60,
                                                        border: '1px solid #ddd',
                                                        borderRadius: 4,
                                                        padding: 8,
                                                        fontSize: b.props.fontSize || 12,
                                                        color: b.props.color || '#2d3436',
                                                        background: (canEditActive && isProfPolyvalent) ? '#fff' : '#f9f9f9',
                                                        cursor: (canEditActive && isProfPolyvalent) ? 'text' : 'not-allowed',
                                                        position: 'relative'
                                                    }}>
                                                        {(() => {
                                                            // Level filtering: if block has a specific level, check if it matches student's level
                                                            if (b.props.level && student?.level && b.props.level !== student.level) {
                                                                return null
                                                            }

                                                            const stableBlockId =
                                                                typeof b?.props?.blockId === 'string' && b.props.blockId.trim()
                                                                    ? b.props.blockId.trim()
                                                                    : null
                                                            const blockId = stableBlockId || `teacher_text_${actualPageIndex}_${idx}`
                                                            const textValue = assignment?.data?.[blockId] || ''

                                                            if (canEditActive && isProfPolyvalent) {
                                                                return (
                                                                    <textarea
                                                                        value={textValue}
                                                                        placeholder={b.props.placeholder || 'Tapez votre texte ici...'}
                                                                        onChange={async (e) => {
                                                                            const newValue = e.target.value
                                                                            if (assignment) {
                                                                                const newData = { ...assignment.data, [blockId]: newValue }
                                                                                setAssignment({ ...assignment, data: newData })

                                                                                try {
                                                                                    await api.patch(`/teacher/template-assignments/${assignment._id}/data`, { data: { [blockId]: newValue } })
                                                                                    emitAssignmentDataUpdate({ [blockId]: newValue })
                                                                                    setSaveStatus('Enregistré avec succès ✓')
                                                                                    setTimeout(() => setSaveStatus(''), 2000)
                                                                                } catch (err) {
                                                                                    console.error('Failed to save teacher text:', err)
                                                                                    setSaveStatus('Erreur de sauvegarde ❌')
                                                                                    setTimeout(() => setSaveStatus(''), 3000)
                                                                                }
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            height: '100%',
                                                                            border: 'none',
                                                                            outline: 'none',
                                                                            resize: 'none',
                                                                            background: 'transparent',
                                                                            fontSize: 'inherit',
                                                                            color: 'inherit',
                                                                            fontFamily: 'inherit'
                                                                        }}
                                                                    />
                                                                )
                                                            } else {
                                                                return (
                                                                    <div style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        whiteSpace: 'pre-wrap',
                                                                        color: textValue ? 'inherit' : '#999'
                                                                    }}>
                                                                        {textValue || (b.props.placeholder || 'Texte éditable par le prof polyvalent...')}
                                                                    </div>
                                                                )
                                                            }
                                                        })()}
                                                        {b.props.label && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: -10,
                                                                left: 8,
                                                                background: '#fff',
                                                                padding: '2px 6px',
                                                                fontSize: 10,
                                                                color: '#e17055',
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {b.props.label}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {b.type === 'final_signature_box' && (
                                                    <div style={{
                                                        width: b.props.width || 200,
                                                        height: b.props.height || 80,
                                                        border: 'none',
                                                        background: '#fff',
                                                        display: 'none',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10,
                                                        color: '#999',
                                                    }}>
                                                        {assignment?.status === 'signed' ? '✓ Signé Fin Année' : b.props.label || 'Signature Fin Année'}
                                                    </div>
                                                )}
                                                {b.type === 'final_signature_info' && (
                                                    <div style={{
                                                        width: b.props.width || 150,
                                                        height: b.props.height || 30,
                                                        fontSize: b.props.fontSize || 12,
                                                        color: b.props.color || '#333',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: b.props.align || 'flex-start'
                                                    }}>
                                                        {assignment?.status === 'signed' ? (
                                                            <>
                                                                {b.props.field === 'year' && (
                                                                    <span>
                                                                        {(() => {
                                                                            const sigs = assignment?.data?.signatures || []
                                                                            const finalSig = sigs.find((s: any) => s.type === 'end_of_year')
                                                                            if (finalSig && finalSig.schoolYearName) return finalSig.schoolYearName
                                                                            if (activeYear && activeYear.name) return activeYear.name
                                                                            return new Date().getFullYear()
                                                                        })()}
                                                                    </span>
                                                                )}
                                                                {b.props.field === 'student' && <span>{student?.firstName} {student?.lastName}</span>}
                                                                {b.props.field === 'studentFirstName' && <span>{student?.firstName}</span>}
                                                                {b.props.field === 'studentLastName' && <span>{student?.lastName}</span>}
                                                                {b.props.field === 'nextLevel' && <span>{getNextLevel(student?.level || '')}</span>}
                                                            </>
                                                        ) : (
                                                            <span style={{ color: '#ccc' }}>{b.props.placeholder || '...'}</span>
                                                        )}
                                                    </div>
                                                )}
                                                {b.type === 'signature_box' && (
                                                    <div style={{
                                                        width: b.props.width || 200,
                                                        height: b.props.height || 80,
                                                        border: 'none',
                                                        background: '#fff',
                                                        display: 'none',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10,
                                                        color: '#999',
                                                    }}>
                                                        {assignment?.status === 'signed' ? '✓ Signé' : b.props.label || 'Signature'}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
