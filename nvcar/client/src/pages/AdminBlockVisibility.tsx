import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import Toast, { ToastType } from '../components/Toast'
import { Shield, FileText, Users, Eye, ChevronDown, Filter } from 'lucide-react'
import './AdminBlockVisibility.css'

type ViewKey = 'subadmin' | 'pdf' | 'teacher'
type StudentLevel = 'PS' | 'MS' | 'GS' | 'EB1'
type VisibilityOption = 'always' | 'after_sem1' | 'after_sem2' | 'never'
type BlockType = 'dynamic_text' | 'promotion_info' | 'signature_box' | 'final_signature_box' | 'signature_date' | 'signature'

// Settings structure: { [studentLevel]: { [viewKey]: { [blockKey]: 'always' | 'after_sem1' | 'after_sem2' } } }
type BlockVisibilitySettings = {
  [level in StudentLevel]?: {
    [view in ViewKey]?: Record<string, VisibilityOption>
  }
}

type TemplateBlockItem = {
  key: string
  type: string
  label: string
  field?: string
  templateId: string
  templateName: string
  pageIndex: number
  blockIndex: number
  level?: string | null
  period?: string | null
  semester?: string | number | null
}

type TemplateInfo = {
  _id: string
  name: string
}

const STUDENT_LEVELS: { key: StudentLevel; label: string }[] = [
  { key: 'PS', label: 'PS' },
  { key: 'MS', label: 'MS' },
  { key: 'GS', label: 'GS' },
  { key: 'EB1', label: 'EB1 / Archive' }
]

const BLOCK_TYPES: { key: BlockType; label: string; icon: string }[] = [
  { key: 'dynamic_text', label: 'Texte dynamique', icon: '🔤' },
  { key: 'promotion_info', label: 'Info promotion', icon: '🎓' },
  { key: 'signature_box', label: 'Signature', icon: '✍️' },
  { key: 'final_signature_box', label: 'Signature finale', icon: '✍️' },
  { key: 'signature_date', label: 'Date signature', icon: '📅' },
  { key: 'signature', label: 'Bloc signature', icon: '🖊️' }
]

const VISIBILITY_OPTIONS: { value: VisibilityOption; label: string; shortLabel: string }[] = [
  { value: 'always', label: 'Toujours visible', shortLabel: '👁️ Toujours' },
  { value: 'after_sem1', label: 'Après signature Sem 1', shortLabel: '1️⃣ Après Sem1' },
  { value: 'after_sem2', label: 'Après signature Sem 2', shortLabel: '2️⃣ Après Sem2' },
  { value: 'never', label: 'Jamais visible', shortLabel: '🚫 Jamais' }
]

const VIEW_LABELS: Record<ViewKey, { label: string; icon: React.ReactNode }> = {
  subadmin: { label: 'Sous-admin', icon: <Shield size={14} /> },
  pdf: { label: 'PDF', icon: <FileText size={14} /> },
  teacher: { label: 'Enseignant', icon: <Users size={14} /> }
}

