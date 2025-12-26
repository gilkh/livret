import axios, { AxiosInstance } from 'axios'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { signToken } from '../auth'
import { User } from '../models/User'
import { SimulationRun } from '../models/SimulationRun'
import { SchoolYear } from '../models/SchoolYear'
import { ClassModel } from '../models/Class'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { RoleScope } from '../models/RoleScope'

export type SimulationScenario = 'mixed'

export type SimulationConfig = {
  runId: string
  baseUrl: string
  scenario: SimulationScenario
  durationSec: number
  teachers: number
  subAdmins: number
  templateId?: string
  seededAssignmentId?: string
  seededAssignmentIds?: string[]
  seededClassIds?: string[]
}

type ActionMetric = {
  name: string
  ok: boolean
  ms: number
  status?: number
  error?: string
  at: Date
}

type LiveState = {
  runId: string
  startedAt: number
  stopRequested: boolean
  activeTeacherUsers: number
  activeSubAdminUsers: number
  inFlight: number
  lastMetrics: any
  recentActions: ActionMetric[]
}

const liveByRunId = new Map<string, LiveState>()

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const recordAction = async (runId: string, action: ActionMetric) => {
  const live = liveByRunId.get(runId)
  if (live) {
    live.recentActions.push(action)
    if (live.recentActions.length > 200) live.recentActions.splice(0, live.recentActions.length - 200)
  }

  await SimulationRun.findByIdAndUpdate(runId, {
    $push: {
      recentActions: {
        $each: [action],
        $slice: -200,
      }
    },
    $set: {
      lastMetrics: live?.lastMetrics || undefined,
    }
  })
}

const makeClient = (baseUrl: string, token: string): AxiosInstance => {
  const c = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    validateStatus: () => true,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return c
}

const timed = async <T>(fn: () => Promise<{ status: number; data: any }>): Promise<{ ok: boolean; ms: number; status: number; data: any; error?: string }> => {
  const start = Date.now()
  try {
    const r = await fn()
    const ms = Date.now() - start
    const ok = r.status >= 200 && r.status < 300
    return { ok, ms, status: r.status, data: r.data }
  } catch (e: any) {
    const ms = Date.now() - start
    return { ok: false, ms, status: 0, data: null, error: String(e?.message || e) }
  }
}

const pickRandom = <T>(arr: T[]) => {
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

const buildDataPatchFromTemplate = (template: any) => {
  const patch: any = {}

  const pages: any[] = Array.isArray(template?.pages) ? template.pages : []
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const blocks: any[] = Array.isArray(pages[pageIdx]?.blocks) ? pages[pageIdx].blocks : []

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const block = blocks[blockIdx]
      const blockType = String(block?.type || '')
      const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null

      if (blockType === 'language_toggle' || blockType === 'language_toggle_v2') {
        const items = Array.isArray(block?.props?.items) ? block.props.items : []
        if (items.length > 0) {
          const key = blockId ? `language_toggle_${blockId}` : `language_toggle_${pageIdx}_${blockIdx}`
          patch[key] = items.map((it: any) => ({ ...it, active: Math.random() < 0.6 }))
        }
      }

      if (blockType === 'table' && block?.props?.expandedRows) {
        const expandedLanguages = Array.isArray(block?.props?.expandedLanguages) ? block.props.expandedLanguages : []
        const rowLanguages = block?.props?.rowLanguages || {}
        const cells = Array.isArray(block?.props?.cells) ? block.props.cells : []
        const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []

        const rowCount = Math.min(cells.length || 0, 5)
        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
          const source = Array.isArray(rowLanguages?.[rowIdx]) ? rowLanguages[rowIdx] : expandedLanguages
          if (!Array.isArray(source) || source.length === 0) continue

          const rowId = typeof rowIds?.[rowIdx] === 'string' && rowIds[rowIdx].trim() ? rowIds[rowIdx].trim() : null
          const key = blockId && rowId ? `table_${blockId}_row_${rowId}` : `table_${pageIdx}_${blockIdx}_row_${rowIdx}`
          patch[key] = source.map((it: any) => ({ ...it, active: Math.random() < 0.5 }))
        }
      }
    }
  }

  // Also include a few generic keys for templates that store freeform data
  patch['dropdown_1'] = ['A', 'B', 'C'][Math.floor(Math.random() * 3)]
  patch['text_1'] = `Sim_${Math.floor(Math.random() * 10000)}`
  patch['checkbox_1'] = Math.random() < 0.5

  return patch
}

