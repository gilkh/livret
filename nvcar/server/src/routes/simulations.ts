import { Router } from 'express'
import axios from 'axios'
import https from 'https'
import mongoose from 'mongoose'
import { requireAuth } from '../auth'
import { SimulationRun } from '../models/SimulationRun'
import { assertSimulationSandbox, getSimulationSandboxDiagnostics, isSimulationSandbox } from '../utils/simulationSandbox'
import { getLiveSimulationState, runSimulation, stopSimulation } from '../services/simulationRunner'
import { getSandboxServerStatus, startSandboxServer, stopSandboxServer } from '../services/sandboxServerManager'
import { GradebookTemplate } from '../models/GradebookTemplate'

export const simulationsRouter = Router()

const proxyToSandbox = async (req: any, res: any, method: 'get' | 'post' | 'delete' | 'patch', path: string, body?: any) => {
  const st = getSandboxServerStatus()
  if (!st.running) {
    return res.status(409).json({ error: 'sandbox_server_not_running', sandboxServer: st })
  }

  const url = `${st.baseUrl}${path}`
  const auth = req.headers?.authorization
  const isHttps = String(url).toLowerCase().startsWith('https://')

  const r = await axios.request({
    method,
    url,
    data: body,
    timeout: 30000,
    validateStatus: () => true,
    ...(isHttps ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {}),
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  })

  return res.status(r.status).json(r.data)
}

// Sandbox server lifecycle (only meaningful on the normal server)
simulationsRouter.get('/sandbox/status', requireAuth(['ADMIN']), async (req, res) => {
  if (isSimulationSandbox()) {
    return res.json({ ok: true, mode: 'sandbox', sandboxServer: { running: true, pid: process.pid, port: process.env.PORT ? Number(process.env.PORT) : 4001 } })
  }
  res.json({ ok: true, mode: 'normal', sandboxServer: getSandboxServerStatus() })
})

