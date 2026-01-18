import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../api'
import { useSocket } from '../context/SocketContext'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import { GradebookPocket } from '../components/GradebookPocket'
import { CroppedImage } from '../components/CroppedImage'
import Modal from '../components/Modal'
import Toast, { ToastType } from '../components/Toast'
import ScrollToTopButton from '../components/ScrollToTopButton'
import ScrollPageDownButton from '../components/ScrollPageDownButton'
import { openPdfExport, buildStudentPdfUrl } from '../utils/pdfExport'
import { formatDdMmYyyyColon } from '../utils/dateFormat'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[]; signingPage?: number }
type Student = { _id: string; firstName: string; lastName: string; level?: string; className?: string; dateOfBirth?: Date | string; avatarUrl?: string }
type TeacherStatusCategory = {
    teachers: { id: string; name: string }[]
    doneSem1: boolean
    doneSem2: boolean
    doneOverall: boolean
}
type TeacherStatus = {
    arabic: TeacherStatusCategory
    english: TeacherStatusCategory
    polyvalent: TeacherStatusCategory
}
type Assignment = {
    _id: string;
    status: string;
    templateVersion?: number;
    data?: any;
    isCompleted?: boolean;
    isCompletedSem1?: boolean;
    isCompletedSem2?: boolean;
    teacherCompletions?: {
        teacherId: string
        completed?: boolean
        completedSem1?: boolean
        completedSem2?: boolean
        completedAt?: string
        completedAtSem1?: string
        completedAtSem2?: string
    }[]
}

const pageWidth = 800
const pageHeight = 1120