const createSimUser = async (role: 'TEACHER' | 'SUBADMIN', runId: string) => {
  const suffix = randomUUID().slice(0, 8)
  const email = `sim_${role.toLowerCase()}_${runId}_${suffix}`
  const passwordHash = await bcrypt.hash('sim', 10)
  const displayName = `SIM ${role} ${suffix}`
  const user = await User.create({ email, passwordHash, role, displayName })
  const token = signToken({ userId: String(user._id), role })
  return { userId: String(user._id), token, email }
}

const ensureSeededData = async (cfg: SimulationConfig, teacherIds: string[], subAdminIds: string[]) => {
  if (!cfg.templateId) return { assignmentId: null as string | null, assignmentIds: [] as string[], classIds: [] as string[] }

  const now = new Date()

  let year = await SchoolYear.findOne({ active: true }).lean()
  if (!year) {
    year = await SchoolYear.create({
      name: `${now.getFullYear()}/${now.getFullYear() + 1}`,
      active: true,
      activeSemester: 1,
      startDate: new Date(now.getFullYear(), 8, 1),
      endDate: new Date(now.getFullYear() + 1, 6, 1),
      sequence: 1,
    }) as any
  }

  const schoolYearId = String((year as any)._id)

  // Create multiple classes and students so concurrent users don't all hammer the same gradebook.
  const classCount = Math.max(1, Math.min(10, Math.ceil(Math.max(teacherIds.length, 1) / 2)))
  const studentsPerClass = 6
  const levels = ['PS', 'MS', 'GS']

  const classIds: string[] = []
  const assignmentIds: string[] = []

  for (let i = 0; i < classCount; i++) {
    const level = levels[i % levels.length]
    const cls = await ClassModel.create({ name: `SIM ${cfg.runId.slice(0, 6)} ${String.fromCharCode(65 + i)}`, level, schoolYearId })
    const classId = String((cls as any)._id)
    classIds.push(classId)
  }

  // Assign teachers to classes (round-robin), then seed students+assignments per class.
  for (let i = 0; i < teacherIds.length; i++) {
    const teacherId = teacherIds[i]
    const classId = classIds[i % classIds.length]
    try {
      await TeacherClassAssignment.create({
        teacherId,
        classId,
        schoolYearId,
        languages: ['FR', 'AR', 'EN'],
        isProfPolyvalent: true,
        assignedBy: 'simulation',
      })
    } catch (e) {
    }
  }

  for (let c = 0; c < classIds.length; c++) {
    const classId = classIds[c]
    const teacherId = teacherIds.length ? teacherIds[c % teacherIds.length] : null
    const level = levels[c % levels.length]

    for (let s = 0; s < studentsPerClass; s++) {
      const student = await Student.create({
        firstName: 'Sim',
        lastName: `Student_${cfg.runId.slice(0, 6)}_${c}_${s}`,
        dateOfBirth: new Date(2019, 0, 1),
        logicalKey: `SIM_${cfg.runId.slice(0, 6)}_${randomUUID().slice(0, 6)}`,
        level,
        schoolYearId,
      })

      const studentId = String((student as any)._id)
      await Enrollment.create({ studentId, classId, schoolYearId, status: 'active' })

      const assignedTeachers = teacherId ? [teacherId] : []

      const completed = Math.random() < 0.55

      const assignment = await TemplateAssignment.create({
        templateId: cfg.templateId,
        templateVersion: 1,
        studentId,
        completionSchoolYearId: schoolYearId,
        assignedTeachers,
        assignedBy: 'simulation',
        status: completed ? 'completed' : 'assigned',
        isCompleted: completed,
        completedAt: completed ? new Date() : undefined,
        completedBy: completed ? (teacherId || 'simulation') : undefined,
        data: {},
      })

      assignmentIds.push(String((assignment as any)._id))
    }
  }

  for (const subAdminId of subAdminIds) {
    try {
      await RoleScope.create({ userId: subAdminId, levels })
    } catch (e) {
    }

    for (const teacherId of teacherIds) {
      try {
        await SubAdminAssignment.create({ subAdminId, teacherId, assignedBy: 'simulation' })
      } catch (e) {
      }
    }
  }

  return { assignmentId: assignmentIds[0] || null, assignmentIds, classIds }
}