simulationsRouter.post('/sandbox/start', requireAuth(['ADMIN']), async (req, res) => {
  if (isSimulationSandbox()) {
    return res.status(400).json({ error: 'already_in_sandbox' })
  }

  try {
    const st = await startSandboxServer()
    res.json({ ok: true, sandboxServer: st })
  } catch (e: any) {
    res.status(500).json({ error: 'sandbox_start_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
  }
})

simulationsRouter.post('/sandbox/stop', requireAuth(['ADMIN']), async (req, res) => {
  if (isSimulationSandbox()) {
    return res.status(400).json({ error: 'cannot_stop_from_sandbox' })
  }

  const st = await stopSandboxServer()
  res.json({ ok: true, sandboxServer: st })
})

simulationsRouter.get('/status', requireAuth(['ADMIN']), async (req, res) => {
  if (!isSimulationSandbox()) {
    try {
      return await proxyToSandbox(req, res, 'get', '/simulations/status')
    } catch (e: any) {
      return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
    }
  }

  const running = await SimulationRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean()
  if (!running) {
    return res.json({
      sandbox: isSimulationSandbox(),
      sandboxDiagnostics: getSimulationSandboxDiagnostics(),
      running: null,
      live: null,
    })
  }

  const live = getLiveSimulationState(String((running as any)._id))
  res.json({
    sandbox: isSimulationSandbox(),
    sandboxDiagnostics: getSimulationSandboxDiagnostics(),
    running,
    live,
  })
})

simulationsRouter.get('/history', requireAuth(['ADMIN']), async (req, res) => {
  if (!isSimulationSandbox()) {
    try {
      return await proxyToSandbox(req, res, 'get', '/simulations/history')
    } catch (e: any) {
      return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
    }
  }

  const list = await SimulationRun.find({}).sort({ startedAt: -1 }).limit(25).lean()
  res.json({ sandbox: isSimulationSandbox(), sandboxDiagnostics: getSimulationSandboxDiagnostics(), runs: list })
})

simulationsRouter.get('/:id', requireAuth(['ADMIN']), async (req, res) => {
  if (!isSimulationSandbox()) {
    try {
      return await proxyToSandbox(req, res, 'get', `/simulations/${encodeURIComponent(String(req.params.id))}`)
    } catch (e: any) {
      return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
    }
  }

  const run = await SimulationRun.findById(req.params.id).lean()
  if (!run) return res.status(404).json({ error: 'not_found' })
  const live = getLiveSimulationState(String((run as any)._id))
  res.json({ sandbox: isSimulationSandbox(), sandboxDiagnostics: getSimulationSandboxDiagnostics(), run, live })
})

simulationsRouter.post('/start', requireAuth(['ADMIN']), async (req, res) => {
  if (!isSimulationSandbox()) {
    try {
      return await proxyToSandbox(req, res, 'post', '/simulations/start', req.body || {})
    } catch (e: any) {
      return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
    }
  }

  try {
    assertSimulationSandbox()

    const existing = await SimulationRun.findOne({ status: 'running' }).lean()
    if (existing) {
      return res.status(409).json({ error: 'already_running', runId: String((existing as any)._id) })
    }

    const { teachers, subAdmins, durationSec, thinkTimeMs, rampUpUsersPerSec, scenario, template } = req.body || {}

    console.info(`simulations.start request teachers=${teachers} subAdmins=${subAdmins} durationSec=${durationSec} thinkTimeMs=${thinkTimeMs} rampUp=${rampUpUsersPerSec} scenario=${scenario}`)

    const t = Math.max(0, Math.min(100000, Number(teachers) || 30))
    const s = Math.max(0, Math.min(10000, Number(subAdmins) || 5))
    const d = Math.max(10, Math.min(60 * 30, Number(durationSec) || 120))
    const tt = thinkTimeMs ? Math.max(0, Number(thinkTimeMs)) : undefined
    const ru = rampUpUsersPerSec ? Math.max(0, Number(rampUpUsersPerSec)) : undefined
    const sc = String(scenario || 'mixed')

    let sandboxTemplateId: string | null = null
    let templateName: string | null = null

    if (template && typeof template === 'object') {
      const clean: any = { ...template }
      delete clean._id
      delete clean.__v
      templateName = String(clean.name || '') || null
      const created = await GradebookTemplate.create(clean)
      sandboxTemplateId = String((created as any)._id)
    }

    const doc = await SimulationRun.create({
      status: 'running',
      scenario: sc,
      startedAt: new Date(),
      requestedDurationSec: d,
      teachers: t,
      subAdmins: s,
      templateName: templateName || undefined,
      sandboxTemplateId: sandboxTemplateId || undefined,
      sandbox: true,
      sandboxMarker: String(process.env.SIMULATION_SANDBOX_MARKER || 'sandbox'),
      lastMetrics: {
        dbName: mongoose.connection?.db?.databaseName,
      }
    })

    const protocol = process.env.PUBLIC_API_PROTOCOL || 'http'
    const host = process.env.PUBLIC_API_HOST || 'localhost'
    const port = process.env.PORT || '4000'
    const baseUrl = `${protocol}://${host}:${port}`

    runSimulation({
      runId: String(doc._id),
      baseUrl,
      scenario: 'mixed',
      durationSec: d,
      teachers: t,
      subAdmins: s,
      templateId: sandboxTemplateId || undefined,
      thinkTimeMs: tt,
      rampUpUsersPerSec: ru,
    }).catch(() => {})

    res.json({ ok: true, runId: String(doc._id) })
  } catch (e: any) {
    if (e?.code === 'simulation_not_allowed') {
      return res.status(403).json({ error: 'simulation_not_allowed', message: e.message })
    }
    res.status(500).json({ error: 'start_failed', message: String(e?.message || e) })
  }
})

simulationsRouter.post('/stop', requireAuth(['ADMIN']), async (req, res) => {
  if (!isSimulationSandbox()) {
    try {
      return await proxyToSandbox(req, res, 'post', '/simulations/stop', req.body || {})
    } catch (e: any) {
      return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: getSandboxServerStatus() })
    }
  }

  const { runId } = req.body || {}

  const running = runId
    ? await SimulationRun.findById(String(runId)).lean()
    : await SimulationRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean()

  if (!running) return res.status(404).json({ error: 'not_found' })

  await stopSimulation(String((running as any)._id))
  res.json({ ok: true })
})
