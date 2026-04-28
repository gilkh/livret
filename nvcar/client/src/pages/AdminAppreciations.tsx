import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { ChevronDown, ChevronRight, Search, Filter, Save, CheckCircle, AlertCircle, ChevronsUp, ChevronsDown, Upload, X } from 'lucide-react'

type Block = { type: string; props?: any }
type Page = { title?: string; blocks?: Block[] }
type Template = { _id?: string; name: string; pages?: Page[]; status?: string }

type SaveState = {
  busy?: boolean
  message?: string
  type?: 'success' | 'error'
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

const findTextDifferences = (male: string, female: string) => {
  const wordsMale = male.trim().split(/[\s,.;:!?]+/).filter(Boolean)
  const wordsFemale = female.trim().split(/[\s,.;:!?]+/).filter(Boolean)
  const diffs: { m: string; f: string }[] = []

  const len = Math.max(wordsMale.length, wordsFemale.length)
  for (let i = 0; i < len; i++) {
    const m = wordsMale[i] || ''
    const f = wordsFemale[i] || ''
    if (m.toLowerCase() !== f.toLowerCase()) {
      diffs.push({ m, f })
    }
  }
  return diffs
}

const buildAppreciations = (block: Block) => {
  const options = Array.isArray(block?.props?.options) ? block.props.options : []
  const current = Array.isArray(block?.props?.appreciations) ? block.props.appreciations : []

  return options
    .map((option: unknown) => {
      const optionText = normalizeText(option)
      if (!optionText) return null
      const existing = current.find((entry: any) => normalizeText(entry?.option) === optionText)
      return {
        option: optionText,
        maleText: normalizeText(existing?.maleText),
        femaleText: normalizeText(existing?.femaleText),
      }
    })
    .filter(Boolean)
}

const syncTemplateDropdownAppreciations = (template: Template): Template => ({
  ...template,
  pages: Array.isArray(template.pages)
    ? template.pages.map(page => ({
      ...page,
      blocks: Array.isArray(page.blocks)
        ? page.blocks.map(block => {
          if (block?.type !== 'dropdown') return block
          return {
            ...block,
            props: {
              ...(block.props || {}),
              appreciations: buildAppreciations(block),
            },
          }
        })
        : [],
    }))
    : [],
})

export default function AdminAppreciations() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [usageStats, setUsageStats] = useState<Record<string, { 
    total: number, 
    male: { count: number, students: any[] }, 
    female: { count: number, students: any[] }, 
    neutral: { count: number, students: any[] } 
  }>>({})
  const [usageModal, setUsageModal] = useState<{ 
    title: string, 
    students: { name: string, className: string }[] 
  } | null>(null)

  // UI State
  const [selectedTemplate, setSelectedTemplate] = useState<string>('all')
  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [selectedSemester, setSelectedSemester] = useState<string>('all')

  // Collapse State
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())
  const [collapsedDropdowns, setCollapsedDropdowns] = useState<Set<string>>(new Set())

  // Batch Import State
  const [importTarget, setImportTarget] = useState<{
    templateId: string,
    pageIndex: number,
    blockIndex: number,
    label: string
  } | null>(null)
  const [importGender, setImportGender] = useState<'maleText' | 'femaleText'>('maleText')
  const [importData, setImportData] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [tplRes, usageRes] = await Promise.all([
          api.get('/templates'),
          api.get('/admin-extras/appreciations/usage').catch(() => ({ data: {} }))
        ])
        const nextTemplates = (Array.isArray(tplRes.data) ? tplRes.data : []).map(syncTemplateDropdownAppreciations)
        setTemplates(nextTemplates)
        setUsageStats(usageRes.data || {})
      } catch (err: any) {
        setError('Échec du chargement des données')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const dropdownTemplates = useMemo(() => {
    const query = search.trim().toLowerCase()

    return templates
      .filter(t => selectedTemplate === 'all' || t._id === selectedTemplate)
      .map(template => {
        const dropdowns = (Array.isArray(template.pages) ? template.pages : []).flatMap((page, pageIndex) =>
          (Array.isArray(page.blocks) ? page.blocks : []).flatMap((block, blockIndex) => {
            if (block?.type !== 'dropdown') return []
            const label = normalizeText(block?.props?.label) || `Dropdown ${block?.props?.dropdownNumber ?? ''}`.trim()
            const options = Array.isArray(block?.props?.options) ? block.props.options : []
            const levels = Array.isArray(block?.props?.levels) ? block.props.levels : []
            const semesters = Array.isArray(block?.props?.semesters) && block.props.semesters.length > 0 ? block.props.semesters : [1, 2]
            const rowText = [
              template.name,
              page.title,
              label,
              ...options,
              ...levels,
              ...semesters.map((semester: number) => `semestre ${semester}`),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            if (query && !rowText.includes(query)) return []

            // Level Filter
            if (selectedLevel !== 'all' && levels.length > 0 && !levels.includes(selectedLevel)) return []
            // Semester Filter
            if (selectedSemester !== 'all' && !semesters.includes(Number(selectedSemester))) return []

            return [{
              id: `${template._id}-${pageIndex}-${blockIndex}`,
              pageIndex,
              blockIndex,
              pageTitle: page.title || `Page ${pageIndex + 1}`,
              label,
              dropdownNumber: block?.props?.dropdownNumber,
              levels,
              semesters,
              appreciations: Array.isArray(block?.props?.appreciations) ? block.props.appreciations : [],
            }]
          })
        )

        return { ...template, dropdowns }
      })
      .filter(template => template.dropdowns.length > 0)
  }, [search, templates, selectedTemplate, selectedLevel, selectedSemester])

  // Extract unique levels for filter
  const allLevels = useMemo(() => {
    const levels = new Set<string>()
    templates.forEach(t => {
      (t.pages || []).forEach(p => {
        (p.blocks || []).forEach(b => {
          if (b.type === 'dropdown' && Array.isArray(b.props?.levels)) {
            b.props.levels.forEach((l: string) => levels.add(l))
          }
        })
      })
    })
    return Array.from(levels).sort()
  }, [templates])

  const updateAppreciation = (
    templateId: string,
    pageIndex: number,
    blockIndex: number,
    option: string,
    field: 'maleText' | 'femaleText',
    value: string
  ) => {
    setTemplates(prev =>
      prev.map(template => {
        if (template._id !== templateId) return template
        return {
          ...template,
          pages: Array.isArray(template.pages)
            ? template.pages.map((page, currentPageIndex) => {
              if (currentPageIndex !== pageIndex) return page
              return {
                ...page,
                blocks: Array.isArray(page.blocks)
                  ? page.blocks.map((block, currentBlockIndex) => {
                    if (currentBlockIndex !== blockIndex || block?.type !== 'dropdown') return block
                    const appreciations = buildAppreciations(block).map((entry: any) =>
                      entry.option === option ? { ...entry, [field]: value } : entry
                    )
                    return {
                      ...block,
                      props: {
                        ...(block.props || {}),
                        appreciations,
                      },
                    }
                  })
                  : [],
              }
            })
            : [],
        }
      })
    )
  }

  const saveTemplate = async (template: Template) => {
    if (!template._id) return

    setSaveStates(prev => ({
      ...prev,
      [template._id as string]: { busy: true, message: 'Enregistrement...', type: 'success' },
    }))

    try {
      const payload = syncTemplateDropdownAppreciations(template)
      const response = await api.patch(`/templates/${template._id}`, { pages: payload.pages })
      setTemplates(prev =>
        prev.map(current =>
          current._id === template._id ? syncTemplateDropdownAppreciations(response.data) : current
        )
      )
      setSaveStates(prev => ({
        ...prev,
        [template._id as string]: { busy: false, message: 'Appréciations enregistrées.', type: 'success' },
      }))

      // Auto clear message after 3s
      setTimeout(() => {
        setSaveStates(prev => ({
          ...prev,
          [template._id as string]: { ...prev[template._id as string], message: undefined }
        }))
      }, 3000)
    } catch (e) {
      console.error(e)
      setSaveStates(prev => ({
        ...prev,
        [template._id as string]: { busy: false, message: 'Échec de l’enregistrement.', type: 'error' },
      }))
    }
  }

  const toggleTemplateCollapse = (templateId: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev)
      if (next.has(templateId)) next.delete(templateId)
      else next.add(templateId)
      return next
    })
  }

  const toggleDropdownCollapse = (dropdownId: string) => {
    setCollapsedDropdowns(prev => {
      const next = new Set(prev)
      if (next.has(dropdownId)) next.delete(dropdownId)
      else next.add(dropdownId)
      return next
    })
  }

  const handleBatchImport = () => {
    if (!importTarget) return

    const lines = importData.split('\n')
    const updates: Record<number, string> = {}
    let currentNum = -1
    lines.forEach(line => {
      // Support "1: text", "1. text", "1 text"
      const match = line.match(/^(\d+)[:.\s]+(.*)$/)
      if (match) {
        currentNum = parseInt(match[1], 10)
        const text = match[2].trim()
        if (text) {
          updates[currentNum] = text
        }
      } else if (currentNum !== -1 && line.trim()) {
        // Append to current number if line doesn't start with a number (multi-line support)
        updates[currentNum] = (updates[currentNum] || '') + " " + line.trim()
      }
    })

    if (Object.keys(updates).length === 0) {
      alert("Aucune phrase numérotée valide n'a été trouvée. Format attendu: '1: Ma phrase'")
      return
    }

    setTemplates(prev =>
      prev.map(template => {
        if (template._id !== importTarget.templateId) return template
        return {
          ...template,
          pages: template.pages?.map((page, pIdx) => {
            if (pIdx !== importTarget.pageIndex) return page
            return {
              ...page,
              blocks: page.blocks?.map((block, bIdx) => {
                if (bIdx !== importTarget.blockIndex || block.type !== 'dropdown') return block

                const baseAppreciations = buildAppreciations(block)
                const newAppreciations = baseAppreciations.map((entry: any, idx: number) => {
                  const num = idx + 1
                  if (updates[num] !== undefined) {
                    return { ...entry, [importGender]: updates[num] }
                  }
                  return entry
                })

                return {
                  ...block,
                  props: {
                    ...block.props,
                    appreciations: newAppreciations
                  }
                }
              })
            }
          })
        }
      })
    )

    setImportTarget(null)
    setImportData('')
  }

  const expandAll = () => {
    setExpandedTemplates(new Set(dropdownTemplates.map(t => t._id || '')))
    setCollapsedDropdowns(new Set())
  }

  const collapseAll = () => {
    setExpandedTemplates(new Set())
    setCollapsedDropdowns(new Set(dropdownTemplates.flatMap(t => t.dropdowns.map((d: any) => d.id))))
  }

  return (
    <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        .appreciation-row { transition: all 0.2s ease; }
        .appreciation-row:hover { background-color: #f8fafc !important; transform: translateX(4px); box-shadow: inset 2px 0 0 0 #e2e8f0; }
        .appreciation-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .appreciation-card:hover { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -6px rgba(0,0,0,0.04) !important; }
        .custom-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 14px; background: #fff; transition: all 0.2s ease; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
        .custom-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
        .filter-label { display: block; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .btn-modern { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; padding: 8px 16px; border-radius: 8px; transition: all 0.2s; cursor: pointer; border: none; }
        .btn-modern:hover { transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
      `}</style>
      <div className="card" style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', padding: '32px' }}>

        {/* Header Section */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px', color: '#2563eb' }}>
            <Filter size={28} />
          </div>
          <div>
            <h2 className="title" style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
              Gestion des Appréciations
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', margin: 0, fontWeight: 400 }}>
              Configurez les versions masculines et féminines pour chaque liste déroulante de vos templates.
            </p>
          </div>
        </div>

        {/* Filters Section */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          padding: '24px',
          background: '#f8fafc',
          borderRadius: '16px',
          border: '1px solid #f1f5f9',
          marginBottom: 32,
          boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ flex: '1 1 250px' }}>
            <label className="filter-label">
              Rechercher
            </label>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} size={18} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Mot-clé dans les appréciations..."
                className="custom-input"
                style={{ paddingLeft: 40 }}
              />
            </div>
          </div>

          <div style={{ flex: '1 1 200px' }}>
            <label className="filter-label">
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              className="custom-input"
            >
              <option value="" disabled>Sélectionnez un template</option>
              {templates.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 150px' }}>
            <label className="filter-label">
              Niveau
            </label>
            <select
              value={selectedLevel}
              onChange={e => setSelectedLevel(e.target.value)}
              className="custom-input"
            >
              <option value="all">Tous les niveaux</option>
              {allLevels.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 150px' }}>
            <label className="filter-label">
              Semestre
            </label>
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="custom-input"
            >
              <option value="all">Tous les semestres</option>
              <option value="1">Semestre 1</option>
              <option value="2">Semestre 2</option>
            </select>
          </div>
        </div>

        {/* Global Actions */}
        {!loading && !error && dropdownTemplates.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <button
              onClick={expandAll}
              className="btn-modern"
              style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}
            >
              <ChevronsDown size={14} /> Tout développer
            </button>
            <button
              onClick={collapseAll}
              className="btn-modern"
              style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}
            >
              <ChevronsUp size={14} /> Tout réduire
            </button>
          </div>
        )}

        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Chargement des templates...</div>}
        {error && <div style={{ padding: 20, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={18} /> {error}</div>}

        {!loading && !error && dropdownTemplates.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', background: '#f8fafc', borderRadius: 8 }}>
            <Filter size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            Aucun dropdown ne correspond à vos critères de recherche.
          </div>
        )}

        {/* Templates List */}
        <div style={{ display: 'grid', gap: 32 }}>
          {dropdownTemplates.map(template => {
            const saveState = template._id ? saveStates[template._id] : undefined
            const isTemplateExpanded = expandedTemplates.has(template._id || '')

            return (
              <section key={template._id || template.name} className="appreciation-card smooth-shadow" style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
                {/* Template Header */}
                <div
                  style={{
                    padding: isTemplateExpanded ? '16px 20px' : '24px 32px',
                    background: isTemplateExpanded ? '#f8fafc' : '#fff',
                    borderBottom: isTemplateExpanded ? '1px solid #e2e8f0' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isTemplateExpanded ? 'none' : '0 2px 4px -1px rgba(0,0,0,0.06)'
                  }}
                  onClick={() => toggleTemplateCollapse(template._id || '')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {isTemplateExpanded ? <ChevronDown size={24} color="#64748b" /> : <ChevronRight size={24} color="#64748b" />}
                    <div>
                      <h3 style={{ margin: 0, fontSize: isTemplateExpanded ? 20 : 28, fontWeight: 800, color: '#0f172a', transition: 'font-size 0.2s', letterSpacing: '-0.02em' }}>{template.name}</h3>
                      <div style={{ marginTop: 8, fontSize: 15, color: '#64748b', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 500 }}>
                        <span>{template.dropdowns.length} liste{template.dropdowns.length > 1 ? 's' : ''} déroulante{template.dropdowns.length > 1 ? 's' : ''}</span>
                        {template.status && (
                          <span style={{ padding: '2px 10px', background: '#e2e8f0', borderRadius: 999, fontSize: 13, fontWeight: 700, color: '#475569' }}>
                            {template.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => {
                    if (!isTemplateExpanded) {
                      e.stopPropagation();
                    }
                  }}>
                    {saveState?.message && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: saveState.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saveState.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                        {saveState.message}
                      </span>
                    )}
                    {isTemplateExpanded && (
                      <button
                        className="btn-modern"
                        disabled={saveState?.busy}
                        onClick={(e) => { e.stopPropagation(); saveTemplate(template); }}
                        style={{
                          background: saveState?.busy ? '#94a3b8' : '#2563eb',
                          color: '#fff',
                          cursor: saveState?.busy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Save size={16} />
                        {saveState?.busy ? 'En cours...' : 'Enregistrer'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdowns List */}
                {isTemplateExpanded && (
                  <div style={{ padding: 20, display: 'grid', gap: 16 }}>
                    {template.dropdowns.map((dropdown: any) => {
                      const isDropdownCollapsed = collapsedDropdowns.has(dropdown.id)

                      return (
                        <div key={dropdown.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>

                          {/* Dropdown Header */}
                          <div
                            style={{
                              padding: '14px 16px',
                              background: '#f8fafc',
                              borderBottom: isDropdownCollapsed ? 'none' : '1px solid #e2e8f0',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer'
                            }}
                            onClick={() => toggleDropdownCollapse(dropdown.id)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {isDropdownCollapsed ? <ChevronRight size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                              <div>
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                                  {dropdown.label}
                                  {dropdown.dropdownNumber != null ? <span style={{ color: '#94a3b8', marginLeft: 6 }}>#{dropdown.dropdownNumber}</span> : ''}
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{dropdown.pageTitle}</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                                  Niveaux: {dropdown.levels.length > 0 ? dropdown.levels.join(', ') : 'Tous'}
                                </span>
                                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#f3e8ff', color: '#7e22ce', fontWeight: 500 }}>
                                  Semestres: {dropdown.semesters.map((semester: number) => `S${semester}`).join(', ')}
                                </span>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setImportTarget({
                                    templateId: template._id!,
                                    pageIndex: dropdown.pageIndex,
                                    blockIndex: dropdown.blockIndex,
                                    label: dropdown.label
                                  })
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#2563eb',
                                  background: '#eff6ff',
                                  border: '1px solid #dbeafe',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  cursor: 'pointer'
                                }}
                              >
                                <Upload size={14} /> Import Groupé
                              </button>
                            </div>
                          </div>

                          {/* Dropdown Content */}
                          {!isDropdownCollapsed && (
                            <div style={{ padding: 16, background: '#fff' }}>
                              {dropdown.appreciations.length === 0 && (
                                <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Aucune option configurée pour cette liste.</div>
                              )}

                            <div style={{ display: 'grid', gridTemplateColumns: '40px 60px minmax(0, 1fr) minmax(0, 1fr) 220px', gap: 16, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <div style={{ textAlign: 'center' }}>#</div>
                              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span>Usage</span>
                                <span style={{ fontSize: 9, opacity: 0.6 }}>Total (♂/♀/?)</span>
                              </div>
                              <div>Version Masculine ♂</div>
                              <div>Version Féminine ♀</div>
                              <div>Comparaison</div>
                            </div>

                            <div style={{ display: 'grid', gap: 0 }}>
                              {dropdown.appreciations.map((entry: any, i: number) => (
                                <div 
                                  key={entry.option} 
                                  className="appreciation-row"
                                  style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    padding: '16px 16px', 
                                    borderBottom: i < dropdown.appreciations.length - 1 ? '1px solid #f1f5f9' : 'none', 
                                    transition: 'background-color 0.2s',
                                  }}
                                >
                                  {/* Option Title Row */}
                                  <div style={{ 
                                      fontSize: 11, 
                                      fontWeight: 800, 
                                      color: '#64748b', 
                                      textTransform: 'uppercase', 
                                      marginBottom: 12, 
                                      paddingLeft: 132 // 40 + 16 + 60 + 16 (col1 + gap + col2 + gap)
                                  }}>
                                    OPTION: {entry.option}
                                  </div>

                                  {/* Grid Row */}
                                  <div style={{
                                    display: 'grid', 
                                    gridTemplateColumns: '40px 60px minmax(0, 1fr) minmax(0, 1fr) 220px', 
                                    gap: 16, 
                                    alignItems: 'start'
                                  }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textAlign: 'center', marginTop: 12 }}>{i + 1}.</div>
                                    
                                    {/* Usage Column */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                      {(() => {
                                        const u1 = usageStats[entry.option] || { total: 0, male: { count: 0, students: [] }, female: { count: 0, students: [] }, neutral: { count: 0, students: [] } }
                                        const u2 = usageStats[entry.maleText || ''] || { total: 0, male: { count: 0, students: [] }, female: { count: 0, students: [] }, neutral: { count: 0, students: [] } }
                                        const u3 = usageStats[entry.femaleText || ''] || { total: 0, male: { count: 0, students: [] }, female: { count: 0, students: [] }, neutral: { count: 0, students: [] } }
                                        
                                        const total = u1.total + u2.total + u3.total
                                        const maleStudents = [...u1.male.students, ...u2.male.students, ...u3.male.students]
                                        const femaleStudents = [...u1.female.students, ...u2.female.students, ...u3.female.students]
                                        const neutralStudents = [...u1.neutral.students, ...u2.neutral.students, ...u3.neutral.students]

                                        if (total === 0) return <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>0</span>

                                        return (
                                          <>
                                            <span style={{ 
                                              fontSize: 14, 
                                              fontWeight: 800, 
                                              color: '#2563eb',
                                              background: '#eff6ff',
                                              padding: '4px 10px',
                                              borderRadius: 8,
                                              border: '1px solid #dbeafe',
                                              marginBottom: 4,
                                              minWidth: 32,
                                              textAlign: 'center'
                                            }}>
                                              {total}
                                            </span>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                                              {maleStudents.length > 0 && (
                                                <span 
                                                  title="Cliquez pour voir les noms" 
                                                  onClick={() => setUsageModal({ title: `Garçons utilisant cette appréciation`, students: maleStudents })}
                                                  style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                                                >
                                                  ♂ {maleStudents.length}
                                                </span>
                                              )}
                                              {femaleStudents.length > 0 && (
                                                <span 
                                                  title="Cliquez pour voir les noms" 
                                                  onClick={() => setUsageModal({ title: `Filles utilisant cette appréciation`, students: femaleStudents })}
                                                  style={{ fontSize: 10, fontWeight: 700, color: '#ec4899', background: '#fdf2f8', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                                                >
                                                  ♀ {femaleStudents.length}
                                                </span>
                                              )}
                                              {neutralStudents.length > 0 && (
                                                <span 
                                                  title="Cliquez pour voir les noms" 
                                                  onClick={() => setUsageModal({ title: `Élèves (non défini) utilisant cette appréciation`, students: neutralStudents })}
                                                  style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f8fafc', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                                                >
                                                  ? {neutralStudents.length}
                                                </span>
                                              )}
                                            </div>
                                          </>
                                        )
                                      })()}
                                    </div>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <textarea
                                        rows={2}
                                        value={entry.maleText || ''}
                                        onChange={e => updateAppreciation(template._id || '', dropdown.pageIndex, dropdown.blockIndex, entry.option, 'maleText', e.target.value)}
                                        placeholder="Ex: Il a bien travaillé..."
                                        style={{
                                          resize: 'vertical',
                                          padding: '10px 12px',
                                          borderRadius: 8,
                                          border: '1px solid #cbd5e1',
                                          fontFamily: 'inherit',
                                          fontSize: 14,
                                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                          transition: 'border-color 0.2s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                        onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                      />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <textarea
                                        rows={2}
                                        value={entry.femaleText || ''}
                                        onChange={e => updateAppreciation(template._id || '', dropdown.pageIndex, dropdown.blockIndex, entry.option, 'femaleText', e.target.value)}
                                        placeholder="Ex: Elle a bien travaillé..."
                                        style={{
                                          resize: 'vertical',
                                          padding: '10px 12px',
                                          borderRadius: 8,
                                          border: '1px solid #cbd5e1',
                                          fontFamily: 'inherit',
                                          fontSize: 14,
                                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                          transition: 'border-color 0.2s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#ec4899'}
                                        onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                      />
                                    </label>

                                    {/* Differences Column */}
                                    <div style={{
                                      background: '#fff',
                                      borderRadius: 8,
                                      border: '1px solid #e2e8f0',
                                      padding: '12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      height: 'fit-content',
                                      maxHeight: '150px',
                                      overflowY: 'auto'
                                    }}>
                                        <div style={{
                                          fontSize: 10,
                                          fontWeight: 800,
                                          color: '#94a3b8',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: 10,
                                          display: 'flex',
                                          justifyContent: 'space-between'
                                        }}>
                                          <span>Différences</span>
                                          <span style={{ color: '#cbd5e1' }}>♂ → ♀</span>
                                        </div>

                                        {(() => {
                                          const diffs = findTextDifferences(entry.maleText || '', entry.femaleText || '')
                                          if (diffs.length === 0) {
                                            return <div style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>Identiques</div>
                                          }
                                          return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                              {diffs.map((d, i) => (
                                                <div key={i} style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'space-between',
                                                  fontSize: 13,
                                                  background: '#f8fafc',
                                                  padding: '4px 8px',
                                                  borderRadius: 4,
                                                  border: '1px solid #f1f5f9'
                                                }}>
                                                  <span style={{ color: '#2563eb', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.m}</span>
                                                  <ChevronRight size={12} color="#cbd5e1" style={{ margin: '0 4px' }} />
                                                  <span style={{ color: '#db2777', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.f}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {/* Batch Import Modal */}
      {importTarget && (
        <div className="modal-overlay" onClick={() => setImportTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 600 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Import Groupé : {importTarget.label}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Mise à jour rapide des appréciations</p>
              </div>
              <button className="icon-btn" onClick={() => setImportTarget(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                  1. Choisir la version à importer
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setImportGender('maleText')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '2px solid',
                      borderColor: importGender === 'maleText' ? '#3b82f6' : '#e2e8f0',
                      background: importGender === 'maleText' ? '#eff6ff' : '#fff',
                      color: importGender === 'maleText' ? '#1d4ed8' : '#64748b',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: 18 }}>♂</span> Version Masculine
                  </button>
                  <button
                    onClick={() => setImportGender('femaleText')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '2px solid',
                      borderColor: importGender === 'femaleText' ? '#ec4899' : '#e2e8f0',
                      background: importGender === 'femaleText' ? '#fdf2f8' : '#fff',
                      color: importGender === 'femaleText' ? '#be185d' : '#64748b',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: 18 }}>♀</span> Version Féminine
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                  2. Coller les phrases numérotées
                </label>
                <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  Format: "Numéro. Phrase" (ex: "1. Excellent travail ce semestre")
                </p>
                <textarea
                  rows={10}
                  value={importData}
                  onChange={e => setImportData(e.target.value)}
                  placeholder="1. Première phrase...&#10;2. Deuxième phrase..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    fontFamily: 'monospace',
                    resize: 'none'
                  }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setImportTarget(null)}>Annuler</button>
              <button
                className="btn"
                onClick={handleBatchImport}
                disabled={!importData.trim()}
                style={{
                  background: importGender === 'maleText' ? '#2563eb' : '#db2777',
                  padding: '10px 20px'
                }}
              >
                Appliquer l'import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Details Modal */}
      {usageModal && (
        <div className="modal-overlay" onClick={() => setUsageModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">{usageModal.title}</h3>
              <button className="icon-btn" onClick={() => setUsageModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', padding: 0 }}>
              <div style={{ display: 'grid', gap: 0 }}>
                {usageModal.students.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Aucun élève trouvé.</div>
                ) : (
                  usageModal.students.map((s, idx) => (
                    <div key={idx} style={{ 
                      padding: '12px 20px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      borderBottom: idx < usageModal.students.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: idx % 2 === 0 ? '#fff' : '#f8fafc'
                    }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.name}</span>
                      <span style={{ fontSize: 12, background: '#e2e8f0', color: '#475569', padding: '4px 8px', borderRadius: 6, fontWeight: 700 }}>
                        {s.className}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button className="btn secondary" onClick={() => setUsageModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