const teacherLoop = async (cfg: SimulationConfig, token: string) => {
  const live = liveByRunId.get(cfg.runId)
  if (!live) return

  const client = makeClient(cfg.baseUrl, token)

  while (!live.stopRequested && Date.now() - live.startedAt < cfg.durationSec * 1000) {
    live.inFlight++

    const r1 = await timed(() => client.get('/teacher/classes').then(r => ({ status: r.status, data: r.data })))
    await recordAction(cfg.runId, { name: 'teacher.classes', ok: r1.ok, ms: r1.ms, status: r1.status, error: r1.error, at: new Date() })

    if (r1.ok && Array.isArray(r1.data) && r1.data.length > 0) {
      const cls = pickRandom(r1.data)
      const classId = cls?._id

      if (classId) {
        const r2 = await timed(() => client.get(`/teacher/classes/${classId}/students`).then(r => ({ status: r.status, data: r.data })))
        await recordAction(cfg.runId, { name: 'teacher.classStudents', ok: r2.ok, ms: r2.ms, status: r2.status, error: r2.error, at: new Date() })

        const student = r2.ok && Array.isArray(r2.data) ? pickRandom(r2.data) : null
        const studentId = student?._id
        if (studentId) {
          const r3 = await timed(() => client.get(`/teacher/students/${studentId}/templates`).then(r => ({ status: r.status, data: r.data })))
          await recordAction(cfg.runId, { name: 'teacher.studentTemplates', ok: r3.ok, ms: r3.ms, status: r3.status, error: r3.error, at: new Date() })

          const assignment = r3.ok && Array.isArray(r3.data) ? pickRandom(r3.data) : null
          const assignmentId = assignment?._id

          if (assignmentId) {
            const r4 = await timed(() => client.get(`/teacher/template-assignments/${assignmentId}`).then(r => ({ status: r.status, data: r.data })))
            await recordAction(cfg.runId, { name: 'teacher.assignmentView', ok: r4.ok, ms: r4.ms, status: r4.status, error: r4.error, at: new Date() })

            const tpl = r4.ok ? (r4.data?.template || null) : null
            const dataPatch: any = buildDataPatchFromTemplate(tpl)

            // Reduce payload size by sampling a subset of keys (more realistic and avoids huge patches).
            const keys = Object.keys(dataPatch)
            const limited: any = {}
            const take = Math.max(3, Math.min(10, Math.floor(keys.length * 0.2)))
            for (let i = 0; i < take; i++) {
              const k = keys[Math.floor(Math.random() * keys.length)]
              limited[k] = dataPatch[k]
            }

            const r5 = await timed(() => client.patch(`/teacher/template-assignments/${assignmentId}/data`, { data: limited }).then(r => ({ status: r.status, data: r.data })))
            await recordAction(cfg.runId, { name: 'teacher.patchData', ok: r5.ok, ms: r5.ms, status: r5.status, error: r5.error, at: new Date() })

            // Also test the dedicated language-toggle endpoint on a random block (if any were present).
            if (tpl && Math.random() < 0.4) {
              const pages: any[] = Array.isArray(tpl?.pages) ? tpl.pages : []
              const candidates: { pageIdx: number; blockIdx: number; blockId?: string; items: any[] }[] = []
              for (let p = 0; p < pages.length; p++) {
                const blocks: any[] = Array.isArray(pages[p]?.blocks) ? pages[p].blocks : []
                for (let b = 0; b < blocks.length; b++) {
                  const block = blocks[b]
                  const t = String(block?.type || '')
                  if (t !== 'language_toggle' && t !== 'language_toggle_v2') continue
                  const items = Array.isArray(block?.props?.items) ? block.props.items : []
                  if (items.length === 0) continue
                  const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : undefined
                  candidates.push({ pageIdx: p, blockIdx: b, blockId, items })
                }
              }

              const c = pickRandom(candidates)
              if (c) {
                const nextItems = c.items.map((it: any) => ({ ...it, active: Math.random() < 0.6 }))
                const r6 = await timed(() => client.patch(`/teacher/template-assignments/${assignmentId}/language-toggle`, { blockId: c.blockId, pageIndex: c.pageIdx, blockIndex: c.blockIdx, items: nextItems }).then(r => ({ status: r.status, data: r.data })))
                await recordAction(cfg.runId, { name: 'teacher.languageToggle', ok: r6.ok, ms: r6.ms, status: r6.status, error: r6.error, at: new Date() })
              }
            }

            // Mark/unmark done to exercise completion flows.
            if (Math.random() < 0.35) {
              const r7 = await timed(() => client.post(`/teacher/templates/${assignmentId}/mark-done`, {}).then(r => ({ status: r.status, data: r.data })))
              await recordAction(cfg.runId, { name: 'teacher.markDone', ok: r7.ok, ms: r7.ms, status: r7.status, error: r7.error, at: new Date() })
            } else if (Math.random() < 0.15) {
              const r7 = await timed(() => client.post(`/teacher/templates/${assignmentId}/unmark-done`, {}).then(r => ({ status: r.status, data: r.data })))
              await recordAction(cfg.runId, { name: 'teacher.unmarkDone', ok: r7.ok, ms: r7.ms, status: r7.status, error: r7.error, at: new Date() })
            }
          }
        }
      }
    }

    live.inFlight--

    const think = 150 + Math.floor(Math.random() * 450)
    await sleep(think)
  }
}