export default function AdminBlockVisibility() {
  const [settings, setSettings] = useState<BlockVisibilitySettings>({})
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [selectedLevel, setSelectedLevel] = useState<StudentLevel>('PS')
  const [items, setItems] = useState<TemplateBlockItem[]>([])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [typeFilters, setTypeFilters] = useState<Set<BlockType>>(new Set(BLOCK_TYPES.map(t => t.key)))

  const buildBlockKey = (tplId: string, pageIdx: number, blockIdx: number, blockId?: string | null) => {
    if (blockId) return `block:${blockId}`
    return `tpl:${tplId}:p:${pageIdx}:b:${blockIdx}`
  }

  const normalizeSemester = (b: any) => {
    const raw = b?.props?.semester ?? b?.props?.semestre ?? null
    if (raw === null || raw === undefined || raw === '') return null
    return raw
  }

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings/public')
      setSettings(res.data.block_visibility_settings || {})
    } catch (e) {
      console.error(e)
      setToast({ message: 'Erreur lors du chargement des configurations', type: 'error' })
    }
  }

  const loadTemplates = async () => {
    try {
      const res = await api.get('/templates')
      const list = Array.isArray(res.data) ? res.data : []
      const tplInfos: TemplateInfo[] = list.map((t: any) => ({ _id: String(t._id), name: String(t.name || 'Template') }))
      setTemplates(tplInfos)
      if (tplInfos.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tplInfos[0]._id)
      }
    } catch (e) {
      console.error(e)
      setToast({ message: 'Erreur lors du chargement des templates', type: 'error' })
    }
  }

  const loadTemplateBlocks = async (templateId: string) => {
    if (!templateId) {
      setItems([])
      return
    }
    try {
      const res = await api.get(`/templates/${templateId}`)
      const tpl = res.data
      const collected: TemplateBlockItem[] = []

      const pages = Array.isArray(tpl?.pages) ? tpl.pages : []
      pages.forEach((page: any, pageIdx: number) => {
        const blocks = Array.isArray(page?.blocks) ? page.blocks : []
        blocks.forEach((b: any, blockIdx: number) => {
          if (!b || !b.type) return
          // Include dynamic_text, promotion_info, and signature blocks
          if (!['dynamic_text', 'promotion_info', 'signature_box', 'final_signature_box', 'signature_date', 'signature'].includes(b.type)) return
          const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
          const key = buildBlockKey(String(tpl?._id || ''), pageIdx, blockIdx, blockId)
          const label = String(b?.props?.label || b?.props?.text || b?.props?.field || b?.type || 'Bloc')
          collected.push({
            key,
            type: b.type,
            label,
            field: b?.props?.field || undefined,
            templateId: String(tpl?._id || ''),
            templateName: String(tpl?.name || 'Template'),
            pageIndex: pageIdx,
            blockIndex: blockIdx,
            level: b?.props?.level || null,
            period: b?.props?.period || null,
            semester: normalizeSemester(b)
          })
        })
      })

      setItems(collected)
    } catch (e) {
      console.error(e)
      setToast({ message: 'Erreur lors du chargement du template', type: 'error' })
    }
  }

  // Filter items by selected type filters AND by block's assigned level matching the selected student level
  // Blocks can only be filled during their assigned level, so we only show them under that level's section
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Must match type filter
      if (!typeFilters.has(item.type as BlockType)) return false

      // Block must have a level that matches the selected student level
      // Blocks without a level ('_none') are shown under all levels
      const blockLevel = item.level?.toUpperCase() || '_none'
      if (blockLevel === '_none') return true
      return blockLevel === selectedLevel
    })
  }, [items, typeFilters, selectedLevel])

  // Group items by block type, then by level
  const grouped = useMemo(() => {
    const typeGroups: { type: BlockType; typeLabel: string; typeIcon: string; levelGroups: { level: string; levelLabel: string; items: TemplateBlockItem[] }[] }[] = []

    BLOCK_TYPES.forEach(blockType => {
      if (!typeFilters.has(blockType.key)) return

      const typeItems = filteredItems.filter(item => item.type === blockType.key)
      if (typeItems.length === 0) return

      // Group by level within this type
      const levelMap = new Map<string, TemplateBlockItem[]>()
      typeItems.forEach(item => {
        const levelKey = item.level || '_none'
        if (!levelMap.has(levelKey)) levelMap.set(levelKey, [])
        levelMap.get(levelKey)!.push(item)
      })

      // Define level order
      const levelOrder: Record<string, number> = { 'PS': 0, 'MS': 1, 'GS': 2, 'EB1': 3, '_none': 4 }

      const levelGroups = Array.from(levelMap.entries())
        .sort((a, b) => (levelOrder[a[0]] ?? 5) - (levelOrder[b[0]] ?? 5))
        .map(([level, items]) => ({
          level,
          levelLabel: level === '_none' ? 'Sans niveau' : level,
          items: items.sort((a, b) => a.pageIndex - b.pageIndex || a.blockIndex - b.blockIndex)
        }))

      typeGroups.push({
        type: blockType.key,
        typeLabel: blockType.label,
        typeIcon: blockType.icon,
        levelGroups
      })
    })

    return typeGroups
  }, [filteredItems, typeFilters])

  const toggleTypeFilter = (type: BlockType) => {
    setTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const selectAllTypes = () => setTypeFilters(new Set(BLOCK_TYPES.map(t => t.key)))
  const selectNoTypes = () => setTypeFilters(new Set())

  useEffect(() => {
    loadSettings()
    loadTemplates()
  }, [])

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplateBlocks(selectedTemplateId)
    }
  }, [selectedTemplateId])

  const saveSettings = async (next: BlockVisibilitySettings) => {
    setSettings(next)
    try {
      await api.post('/settings', { key: 'block_visibility_settings', value: next })
      setToast({ message: 'Configuration sauvegardee', type: 'success' })
    } catch (e) {
      console.error(e)
      setToast({ message: 'Erreur lors de la sauvegarde', type: 'error' })
    }
  }

  // Get default visibility based on block's type and period prop
  const getDefaultVisibility = (item: TemplateBlockItem): VisibilityOption => {
    // Signature blocks - show based on period
    if (item.type === 'signature_box' || item.type === 'signature_date') {
      if (item.period === 'mid-year') return 'always' // Sem 1 signature box always visible
      if (item.period === 'end-year') return 'after_sem1' // Sem 2 signature box after sem1 signed
      return 'always'
    }
    if (item.type === 'final_signature_box') {
      return 'after_sem1' // Final signature box after sem1 signed
    }
    if (item.type === 'signature') {
      return 'always'
    }
    // For promotion_info blocks with period set
    if (item.type === 'promotion_info') {
      if (item.period === 'mid-year') return 'after_sem1'
      if (item.period === 'end-year') return 'after_sem2'
      // Fields that show future info (level, year) should require signature
      if (item.field === 'level' || item.field === 'year') return 'after_sem1'
    }
    // Everything else is always visible by default
    return 'always'
  }

  const getVisibility = (level: StudentLevel, view: ViewKey, blockKey: string, item: TemplateBlockItem): VisibilityOption => {
    return settings?.[level]?.[view]?.[blockKey] ?? getDefaultVisibility(item)
  }

  const setVisibility = (level: StudentLevel, view: ViewKey, blockKey: string, value: VisibilityOption) => {
    const next: BlockVisibilitySettings = JSON.parse(JSON.stringify(settings))
    if (!next[level]) next[level] = {}
    if (!next[level]![view]) next[level]![view] = {}
    next[level]![view]![blockKey] = value
    saveSettings(next)
  }

  const setAllForView = (level: StudentLevel, view: ViewKey, value: VisibilityOption) => {
    const next: BlockVisibilitySettings = JSON.parse(JSON.stringify(settings))
    if (!next[level]) next[level] = {}
    if (!next[level]![view]) next[level]![view] = {}
    filteredItems.forEach(item => {
      next[level]![view]![item.key] = value
    })
    saveSettings(next)
  }

  const copyFromLevel = (fromLevel: StudentLevel) => {
    if (fromLevel === selectedLevel) return
    const next: BlockVisibilitySettings = JSON.parse(JSON.stringify(settings))
    if (settings?.[fromLevel]) {
      next[selectedLevel] = JSON.parse(JSON.stringify(settings[fromLevel]))
      saveSettings(next)
    }
  }

  const selectedTemplateName = templates.find(t => t._id === selectedTemplateId)?.name || ''

  return (
    <div className="admin-block-visibility">
      <header className="block-visibility-hero">
        <h1 className="block-visibility-hero-title">
          <Eye size={36} /> Visibilite des blocs
        </h1>
        <p className="block-visibility-hero-subtitle">
          Configurez quand les blocs sont visibles selon le niveau de l'eleve et l'etat des signatures.
        </p>
        <div className="block-visibility-info-box">
          <strong>Note de Sécurité (Level Guard) :</strong> Le système masque automatiquement tout bloc appartenant à un niveau supérieur à celui de l'élève (ex: un bloc "MS" ne sera jamais visible pour un élève de "PS"), quelle que soit la configuration ci-dessous.
        </div>
      </header>

      {/* Template Selector */}
      <div className="block-visibility-selectors">
        <div className="selector-group">
          <label htmlFor="template-select">Template :</label>
          <div className="template-select-wrapper">
            <select
              id="template-select"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {templates.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={18} className="select-icon" />
          </div>
        </div>
      </div>

      {/* Student Level Tabs */}
      <div className="student-level-tabs">
        {STUDENT_LEVELS.map(level => (
          <button
            key={level.key}
            className={`level-tab ${selectedLevel === level.key ? 'active' : ''}`}
            onClick={() => setSelectedLevel(level.key)}
          >
            {level.label}
          </button>
        ))}
      </div>

      {/* Type Filters */}
      <div className="type-filters">
        <div className="type-filters-header">
          <Filter size={16} />
          <span>Filtrer par type:</span>
          <button className="filter-action-btn" onClick={selectAllTypes}>Tous</button>
          <button className="filter-action-btn" onClick={selectNoTypes}>Aucun</button>
        </div>
        <div className="type-filter-chips">
          {BLOCK_TYPES.map(bt => (
            <button
              key={bt.key}
              className={`type-chip ${typeFilters.has(bt.key) ? 'active' : ''}`}
              onClick={() => toggleTypeFilter(bt.key)}
            >
              {bt.icon} {bt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy from another level */}
      <div className="copy-controls">
        <span className="copy-label">Copier depuis:</span>
        {STUDENT_LEVELS.filter(l => l.key !== selectedLevel).map(level => (
          <button key={level.key} className="copy-btn" onClick={() => copyFromLevel(level.key)}>
            {level.label}
          </button>
        ))}
      </div>

      {selectedTemplateId && (
        <div className="block-visibility-content">
          <div className="content-header">
            <h2 className="block-visibility-section-title">
              Blocs de "{selectedTemplateName}" - Niveau {selectedLevel}
            </h2>
            <span className="block-count">{filteredItems.length} bloc(s)</span>
          </div>

          {/* Bulk actions */}
          <div className="bulk-actions">
            {(['subadmin', 'pdf', 'teacher'] as ViewKey[]).map(v => (
              <div key={v} className="bulk-action-group">
                <span className="bulk-label">{VIEW_LABELS[v].icon} {VIEW_LABELS[v].label}:</span>
                {VISIBILITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`bulk-btn ${opt.value}`}
                    onClick={() => setAllForView(selectedLevel, v, opt.value)}
                    title={`Mettre tous sur "${opt.label}"`}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {grouped.length === 0 ? (
            <p className="block-visibility-empty">Aucun bloc configurable trouve (vérifiez les filtres).</p>
          ) : (
            <div className="block-visibility-groups">
              {grouped.map(typeGroup => (
                <div key={typeGroup.type} className="type-group">
                  <div className="type-group-header">
                    <span className="type-group-icon">{typeGroup.typeIcon}</span>
                    <span className="type-group-title">{typeGroup.typeLabel}</span>
                  </div>

                  {typeGroup.levelGroups.map(levelGroup => (
                    <div key={levelGroup.level} className="level-group">
                      <div className="level-group-header">
                        <span className="level-badge">{levelGroup.levelLabel}</span>
                      </div>

                      <table className="block-visibility-table">
                        <thead>
                          <tr>
                            <th>Bloc</th>
                            <th>Semestre</th>
                            <th>Page</th>
                            {(['subadmin', 'pdf', 'teacher'] as ViewKey[]).map(v => (
                              <th key={v} className="view-header">
                                {VIEW_LABELS[v].icon} {VIEW_LABELS[v].label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {levelGroup.items.map(item => (
                            <tr key={item.key}>
                              <td className="block-label-cell">
                                <span className="block-label">{item.label}</span>
                                {item.field && <span className="block-field">({item.field})</span>}
                              </td>
                              <td className="semester-cell">
                                {item.period === 'mid-year' ? (
                                  <span className="semester-badge sem1">Sem 1</span>
                                ) : item.period === 'end-year' ? (
                                  <span className="semester-badge sem2">Sem 2</span>
                                ) : item.semester ? (
                                  <span className="semester-badge">{item.semester}</span>
                                ) : (
                                  <span className="semester-none">—</span>
                                )}
                              </td>
                              <td className="page-cell">{item.pageIndex + 1}</td>
                              {(['subadmin', 'pdf', 'teacher'] as ViewKey[]).map(v => (
                                <td key={`${item.key}-${v}`} className="visibility-cell">
                                  <select
                                    className={`visibility-select ${getVisibility(selectedLevel, v, item.key, item)}`}
                                    value={getVisibility(selectedLevel, v, item.key, item)}
                                    onChange={(e) => setVisibility(selectedLevel, v, item.key, e.target.value as VisibilityOption)}
                                  >
                                    {VISIBILITY_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}