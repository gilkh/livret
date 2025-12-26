import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import api from '../api'

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

  const [simStarting, setSimStarting] = useState(false)
  const [simStopping, setSimStopping] = useState(false)
  const [running, setRunning] = useState<any>(null)
  const [live, setLive] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])

  const [tab, setTab] = useState<'live' | 'history' | 'raw'>('live')

  const selectedTemplate = useMemo(() => {
    return templates.find(t => String(t?._id) === String(templateId)) || null
  }, [templates, templateId])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      const tokenParam = params.get('token')
      if (tokenParam && !sessionStorage.getItem('token')) {
        sessionStorage.setItem('token', tokenParam)
      }
    } catch (e) {
    }

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
      <div className="settings-container">
        <div className="settings-header">
          <h1 className="settings-title">Simulation Lab</h1>
          <p className="settings-subtitle">Chargement…</p>
        </div>
      </div>
    )
  }

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

  const lastMetrics = live?.lastMetrics || running?.lastMetrics || null
  const recentActions = Array.isArray(live?.recentActions) ? live.recentActions : Array.isArray(running?.recentActions) ? running.recentActions : []
  const recentActionsView = recentActions.slice(-80).reverse()

  const topRun = running
  const topSummary = history?.[0]?.summary || null

  return (
    <div className="settings-container">
      <div className="settings-header">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="settings-title">Simulation Lab</h1>
            <p className="settings-subtitle">Contrôle du sandbox (DB isolée) + exécution/diagnostics.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: sandboxServer?.running ? '#ecfdf5' : '#fef2f2', color: sandboxServer?.running ? '#047857' : '#b91c1c' }}>
              Sandbox: <strong>{sandboxServer?.running ? 'RUNNING' : 'STOPPED'}</strong>
            </span>
            <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: running ? '#eff6ff' : '#f8fafc', color: running ? '#1d4ed8' : '#475569' }}>
              Simulation: <strong>{running ? 'RUNNING' : 'IDLE'}</strong>
            </span>
            {running?._id ? (
              <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155' }}>
                Run: <strong>{String(running._id).slice(-8)}</strong>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {msg && (
        <>
          <div className="toast-message">
            <span>{msg}</span>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="settings-section" style={{ margin: 0 }}>
            <div className="section-header">
              <h2 className="section-title">Contrôle</h2>
            </div>

            <div className="setting-item" style={{ alignItems: 'flex-start' }}>
              <div className="setting-info">
                <h3>Sandbox Server</h3>
                <p>Démarre un serveur séparé (port 4001) + DB isolée.</p>
              </div>
              <div style={{ width: '100%' }}>
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
            </div>

            <div className="setting-item" style={{ alignItems: 'flex-start' }}>
              <div className="setting-info">
                <h3>Template</h3>
                <p>Le template sera copié dans le sandbox avant la simulation.</p>
              </div>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ flex: 1, minWidth: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }} disabled={!!running}>
                    {templates.map(t => (
                      <option key={String(t._id)} value={String(t._id)}>{t.name}</option>
                    ))}
                  </select>
                  <button className="btn" onClick={loadTemplates} disabled={!!running}>↻</button>
                </div>
              </div>
            </div>

            <div className="setting-item" style={{ alignItems: 'flex-start' }}>
              <div className="setting-info">
                <h3>Charge</h3>
                <p>Concurrence + durée.</p>
              </div>
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  Teachers
                  <input type="number" value={teachers} onChange={(e) => setTeachers(Number(e.target.value))} style={{ marginTop: 6, width: '100%' }} disabled={!!running} />
                </label>
                <label style={{ fontSize: 12, color: '#334155' }}>
                  SubAdmins
                  <input type="number" value={subAdmins} onChange={(e) => setSubAdmins(Number(e.target.value))} style={{ marginTop: 6, width: '100%' }} disabled={!!running} />
                </label>
                <label style={{ fontSize: 12, color: '#334155', gridColumn: '1 / -1' }}>
                  Duration (sec)
                  <input type="number" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} style={{ marginTop: 6, width: '100%' }} disabled={!!running} />
                </label>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <h3>Simulation</h3>
                <p>Démarrer / arrêter.</p>
              </div>
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

        <div style={{ display: 'grid', gap: 14 }}>
          <div className="settings-section" style={{ margin: 0 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="section-title">Dashboard</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setTab('live')} style={{ background: tab === 'live' ? '#e2e8f0' : undefined }}>Live</button>
                <button className="btn" onClick={() => setTab('history')} style={{ background: tab === 'history' ? '#e2e8f0' : undefined }}>History</button>
                <button className="btn" onClick={() => setTab('raw')} style={{ background: tab === 'raw' ? '#e2e8f0' : undefined }}>Raw</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>Teachers actifs</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{fmt(live?.activeTeacherUsers ?? lastMetrics?.activeUsers?.teachers ?? 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>SubAdmins actifs</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{fmt(live?.activeSubAdminUsers ?? lastMetrics?.activeUsers?.subAdmins ?? 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>In-flight</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{fmt(live?.inFlight ?? lastMetrics?.activeUsers?.inFlight ?? 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>p95 / err%</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  {topSummary ? `${ms(topSummary.p95Ms)} / ${Math.round((topSummary.errorRate || 0) * 100)}%` : '-'}
                </div>
              </div>
            </div>

            {tab === 'live' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Actions récentes</strong>
                    <span style={{ color: '#64748b' }}>{recentActionsView.length} items</span>
                  </div>
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: 8, textAlign: 'left', color: '#64748b' }}>Action</th>
                          <th style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>ms</th>
                          <th style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>HTTP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActionsView.map((a: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: 8 }}>
                              <span style={{ color: a.ok ? '#047857' : '#b91c1c', fontWeight: 600 }}>{a.name}</span>
                              {a.error ? <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{String(a.error).slice(0, 120)}</div> : null}
                            </td>
                            <td style={{ padding: 8, textAlign: 'right', color: '#0f172a' }}>{fmt(a.ms)}</td>
                            <td style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>{a.status ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155' }}>
                    <strong>System / Metrics</strong>
                  </div>
                  <div style={{ padding: 10, maxHeight: 420, overflow: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>RSS</div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(lastMetrics?.system?.memoryRss)}</div>
                      </div>
                      <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Heap Used</div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(lastMetrics?.system?.heapUsed)}</div>
                      </div>
                      <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>CPU user (µs)</div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(lastMetrics?.system?.cpuUserMicros)}</div>
                      </div>
                      <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>CPU sys (µs)</div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(lastMetrics?.system?.cpuSystemMicros)}</div>
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
              <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Historique</strong>
                  <span style={{ color: '#64748b' }}>{Array.isArray(history) ? history.length : 0} runs</span>
                </div>
                <div style={{ maxHeight: 560, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: 8, textAlign: 'left', color: '#64748b' }}>Date</th>
                        <th style={{ padding: 8, textAlign: 'left', color: '#64748b' }}>Status</th>
                        <th style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>Actions</th>
                        <th style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>Errors</th>
                        <th style={{ padding: 8, textAlign: 'right', color: '#64748b' }}>p95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history || []).map((r: any) => (
                        <tr key={String(r._id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: 8, color: '#0f172a' }}>{r.startedAt ? new Date(r.startedAt).toLocaleString() : String(r._id).slice(-8)}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ color: r.status === 'completed' ? '#047857' : r.status === 'running' ? '#1d4ed8' : r.status === 'failed' ? '#b91c1c' : '#475569', fontWeight: 700 }}>
                              {String(r.status || '-')}
                            </span>
                          </td>
                          <td style={{ padding: 8, textAlign: 'right', color: '#0f172a' }}>{fmt(r.summary?.totalActions)}</td>
                          <td style={{ padding: 8, textAlign: 'right', color: r.summary?.errorActions ? '#b91c1c' : '#0f172a' }}>{fmt(r.summary?.errorActions)}</td>
                          <td style={{ padding: 8, textAlign: 'right', color: '#0f172a' }}>{ms(r.summary?.p95Ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === 'raw' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155' }}>
                    <strong>Running + Live (raw)</strong>
                  </div>
                  <div style={{ padding: 10, maxHeight: 560, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ running, live }, null, 2)}</pre>
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155' }}>
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
