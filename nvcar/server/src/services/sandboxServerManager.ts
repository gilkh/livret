import axios from 'axios'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import https from 'https'
import path from 'path'

type SandboxStatus = {
  running: boolean
  pid: number | null
  port: number
  baseUrl: string
  startedAt: number | null
  lastError: string | null
}

const SANDBOX_PORT = 4001
const SANDBOX_DB_URI = 'mongodb://localhost:27017/nvcar_sandbox'

let proc: any = null
let startedAt: number | null = null
let lastError: string | null = null

const runBuild = () => {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(npmCmd, ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
    windowsHide: false,
  })

  if (r.status !== 0) {
    const out = String(r.stdout || '')
    const err = String(r.stderr || '')
    const spawnErr = (r as any).error ? String((r as any).error?.message || (r as any).error) : ''
    const status = typeof r.status === 'number' ? String(r.status) : 'null'
    const signal = r.signal ? String(r.signal) : ''
    const combined = `${out}\n${err}`.trim()
    const detailParts = [
      spawnErr ? `spawnError=${spawnErr}` : '',
      `status=${status}`,
      signal ? `signal=${signal}` : '',
      combined ? combined : '',
    ].filter(Boolean)

    const msg = detailParts.join('\n').trim().slice(0, 4000) || 'sandbox_server_build_failed'
    throw new Error(`sandbox_server_build_failed: ${msg}`)
  }
}

const getBaseUrl = () => {
  const host = process.env.PUBLIC_API_HOST || 'localhost'
  const certDir = path.resolve(process.cwd(), '..', 'certs')
  const hasCerts = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))
  const protocol = process.env.PUBLIC_API_PROTOCOL || (hasCerts ? 'https' : 'http')
  return `${protocol}://${host}:${SANDBOX_PORT}`
}

export const getSandboxServerStatus = (): SandboxStatus => {
  return {
    running: !!proc && !proc.killed,
    pid: proc?.pid || null,
    port: SANDBOX_PORT,
    baseUrl: getBaseUrl(),
    startedAt,
    lastError,
  }
}

const waitForHealthy = async (baseUrl: string) => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const isHttps = String(baseUrl).toLowerCase().startsWith('https://')
      const res = await axios.get(`${baseUrl}/health`, {
        timeout: 1500,
        validateStatus: () => true,
        ...(isHttps ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {}),
      })
      if (res.status >= 200 && res.status < 300) return
    } catch (e) {
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  throw new Error('sandbox_health_check_timeout')
}

export const startSandboxServer = async () => {
  if (proc && !proc.killed) return getSandboxServerStatus()

  lastError = null
  startedAt = Date.now()

  const baseUrl = getBaseUrl()

  const serverRoot = process.cwd()
  const entry = path.join(serverRoot, 'dist', 'index.js')

  try {
    runBuild()
  } catch (e: any) {
    lastError = String(e?.message || e)
    throw e
  }

  if (!fs.existsSync(entry)) {
    lastError = 'sandbox_server_missing_build'
    throw new Error('sandbox_server_missing_build: run `npm run build` in nvcar/server to generate dist/index.js')
  }

  proc = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(SANDBOX_PORT),
      MONGODB_URI: SANDBOX_DB_URI,
      SIMULATION_SANDBOX: 'true',
      SIMULATION_SANDBOX_MARKER: 'sandbox',
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
    windowsHide: false,
  })

  proc.on('exit', (code: any) => {
    if (code && code !== 0) lastError = `sandbox_server_exit_${code}`
    proc = null
  })

  try {
    await waitForHealthy(baseUrl)
  } catch (e: any) {
    lastError = String(e?.message || e)
    throw e
  }

  return getSandboxServerStatus()
}

export const stopSandboxServer = async () => {
  if (!proc || proc.killed) {
    proc = null
    return getSandboxServerStatus()
  }

  const pid = proc.pid

  try {
    // Windows-safe kill of process tree
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } catch (e) {
    try {
      proc.kill('SIGTERM')
    } catch (e2) {
    }
  }

  proc = null
  return getSandboxServerStatus()
}
