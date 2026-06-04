/**
 * Language Completion Utilities
 *
 * Centralized helpers to evaluate whether a template assignment has its
 * language-scoped work (Arabe / Anglais / Polyvalent) actually completed
 * for a given semester and level.
 *
 * This is used as a fallback when the explicit `isCompletedSem1` /
 * `isCompletedSem2` boolean flags on a TemplateAssignment are not set,
 * which can happen if a teacher filled in the carnet but never explicitly
 * marked the assignment as done.
 *
 * The teacher-progress page already uses this signal (see
 * subAdminAssignments.ts -> /teacher-progress). The dashboard batch-sign
 * flow now also relies on it so that the sub-admin can sign a carnet that
 * the teacher has fully filled, even if the completion flag is stale.
 */

const normalizeLevel = (v: any): string => String(v || '').trim().toUpperCase()

const normalizeLanguageCode = (code: any): string => {
    const c = String(code || '').toLowerCase()
    if (!c) return ''
    if (c === 'lb' || c === 'ar') return 'ar'
    if (c === 'en' || c === 'uk' || c === 'gb') return 'en'
    if (c === 'fr') return 'fr'
    return c
}

const normalizeLanguageCodes = (codes: any[]): string[] => {
    const normalized = (Array.isArray(codes) ? codes : []).map(normalizeLanguageCode).filter(Boolean)
    return [...new Set(normalized)]
}

export const buildLanguageCompletionMap = (
    languageCompletions: any[] | null | undefined,
    levelRaw?: any
): Record<string, any> => {
    const targetLevel = normalizeLevel(levelRaw)
    const map: Record<string, any> = {}
    ;(Array.isArray(languageCompletions) ? languageCompletions : []).forEach((entry: any) => {
        const code = normalizeLanguageCode(entry?.code)
        if (!code) return
        if (targetLevel) {
            const entryLevel = normalizeLevel(entry?.level)
            if (!entryLevel || entryLevel !== targetLevel) return
        }
        map[code] = { ...(entry || {}), code }
    })
    return map
}

const isLanguageCompletedForSemester = (
    languageCompletionMap: Record<string, any>,
    code: string,
    semester: number
): boolean => {
    const entry = languageCompletionMap[normalizeLanguageCode(code)]
    if (!entry) return false
    if (semester === 1) return !!(entry.completedSem1 || entry.completed)
    return !!entry.completedSem2
}

/**
 * Returns true if any of the standard languages (ar, en, fr) has its
 * `completedSem1`/`completedSem2` flag set for the given level.
 *
 * This mirrors the per-category check used by the teacher-progress page.
 */
export const hasAnyLanguageCompletionForSemester = (
    assignment: any,
    semester: number,
    level: string
): boolean => {
    const languageCompletions = (assignment as any)?.languageCompletions || []
    const map = buildLanguageCompletionMap(languageCompletions, level)
    return ['ar', 'en', 'fr'].some(code => isLanguageCompletedForSemester(map, code, semester))
}

/**
 * Languages a teacher is responsible for, based on TeacherClassAssignment.
 * Defaults to [fr] for polyvalent teachers and [ar, en, fr] otherwise.
 */
export const getCompletionLanguagesForTeacher = (
    teacherClassAssignment: any | null | undefined
): string[] => {
    const langs = normalizeLanguageCodes((teacherClassAssignment as any)?.languages || [])
    if (langs.length > 0) return langs
    if ((teacherClassAssignment as any)?.isProfPolyvalent) return ['fr']
    return ['ar', 'en', 'fr']
}

/**
 * Returns true if every assigned teacher has completed all of their
 * required languages for the given semester and level.
 */
export const areAllAssignedTeachersCompletedForSemester = (
    assignment: any,
    teacherClassAssignments: any[],
    semester: number,
    level: string
): boolean => {
    const languageCompletions = (assignment as any)?.languageCompletions || []
    const map = buildLanguageCompletionMap(languageCompletions, level)
    const teacherIds: string[] = Array.isArray((assignment as any)?.assignedTeachers)
        ? (assignment as any).assignedTeachers.map((t: any) => String(t))
        : []

    // If the assignment has no assignedTeachers, fall back to "any language
    // is done" - this is consistent with the existing lenient check on the
    // teacher-progress page.
    if (teacherIds.length === 0) {
        return ['ar', 'en', 'fr'].some(code => isLanguageCompletedForSemester(map, code, semester))
    }

    const teacherAssignmentsById = new Map<string, any>()
    ;(teacherClassAssignments || []).forEach((ta: any) => {
        teacherAssignmentsById.set(String(ta.teacherId), ta)
    })

    return teacherIds.every((tid) => {
        const ta = teacherAssignmentsById.get(tid)
        const languages = getCompletionLanguagesForTeacher(ta)
        return languages.every(code => isLanguageCompletedForSemester(map, code, semester))
    })
}

/**
 * Effective completion status for a single assignment, considering both
 * the explicit `isCompletedSem*` flag AND the `languageCompletions` array.
 */
export const isAssignmentEffectivelyCompleteForSemester = (
    assignment: any,
    semester: number,
    level: string,
    teacherClassAssignments: any[] = []
): boolean => {
    if (!assignment) return false

    if (semester === 1) {
        if ((assignment as any).isCompletedSem1 || (assignment as any).isCompleted) return true
    } else if (semester === 2) {
        if ((assignment as any).isCompletedSem2) return true
    } else {
        return false
    }

    return areAllAssignedTeachersCompletedForSemester(assignment, teacherClassAssignments, semester, level)
}