const subAdminLoop = async (cfg: SimulationConfig, token: string) => {
  const live = liveByRunId.get(cfg.runId)
  if (!live) return

  const client = makeClient(cfg.baseUrl, token)

  while (!live.stopRequested && Date.now() - live.startedAt < cfg.durationSec * 1000) {
    live.inFlight++

    // Spread sub-admin work across many assignments/classes.
    const assignmentIds = (cfg.seededAssignmentIds && cfg.seededAssignmentIds.length > 0) ? cfg.seededAssignmentIds : (cfg.seededAssignmentId ? [cfg.seededAssignmentId] : [])
    const classIds = cfg.seededClassIds || []

    const roll = Math.random()

    if (assignmentIds.length > 0 && roll < 0.65) {
      const assignmentId = pickRandom(assignmentIds)
      if (assignmentId) {
        const r1 = await timed(() => client.get(`/subadmin/templates/${assignmentId}/review`).then(r => ({ status: r.status, data: r.data })))
        await recordAction(cfg.runId, { name: 'subadmin.review', ok: r1.ok, ms: r1.ms, status: r1.status, error: r1.error, at: new Date() })

        if (Math.random() < 0.8) {
          const r2 = await timed(() => client.post(`/subadmin/templates/${assignmentId}/sign`, { type: 'standard' }).then(r => ({ status: r.status, data: r.data })))
          await recordAction(cfg.runId, { name: 'subadmin.signStandard', ok: r2.ok, ms: r2.ms, status: r2.status, error: r2.error, at: new Date() })
        } else {
          const r2 = await timed(() => client.delete(`/subadmin/templates/${assignmentId}/sign`, { data: { type: 'standard' } }).then(r => ({ status: r.status, data: r.data })))
          await recordAction(cfg.runId, { name: 'subadmin.unsignStandard', ok: r2.ok, ms: r2.ms, status: r2.status, error: r2.error, at: new Date() })
        }
      }
    } else if (classIds.length > 0) {
      const classId = pickRandom(classIds)
      if (classId) {
        const r1 = await timed(() => client.post(`/subadmin/templates/sign-class/${classId}`, {}).then(r => ({ status: r.status, data: r.data })))
        await recordAction(cfg.runId, { name: 'subadmin.signClass', ok: r1.ok, ms: r1.ms, status: r1.status, error: r1.error, at: new Date() })
      }
    } else {
      const r1 = await timed(() => client.get('/subadmin/students').then(r => ({ status: r.status, data: r.data })))
      await recordAction(cfg.runId, { name: 'subadmin.students', ok: r1.ok, ms: r1.ms, status: r1.status, error: r1.error, at: new Date() })
    }

    live.inFlight--

    const think = 250 + Math.floor(Math.random() * 650)
    await sleep(think)
  }
}

