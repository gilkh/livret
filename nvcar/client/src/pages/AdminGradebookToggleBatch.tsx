import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import './AdminGradebookToggleBatch.css'

/* ─── types ─── */
type LevelDoc = { _id: string; name: string }

type ItemLevelBucket = {
  itemLevel: string
  relation: 'current' | 'past' | 'future'
  poly: { on: number; total: number }
  arabic: { on: number; total: number }
  english: { on: number; total: number }
}

type ClassMatrixRow = {
  classId: string
  className: string
  level: string
  byItemLevel: ItemLevelBucket[]
}

type SummaryLevelRow = {
  level: string
  on: number
  total: number
  off: number
}

type SummaryResponse = {
  classes: { classId: string; className: string; level: string; on: number; total: number; off: number }[]
  levels: SummaryLevelRow[]
  classMatrix: ClassMatrixRow[]
  totals: { on: number; total: number; off: number }
}

type Lang = 'poly' | 'arabic' | 'english'
const LANG_LABELS: Record<Lang, string> = { poly: 'Poly', arabic: 'Arabe', english: 'Anglais' }
const LANGS: Lang[] = ['poly', 'arabic', 'english']

/* ─── component ─── */
export default function AdminGradebookToggleBatch() {
  const { years, activeYearId } = useSchoolYear()

  const [selectedYearId, setSelectedYearId] = useState('')
  const [levels, setLevels] = useState<LevelDoc[]>([])
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [toggleLevel, setToggleLevel] = useState('ALL')

  const [loading, setLoading] = useState(false)
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  /* ─── auto-select year ─── */
  useEffect(() => {
    if (selectedYearId) return
    if (activeYearId) { setSelectedYearId(activeYearId); return }
    if (years.length > 0) setSelectedYearId(years[0]._id)
  }, [selectedYearId, activeYearId, years])

  /* ─── load levels once per year ─── */
  useEffect(() => {
    if (!selectedYearId) return
    api.get('/levels').then(r => setLevels(r.data || []))
  }, [selectedYearId])

  /* ─── load summary ─── */
  const loadSummary = async (yearId: string, level: string) => {
    const r = await api.get('/admin-extras/gradebooks/toggles/summary', { params: { schoolYearId: yearId, toggleLevel: level } })
    setSummary(r.data as SummaryResponse)
  }

  useEffect(() => {
    if (!selectedYearId) return
    setLoading(true); setError('')
    loadSummary(selectedYearId, toggleLevel)
      .catch(() => setError('Impossible de charger le résumé.'))
      .finally(() => setLoading(false))
  }, [selectedYearId, toggleLevel])

  const sortedLevels = useMemo(() => [...levels].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })), [levels])

  /* ─── all item-level names across the matrix ─── */
  const allItemLevels = useMemo(() => {
    if (!summary?.classMatrix?.length) return [] as string[]
    const set = new Set<string>()
    summary.classMatrix.forEach(row => row.byItemLevel.forEach(b => set.add(b.itemLevel)))
    const levelOrder = new Map(sortedLevels.map((l, i) => [l.name.toUpperCase(), i]))
    return Array.from(set).sort((a, b) => (levelOrder.get(a) ?? 99) - (levelOrder.get(b) ?? 99))
  }, [summary, sortedLevels])

  /* ─── relation map: for each item level, determine if any class considers it past/future ─── */
  const itemLevelRelation = useMemo(() => {
    const map = new Map<string, Set<'current' | 'past' | 'future'>>()
    summary?.classMatrix?.forEach(row => row.byItemLevel.forEach(b => {
      if (!map.has(b.itemLevel)) map.set(b.itemLevel, new Set())
      map.get(b.itemLevel)!.add(b.relation)
    }))
    return map
  }, [summary])

  const isBusy = loading || !!submittingKey

  /* ─── batch update helper ─── */
  const runBatch = async (
    scopeType: 'class' | 'level',
    scopeValue: string,
    active: boolean,
    levelRelation: string,
    languageCategory: string,
    batchToggleLevel: string,
    uiKey: string
  ) => {
    try {
      setSubmittingKey(uiKey); setError(''); setToast('')
      const r = await api.post('/admin-extras/gradebooks/toggles/batch-update', {
        schoolYearId: selectedYearId,
        scopeType, scopeValue,
        toggleLevel: batchToggleLevel,
        levelRelation,
        languageCategory,
        active,
      })
      const n = r.data?.updatedItems ?? 0
      setToast(`${n} item${n !== 1 ? 's' : ''} mis à jour`)
      await loadSummary(selectedYearId, toggleLevel)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Échec de la mise à jour.')
    } finally {
      setSubmittingKey(null)
    }
  }

  const handleCellToggle = (classId: string, itemLevel: string, lang: Lang, active: boolean) => {
    runBatch('class', classId, active, 'all', lang, itemLevel, `cell:${classId}:${itemLevel}:${lang}:${active}`)
  }

  const handleClassToggle = (classId: string, active: boolean) => {
    runBatch('class', classId, active, 'all', 'all', toggleLevel, `class:${classId}:${active}`)
  }

  const handleItemLevelToggle = (itemLevel: string, active: boolean) => {
    // Turn on/off all items that belong to this specific item level across all classes
    if (!summary) return
    const uniqueClassLevels = Array.from(new Set(summary.classes.map(c => c.level).filter(Boolean)))
    const doAll = async () => {
      setSubmittingKey(`itemlvl:${itemLevel}:${active}`); setError(''); setToast('')
      let total = 0
      try {
        for (const classLevel of uniqueClassLevels) {
          const r = await api.post('/admin-extras/gradebooks/toggles/batch-update', {
            schoolYearId: selectedYearId,
            scopeType: 'level', scopeValue: classLevel,
            toggleLevel: itemLevel, levelRelation: 'all', languageCategory: 'all', active,
          })
          total += r.data?.updatedItems ?? 0
        }
        setToast(`${total} item${total !== 1 ? 's' : ''} mis à jour`)
        await loadSummary(selectedYearId, toggleLevel)
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Échec.')
      } finally {
        setSubmittingKey(null)
      }
    }
    doAll()
  }

  const handleAll = async (active: boolean) => {
    if (!summary) return
    const uniqueLevels = Array.from(new Set(summary.classes.map(c => c.level).filter(Boolean)))
    try {
      setSubmittingKey('all'); setError(''); setToast('')
      let total = 0
      for (const lvl of uniqueLevels) {
        const r = await api.post('/admin-extras/gradebooks/toggles/batch-update', {
          schoolYearId: selectedYearId,
          scopeType: 'level', scopeValue: lvl,
          toggleLevel, levelRelation: 'all', languageCategory: 'all', active,
        })
        total += r.data?.updatedItems ?? 0
      }
      setToast(`${total} item${total !== 1 ? 's' : ''} mis à jour`)
      await loadSummary(selectedYearId, toggleLevel)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Échec.')
    } finally {
      setSubmittingKey(null)
    }
  }

  /* ─── helpers ─── */
  const pct = (on: number, total: number) => total === 0 ? 0 : Math.round((on / total) * 100)
  const cellSum = (b: ItemLevelBucket) => ({ on: b.poly.on + b.arabic.on + b.english.on, total: b.poly.total + b.arabic.total + b.english.total })

  /* ─── render ─── */
  return (
    <div className="tgl-page">
      <header className="tgl-header">
        <div className="tgl-header-icon">🔀</div>
        <div>
          <h1>Gestion des Toggles Langues</h1>
          <p>Comptez et activez / désactivez les toggles par classe, niveau et langue</p>
        </div>
      </header>

      {/* Filters */}
      <div className="tgl-filters">
        <label>
          <span>Année</span>
          <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)} disabled={isBusy}>
            <option value="">—</option>
            {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
          </select>
        </label>
        <label>
          <span>Filtre niveau des items</span>
          <select value={toggleLevel} onChange={e => setToggleLevel(e.target.value)} disabled={isBusy}>
            <option value="ALL">Tous</option>
            {sortedLevels.map(l => <option key={l._id} value={l.name}>{l.name}</option>)}
          </select>
        </label>
        <div className="tgl-global-actions">
          <button className="tgl-btn tgl-btn-on" onClick={() => handleAll(true)} disabled={isBusy || !summary}>✅ Tout activer</button>
          <button className="tgl-btn tgl-btn-off" onClick={() => handleAll(false)} disabled={isBusy || !summary}>❌ Tout désactiver</button>
        </div>
      </div>

      {/* Feedback */}
      {loading && <div className="tgl-loading"><div className="tgl-spinner" />Chargement…</div>}
      {error && <div className="tgl-error">⚠️ {error}</div>}
      {toast && <div className="tgl-toast" onClick={() => setToast('')}>✓ {toast}</div>}

      {/* Stats */}
      {summary && !loading && (
        <div className="tgl-stats">
          <div className="tgl-stat"><span className="tgl-stat-n">{summary.totals.total}</span><span className="tgl-stat-l">Total</span></div>
          <div className="tgl-stat tgl-stat-on"><span className="tgl-stat-n">{summary.totals.on}</span><span className="tgl-stat-l">ON</span></div>
          <div className="tgl-stat tgl-stat-off"><span className="tgl-stat-n">{summary.totals.off}</span><span className="tgl-stat-l">OFF</span></div>
          <div className="tgl-stat"><span className="tgl-stat-n">{pct(summary.totals.on, summary.totals.total)}%</span><span className="tgl-stat-l">Activés</span></div>
        </div>
      )}

      {/* Matrix */}
      {summary && summary.classMatrix?.length > 0 && allItemLevels.length > 0 && (
        <div className="tgl-matrix-wrap">
          <table className="tgl-matrix">
            <thead>
              <tr>
                <th className="tgl-th-class" rowSpan={2}>Classe</th>
                <th className="tgl-th-class" rowSpan={2}>Niv.</th>
                {allItemLevels.map(lvl => {
                  const rels = itemLevelRelation.get(lvl)
                  const onlyPast = rels?.has('past') && !rels?.has('current') && !rels?.has('future')
                  const onlyFuture = rels?.has('future') && !rels?.has('current') && !rels?.has('past')
                  const isMixed = (rels?.size ?? 0) > 1
                  return (
                    <th key={lvl} colSpan={3} className={`tgl-th-level ${onlyPast ? 'tgl-th-past' : ''} ${onlyFuture ? 'tgl-th-future' : ''}`}>
                      <div className="tgl-th-level-inner">
                        <span className="tgl-th-level-name">{lvl}</span>
                        {onlyPast && <span className="tgl-th-tag tgl-tag-past">passé</span>}
                        {onlyFuture && <span className="tgl-th-tag tgl-tag-future">futur</span>}
                        {isMixed && <span className="tgl-th-tag tgl-tag-mixed">mixte</span>}
                        <div className="tgl-th-level-actions">
                          <button className="tgl-mbtn tgl-mbtn-on" onClick={() => handleItemLevelToggle(lvl, true)} disabled={isBusy}>ON</button>
                          <button className="tgl-mbtn tgl-mbtn-off" onClick={() => handleItemLevelToggle(lvl, false)} disabled={isBusy}>OFF</button>
                        </div>
                      </div>
                    </th>
                  )
                })}
                <th className="tgl-th-total" rowSpan={2}>Total</th>
                <th className="tgl-th-actions" rowSpan={2}>Actions</th>
              </tr>
              <tr>
                {allItemLevels.map(lvl => LANGS.map(lang => (
                  <th key={`${lvl}-${lang}`} className="tgl-th-lang">{LANG_LABELS[lang]}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {summary.classMatrix.map(row => {
                const bucketMap = new Map(row.byItemLevel.map(b => [b.itemLevel, b]))
                let rowOn = 0, rowTotal = 0
                row.byItemLevel.forEach(b => { const s = cellSum(b); rowOn += s.on; rowTotal += s.total })

                return (
                  <tr key={row.classId}>
                    <td className="tgl-td-class">{row.className}</td>
                    <td className="tgl-td-level">{row.level || '—'}</td>
                    {allItemLevels.map(lvl => {
                      const bucket = bucketMap.get(lvl)
                      const isPast = bucket?.relation === 'past'
                      const isFuture = bucket?.relation === 'future'
                      return LANGS.map(lang => {
                        const cell = bucket ? bucket[lang] : { on: 0, total: 0 }
                        const isEmpty = cell.total === 0
                        return (
                          <td key={`${lvl}-${lang}`} className={`tgl-td-cell ${isPast ? 'tgl-past' : ''} ${isFuture ? 'tgl-future' : ''} ${isEmpty ? 'tgl-empty' : ''}`}>
                            {isFuture ? (
                              <div className="tgl-cell tgl-cell-blurred">
                                <span className="tgl-cell-count">{cell.total > 0 ? `${cell.on}/${cell.total}` : '—'}</span>
                              </div>
                            ) : isEmpty ? (
                              <span className="tgl-dash">—</span>
                            ) : (
                              <div className="tgl-cell">
                                <span className={`tgl-cell-count ${cell.on === cell.total ? 'all-on' : cell.on === 0 ? 'all-off' : ''}`}>
                                  {cell.on}/{cell.total}
                                </span>
                                <div className="tgl-cell-btns">
                                  <button className="tgl-mbtn tgl-mbtn-on" onClick={() => handleCellToggle(row.classId, lvl, lang, true)} disabled={isBusy || cell.on === cell.total}>ON</button>
                                  <button className="tgl-mbtn tgl-mbtn-off" onClick={() => handleCellToggle(row.classId, lvl, lang, false)} disabled={isBusy || cell.on === 0}>OFF</button>
                                </div>
                              </div>
                            )}
                          </td>
                        )
                      })
                    })}
                    <td className="tgl-td-total">
                      <span className={`tgl-cell-count ${rowOn === rowTotal && rowTotal > 0 ? 'all-on' : rowOn === 0 ? 'all-off' : ''}`}>{rowOn}/{rowTotal}</span>
                    </td>
                    <td className="tgl-td-actions">
                      <button className="tgl-mbtn tgl-mbtn-on" onClick={() => handleClassToggle(row.classId, true)} disabled={isBusy || rowTotal === 0}>ON</button>
                      <button className="tgl-mbtn tgl-mbtn-off" onClick={() => handleClassToggle(row.classId, false)} disabled={isBusy || rowTotal === 0}>OFF</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="tgl-legend">
            {summary.classMatrix.some(r => r.byItemLevel.some(b => b.relation === 'past')) && (
              <span className="tgl-legend-item"><span className="tgl-legend-past" /> = niveau passé</span>
            )}
            {summary.classMatrix.some(r => r.byItemLevel.some(b => b.relation === 'future')) && (
              <span className="tgl-legend-item"><span className="tgl-legend-future" /> = niveau futur (non modifiable)</span>
            )}
            <span className="tgl-legend-item"><strong>ON</strong>/Total = toggles activés sur le total</span>
          </div>
        </div>
      )}

      {/* Per-level summary */}
      {summary && summary.levels.length > 0 && (
        <div className="tgl-section">
          <h2>Résumé par niveau de classe</h2>
          <div className="tgl-level-cards">
            {summary.levels.map(lv => (
              <div key={lv.level} className="tgl-level-card">
                <div className="tgl-level-card-header">
                  <span className="tgl-level-badge">{lv.level}</span>
                  <span className="tgl-level-pct">{pct(lv.on, lv.total)}%</span>
                </div>
                <div className="tgl-level-bar"><div className="tgl-level-bar-fill" style={{ width: `${pct(lv.on, lv.total)}%` }} /></div>
                <div className="tgl-level-detail">{lv.on} ON / {lv.total} total</div>
                <div className="tgl-level-actions">
                  <button className="tgl-mbtn tgl-mbtn-on" onClick={() => runBatch('level', lv.level, true, 'all', 'all', toggleLevel, `lv:${lv.level}:on`)} disabled={isBusy}>ON</button>
                  <button className="tgl-mbtn tgl-mbtn-off" onClick={() => runBatch('level', lv.level, false, 'all', 'all', toggleLevel, `lv:${lv.level}:off`)} disabled={isBusy}>OFF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && !summary.classMatrix?.length && !loading && (
        <div className="tgl-empty-state">Aucun toggle trouvé pour cette année / ce filtre.</div>
      )}
    </div>
  )
}
