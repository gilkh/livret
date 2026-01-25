import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Check, X, Plus, Users, BookOpen, Shield, Globe, Download, Search, ChevronRight, AlertCircle, CheckCircle2, Loader2, Upload, FileText } from 'lucide-react'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import './AdminAssignments.css'
import { readTextFileWithFallback } from '../utils/textEncoding'
import * as XLSX from 'xlsx'

type User = { _id: string; email: string; displayName: string; role: string }
type Class = { _id: string; name: string; level?: string }
type Student = { _id: string; firstName: string; lastName: string }
type Template = { _id: string; name: string }

type TeacherAssignment = { _id: string; teacherId: string; classId: string; teacherName?: string; className?: string; languages?: string[]; isProfPolyvalent?: boolean }
type SubAdminAssignment = { _id: string; subAdminId: string; teacherId: string; subAdminName?: string; teacherName?: string }
type SubAdminLevelAssignment = { subAdminId: string; subAdminName: string; levels: string[] }
type TemplateAssignment = { _id: string; templateId: string; studentId: string; className?: string; classId?: string; templateName?: string }
type ImportableTeacherAssignment = {
    teacherId: string
    classId: string
    teacherName?: string
    className?: string
    languages?: string[]
    isProfPolyvalent?: boolean
}

type DeleteAction =
    | { type: 'teacher-assignment'; assignmentId: string; label: string }
    | { type: 'subadmin-level'; subAdminId: string; level: string; label: string }
    | { type: 'template-level'; templateId: string; level: string; label: string }

const TAB_CONFIG = {
    teacher: { icon: Users, label: 'Enseignants', color: '#3b82f6', bg: '#eff6ff' },
    subadmin: { icon: Shield, label: 'Sous-admins', color: '#8b5cf6', bg: '#f5f3ff' },
    aefe: { icon: Globe, label: 'AEFE', color: '#f59e0b', bg: '#fffbeb' },
    template: { icon: BookOpen, label: 'Carnets', color: '#10b981', bg: '#ecfdf5' },
} as const