export default function SubAdminTemplateReview() {
    const { assignmentId } = useParams<{ assignmentId: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe/')
    const apiPrefix = isAefeUser ? '/aefe' : '/subadmin'
    const dashboardPath = isAefeUser ? '/aefe/dashboard' : '/subadmin/dashboard'
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
    const [finalSignature, setFinalSignature] = useState<any>(null)
    const [teacherStatus, setTeacherStatus] = useState<TeacherStatus | null>(null)
    const [selectedPage, setSelectedPage] = useState(0)
    const [continuousScroll, setContinuousScroll] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Debug helper
    useEffect(() => {
        if (student) {
            console.log('[SubAdminTemplateReview] Student data loaded:', {
                firstName: student.firstName,
                level: student.level,
                className: student.className,
                fullObject: student
            })
        }
    }, [student])

    const [signing, setSigning] = useState(false)
    const [unsigning, setUnsigning] = useState(false)
    const [signingFinal, setSigningFinal] = useState(false)
    const [unsigningFinal, setUnsigningFinal] = useState(false)
    const [isPromoted, setIsPromoted] = useState(false)
    const [isSignedByMe, setIsSignedByMe] = useState(false)
    const [activeSemester, setActiveSemester] = useState<number>(1)
    const [eligibleForSign, setEligibleForSign] = useState<boolean>(false)

    const [promoting, setPromoting] = useState(false)
    const [canEdit, setCanEdit] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)
    const [subadminAssignedLevels, setSubadminAssignedLevels] = useState<string[]>([])
    const [zoomLevel, setZoomLevel] = useState(1)
    const [isFitToScreen, setIsFitToScreen] = useState(false)
    const containerRef = useRef<HTMLDivElement | null>(null)

    const computeFitScale = () => {
        const containerWidth = containerRef.current ? containerRef.current.clientWidth : window.innerWidth
        const availableWidth = Math.max(0, Math.min(window.innerWidth, containerWidth) - 48)
        return availableWidth / pageWidth
    }

    // UI State
    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, content: React.ReactNode, onConfirm: () => void } | null>(null)
    const [hasSignature, setHasSignature] = useState<boolean | null>(null)
    const [signatureWarningModal, setSignatureWarningModal] = useState<boolean>(false)

    const { levels } = useLevels()
    const { activeYear } = useSchoolYear()
    const socket = useSocket()

    // Helper function to check if an item's level is at or below the student's current level
    // This allows sub-admins to edit toggles for PS, MS, GS based on student's current level
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

    const showToast = (message: string, type: ToastType = 'info') => {
        setToast({ message, type })
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
        if (!assignmentId || !socket) return

        const roomId = `assignment:${assignmentId}`
        socket.emit('join-room', roomId)

        const handleUpdate = (payload: any) => {
            if (payload.type === 'language-toggle') {
                setTemplate(prev => {
                    if (!prev) return prev
                    const updated = { ...prev }
                    const { pageIndex, blockIndex, items } = payload
                    if (updated.pages[pageIndex]?.blocks[blockIndex]) {
                        updated.pages[pageIndex].blocks[blockIndex].props.items = items
                    }
                    return updated
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
            if (!ack || ack.status !== 'ok') console.warn('Socket update ack failed', ack)
        })
    }

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
                setTemplate(r.data.template)
                setStudent(r.data.student)
                setAssignment(r.data.assignment)
                setSignature(r.data.signature)
                setFinalSignature(r.data.finalSignature)
                setTeacherStatus(r.data.teacherStatus || null)
                setCanEdit(r.data.canEdit)
                setIsPromoted(r.data.isPromoted)
                setIsSignedByMe(r.data.isSignedByMe)
                setActiveSemester(r.data.activeSemester || 1)
                setEligibleForSign(r.data.eligibleForSign === true)
                setSubadminAssignedLevels(r.data.subadminAssignedLevels || [])
            } catch (e: any) {
                setError('Impossible de charger le carnet')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (assignmentId) loadData()
    }, [assignmentId, apiPrefix])

    // Check if user has a signature
    useEffect(() => {
        const checkSignature = async () => {
            try {
                const r = await api.get(`${apiPrefix}/signature`)
                setHasSignature(!!r.data.signatureUrl)
            } catch (e: any) {
                if (e.response?.status === 404) {
                    setHasSignature(false)
                } else {
                    console.error('Error checking signature:', e)
                }
            }
        }
        checkSignature()
    }, [apiPrefix])

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
            const payload: any = { type: 'language_toggle', pageIndex, blockIndex, items }
            const expected = (assignment as any)?.dataVersion
            if (typeof expected === 'number') payload.expectedDataVersion = expected

            const res = await api.patch(`${apiPrefix}/templates/${assignmentId}/data`, payload)

            // Update local state
            if (template) {
                const newTemplate = { ...template }
                newTemplate.pages[pageIndex].blocks[blockIndex].props.items = items
                setTemplate(newTemplate)

                if (socket && assignmentId) {
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
                        if (!ack || ack.status !== 'ok') console.warn('Socket ack failed for language-toggle', ack)
                    })
                }
            }

            // update local assignment dataVersion if returned
            if (res && res.data && typeof res.data.dataVersion === 'number') {
                setAssignment(prev => prev ? ({ ...prev, data: prev.data, dataVersion: res.data.dataVersion } as any) : prev)
            }
        } catch (e: any) {
            if (e?.response?.status === 409) {
                showToast('Conflit détecté — vos modifications n\'ont pas été appliquées. Rechargez.', 'error')
                try {
                    const fresh = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
                    setTemplate(fresh.data.template)
                    setAssignment(fresh.data.assignment)
                } catch (err) {
                    console.error('Failed to reload after conflict', err)
                }
            } else {
                showToast('Échec de l\'enregistrement', 'error')
                console.error(e)
            }
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
        if (/\bPS\b/.test(label)) return 'PS'
        if (/\bMS\b/.test(label)) return 'MS'
        if (/\bGS\b/.test(label)) return 'GS'
        if (/\bEB1\b/.test(label)) return 'EB1'
        if (/\bKG1\b/.test(label)) return 'KG1'
        if (/\bKG2\b/.test(label)) return 'KG2'
        if (/\bKG3\b/.test(label)) return 'KG3'
        return null
    }

    const getSemesterNumber = (b: Block): 1 | 2 | null => {
        const raw = (b.props as any)?.semester ?? (b.props as any)?.semestre ?? null
        if (raw === 1 || raw === '1') return 1
        if (raw === 2 || raw === '2') return 2
        const p = String((b.props as any)?.period || '')
        if (p === 'mid-year') return 1
        if (p === 'end-year') return 2
        return null
    }

    const pickSignatureForLevelAndSemester = (opts: { level: string | null; semester: 1 | 2 | null }) => {
        const { level, semester } = opts
        const sigs: any[] = []
        const history = assignment?.data?.signatures
        if (Array.isArray(history)) sigs.push(...history)
        if (signature) sigs.push(signature as any)
        if (finalSignature) sigs.push(finalSignature as any)

        const promotions = Array.isArray(assignment?.data?.promotions) ? assignment?.data?.promotions : []
        const normalizeLevel = (val: any) => String(val || '').trim().toLowerCase()
        const normLevel = normalizeLevel(level)

        const matchesSemester = (s: any) => {
            const spid = String(s?.signaturePeriodId || '')
            const t = String(s?.type || 'standard')
            if (semester === 1) return spid.endsWith('_sem1') || t === 'standard'
            if (semester === 2) return spid.endsWith('_sem2') || spid.endsWith('_end_of_year') || t === 'end_of_year'
            return true
        }

        const matchesLevel = (s: any) => {
            if (!normLevel) return true
            const sLevel = normalizeLevel(s?.level)
            if (sLevel) return sLevel === normLevel

            if (s?.schoolYearName) {
                const promo = promotions.find((p: any) => String(p?.year || '') === String(s.schoolYearName))
                const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
                if (promoFrom && promoFrom === normLevel) return true
            }

            if (s?.schoolYearId) {
                const promo = promotions.find((p: any) => String(p?.schoolYearId || '') === String(s.schoolYearId))
                const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
                if (promoFrom && promoFrom === normLevel) return true
            }

            const studentLevel = normalizeLevel(student?.level)
            return !!studentLevel && studentLevel === normLevel
        }

        const filtered = sigs
            .filter(s => s && s?.signedAt)
            .filter(matchesSemester)
            .filter(matchesLevel)
            .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())

        return filtered[0] || null
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

    const isBlockVisible = (b: Block) => {
        const blockLevel = getBlockLevel(b)

        // Case 1: Block has NO specific level (generic)
        if (!blockLevel) {
            // Use current active signature state
            if (b.props.period === 'mid-year' && !signature && !b.props.field?.includes('signature')) return false
            if (b.props.period === 'end-year' && !finalSignature && !b.props.field?.includes('signature')) return false
            return true
        }

        // Case 2: Block HAS a level
        // Check if we have a signature for that level
        let isSignedStandard = false
        let isSignedFinal = false

        // Check current props
        if (student?.level === blockLevel) {
            if (signature) isSignedStandard = true
            if (finalSignature) isSignedFinal = true
        }

        // Check history
        if (!isSignedStandard || !isSignedFinal) {
            const history = assignment?.data?.signatures || []
            const promotions = assignment?.data?.promotions || []

            history.forEach((sig: any) => {
                if (sig.schoolYearName) {
                    const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                    if (promo && promo.from === blockLevel) {
                        if (sig.type === 'standard' || !sig.type) isSignedStandard = true
                        if (sig.type === 'end_of_year') isSignedFinal = true
                    }
                }
            })
        }

        if (b.props.period === 'mid-year' && !isSignedStandard && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false
        if (b.props.period === 'end-year' && !isSignedFinal && !b.props.field?.includes('signature') && b.type !== 'signature_box' && b.type !== 'final_signature_box') return false

        return true
    }

    const handlePromote = async () => {
        if (!student?.level) return
        const next = getNextLevel(student.level)
        if (!next) return

        setConfirmModal({
            isOpen: true,
            title: 'Confirmer la promotion',
            content: (
                <div>
                    <p>Voulez-vous vraiment faire passer <strong>{student.firstName}</strong> en <strong>{next}</strong> ?</p>
                    <p style={{ color: '#64748b', fontSize: '0.9em' }}>L'élève sera retiré de sa classe actuelle.</p>
                </div>
            ),
            onConfirm: async () => {
                try {
                    setPromoting(true)
                    const r = await api.post(`${apiPrefix}/templates/${assignmentId}/promote`, { nextLevel: next })
                    showToast('Élève promu avec succès !', 'success')

                    if (r.data.student) setStudent(r.data.student)
                    if (r.data.assignment) setAssignment(r.data.assignment)
                    setIsPromoted(true)
                } catch (e: any) {
                    if (e.response?.data?.error === 'already_promoted') {
                        showToast('Cet élève a déjà été promu cette année.', 'info')
                    } else if (e.response?.data?.message) {
                        showToast(`Échec de la promotion: ${e.response.data.message}`, 'error')
                    } else {
                        showToast('Échec de la promotion', 'error')
                    }
                    console.error(e)
                } finally {
                    setPromoting(false)
                    setConfirmModal(null)
                }
            }
        })
    }

    const handleSign = async () => {
        // Check if user has a signature
        if (hasSignature === false) {
            setSignatureWarningModal(true)
            return
        }

        const isSem1Done = assignment?.isCompletedSem1 || assignment?.isCompleted
        if (!isSem1Done) {
            showToast('Le semestre 1 n\'est pas terminé par les enseignants.', 'error')
            return
        }

        if (!eligibleForSign) {
            showToast('Le carnet n\'est pas encore prêt pour la signature ou vous n\'êtes pas assigné.', 'error')
            return
        }
        try {
            setSigning(true)
            const response = await api.post(`${apiPrefix}/templates/${assignmentId}/sign`)
            console.log('[handleSign] Sign response:', response.data)
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            console.log('[handleSign] Review response:', r.data)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
            setEligibleForSign(r.data.eligibleForSign === true)
            showToast('Carnet signé avec succès', 'success')
        } catch (e: any) {
            console.error('[handleSign] Error:', e)
            const errorMsg = e.response?.data?.message || e.response?.data?.error || 'Échec de la signature'
            showToast(errorMsg, 'error')
        } finally {
            setSigning(false)
        }
    }

    const handleUnsign = async () => {
        try {
            setUnsigning(true)
            await api.delete(`${apiPrefix}/templates/${assignmentId}/sign`)
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
            showToast('Signature annulée', 'success')
        } catch (e: any) {
            showToast('Échec de la suppression de signature', 'error')
            console.error(e)
        } finally {
            setUnsigning(false)
        }
    }

    const handleSignFinal = async () => {
        // Check if user has a signature
        if (hasSignature === false) {
            setSignatureWarningModal(true)
            return
        }

        const isSem2Done = assignment?.isCompletedSem2
        if (!isSem2Done) {
            showToast('Le semestre 2 n\'est pas terminé par les enseignants.', 'info')
            return
        }
        try {
            setSigningFinal(true)
            await api.post(`${apiPrefix}/templates/${assignmentId}/sign`, { type: 'end_of_year' })
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
            showToast('Carnet signé (fin d\'année) avec succès', 'success')
        } catch (e: any) {
            showToast('Échec de la signature fin d\'année', 'error')
            console.error(e)
        } finally {
            setSigningFinal(false)
        }
    }

    const handleUnsignFinal = async () => {
        try {
            setUnsigningFinal(true)
            await api.delete(`${apiPrefix}/templates/${assignmentId}/sign`, { data: { type: 'end_of_year' } })
            const r = await api.get(`${apiPrefix}/templates/${assignmentId}/review`)
            setSignature(r.data.signature)
            setFinalSignature(r.data.finalSignature)
            setAssignment(r.data.assignment)
            setIsSignedByMe(r.data.isSignedByMe)
            showToast('Signature (fin d\'année) annulée', 'success')
        } catch (e: any) {
            showToast('Échec de la suppression de signature fin d\'année', 'error')
            console.error(e)
        } finally {
            setUnsigningFinal(false)
        }
    }

    const handleExportPDF = async () => {
        if (template && student) {
            try {
                const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                const pdfUrl = buildStudentPdfUrl(base, student._id, template._id || '')
                const studentFullName = `${student.firstName} ${student.lastName}`
                openPdfExport(pdfUrl, studentFullName, 'single', 1)
            } catch (e: any) {
                showToast('Échec de l\'export PDF', 'error')
                console.error(e)
            }
        }
    }

    const getScopedData = (key: string, blockLevel: string | null) => {
        if (!assignment?.data) return undefined

        // 1. Try fully scoped key (Primary)
        if (blockLevel) {
            const scopedKey = `${key}_${blockLevel}`
            if (assignment.data[scopedKey] !== undefined) return assignment.data[scopedKey]
        }

        // 2. Fallback to unscoped key (Legacy), but ONLY if block matches origin level
        // Calculate origin level
        let originLevel = null
        const promotions = assignment.data.promotions || []
        if (promotions.length > 0) {
            // Sort by date/year to find first
            const sorted = [...promotions].sort((a: any, b: any) => {
                const da = new Date(a.date || 0).getTime()
                const db = new Date(b.date || 0).getTime()
                return da - db
            })
            originLevel = sorted[0].from
        }

        // If no promotions, assume origin is current level? Or allow fallback?
        // If promotions empty, it means student has always been in this level (or assignment created here).
        // So fallback is safe.
        const allowFallback = !originLevel || (blockLevel === originLevel) || !blockLevel

        if (allowFallback) {
            return assignment.data[key]
        }

        return undefined
    }

    const saveScopedData = async (key: string, blockLevel: string | null, value: any) => {
        if (!assignment) return

        const targetKey = blockLevel ? `${key}_${blockLevel}` : key

        const newData = { ...assignment.data, [targetKey]: value }
        setAssignment({ ...assignment, data: newData })

        try {
            await api.patch(`${apiPrefix}/templates/${assignment._id}/data`, { data: { [targetKey]: value } })
            emitAssignmentDataUpdate({ [targetKey]: value })
        } catch (err) {
            setError('Erreur sauvegarde')
        }
    }

    if (loading) return <div className="container"><div className="card"><div className="note">Chargement...</div></div></div>
    if (error && !template) return <div className="container"><div className="card"><div className="note" style={{ color: 'crimson' }}>{error}</div></div></div>
    if (!template) return <div className="container"><div className="card"><div className="note">Carnet introuvable</div></div></div>

    const renderTeacherPill = (label: string, cat: keyof TeacherStatus) => {
        const entry = teacherStatus?.[cat]
        const teachersLabel = entry?.teachers?.length ? entry.teachers.map(t => t.name).join(', ') : 'Non assigné'
        const done = activeSemester === 2 ? entry?.doneSem2 : entry?.doneSem1
        const statusLabel = entry?.teachers?.length ? (done ? 'Fait' : 'À faire') : 'Non assigné'
        const color = entry?.teachers?.length ? (done ? '#16a34a' : '#dc2626') : '#64748b'
        const bg = entry?.teachers?.length ? (done ? '#dcfce7' : '#fee2e2') : '#f1f5f9'
        const border = entry?.teachers?.length ? (done ? '#86efac' : '#fecaca') : '#e2e8f0'

        return (
            <div style={{
                padding: '10px 12px',
                borderRadius: 12,
                background: bg,
                border: `1px solid ${border}`,
                minWidth: 180,
                flex: '1 1 200px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{label}</div>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color,
                        background: 'rgba(255,255,255,0.7)',
                        borderRadius: 999,
                        padding: '4px 10px',
                        border: `1px solid ${border}`,
                        whiteSpace: 'nowrap'
                    }}>
                        {statusLabel}
                    </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#475569', lineHeight: 1.3 }}>
                    {teachersLabel}
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: 24 }}>
            <ScrollToTopButton />
            <ScrollPageDownButton />
            {template?.signingPage && (
                <button
                    onClick={() => {
                        const pIndex = (template.signingPage || 1) - 1
                        setSelectedPage(pIndex)
                        if (continuousScroll) {
                            setTimeout(() => {
                                const pageElement = document.getElementById(`page-${pIndex}`)
                                if (pageElement) {
                                    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                }
                            }, 100)
                        }
                    }}
                    title="Aller à la page de signature"
                    style={{
                        position: 'fixed',
                        right: '70px', // Left of the scroll buttons
                        bottom: '30px',
                        zIndex: 999,
                        padding: '10px 16px',
                        borderRadius: 24,
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}
                >
                    ✍️ Signature Page
                </button>
            )}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <Modal
                isOpen={!!confirmModal}
                onClose={() => setConfirmModal(null)}
                title={confirmModal?.title || ''}
                footer={
                    <>
                        <button className="btn secondary" onClick={() => setConfirmModal(null)}>Annuler</button>
                        <button className="btn" onClick={confirmModal?.onConfirm}>Confirmer</button>
                    </>
                }
            >
                {confirmModal?.content}
            </Modal>

            {/* Signature Warning Modal */}
            <Modal
                isOpen={signatureWarningModal}
                onClose={() => setSignatureWarningModal(false)}
                title="⚠️ Signature manquante"
                footer={
                    <>
                        <button
                            className="btn secondary"
                            onClick={() => setSignatureWarningModal(false)}
                            style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0'
                            }}
                        >
                            Annuler
                        </button>
                        <button
                            className="btn"
                            onClick={() => {
                                setSignatureWarningModal(false)
                                navigate(`${isAefeUser ? '/aefe' : '/subadmin'}/signature`)
                            }}
                            style={{
                                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                color: 'white',
                                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                            }}
                        >
                            ✍️ Ajouter ma signature
                        </button>
                    </>
                }
            >
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                        border: '3px solid #fecaca',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                        fontSize: 36
                    }}>
                        ✍️
                    </div>
                    <p style={{
                        fontSize: 16,
                        color: '#1e293b',
                        marginBottom: 12,
                        fontWeight: 500
                    }}>
                        Vous devez d'abord ajouter votre signature
                    </p>
                    <p style={{
                        fontSize: 14,
                        color: '#64748b',
                        lineHeight: 1.5
                    }}>
                        Pour signer les carnets des élèves, vous devez télécharger une image de votre signature.
                        Cette signature sera automatiquement insérée dans les carnets que vous signez.
                    </p>
                </div>
            </Modal>


            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>📝 Examen du carnet - {student ? `${student.firstName} ${student.lastName}` : 'Élève'}</h2>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="btn secondary" onClick={() => navigate(dashboardPath)} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: '#f1f5f9',
                                color: '#475569',
                                fontWeight: 500,
                                border: '1px solid #e2e8f0',
                                padding: '8px 12px'
                            }}>← Retour au tableau de bord</button>
                        </div>
                    </div>
                    {canEdit && !isAefeUser && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: editMode ? '#10b981' : '#64748b' }}>
                                {editMode ? 'Mode Édition' : 'Mode Lecture'}
                            </span>
                            <div
                                onClick={() => setEditMode(!editMode)}
                                style={{
                                    width: 48,
                                    height: 24,
                                    background: editMode ? '#10b981' : '#cbd5e1',
                                    borderRadius: 12,
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background 0.3s ease'
                                }}
                            >
                                <div style={{
                                    width: 20,
                                    height: 20,
                                    background: 'white',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    top: 2,
                                    left: editMode ? 26 : 2,
                                    transition: 'left 0.3s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                }} />
                            </div>
                        </div>
                    )}


                </div>
                <div style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'stretch',
                    padding: 14,
                    background: '#f8fafc',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <div style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#334155',
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 999,
                                padding: '6px 12px'
                            }}>
                                Niveau: {student?.level || '—'}
                            </div>
                            <div style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#334155',
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 999,
                                padding: '6px 12px'
                            }}>
                                Classe: {student?.className || '—'}
                            </div>
                            <div style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#1e40af',
                                background: '#dbeafe',
                                border: '1px solid #93c5fd',
                                borderRadius: 999,
                                padding: '6px 12px'
                            }}>
                                Semestre {activeSemester}
                            </div>
                        </div>
                    </div>
                    <div style={{ flex: '2 1 520px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
                        {renderTeacherPill('Arabe', 'arabic')}
                        {renderTeacherPill('Anglais', 'english')}
                        {renderTeacherPill('Polyvalent', 'polyvalent')}
                    </div>
                </div>
                <div className="note" style={{ marginTop: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>Statut:</span> {assignment?.status === 'signed' ? '✔️ Signé ✓' : assignment?.status === 'completed' ? '✅ Terminé' : assignment?.status}
                </div>
                {error && <div className="note" style={{ marginTop: 12, color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>{error}</div>}

                {!isAefeUser && (
                    <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!signature ? (
                            <button className="btn" onClick={handleSign} disabled={signing || !eligibleForSign || !(assignment?.isCompletedSem1 || assignment?.isCompleted)} style={{
                                background: (eligibleForSign && (assignment?.isCompletedSem1 || assignment?.isCompleted)) ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#cbd5e1',
                                fontWeight: 500,
                                padding: '12px 20px',
                                boxShadow: (eligibleForSign && (assignment?.isCompletedSem1 || assignment?.isCompleted)) ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                                cursor: (eligibleForSign && (assignment?.isCompletedSem1 || assignment?.isCompleted)) ? 'pointer' : 'not-allowed'
                            }}
                                title={!eligibleForSign ? "Le carnet n'est pas prêt pour la signature" : !(assignment?.isCompletedSem1 || assignment?.isCompleted) ? "Semestre 1 non terminé" : ""}
                            >
                                {signing ? '✍️ Signature...' : '✍️ Signer ce carnet'}
                            </button>
                        ) : (
                            <>
                                <div className="note" style={{
                                    padding: 12,
                                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                    borderRadius: 8,
                                    border: '1px solid #6ee7b7',
                                    color: '#065f46',
                                    fontWeight: 500
                                }}>
                                    ✅ Signé le {new Date(signature.signedAt).toLocaleString('fr-FR')}
                                </div>
                                <button className="btn" style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                }} onClick={handleUnsign} disabled={unsigning}>
                                    {unsigning ? '⏳ Annulation...' : '🔄 Annuler la signature'}
                                </button>
                            </>
                        )}

                        {!finalSignature ? (
                            <button className="btn" onClick={handleSignFinal} disabled={signingFinal || !(assignment?.isCompletedSem2) || activeSemester !== 2} style={{
                                background: (!(assignment?.isCompletedSem2) || activeSemester !== 2) ? '#cbd5e1' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                fontWeight: 500,
                                padding: '12px 20px',
                                boxShadow: (!(assignment?.isCompletedSem2) || activeSemester !== 2) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                                cursor: (!(assignment?.isCompletedSem2) || activeSemester !== 2) ? 'not-allowed' : 'pointer'
                            }}
                                title={activeSemester !== 2 ? "Le semestre 2 n'est pas encore actif" : !(assignment?.isCompletedSem2) ? "L'enseignant n'a pas encore terminé ce carnet (Semestre 2)" : ""}
                            >
                                {signingFinal ? '✍️ Signature...' : '✍️ Signer ce carnet fin années'}
                            </button>
                        ) : (
                            <>
                                <div className="note" style={{
                                    padding: 12,
                                    background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                                    borderRadius: 8,
                                    border: '1px solid #93c5fd',
                                    color: '#1e40af',
                                    fontWeight: 500
                                }}>
                                    ✅ Signé fin année le {new Date(finalSignature.signedAt).toLocaleString('fr-FR')}
                                </div>
                                <button className="btn" style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                }} onClick={handleUnsignFinal} disabled={unsigningFinal}>
                                    {unsigningFinal ? '⏳ Annulation...' : '🔄 Annuler la signature fin année'}
                                </button>
                            </>
                        )}

                        {student?.level && getNextLevel(student.level) && (
                            <button
                                className="btn"
                                onClick={handlePromote}
                                disabled={promoting || isPromoted || !finalSignature}
                                style={{
                                    background: (isPromoted || !finalSignature) ? '#cbd5e1' : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: (isPromoted || !finalSignature) ? 'none' : '0 2px 8px rgba(139, 92, 246, 0.3)',
                                    color: (isPromoted || !finalSignature) ? '#64748b' : 'white',
                                    border: 'none',
                                    cursor: (isPromoted || !finalSignature) ? 'not-allowed' : 'pointer'
                                }}
                                title={isPromoted ? "Élève déjà promu cette année" : !finalSignature ? "Vous devez signer le carnet (fin année) avant de promouvoir l'élève" : ""}
                            >
                                {promoting ? '⏳ Promotion...' : isPromoted ? 'Déjà promu' : `Passer en classe supérieure ${getNextLevel(student.level)}`}
                            </button>
                        )}

                        <button className="btn secondary" onClick={handleExportPDF} style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontWeight: 500,
                            border: '1px solid #e2e8f0',
                            padding: '12px 20px'
                        }}>📄 Exporter en PDF</button>
                    </div>
                )}

                <div style={{ marginTop: 20, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)} style={{
                        background: continuousScroll ? 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)' : '#f1f5f9',
                        color: continuousScroll ? 'white' : '#475569',
                        fontWeight: 500,
                        border: '1px solid #cbd5e1',
                        padding: '10px 16px'
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

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            className="btn secondary"
                            onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                            disabled={selectedPage === 0 || continuousScroll}
                            style={{
                                padding: '10px 16px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                opacity: (selectedPage === 0 || continuousScroll) ? 0.5 : 1
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
                                    setTimeout(() => {
                                        const pageElement = document.getElementById(`page-${pageNum}`)
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
                                background: 'white'
                            }}
                        >
                            {template.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
                        </select>
                        <button
                            className="btn secondary"
                            onClick={() => setSelectedPage(Math.min(template.pages.length - 1, selectedPage + 1))}
                            disabled={selectedPage === template.pages.length - 1 || continuousScroll}
                            style={{
                                padding: '10px 16px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                opacity: (selectedPage === template.pages.length - 1 || continuousScroll) ? 0.5 : 1
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
                    overflowX: 'hidden',
                    width: '100%'
                }}>
                    {(continuousScroll ? template.pages : [template.pages[selectedPage]]).map((page, pageIdx) => {
                        const actualPageIndex = continuousScroll ? pageIdx : selectedPage
                        return (
                            <div
                                key={actualPageIndex}
                                style={{
                                    width: pageWidth * zoomLevel,
                                    height: pageHeight * zoomLevel,
                                    position: 'relative',
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
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        transform: `scale(${zoomLevel})`,
                                        transformOrigin: 'top left',
                                        transition: 'transform 0.2s ease-out',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                        border: '1px solid #e2e8f0'
                                    }}
                                >
                                    {continuousScroll && <div style={{ position: 'absolute', top: -30, left: 0, color: '#888', fontSize: 14, fontWeight: 600 }}>Page {actualPageIndex + 1}</div>}
                                    <div className="page-margins" />
                                    {page.blocks.map((b, idx) => {
                                        if (!b || !b.props) return null;
                                        return (
                                            <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx, padding: 6 }}>
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
                                                        boxSizing: 'border-box',
                                                        // Visibility check
                                                        ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                                    }}>
                                                        {(b.props.items || []).map((it: any, i: number) => {
                                                            // Check level - item visibility for student
                                                            const isVisibleForStudent = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
                                                            // Check if subadmin has permission to edit this toggle based on assigned levels
                                                            const hasSubadminLevelPermission = subadminAssignedLevels.length === 0 ||
                                                                !(it.levels && it.levels.length > 0) ||
                                                                it.levels.some((lvl: string) => subadminAssignedLevels.includes(lvl))
                                                            const isAllowed = isVisibleForStudent && hasSubadminLevelPermission;

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
                                                                        cursor: (editMode && canEdit) ? (isAllowed ? 'pointer' : 'not-allowed') : 'default',
                                                                        boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                                                        transition: 'all 0.2s ease',
                                                                        transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                                                        opacity: isAllowed ? (it.active ? 1 : ((editMode && canEdit) ? 0.6 : 0.9)) : (it.active ? 0.9 : 0.5),
                                                                        filter: 'none'
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!editMode || !canEdit || !isAllowed) return
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
                                                                        <img src={it.logo} style={{ width: size * 0.9, height: size * 0.9, objectFit: 'contain' }} alt="" />
                                                                    ) : (
                                                                        <span style={{ fontSize: 20, lineHeight: 1 }}>{getEmoji(it)}</span>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
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
                                                {b.type === 'image' && <CroppedImage src={b.props.url} displayWidth={b.props.width || 120} displayHeight={b.props.height || 120} cropData={b.props.cropData} borderRadius={8} />}
                                                {b.type === 'student_photo' && (
                                                    student?.avatarUrl ? (
                                                        <img src={student.avatarUrl} style={{ width: b.props.width || 100, height: b.props.height || 100, objectFit: 'cover', borderRadius: 8 }} alt="Student" />
                                                    ) : (
                                                        <div style={{ width: b.props.width || 100, height: b.props.height || 100, borderRadius: 8, background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                                                            <div style={{ fontSize: 24 }}>👤</div>
                                                        </div>
                                                    )
                                                )}
                                                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                                                {b.type === 'gradebook_pocket' && (
                                                    <GradebookPocket
                                                        number={b.props.number || '1'}
                                                        width={b.props.width || 120}
                                                        fontSize={b.props.fontSize}
                                                    />
                                                )}
                                                {b.type === 'language_toggle' && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                                                        {(b.props.items || []).map((it: any, i: number) => {
                                                            // Check level - item visibility for student
                                                            const isVisibleForStudent = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
                                                            // Check if subadmin has permission to edit this toggle based on assigned levels
                                                            const hasSubadminLevelPermission = subadminAssignedLevels.length === 0 ||
                                                                !(it.levels && it.levels.length > 0) ||
                                                                it.levels.some((lvl: string) => subadminAssignedLevels.includes(lvl))
                                                            const isAllowed = isVisibleForStudent && hasSubadminLevelPermission;

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
                                                                        cursor: (editMode && canEdit) ? (isAllowed ? 'pointer' : 'not-allowed') : 'default',
                                                                        boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                                        transition: 'all 0.2s ease',
                                                                        opacity: isAllowed ? ((editMode && canEdit || it.active) ? 1 : 0.9) : (it.active ? 0.9 : 0.5)
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (!editMode || !canEdit || !isAllowed) return
                                                                        const newItems = [...(b.props.items || [])]
                                                                        newItems[i] = { ...newItems[i], active: !newItems[i].active }
                                                                        updateLanguageToggle(actualPageIndex, idx, newItems)
                                                                    }}
                                                                >
                                                                    {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
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
                                                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Nom, Classe, Naissance</div>}
                                                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                                                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                                                {b.type === 'dropdown' && (() => {
                                                    // Check visibility first
                                                    if (!isBlockVisible(b)) return null

                                                    // Check if dropdown is allowed for current level - allow if at or below student's level
                                                    const isLevelAllowed = isLevelAtOrBelow(undefined, b.props.levels, student?.level)
                                                    // Check if dropdown is allowed for current semester (default to both semesters if not specified)
                                                    const dropdownSemesters = b.props.semesters || [1, 2]
                                                    const isSemesterAllowed = dropdownSemesters.includes(activeSemester)
                                                    // Check if subadmin has permission to edit this dropdown based on assigned levels
                                                    const hasSubadminLevelPermission = subadminAssignedLevels.length === 0 ||
                                                        !(b.props.levels && b.props.levels.length > 0) ||
                                                        b.props.levels.some((lvl: string) => subadminAssignedLevels.includes(lvl))
                                                    const isDropdownAllowed = isLevelAllowed && isSemesterAllowed && hasSubadminLevelPermission

                                                    return (
                                                        <div style={{
                                                            width: b.props.width || 200,
                                                            position: 'relative',
                                                            opacity: isDropdownAllowed ? 1 : 0.5,
                                                            pointerEvents: isDropdownAllowed ? 'auto' : 'none'
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
                                                                    background: (editMode && canEdit && isDropdownAllowed) ? '#fff' : '#f9f9f9',
                                                                    cursor: (editMode && canEdit && isDropdownAllowed) ? 'pointer' : 'default',
                                                                    position: 'relative',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    wordWrap: 'break-word',
                                                                    whiteSpace: 'pre-wrap'
                                                                }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    if (!editMode || !canEdit || !isDropdownAllowed) return
                                                                    const key = `dropdown_${actualPageIndex}_${idx}`
                                                                    setOpenDropdown(openDropdown === key ? null : key)
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const rawKey = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                    const blockLevel = getBlockLevel(b)
                                                                    const currentValue = getScopedData(rawKey || '', blockLevel)
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
                                                                            if (!editMode || !canEdit || !isDropdownAllowed) return
                                                                            if (assignment) {
                                                                                const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                                const blockLevel = getBlockLevel(b)
                                                                                if (key) {
                                                                                    await saveScopedData(key, blockLevel, '')
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
                                                                                cursor: (editMode && canEdit && isDropdownAllowed) ? 'pointer' : 'default',
                                                                                fontSize: b.props.fontSize || 12,
                                                                                wordWrap: 'break-word',
                                                                                whiteSpace: 'pre-wrap',
                                                                                borderBottom: i < (b.props.options || []).length - 1 ? '1px solid #eee' : 'none',
                                                                                display: 'flex',
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center',
                                                                                gap: 8
                                                                            }}
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation()
                                                                                if (!editMode || !canEdit || !isDropdownAllowed) return
                                                                                if (assignment) {
                                                                                    const key = b.props.dropdownNumber ? `dropdown_${b.props.dropdownNumber}` : b.props.variableName
                                                                                    const blockLevel = getBlockLevel(b)
                                                                                    if (key) {
                                                                                        await saveScopedData(key, blockLevel, opt)
                                                                                    }
                                                                                }
                                                                                setOpenDropdown(null)
                                                                            }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.background = '#e8ecf8'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                                        >
                                                                            <span>{opt}</span>
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
                                                            const promotions = assignment?.data?.promotions || []
                                                            const blockLevel = getBlockLevel(b)
                                                            const explicitTarget = b.props.targetLevel as string | undefined

                                                            let promo: any = null

                                                            if (explicitTarget) {
                                                                promo = promotions.find((p: any) => p.to === explicitTarget)
                                                            }

                                                            if (!promo && blockLevel) {
                                                                promo = promotions.find((p: any) => p.from === blockLevel)
                                                            }

                                                            if (!promo && !explicitTarget && !blockLevel) {
                                                                if (promotions.length === 1) {
                                                                    promo = { ...(promotions[0] as any) }
                                                                }
                                                            }

                                                            if (!promo && blockLevel) {
                                                                const history = assignment?.data?.signatures || []
                                                                const isMidYearBlock = b.props.period === 'mid-year'
                                                                const wantEndOfYear = b.props.period === 'end-year'
                                                                const candidates = history.filter((sig: any) => {
                                                                    if (wantEndOfYear) {
                                                                        if (sig.type !== 'end_of_year') return false
                                                                    } else if (isMidYearBlock) {
                                                                        if (sig.type && sig.type !== 'standard') return false
                                                                    }
                                                                    if (sig.level && sig.level !== blockLevel) return false
                                                                    return true
                                                                }).sort((a: any, b: any) => {
                                                                    const ad = new Date(a.signedAt || 0).getTime()
                                                                    const bd = new Date(b.signedAt || 0).getTime()
                                                                    return bd - ad
                                                                })

                                                                const sig = candidates[0]
                                                                if (sig) {
                                                                    let yearLabel = sig.schoolYearName as string | undefined
                                                                    if (!yearLabel && sig.signedAt) {
                                                                        const d = new Date(sig.signedAt)
                                                                        const y = d.getFullYear()
                                                                        const m = d.getMonth()
                                                                        const startYear = m >= 8 ? y : y - 1
                                                                        yearLabel = `${startYear}/${startYear + 1}`
                                                                    }
                                                                    if (!yearLabel) {
                                                                        const currentYear = new Date().getFullYear()
                                                                        const startYear = currentYear
                                                                        yearLabel = `${startYear}/${startYear + 1}`
                                                                    }

                                                                    const baseLevel = blockLevel
                                                                    const target = explicitTarget || getNextLevel(baseLevel || '') || ''

                                                                    promo = {
                                                                        year: yearLabel,
                                                                        from: baseLevel,
                                                                        to: target || '?',
                                                                        class: student?.className || ''
                                                                    }
                                                                }
                                                            }

                                                            if (!promo) {
                                                                const blockIsCurrentLevel = !!blockLevel && !!student?.level && blockLevel === student.level
                                                                const isMidYearBlock = b.props.period === 'mid-year'
                                                                const hasMidSignature = !!signature
                                                                const hasFinalSignature = !!finalSignature
                                                                const canPredict = isMidYearBlock
                                                                    ? (hasMidSignature && (blockIsCurrentLevel || (!blockLevel && promotions.length === 0)))
                                                                    : (hasFinalSignature && (blockIsCurrentLevel || (!blockLevel && promotions.length === 0)))

                                                                if (!canPredict) {
                                                                    return null
                                                                }

                                                                let startYear = 0
                                                                if (activeYear && activeYear.name) {
                                                                    const m = activeYear.name.match(/(\d{4})/)
                                                                    if (m) startYear = parseInt(m[1], 10)
                                                                }

                                                                if (!startYear) return null

                                                                const baseLevel = blockLevel || student?.level || ''
                                                                const target = explicitTarget || getNextLevel(baseLevel || '') || ''
                                                                const displayYear = `${startYear}/${startYear + 1}`

                                                                promo = {
                                                                    year: displayYear,
                                                                    from: baseLevel,
                                                                    to: target || '?',
                                                                    class: student?.className || ''
                                                                }
                                                            } else {
                                                                if (!promo.class && student?.className) promo.class = student.className
                                                                if (!promo.from) {
                                                                    if (blockLevel) promo.from = blockLevel
                                                                    else if (student?.level) promo.from = student.level
                                                                }
                                                            }

                                                            if (promo) {
                                                                if (!b.props.field) {
                                                                    return (
                                                                        <>
                                                                            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                                            <div>{student?.firstName} {student?.lastName}</div>
                                                                            <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Next Year {getPromotionYearLabel(promo, blockLevel)}</div>
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
                                                                    return <div>{getPromotionYearLabel(promo, blockLevel)}</div>
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
                                                        background: '#f9f9f9',
                                                        position: 'relative',
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        {(() => {
                                                            // Level filtering: if block has a specific level, check if it matches student's level
                                                            if (b.props.level && student?.level && b.props.level !== student.level) {
                                                                return null
                                                            }

                                                            // Generate unique key for this teacher text block
                                                            const blockId = (b as any).id || `teacher_text_${actualPageIndex}_${idx}`
                                                            const textValue = assignment?.data?.[blockId] || ''

                                                            return (
                                                                <div style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    color: textValue ? 'inherit' : '#999'
                                                                }}>
                                                                    {textValue || (b.props.placeholder || 'Texte éditable par le prof polyvalent...')}
                                                                </div>
                                                            )
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
                                                                                            const blockLevel = getBlockLevel(b)
                                                                                            const currentItems =
                                                                                                (toggleKeyStable ? getScopedData(toggleKeyStable, blockLevel) : null) ||
                                                                                                getScopedData(toggleKeyLegacy, blockLevel) ||
                                                                                                rowLangs

                                                                                            return currentItems.map((lang: any, li: number) => {
                                                                                                // Allow editing if item's level is at or below student's current level
                                                                                                const isLevelAllowed = isLevelAtOrBelow(lang.level, lang.levels, student?.level);
                                                                                                // Check if subadmin has permission based on assigned levels
                                                                                                const hasSubadminLevelPermission = subadminAssignedLevels.length === 0 ||
                                                                                                    !lang.level ||
                                                                                                    subadminAssignedLevels.includes(lang.level)
                                                                                                const isAllowed = isLevelAllowed && hasSubadminLevelPermission;
                                                                                                const canToggle = editMode && canEdit && isAllowed;

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
                                                                                                                opacity: isActive ? 1 : (canToggle ? 0.6 : 0.5),
                                                                                                                cursor: canToggle ? 'pointer' : 'default'
                                                                                                            }}
                                                                                                            onClick={async (e) => {
                                                                                                                e.stopPropagation()
                                                                                                                if (!canToggle) return
                                                                                                                const newItems = [...currentItems]
                                                                                                                newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                                if (assignment) {
                                                                                                                    await saveScopedData(toggleKey, blockLevel, newItems)
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
                                                                                                        title={lang.label}
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
                                                                                                            opacity: isActive ? 1 : (canToggle ? 0.6 : 0.5),
                                                                                                            cursor: canToggle ? 'pointer' : 'default'
                                                                                                        }}
                                                                                                        onClick={async (e) => {
                                                                                                            e.stopPropagation()
                                                                                                            if (!canToggle) return
                                                                                                            const newItems = [...currentItems]
                                                                                                            newItems[li] = { ...newItems[li], active: !newItems[li].active }
                                                                                                            if (assignment) {
                                                                                                                await saveScopedData(toggleKey, blockLevel, newItems)
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
                                                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
                                                {b.type === 'signature_date' && (() => {
                                                    const configuredLevel = String((b.props as any)?.level || getBlockLevel(b) || '').trim() || null
                                                    const semester = getSemesterNumber(b)
                                                    const found = pickSignatureForLevelAndSemester({ level: configuredLevel, semester })
                                                    if (!found) return null

                                                    const dateStr = formatDdMmYyyyColon(found.signedAt)
                                                    const showMeta = (b.props as any)?.showMeta !== false
                                                    const prefix = 'Signé le:'
                                                    const semLabel = semester ? `S${semester}` : ''
                                                    const levelLabel = configuredLevel || ''
                                                    const metaPart = `${levelLabel}${levelLabel && semLabel ? ' ' : ''}${semLabel}`
                                                    const text = showMeta
                                                        ? `${prefix}${metaPart ? ` ${metaPart}` : ''} ${dateStr}`
                                                        : `${prefix} ${dateStr}`

                                                    return (
                                                        <div style={{
                                                            width: b.props.width || 220,
                                                            height: b.props.height || 34,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: b.props.align || 'flex-start',
                                                            fontSize: b.props.fontSize || 12,
                                                            color: b.props.color || '#111',
                                                            overflow: 'hidden',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {text}
                                                        </div>
                                                    )
                                                })()}
                                                {b.type === 'final_signature_box' && (
                                                    <div style={{
                                                        width: b.props.width || 200,
                                                        height: b.props.height || 80,
                                                        border: 'none',
                                                        background: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10,
                                                        color: '#999',
                                                        // Hide if not visible
                                                        ...((!isBlockVisible(b)) ? { display: 'none' } : {}),
                                                        // Ensure it's treated as end-year
                                                        ...((!finalSignature && !isBlockVisible({ ...b, props: { ...b.props, period: 'end-year' } })) ? { display: 'none' } : {})
                                                    }}>
                                                        {(() => {
                                                            if (finalSignature) return '✓ Signé Fin Année'
                                                            // Check history for end_of_year signature
                                                            const history = assignment?.data?.signatures || []
                                                            const promotions = assignment?.data?.promotions || []
                                                            const blockLevel = getBlockLevel(b)
                                                            if (blockLevel) {
                                                                const matchingSig = history.find((sig: any) => {
                                                                    if (sig.type !== 'end_of_year') return false
                                                                    if (sig.schoolYearName) {
                                                                        const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                                                                        if (promo && promo.from === blockLevel) return true
                                                                    }
                                                                    return false
                                                                })
                                                                if (matchingSig) return `✓ Signé (${matchingSig.schoolYearName || 'Ancien'})`
                                                            }
                                                            return null
                                                        })()}
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
                                                        {(() => {
                                                            const sigs = (assignment as any)?.data?.signatures || []
                                                            const finalSigData = sigs.filter((s: any) => s?.type === 'end_of_year').sort((a: any, b: any) => {
                                                                const ad = new Date(a.signedAt || 0).getTime()
                                                                const bd = new Date(b.signedAt || 0).getTime()
                                                                return bd - ad
                                                            })[0]
                                                            const hasData = !!finalSigData || !!finalSignature
                                                            if (!hasData) {
                                                                return <span style={{ color: '#ccc' }}>{b.props.placeholder || '...'}</span>
                                                            }
                                                            const yearLabel = (finalSigData && (finalSigData.schoolYearName || '')) || new Date().getFullYear()
                                                            const promos = (assignment as any)?.data?.promotions || []
                                                            const targetPromo = finalSigData ? promos.find((p: any) => String(p.year) === String(finalSigData.schoolYearName)) : null
                                                            const next = targetPromo ? targetPromo.to : getNextLevel(student?.level || '')
                                                            if (b.props.field === 'year') return <span>{String(yearLabel)}</span>
                                                            if (b.props.field === 'student') return <span>{student?.firstName} {student?.lastName}</span>
                                                            if (b.props.field === 'studentFirstName') return <span>{student?.firstName}</span>
                                                            if (b.props.field === 'studentLastName') return <span>{student?.lastName}</span>
                                                            if (b.props.field === 'nextLevel') return <span>{next || ''}</span>
                                                            return null
                                                        })()}
                                                    </div>
                                                )}
                                                {b.type === 'signature_box' && (
                                                    <div style={{
                                                        width: b.props.width || 200,
                                                        height: b.props.height || 80,
                                                        border: 'none',
                                                        background: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10,
                                                        color: '#999',
                                                        ...((!isBlockVisible(b)) ? { display: 'none' } : {})
                                                    }}>
                                                        {(() => {
                                                            const blockLevel = getBlockLevel(b)
                                                            const sigLevel = (signature as any)?.level
                                                            const finalSigLevel = (finalSignature as any)?.level

                                                            if (!blockLevel) {
                                                                if (b.props.period === 'end-year') {
                                                                    if (finalSignature) {
                                                                        return finalSignature.signatureUrl ? <img src={finalSignature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé Fin Année'
                                                                    }
                                                                } else {
                                                                    if (signature) {
                                                                        return signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'
                                                                    }
                                                                }
                                                            } else {
                                                                if (b.props.period === 'end-year') {
                                                                    if (finalSignature && ((finalSigLevel && finalSigLevel === blockLevel) || (!finalSigLevel && student?.level === blockLevel))) {
                                                                        return finalSignature.signatureUrl ? <img src={finalSignature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé Fin Année'
                                                                    }
                                                                } else {
                                                                    if (signature && ((sigLevel && sigLevel === blockLevel) || (!sigLevel && student?.level === blockLevel))) {
                                                                        return signature.signatureUrl ? <img src={signature.signatureUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : '✓ Signé'
                                                                    }
                                                                }
                                                            }

                                                            const history = assignment?.data?.signatures || []
                                                            const promotions = assignment?.data?.promotions || []

                                                            if (blockLevel) {
                                                                const matchingSig = history.find((sig: any) => {
                                                                    if (b.props.period === 'end-year' && sig.type !== 'end_of_year') return false
                                                                    if ((!b.props.period || b.props.period === 'mid-year') && (sig.type === 'end_of_year')) return false

                                                                    if (sig.level && sig.level === blockLevel) return true

                                                                    if (sig.schoolYearName) {
                                                                        const promo = promotions.find((p: any) => p.year === sig.schoolYearName)
                                                                        if (promo && promo.from === blockLevel) return true
                                                                    }
                                                                    return false
                                                                })

                                                                if (matchingSig) {
                                                                    return `✓ Signé (${matchingSig.schoolYearName || 'Ancien'})`
                                                                }
                                                            }

                                                            return null
                                                        })()}
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