const computeSummary = (actions: ActionMetric[], durationSec: number) => {
  const total = actions.length
  const errors = actions.filter(a => !a.ok).length
  const ok = total - errors
  const msList = actions.map(a => a.ms).filter(n => typeof n === 'number' && n >= 0).sort((a, b) => a - b)
  const p = (q: number) => {
    if (msList.length === 0) return null
    const idx = Math.min(msList.length - 1, Math.floor(q * (msList.length - 1)))
    return msList[idx]
  }

  return {
    durationSec,
    totalActions: total,
    okActions: ok,
    errorActions: errors,
    errorRate: total ? errors / total : 0,
    p50Ms: p(0.5),
    p95Ms: p(0.95),
    p99Ms: p(0.99),
    byAction: actions.reduce((acc: any, a) => {
      const k = a.name
      const cur = acc[k] || { total: 0, errors: 0 }
      cur.total++
      if (!a.ok) cur.errors++
      acc[k] = cur
      return acc
    }, {})
  }
}

export const getLiveSimulationState = (runId: string) => {
  return liveByRunId.get(runId) || null
}

export const stopSimulation = async (runId: string) => {
  const live = liveByRunId.get(runId)
  if (live) {
    live.stopRequested = true
  }

  await SimulationRun.findByIdAndUpdate(runId, {
    $set: { status: 'stopped', endedAt: new Date() }
  })
}