export default function AdminAssignments() {
    const { levels } = useLevels()
    const { activeYearId, years } = useSchoolYear()
    const [teachers, setTeachers] = useState<User[]>([])
    const [subAdmins, setSubAdmins] = useState<User[]>([])
    const [aefeUsers, setAefeUsers] = useState<User[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [templates, setTemplates] = useState<Template[]>([])

    const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
    const [subAdminAssignments, setSubAdminAssignments] = useState<SubAdminAssignment[]>([])
    const [subAdminLevelAssignments, setSubAdminLevelAssignments] = useState<SubAdminLevelAssignment[]>([])
    const [templateAssignments, setTemplateAssignments] = useState<TemplateAssignment[]>([])

    const [selectedTeacher, setSelectedTeacher] = useState('')
    const [selectedClasses, setSelectedClasses] = useState<string[]>([])
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
    const [isProfPolyvalent, setIsProfPolyvalent] = useState(false)
    
    const [selectedLevelForSubAdmin, setSelectedLevelForSubAdmin] = useState('')
    const [selectedSubAdminForLevel, setSelectedSubAdminForLevel] = useState('')
    
    const [selectedLevelForAefe, setSelectedLevelForAefe] = useState('')
    const [selectedAefeForLevel, setSelectedAefeForLevel] = useState('')
    
    const [selectedLevelForTemplate, setSelectedLevelForTemplate] = useState('')
    const [selectedTemplateForLevel, setSelectedTemplateForLevel] = useState('')

    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [busyAction, setBusyAction] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'teacher' | 'subadmin' | 'aefe' | 'template'>('teacher')
    const [teacherQuery, setTeacherQuery] = useState('')
    const [classQuery, setClassQuery] = useState('')
    const [currentAssignmentsQuery, setCurrentAssignmentsQuery] = useState('')
    const [importQuery, setImportQuery] = useState('')
    const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    const [showImportModal, setShowImportModal] = useState(false)
    const [importFromYearId, setImportFromYearId] = useState('')
    const [availableImports, setAvailableImports] = useState<ImportableTeacherAssignment[]>([])
    const [selectedImportIndices, setSelectedImportIndices] = useState<Set<number>>(new Set())

    const [teacherFileErrors, setTeacherFileErrors] = useState<string[]>([])
    const [teacherFileStatus, setTeacherFileStatus] = useState<string>('')
    const [teacherFileReport, setTeacherFileReport] = useState<Array<{ line: number; status: 'success' | 'error'; message: string }>>([])
    const [teacherFileUnmatched, setTeacherFileUnmatched] = useState<Array<{
        line: number
        teacherName: string
        classes: { id: string; name: string }[]
        languages: string[]
        isProfPolyvalent: boolean
        suggestions: Array<{ teacher: User; score: number }>
    }>>([])

    const loadData = async () => {
        if (!activeYearId) return
        try {
            setLoading(true)
            setLoadError(null)
            const [usersRes, classesRes, studentsRes, templatesRes, taRes, saRes, tplRes, salRes] = await Promise.all([
                api.get('/users'),
                api.get(`/classes?schoolYearId=${activeYearId}`),
                api.get('/students'),
                api.get('/templates'),
                api.get(`/teacher-assignments?schoolYearId=${activeYearId}`),
                api.get('/subadmin-assignments'),
                api.get(`/template-assignments?schoolYearId=${activeYearId}`),
                api.get('/subadmin-assignments/levels'),
            ])

            const allUsers = usersRes.data
            setTeachers(allUsers.filter((u: User) => u.role === 'TEACHER'))
            setSubAdmins(allUsers.filter((u: User) => u.role === 'SUBADMIN'))
            setAefeUsers(allUsers.filter((u: User) => u.role === 'AEFE'))
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
            setTemplates(templatesRes.data)
            
            setTeacherAssignments(taRes.data)
            setSubAdminAssignments(saRes.data)
            setTemplateAssignments(tplRes.data)
            setSubAdminLevelAssignments(salRes.data)
        } catch (e) {
            setLoadError("Impossible de charger les données. Réessayez dans quelques instants.")
        } finally {
            setLoading(false)
        }
    }

    const normalizeText = (value: string) => {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ')
    }

    const getTokenSimilarity = (left: string[], right: string[]) => {
        if (left.length === 0 || right.length === 0) return 0
        const overlap = left.filter(token => right.includes(token)).length
        return (2 * overlap) / (left.length + right.length)
    }

    const detectDelimiter = (line: string) => {
        const comma = (line.match(/,/g) || []).length
        const semicolon = (line.match(/;/g) || []).length
        if (semicolon > comma) return ';'
        return ','
    }

    const parseDelimitedLine = (line: string, delimiter: string) => {
        const result: string[] = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"'
                    i++
                } else {
                    inQuotes = !inQuotes
                }
                continue
            }
            if (char === delimiter && !inQuotes) {
                result.push(current)
                current = ''
                continue
            }
            current += char
        }
        result.push(current)
        return result
    }

    const parseCsvRows = (text: string) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
        if (lines.length === 0) return [] as string[][]
        const delimiter = detectDelimiter(lines[0])
        return lines.map(line => parseDelimitedLine(line, delimiter).map(cell => cell.trim()))
    }

    const parseUploadRows = async (file: File) => {
        const name = file.name.toLowerCase()
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            const buffer = await file.arrayBuffer()
            const workbook = XLSX.read(buffer, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]
        }
        const text = await readTextFileWithFallback(file)
        return parseCsvRows(text)
    }

    const resolveTeacherAssignmentsFromRows = (rows: string[][]) => {
        if (rows.length === 0) {
            return {
                assignments: [],
                errors: ['Aucune ligne trouvée dans le fichier.'],
                report: [] as Array<{ line: number; status: 'success' | 'error'; message: string }>,
                unmatched: [] as Array<{ line: number; teacherName: string; classes: { id: string; name: string }[]; languages: string[]; isProfPolyvalent: boolean; suggestions: Array<{ teacher: User; score: number }> }>
            }
        }

        const headerRow = rows[0].map(cell => normalizeText(String(cell)))
        const teacherIndex = headerRow.findIndex(h => ['teacher', 'enseignant', 'prof', 'professeur'].includes(h))
        const languagesIndex = headerRow.findIndex(h => ['languages', 'langues', 'language', 'langue'].includes(h))
        const classesIndex = headerRow.findIndex(h => ['classes', 'classe', 'class', 'classs'].includes(h))

        if (teacherIndex === -1 || classesIndex === -1) {
            return {
                assignments: [],
                errors: ['Colonnes attendues: Teacher, Languages, Classes.'],
                report: [] as Array<{ line: number; status: 'success' | 'error'; message: string }>,
                unmatched: [] as Array<{ line: number; teacherName: string; classes: { id: string; name: string }[]; languages: string[]; isProfPolyvalent: boolean; suggestions: Array<{ teacher: User; score: number }> }>
            }
        }

        const teacherLookup = new Map<string, User>()
        const teacherSignatureLookup = new Map<string, User>()
        const teacherTokenSets: Array<{ tokens: string[]; teacher: User }> = []
        const teacherCandidates: Array<{ teacher: User; tokens: string[] }> = []
        teachers.forEach(teacher => {
            const display = normalizeText(teacher.displayName || '')
            const email = normalizeText(teacher.email || '')
            if (display) teacherLookup.set(display, teacher)
            if (email) teacherLookup.set(email, teacher)
            if (display) {
                const tokens = display.split(' ').filter(Boolean)
                if (tokens.length > 0) {
                    const signature = [...tokens].sort().join(' ')
                    if (!teacherSignatureLookup.has(signature)) teacherSignatureLookup.set(signature, teacher)
                    teacherTokenSets.push({ tokens, teacher })
                    teacherCandidates.push({ teacher, tokens })
                }
            }
            if (teacher.email) {
                const localPart = teacher.email.split('@')[0] || ''
                const localTokens = normalizeText(localPart).split(' ').filter(Boolean)
                if (localTokens.length > 0) {
                    const signature = [...localTokens].sort().join(' ')
                    if (!teacherSignatureLookup.has(signature)) teacherSignatureLookup.set(signature, teacher)
                    teacherTokenSets.push({ tokens: localTokens, teacher })
                    teacherCandidates.push({ teacher, tokens: localTokens })
                }
            }
        })

        const classLookup = new Map<string, Class>()
        classes.forEach(cls => {
            classLookup.set(normalizeText(cls.name), cls)
        })

        const assignments: Array<{ teacherId: string; classId: string; languages: string[]; isProfPolyvalent: boolean }> = []
        const errors: string[] = []
        const report: Array<{ line: number; status: 'success' | 'error'; message: string }> = []
        const unmatched: Array<{ line: number; teacherName: string; classes: { id: string; name: string }[]; languages: string[]; isProfPolyvalent: boolean; suggestions: Array<{ teacher: User; score: number }> }> = []

        rows.slice(1).forEach((row, idx) => {
            const teacherCell = String(row[teacherIndex] ?? '').trim()
            const classesCell = String(row[classesIndex] ?? '').trim()
            const languagesCell = String(row[languagesIndex] ?? '').trim()

            if (!teacherCell || !classesCell) return

            const teacherKey = normalizeText(teacherCell)
            const teacherTokens = teacherKey.split(' ').filter(Boolean)
            const teacherSignature = teacherTokens.slice().sort().join(' ')
            const teacher = teacherLookup.get(teacherKey)
                || teacherSignatureLookup.get(teacherSignature)
                || teacherTokenSets.find(entry =>
                    teacherTokens.length > 0
                    && teacherTokens.every(token => entry.tokens.includes(token))
                )?.teacher

            if (!teacher) {
                const bestCandidates = new Map<string, { teacher: User; score: number }>()
                teacherCandidates.forEach(candidate => {
                    const score = getTokenSimilarity(teacherTokens, candidate.tokens)
                    if (score > 0) {
                        const existing = bestCandidates.get(candidate.teacher._id)
                        if (!existing || score > existing.score) {
                            bestCandidates.set(candidate.teacher._id, { teacher: candidate.teacher, score })
                        }
                    }
                })
                const suggestions = Array.from(bestCandidates.values())
                    .filter(item => item.score >= 0.45)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)

                errors.push(`Ligne ${idx + 2}: enseignant introuvable (${teacherCell}).`)
                report.push({ line: idx + 2, status: 'error', message: `Enseignant introuvable (${teacherCell}).` })
                if (suggestions.length > 0) {
                    const classesList = classesCell
                        .split(/[;,]/)
                        .map(item => item.trim())
                        .filter(Boolean)
                    const validClasses = classesList
                        .map(className => {
                            const cls = classLookup.get(normalizeText(className))
                            return cls ? { id: cls._id, name: cls.name } : null
                        })
                        .filter((entry): entry is { id: string; name: string } => Boolean(entry))
                    const normalizedLanguages = normalizeText(languagesCell)
                    const isProfPolyvalent = normalizedLanguages.includes('poly')
                    const languages: string[] = []
                    if (!isProfPolyvalent && languagesCell) {
                        languagesCell
                            .split(/[;,]/)
                            .map(item => normalizeText(item))
                            .filter(Boolean)
                            .forEach(lang => {
                                if (lang.includes('arab')) languages.push('ar')
                                else if (lang.includes('angl') || lang.includes('english')) languages.push('en')
                            })
                    }

                    if (validClasses.length > 0) {
                        unmatched.push({
                            line: idx + 2,
                            teacherName: teacherCell,
                            classes: validClasses,
                            languages: isProfPolyvalent ? [] : Array.from(new Set(languages)),
                            isProfPolyvalent,
                            suggestions
                        })
                    }
                }
                return
            }

            const classesList = classesCell
                .split(/[;,]/)
                .map(item => item.trim())
                .filter(Boolean)

            if (classesList.length === 0) {
                errors.push(`Ligne ${idx + 2}: aucune classe valide.`)
                report.push({ line: idx + 2, status: 'error', message: 'Aucune classe valide.' })
                return
            }

            const normalizedLanguages = normalizeText(languagesCell)
            const isProfPolyvalent = normalizedLanguages.includes('poly')
            const languages: string[] = []

            if (!isProfPolyvalent && languagesCell) {
                languagesCell
                    .split(/[;,]/)
                    .map(item => normalizeText(item))
                    .filter(Boolean)
                    .forEach(lang => {
                        if (lang.includes('arab')) languages.push('ar')
                        else if (lang.includes('angl') || lang.includes('english')) languages.push('en')
                    })
            }

            const rowErrors: string[] = []
            const assignedClasses: string[] = []
            classesList.forEach(className => {
                const cls = classLookup.get(normalizeText(className))
                if (!cls) {
                    errors.push(`Ligne ${idx + 2}: classe introuvable (${className}).`)
                    rowErrors.push(`Classe introuvable (${className})`)
                    return
                }
                assignments.push({
                    teacherId: teacher._id,
                    classId: cls._id,
                    languages: isProfPolyvalent ? [] : Array.from(new Set(languages)),
                    isProfPolyvalent
                })
                assignedClasses.push(cls.name)
            })

            if (rowErrors.length > 0) {
                report.push({
                    line: idx + 2,
                    status: 'error',
                    message: `${teacher.displayName}: ${rowErrors.join('; ')}`
                })
            }
            if (assignedClasses.length > 0) {
                report.push({
                    line: idx + 2,
                    status: 'success',
                    message: `${teacher.displayName}: ${assignedClasses.join(', ')}`
                })
            }
        })

        return { assignments, errors, report, unmatched }
    }

    const handleTeacherFileImport = async (file: File | undefined) => {
        if (!file || !activeYearId) return
        setTeacherFileErrors([])
        setTeacherFileStatus('')
        setTeacherFileReport([])
        setTeacherFileUnmatched([])
        try {
            setBusyAction('import-teacher-file')
            const rows = await parseUploadRows(file)
            const { assignments, errors, report, unmatched } = resolveTeacherAssignmentsFromRows(rows)
            if (assignments.length === 0) {
                setTeacherFileErrors(errors.length > 0 ? errors : ['Aucune assignation détectée.'])
                setTeacherFileReport(report)
                setTeacherFileUnmatched(unmatched)
                return
            }

            const results = await Promise.allSettled(
                assignments.map(a => api.post('/teacher-assignments', a))
            )
            const failed = results.filter(r => r.status === 'rejected').length
            const success = results.length - failed

            setTeacherFileErrors(errors)
            setTeacherFileStatus(`✓ ${success} assignation(s) importée(s)${failed ? `, ${failed} erreur(s)` : ''}`)
            setTeacherFileReport(report)
            setTeacherFileUnmatched(unmatched)
            setMessage(`✓ ${success} assignation(s) importée(s)`)
            loadData()
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setTeacherFileErrors(['Impossible de lire le fichier.'])
        } finally {
            setBusyAction(null)
        }
    }

    const applyTeacherSuggestion = async (targetLine: number, teacherId: string) => {
        const target = teacherFileUnmatched.find(item => item.line === targetLine)
        if (!target) return
        try {
            setBusyAction('import-teacher-file')
            await Promise.all(target.classes.map(entry =>
                api.post('/teacher-assignments', {
                    teacherId,
                    classId: entry.id,
                    languages: target.languages,
                    isProfPolyvalent: target.isProfPolyvalent
                })
            ))
            const teacherName = teachers.find(t => t._id === teacherId)?.displayName || 'Enseignant'
            setTeacherFileReport(prev => ([
                ...prev,
                { line: target.line, status: 'success', message: `${teacherName}: ${target.classes.map(c => c.name).join(', ')}` }
            ]))
            setTeacherFileUnmatched(prev => prev.filter(item => item.line !== targetLine))
            loadData()
        } catch (e) {
            setTeacherFileReport(prev => ([
                ...prev,
                { line: target.line, status: 'error', message: `Échec de l'assignation pour ${target.teacherName}.` }
            ]))
        } finally {
            setBusyAction(null)
        }
    }

    const dismissTeacherSuggestion = (targetLine: number) => {
        setTeacherFileUnmatched(prev => prev.filter(item => item.line !== targetLine))
    }

    const downloadTeacherTemplate = () => {
        const sample = [
            ['Teacher', 'Languages', 'Classes'],
            ['Mme Example', 'Poly', 'MS-A'],
            ['Mr Example', 'Anglais', 'MS-A, MS-B']
        ]
        const csvContent = sample.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', 'teacher_assignments_template.csv')
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
    }

    const exportTeacherAssignments = () => {
        if (teacherAssignments.length === 0) return
        const teacherLookup = new Map<string, User>()
        teachers.forEach(t => teacherLookup.set(t._id, t))

        const grouped = new Map<string, { teacherName: string; languages: string; classes: Set<string> }>()
        teacherAssignments.forEach(ta => {
            const teacherName = teacherLookup.get(ta.teacherId)?.displayName || ta.teacherName || 'Inconnu'
            const languageLabel = ta.isProfPolyvalent
                ? 'Poly'
                : ta.languages && ta.languages.length > 0
                    ? ta.languages.map(l => l.toUpperCase()).sort().join(', ')
                    : 'Toutes'
            const key = `${ta.teacherId}-${languageLabel}`
            if (!grouped.has(key)) {
                grouped.set(key, { teacherName, languages: languageLabel, classes: new Set() })
            }
            grouped.get(key)?.classes.add(ta.className || ta.classId)
        })

        const rows = Array.from(grouped.values()).map(row => [
            row.teacherName,
            row.languages,
            Array.from(row.classes).sort().join(', ')
        ])
        const csvContent = [
            ['Teacher', 'Languages', 'Classes'],
            ...rows
        ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `teacher_assignments_${activeYearName}.csv`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
    }

    useEffect(() => {
        if (activeYearId) loadData()
    }, [activeYearId])

    const assignTeacherToClass = async () => {
        if (!selectedTeacher || selectedClasses.length === 0) return
        try {
            setBusyAction('assign-teacher')
            await Promise.all(selectedClasses.map(classId => 
                api.post('/teacher-assignments', { 
                    teacherId: selectedTeacher, 
                    classId: classId,
                    languages: selectedLanguages,
                    isProfPolyvalent
                })
            ))
            setMessage(`✓ ${selectedClasses.length} classes assignées`)
            setSelectedClasses([])
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const requestRemoveTeacherAssignment = (assignmentId: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'teacher-assignment', assignmentId, label })
    }

    const assignSubAdminToLevel = async () => {
        try {
            setBusyAction('assign-subadmin-level')
            const res = await api.post('/subadmin-assignments/bulk-level', {
                subAdminId: selectedSubAdminForLevel,
                level: selectedLevelForSubAdmin,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const assignAefeToLevel = async () => {
        try {
            setBusyAction('assign-aefe-level')
            const res = await api.post('/subadmin-assignments/bulk-level', {
                subAdminId: selectedAefeForLevel,
                level: selectedLevelForAefe,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const assignTemplateToLevel = async () => {
        try {
            setBusyAction('assign-template-level')
            const res = await api.post('/template-assignments/bulk-level', {
                templateId: selectedTemplateForLevel,
                level: selectedLevelForTemplate,
                schoolYearId: activeYearId
            })
            setMessage(`✓ ${res.data.message}`)
            setTimeout(() => setMessage(''), 3000)
            loadData()
        } catch (e) {
            setMessage('✗ Échec de l\'assignation')
        } finally {
            setBusyAction(null)
        }
    }

    const fetchImportableAssignments = async (yearId: string) => {
        try {
            const res = await api.get(`/teacher-assignments?schoolYearId=${yearId}`)
            setAvailableImports(res.data)
            setImportFromYearId(yearId)
            const allIndices = new Set<number>(res.data.map((_: ImportableTeacherAssignment, idx: number) => idx))
            setSelectedImportIndices(allIndices)
        } catch (e) {
            console.error(e)
        }
    }

    const handleOpenImport = () => {
        const sortedYears = [...years].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        const currentIndex = sortedYears.findIndex(y => y._id === activeYearId)
        let targetYear = sortedYears[currentIndex + 1]
        if (!targetYear && sortedYears.length > 1) {
            targetYear = sortedYears.find(y => y._id !== activeYearId)!
        }
        
        if (targetYear) {
            fetchImportableAssignments(targetYear._id)
            setShowImportModal(true)
        } else {
            alert("Aucune autre année scolaire trouvée pour l'importation.")
        }
    }

    const executeImport = async () => {
        const toImport = availableImports.filter((_, idx) => selectedImportIndices.has(idx))
        if (toImport.length === 0) return

        try {
            setBusyAction('import')
            const res = await api.post('/teacher-assignments/import', {
                sourceAssignments: toImport,
                targetYearId: activeYearId
            })
            setMessage(`✓ ${res.data.importedCount} assignations importées`)
            if (res.data.errors && res.data.errors.length > 0) {
                alert(`Importé avec des erreurs:\n${res.data.errors.join('\n')}`)
            }
            setShowImportModal(false)
            loadData()
            setTimeout(() => setMessage(''), 3000)
        } catch (e) {
            setMessage('✗ Échec de l\'import')
        } finally {
            setBusyAction(null)
        }
    }

    const requestRemoveSubAdminLevelAssignment = (subAdminId: string, level: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'subadmin-level', subAdminId, level, label })
    }

    const requestRemoveTemplateLevelAssignment = (templateId: string, level: string, label: string) => {
        setDeleteConfirmText('')
        setDeleteAction({ type: 'template-level', templateId, level, label })
    }

    const performDelete = async () => {
        if (!deleteAction) return
        if (deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER') return
        try {
            setBusyAction('delete')
            if (deleteAction.type === 'teacher-assignment') {
                await api.delete(`/teacher-assignments/${deleteAction.assignmentId}`)
                setMessage('✓ Assignation supprimée')
            }
            if (deleteAction.type === 'subadmin-level') {
                await api.delete(`/subadmin-assignments/levels/${deleteAction.subAdminId}/${deleteAction.level}`)
                setMessage('✓ Assignation supprimée')
            }
            if (deleteAction.type === 'template-level') {
                await api.delete(`/template-assignments/bulk-level/${deleteAction.templateId}/${deleteAction.level}?schoolYearId=${activeYearId}`)
                setMessage('✓ Assignations supprimées')
            }
            setTimeout(() => setMessage(''), 3000)
            setDeleteAction(null)
            setDeleteConfirmText('')
            loadData()
        } catch (e) {
            setMessage('✗ Échec de la suppression')
        } finally {
            setBusyAction(null)
        }
    }

    const activeYearName = useMemo(() => years.find(y => y._id === activeYearId)?.name ?? '—', [years, activeYearId])

    const filteredTeachers = useMemo(() => {
        const q = teacherQuery.trim().toLowerCase()
        if (!q) return teachers
        return teachers.filter(t => `${t.displayName} ${t.email}`.toLowerCase().includes(q))
    }, [teachers, teacherQuery])

    const currentTeacherAssignmentsAll = useMemo(() => teacherAssignments.filter(ta => ta.teacherId === selectedTeacher), [teacherAssignments, selectedTeacher])

    const currentTeacherAssignments = useMemo(() => {
        const q = currentAssignmentsQuery.trim().toLowerCase()
        if (!q) return currentTeacherAssignmentsAll
        return currentTeacherAssignmentsAll.filter(a => (a.className ?? '').toLowerCase().includes(q))
    }, [currentTeacherAssignmentsAll, currentAssignmentsQuery])

    const assignedClassIds = useMemo(() => new Set(currentTeacherAssignmentsAll.map(ta => ta.classId)), [currentTeacherAssignmentsAll])

    const availableClasses = useMemo(() => classes.filter(c => !assignedClassIds.has(c._id)), [classes, assignedClassIds])

    const filteredAvailableClasses = useMemo(() => {
        const q = classQuery.trim().toLowerCase()
        if (!q) return availableClasses
        return availableClasses.filter(c => c.name.toLowerCase().includes(q))
    }, [availableClasses, classQuery])

    const subAdminSummary = useMemo(() => {
        return subAdminLevelAssignments
            .filter(sa => subAdmins.some(u => u._id === sa.subAdminId))
            .map(sa => ({ ...sa, levels: [...sa.levels].sort() }))
            .sort((a, b) => a.subAdminName.localeCompare(b.subAdminName))
    }, [subAdminLevelAssignments, subAdmins])

    const aefeSummary = useMemo(() => {
        return subAdminLevelAssignments
            .filter(sa => aefeUsers.some(u => u._id === sa.subAdminId))
            .map(sa => ({ ...sa, levels: [...sa.levels].sort() }))
            .sort((a, b) => a.subAdminName.localeCompare(b.subAdminName))
    }, [subAdminLevelAssignments, aefeUsers])

    const templateSummary = useMemo(() => {
        const summary = new Map<string, { templateId: string; levels: Set<string> }>()
        templateAssignments.forEach(ta => {
            const templateName = ta.templateName || 'Unknown'
            if (!summary.has(templateName)) summary.set(templateName, { templateId: ta.templateId, levels: new Set() })
            if (ta.classId) {
                const cls = classes.find(c => c._id === ta.classId)
                if (cls?.level) summary.get(templateName)?.levels.add(cls.level)
            }
        })
        return Array.from(summary.entries())
            .map(([name, data]) => ({ name, templateId: data.templateId, levels: Array.from(data.levels).sort() }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [templateAssignments, classes])

    const importRows = useMemo(() => {
        const q = importQuery.trim().toLowerCase()
        return availableImports
            .map((ta, idx) => ({ ta, idx }))
            .filter(({ ta }) => {
                if (!q) return true
                return `${ta.teacherName ?? ''} ${ta.className ?? ''} ${(ta.languages ?? []).join(',')}`.toLowerCase().includes(q)
            })
    }, [availableImports, importQuery])

    const allVisibleImportsSelected = useMemo(() => {
        if (importRows.length === 0) return false
        return importRows.every(r => selectedImportIndices.has(r.idx))
    }, [importRows, selectedImportIndices])

    const tabCounts = useMemo(() => ({
        teacher: teacherAssignments.length,
        subadmin: subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0),
        aefe: aefeSummary.reduce((acc, s) => acc + s.levels.length, 0),
        template: templateSummary.reduce((acc, s) => acc + s.levels.length, 0),
    }), [teacherAssignments, subAdminSummary, aefeSummary, templateSummary])

    return (
        <div className="aa-page">
            {/* Header */}
            <header className="aa-header">
                <div className="aa-header-content">
                    <div className="aa-header-left">
                        <div className="aa-header-icon">
                            <Users size={24} />
                        </div>
                        <div>
                            <h1 className="aa-title">Gestion des assignations</h1>
                            <p className="aa-subtitle">
                                <span className="aa-year-badge">{activeYearName}</span>
                                Gérez les assignations des enseignants, carnets et sous-administrateurs
                            </p>
                        </div>
                    </div>
                    <div className="aa-header-actions">
                        <Link to="/admin/assignment-list" className="aa-btn aa-btn-secondary">
                            <ChevronRight size={16} />
                            Voir toutes
                        </Link>
                        <Link to="/admin" className="aa-btn aa-btn-ghost">
                            Retour
                        </Link>
                    </div>
                </div>
            </header>

            {/* Toast Messages */}
            {message && (
                <div className={`aa-toast ${message.includes('✓') ? 'aa-toast-success' : 'aa-toast-error'}`}>
                    {message.includes('✓') ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{message}</span>
                </div>
            )}

            {loadError && (
                <div className="aa-error-banner">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                    <button onClick={loadData} className="aa-btn aa-btn-sm">Réessayer</button>
                </div>
            )}

            {/* Tab Navigation */}
            <nav className="aa-tabs">
                {(Object.keys(TAB_CONFIG) as Array<keyof typeof TAB_CONFIG>).map(key => {
                    const config = TAB_CONFIG[key]
                    const Icon = config.icon
                    const isActive = activeTab === key
                    return (
                        <button
                            key={key}
                            className={`aa-tab ${isActive ? 'aa-tab-active' : ''}`}
                            onClick={() => setActiveTab(key)}
                            style={{ '--tab-color': config.color, '--tab-bg': config.bg } as React.CSSProperties}
                        >
                            <Icon size={18} />
                            <span className="aa-tab-label">{config.label}</span>
                            <span className="aa-tab-count">{tabCounts[key]}</span>
                        </button>
                    )
                })}
                {loading && (
                    <div className="aa-loading-indicator">
                        <Loader2 size={16} className="aa-spin" />
                        <span>Chargement…</span>
                    </div>
                )}
            </nav>

            {/* Teacher Tab */}
            {activeTab === 'teacher' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Users size={20} style={{ color: '#3b82f6' }} />
                                <span>Enseignant → Classe</span>
                            </div>
                            <div className="aa-panel-actions">
                                <button className="aa-btn aa-btn-outline" onClick={downloadTeacherTemplate} disabled={loading}>
                                    <FileText size={16} />
                                    Télécharger modèle
                                </button>
                                <button className="aa-btn aa-btn-outline" onClick={exportTeacherAssignments} disabled={loading || teacherAssignments.length === 0}>
                                    <Download size={16} />
                                    Exporter assignations
                                </button>
                                <button className="aa-btn aa-btn-outline" onClick={handleOpenImport} disabled={busyAction !== null || loading}>
                                    <Download size={16} />
                                    Importer N-1
                                </button>
                            </div>
                        </div>

                        <div className="aa-import-card">
                            <div className="aa-import-info">
                                <div className="aa-import-title">Importer un fichier (CSV / Excel)</div>
                                <div className="aa-import-hint">Colonnes attendues: Teacher, Languages, Classes</div>
                            </div>
                            <div className="aa-import-actions">
                                <input
                                    id="teacher-import-file"
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    style={{ display: 'none' }}
                                    onChange={e => handleTeacherFileImport(e.target.files?.[0])}
                                />
                                <button
                                    className="aa-btn aa-btn-primary"
                                    onClick={() => document.getElementById('teacher-import-file')?.click()}
                                    disabled={loading || busyAction !== null}
                                >
                                    {busyAction === 'import-teacher-file' ? <Loader2 size={16} className="aa-spin" /> : <Upload size={16} />}
                                    Importer fichier
                                </button>
                            </div>
                        </div>

                        {(teacherFileStatus || teacherFileErrors.length > 0 || teacherFileReport.length > 0 || teacherFileUnmatched.length > 0) && (
                            <div className="aa-import-report">
                                {teacherFileStatus && <div className="aa-import-success">{teacherFileStatus}</div>}
                                {teacherFileErrors.length > 0 && (
                                    <ul>
                                        {teacherFileErrors.slice(0, 6).map((err, idx) => (
                                            <li key={`${err}-${idx}`}>{err}</li>
                                        ))}
                                    </ul>
                                )}
                                {teacherFileReport.length > 0 && (
                                    <ul>
                                        {teacherFileReport.map(item => (
                                            <li key={`${item.line}-${item.message}`} className={item.status === 'success' ? 'aa-import-item-success' : 'aa-import-item-error'}>
                                                <strong>Ligne {item.line}:</strong> {item.message}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {teacherFileUnmatched.length > 0 && (
                                    <div className="aa-import-suggestions">
                                        <div className="aa-import-suggestions-title">Suggestions pour enseignants non reconnus</div>
                                        {teacherFileUnmatched.map(item => (
                                            <div key={`unmatched-${item.line}`} className="aa-import-suggestion-row">
                                                <div>
                                                    <strong>Ligne {item.line}:</strong> {item.teacherName} — {item.classes.map(c => c.name).join(', ')}
                                                </div>
                                                <div className="aa-import-suggestion-actions">
                                                    {item.suggestions.map(suggestion => (
                                                        <button
                                                            key={`${item.line}-${suggestion.teacher._id}`}
                                                            className="aa-btn aa-btn-xs"
                                                            onClick={() => applyTeacherSuggestion(item.line, suggestion.teacher._id)}
                                                            disabled={busyAction !== null}
                                                        >
                                                            Utiliser {suggestion.teacher.displayName}
                                                        </button>
                                                    ))}
                                                    <button
                                                        className="aa-btn aa-btn-xs"
                                                        onClick={() => dismissTeacherSuggestion(item.line)}
                                                        disabled={busyAction !== null}
                                                    >
                                                        Ignorer
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="aa-search-row">
                            <div className="aa-search-field">
                                <Search size={16} className="aa-search-icon" />
                                <input
                                    type="text"
                                    className="aa-input"
                                    value={teacherQuery}
                                    onChange={e => setTeacherQuery(e.target.value)}
                                    placeholder="Rechercher un enseignant…"
                                    disabled={loading}
                                />
                            </div>
                            <select
                                className="aa-select"
                                value={selectedTeacher}
                                disabled={loading}
                                onChange={e => {
                                    setSelectedTeacher(e.target.value)
                                    setSelectedClasses([])
                                    setClassQuery('')
                                    setCurrentAssignmentsQuery('')
                                }}
                            >
                                <option value="">Sélectionner un enseignant</option>
                                {filteredTeachers.map(t => (
                                    <option key={t._id} value={t._id}>
                                        {t.displayName} ({t.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!selectedTeacher && (
                            <div className="aa-empty-state">
                                <Users size={48} strokeWidth={1} />
                                <p>Sélectionnez un enseignant pour gérer ses assignations</p>
                            </div>
                        )}

                        {selectedTeacher && (
                            <div className="aa-split-view">
                                {/* New Assignment Panel */}
                                <div className="aa-split-panel aa-split-panel-new">
                                    <h4 className="aa-split-title">
                                        <Plus size={16} />
                                        Nouvelle assignation
                                        {selectedClasses.length > 0 && (
                                            <span className="aa-badge">{selectedClasses.length}</span>
                                        )}
                                    </h4>

                                    <div className="aa-search-field aa-search-field-sm">
                                        <Search size={14} className="aa-search-icon" />
                                        <input
                                            type="text"
                                            className="aa-input aa-input-sm"
                                            value={classQuery}
                                            onChange={e => setClassQuery(e.target.value)}
                                            placeholder="Filtrer les classes…"
                                            disabled={loading || busyAction !== null}
                                        />
                                    </div>

                                    <div className="aa-list-actions">
                                        <span className="aa-list-count">{filteredAvailableClasses.length} disponible(s)</span>
                                        <div className="aa-list-btns">
                                            <button
                                                type="button"
                                                className="aa-btn aa-btn-xs"
                                                disabled={filteredAvailableClasses.length === 0 || loading || busyAction !== null}
                                                onClick={() => setSelectedClasses(Array.from(new Set([...selectedClasses, ...filteredAvailableClasses.map(c => c._id)])))}
                                            >
                                                Tout
                                            </button>
                                            <button
                                                type="button"
                                                className="aa-btn aa-btn-xs"
                                                disabled={selectedClasses.length === 0 || loading || busyAction !== null}
                                                onClick={() => setSelectedClasses([])}
                                            >
                                                Aucun
                                            </button>
                                        </div>
                                    </div>

                                    <div className="aa-checkbox-list">
                                        {availableClasses.length === 0 ? (
                                            <div className="aa-list-empty">Toutes les classes sont assignées</div>
                                        ) : filteredAvailableClasses.length === 0 ? (
                                            <div className="aa-list-empty">Aucune classe ne correspond</div>
                                        ) : (
                                            filteredAvailableClasses.map(c => (
                                                <label key={c._id} className={`aa-checkbox-item ${selectedClasses.includes(c._id) ? 'aa-checkbox-item-selected' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClasses.includes(c._id)}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedClasses([...selectedClasses, c._id])
                                                            else setSelectedClasses(selectedClasses.filter(id => id !== c._id))
                                                        }}
                                                        disabled={busyAction !== null || loading}
                                                    />
                                                    <span>{c.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>

                                    <div className="aa-options-section">
                                        <label className="aa-option-label">Langues autorisées</label>
                                        <div className="aa-lang-chips">
                                            {['ar', 'en'].map(lang => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    className={`aa-lang-chip ${selectedLanguages.includes(lang) ? 'aa-lang-chip-active' : ''}`}
                                                    disabled={isProfPolyvalent || loading || busyAction !== null}
                                                    onClick={() => {
                                                        if (selectedLanguages.includes(lang)) setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
                                                        else setSelectedLanguages([...selectedLanguages, lang])
                                                    }}
                                                >
                                                    {lang.toUpperCase()}
                                                </button>
                                            ))}
                                            {selectedLanguages.length === 0 && !isProfPolyvalent && (
                                                <span className="aa-lang-hint">Toutes langues</span>
                                            )}
                                        </div>
                                    </div>

                                    <label className="aa-toggle">
                                        <input
                                            type="checkbox"
                                            checked={isProfPolyvalent}
                                            onChange={e => {
                                                const checked = e.target.checked
                                                setIsProfPolyvalent(checked)
                                                if (checked) setSelectedLanguages([])
                                            }}
                                            disabled={loading || busyAction !== null}
                                        />
                                        <span className="aa-toggle-slider"></span>
                                        <span className="aa-toggle-label">Prof Polyvalent</span>
                                    </label>

                                    <button
                                        className="aa-btn aa-btn-primary aa-btn-full"
                                        onClick={assignTeacherToClass}
                                        disabled={selectedClasses.length === 0 || loading || busyAction !== null}
                                    >
                                        {busyAction === 'assign-teacher' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                        Assigner {selectedClasses.length > 0 ? `(${selectedClasses.length})` : ''}
                                    </button>
                                </div>

                                {/* Current Assignments Panel */}
                                <div className="aa-split-panel aa-split-panel-current">
                                    <h4 className="aa-split-title">
                                        <Check size={16} />
                                        Assignations actuelles
                                        <span className="aa-badge aa-badge-muted">{currentTeacherAssignmentsAll.length}</span>
                                    </h4>

                                    <div className="aa-search-field aa-search-field-sm">
                                        <Search size={14} className="aa-search-icon" />
                                        <input
                                            type="text"
                                            className="aa-input aa-input-sm"
                                            value={currentAssignmentsQuery}
                                            onChange={e => setCurrentAssignmentsQuery(e.target.value)}
                                            placeholder="Filtrer…"
                                            disabled={loading}
                                        />
                                    </div>

                                    <div className="aa-assignment-list">
                                        {currentTeacherAssignments.length === 0 ? (
                                            <div className="aa-list-empty">Aucune assignation</div>
                                        ) : (
                                            currentTeacherAssignments.map(ta => (
                                                <div key={ta._id} className="aa-assignment-card">
                                                    <div className="aa-assignment-info">
                                                        <span className="aa-assignment-name">{ta.className}</span>
                                                        <div className="aa-assignment-meta">
                                                            {ta.isProfPolyvalent ? (
                                                                <span className="aa-tag aa-tag-purple">Polyvalent</span>
                                                            ) : ta.languages && ta.languages.length > 0 ? (
                                                                <span className="aa-tag">{ta.languages.join(', ').toUpperCase()}</span>
                                                            ) : (
                                                                <span className="aa-tag aa-tag-muted">Toutes langues</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="aa-btn-icon aa-btn-icon-danger"
                                                        onClick={() => requestRemoveTeacherAssignment(ta._id, `${ta.className ?? 'classe'}`)}
                                                        title="Supprimer"
                                                        disabled={busyAction !== null || loading}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SubAdmin Tab */}
            {activeTab === 'subadmin' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Shield size={20} style={{ color: '#8b5cf6' }} />
                                <span>Sous-admin → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Sous-administrateur</label>
                                <select className="aa-select" value={selectedSubAdminForLevel} onChange={e => setSelectedSubAdminForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner sous-admin</option>
                                    {subAdmins.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForSubAdmin} onChange={e => setSelectedLevelForSubAdmin(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignSubAdminToLevel}
                                disabled={!selectedSubAdminForLevel || !selectedLevelForSubAdmin || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-subadmin-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{subAdminSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {subAdminSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    subAdminSummary.map(sa => (
                                        <div key={sa.subAdminId} className="aa-summary-row">
                                            <span className="aa-summary-name">{sa.subAdminName}</span>
                                            <div className="aa-summary-tags">
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="aa-tag aa-tag-removable">
                                                        {lvl}
                                                        <button type="button" onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AEFE Tab */}
            {activeTab === 'aefe' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <Globe size={20} style={{ color: '#f59e0b' }} />
                                <span>AEFE → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Utilisateur AEFE</label>
                                <select className="aa-select" value={selectedAefeForLevel} onChange={e => setSelectedAefeForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner AEFE</option>
                                    {aefeUsers.map(s => <option key={s._id} value={s._id}>{s.displayName} ({s.email})</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForAefe} onChange={e => setSelectedLevelForAefe(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignAefeToLevel}
                                disabled={!selectedAefeForLevel || !selectedLevelForAefe || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-aefe-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{aefeSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {aefeSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    aefeSummary.map(sa => (
                                        <div key={sa.subAdminId} className="aa-summary-row">
                                            <span className="aa-summary-name">{sa.subAdminName}</span>
                                            <div className="aa-summary-tags">
                                                {sa.levels.map(lvl => (
                                                    <span key={lvl} className="aa-tag aa-tag-removable">
                                                        {lvl}
                                                        <button type="button" onClick={() => requestRemoveSubAdminLevelAssignment(sa.subAdminId, lvl, `${sa.subAdminName} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Tab */}
            {activeTab === 'template' && (
                <div className="aa-content">
                    <div className="aa-panel">
                        <div className="aa-panel-header">
                            <div className="aa-panel-title">
                                <BookOpen size={20} style={{ color: '#10b981' }} />
                                <span>Carnet → Niveau</span>
                            </div>
                        </div>

                        <div className="aa-form-row">
                            <div className="aa-form-group">
                                <label className="aa-label">Carnet</label>
                                <select className="aa-select" value={selectedTemplateForLevel} onChange={e => setSelectedTemplateForLevel(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner carnet</option>
                                    {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div className="aa-form-group">
                                <label className="aa-label">Niveau</label>
                                <select className="aa-select" value={selectedLevelForTemplate} onChange={e => setSelectedLevelForTemplate(e.target.value)} disabled={loading || busyAction !== null}>
                                    <option value="">Sélectionner niveau</option>
                                    {levels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={assignTemplateToLevel}
                                disabled={!selectedTemplateForLevel || !selectedLevelForTemplate || loading || busyAction !== null}
                            >
                                {busyAction === 'assign-template-level' ? <Loader2 size={16} className="aa-spin" /> : <Plus size={16} />}
                                Assigner
                            </button>
                        </div>

                        <div className="aa-summary-section">
                            <div className="aa-summary-header">
                                <span>Assignations existantes</span>
                                <span className="aa-summary-count">{templateSummary.reduce((acc, s) => acc + s.levels.length, 0)} niveau(x)</span>
                            </div>
                            <div className="aa-summary-list">
                                {templateSummary.length === 0 ? (
                                    <div className="aa-list-empty">Aucune assignation</div>
                                ) : (
                                    templateSummary.map(t => (
                                        <div key={t.name} className="aa-summary-row">
                                            <span className="aa-summary-name">{t.name}</span>
                                            <div className="aa-summary-tags">
                                                {t.levels.length === 0 ? (
                                                    <span className="aa-tag aa-tag-muted">Aucun niveau</span>
                                                ) : (
                                                    t.levels.map(lvl => (
                                                        <span key={lvl} className="aa-tag aa-tag-removable">
                                                            {lvl}
                                                            <button type="button" onClick={() => requestRemoveTemplateLevelAssignment(t.templateId, lvl, `${t.name} → ${lvl}`)} disabled={busyAction !== null || loading}>
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="aa-modal-overlay" onClick={() => setShowImportModal(false)}>
                    <div className="aa-modal" onClick={e => e.stopPropagation()}>
                        <div className="aa-modal-header">
                            <h3>Importer les assignations</h3>
                            <button type="button" className="aa-btn-icon" onClick={() => setShowImportModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="aa-modal-body">
                            <div className="aa-form-row">
                                <div className="aa-form-group">
                                    <label className="aa-label">Depuis l'année scolaire</label>
                                    <select
                                        className="aa-select"
                                        value={importFromYearId}
                                        onChange={e => fetchImportableAssignments(e.target.value)}
                                        disabled={busyAction !== null}
                                    >
                                        {years.filter(y => y._id !== activeYearId).map(y => (
                                            <option key={y._id} value={y._id}>{y.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="aa-form-group">
                                    <label className="aa-label">Rechercher</label>
                                    <div className="aa-search-field">
                                        <Search size={14} className="aa-search-icon" />
                                        <input className="aa-input" value={importQuery} onChange={e => setImportQuery(e.target.value)} placeholder="Enseignant, classe…" />
                                    </div>
                                </div>
                            </div>

                            <div className="aa-list-actions">
                                <span className="aa-list-count">{selectedImportIndices.size} sélectionnée(s)</span>
                                <div className="aa-list-btns">
                                    <button
                                        type="button"
                                        className="aa-btn aa-btn-xs"
                                        disabled={importRows.length === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.add(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Tout
                                    </button>
                                    <button
                                        type="button"
                                        className="aa-btn aa-btn-xs"
                                        disabled={selectedImportIndices.size === 0 || busyAction !== null}
                                        onClick={() => {
                                            const next = new Set(selectedImportIndices)
                                            importRows.forEach(r => next.delete(r.idx))
                                            setSelectedImportIndices(next)
                                        }}
                                    >
                                        Aucun
                                    </button>
                                </div>
                            </div>

                            <div className="aa-import-table-wrapper">
                                <table className="aa-import-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleImportsSelected}
                                                    disabled={importRows.length === 0 || busyAction !== null}
                                                    onChange={e => {
                                                        if (e.target.checked) {
                                                            const next = new Set(selectedImportIndices)
                                                            importRows.forEach(r => next.add(r.idx))
                                                            setSelectedImportIndices(next)
                                                        } else {
                                                            const next = new Set(selectedImportIndices)
                                                            importRows.forEach(r => next.delete(r.idx))
                                                            setSelectedImportIndices(next)
                                                        }
                                                    }}
                                                />
                                            </th>
                                            <th>Enseignant</th>
                                            <th>Classe</th>
                                            <th>Langues</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importRows.length === 0 ? (
                                            <tr><td colSpan={4} className="aa-table-empty">Aucune assignation trouvée</td></tr>
                                        ) : importRows.map(({ ta, idx }) => (
                                            <tr key={idx} className={selectedImportIndices.has(idx) ? 'aa-row-selected' : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedImportIndices.has(idx)}
                                                        disabled={busyAction !== null}
                                                        onChange={e => {
                                                            const next = new Set(selectedImportIndices)
                                                            if (e.target.checked) next.add(idx)
                                                            else next.delete(idx)
                                                            setSelectedImportIndices(next)
                                                        }}
                                                    />
                                                </td>
                                                <td>{ta.teacherName}</td>
                                                <td>{ta.className}</td>
                                                <td>
                                                    {ta.isProfPolyvalent ? (
                                                        <span className="aa-tag aa-tag-purple">Polyvalent</span>
                                                    ) : (ta.languages && ta.languages.length > 0) ? (
                                                        <span className="aa-tag">{ta.languages.join(', ').toUpperCase()}</span>
                                                    ) : (
                                                        <span className="aa-tag aa-tag-muted">Toutes</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="aa-modal-footer">
                            <button className="aa-btn aa-btn-ghost" onClick={() => setShowImportModal(false)} disabled={busyAction !== null}>Annuler</button>
                            <button className="aa-btn aa-btn-primary" onClick={executeImport} disabled={selectedImportIndices.size === 0 || busyAction !== null}>
                                {busyAction === 'import' ? <Loader2 size={16} className="aa-spin" /> : <Check size={16} />}
                                Importer ({selectedImportIndices.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteAction && (
                <div className="aa-modal-overlay" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }}>
                    <div className="aa-modal aa-modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="aa-modal-header aa-modal-header-danger">
                            <h3>Supprimer l'assignation</h3>
                            <button type="button" className="aa-btn-icon" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="aa-modal-body">
                            <div className="aa-delete-warning">
                                <AlertCircle size={24} />
                                <div>
                                    <p className="aa-delete-label">{deleteAction.label}</p>
                                    <p className="aa-delete-hint">Tapez <strong>SUPPRIMER</strong> pour confirmer</p>
                                </div>
                            </div>
                            <input
                                className="aa-input"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder="SUPPRIMER"
                                autoFocus
                            />
                        </div>
                        <div className="aa-modal-footer">
                            <button className="aa-btn aa-btn-ghost" onClick={() => { setDeleteAction(null); setDeleteConfirmText('') }} disabled={busyAction !== null}>Annuler</button>
                            <button className="aa-btn aa-btn-danger" onClick={performDelete} disabled={deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER' || busyAction !== null}>
                                {busyAction === 'delete' ? <Loader2 size={16} className="aa-spin" /> : <Trash2 size={16} />}
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
