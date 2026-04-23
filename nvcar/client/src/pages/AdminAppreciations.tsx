import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { ChevronDown, ChevronRight, Search, Filter, Save, CheckCircle, AlertCircle, ChevronsUp, ChevronsDown } from 'lucide-react'

type Block = { type: string; props?: any }
type Page = { title?: string; blocks?: Block[] }
type Template = { _id?: string; name: string; pages?: Page[]; status?: string }

type SaveState = {
  busy?: boolean
  message?: string
  type?: 'success' | 'error'
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

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
  
  // UI State
  const [selectedTemplate, setSelectedTemplate] = useState<string>('all')
  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [selectedSemester, setSelectedSemester] = useState<string>('all')
  
  // Collapse State
  const [collapsedTemplates, setCollapsedTemplates] = useState<Set<string>>(new Set())
  const [collapsedDropdowns, setCollapsedDropdowns] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await api.get('/templates')
        const nextTemplates = (Array.isArray(response.data) ? response.data : []).map(syncTemplateDropdownAppreciations)
        setTemplates(nextTemplates)
      } catch (e) {
        console.error(e)
        setError('Impossible de charger les templates.')
      } finally {
        setLoading(false)
      }
    }

    loadTemplates()
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
    setCollapsedTemplates(prev => {
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
  
  const expandAll = () => {
    setCollapsedTemplates(new Set())
    setCollapsedDropdowns(new Set())
  }
  
  const collapseAll = () => {
    setCollapsedTemplates(new Set(dropdownTemplates.map(t => t._id || '')))
    setCollapsedDropdowns(new Set(dropdownTemplates.flatMap(t => t.dropdowns.map((d: any) => d.id))))
  }

  return (
    <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <div className="card" style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', padding: '24px' }}>
        
        {/* Header Section */}
        <div style={{ marginBottom: 24 }}>
          <h2 className="title" style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            Gestion des Appréciations
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
            Configurez les versions masculine et féminine pour chaque option de liste déroulante de vos templates.
          </p>
        </div>

        {/* Filters Section */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 16, 
          padding: '16px', 
          background: '#f8fafc', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0',
          marginBottom: 24
        }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Rechercher
            </label>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} size={16} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Mot-clé..."
                style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
              />
            </div>
          </div>
          
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, background: '#fff' }}
            >
              <option value="all">Tous les templates</option>
              {templates.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Niveau
            </label>
            <select
              value={selectedLevel}
              onChange={e => setSelectedLevel(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, background: '#fff' }}
            >
              <option value="all">Tous les niveaux</option>
              {allLevels.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Semestre
            </label>
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, background: '#fff' }}
            >
              <option value="all">Tous les semestres</option>
              <option value="1">Semestre 1</option>
              <option value="2">Semestre 2</option>
            </select>
          </div>
        </div>

        {/* Global Actions */}
        {!loading && !error && dropdownTemplates.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 16 }}>
            <button 
              onClick={expandAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              <ChevronsDown size={16} /> Tout développer
            </button>
            <button 
              onClick={collapseAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              <ChevronsUp size={16} /> Tout réduire
            </button>
          </div>
        )}

        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Chargement des templates...</div>}
        {error && <div style={{ padding: 20, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={18}/> {error}</div>}

        {!loading && !error && dropdownTemplates.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', background: '#f8fafc', borderRadius: 8 }}>
            <Filter size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            Aucun dropdown ne correspond à vos critères de recherche.
          </div>
        )}

        {/* Templates List */}
        <div style={{ display: 'grid', gap: 20 }}>
          {dropdownTemplates.map(template => {
            const saveState = template._id ? saveStates[template._id] : undefined
            const isTemplateCollapsed = collapsedTemplates.has(template._id || '')

            return (
              <section key={template._id || template.name} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                {/* Template Header */}
                <div 
                  style={{ 
                    padding: '16px 20px', 
                    background: isTemplateCollapsed ? '#f8fafc' : '#f1f5f9', 
                    borderBottom: isTemplateCollapsed ? 'none' : '1px solid #e2e8f0',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => toggleTemplateCollapse(template._id || '')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isTemplateCollapsed ? <ChevronRight size={20} color="#64748b"/> : <ChevronDown size={20} color="#64748b"/>}
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{template.name}</h3>
                      <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{template.dropdowns.length} dropdown{template.dropdowns.length > 1 ? 's' : ''}</span>
                        {template.status && (
                          <span style={{ padding: '2px 8px', background: '#e2e8f0', borderRadius: 999, fontSize: 11, fontWeight: 500, color: '#475569' }}>
                            {template.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
                    {saveState?.message && (
                      <span style={{ fontSize: 13, fontWeight: 500, color: saveState.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {saveState.type === 'success' ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
                        {saveState.message}
                      </span>
                    )}
                    <button
                      className="btn"
                      disabled={saveState?.busy}
                      onClick={() => saveTemplate(template)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6, 
                        background: saveState?.busy ? '#94a3b8' : '#2563eb', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '8px 16px', 
                        borderRadius: 8, 
                        fontSize: 14, 
                        fontWeight: 500, 
                        cursor: saveState?.busy ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s'
                      }}
                    >
                      <Save size={16} />
                      {saveState?.busy ? 'En cours...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>

                {/* Dropdowns List */}
                {!isTemplateCollapsed && (
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
                              {isDropdownCollapsed ? <ChevronRight size={18} color="#94a3b8"/> : <ChevronDown size={18} color="#94a3b8"/>}
                              <div>
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                                  {dropdown.label}
                                  {dropdown.dropdownNumber != null ? <span style={{ color: '#94a3b8', marginLeft: 6 }}>#{dropdown.dropdownNumber}</span> : ''}
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{dropdown.pageTitle}</div>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                                Niveaux: {dropdown.levels.length > 0 ? dropdown.levels.join(', ') : 'Tous'}
                              </span>
                              <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#f3e8ff', color: '#7e22ce', fontWeight: 500 }}>
                                Semestres: {dropdown.semesters.map((semester: number) => `S${semester}`).join(', ')}
                              </span>
                            </div>
                          </div>

                          {/* Dropdown Content */}
                          {!isDropdownCollapsed && (
                            <div style={{ padding: 16, background: '#fff' }}>
                              {dropdown.appreciations.length === 0 && (
                                <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Aucune option configurée pour cette liste.</div>
                              )}

                              <div style={{ display: 'grid', gap: 16 }}>
                                {dropdown.appreciations.map((entry: any) => (
                                  <div key={entry.option} style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                                    <div style={{ fontWeight: 600, marginBottom: 12, color: '#334155', fontSize: 14 }}>
                                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1', marginRight: 8, verticalAlign: 'middle' }}></span>
                                      {entry.option}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontSize: 13, fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ color: '#3b82f6' }}>♂</span> Version masculine
                                        </span>
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
                                        <span style={{ fontSize: 13, fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ color: '#ec4899' }}>♀</span> Version féminine
                                        </span>
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
    </div>
  )
}