export const runSimulation = async (cfg: SimulationConfig) => {
  const startedAt = Date.now()

  const live: LiveState = {
    runId: cfg.runId,
    startedAt,
    stopRequested: false,
    activeTeacherUsers: 0,
    activeSubAdminUsers: 0,
    inFlight: 0,
    lastMetrics: {},
    recentActions: [],
  }

  liveByRunId.set(cfg.runId, live)

  const createdUserIds: string[] = []
  const actions: ActionMetric[] = []

  const originalCpu = process.cpuUsage()
  const originalMem = process.memoryUsage()

  try {
    const teachers: { token: string; userId: string }[] = []
    const subAdmins: { token: string; userId: string }[] = []

    for (let i = 0; i < cfg.teachers; i++) {
      const u = await createSimUser('TEACHER', cfg.runId)
      createdUserIds.push(u.userId)
      teachers.push({ token: u.token, userId: u.userId })
    }

    for (let i = 0; i < cfg.subAdmins; i++) {
      const u = await createSimUser('SUBADMIN', cfg.runId)
      createdUserIds.push(u.userId)
      subAdmins.push({ token: u.token, userId: u.userId })
    }

    const seeded = await ensureSeededData(cfg, teachers.map(t => t.userId), subAdmins.map(s => s.userId))
    if (seeded.assignmentId) cfg.seededAssignmentId = seeded.assignmentId
    if (Array.isArray((seeded as any).assignmentIds)) cfg.seededAssignmentIds = (seeded as any).assignmentIds
    if (Array.isArray((seeded as any).classIds)) cfg.seededClassIds = (seeded as any).classIds

    await SimulationRun.findByIdAndUpdate(cfg.runId, {
      $set: {
        lastMetrics: {
          ...(live.lastMetrics || {}),
          seededAssignmentId: cfg.seededAssignmentId || null,
          seededAssignments: cfg.seededAssignmentIds ? cfg.seededAssignmentIds.length : 0,
          seededClasses: cfg.seededClassIds ? cfg.seededClassIds.length : 0,
        }
      }
    })

    live.activeTeacherUsers = teachers.length
    live.activeSubAdminUsers = subAdmins.length

    const sampler = (async () => {
      while (!live.stopRequested && Date.now() - startedAt < cfg.durationSec * 1000) {
        const cpuNow = process.cpuUsage(originalCpu)
        const memNow = process.memoryUsage()
        live.lastMetrics = {
          activeUsers: {
            teachers: live.activeTeacherUsers,
            subAdmins: live.activeSubAdminUsers,
            inFlight: live.inFlight,
          },
          system: {
            memoryRss: memNow.rss,
            heapUsed: memNow.heapUsed,
            heapTotal: memNow.heapTotal,
            external: memNow.external,
            cpuUserMicros: cpuNow.user,
            cpuSystemMicros: cpuNow.system,
          }
        }

        await SimulationRun.findByIdAndUpdate(cfg.runId, { $set: { lastMetrics: live.lastMetrics } })
        await sleep(1000)
      }
    })()

    const teacherPromises = teachers.map(async t => {
      try {
        await teacherLoop(cfg, t.token)
      } finally {
        live.activeTeacherUsers--
      }
    })

    const subAdminPromises = subAdmins.map(async s => {
      try {
        await subAdminLoop(cfg, s.token)
      } finally {
        live.activeSubAdminUsers--
      }
    })

    const collector = (async () => {
      while (!live.stopRequested && Date.now() - startedAt < cfg.durationSec * 1000) {
        const run = await SimulationRun.findById(cfg.runId).lean()
        const recent: any[] = (run as any)?.recentActions || []
        actions.splice(0, actions.length, ...recent)
        await sleep(750)
      }
    })()

    await Promise.race([
      Promise.all([...teacherPromises, ...subAdminPromises]),
      sleep(cfg.durationSec * 1000),
    ])

    live.stopRequested = true
    await sampler.catch(() => {})
    await collector.catch(() => {})

    const cpuDelta = process.cpuUsage(originalCpu)
    const memEnd = process.memoryUsage()

    const summary = computeSummary(actions, cfg.durationSec)

    const stability = {
      pass: summary.errorRate < 0.05,
      warning: summary.errorRate >= 0.05 && summary.errorRate < 0.15,
      fail: summary.errorRate >= 0.15,
    }

    await SimulationRun.findByIdAndUpdate(cfg.runId, {
      $set: {
        status: 'completed',
        endedAt: new Date(),
        summary: {
          ...summary,
          stability,
          resourceDelta: {
            cpuUserMicros: cpuDelta.user,
            cpuSystemMicros: cpuDelta.system,
            memoryRssDelta: memEnd.rss - originalMem.rss,
            heapUsedDelta: memEnd.heapUsed - originalMem.heapUsed,
          }
        }
      }
    })
  } catch (e: any) {
    await SimulationRun.findByIdAndUpdate(cfg.runId, {
      $set: {
        status: 'failed',
        endedAt: new Date(),
        error: String(e?.message || e)
      }
    })
  } finally {
    try {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } })
      }
    } catch (e) {
    }

    liveByRunId.delete(cfg.runId)
  }
}
