import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../api'
import './SimulationLab.css'

export default function SimulationLab() {
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const [sandboxServer, setSandboxServer] = useState<any>(null)
  const [sandboxStarting, setSandboxStarting] = useState(false)
  const [sandboxStopping, setSandboxStopping] = useState(false)

  const sandboxBaseUrl = String(sandboxServer?.baseUrl || 'https://localhost:4001')

  const sandboxApi = useMemo(() => {
    const a = axios.create({ baseURL: sandboxBaseUrl })
    a.interceptors.request.use(config => {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })
    return a
  }, [sandboxBaseUrl])

  const [templates, setTemplates] = useState<any[]>([])
  const [templateId, setTemplateId] = useState<string>('')

  const [teachers, setTeachers] = useState(30)
  const [subAdmins, setSubAdmins] = useState(5)
  const [durationSec, setDurationSec] = useState(120)
  const [thinkTimeMs, setThinkTimeMs] = useState(500)
  const [rampUpUsersPerSec, setRampUpUsersPerSec] = useState(10)

  const [simStarting, setSimStarting] = useState(false)
  const [simStopping, setSimStopping] = useState(false)
  const [running, setRunning] = useState<any>(null)
  const [live, setLive] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])

  const [tab, setTab] = useState<'live' | 'history' | 'raw'>('live')
  const [now, setNow] = useState(Date.now())

  const selectedTemplate = useMemo(() => {
    return templates.find(t => String(t?._id) === String(templateId)) || null
  }, [templates, templateId])

  // Move token logic to top level or a separate effect that doesn't conflict
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      const tokenParam = params.get('token')
      if (tokenParam && !sessionStorage.getItem('token')) {
        sessionStorage.setItem('token', tokenParam)
      }
    } catch (e) {
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    ;(async () => {
      await Promise.all([loadSandboxServer(), loadTemplates(), loadStatus(), loadHistory()])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!running?._id) return
    const id = setInterval(() => {
      loadStatus().catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [running?._id])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 3500)
    return () => clearTimeout(t)
  }, [msg])

  const loadSandboxServer = async () => {
    try {
      const res = await api.get('/simulations/sandbox/status')
      setSandboxServer(res.data?.sandboxServer || null)
    } catch (e) {
      setSandboxServer(null)
    }
  }

  const startSandbox = async () => {
    setSandboxStarting(true)
    try {
      const res = await api.post('/simulations/sandbox/start')
      setSandboxServer(res.data?.sandboxServer || null)
      setMsg('Sandbox démarré')
      await loadStatus()
      await loadHistory()
    } catch (e: any) {
      const payload = e?.response?.data
      console.error('sandbox start failed', payload || e)
      if (payload?.sandboxServer) setSandboxServer(payload.sandboxServer)
      setMsg('Erreur démarrage sandbox: ' + String(payload?.message || e?.message || 'unknown'))
      await loadSandboxServer().catch(() => {})
    } finally {
      setSandboxStarting(false)
    }
  }

  const stopSandbox = async () => {
    setSandboxStopping(true)
    try {
      const res = await api.post('/simulations/sandbox/stop')
      setSandboxServer(res.data?.sandboxServer || null)
      setMsg('Sandbox arrêté')
      await loadStatus()
      await loadHistory()
    } catch (e: any) {
      setMsg('Erreur arrêt sandbox: ' + (e?.response?.data?.message || e?.message || 'unknown'))
    } finally {
      setSandboxStopping(false)
    }
  }

  const loadTemplates = async () => {
    try {
      const res = await api.get('/templates')
      const list = Array.isArray(res.data) ? res.data : []
      setTemplates(list)
      if (!templateId && list.length > 0) {
        setTemplateId(String(list[0]?._id || ''))
      }
    } catch (e) {
      setTemplates([])
    }
  }

  const loadStatus = async () => {
    try {
      const res = await sandboxApi.get('/simulations/status')
      setRunning(res.data?.running || null)
      setLive(res.data?.live || null)
    } catch (e) {
      setRunning(null)
      setLive(null)
    }
  }

  const loadHistory = async () => {
    try {
      const res = await sandboxApi.get('/simulations/history')
      setHistory(Array.isArray(res.data?.runs) ? res.data.runs : [])
    } catch (e) {
      setHistory([])
    }
  }

  const startSimulation = async () => {
    if (!sandboxServer?.running) {
      setMsg('Démarre le serveur sandbox avant la simulation')
      return
    }
    if (!selectedTemplate) {
      setMsg('Sélectionne un template')
      return
    }

    setSimStarting(true)
    try {
      await sandboxApi.post('/simulations/start', {
        teachers,
        subAdmins,
        durationSec,
        thinkTimeMs,
        rampUpUsersPerSec,
        scenario: 'mixed',
        template: selectedTemplate,
      })
      setMsg('Simulation démarrée')
      await loadStatus()
      await loadHistory()
    } catch (e: any) {
      setMsg('Erreur démarrage simulation: ' + (e?.response?.data?.message || e?.message || 'unknown'))
    } finally {
      setSimStarting(false)
    }
  }

  const stopSimulation = async () => {
    setSimStopping(true)
    try {
      await sandboxApi.post('/simulations/stop', { runId: running?._id })
      setMsg('Simulation arrêtée')
      await loadStatus()
      await loadHistory()
    } catch (e: any) {
      setMsg('Erreur arrêt simulation: ' + (e?.response?.data?.message || e?.message || 'unknown'))
    } finally {
      setSimStopping(false)
    }
  }

  if (loading) {
    return (
      <div className="simulation-lab-container">
        <div className="simulation-header">
          <h1 className="simulation-title">Simulation Lab</h1>
          <p className="simulation-subtitle">Chargement…</p>
        </div>
      </div>
    )
  }

  return (
    <SimulationLabContent
      msg={msg}
      sandboxServer={sandboxServer}
      sandboxStarting={sandboxStarting}
      sandboxStopping={sandboxStopping}
      templateId={templateId}
      setTemplateId={setTemplateId}
      templates={templates}
      teachers={teachers}
      setTeachers={setTeachers}
      subAdmins={subAdmins}
      setSubAdmins={setSubAdmins}
      durationSec={durationSec}
      setDurationSec={setDurationSec}
      thinkTimeMs={thinkTimeMs}
      setThinkTimeMs={setThinkTimeMs}
      rampUpUsersPerSec={rampUpUsersPerSec}
      setRampUpUsersPerSec={setRampUpUsersPerSec}
      running={running}
      simStarting={simStarting}
      simStopping={simStopping}
      startSandbox={startSandbox}
      stopSandbox={stopSandbox}
      loadSandboxServer={loadSandboxServer}
      loadTemplates={loadTemplates}
      loadStatus={loadStatus}
      loadHistory={loadHistory}
      startSimulation={startSimulation}
      stopSimulation={stopSimulation}
      live={live}
      history={history}
      tab={tab}
      setTab={setTab}
      now={now}
    />
  )
}

