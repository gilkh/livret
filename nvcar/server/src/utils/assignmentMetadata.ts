export type AssignmentStatus = 'draft' | 'in_progress' | 'completed' | 'signed'

const allowedTransitions: Record<AssignmentStatus, AssignmentStatus[]> = {
  draft: ['draft', 'in_progress', 'completed', 'signed'],
  in_progress: ['draft', 'in_progress', 'completed', 'signed'],
  completed: ['draft', 'in_progress', 'completed', 'signed'],
  signed: ['completed', 'signed'],
}

export function isKnownAssignmentStatus(status: any): status is AssignmentStatus {
  return status === 'draft' || status === 'in_progress' || status === 'completed' || status === 'signed'
}

export function warnOnInvalidStatusTransition(fromStatus: any, toStatus: any, context: string): boolean {
  if (!isKnownAssignmentStatus(fromStatus) || !isKnownAssignmentStatus(toStatus)) return true
  const allowed = allowedTransitions[fromStatus]
  const ok = allowed.includes(toStatus)
  if (!ok) {
    console.warn(`[assignment-metadata] non-standard status transition in ${context}: ${fromStatus} -> ${toStatus}`)
  }
  return ok
}

export function normalizeAssignmentMetadataPatch<T extends Record<string, any>>(patch: T): T {
  const next: Record<string, any> = { ...patch }

  if (next.templateVersion !== undefined && next.templateVersion !== null) {
    const numericVersion = Number(next.templateVersion)
    if (Number.isFinite(numericVersion)) {
      next.templateVersion = Math.max(1, Math.floor(numericVersion))
    } else {
      next.templateVersion = 1
    }
  }

  if (next.completedAt && next.isCompleted === undefined) next.isCompleted = true
  if (next.completedAtSem1 && next.isCompletedSem1 === undefined) next.isCompletedSem1 = true
  if (next.completedAtSem2 && next.isCompletedSem2 === undefined) next.isCompletedSem2 = true

  if (next.isCompleted === false) {
    next.completedAt = null
    next.completedBy = null
  }

  if (next.isCompletedSem1 === false) {
    next.completedAtSem1 = null
  }

  if (next.isCompletedSem2 === false) {
    next.completedAtSem2 = null
  }

  return next as T
}

export function assignmentUpdateOptions<T extends Record<string, any> = Record<string, any>>(extra?: T) {
  return {
    ...(extra || {}),
    runValidators: true,
    context: 'query' as const,
  }
}