function SimulationLabContent({
  msg, sandboxServer, sandboxStarting, sandboxStopping,
  templateId, setTemplateId, templates,
  teachers, setTeachers, subAdmins, setSubAdmins, durationSec, setDurationSec,
  thinkTimeMs, setThinkTimeMs, rampUpUsersPerSec, setRampUpUsersPerSec,
  running, simStarting, simStopping,
  startSandbox, stopSandbox, loadSandboxServer, loadTemplates, loadStatus, loadHistory,
  startSimulation, stopSimulation,
  live, history, tab, setTab, now
}: any) {
  const lastMetrics = live?.lastMetrics || running?.lastMetrics || null
  const recentActions = Array.isArray(live?.recentActions) ? live.recentActions : Array.isArray(running?.recentActions) ? running.recentActions : []
  const recentActionsView = recentActions.slice(-80).reverse()

  const topRun = running
  const topSummary = history?.[0]?.summary || null

  const elapsedSec = live?.startedAt ? (now - new Date(live.startedAt).getTime()) / 1000 : 0
  const rps = (elapsedSec > 1 && live?.totalActions) ? (live.totalActions / elapsedSec) : 0
  const liveErrorRate = live?.totalActions ? (live.errorActions / live.totalActions) : 0

  const chartData = useMemo(() => {
    return recentActions.map((a: any) => ({
      time: new Date(a.at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ms: a.ms,
      ok: a.ok
    })).slice(-100)
  }, [recentActions])

  const fmt = (n: any) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return '-'
    return v.toLocaleString()
  }

  const ms = (n: any) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return '-'
    return `${v}ms`
  }

  return (
    <div className="simulation-lab-container">
      <div className="simulation-header">
        <div className="simulation-title-row">
          <div>
            <h1 className="simulation-title">Simulation Lab</h1>
            <p className="simulation-subtitle">Contrôle du sandbox (DB isolée) + exécution/diagnostics.</p>
          </div>
          <div className="simulation-status-badges">
            <span className={`status-badge ${sandboxServer?.running ? 'running' : 'stopped'}`}>
              Sandbox: <strong>{sandboxServer?.running ? 'RUNNING' : 'STOPPED'}</strong>
            </span>
            <span className={`status-badge ${running ? 'running' : 'idle'}`}>
              Simulation: <strong>{running ? 'RUNNING' : 'IDLE'}</strong>
            </span>
            {running?._id ? (
              <span className="status-badge info">
                Run: <strong>{String(running._id).slice(-8)}</strong>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {msg && (
        <div className="toast-message">
          <span>{msg}</span>
        </div>
      )}

      <div className="simulation-grid">
        <div className="control-column">
          <div className="simulation-card">
            <div className="card-header">
              <h2 className="card-title">Contrôle</h2>
            </div>

            <div className="control-item">
              <h3>Sandbox Server</h3>
              <p>Démarre un serveur séparé (port 4001) + DB isolée.</p>
              
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  BaseUrl: <strong>{sandboxServer?.baseUrl || '-'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!sandboxServer?.running ? (
                    <button className="btn" onClick={startSandbox} disabled={sandboxStarting}>
                      {sandboxStarting ? 'Démarrage…' : 'Démarrer sandbox'}
                    </button>
                  ) : (
                    <button className="btn" onClick={stopSandbox} disabled={sandboxStopping}>
                      {sandboxStopping ? 'Arrêt…' : 'Arrêter sandbox'}
                    </button>
                  )}
                  <button className="btn" onClick={loadSandboxServer}>↻ Statut</button>
                </div>
                {sandboxServer?.lastError ? (
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>Erreur: {String(sandboxServer.lastError)}</div>
                ) : null}
              </div>
            </div>

            <div className="control-item">
              <h3>Template</h3>
              <p>Le template sera copié dans le sandbox avant la simulation.</p>
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select 
                  className="select-field"
                  value={templateId} 
                  onChange={(e) => setTemplateId(e.target.value)} 
                  disabled={!!running}
                >
                  {templates.map((t: any) => (
                    <option key={String(t._id)} value={String(t._id)}>{t.name}</option>
                  ))}
                </select>
                <button className="btn" onClick={loadTemplates} disabled={!!running}>↻</button>
              </div>
            </div>

            <div className="control-item">
              <h3>Charge</h3>
              <p>Concurrence + durée + performance.</p>
              
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  Teachers
                  <input 
                    type="number" 
                    className="input-field"
                    value={teachers} 
                    onChange={(e) => setTeachers(Number(e.target.value))} 
                    style={{ marginTop: 6 }} 
                    disabled={!!running} 
                  />
                </label>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  SubAdmins
                  <input 
                    type="number" 
                    className="input-field"
                    value={subAdmins} 
                    onChange={(e) => setSubAdmins(Number(e.target.value))} 
                    style={{ marginTop: 6 }} 
                    disabled={!!running} 
                  />
                </label>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  Think Time (ms)
                  <input 
                    type="number" 
                    className="input-field"
                    value={thinkTimeMs} 
                    onChange={(e) => setThinkTimeMs(Number(e.target.value))} 
                    style={{ marginTop: 6 }} 
                    disabled={!!running} 
                  />
                </label>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  Ramp-up (users/s)
                  <input 
                    type="number" 
                    className="input-field"
                    value={rampUpUsersPerSec} 
                    onChange={(e) => setRampUpUsersPerSec(Number(e.target.value))} 
                    style={{ marginTop: 6 }} 
                    disabled={!!running} 
                  />
                </label>
                <label style={{ fontSize: 12, color: '#334155', gridColumn: '1 / -1' }}>
                  Duration (sec)
                  <input 
                    type="number" 
                    className="input-field"
                    value={durationSec} 
                    onChange={(e) => setDurationSec(Number(e.target.value))} 
                    style={{ marginTop: 6 }} 
                    disabled={!!running} 
                  />
                </label>
              </div>
            </div>

            <div className="control-item">
              <h3>Simulation</h3>
              <p>Démarrer / arrêter.</p>
              
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!running ? (
                  <button className="btn primary" onClick={startSimulation} disabled={simStarting || !sandboxServer?.running || !templateId}>
                    {simStarting ? 'Démarrage…' : 'Démarrer'}
                  </button>
                ) : (
                  <button className="btn danger" onClick={stopSimulation} disabled={simStopping}>
                    {simStopping ? 'Arrêt…' : 'Arrêter'}
                  </button>
                )}
                <button className="btn" onClick={async () => { await loadStatus(); await loadHistory(); }}>↻ Actualiser</button>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-column">
          <div className="simulation-card">
            <div className="card-header">
              <h2 className="card-title">Dashboard</h2>
              <div className="tab-group">
                <button className={`tab-btn ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}>Live</button>
                <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
                <button className={`tab-btn ${tab === 'raw' ? 'active' : ''}`} onClick={() => setTab('raw')}>Raw</button>
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Total Actions</div>
                <div className="metric-value">{fmt(live?.totalActions ?? 0)}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{fmt(live?.errorActions ?? 0)} errors</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">RPS (avg)</div>
                <div className="metric-value" style={{ color: '#2563eb' }}>{rps.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>req/sec</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">In-flight</div>
                <div className="metric-value">{fmt(live?.inFlight ?? lastMetrics?.activeUsers?.inFlight ?? 0)}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Active requests</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Error Rate</div>
                <div className="metric-value" style={{ color: liveErrorRate > 0.05 ? '#dc2626' : '#059669' }}>
                  {(liveErrorRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Active Users</div>
                <div className="metric-value">{fmt((live?.activeTeacherUsers || 0) + (live?.activeSubAdminUsers || 0))}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Teachers + Admins</div>
              </div>
            </div>

            {chartData.length > 0 && (
              <div style={{ height: 200, marginBottom: 20, background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                 <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>Response Time (ms) - Live</div>
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis dataKey="time" hide />
                     <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}ms`} />
                     <Tooltip 
                       contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                       labelStyle={{ color: '#64748b', fontSize: 11 }}
                     />
                     <Line type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
            )}

            {tab === 'live' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="data-table-container">
                  <div className="data-table-header">
                    <span>Actions récentes</span>
                    <span style={{ color: '#64748b' }}>{recentActionsView.length} items</span>
                  </div>
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th style={{ textAlign: 'right' }}>ms</th>
                          <th style={{ textAlign: 'right' }}>HTTP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActionsView.map((a: any, idx: number) => (
                          <tr key={idx}>
                            <td>
                              <span style={{ color: a.ok ? '#047857' : '#b91c1c', fontWeight: 600 }}>{a.name}</span>
                              {a.error ? <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{String(a.error).slice(0, 120)}</div> : null}
                            </td>
                            <td style={{ textAlign: 'right', color: '#0f172a' }}>{fmt(a.ms)}</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>{a.status ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="data-table-container">
                  <div className="data-table-header">
                    <span>System / Metrics</span>
                  </div>
                  <div style={{ padding: 10, maxHeight: 420, overflow: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="metric-card" style={{ background: '#f8fafc', boxShadow: 'none' }}>
                        <div className="metric-label">RSS</div>
                        <div className="metric-value" style={{ fontSize: '1.25rem' }}>{fmt(lastMetrics?.system?.memoryRss)}</div>
                      </div>
                      <div className="metric-card" style={{ background: '#f8fafc', boxShadow: 'none' }}>
                        <div className="metric-label">Heap Used</div>
                        <div className="metric-value" style={{ fontSize: '1.25rem' }}>{fmt(lastMetrics?.system?.heapUsed)}</div>
                      </div>
                      <div className="metric-card" style={{ background: '#f8fafc', boxShadow: 'none' }}>
                        <div className="metric-label">CPU user</div>
                        <div className="metric-value" style={{ fontSize: '1.25rem' }}>{fmt(lastMetrics?.system?.cpuUserMicros)}</div>
                      </div>
                      <div className="metric-card" style={{ background: '#f8fafc', boxShadow: 'none' }}>
                        <div className="metric-label">CPU sys</div>
                        <div className="metric-value" style={{ fontSize: '1.25rem' }}>{fmt(lastMetrics?.system?.cpuSystemMicros)}</div>
                      </div>
                    </div>

                    {topRun ? (
                      <div style={{ marginTop: 12, border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Run</div>
                        <div style={{ fontSize: 12, color: '#0f172a' }}><strong>Scenario:</strong> {String(topRun.scenario || '-')}</div>
                        <div style={{ fontSize: 12, color: '#0f172a' }}><strong>Teachers/SubAdmins:</strong> {fmt(topRun.teachers)} / {fmt(topRun.subAdmins)}</div>
                        <div style={{ fontSize: 12, color: '#0f172a' }}><strong>Template:</strong> {String(topRun.templateName || '-')}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'history' ? (
              <div className="data-table-container">
                <div className="data-table-header">
                  <span>Historique</span>
                  <span style={{ color: '#64748b' }}>{Array.isArray(history) ? history.length : 0} runs</span>
                </div>
                <div style={{ maxHeight: 560, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                        <th style={{ textAlign: 'right' }}>Errors</th>
                        <th style={{ textAlign: 'right' }}>p95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history || []).map((r: any) => (
                        <tr key={String(r._id)}>
                          <td style={{ color: '#0f172a' }}>{r.startedAt ? new Date(r.startedAt).toLocaleString() : String(r._id).slice(-8)}</td>
                          <td>
                            <span style={{ color: r.status === 'completed' ? '#047857' : r.status === 'running' ? '#1d4ed8' : r.status === 'failed' ? '#b91c1c' : '#475569', fontWeight: 700 }}>
                              {String(r.status || '-')}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', color: '#0f172a' }}>{fmt(r.summary?.totalActions)}</td>
                          <td style={{ textAlign: 'right', color: r.summary?.errorActions ? '#b91c1c' : '#0f172a' }}>{fmt(r.summary?.errorActions)}</td>
                          <td style={{ textAlign: 'right', color: '#0f172a' }}>{ms(r.summary?.p95Ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === 'raw' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="data-table-container">
                  <div className="data-table-header">
                    <strong>Running + Live (raw)</strong>
                  </div>
                  <div style={{ padding: 10, maxHeight: 560, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ running, live }, null, 2)}</pre>
                  </div>
                </div>
                <div className="data-table-container">
                  <div className="data-table-header">
                    <strong>History (raw)</strong>
                  </div>
                  <div style={{ padding: 10, maxHeight: 560, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(history, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
