import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSocket } from '../context/SocketContext'
import { useSchoolYear } from '../context/SchoolYearContext'
import { GradebookPocket } from '../components/GradebookPocket'
import { TemplatePropagationModal } from '../components/TemplatePropagationModal'
import { TemplateHistoryModal } from '../components/TemplateHistoryModal'
import { TemplateStateHistoryModal } from '../components/TemplateStateHistoryModal'
import { openPdfExport, buildPreviewPdfUrl } from '../utils/pdfExport'
import { ImageCropOverlay } from '../components/ImageCropOverlay'
import { CroppedImage } from '../components/CroppedImage'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[]; updatedAt?: string; signingPage?: number }
type Year = { _id: string; name: string; active?: boolean }
type ClassDoc = { _id: string; name: string; schoolYearId: string; level?: string }
type StudentDoc = { _id: string; firstName: string; lastName: string; level?: string; nextLevel?: string; className?: string; dateOfBirth?: Date | string }
type TextRun = { text: string; bold?: boolean; underline?: boolean; color?: string }

const pageWidth = 800
const pageHeight = 1120
const EXPANDED_TABLE_DESIGNS_STORAGE_KEY = 'livret:expanded-table-designs:v1'

type ExpandedTableDesignStyle = {
  rowGap: number
  colGap: number
  borderRadius: number
  fontSize: number
  textColor: string
  borderColor: string
  borderWidth: number
  expandedRowHeight: number
  expandedToggleStyle: string
  expandedDividerWidth: number
  expandedDividerColor: string
  expandedTopGap: number
}

type ExpandedTableDesignPreset = {
  id: string
  name: string
  style: ExpandedTableDesignStyle
}

const DEFAULT_DIVIDER_COLOR = 'rgba(255, 255, 255, 0.2)'

const normalizeExpandedTableDesignStyle = (style: any): ExpandedTableDesignStyle => {
  const s = style && typeof style === 'object' ? style : {}
  return {
    rowGap: Number(s.rowGap || 0),
    colGap: Number(s.colGap || 0),
    borderRadius: Number(s.borderRadius || 0),
    fontSize: Number(s.fontSize || 12),
    textColor: String(s.textColor || '#000000'),
    borderColor: String(s.borderColor || '#000000'),
    borderWidth: Number(s.borderWidth ?? 1),
    expandedRowHeight: Number(s.expandedRowHeight || 34),
    expandedToggleStyle: String(s.expandedToggleStyle || 'v2'),
    expandedDividerWidth: Number(s.expandedDividerWidth || 0.5),
    expandedDividerColor: String(s.expandedDividerColor || DEFAULT_DIVIDER_COLOR),
    expandedTopGap: Number(s.expandedTopGap || 0)
  }
}

const inferTableBorderStyle = (props: any): { color: string; width: number; found: boolean } => {
  const cells = props?.cells
  if (!Array.isArray(cells)) return { color: '#000000', width: 1, found: false }
  for (const row of cells) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      const borders = cell?.borders
      if (!borders || typeof borders !== 'object') continue
      for (const side of ['l', 'r', 't', 'b'] as const) {
        const b = borders?.[side]
        if (b && typeof b === 'object' && ('width' in b || 'color' in b)) {
          // Found a border definition - return it even if width is 0
          return {
            color: String(b?.color || '#000000'),
            width: Number(b?.width ?? 0),
            found: true
          }
        }
      }
    }
  }
  return { color: '#000000', width: 1, found: false }
}

export default function TemplateBuilder() {
  const navigate = useNavigate()
  const location = useLocation()
  const { levels } = useLevels()
  const { activeYearId } = useSchoolYear()
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list')
  const [tpl, setTpl] = useState<Template>({ name: 'Nouveau Template', pages: [{ title: 'Page 1', blocks: [] }] })
  const [studentId, setStudentId] = useState('')
  const [classId, setClassId] = useState('')
  const [years, setYears] = useState<Year[]>([])
  const [classes, setClasses] = useState<ClassDoc[]>([])
  const [students, setStudents] = useState<StudentDoc[]>([])
  const [yearId, setYearId] = useState('')
  const [selectedPage, setSelectedPage] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [gallery, setGallery] = useState<{ name: string, path: string, type: string }[]>([])
  const [scale, setScale] = useState(1)
  const [autoFit, setAutoFit] = useState(true)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null)
  const [globalBorderColor, setGlobalBorderColor] = useState('#000000')
  const [globalBorderWidth, setGlobalBorderWidth] = useState(1)
  const [expandedTableDesignPresets, setExpandedTableDesignPresets] = useState<ExpandedTableDesignPreset[]>([])
  const [selectedExpandedTableDesignId, setSelectedExpandedTableDesignId] = useState<string>('')
  const [newExpandedTableDesignName, setNewExpandedTableDesignName] = useState('')
  const [list, setList] = useState<Template[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [continuousScroll, setContinuousScroll] = useState(true)
  const [previewData, setPreviewData] = useState<Record<string, string>>({})
  const [rightPanelView, setRightPanelView] = useState<'properties' | 'slides'>('properties')
  const [deleteConfirmations, setDeleteConfirmations] = useState<{ [id: string]: number }>({})
  const [activeGuides, setActiveGuides] = useState<{ type: 'x' | 'y', pos: number }[]>([])
  const [clipboard, setClipboard] = useState<Block[] | null>(null)
  const dragJustOccurred = useRef(false) // Track if a drag just happened to prevent click handler
  const [textSelection, setTextSelection] = useState<{ start: number; end: number } | null>(null)
  const lastCanvasPointerRef = useRef<{ pageIndex: number; x: number; y: number } | null>(null)
  const imagePasteHandledRef = useRef(false)
  const [cropModeBlockId, setCropModeBlockId] = useState<string | null>(null)

  // Auto-save state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastAutoSaveRef = useRef<string>('')
  const lastAutoSaveTemplateIdRef = useRef<string>('')
  const AUTO_SAVE_INTERVAL = 5 * 60 * 1000 // 5 minutes

  // Undo/Redo History State
  const [history, setHistory] = useState<Template[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedoAction = useRef(false)
  const lastSelectedBlockIdRef = useRef<string>('')

  const tplJson = useMemo(() => JSON.stringify(tpl), [tpl])
  const isDirty = viewMode === 'edit' && lastAutoSaveRef.current !== '' && tplJson !== lastAutoSaveRef.current

  useEffect(() => {
    if (viewMode !== 'edit') return

    const id = tpl?._id || ''
    if (id && lastAutoSaveTemplateIdRef.current !== id) {
      lastAutoSaveTemplateIdRef.current = id
      lastAutoSaveRef.current = tplJson
    }
  }, [viewMode, tpl?._id, tplJson])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const lastHrefRef = useRef<string>('')
  useEffect(() => {
    lastHrefRef.current = typeof window !== 'undefined' ? window.location.href : ''
  }, [location])

  useEffect(() => {
    if (!isDirty) return

    const shouldIgnoreAnchor = (a: HTMLAnchorElement, e: MouseEvent) => {
      if (e.defaultPrevented) return true
      if (e.button !== 0) return true
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true
      const target = (a.getAttribute('target') || '').toLowerCase()
      if (target && target !== '_self') return true
      if (a.hasAttribute('download')) return true
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return true
      return false
    }

    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as Element | null
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      if (shouldIgnoreAnchor(a, e)) return

      try {
        const href = a.getAttribute('href') || ''
        const dest = new URL(href, window.location.href)
        if (dest.origin !== window.location.origin) return

        const ok = window.confirm('Vous avez des modifications non enregistrées. Quitter sans sauvegarder ?')
        if (!ok) {
          e.preventDefault()
          e.stopPropagation()
        }
      } catch {
        return
      }
    }

    const onPopState = () => {
      const ok = window.confirm('Vous avez des modifications non enregistrées. Quitter sans sauvegarder ?')
      if (!ok) {
        try {
          window.history.pushState(null, '', lastHrefRef.current || window.location.href)
        } catch { }
      }
    }

    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [isDirty])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_TABLE_DESIGNS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((x: any) => x && typeof x === 'object')
          .map((x: any) => ({
            id: String(x.id || ''),
            name: String(x.name || ''),
            style: normalizeExpandedTableDesignStyle(x.style)
          }))
          .filter((x: ExpandedTableDesignPreset) => x.id && x.name && x.style)
        setExpandedTableDesignPresets(normalized)
        if (!selectedExpandedTableDesignId && normalized[0]?.id) setSelectedExpandedTableDesignId(normalized[0].id)
      }
    } catch { }
  }, [])

  useEffect(() => {
    if (selectedIndex == null) {
      lastSelectedBlockIdRef.current = ''
      return
    }
    const block = tpl.pages?.[selectedPage]?.blocks?.[selectedIndex]
    if (!block) return
    const rawId = block?.props?.blockId ? String(block.props.blockId) : `${selectedPage}:${selectedIndex}`
    if (rawId === lastSelectedBlockIdRef.current) return
    lastSelectedBlockIdRef.current = rawId
    if (block.type === 'table') {
      const inferred = inferTableBorderStyle(block.props)
      setGlobalBorderColor(inferred.color)
      setGlobalBorderWidth(inferred.width)
    }
  }, [selectedIndex, selectedPage, tpl])

  // Save state to history before making changes
  const saveHistory = () => {
    if (isUndoRedoAction.current) return

    // If we are in the middle of history, remove future states
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(JSON.parse(JSON.stringify(tpl)))

    // Limit history size to 50
    if (newHistory.length > 50) newHistory.shift()

    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const undo = () => {
    if (historyIndex >= 0) {
      isUndoRedoAction.current = true

      // If this is the first undo from the latest state, save current state first
      if (historyIndex === history.length - 1) {
        const currentHistory = [...history]
        // Check if current tpl is different from last history
        if (JSON.stringify(currentHistory[currentHistory.length - 1]) !== JSON.stringify(tpl)) {
          currentHistory.push(JSON.parse(JSON.stringify(tpl)))
          setHistory(currentHistory)
          setHistoryIndex(currentHistory.length - 2) // Go back one step from new latest
          setTpl(currentHistory[currentHistory.length - 2])
          isUndoRedoAction.current = false
          return
        }
      }

      const prevIndex = historyIndex - 1
      if (prevIndex >= -1) { // Allow going back to initial state if we pushed it? 
        // Actually simpler: History contains past states. 
        // If we are at index i, tpl is history[i]. 
        // Wait, standard way: history has all states. tpl is active state.
        // Let's adjust:
        // 1. push current tpl to history
        // 2. set tpl to prev

        // Better approach:
        // history = [state1, state2, state3]
        // historyIndex points to current state index in history

        // Implementation:
        // When change happens: 
        //   newHistory = history.slice(0, historyIndex + 1)
        //   newHistory.push(newState)
        //   index++

        // My saveHistory saves the *previous* state effectively if called before setTpl?
        // No, usually you save the *new* state.

        // Let's refine:
        // historyIndex points to the *currently displayed* state in history.
        // Initial: history = [initialTpl], index = 0
        // Change: history.push(newTpl), index++

        // So on mount, we should initialize history?

      }

      // Revised Undo Logic:
      // We need to move index back
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setTpl(history[newIndex])
        setHistoryIndex(newIndex)
      }
      isUndoRedoAction.current = false
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true
      const newIndex = historyIndex + 1
      setTpl(history[newIndex])
      setHistoryIndex(newIndex)
      isUndoRedoAction.current = false
    }
  }

  // Auto-fit Logic
  useEffect(() => {
    if (!autoFit || !canvasContainerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) {
          const availableW = w - 48 // 24px gap on each side
          const newScale = availableW / pageWidth
          // Cap minimal scale to avoid disappearance, and maybe max scale to avoid hugeness?
          // Let's just fit width.
          setScale(Math.max(0.1, newScale))
        }
      }
    })
    ro.observe(canvasContainerRef.current)
    return () => ro.disconnect()
  }, [autoFit])

  // Initialize history with initial tpl
  useEffect(() => {
    if (history.length === 0 && tpl) {
      setHistory([JSON.parse(JSON.stringify(tpl))])
      setHistoryIndex(0)
    }
  }, []) // Only on mount or if history empty

  // Wrapper for setTpl to auto-save history
  const updateTpl = (newTpl: Template, skipHistory = false) => {
    if (!skipHistory && !isUndoRedoAction.current) {
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(newTpl)))
      if (newHistory.length > 50) newHistory.shift()
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }
    setTpl(newTpl)
  }

  const [error, setError] = useState('')
  const pptxInputRef = useRef<HTMLInputElement>(null)
  const packageInputRef = useRef<HTMLInputElement>(null)

  const socket = useSocket()
  const isRemoteUpdate = useRef(false)
  const isLocalEditPending = useRef(false) // Track when we have pending local edits

  const normalizeTemplateNumbers = (t: Template): Template => {
    const pages = (t.pages || []).map(p => ({
      ...p,
      blocks: (p.blocks || []).map((raw: any) => {
        const b = raw ? { ...raw, props: raw.props ?? {} } : { type: 'unknown', props: {} }

        // Ensure every block has a unique blockId for stable React keys
        if (!b.props.blockId) {
          b.props.blockId = (window.crypto as any).randomUUID
            ? (window.crypto as any).randomUUID()
            : Math.random().toString(36).substring(2, 11)
        }

        if (b.type === 'table') {
          const parseNum = (v: any) => {
            const n = typeof v === 'number' ? v : parseFloat(String(v || '0'))
            return isNaN(n) ? 0 : n
          }
          const props = { ...b.props }
          props.rowGap = parseNum(props.rowGap)
          props.colGap = parseNum(props.colGap)
          props.expandedRowHeight = parseNum(props.expandedRowHeight)
          props.expandedDividerWidth = parseNum(props.expandedDividerWidth)
          props.columnWidths = (props.columnWidths || []).map((x: any) => parseNum(x))
          props.rowHeights = (props.rowHeights || []).map((x: any) => parseNum(x))
          return { ...b, props }
        }
        return b
      })
    }))
    return { ...t, pages }
  }

  const handlePackageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)

    try {
      setSaveStatus('Importation en cours...')
      await api.post('/templates/import-package', fd)
      setSaveStatus('Importé avec succès')
      await loadTemplates()
    } catch (err) {
      console.error(err)
      setError('Échec de l\'importation')
      setSaveStatus('')
    }

    if (packageInputRef.current) packageInputRef.current.value = ''
  }

  const downloadPackage = async (id: string) => {
    try {
      setSaveStatus('Exportation en cours...')
      // Server now saves to disk instead of returning blob
      const response = await api.get(`/templates/${id}/export-package`)
      console.log('Export response:', response)

      if (response.data && response.data.success) {
        let successMsg = `Export réussi : ${response.data.fileName} (dans ${response.data.path})`
        if (response.data.existed) {
          successMsg = `Export mis à jour (écrasé) : ${response.data.fileName}`
        }
        setSaveStatus(successMsg)
        // Refresh exported list so users can immediately see/download
        try { await loadExported() } catch (e) { /* ignore */ }
      } else {
        console.error('Export failed response:', response)
        throw new Error(response.data?.message || 'Export failed')
      }

      setTimeout(() => setSaveStatus(''), 8000)
    } catch (e: any) {
      console.error('Export exception:', e)
      const msg = e.response?.data?.message || e.message || 'Erreur lors de l\'export'
      setError(msg)
      setSaveStatus('')
    }
  }

  useEffect(() => {
    if (viewMode === 'edit' && tpl._id && socket) {
      socket.emit('join-template', tpl._id)

      const handleUpdate = (newTpl: any) => {
        // Don't overwrite local edits that haven't been synced yet
        if (isLocalEditPending.current) {
          return
        }
        isRemoteUpdate.current = true
        setTpl(normalizeTemplateNumbers(newTpl))
      }

      socket.on('template-updated', handleUpdate)

      return () => {
        socket.emit('leave-template', tpl._id)
        socket.off('template-updated', handleUpdate)
      }
    }
  }, [viewMode, tpl._id, socket])

  useEffect(() => {
    if (viewMode === 'edit' && tpl._id && socket) {
      if (isRemoteUpdate.current) {
        isRemoteUpdate.current = false
        return
      }

      // Mark that we have a local edit pending
      isLocalEditPending.current = true

      const timer = setTimeout(() => {
        socket.emit('update-template', { templateId: tpl._id, template: tpl })
        // After emitting, allow remote updates again
        isLocalEditPending.current = false
      }, 500)

      return () => {
        clearTimeout(timer)
        // If timer was cancelled, we still might have pending edits - keep the flag
      }
    }
  }, [tpl, viewMode, socket])

  // Auto-save effect
  useEffect(() => {
    if (viewMode !== 'edit' || !tpl._id || !autoSaveEnabled) {
      // Clear any existing interval
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
      return
    }

    // Set up auto-save interval
    autoSaveIntervalRef.current = setInterval(async () => {
      const currentTplJson = JSON.stringify(tpl)
      // Only auto-save if there have been changes since last save
      if (currentTplJson === lastAutoSaveRef.current) {
        return
      }

      try {
        // Check if there are existing assignments
        const checkRes = await api.get(`/template-propagation/${tpl._id}/assignments`)
        if (checkRes.data.totalCount > 0) {
          // Has assignments - use propagation endpoint with 'all' and auto-save description
          await api.patch(`/template-propagation/${tpl._id}`, {
            templateData: tpl,
            propagateToAssignmentIds: 'all',
            changeDescription: `Auto-save ${new Date().toLocaleString('fr-FR')}`,
            saveType: 'auto'
          })
        } else {
          // No assignments - simple save
          await api.patch(`/templates/${tpl._id}`, { ...tpl, saveType: 'auto' })
        }
        lastAutoSaveRef.current = currentTplJson
        setSaveStatus('✓ Auto-saved')
        setTimeout(() => setSaveStatus(''), 2000)
      } catch (e) {
        console.error('[AutoSave] Error:', e)
        // Don't show error for auto-save failures - it's silent
      }
    }, AUTO_SAVE_INTERVAL)

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }
  }, [viewMode, tpl._id, autoSaveEnabled, tpl])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'edit') return
      const target = e.target as HTMLElement | null
      const isEditableTarget =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      // Undo: Ctrl+Z
      if (!isEditableTarget && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (!isEditableTarget && (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        redo()
      }
      // Copy: Ctrl+C
      if (!isEditableTarget && (e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        copySelection()
      }
      // Paste: Ctrl+V
      if (!isEditableTarget && (e.ctrlKey || e.metaKey) && e.key === 'v') {
        imagePasteHandledRef.current = false
        setTimeout(() => {
          if (!imagePasteHandledRef.current) pasteFromClipboard()
        }, 0)
      }
      // Delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).isContentEditable) {
        if (selectedIndex !== null || selectedIndices.length > 0) {
          e.preventDefault()
          const pages = [...tpl.pages]
          const page = { ...pages[selectedPage] }
          const indicesToDelete = new Set(selectedIndices)
          if (selectedIndex !== null) indicesToDelete.add(selectedIndex)

          const blocks = page.blocks.filter((_, idx) => !indicesToDelete.has(idx))
          pages[selectedPage] = { ...page, blocks }
          updateTpl({ ...tpl, pages })
          setSelectedIndex(null)
          setSelectedIndices([])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyIndex, history, viewMode, undo, redo, tpl, selectedPage, selectedIndex, selectedIndices, clipboard])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (viewMode !== 'edit') return
      const target = e.target as HTMLElement | null
      const isEditableTarget =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (isEditableTarget) return

      const items = e.clipboardData?.items
      if (!items || items.length === 0) return

      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length === 0) return
      if (!files.some(isImageFile)) return

      imagePasteHandledRef.current = true
      e.preventDefault()
      void pasteImagesFromFiles(files)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [viewMode, tpl, selectedPage])

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [showPropagationModal, setShowPropagationModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showTemplateStateHistoryModal, setShowTemplateStateHistoryModal] = useState(false)
  const [pendingSave, setPendingSave] = useState(false)

  // Exported packages modal
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportedList, setExportedList] = useState<{ fileName: string, size?: number, mtime?: string, exportedBy?: string, exportedByName?: string }[]>([])
  const [exportedLoading, setExportedLoading] = useState(false)
  const [exportedDeleting, setExportedDeleting] = useState<string | null>(null)

  // Custom dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const blocksPalette: Block[] = useMemo(() => ([
    // Basic Tools
    { type: 'text', props: { text: 'Titre', fontSize: 20, color: '#333' } },
    { type: 'image', props: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Eo_circle_pink_blank.svg/120px-Eo_circle_pink_blank.svg.png', width: 120, height: 120 } },
    { type: 'table', props: { x: 100, y: 100, columnWidths: [120, 160], rowHeights: [40, 40], cells: [[{ text: 'A1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }], [{ text: 'A2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }]] } },
    { type: 'qr', props: { url: 'https://example.com', width: 120, height: 120 } },
    { type: 'line', props: { x2: 300, y2: 0, stroke: '#b2bec3', strokeWidth: 2 } },
    { type: 'arrow', props: { x2: 120, y2: 0, stroke: '#6c5ce7', strokeWidth: 2 } },
    { type: 'rect', props: { width: 160, height: 80, color: '#eef1f7' } },
    { type: 'circle', props: { radius: 60, color: '#ffeaa7' } },
    { type: 'student_photo', props: { width: 100, height: 100 } },

    // Promotion / Student Info Components (The requested ones)
    { type: 'promotion_info', props: { field: 'student', width: 200, height: 30, fontSize: 12, color: '#2d3436', label: 'Nom de l\'élève' } },
    { type: 'promotion_info', props: { field: 'studentFirstName', width: 120, height: 30, fontSize: 12, color: '#2d3436', label: 'Prénom' } },
    { type: 'promotion_info', props: { field: 'studentLastName', width: 120, height: 30, fontSize: 12, color: '#2d3436', label: 'Nom de famille' } },
    { type: 'teacher_text', props: { width: 300, height: 60, fontSize: 12, color: '#2d3436', label: 'Zone de texte prof', placeholder: 'Texte éditable par le prof polyvalent...' } },
    { type: 'promotion_info', props: { field: 'currentLevel', width: 100, height: 30, fontSize: 12, color: '#2d3436', label: 'Niveau Actuel' } },
    { type: 'promotion_info', props: { field: 'class', width: 100, height: 30, fontSize: 12, color: '#2d3436', label: 'Classe' } },
    { type: 'promotion_info', props: { field: 'level', width: 150, height: 30, fontSize: 12, color: '#2d3436', label: 'Niveau Suivant (Passage)' } },
    { type: 'promotion_info', props: { field: 'year', width: 120, height: 30, fontSize: 12, color: '#2d3436', label: 'Année Suivante' } },
    { type: 'promotion_info', props: { field: 'currentYear', width: 120, height: 30, fontSize: 12, color: '#2d3436', label: 'Année Actuelle' } },

    // Legacy Final Signature Info (kept for compatibility but updated label)
    { type: 'final_signature_info', props: { field: 'nextLevel', width: 150, height: 30, fontSize: 12, color: '#2d3436', label: 'Info (Legacy) - Niveau Suivant', placeholder: '...' } },

    // Signatures
    { type: 'signature_box', props: { width: 200, height: 80, label: 'Signature', period: 'mid-year' } },
    { type: 'signature_date', props: { width: 220, height: 34, fontSize: 12, color: '#2d3436', label: 'Date Signature', level: 'PS', semester: 1, showMeta: true, align: 'flex-start' } },
    { type: 'signature', props: { labels: ['Directeur', 'Enseignant', 'Parent'], fontSize: 12 } },

    // Interactive
    {
      type: 'language_toggle', props: {
        radius: 40, spacing: 12, direction: 'column', items: [
          { code: 'en', label: 'English', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg', active: false },
          { code: 'fr', label: 'Français', logo: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg', active: false },
          { code: 'ar', label: 'العربية', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg', active: false },
        ]
      }
    },
    {
      type: 'language_toggle_v2', props: {
        radius: 40, spacing: 12, direction: 'row', width: 300, height: 100, items: [
          { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
          { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
          { code: 'en', label: 'English', emoji: '🇬🇧', active: false },
        ]
      }
    },
    { type: 'dropdown', props: { label: 'Menu déroulant', options: ['Option 1', 'Option 2'], variableName: 'var1', width: 200, height: 40, fontSize: 12, color: '#333', semesters: [1, 2] } },
    { type: 'dropdown_reference', props: { dropdownNumber: 1, text: 'Référence dropdown #{number}', fontSize: 12, color: '#2d3436' } },
    { type: 'dynamic_text', props: { text: '{student.firstName} {student.lastName}', fontSize: 14, color: '#2d3436', label: 'Nom complet (Prénom + Nom)' } },
    { type: 'dynamic_text', props: { text: '{student.fullNameFatherInitial}', fontSize: 14, color: '#2d3436', label: 'Nom complet (Prénom + initiale père + nom)' } },
    { type: 'dynamic_text', props: { text: '{student.dob_ddmmyyyy}', fontSize: 14, color: '#2d3436', label: 'Date de naissance (JJ/MM/AAAA)' } },

    // Title Pocket (pocket with text/image)
    {
      type: 'gradebook_pocket', props: {
        width: 90,
        number: '1',
        fontSize: 20,
        label: 'Title'
      }
    },
  ]), [])

  const formatDobDdMmYyyy = (value: any) => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = String(d.getUTCFullYear())
    return `${dd}/${mm}/${yyyy}`
  }

  const fatherInitialFromStudent = (s: any) => {
    const raw = String(s?.fatherName || s?.parentName || '').trim()
    if (!raw) return ''
    return raw.charAt(0).toUpperCase()
  }

  // Get all dropdowns across all pages to determine next dropdown number
  const getAllDropdowns = () => {
    const dropdowns: { pageIdx: number; blockIdx: number; block: Block }[] = []
    tpl.pages.forEach((page, pageIdx) => {
      page.blocks.forEach((block, blockIdx) => {
        if (block.type === 'dropdown') {
          dropdowns.push({ pageIdx, blockIdx, block })
        }
      })
    })
    return dropdowns
  }

  const updateLastCanvasPointer = (e: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    lastCanvasPointerRef.current = {
      pageIndex,
      x: clamp(x, 0, pageWidth),
      y: clamp(y, 0, pageHeight)
    }
  }

  const addBlock = (b: Block) => {
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    const nextZ = (zList.length ? Math.max(...zList) : 0) + 1

    // Use crypto.randomUUID() for stable IDs
    const blockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)
    let newProps = { ...b.props, x: 100, y: 100, z: nextZ, blockId }
    if (b.type === 'dropdown') {
      const allDropdowns = getAllDropdowns()
      const maxNum = allDropdowns.reduce((max, d) => Math.max(max, d.block.props.dropdownNumber || 0), 0)
      newProps.dropdownNumber = maxNum + 1
    }

    const blocks = [...page.blocks, { type: b.type, props: newProps }]
    pages[selectedPage] = { ...page, blocks }
    updateTpl({ ...tpl, pages })
    setSelectedIndex(blocks.length - 1)
    setSelectedCell(null)
  }

  const duplicateBlock = () => {
    if (selectedIndex == null) return
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const blockToDuplicate = page.blocks[selectedIndex]

    // Create a deep copy of the block props
    const newProps = JSON.parse(JSON.stringify(blockToDuplicate.props))

    // Offset the position slightly so it doesn't overlap exactly
    newProps.x = (newProps.x || 0) + 20
    newProps.y = (newProps.y || 0) + 20

    // Handle z-index
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    const nextZ = (zList.length ? Math.max(...zList) : 0) + 1
    newProps.z = nextZ

    // Generate new blockId
    const blockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)
    newProps.blockId = blockId

    // Handle dropdown numbering if it's a dropdown
    if (blockToDuplicate.type === 'dropdown') {
      const allDropdowns = getAllDropdowns()
      const maxNum = allDropdowns.reduce((max, d) => Math.max(max, d.block.props.dropdownNumber || 0), 0)
      newProps.dropdownNumber = maxNum + 1
    }
    // Handle rowId generation for tables
    if (blockToDuplicate.type === 'table' && newProps.cells) {
      const rowCount = newProps.cells.length
      newProps.rowIds = Array.from({ length: rowCount }, () => (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11))
    }

    const newBlock = { type: blockToDuplicate.type, props: newProps }
    const blocks = [...page.blocks, newBlock]

    pages[selectedPage] = { ...page, blocks }
    updateTpl({ ...tpl, pages })
    setSelectedIndex(blocks.length - 1)
    setSelectedCell(null)
  }

  const updateSelected = (patch: any) => {
    if (selectedIndex == null) return
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const blocks = [...page.blocks]
    const selectedBlock = blocks[selectedIndex]
    const prevX = Number(selectedBlock?.props?.x || 0)
    const prevY = Number(selectedBlock?.props?.y || 0)
    const nextX = Object.prototype.hasOwnProperty.call(patch, 'x') ? Number(patch.x || 0) : prevX
    const nextY = Object.prototype.hasOwnProperty.call(patch, 'y') ? Number(patch.y || 0) : prevY
    const dx = nextX - prevX
    const dy = nextY - prevY

    blocks[selectedIndex] = { ...blocks[selectedIndex], props: { ...blocks[selectedIndex].props, ...patch } }

    if ((dx !== 0 || dy !== 0) && selectedBlock) {
      if (selectedBlock.type === 'table') {
        let titleIdx = -1
        const titleBlockId = selectedBlock.props?.titleBlockId
        if (typeof titleBlockId === 'string' && titleBlockId.trim()) {
          titleIdx = blocks.findIndex(b => b?.props?.blockId === titleBlockId)
        }
        if (titleIdx < 0) {
          const tableBlockId = selectedBlock.props?.blockId
          if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
            titleIdx = blocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
          }
        }
        if (titleIdx >= 0) {
          const t = blocks[titleIdx]
          blocks[titleIdx] = {
            ...t,
            props: {
              ...t.props,
              x: Number(t.props?.x || 0) + dx,
              y: Number(t.props?.y || 0) + dy
            }
          }
        }
      }

      if (selectedBlock.type === 'gradebook_pocket') {
        let tableIdx = -1
        const linkedTableBlockId = selectedBlock.props?.linkedTableBlockId
        if (typeof linkedTableBlockId === 'string' && linkedTableBlockId.trim()) {
          tableIdx = blocks.findIndex(b => b?.type === 'table' && b?.props?.blockId === linkedTableBlockId)
        }
        if (tableIdx < 0) {
          const titleBlockId = selectedBlock.props?.blockId
          if (typeof titleBlockId === 'string' && titleBlockId.trim()) {
            tableIdx = blocks.findIndex(b => b?.type === 'table' && b?.props?.titleBlockId === titleBlockId)
          }
        }
        if (tableIdx >= 0) {
          const tb = blocks[tableIdx]
          blocks[tableIdx] = {
            ...tb,
            props: {
              ...tb.props,
              x: Number(tb.props?.x || 0) + dx,
              y: Number(tb.props?.y || 0) + dy
            }
          }
        }
      }
    }
    pages[selectedPage] = { ...page, blocks }
    updateTpl({ ...tpl, pages })
  }

  const updateSelectedTable = (fn: (props: any) => any) => {
    if (selectedIndex == null) return
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const blocks = [...page.blocks]
    const props = { ...blocks[selectedIndex].props }
    const nextProps = fn(props)
    blocks[selectedIndex] = { ...blocks[selectedIndex], props: nextProps }
    pages[selectedPage] = { ...page, blocks }
    updateTpl({ ...tpl, pages })
  }

  const normalizeTextRuns = (props: any): TextRun[] => {
    const rawRuns = props?.runs
    if (Array.isArray(rawRuns) && rawRuns.length) {
      const cleaned = rawRuns
        .filter((r: any) => r && typeof r === 'object' && typeof r.text === 'string')
        .map((r: any) => ({
          text: String(r.text || ''),
          bold: typeof r.bold === 'boolean' ? r.bold : undefined,
          underline: typeof r.underline === 'boolean' ? r.underline : undefined,
          color: typeof r.color === 'string' && r.color ? r.color : undefined,
        }))
        .filter((r: TextRun) => r.text.length > 0)
      if (cleaned.length) return cleaned
    }
    return [{ text: String(props?.text || '') }]
  }

  const mergeTextRuns = (runs: TextRun[]) => {
    const out: TextRun[] = []
    for (const r of runs) {
      if (!r.text) continue
      const prev = out[out.length - 1]
      if (
        prev &&
        prev.bold === r.bold &&
        prev.underline === r.underline &&
        prev.color === r.color
      ) {
        prev.text += r.text
      } else {
        out.push({ ...r })
      }
    }
    return out
  }

  const getSelectionEffectiveAll = (
    runs: TextRun[],
    start: number,
    end: number,
    base: { bold?: boolean; underline?: boolean }
  ) => {
    let any = false
    let allBold = true
    let allUnderline = true
    let offset = 0
    for (const r of runs) {
      const len = r.text.length
      const rs = offset
      const re = offset + len
      const overlapStart = Math.max(start, rs)
      const overlapEnd = Math.min(end, re)
      if (overlapStart < overlapEnd) {
        any = true
        const effBold = (typeof r.bold === 'boolean' ? r.bold : base.bold) ? true : false
        const effUnderline = (typeof r.underline === 'boolean' ? r.underline : base.underline) ? true : false
        if (!effBold) allBold = false
        if (!effUnderline) allUnderline = false
      }
      offset = re
    }
    return { any, allBold, allUnderline }
  }

  const applyStyleToSelection = (
    props: any,
    selection: { start: number; end: number },
    patch: Partial<Pick<TextRun, 'bold' | 'underline' | 'color'>>
  ) => {
    const runs = normalizeTextRuns(props)
    const fullText = runs.map(r => r.text).join('')
    const start = Math.max(0, Math.min(selection.start, fullText.length))
    const end = Math.max(0, Math.min(selection.end, fullText.length))
    if (start >= end) return { text: fullText, runs }

    const next: TextRun[] = []
    let offset = 0
    for (const r of runs) {
      const t = r.text
      const len = t.length
      const rs = offset
      const re = offset + len
      if (re <= start || rs >= end) {
        next.push({ ...r })
      } else {
        const localStart = Math.max(0, start - rs)
        const localEnd = Math.min(len, end - rs)
        const before = t.slice(0, localStart)
        const mid = t.slice(localStart, localEnd)
        const after = t.slice(localEnd)
        if (before) next.push({ ...r, text: before })
        if (mid) next.push({ ...r, text: mid, ...patch })
        if (after) next.push({ ...r, text: after })
      }
      offset = re
    }
    return { text: fullText, runs: mergeTextRuns(next) }
  }

  const persistExpandedTableDesignPresets = (next: ExpandedTableDesignPreset[]) => {
    setExpandedTableDesignPresets(next)
    try {
      localStorage.setItem(EXPANDED_TABLE_DESIGNS_STORAGE_KEY, JSON.stringify(next))
    } catch { }
  }

  const buildExpandedTableDesignFromTableProps = (props: any, options?: { globalBorderColor?: string; globalBorderWidth?: number }): ExpandedTableDesignStyle => {
    const cells = props?.cells || []
    const firstCell = cells?.[0]?.[0] || {}
    const inferredBorder = inferTableBorderStyle(props)

    const rowGap = Number(props?.rowGap || 0)
    const colGap = Number(props?.colGap || 0)
    const borderRadius = Number(props?.borderRadius || 0)
    const fontSize = Number(firstCell?.fontSize || 12)
    const textColor = String(firstCell?.color || '#000000')
    const borderColor = String(options?.globalBorderColor || inferredBorder.color || '#000000')
    const borderWidth = Number(options?.globalBorderWidth ?? inferredBorder.width ?? 1)
    const expandedRowHeight = Number(props?.expandedRowHeight || 34)
    const expandedToggleStyle = String(props?.expandedToggleStyle || 'v2')
    const expandedDividerWidth = Number(props?.expandedDividerWidth || 0.5)
    const expandedDividerColor = String((props?.expandedDividerColor ?? '').toString().trim() || DEFAULT_DIVIDER_COLOR)
    const expandedTopGap = Number(props?.expandedTopGap || 0)

    return {
      rowGap,
      colGap,
      borderRadius,
      fontSize,
      textColor,
      borderColor,
      borderWidth,
      expandedRowHeight,
      expandedToggleStyle,
      expandedDividerWidth,
      expandedDividerColor,
      expandedTopGap
    }
  }

  const applyExpandedTableDesignToSelectedTable = (style: ExpandedTableDesignStyle) => {
    const normalized = normalizeExpandedTableDesignStyle(style)
    setGlobalBorderColor(normalized.borderColor)
    setGlobalBorderWidth(normalized.borderWidth)
    updateSelectedTable(p => {
      const nextProps: any = {
        ...p,
        expandedRows: true,
        rowGap: normalized.rowGap,
        colGap: normalized.colGap,
        borderRadius: normalized.borderRadius,
        expandedRowHeight: normalized.expandedRowHeight,
        expandedToggleStyle: normalized.expandedToggleStyle,
        expandedDividerWidth: normalized.expandedDividerWidth,
        expandedDividerColor: normalized.expandedDividerColor,
        expandedTopGap: normalized.expandedTopGap
      }

      if (Array.isArray(p.cells)) {
        nextProps.cells = (p.cells || []).map((row: any[]) =>
          (row || []).map((cell: any) => {
            const prevBorders = cell?.borders || {}
            return {
              ...cell,
              fontSize: normalized.fontSize,
              color: normalized.textColor,
              borders: {
                ...prevBorders,
                l: { ...(prevBorders.l || {}), color: normalized.borderColor, width: normalized.borderWidth },
                r: { ...(prevBorders.r || {}), color: normalized.borderColor, width: normalized.borderWidth },
                t: { ...(prevBorders.t || {}), color: normalized.borderColor, width: normalized.borderWidth },
                b: { ...(prevBorders.b || {}), color: normalized.borderColor, width: normalized.borderWidth }
              }
            }
          })
        )
      }

      return nextProps
    })
  }

  const saveCurrentExpandedTableDesign = () => {
    if (selectedIndex == null) return
    const name = newExpandedTableDesignName.trim()
    if (!name) return
    const block = tpl.pages[selectedPage]?.blocks?.[selectedIndex]
    if (!block || block.type !== 'table') return

    // Always infer border style directly from the current table cells
    const currentInferred = inferTableBorderStyle(block.props)
    const style = buildExpandedTableDesignFromTableProps(block.props, {
      globalBorderColor: currentInferred.color,
      globalBorderWidth: currentInferred.width
    })
    const existing = expandedTableDesignPresets.find(p => p.name.toLowerCase() === name.toLowerCase())
    const id = existing?.id || ((window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11))
    const next = [
      ...expandedTableDesignPresets.filter(p => p.id !== id),
      { id, name, style }
    ].sort((a, b) => a.name.localeCompare(b.name))

    persistExpandedTableDesignPresets(next)
    setSelectedExpandedTableDesignId(id)
    setNewExpandedTableDesignName('')
  }

  const copySelection = () => {
    if (selectedIndex === null && selectedIndices.length === 0) return

    const page = tpl.pages[selectedPage]
    const blocksToCopy: Block[] = []

    const indices = new Set(selectedIndices)
    if (selectedIndex !== null) indices.add(selectedIndex)

    indices.forEach(idx => {
      if (page.blocks[idx]) {
        blocksToCopy.push(JSON.parse(JSON.stringify(page.blocks[idx])))
      }
    })

    setClipboard(blocksToCopy)
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const isImageFile = (file: File) => {
    if (!file) return false
    if (typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/')) return true
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || '')
  }

  const getImageDimensions = async (blob: Blob): Promise<{ width: number; height: number } | null> => {
    try {
      const w = window as any
      if (typeof w.createImageBitmap === 'function') {
        const bmp = await w.createImageBitmap(blob)
        const out = { width: Number(bmp.width || 0), height: Number(bmp.height || 0) }
        if (typeof bmp.close === 'function') bmp.close()
        if (out.width > 0 && out.height > 0) return out
      }
    } catch { }

    return await new Promise(resolve => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const out = { width: Number(img.naturalWidth || 0), height: Number(img.naturalHeight || 0) }
        URL.revokeObjectURL(url)
        resolve(out.width > 0 && out.height > 0 ? out : null)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    })
  }

  const addImageBlock = (opts: { pageIndex: number; url: string; x: number; y: number; width: number; height: number }) => {
    const pages = [...tpl.pages]
    const page = { ...pages[opts.pageIndex] }
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    const nextZ = (zList.length ? Math.max(...zList) : 0) + 1
    const blockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)

    const x = clamp(opts.x, 0, Math.max(0, pageWidth - opts.width))
    const y = clamp(opts.y, 0, Math.max(0, pageHeight - opts.height))

    const blocks = [
      ...page.blocks,
      {
        type: 'image',
        props: {
          url: opts.url,
          width: opts.width,
          height: opts.height,
          x,
          y,
          z: nextZ,
          blockId
        }
      }
    ]

    pages[opts.pageIndex] = { ...page, blocks }
    updateTpl({ ...tpl, pages })
    setSelectedPage(opts.pageIndex)
    setSelectedIndex(blocks.length - 1)
    setSelectedIndices([])
    setSelectedCell(null)
  }

  const pasteImagesFromFiles = async (files: File[]) => {
    const imageFiles = files.filter(isImageFile)
    if (imageFiles.length === 0) return

    const base = lastCanvasPointerRef.current
    const pageIndex = base?.pageIndex ?? selectedPage
    const anchorX = base?.x ?? pageWidth / 2
    const anchorY = base?.y ?? pageHeight / 2

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      const dims = await getImageDimensions(file)
      const rawW = dims?.width || 320
      const rawH = dims?.height || 240
      const maxSide = 420
      const fit = Math.min(1, maxSide / Math.max(rawW, rawH))
      const width = Math.max(20, Math.round(rawW * fit))
      const height = Math.max(20, Math.round(rawH * fit))

      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await api.post('/media/upload', fd)
        const url = r?.data?.url ? String(r.data.url) : ''
        if (!url) continue
        addImageBlock({
          pageIndex,
          url,
          x: (anchorX + i * 20) - width / 2,
          y: (anchorY + i * 20) - height / 2,
          width,
          height
        })
        await refreshGallery()
      } catch {
        setError('Échec du collage de l’image')
      }
    }
  }

  const pasteFromClipboard = () => {
    if (!clipboard || clipboard.length === 0) return

    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }

    // Calculate z-index start
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    let nextZ = (zList.length ? Math.max(...zList) : 0) + 1

    // Get current max dropdown number
    const allDropdowns = getAllDropdowns()
    let maxDropdownNum = allDropdowns.reduce((max, d) => Math.max(max, d.block.props.dropdownNumber || 0), 0)

    const newBlocks = clipboard.map(block => {
      const newProps = JSON.parse(JSON.stringify(block.props))
      // Offset
      newProps.x = (newProps.x || 0) + 20
      newProps.y = (newProps.y || 0) + 20
      newProps.z = nextZ++

      // Handle dropdown numbering
      if (block.type === 'dropdown') {
        maxDropdownNum++
        newProps.dropdownNumber = maxDropdownNum
      }
      return { type: block.type, props: newProps }
    })

    const blocks = [...page.blocks, ...newBlocks]
    pages[selectedPage] = { ...page, blocks }

    updateTpl({ ...tpl, pages })

    // Select the pasted blocks
    const firstNewIndex = page.blocks.length
    const newSelectedIndices = newBlocks.map((_, i) => firstNewIndex + i)

    if (newSelectedIndices.length === 1) {
      setSelectedIndex(newSelectedIndices[0])
      setSelectedIndices([])
    } else {
      setSelectedIndex(null)
      setSelectedIndices(newSelectedIndices)
    }
    setSelectedCell(null)
  }

  const onDrag = (e: React.MouseEvent, pageIndex: number, idx: number) => {
    e.preventDefault() // Prevent text selection during drag
    const startX = e.clientX
    const startY = e.clientY

    // Determine which blocks are moving
    const movingIndices = new Set<number>()
    const isPartOfSelection = selectedIndices.includes(idx) || selectedIndex === idx

    if (isPartOfSelection) {
      // Moving already selected blocks
      selectedIndices.forEach(i => movingIndices.add(i))
      if (selectedIndex !== null) movingIndices.add(selectedIndex)
    } else {
      // Clicked on unselected block - only move this one
      movingIndices.add(idx)
    }

    // Also include linked title blocks for any tables being moved
    const pageBlocks = tpl.pages[pageIndex].blocks
    let linkedChanged = true
    while (linkedChanged) {
      linkedChanged = false
      Array.from(movingIndices).forEach(i => {
        const block = pageBlocks[i]
        if (!block) return

        if (block.type === 'table') {
          let titleIdx = -1
          const titleBlockId = block.props?.titleBlockId
          if (typeof titleBlockId === 'string' && titleBlockId.trim()) {
            titleIdx = pageBlocks.findIndex(b => b?.props?.blockId === titleBlockId)
          }
          if (titleIdx < 0) {
            const tableBlockId = block.props?.blockId
            if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
              titleIdx = pageBlocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
            }
          }
          if (titleIdx >= 0 && !movingIndices.has(titleIdx)) {
            movingIndices.add(titleIdx)
            linkedChanged = true
          }
        }

        if (block.type === 'gradebook_pocket') {
          let tableIdx = -1
          const linkedTableBlockId = block.props?.linkedTableBlockId
          if (typeof linkedTableBlockId === 'string' && linkedTableBlockId.trim()) {
            tableIdx = pageBlocks.findIndex(b => b?.type === 'table' && b?.props?.blockId === linkedTableBlockId)
          }
          if (tableIdx < 0) {
            const titleBlockId = block.props?.blockId
            if (typeof titleBlockId === 'string' && titleBlockId.trim()) {
              tableIdx = pageBlocks.findIndex(b => b?.type === 'table' && b?.props?.titleBlockId === titleBlockId)
            }
          }
          if (tableIdx >= 0 && !movingIndices.has(tableIdx)) {
            movingIndices.add(tableIdx)
            linkedChanged = true
          }
        }
      })
    }

    // Capture initial positions for all blocks that will move
    const initialPositions = new Map<number, { x: number, y: number }>()
    movingIndices.forEach(i => {
      const b = tpl.pages[pageIndex].blocks[i]
      if (b) initialPositions.set(i, { x: b.props.x || 0, y: b.props.y || 0 })
    })

    const mainBlock = tpl.pages[pageIndex].blocks[idx]
    const baseX = mainBlock.props.x || 0
    const baseY = mainBlock.props.y || 0
    const blockW = mainBlock.props.width || (mainBlock.type === 'text' ? 120 : (mainBlock.type === 'language_toggle' ? 80 : (mainBlock.type === 'language_toggle_v2' ? 300 : 120)))
    const blockH = mainBlock.props.height || (mainBlock.type === 'text' ? 60 : (mainBlock.type === 'language_toggle' ? 200 : (mainBlock.type === 'language_toggle_v2' ? 100 : 120)))

    const otherBlocks = tpl.pages[pageIndex].blocks
      .map((b, i) => ({ b, i }))
      .filter(item => !movingIndices.has(item.i))
      .map(({ b }) => ({
        x: b.props.x || 0,
        y: b.props.y || 0,
        w: b.props.width || (b.type === 'text' ? 120 : (b.type === 'language_toggle' ? 80 : (b.type === 'language_toggle_v2' ? 300 : 120))),
        h: b.props.height || (b.type === 'text' ? 60 : (b.type === 'language_toggle' ? 200 : (b.type === 'language_toggle_v2' ? 100 : 120)))
      }))

    let hasMoved = false
    let isDragging = false
    const DRAG_THRESHOLD = 3 // Minimum pixels to move before considering it a drag
    let finalTpl = tpl

    const onMoveWithCapture = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      // Check if we've moved past the threshold to start dragging
      if (!isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return // Don't start drag yet
        }
        isDragging = true
      }

      hasMoved = true
      const pages = [...tpl.pages]
      const page = { ...pages[pageIndex] }
      const blocks = [...page.blocks]

      let nx = Math.max(0, Math.min(pageWidth - 20, baseX + dx))
      let ny = Math.max(0, Math.min(pageHeight - 20, baseY + dy))

      // Smart Guides Logic
      const threshold = 5
      const guides: { type: 'x' | 'y', pos: number }[] = []
      let snappedX = false
      const cx = nx + blockW / 2
      for (const ob of otherBlocks) {
        const ocx = ob.x + ob.w / 2
        if (Math.abs(nx - ob.x) < threshold) { nx = ob.x; guides.push({ type: 'x', pos: ob.x }); snappedX = true }
        else if (Math.abs((nx + blockW) - (ob.x + ob.w)) < threshold) { nx = (ob.x + ob.w) - blockW; guides.push({ type: 'x', pos: ob.x + ob.w }); snappedX = true }
        else if (Math.abs(nx - (ob.x + ob.w)) < threshold) { nx = ob.x + ob.w; guides.push({ type: 'x', pos: ob.x + ob.w }); snappedX = true }
        else if (Math.abs((nx + blockW) - ob.x) < threshold) { nx = ob.x - blockW; guides.push({ type: 'x', pos: ob.x }); snappedX = true }
        else if (Math.abs(cx - ocx) < threshold) { nx = ocx - blockW / 2; guides.push({ type: 'x', pos: ocx }); snappedX = true }
        if (snappedX) break
      }
      let snappedY = false
      const cy = ny + blockH / 2
      for (const ob of otherBlocks) {
        const ocy = ob.y + ob.h / 2
        if (Math.abs(ny - ob.y) < threshold) { ny = ob.y; guides.push({ type: 'y', pos: ob.y }); snappedY = true }
        else if (Math.abs((ny + blockH) - (ob.y + ob.h)) < threshold) { ny = (ob.y + ob.h) - blockH; guides.push({ type: 'y', pos: ob.y + ob.h }); snappedY = true }
        else if (Math.abs(ny - (ob.y + ob.h)) < threshold) { ny = ob.y + ob.h; guides.push({ type: 'y', pos: ob.y + ob.h }); snappedY = true }
        else if (Math.abs((ny + blockH) - ob.y) < threshold) { ny = ob.y - blockH; guides.push({ type: 'y', pos: ob.y }); snappedY = true }
        else if (Math.abs(cy - ocy) < threshold) { ny = ocy - blockH / 2; guides.push({ type: 'y', pos: ocy }); snappedY = true }
        if (snappedY) break
      }
      setActiveGuides(guides)

      const sx = snap && !snappedX ? Math.round(nx / 10) * 10 : nx
      const sy = snap && !snappedY ? Math.round(ny / 10) * 10 : ny

      // Calculate the delta from the main block's base position
      const finalDx = sx - baseX
      const finalDy = sy - baseY

      // Move ALL blocks in the selection together
      movingIndices.forEach(i => {
        const init = initialPositions.get(i)!
        blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: init.x + finalDx, y: init.y + finalDy } }
      })

      pages[pageIndex] = { ...page, blocks }
      finalTpl = { ...tpl, pages }
      setTpl(finalTpl)
    }

    const onUpWithCapture = () => {
      window.removeEventListener('mousemove', onMoveWithCapture)
      window.removeEventListener('mouseup', onUpWithCapture)
      setActiveGuides([])

      if (hasMoved) {
        // Save to history after drag completes
        updateTpl(finalTpl)
        // Mark that dragging just occurred to prevent click handler from modifying selection
        dragJustOccurred.current = true
        // Reset the flag after a short delay (after click event fires)
        setTimeout(() => { dragJustOccurred.current = false }, 0)
      }
    }

    window.addEventListener('mousemove', onMoveWithCapture)
    window.addEventListener('mouseup', onUpWithCapture)
  }

  const save = async () => {
    if (tpl._id) {
      // Check if there are existing assignments that might be affected
      try {
        const checkRes = await api.get(`/template-propagation/${tpl._id}/assignments`)
        if (checkRes.data.totalCount > 0) {
          // Show the propagation modal to let admin choose which assignments to update
          setShowPropagationModal(true)
          return
        }
      } catch (e) {
        // If the check fails, just proceed with normal save
        console.warn('Could not check for assignments, proceeding with normal save', e)
      }

      // No assignments, proceed with normal save
      const r = await api.patch(`/templates/${tpl._id}`, tpl)
      const normalized = normalizeTemplateNumbers(r.data)
      setTpl(normalized)
      lastAutoSaveRef.current = JSON.stringify(normalized)
      lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
      setSaveStatus('✓ Sauvegardé')
      setTimeout(() => setSaveStatus(''), 3000)
    } else {
      const r = await api.post('/templates', tpl)
      const normalized = normalizeTemplateNumbers(r.data)
      setTpl(normalized)
      lastAutoSaveRef.current = JSON.stringify(normalized)
      lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
      setSaveStatus('✓ Créé')
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  // Handler for propagation modal save
  const handlePropagationSave = async (propagateToAssignmentIds: string[] | 'all' | 'none', changeDescription?: string) => {
    try {
      setPendingSave(true)
      const r = await api.patch(`/template-propagation/${tpl._id}`, {
        templateData: tpl,
        propagateToAssignmentIds,
        changeDescription
      })
      const normalized = normalizeTemplateNumbers(r.data.template)
      setTpl(normalized)
      lastAutoSaveRef.current = JSON.stringify(normalized)
      lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
      setShowPropagationModal(false)

      const { propagation } = r.data
      let statusMsg = '✓ Sauvegardé'
      if (propagation.hasSignificantChange) {
        statusMsg = `✓ Version ${propagation.newVersion} - ${propagation.propagatedCount} mise(s) à jour, ${propagation.skippedCount} maintenu(s)`
      }
      setSaveStatus(statusMsg)
      setTimeout(() => setSaveStatus(''), 5000)
    } finally {
      setPendingSave(false)
    }
  }

  const previewUrl = tpl._id && studentId ? (() => {
    const token = localStorage.getItem('token')
    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    return `${base}/pdf-v2/student/${studentId}?templateId=${tpl._id}&token=${token}`
  })() : ''
  const bulkUrl = tpl._id && classId ? `/pdf/class/${classId}/batch?templateId=${tpl._id}` : ''

  const refreshGallery = async () => { try { const r = await api.get('/media/list'); setGallery(r.data) } catch { } }
  const loadTemplates = async () => {
    try {
      setError('');
      const r = await api.get('/templates');
      setList(r.data)
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        setError('Session expirée. Veuillez vous reconnecter.')
        setTimeout(() => navigate('/login'), 2000)
      } else {
        setError('Impossible de charger les templates')
      }
    }
  }
  const loadYears = async () => {
    try {
      const r = await api.get('/school-years')
      setYears(r.data)
      if (!yearId) {
        const activeFromContext = activeYearId ? (r.data || []).find((y: Year) => y._id === activeYearId) : null
        const activeFromDb = (r.data || []).find((y: Year) => y.active)
        const active = activeFromContext || activeFromDb || (r.data || [])[0]
        if (active?._id) setYearId(active._id)
      }
    } catch { }
  }
  const loadClasses = async (yr: string) => { try { const r = await api.get('/classes', { params: { schoolYearId: yr } }); setClasses(r.data) } catch { } }
  const loadStudents = async (cls: string) => {
    try {
      // In builder we use the general students endpoint which now returns className
      const r = await api.get('/students', { params: { schoolYearId: yearId } })
      // Filter manually or use the endpoint response if it filters by query
      // The previous code was using /students/by-class/:cls which might not exist or be different
      // Let's stick to what was likely intended or correct it to use the main endpoint
      // Actually line 690 says: api.get(`/students/by-class/${cls}`)
      // But I want to ensure we get className.
      // If /students/by-class returns className, we are good.
      // If not, we might need to update the endpoint or use /students with filtering.

      // Let's assume /students/by-class/${cls} is the correct one for now but verify its response structure?
      // No, I can't verify response structure without running it.
      // But I updated /students endpoint in students.ts to return className.
      // Does /students/by-class exist in students.ts?
      // I checked students.ts content earlier and didn't see /by-class.
      // I saw GET / and GET /unassigned/export/:schoolYearId and POST /bulk-assign-section.
      // So /students/by-class/${cls} might be 404!

      // Let's switch to using the main /students endpoint and filter client side if needed,
      // or check if there is a classId param.

      const response = await api.get('/students', { params: { schoolYearId: yearId } })
      const allStudents = response.data
      const classStudents = allStudents.filter((s: any) => s.classId === cls)
      setStudents(classStudents)
    } catch { }
  }


  const handlePptxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)

    try {
      setSaveStatus('Importation en cours...')
      const r = await api.post('/templates/import-pptx', fd)
      const normalized = normalizeTemplateNumbers(r.data)
      setTpl(normalized)
      lastAutoSaveRef.current = JSON.stringify(normalized)
      lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
      setSaveStatus('Importé avec succès')
      await loadTemplates()
    } catch (err) {
      console.error(err)
      setError('Échec de l\'importation PPTX')
      setSaveStatus('')
    }

    if (pptxInputRef.current) pptxInputRef.current.value = ''
  }

  const createTemplate = async () => {
    if (!newTemplateName.trim()) return
    try {
      const newTpl: Template = { name: newTemplateName, pages: [{ title: 'Page 1', blocks: [] }] }
      const r = await api.post('/templates', newTpl)
      const normalized = normalizeTemplateNumbers(r.data)
      setTpl(normalized)
      lastAutoSaveRef.current = JSON.stringify(normalized)
      lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
      setViewMode('edit')
      setShowCreateModal(false)
      setNewTemplateName('')
      await loadTemplates()
    } catch (e) {
      setError('Erreur lors de la création')
    }
  }

  const deleteTemplate = async (id: string) => {
    const current = deleteConfirmations[id] || 0
    if (current < 2) {
      setDeleteConfirmations({ ...deleteConfirmations, [id]: current + 1 })
      return
    }

    try {
      await api.delete(`/templates/${id}`)
      // Reset confirmation state
      const newState = { ...deleteConfirmations }
      delete newState[id]
      setDeleteConfirmations(newState)

      await loadTemplates()
    } catch (e) {
      setError('Erreur lors de la suppression')
    }
  }

  const duplicateTemplate = async (template: Template) => {
    try {
      const copy: Template = { name: `${template.name} (copie)`, pages: template.pages }
      await api.post('/templates', copy)
      await loadTemplates()
    } catch (e) {
      setError('Erreur lors de la duplication')
    }
  }

  useEffect(() => { refreshGallery(); loadTemplates(); loadYears() }, [])
  useEffect(() => { if (yearId) { loadClasses(yearId); setClassId(''); setStudents([]); setStudentId('') } }, [yearId])
  useEffect(() => { if (classId) { loadStudents(classId); setStudentId('') } }, [classId])

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '—'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`
  }
  const relativeTime = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h`
    const days = Math.floor(hr / 24)
    return `${days}d`
  }

  const loadExported = async () => {
    try {
      setExportedLoading(true)
      setError('')
      const r = await api.get('/templates/exports')
      setExportedList(r.data)
    } catch (e) {
      console.error(e)
      setError('Impossible de charger les exports')
    } finally {
      setExportedLoading(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null)
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openDropdown])

  if (viewMode === 'list') {
    return (
      <div className="container" style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '32px 40px', borderRadius: 16, marginBottom: 32, boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Bibliothèque Templates</h1>
              <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.9)' }}>Créez et gérez vos modèles de livrets</p>
            </div>
            <div>
              <input type="file" ref={packageInputRef} style={{ display: 'none' }} accept=".zip" onChange={handlePackageImport} />
              <button
                className="btn"
                onClick={() => packageInputRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: '14px 28px',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  marginRight: 16
                }}
              >
                📥 Importer
              </button>

              <button
                className="btn"
                onClick={async () => { setError(''); await loadExported(); setShowExportModal(true) }}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  padding: '14px 22px',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  marginRight: 12
                }}
              >
                📁 Exportés
              </button>

              <button
                className="btn"
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: '#fff',
                  color: '#667eea',
                  padding: '14px 28px',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: 'none'
                }}
              >
                ✨ Nouveau Template
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '16px 20px',
            background: '#fee',
            color: '#c33',
            borderRadius: 12,
            marginBottom: 24,
            border: '1px solid #fcc',
            fontWeight: 500
          }}>
            ⚠️ {error}
          </div>
        )}

        {list.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 40px',
            background: '#f8f9fa',
            borderRadius: 16,
            border: '2px dashed #dee2e6'
          }}>
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📄</div>
            <h3 style={{ fontSize: 20, color: '#6c757d', marginBottom: 8 }}>Aucun template trouvé</h3>
            <p style={{ color: '#adb5bd', marginBottom: 24 }}>Créez votre premier template pour commencer</p>
            <button className="btn" onClick={() => setShowCreateModal(true)}>Créer un template</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {list.map(item => (
              <div
                key={item._id}
                className="card"
                onClick={() => {
                  const normalized = normalizeTemplateNumbers(item)
                  setTpl(normalized);
                  lastAutoSaveRef.current = JSON.stringify(normalized)
                  lastAutoSaveTemplateIdRef.current = String((normalized as any)?._id || '')
                  setViewMode('edit');
                  setSelectedPage(0);
                  setSelectedIndex(null)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 280,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  position: 'relative',
                  overflow: 'hidden',
                  background: '#fff',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-8px)'
                  e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                  e.currentTarget.style.borderColor = '#cbd5e0'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                }}
              >
                {/* Header Preview */}
                <div style={{
                  height: 140,
                  background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <div style={{ fontSize: 48, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>📄</div>
                  <div style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    background: 'rgba(255,255,255,0.9)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#4a5568',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {item.pages.length} Pages
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: '20px 24px 12px' }}>
                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#2d3748',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {item.name}
                  </h3>
                  {item.updatedAt && (
                    <p style={{ margin: 0, fontSize: 13, color: '#a0aec0' }}>
                      Modifié le {new Date(item.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Footer Actions */}
                <div style={{
                  padding: '12px 24px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto'
                }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn icon-btn"
                      onClick={(e) => { e.stopPropagation(); duplicateTemplate(item) }}
                      title="Dupliquer"
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        background: '#f7fafc',
                        border: '1px solid #e2e8f0',
                        color: '#4a5568',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#edf2f7'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#f7fafc'}
                    >
                      📋
                    </button>
                    <button
                      className="btn icon-btn"
                      onClick={(e) => { e.stopPropagation(); item._id && downloadPackage(item._id) }}
                      title="Exporter"
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        background: '#f7fafc',
                        border: '1px solid #e2e8f0',
                        color: '#4a5568',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#edf2f7'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#f7fafc'}
                    >
                      📦
                    </button>
                    <button
                      className="btn icon-btn"
                      onClick={(e) => { e.stopPropagation(); item._id && deleteTemplate(item._id) }}
                      title="Supprimer"
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        background: (deleteConfirmations[item._id!] || 0) > 0 ? '#e53e3e' : '#fff5f5',
                        border: (deleteConfirmations[item._id!] || 0) > 0 ? '1px solid #c53030' : '1px solid #fed7d7',
                        color: (deleteConfirmations[item._id!] || 0) > 0 ? '#fff' : '#e53e3e',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        minWidth: (deleteConfirmations[item._id!] || 0) > 0 ? 100 : 40
                      }}
                      onMouseEnter={(e) => {
                        if ((deleteConfirmations[item._id!] || 0) === 0) e.currentTarget.style.background = '#fed7d7'
                      }}
                      onMouseLeave={(e) => {
                        if ((deleteConfirmations[item._id!] || 0) === 0) e.currentTarget.style.background = '#fff5f5'
                      }}
                    >
                      {(deleteConfirmations[item._id!] || 0) === 0 ? '🗑️' : `Confirmer (${3 - (deleteConfirmations[item._id!] || 0)})`}
                    </button>
                  </div>

                  <button
                    style={{
                      padding: '8px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#667eea',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    Éditer <span>→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}>
            <div
              className="card"
              style={{
                width: 480,
                maxWidth: '90vw',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                border: 'none',
                animation: 'slideUp 0.3s ease-out'
              }}
            >
              <h3 style={{
                margin: '0 0 20px 0',
                fontSize: 24,
                fontWeight: 600,
                color: '#2d3436'
              }}>
                ✨ Créer un nouveau template
              </h3>
              <input
                autoFocus
                placeholder="Nom du template (ex: Livret Scolaire 2024-2025)"
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTemplate()}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '2px solid #e9ecef',
                  marginBottom: 24,
                  boxSizing: 'border-box',
                  fontSize: 15,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
              />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  className="btn secondary"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '12px 24px', fontSize: 15 }}
                >
                  Annuler
                </button>
                <button
                  className="btn"
                  onClick={createTemplate}
                  style={{ padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}>
            <div
              className="card"
              style={{
                width: 1000,
                maxWidth: '95vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                border: 'none',
                animation: 'slideUp 0.3s ease-out',
                overflow: 'hidden',
                borderRadius: 16
              }}
            >
              <div style={{
                padding: '24px 32px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#fff'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1a202c' }}>
                    📁 Exports disponibles
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#718096', fontSize: 14 }}>
                    Gérez vos fichiers exportés
                  </p>
                </div>
                <button
                  className="btn secondary"
                  onClick={() => setShowExportModal(false)}
                  style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#f7fafc', color: '#a0aec0', cursor: 'pointer', fontSize: 18 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px 32px', background: '#f8fafc', borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, color: '#4a5568', fontWeight: 500 }}>
                  {exportedList.length} fichier{exportedList.length !== 1 ? 's' : ''} trouvé{exportedList.length !== 1 ? 's' : ''}
                </div>
                <button
                  className="btn secondary"
                  onClick={loadExported}
                  disabled={exportedLoading}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#4a5568',
                    cursor: exportedLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span>🔄</span>
                  {exportedLoading ? 'Actualisation...' : 'Actualiser'}
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '0 0', flex: 1, background: '#fff' }}>
                {exportedLoading && exportedList.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#a0aec0' }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
                    Chargement des exports...
                  </div>
                ) : exportedList.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#a0aec0' }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
                    <div style={{ fontSize: 18, color: '#4a5568', fontWeight: 500, marginBottom: 8 }}>Aucun export trouvé</div>
                    <p style={{ margin: 0 }}>Les fichiers exportés apparaîtront ici.</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                      <tr style={{ borderBottom: '2px solid #edf2f7' }}>
                        <th style={{ width: '45%', textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom du fichier</th>
                        <th style={{ width: '20%', textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exporté par</th>
                        <th style={{ width: '15%', textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                        <th style={{ width: '10%', textAlign: 'right', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taille</th>
                        <th style={{ width: '10%', textAlign: 'right', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportedList.map((f, i) => (
                        <tr
                          key={f.fileName}
                          style={{
                            borderBottom: '1px solid #edf2f7',
                            transition: 'background 0.1s',
                            background: i % 2 === 0 ? '#fff' : '#fafafa'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                        >
                          <td style={{ padding: '12px 20px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                              <div style={{
                                flexShrink: 0,
                                width: 36, height: 36,
                                background: f.fileName.endsWith('.zip') ? '#ebf8ff' : '#fff5f5',
                                color: f.fileName.endsWith('.zip') ? '#3182ce' : '#e53e3e',
                                borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18
                              }}>
                                {f.fileName.endsWith('.zip') ? '📦' : '📄'}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div title={f.fileName} style={{ fontWeight: 600, color: '#2d3748', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</div>
                                {f.mtime && ((Date.now() - new Date(f.mtime).getTime()) < (24 * 60 * 60 * 1000)) && (
                                  <span style={{ fontSize: 10, background: '#48bb78', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>Nouveau</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 20px', verticalAlign: 'middle', color: '#4a5568', fontSize: 13 }}>
                            {f.exportedByName ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#cbd5e0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                                  {f.exportedByName.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.exportedByName}</span>
                              </div>
                            ) : (
                              <span style={{ color: '#a0aec0', fontStyle: 'italic' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 20px', color: '#718096', fontSize: 13, verticalAlign: 'middle' }}>
                            {f.mtime ? (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 500, color: '#4a5568' }}>{new Date(f.mtime).toLocaleDateString()}</span>
                                <span style={{ fontSize: 11 }}>{new Date(f.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', color: '#4a5568', fontSize: 13, fontFamily: 'monospace', verticalAlign: 'middle' }}>
                            {formatBytes(f.size)}
                          </td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                              <button
                                className="btn"
                                title="Télécharger"
                                onClick={async () => {
                                  try {
                                    const resp = await api.get(`/templates/exports/${encodeURIComponent(f.fileName)}`, { responseType: 'blob' })
                                    const blob = new Blob([resp.data], { type: 'application/zip' })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = f.fileName
                                    document.body.appendChild(a)
                                    a.click()
                                    a.remove()
                                    URL.revokeObjectURL(url)
                                    setSaveStatus('Téléchargement terminé')
                                    setTimeout(() => setSaveStatus(''), 3000)
                                  } catch (e) { setError('Échec du téléchargement') }
                                }}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  background: '#ebf8ff',
                                  color: '#3182ce',
                                  border: '1px solid #bee3f8',
                                  cursor: 'pointer'
                                }}
                              >
                                ⬇️
                              </button>
                              <button
                                className="btn"
                                title="Supprimer"
                                onClick={async () => {
                                  if (!confirm(`Supprimer ${f.fileName} ?`)) return
                                  try {
                                    setExportedDeleting(f.fileName)
                                    await api.delete(`/templates/exports/${encodeURIComponent(f.fileName)}`)
                                    await loadExported()
                                    setSaveStatus('Export supprimé')
                                    setTimeout(() => setSaveStatus(''), 3000)
                                  } catch (e) { setError('Échec de la suppression') }
                                  finally { setExportedDeleting(null) }
                                }}
                                disabled={exportedDeleting === f.fileName}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  background: '#fff5f5',
                                  color: '#e53e3e',
                                  border: '1px solid #fed7d7',
                                  cursor: exportedDeleting === f.fileName ? 'wait' : 'pointer',
                                  opacity: exportedDeleting === f.fileName ? 0.7 : 1
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ padding: '16px 32px', borderTop: '1px solid #edf2f7', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn secondary"
                  onClick={() => setShowExportModal(false)}
                  style={{
                    padding: '10px 24px',
                    background: '#fff',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    fontWeight: 600,
                    borderRadius: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portals for List View */}
        {saveStatus && createPortal(
          <div style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 2147483647, // Max z-index
            padding: '16px 24px',
            background: '#10b981',
            color: 'white',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 400,
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none', // Allow clicking through
          }}>
            <span style={{ fontSize: 24 }}>✓</span>
            <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{saveStatus}</span>
          </div>,
          document.body
        )}
        {error && createPortal(
          <div style={{
            position: 'fixed',
            top: 100, // Offset to avoid overlap
            right: 24,
            zIndex: 2147483647, // Max z-index
            padding: '16px 24px',
            background: '#ef4444',
            color: 'white',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 400,
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 24 }}>✗</span>
            <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
          </div>,
          document.body
        )}
      </div>
    )
  }

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', padding: 24 }}>
      {/* Top Navigation Bar */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="btn secondary"
            onClick={() => {
              if (isDirty) {
                const ok = window.confirm('Vous avez des modifications non enregistrées. Quitter sans sauvegarder ?')
                if (!ok) return
              }
              setViewMode('list');
              loadTemplates()
            }}
            style={{
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>←</span> Retour
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn secondary"
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Annuler (Ctrl+Z)"
              style={{
                padding: '10px 14px',
                opacity: historyIndex <= 0 ? 0.5 : 1,
                cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer'
              }}
            >
              ↩️
            </button>
            <button
              className="btn secondary"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Rétablir (Ctrl+Y)"
              style={{
                padding: '10px 14px',
                opacity: historyIndex >= history.length - 1 ? 0.5 : 1,
                cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ↪️
            </button>
          </div>
          <div style={{ height: 32, width: 1, background: '#e0e0e0' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#2d3436' }}>
              {tpl.name || 'Sans titre'}
            </h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Auto-save Toggle */}
          <button
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            title={autoSaveEnabled ? "Désactiver l'enregistrement automatique" : "Activer l'enregistrement automatique"}
            style={{
              padding: '6px 12px 6px 16px',
              height: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: autoSaveEnabled ? 'rgba(85, 239, 196, 0.15)' : '#f8f9fa',
              border: `1px solid ${autoSaveEnabled ? '#55efc4' : '#e2e8f0'}`,
              color: autoSaveEnabled ? '#00b894' : '#636e72',
              fontWeight: 600,
              fontSize: 13,
              borderRadius: 20,
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            <span>Auto Save</span>
            <div style={{
              width: 32,
              height: 18,
              borderRadius: 12,
              background: autoSaveEnabled ? '#00b894' : '#cbd5e0',
              position: 'relative',
              transition: 'background 0.2s ease',
              flexShrink: 0
            }}>
              <div style={{
                position: 'absolute',
                top: 2,
                left: autoSaveEnabled ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }} />
            </div>
          </button>

          <div style={{ height: 24, width: 1, background: '#e0e0e0' }} />

          {/* Student Gradebook History Button */}
          {tpl._id && (
            <button
              className="btn secondary"
              onClick={() => setShowHistoryModal(true)}
              title="Voir l'historique des carnets élèves"
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                color: '#7c3aed'
              }}
            >
              👥 Student Gradebook History
            </button>
          )}

          {/* Template History Button */}
          {tpl._id && (
            <button
              className="btn secondary"
              onClick={() => setShowTemplateStateHistoryModal(true)}
              title="Voir l'historique des sauvegardes du template"
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#2563eb'
              }}
            >
              🗂️ Template History
            </button>
          )}

          {/* Save Button */}
          <button
            className="btn"
            onClick={async () => {
              try {
                setError('');
                setSaveStatus('');
                await save();
                setSaveStatus('Enregistré avec succès');
                setTimeout(() => setSaveStatus(''), 3000);
                await loadTemplates()
              } catch (e: any) {
                setError('Échec de l\'enregistrement');
                setTimeout(() => setError(''), 3000)
              }
            }}
            style={{
              padding: '12px 32px',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            💾 Enregistrer
          </button>
        </div>
      </div>

      {/* Status Messages - Toast Notifications */}
      {saveStatus && createPortal(
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 2147483647, // Max z-index
          padding: '16px 24px',
          background: '#10b981',
          color: 'white',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          maxWidth: 400,
          border: '1px solid rgba(255,255,255,0.2)',
          pointerEvents: 'none', // Allow clicking through
        }}>
          <span style={{ fontSize: 24 }}>✓</span>
          <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{saveStatus}</span>
        </div>,
        document.body
      )}
      {error && createPortal(
        <div style={{
          position: 'fixed',
          top: 100, // Offset to avoid overlap
          right: 24,
          zIndex: 2147483647, // Max z-index
          padding: '16px 24px',
          background: '#ef4444',
          color: 'white',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          maxWidth: 400,
          border: '1px solid rgba(255,255,255,0.2)',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 24 }}>✗</span>
          <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
        </div>,
        document.body
      )}

      {/* Main Controls */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Template Name */}
          <div style={{ flex: '1 1 300px', minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6c757d', marginBottom: 6 }}>
              NOM DU TEMPLATE
            </label>
            <input
              placeholder="Nom du template"
              value={tpl.name}
              onChange={e => setTpl({ ...tpl, name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '2px solid #e9ecef',
                fontSize: 15,
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
            />
          </div>

          {/* Signing Page Number */}
          <div style={{ flex: '0 0 120px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6c757d', marginBottom: 6 }}>
              PAGE SIGNATURE
            </label>
            <input
              type="number"
              min={1}
              placeholder="#"
              value={(tpl as any).signingPage || ''}
              onChange={e => setTpl({ ...tpl, signingPage: parseInt(e.target.value) || undefined })}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '2px solid #e9ecef',
                fontSize: 15,
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
            />
          </div>

          {/* Page Selector */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6c757d', marginBottom: 6 }}>
              PAGE ACTIVE
            </label>
            <select
              value={selectedPage}
              onChange={e => setSelectedPage(Number(e.target.value))}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '2px solid #e9ecef',
                fontSize: 15,
                minWidth: 180,
                cursor: 'pointer'
              }}
            >
              {tpl.pages.map((p, i) => (
                <option key={i} value={i}>
                  {p.title || `Page ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Add Page Button */}
          <div style={{ flex: '0 0 auto', paddingTop: 22 }}>
            <button
              className="btn secondary"
              onClick={() => {
                const pages = [...tpl.pages, { title: `Page ${tpl.pages.length + 1}`, blocks: [] }];
                setTpl({ ...tpl, pages });
                setSelectedPage(pages.length - 1);
                setSelectedIndex(null)
              }}
              style={{
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14
              }}
            >
              <span style={{ fontSize: 18 }}>+</span> Nouvelle page
            </button>
          </div>

          {/* Background Color */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6c757d', marginBottom: 6 }}>
              FOND PAGE
            </label>
            <input
              type="color"
              value={tpl.pages[selectedPage].bgColor || '#ffffff'}
              onChange={e => {
                const pages = [...tpl.pages];
                pages[selectedPage] = { ...pages[selectedPage], bgColor: e.target.value };
                setTpl({ ...tpl, pages })
              }}
              style={{
                width: 60,
                height: 40,
                padding: 4,
                borderRadius: 8,
                border: '2px solid #e9ecef',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        {/* Secondary Controls */}
        <div style={{
          marginTop: 20,
          paddingTop: 20,
          borderTop: '1px solid #e9ecef',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: '#f8f9fa',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14
          }}>
            <input
              type="checkbox"
              checked={snap}
              onChange={e => setSnap(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span>Magnétisme</span>
          </label>

          <button
            className="btn secondary"
            onClick={pasteFromClipboard}
            disabled={!clipboard || clipboard.length === 0}
            style={{ fontSize: 13, padding: '8px 14px', opacity: (!clipboard || clipboard.length === 0) ? 0.5 : 1 }}
          >
            📋 Coller
          </button>

          <button
            className="btn secondary"
            onClick={() => setContinuousScroll(!continuousScroll)}
            style={{
              padding: '8px 16px',
              fontSize: 14
            }}
          >
            {continuousScroll ? '📄 Vue page par page' : '📜 Vue continue'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8f9fa', padding: '8px 14px', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingRight: 10, borderRight: '1px solid #dee2e6' }}>
              <input type="checkbox" checked={autoFit} onChange={e => setAutoFit(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Auto</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
              <span style={{ fontSize: 14 }}>🔍 Zoom</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={scale}
                disabled={autoFit}
                onChange={e => setScale(parseFloat(e.target.value))}
                style={{ flex: 1, opacity: autoFit ? 0.5 : 1, cursor: autoFit ? 'not-allowed' : 'pointer' }}
              />
              <span style={{ fontWeight: 600, minWidth: 45, textAlign: 'right', fontSize: 14 }}>{Math.round(scale * 100)}%</span>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Preview Controls */}
          <select
            value={yearId}
            onChange={e => setYearId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '2px solid #e9ecef',
              fontSize: 13
            }}
          >
            <option value="">Année scolaire</option>
            {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
          </select>

          <select
            value={classId}
            onChange={e => setClassId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '2px solid #e9ecef',
              fontSize: 13
            }}
          >
            <option value="">Classe</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          <select
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '2px solid #e9ecef',
              fontSize: 13
            }}
          >
            <option value="">Élève</option>
            {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
          </select>

          {previewUrl && (
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  const base = String(api.defaults.baseURL || '').replace(/\/$/, '')
                  const pdfUrl = buildPreviewPdfUrl(base, tpl._id || '', studentId)
                  const selectedStudent = students.find(s => s._id === studentId)
                  const studentFullName = selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Aperçu'
                  openPdfExport(pdfUrl, studentFullName, 'single', 1)
                } catch (e) {
                  setError('Échec de l\'export PDF')
                }
              }}
              style={{
                padding: '8px 16px',
                fontSize: 14
              }}
            >
              📄 Exporter en PDF
            </button>
          )}

          {bulkUrl && (
            <a
              className="btn secondary"
              href={bulkUrl}
              target="_blank"
              style={{
                padding: '8px 16px',
                fontSize: 14,
                textDecoration: 'none'
              }}
            >
              📦 Export classe
            </a>
          )}
        </div>

        {/* Advanced Actions */}
        <details style={{ marginTop: 20 }}>
          <summary style={{
            cursor: 'pointer',
            padding: '12px 16px',
            background: '#f8f9fa',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#6c757d',
            userSelect: 'none'
          }}>
            ⚙️ Actions avancées
          </summary>
          <div style={{
            marginTop: 12,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            padding: '16px',
            background: '#f8f9fa',
            borderRadius: 8
          }}>
            <button
              className="btn secondary"
              onClick={async () => {
                const blob = new Blob([JSON.stringify(tpl)], { type: 'application/json' })
                const fd = new FormData()
                fd.append('file', new File([blob], `${tpl.name || 'template'}.json`, { type: 'application/json' }))
                await api.post('/media/upload?folder=gradebook-templates', fd)
                setSaveStatus('Modèle enregistré dans médias avec succès')
                setTimeout(() => setSaveStatus(''), 3000)
              }}
              style={{ fontSize: 13, padding: '8px 14px' }}
            >
              📂 Enregistrer dans médias
            </button>

            <button
              className="btn secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(tpl)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${tpl.name || 'template'}.json`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              }}
              style={{ fontSize: 13, padding: '8px 14px' }}
            >
              💾 Télécharger JSON
            </button>

            <button
              className="btn secondary"
              onClick={() => pptxInputRef.current?.click()}
              style={{ fontSize: 13, padding: '8px 14px' }}
            >
              📊 Importer PPTX
            </button>
            <input
              type="file"
              ref={pptxInputRef}
              style={{ display: 'none' }}
              accept=".pptx"
              onChange={handlePptxImport}
            />
          </div>
        </details>
      </div>

      {/* Main Editor Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        {/* Left Panel - Blocks Palette */}
        <div
          style={{
            position: 'sticky',
            top: 24,
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 16,
            padding: '24px 20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            overflowX: 'hidden'
          }}
        >
          <h3 style={{
            margin: '0 0 20px 0',
            fontSize: 18,
            fontWeight: 600,
            color: '#2d3436',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            🧩 Composants
          </h3>

          {/* Blocks Palette Groups */}
          {[
            {
              title: 'Général',
              items: [
                ...blocksPalette.filter(b => ['text', 'image', 'table', 'qr', 'line', 'arrow', 'rect', 'circle', 'gradebook_pocket'].includes(b.type))
              ]
            },
            {
              title: 'Promotion & Signatures',
              items: [
                ...blocksPalette.filter(b => ['promotion_info', 'teacher_text', 'signature_box', 'signature_date', 'signature', 'student_photo'].includes(b.type))
              ]
            },
            {
              title: 'Élève',
              items: [
                ...blocksPalette.filter(b => ['dynamic_text'].includes(b.type))
              ]
            },
            {
              title: 'Interactif',
              items: [
                ...blocksPalette.filter(b => ['language_toggle', 'language_toggle_v2', 'dropdown', 'dropdown_reference'].includes(b.type))
              ]
            }
          ].map((group, groupIndex) => (
            <div key={groupIndex} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#6c757d',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {group.title}
              </div>
              {group.items.map((b, i) => (
                <div
                  key={i}
                  onClick={() => addBlock(b)}
                  style={{
                    padding: '12px 14px',
                    marginBottom: 8,
                    background: '#f8f9fa',
                    border: '2px solid #e9ecef',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e7f5ff'
                    e.currentTarget.style.borderColor = '#667eea'
                    e.currentTarget.style.transform = 'translateX(4px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f8f9fa'
                    e.currentTarget.style.borderColor = '#e9ecef'
                    e.currentTarget.style.transform = 'translateX(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>
                      {b.type === 'text' && '📝'}
                      {b.type === 'image' && '🖼️'}
                      {b.type === 'table' && '📊'}
                      {b.type === 'qr' && '📱'}
                      {b.type === 'line' && '➖'}
                      {b.type === 'arrow' && '➡️'}
                      {b.type === 'rect' && '▭'}
                      {b.type === 'circle' && '⬤'}
                      {b.type === 'promotion_info' && '🎓'}
                      {b.type === 'teacher_text' && '📝'}
                      {b.type === 'signature_box' && '✍️'}
                      {b.type === 'signature_date' && '📅'}
                      {b.type === 'signature' && '👥'}
                      {b.type === 'student_photo' && '📸'}
                      {b.type === 'language_toggle' && '🌐'}
                      {b.type === 'language_toggle_v2' && '🏳️'}
                      {b.type === 'dropdown' && '🔽'}
                      {b.type === 'dropdown_reference' && '🔗'}
                      {b.type === 'dynamic_text' && '🔤'}
                      {b.type === 'gradebook_pocket' && '📝'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {b.props.label || (
                        b.type === 'text' ? 'Texte' :
                          b.type === 'image' ? 'Image' :
                            b.type === 'table' ? 'Tableau' :
                              b.type === 'qr' ? 'QR Code' :
                                b.type === 'line' ? 'Ligne' :
                                  b.type === 'arrow' ? 'Flèche' :
                                    b.type === 'rect' ? 'Rectangle' :
                                      b.type === 'circle' ? 'Cercle' :
                                        b.type === 'promotion_info' ? 'Info Passage' :
                                          b.type === 'teacher_text' ? 'Zone Texte Prof' :
                                            b.type === 'signature_box' ? 'Signature Box' :
                                              b.type === 'signature_date' ? 'Date Signature (Subadmin)' :
                                                b.type === 'signature' ? 'Signatures (Noms)' :
                                                  b.type === 'student_photo' ? 'Photo Élève' :
                                                    b.type === 'language_toggle' ? 'Langues (V1)' :
                                                      b.type === 'language_toggle_v2' ? 'Langues (V2)' :
                                                        b.type === 'dropdown' ? 'Menu déroulant' :
                                                          b.type === 'dropdown_reference' ? 'Référence Dropdown' :
                                                            b.type === 'dynamic_text' ? 'Texte Dynamique' :
                                                              b.type === 'gradebook_pocket' ? 'Title' :
                                                                b.type
                      )}
                    </span>
                  </div>
                  <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
                </div>
              ))}
            </div>
          ))}












        </div>

        {/* Center Panel - Canvas */}
        <div ref={canvasContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start', minWidth: 0, overflowX: autoFit ? 'hidden' : 'auto', paddingBottom: 24 }}>
          {(continuousScroll ? tpl.pages : [tpl.pages[selectedPage]]).map((page, i) => {
            const pageIndex = continuousScroll ? i : selectedPage
            return (
              <div
                key={pageIndex}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                  minWidth: 'fit-content'
                }}
              >
                {continuousScroll && (
                  <div style={{
                    marginBottom: 12,
                    padding: '8px 16px',
                    background: '#667eea',
                    color: '#fff',
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    Page {pageIndex + 1} / {tpl.pages.length}
                  </div>
                )}

                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top center',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: selectedPage === pageIndex ? '3px solid #667eea' : '1px solid #ddd',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div
                    className="card page-canvas"
                    style={{
                      height: pageHeight,
                      width: pageWidth,
                      background: page.bgColor || '#fff',
                      position: 'relative',
                      margin: 0
                    }}
                    onMouseMove={(e) => updateLastCanvasPointer(e, pageIndex)}
                    onClick={() => setSelectedPage(pageIndex)}
                  >
                    <div className="page-margins" style={{ border: '1px dashed #b2bec3' }} />
                    {/* Guides */}
                    {activeGuides.map((g, i) => (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          left: g.type === 'x' ? g.pos : 0,
                          top: g.type === 'y' ? g.pos : 0,
                          width: g.type === 'x' ? 1 : '100%',
                          height: g.type === 'y' ? 1 : '100%',
                          background: '#ff0055',
                          zIndex: 1000,
                          pointerEvents: 'none'
                        }}
                      />
                    ))}
                    {page.blocks.map((_b, idx) => {
                      if (!_b) return null
                      const b = { ..._b, props: (_b as any).props ?? {} }
                      const isSelected = (selectedIndex === idx || selectedIndices.includes(idx)) && selectedPage === pageIndex
                      return (
                        <div
                          key={b.props.blockId || `block-${pageIndex}-${idx}`}
                          style={{
                            position: 'absolute',
                            left: b.props.x || 0,
                            top: b.props.y || 0,
                            zIndex: (b.props.z ?? idx),
                            border: isSelected ? '3px solid #667eea' : '1px dashed rgba(0,0,0,0.2)',
                            padding: 6,
                            borderRadius: 8,
                            background: isSelected ? 'rgba(102, 126, 234, 0.05)' : 'transparent',
                            boxShadow: isSelected ? '0 0 0 1px rgba(102, 126, 234, 0.2)' : 'none',
                            cursor: 'move',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseDown={(e) => onDrag(e, pageIndex, idx)}
                          onClick={(e) => {
                            e.stopPropagation();

                            // Skip selection logic if we just finished dragging
                            if (dragJustOccurred.current) {
                              return
                            }

                            setSelectedPage(pageIndex);

                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              const newIndices = new Set(selectedIndices)
                              if (selectedIndex !== null) newIndices.add(selectedIndex)

                              if (newIndices.has(idx)) {
                                newIndices.delete(idx)
                                if (selectedIndex === idx) setSelectedIndex(null)
                              } else {
                                newIndices.add(idx)
                                setSelectedIndex(idx)
                              }
                              setSelectedIndices(Array.from(newIndices))
                            } else {
                              setSelectedIndex(idx);
                              setSelectedIndices([]);
                            }
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)'
                              e.currentTarget.style.background = 'rgba(102, 126, 234, 0.02)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'
                              e.currentTarget.style.background = 'transparent'
                            }
                          }}
                        >
                          {b.type === 'text' && (
                            <div
                              style={{
                                color: b.props.color,
                                fontSize: b.props.fontSize,
                                fontWeight: b.props.bold ? 700 : 400,
                                textDecoration: b.props.underline ? 'underline' : 'none',
                                width: b.props.width,
                                height: b.props.height,
                                overflow: 'hidden',
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              {Array.isArray(b.props.runs) && b.props.runs.length ? (
                                (b.props.runs as any[]).map((r, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      color: (r && typeof r === 'object' && typeof r.color === 'string' && r.color) ? r.color : (b.props.color || undefined),
                                      fontWeight: (r && typeof r === 'object' && typeof r.bold === 'boolean') ? (r.bold ? 700 : 400) : (b.props.bold ? 700 : 400),
                                      textDecoration: (r && typeof r === 'object' && typeof r.underline === 'boolean') ? (r.underline ? 'underline' : 'none') : (b.props.underline ? 'underline' : 'none'),
                                    }}
                                  >
                                    {r?.text || ''}
                                  </span>
                                ))
                              ) : (
                                b.props.text
                              )}
                            </div>
                          )}
                          {b.type === 'image' && (
                            <>
                              {cropModeBlockId === b.props.blockId ? (
                                <div style={{ position: 'relative', width: b.props.width || 120, height: b.props.height || 120 }}>
                                  <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} />
                                  <ImageCropOverlay
                                    imageUrl={b.props.url}
                                    imageWidth={b.props.width || 120}
                                    imageHeight={b.props.height || 120}
                                    initialCrop={b.props.cropData}
                                    onApply={(cropData) => {
                                      const currentWidth = b.props.width || 120
                                      const currentHeight = b.props.height || 120
                                      const naturalWidth = cropData.naturalWidth || currentWidth
                                      const naturalHeight = cropData.naturalHeight || currentHeight
                                      const scaleX = currentWidth / naturalWidth
                                      const scaleY = currentHeight / naturalHeight
                                      const nextWidth = Math.max(20, Math.round(cropData.width * scaleX))
                                      const nextHeight = Math.max(20, Math.round(cropData.height * scaleY))
                                      updateSelected({ cropData, width: nextWidth, height: nextHeight })
                                      setCropModeBlockId(null)
                                    }}
                                    onCancel={() => setCropModeBlockId(null)}
                                  />
                                </div>
                              ) : (
                                <CroppedImage src={b.props.url} displayWidth={b.props.width || 120} displayHeight={b.props.height || 120} cropData={b.props.cropData} borderRadius={8} />
                              )}
                            </>
                          )}
                          {b.type === 'student_photo' && (() => {
                            let url = ''
                            if (studentId) {
                              const s = students.find(st => st._id === studentId) as any
                              if (s && s.avatarUrl) url = s.avatarUrl
                            }
                            return url ? (
                              <img src={url} style={{ width: b.props.width || 100, height: b.props.height || 100, objectFit: 'cover', borderRadius: 8 }} />
                            ) : (
                              <div style={{ width: b.props.width || 100, height: b.props.height || 100, borderRadius: 8, background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                                <div style={{ fontSize: 24 }}>👤</div>
                                <div style={{ fontSize: 10, color: '#666' }}>Photo</div>
                              </div>
                            )
                          })()}
                          {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                          {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                          {b.type === 'gradebook_pocket' && (
                            <GradebookPocket
                              number={b.props.number || '1'}
                              width={b.props.width || 120}
                              fontSize={b.props.fontSize}
                            />
                          )}
                          {b.type === 'language_toggle' && (
                            <div style={{ display: 'flex', flexDirection: (b.props.direction as any) || 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                              {(b.props.items || []).map((it: any, i: number) => {
                                const r = b.props.radius || 40
                                const size = r * 2
                                return (
                                  <div key={i} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', position: 'relative', cursor: 'pointer', boxShadow: it.active ? '0 0 0 2px #6c5ce7' : 'none' }}
                                    onClick={(ev) => { ev.stopPropagation(); const pages = [...tpl.pages]; const page = { ...pages[selectedPage] }; const blocks = [...page.blocks]; const items = [...(blocks[idx].props.items || [])]; items[i] = { ...items[i], active: !items[i].active }; blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, items } }; pages[selectedPage] = { ...page, blocks }; setTpl({ ...tpl, pages }) }}>
                                    {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {b.type === 'language_toggle_v2' && (
                            <div style={{
                              display: 'flex',
                              flexDirection: (b.props.direction as any) || 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: b.props.spacing || 12,
                              background: b.props.backgroundColor || 'transparent',
                              borderRadius: b.props.borderRadius || 12,
                              padding: b.props.padding || 8,
                              width: b.props.width,
                              height: b.props.height,
                              boxSizing: 'border-box'
                            }}>
                              {(b.props.items || []).map((it: any, i: number) => {
                                const size = 40
                                const getEmoji = (item: any) => {
                                  const e = item.emoji
                                  if (e && e.length >= 2) return e
                                  const c = (item.code || '').toLowerCase()
                                  if (c === 'lb' || c === 'ar') return '🇱🇧'
                                  if (c === 'fr') return '🇫🇷'
                                  if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                  return '🏳️'
                                }
                                const emoji = getEmoji(it)
                                const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`
                                return (
                                  <div key={i}
                                    title={it.label}
                                    style={{
                                      width: size,
                                      height: size,
                                      minWidth: size, // Prevent shrinking
                                      borderRadius: '50%',
                                      background: it.active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                      border: it.active ? '2px solid #2563eb' : '1px solid rgba(0, 0, 0, 0.1)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                      transform: it.active ? 'scale(1.1)' : 'scale(1)',
                                      boxShadow: it.active ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
                                      filter: 'none',
                                      opacity: it.active ? 1 : 0.5
                                    }}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const pages = [...tpl.pages];
                                      const page = { ...pages[selectedPage] };
                                      const blocks = [...page.blocks];
                                      const items = [...(blocks[idx].props.items || [])];
                                      items[i] = { ...items[i], active: !items[i].active };
                                      blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, items } };
                                      pages[selectedPage] = { ...page, blocks };
                                      setTpl({ ...tpl, pages })
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                  >
                                    <img src={appleEmojiUrl} style={{ width: size * 0.75, height: size * 0.75, objectFit: 'contain' }} alt="" />
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                          {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                          {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{(() => {
                            let text = b.props.text || ''
                            if (studentId) {
                              const s = students.find(st => st._id === studentId)
                              if (s) {
                                const fatherInitial = fatherInitialFromStudent(s)
                                const fatherInitialWithDot = fatherInitial ? `${fatherInitial}.` : ''
                                const fullNameFatherInitial = [s.firstName, fatherInitialWithDot, s.lastName].filter(Boolean).join(' ')
                                text = text
                                  .replace(/{student.firstName}/g, s.firstName)
                                  .replace(/{student.lastName}/g, s.lastName)
                                  .replace(/{student.fatherInitial}/g, fatherInitialWithDot)
                                  .replace(/{student.fullNameFatherInitial}/g, fullNameFatherInitial)
                                  .replace(/{student.dob}/g, s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : '')
                                  .replace(/{student.dob_ddmmyyyy}/g, formatDobDdMmYyyy(s.dateOfBirth))
                              }
                            }
                            Object.entries(previewData).forEach(([k, v]) => {
                              text = text.replace(new RegExp(`{${k}}`, 'g'), v)
                            })
                            return text
                          })()}</div>}
                          {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{(() => {
                            if (studentId) {
                              const s = students.find(st => st._id === studentId) as any
                              if (s) return `${s.firstName} ${s.lastName}, ${s.className || 'Classe'}, ${s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : 'Date'}`
                            }
                            return 'Nom, Classe, Naissance'
                          })()}</div>}
                          {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Titre catégorie</div>}
                          {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>Liste des compétences</div>}
                          {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden' }}>{(b.props.labels || []).join(' / ')}</div>}
                          {b.type === 'signature_box' && (
                            <div style={{
                              width: b.props.width || 200,
                              height: b.props.height || 80,
                              border: 'none',
                              background: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              color: '#999'
                            }}>
                              {b.props.label || 'Signature'}
                            </div>
                          )}
                          {b.type === 'signature_date' && (
                            <div style={{
                              width: b.props.width || 220,
                              height: b.props.height || 34,
                              border: '1px dashed #94a3b8',
                              background: '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: b.props.align || 'flex-start',
                              padding: '0 8px',
                              fontSize: b.props.fontSize || 12,
                              color: b.props.color || '#2d3436',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap'
                            }}>
                              {`${b.props.level || ''} S${b.props.semester || 1} : 14:01:2026`}
                            </div>
                          )}
                          {b.type === 'promotion_info' && (
                            <div style={{
                              width: b.props.width || (b.props.field ? 150 : 300),
                              height: b.props.height || (b.props.field ? 30 : 100),
                              border: '1px dashed #6c5ce7',
                              background: '#f0f4ff',
                              padding: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: b.props.fontSize || 12,
                              color: b.props.color || '#2d3436',
                              textAlign: 'center'
                            }}>
                              {(() => {
                                const s = studentId ? (students.find(st => st._id === studentId)) : null
                                const c = classId ? (classes.find(cl => cl._id === classId)) : null

                                // Debug logs to verify data
                                // console.log('PromotionInfo render:', { field: b.props.field, studentId, classId, s, c })

                                const currentLevel = c?.level || s?.level
                                let nextLevel = s?.nextLevel

                                // If no explicit next level, try to calculate from current level order
                                if (!nextLevel && currentLevel && levels && levels.length > 0) {
                                  // Ensure levels are sorted by order
                                  const sortedLevels = [...levels].sort((a, b) => a.order - b.order)
                                  const currIdx = sortedLevels.findIndex(l => l.name === currentLevel)

                                  // If found and not the last level (e.g. EB9 has no next)
                                  if (currIdx !== -1 && currIdx < sortedLevels.length - 1) {
                                    nextLevel = sortedLevels[currIdx + 1].name
                                  }
                                }
                                const className = c?.name || s?.className
                                const studentName = s ? `${s.firstName} ${s.lastName}` : '(Nom de l\'élève)'
                                const selectedYear = (yearId ? years.find(y => y._id === yearId) : null)
                                  || (activeYearId ? years.find(y => y._id === activeYearId) : null)
                                  || years.find(y => y.active)
                                const m = selectedYear?.name?.match(/(\d{4})/)
                                if (!m) return null
                                const startYear = parseInt(m[1], 10)
                                const currentYearStr = `${startYear}/${startYear + 1}`
                                const nextStart = startYear + 1
                                const nextYearStr = `${nextStart}/${nextStart + 1}`
                                const yearStr = `Next Year ${nextYearStr}`

                                if (!b.props.field) {
                                  return (
                                    <>
                                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                                        {nextLevel ? `Passage en ${nextLevel}` : '(Passage)'}
                                      </div>
                                      <div>{studentName}</div>
                                      <div style={{ fontSize: '0.9em', opacity: 0.7 }}>{yearStr}</div>
                                    </>
                                  )
                                }

                                if (b.props.field === 'level') {
                                  return <div style={{ fontWeight: 'bold' }}>{nextLevel ? `Passage en ${nextLevel}` : '(Passage)'}</div>
                                }
                                if (b.props.field === 'student') return <div>{studentName}</div>
                                if (b.props.field === 'studentFirstName') return <div>{s ? s.firstName : '(Prénom)'}</div>
                                if (b.props.field === 'studentLastName') return <div>{s ? s.lastName : '(Nom de famille)'}</div>
                                if (b.props.field === 'year') return <div>{yearStr}</div>
                                if (b.props.field === 'currentYear') return <div>{currentYearStr}</div>
                                if (b.props.field === 'class') return <div>{className || (studentId ? '' : '(Classe)')}</div>
                                if (b.props.field === 'currentLevel') return <div>{currentLevel || '(Niveau)'}</div>

                                return <div>Variable inconnue: {b.props.field}</div>
                              })()}
                            </div>
                          )}
                          {b.type === 'teacher_text' && (
                            <div style={{
                              width: b.props.width || 300,
                              height: b.props.height || 60,
                              border: '1px dashed #e17055',
                              background: '#fff5f5',
                              padding: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: b.props.fontSize || 12,
                              color: b.props.color || '#2d3436',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 'bold', color: '#e17055', marginBottom: 4 }}>
                                📝 Zone Texte Prof Polyvalent
                              </div>
                              <div style={{ fontSize: b.props.fontSize || 12, color: '#666', fontStyle: 'italic' }}>
                                {b.props.placeholder || 'Texte éditable par le prof polyvalent...'}
                              </div>
                            </div>
                          )}
                          {b.type === 'dropdown' && (
                            <div style={{ width: b.props.width || 200, position: 'relative' }}>
                              <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>Dropdown #{b.props.dropdownNumber || '?'}</div>
                              {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                              <div
                                style={{
                                  width: '100%',
                                  minHeight: b.props.height || 32,
                                  fontSize: b.props.fontSize || 12,
                                  color: b.props.color || '#333',
                                  padding: '4px 24px 4px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #ccc',
                                  background: '#fff',
                                  cursor: 'pointer',
                                  position: 'relative',
                                  display: 'flex',
                                  alignItems: 'center',
                                  wordWrap: 'break-word',
                                  whiteSpace: 'pre-wrap'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const key = `dropdown_${selectedPage}_${idx}`
                                  setOpenDropdown(openDropdown === key ? null : key)
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {(() => {
                                  const currentValue = b.props.dropdownNumber
                                    ? previewData[`dropdown_${b.props.dropdownNumber}`]
                                    : b.props.variableName ? previewData[b.props.variableName] : ''
                                  return currentValue || 'Sélectionner...'
                                })()}
                                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</div>
                              </div>
                              {openDropdown === `dropdown_${selectedPage}_${idx}` && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    maxHeight: 300,
                                    overflowY: 'auto',
                                    background: '#fff',
                                    border: '1px solid #ccc',
                                    borderRadius: 4,
                                    marginTop: 2,
                                    zIndex: 9999,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: b.props.fontSize || 12, color: '#999', borderBottom: '1px solid #eee' }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (b.props.variableName) {
                                        setPreviewData({ ...previewData, [b.props.variableName]: '' })
                                      }
                                      if (b.props.dropdownNumber) {
                                        setPreviewData({ ...previewData, [`dropdown_${b.props.dropdownNumber}`]: '' })
                                      }
                                      setOpenDropdown(null)
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                  >
                                    Sélectionner...
                                  </div>
                                  {(b.props.options || []).map((opt: string, i: number) => (
                                    <div
                                      key={i}
                                      style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: b.props.fontSize || 12,
                                        wordWrap: 'break-word',
                                        whiteSpace: 'pre-wrap',
                                        borderBottom: i < (b.props.options || []).length - 1 ? '1px solid #eee' : 'none'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (b.props.variableName) {
                                          setPreviewData({ ...previewData, [b.props.variableName]: opt })
                                        }
                                        if (b.props.dropdownNumber) {
                                          setPreviewData({ ...previewData, [`dropdown_${b.props.dropdownNumber}`]: opt })
                                        }
                                        setOpenDropdown(null)
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#e8ecf8'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                    >
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {b.type === 'dropdown_reference' && (
                            <div style={{
                              width: b.props.width || 200,
                              minHeight: b.props.height || 'auto',
                              color: b.props.color || '#2d3436',
                              fontSize: b.props.fontSize || 12,
                              padding: '8px',
                              background: '#f0f4ff',
                              border: '1px dashed #6c5ce7',
                              borderRadius: 4,
                              wordWrap: 'break-word',
                              whiteSpace: 'pre-wrap',
                              overflow: 'hidden'
                            }}>
                              {(() => {
                                const dropdownNum = b.props.dropdownNumber || 1
                                const value = previewData[`dropdown_${dropdownNum}`] || ''
                                const displayText = value || `[Dropdown #${dropdownNum}]`
                                return displayText
                              })()}
                            </div>
                          )}
                          {b.type === 'table' && (
                            (() => {
                              const parseNum = (v: any) => {
                                const n = typeof v === 'number' ? v : parseFloat(String(v || '0'))
                                return isNaN(n) ? 0 : n
                              }
                              const cols: number[] = (b.props.columnWidths || []).map(parseNum)
                              const rows: number[] = (b.props.rowHeights || []).map(parseNum)
                              const cells: any[][] = b.props.cells || []
                              const gapCol = parseNum(b.props.colGap)
                              const gapRow = parseNum(b.props.rowGap)
                              const expandedRows = b.props.expandedRows || false
                              const expandedRowHeight = parseNum(b.props.expandedRowHeight || 34)
                              const expandedDividerWidth = parseNum(b.props.expandedDividerWidth || 0.5)
                              const expandedDividerColor = b.props.expandedDividerColor || DEFAULT_DIVIDER_COLOR
                              const expandedPadding = 4
                              const expandedTopGap = 6
                              const expandedLanguages = b.props.expandedLanguages || [
                                { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                { code: 'en', label: 'English', emoji: '🇬🇧', active: false },
                                { code: 'ar', label: 'Lebanese', emoji: '🇱🇧', active: false }
                              ]

                              let width = 0
                              const colOffsets: number[] = [0]
                              for (let i = 0; i < cols.length; i++) {
                                width += (cols[i] || 0)
                                colOffsets[i + 1] = width
                                width += gapCol
                              }
                              if (cols.length > 0) width -= gapCol

                              let height = 0
                              const rowOffsets: number[] = [0]
                              for (let i = 0; i < rows.length; i++) {
                                height += (rows[i] || 0)
                                if (expandedRows) {
                                  height += (expandedRowHeight + expandedPadding + expandedTopGap)
                                }
                                rowOffsets[i + 1] = height
                                height += gapRow
                              }
                              if (rows.length > 0) height -= gapRow

                              return (
                                <div style={{
                                  position: 'relative',
                                  width,
                                  height,
                                  // When expanded, we use flex col to stack row units. When not, we use grid.
                                  display: expandedRows ? 'flex' : 'grid',
                                  flexDirection: 'column',
                                  gap: `${gapRow}px ${gapCol}px`,
                                  gridTemplateColumns: !expandedRows ? cols.map(w => `${Math.max(1, w)}px`).join(' ') : undefined,
                                  gridTemplateRows: !expandedRows ? rows.map(h => `${Math.max(1, h)}px`).join(' ') : undefined,
                                  overflow: 'visible',
                                  background: (gapRow > 0 || gapCol > 0) ? 'transparent' : (b.props.backgroundColor || 'transparent'),
                                  borderRadius: (gapRow > 0 || gapCol > 0) ? 0 : (b.props.borderRadius || 0)
                                }}>
                                  {!expandedRows ? (
                                    /* Standard grid-based rendering when NOT expanded */
                                    cells.flatMap((row, ri) => row.map((cell, ci) => {
                                      const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b

                                      const radius = b.props.borderRadius || 0
                                      const isFirstCol = ci === 0
                                      const isLastCol = ci === cols.length - 1
                                      const isFirstRow = ri === 0
                                      const isLastRow = ri === rows.length - 1
                                      const treatAsCards = gapRow > 0

                                      const style: React.CSSProperties = {
                                        background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                        borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                        borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                        borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                        borderBottom: bb?.width ? `${bb.width}px solid ${bb.color || '#000'}` : 'none',
                                        padding: 15,
                                        boxSizing: 'border-box',
                                        borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                        borderBottomLeftRadius: (isFirstCol && (treatAsCards || isLastRow)) ? radius : 0,
                                        borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                        borderBottomRightRadius: (isLastCol && (treatAsCards || isLastRow)) ? radius : 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        overflow: 'hidden'
                                      }
                                      const isSel = selectedIndex === idx && selectedCell && selectedCell.ri === ri && selectedCell.ci === ci
                                      return (
                                        <div key={`${ri}-${ci}`} style={{ ...style, outline: isSel ? '2px solid #6c5ce7' : 'none' }}
                                          onMouseDown={(ev) => { ev.stopPropagation() }}
                                          onClick={(ev) => { ev.stopPropagation(); setSelectedIndex(idx); setSelectedCell({ ri, ci }) }}
                                        >
                                          {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                        </div>
                                      )
                                    }))
                                  ) : (
                                    /* Flex Column rendering for Expanded Rows */
                                    cells.map((row, ri) => {
                                      const radius = b.props.borderRadius || 0
                                      const isFirstRow = ri === 0
                                      const isLastRow = ri === rows.length - 1
                                      const treatAsCards = gapRow > 0
                                      const rowBgColor = row[0]?.fill || b.props.backgroundColor || '#f8f9fa'
                                      const mainRowHeight = rows[ri] || 40

                                      return (
                                        <div key={`row-unit-${ri}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width, boxSizing: 'border-box' }}>

                                          {/* Main Row Grid */}
                                          <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: cols.map(w => `${Math.max(1, w)}px`).join(' '),
                                            columnGap: gapCol,
                                            height: mainRowHeight,
                                            width: '100%',
                                            boxSizing: 'border-box'
                                          }}>
                                            {row.map((cell, ci) => {
                                              const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b
                                              const isFirstCol = ci === 0
                                              const isLastCol = ci === cols.length - 1

                                              const style: React.CSSProperties = {
                                                background: cell?.fill || ((treatAsCards && b.props.backgroundColor) ? b.props.backgroundColor : 'transparent'),
                                                borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                                                borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                                                borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                                                // When expanded, bottom border is usually handled by the expanded div bottom, 
                                                // but if you want main row to have border it's fine. 
                                                // Usually we remove it to merge with expansion.
                                                borderBottom: 'none',
                                                padding: 15,
                                                boxSizing: 'border-box',
                                                borderTopLeftRadius: (isFirstCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                borderTopRightRadius: (isLastCol && (treatAsCards || isFirstRow)) ? radius : 0,
                                                borderBottomLeftRadius: 0,
                                                borderBottomRightRadius: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                overflow: 'hidden'
                                              }
                                              const isSel = selectedIndex === idx && selectedCell && selectedCell.ri === ri && selectedCell.ci === ci
                                              return (
                                                <div key={`cell-${ri}-${ci}`} style={{ ...style, outline: isSel ? '2px solid #6c5ce7' : 'none' }}
                                                  onMouseDown={(ev) => { ev.stopPropagation() }}
                                                  onClick={(ev) => { ev.stopPropagation(); setSelectedIndex(idx); setSelectedCell({ ri, ci }) }}
                                                >
                                                  {cell?.text && <div style={{ fontSize: cell.fontSize || 12, color: cell.color || '#000', whiteSpace: 'pre-wrap' }}>{cell.text}</div>}
                                                </div>
                                              )
                                            })}
                                          </div>

                                          {/* Expanded Row Section */}
                                          <div style={{
                                            background: rowBgColor,
                                            borderBottomLeftRadius: (treatAsCards || isLastRow) ? radius : 0,
                                            borderBottomRightRadius: (treatAsCards || isLastRow) ? radius : 0,
                                            height: expandedRowHeight,
                                            position: 'relative',
                                            paddingBottom: expandedPadding,
                                            width: '100%',
                                            boxSizing: 'border-box'
                                          }}>
                                            {/* Divider Line */}
                                            <div style={{
                                              position: 'absolute', top: 0, left: 0, right: 0,
                                              height: expandedDividerWidth,
                                              background: expandedDividerColor,
                                              margin: '0 15px'
                                            }} />

                                            {/* Language Toggles */}
                                            <div style={{
                                              height: '100%',
                                              display: 'flex',
                                              alignItems: 'flex-start',
                                              paddingLeft: 15,
                                              paddingTop: expandedTopGap,
                                              gap: 8
                                            }}>
                                              {(() => {
                                                const rowLangs = b.props.rowLanguages?.[ri] || expandedLanguages
                                                const toggleStyle = b.props.expandedToggleStyle || 'v2'

                                                return rowLangs.map((lang: any, li: number) => {
                                                  const size = Math.max(12, Math.min(expandedRowHeight - 12, 20))
                                                  const isActive = lang.active

                                                  const onToggle = (ev: any) => {
                                                    ev.stopPropagation()
                                                    const pages = [...tpl.pages]
                                                    const page = { ...pages[selectedPage] }
                                                    const blocks = [...page.blocks]
                                                    const block = { ...blocks[idx] }
                                                    const props = { ...block.props }

                                                    const isCustom = props.rowLanguages && props.rowLanguages[ri]
                                                    if (isCustom) {
                                                      const rl = [...(props.rowLanguages || [])]
                                                      const rowL = [...(rl[ri] || [])]
                                                      rowL[li] = { ...rowL[li], active: !isActive }
                                                      rl[ri] = rowL
                                                      props.rowLanguages = rl
                                                    } else {
                                                      const el = [...(props.expandedLanguages || [
                                                        { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                                        { code: 'en', label: 'English', emoji: '🇬🇧', active: false },
                                                        { code: 'ar', label: 'Lebanese', emoji: '🇱🇧', active: false }
                                                      ])]
                                                      el[li] = { ...el[li], active: !isActive }
                                                      props.expandedLanguages = el
                                                    }

                                                    block.props = props
                                                    blocks[idx] = block
                                                    page.blocks = blocks
                                                    pages[selectedPage] = page
                                                    setTpl({ ...tpl, pages })
                                                  }

                                                  if (toggleStyle === 'v1') {
                                                    const logo = lang.logo || (() => {
                                                      const c = (lang.code || '').toLowerCase()
                                                      if (c === 'en' || c === 'uk' || c === 'gb') return 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg'
                                                      if (c === 'fr') return 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg'
                                                      if (c === 'ar' || c === 'lb') return 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg'
                                                      return ''
                                                    })()

                                                    return (
                                                      <div key={li} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', position: 'relative', cursor: 'pointer', boxShadow: isActive ? '0 0 0 2px #6c5ce7' : 'none', opacity: isActive ? 1 : 0.6 }}
                                                        onClick={onToggle}
                                                        onMouseDown={(ev) => ev.stopPropagation()}
                                                      >
                                                        {logo ? <img src={logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isActive ? 'brightness(1.1)' : 'brightness(0.6)' }} /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                                      </div>
                                                    )
                                                  }

                                                  const getEmoji = (item: any) => {
                                                    const e = item.emoji
                                                    if (e && e.length >= 2) return e
                                                    const c = (item.code || '').toLowerCase()
                                                    if (c === 'lb' || c === 'ar') return '🇱🇧'
                                                    if (c === 'fr') return '🇫🇷'
                                                    if (c === 'en' || c === 'uk' || c === 'gb') return '🇬🇧'
                                                    return '🏳️'
                                                  }
                                                  const emoji = getEmoji(lang)
                                                  const appleEmojiUrl = `https://emojicdn.elk.sh/${emoji}?style=apple`

                                                  return (
                                                    <div
                                                      key={li}
                                                      title={lang.label}
                                                      style={{
                                                        width: size,
                                                        height: size,
                                                        minWidth: size,
                                                        borderRadius: '50%',
                                                        background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                                                        border: isActive ? '0.5px solid #fff' : '1px solid rgba(0, 0, 0, 0.1)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                                        boxShadow: 'none',
                                                        opacity: isActive ? 1 : 0.6
                                                      }}
                                                      onClick={onToggle}
                                                      onMouseDown={(ev) => ev.stopPropagation()}
                                                    >
                                                      <img src={appleEmojiUrl} style={{ width: size * 0.7, height: size * 0.7, objectFit: 'contain' }} alt="" />
                                                    </div>
                                                  )
                                                })
                                              })()}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}

                                  {/* Resize Handles */}
                                  {cols.map((_, i) => (
                                    <div key={`col-h-${i}`} style={{ position: 'absolute', left: Math.max(0, (colOffsets[i + 1] || 0) - 3), top: 0, width: 6, height, cursor: 'col-resize', zIndex: 10 }}
                                      onMouseDown={(ev) => {
                                        ev.stopPropagation()
                                        const startX = ev.clientX
                                        const start = cols[i] || 0
                                        const onMove = (mv: MouseEvent) => {
                                          const dx = (mv.clientX - startX) / scale
                                          const next = [...cols]
                                          next[i] = Math.max(10, Math.round(start + dx))
                                          updateSelectedTable(p => ({ ...p, columnWidths: next }))
                                        }
                                        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                                        window.addEventListener('mousemove', onMove)
                                        window.addEventListener('mouseup', onUp)
                                      }}
                                    />
                                  ))}
                                  {rows.map((_, i) => (
                                    <div key={`row-h-${i}`} style={{ position: 'absolute', left: 0, top: Math.max(0, (rowOffsets[i + 1] || 0) - 3 - gapRow * (expandedRows ? 0 : 0)), width, height: 6, cursor: 'row-resize', zIndex: 10 }}
                                      onMouseDown={(ev) => {
                                        ev.stopPropagation()
                                        const startY = ev.clientY
                                        const start = rows[i] || 0
                                        const onMove = (mv: MouseEvent) => {
                                          const dy = (mv.clientY - startY) / scale
                                          const next = [...rows]
                                          next[i] = Math.max(10, Math.round(start + dy))
                                          updateSelectedTable(p => ({ ...p, rowHeights: next }))
                                        }
                                        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                                        window.addEventListener('mousemove', onMove)
                                        window.addEventListener('mouseup', onUp)
                                      }}
                                    />
                                  ))}
                                </div>
                              )
                            })()
                          )}
                          {['image', 'text', 'dynamic_text', 'student_info', 'student_photo', 'category_title', 'competency_list', 'signature', 'signature_box', 'signature_date', 'promotion_info', 'teacher_text', 'language_toggle', 'language_toggle_v2', 'gradebook_pocket', 'rect'].includes(b.type) && selectedIndex === idx && selectedPage === pageIndex && (
                            <>
                              {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((dir) => {
                                const style: React.CSSProperties = {
                                  position: 'absolute', width: 10, height: 10, background: '#fff', border: '1px solid #6c5ce7', borderRadius: '50%', zIndex: 10,
                                  cursor: `${dir}-resize`
                                }
                                if (dir.includes('n')) style.top = -5
                                if (dir.includes('s')) style.bottom = -5
                                if (dir.includes('w')) style.left = -5
                                if (dir.includes('e')) style.right = -5
                                if (dir === 'n' || dir === 's') style.left = 'calc(50% - 5px)'
                                if (dir === 'e' || dir === 'w') style.top = 'calc(50% - 5px)'

                                return (
                                  <div key={dir} style={style}
                                    onMouseDown={(ev) => {
                                      ev.stopPropagation()
                                      const startX = ev.clientX
                                      const startY = ev.clientY
                                      const startW = b.props.width || (b.type === 'text' ? 120 : (b.type === 'language_toggle' ? 80 : (b.type === 'language_toggle_v2' ? 300 : 120)))
                                      const startH = b.props.height || (b.type === 'text' ? 60 : (b.type === 'language_toggle' ? 200 : (b.type === 'language_toggle_v2' ? 100 : 120)))
                                      const startXPos = b.props.x || 0
                                      const startYPos = b.props.y || 0

                                      const onMove = (mv: MouseEvent) => {
                                        const dx = mv.clientX - startX
                                        const dy = mv.clientY - startY
                                        let newW = startW
                                        let newH = startH
                                        let newX = startXPos
                                        let newY = startYPos

                                        if (dir.includes('e')) newW = Math.max(20, startW + dx)
                                        if (dir.includes('s')) newH = Math.max(20, startH + dy)
                                        if (dir.includes('w')) {
                                          newW = Math.max(20, startW - dx)
                                          newX = startXPos + (startW - newW)
                                        }
                                        if (dir.includes('n')) {
                                          newH = Math.max(20, startH - dy)
                                          newY = startYPos + (startH - newH)
                                        }

                                        const patch: any = { width: newW, height: newH, x: newX, y: newY }
                                        if (b.type === 'language_toggle') {
                                          const isVertical = (b.props.direction || 'column') === 'column'
                                          patch.radius = isVertical ? newW / 2 : newH / 2
                                        }
                                        updateSelected(patch)
                                      }
                                      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                                      window.addEventListener('mousemove', onMove)
                                      window.addEventListener('mouseup', onUp)
                                    }}
                                  />
                                )
                              })}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Panel - Properties & Pages */}
        <div
          className="template-builder-right-panel"
          style={{
            position: 'sticky',
            top: 24,
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 16,
            padding: '24px 20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            overflowX: 'hidden',
            minWidth: 0
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={rightPanelView === 'properties' ? 'btn' : 'btn secondary'}
              onClick={() => setRightPanelView('properties')}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              ⚙️ Propriétés
            </button>
            <button
              className={rightPanelView === 'slides' ? 'btn' : 'btn secondary'}
              onClick={() => setRightPanelView('slides')}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              📄 Pages
            </button>
          </div>

          {rightPanelView === 'slides' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <h3>Pages ({tpl.pages.length})</h3>
              {tpl.pages.map((page, idx) => (
                <div key={idx} className="card" style={{ padding: 8, background: selectedPage === idx ? '#f0f4ff' : '#fff', border: selectedPage === idx ? '2px solid var(--accent)' : '1px solid #ddd' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }} onClick={() => setSelectedPage(idx)}>{page.title || `Page ${idx + 1}`}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => {
                        if (idx === 0) return
                        const pages = [...tpl.pages]
                        const temp = pages[idx]
                        pages[idx] = pages[idx - 1]
                        pages[idx - 1] = temp
                        setTpl({ ...tpl, pages })
                        setSelectedPage(idx - 1)
                      }} disabled={idx === 0}>↑</button>
                      <button className="btn secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => {
                        if (idx === tpl.pages.length - 1) return
                        const pages = [...tpl.pages]
                        const temp = pages[idx]
                        pages[idx] = pages[idx + 1]
                        pages[idx + 1] = temp
                        setTpl({ ...tpl, pages })
                        setSelectedPage(idx + 1)
                      }} disabled={idx === tpl.pages.length - 1}>↓</button>
                      <button className="btn secondary" style={{ padding: '4px 8px', fontSize: 11, background: '#ef4444', color: '#fff' }} onClick={() => {
                        if (tpl.pages.length <= 1) return
                        if (!confirm(`Supprimer "${page.title || `Page ${idx + 1}`}" ?`)) return
                        const pages = tpl.pages.filter((_, i) => i !== idx)
                        setTpl({ ...tpl, pages })
                        if (selectedPage >= pages.length) setSelectedPage(pages.length - 1)
                      }}>✕</button>
                    </div>
                  </div>
                  <div style={{ width: '100%', aspectRatio: `${pageWidth}/${pageHeight}`, background: page.bgColor || '#fff', border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden', position: 'relative', cursor: 'pointer', transform: 'scale(0.95)' }} onClick={() => setSelectedPage(idx)}>
                    {page.blocks.map((b, bidx) => (
                      <div key={bidx} style={{ position: 'absolute', left: `${((b.props.x || 0) / pageWidth) * 100}%`, top: `${((b.props.y || 0) / pageHeight) * 100}%`, fontSize: 6, opacity: 0.7 }}>
                        {b.type === 'text' && (
                          <div
                            style={{
                              color: b.props.color,
                              fontSize: (b.props.fontSize || 12) * 0.3,
                              fontWeight: b.props.bold ? 700 : 400,
                              textDecoration: b.props.underline ? 'underline' : 'none',
                            }}
                          >
                            {(() => {
                              if (Array.isArray(b.props.runs) && b.props.runs.length) {
                                const full = (b.props.runs as any[]).map(r => String(r?.text || '')).join('')
                                return full.slice(0, 20)
                              }
                              return (b.props.text || '').slice(0, 20)
                            })()}
                          </div>
                        )}
                        {b.type === 'image' && <CroppedImage src={b.props.url} displayWidth={(b.props.width || 120) * 0.3} displayHeight={(b.props.height || 120) * 0.3} cropData={b.props.cropData} borderRadius={2} />}
                        {b.type === 'rect' && <div style={{ width: (b.props.width || 80) * 0.3, height: (b.props.height || 80) * 0.3, background: b.props.color, borderRadius: 2 }} />}
                        {b.type === 'gradebook_pocket' && <div style={{ width: (b.props.width || 120) * 0.3, height: (b.props.width || 120) * 0.33, background: b.props.pocketFillColor || '#3498db', borderRadius: '2px 2px 8px 8px' }} />}
                        {b.type === 'signature_box' && <div style={{ width: (b.props.width || 200) * 0.3, height: (b.props.height || 80) * 0.3, border: 'none', background: '#fff' }} />}
                        {b.type === 'signature_date' && <div style={{ width: (b.props.width || 220) * 0.3, height: (b.props.height || 34) * 0.3, border: '1px dashed #94a3b8', background: '#f8fafc' }} />}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                    <button className="btn secondary" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => {
                      const pages = [...tpl.pages]
                      const newPage = { title: `Page ${pages.length + 1}`, blocks: [] }
                      pages.splice(idx + 1, 0, newPage)
                      setTpl({ ...tpl, pages })
                      setSelectedPage(idx + 1)
                    }}>+ Ajouter après</button>
                  </div>
                  <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={page.excludeFromPdf || false}
                        onChange={(e) => {
                          const pages = [...tpl.pages]
                          pages[idx] = { ...pages[idx], excludeFromPdf: e.target.checked }
                          setTpl({ ...tpl, pages })
                        }}
                      />
                      Exclure du PDF
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'contents' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2d3436' }}>
                  {(selectedIndices.length > 1) ? `${selectedIndices.length} blocs sélectionnés` : 'Propriétés du bloc'}
                </h3>
                {(selectedIndices.length > 0 || selectedIndex !== null) && (
                  <button
                    className="btn secondary"
                    style={{ padding: '6px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      if (!confirm('Supprimer la sélection ?')) return
                      const pages = [...tpl.pages]
                      const page = { ...pages[selectedPage] }
                      const indicesToDelete = new Set(selectedIndices)
                      if (selectedIndex !== null) indicesToDelete.add(selectedIndex)

                      const blocks = page.blocks.filter((_, idx) => !indicesToDelete.has(idx))
                      pages[selectedPage] = { ...page, blocks }
                      updateTpl({ ...tpl, pages })
                      setSelectedIndex(null)
                      setSelectedIndices([])
                    }}
                    title="Supprimer la sélection"
                  >
                    <span>🗑️</span> Supprimer
                  </button>
                )}
              </div>

              {/* Multi-selection alignment tools */}
              {selectedIndices.length > 1 && (
                <div style={{ marginBottom: 16, padding: 12, background: '#f0f4ff', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 10, textTransform: 'uppercase' }}>
                    Alignement (sur le 1er sélectionné)
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {/* Align Left to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Aligner à gauche sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refX = blocks[selectedIndices[0]].props.x || 0
                        selectedIndices.forEach(i => {
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: refX } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >⬅️ Gauche</button>

                    {/* Align Center Horizontal to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Centrer horizontalement sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refBlock = blocks[selectedIndices[0]]
                        const refCenterX = (refBlock.props.x || 0) + (refBlock.props.width || 100) / 2
                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          const w = b.props.width || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: refCenterX - w / 2 } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >↔️ Centre H</button>

                    {/* Align Right to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Aligner à droite sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refBlock = blocks[selectedIndices[0]]
                        const refRight = (refBlock.props.x || 0) + (refBlock.props.width || 100)
                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          const w = b.props.width || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: refRight - w } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >➡️ Droite</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {/* Align Top to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Aligner en haut sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refY = blocks[selectedIndices[0]].props.y || 0
                        selectedIndices.forEach(i => {
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, y: refY } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >⬆️ Haut</button>

                    {/* Align Center Vertical to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Centrer verticalement sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refBlock = blocks[selectedIndices[0]]
                        const refCenterY = (refBlock.props.y || 0) + (refBlock.props.height || 100) / 2
                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          const h = b.props.height || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, y: refCenterY - h / 2 } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >↕️ Centre V</button>

                    {/* Align Bottom to First */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Aligner en bas sur le premier"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]
                        const refBlock = blocks[selectedIndices[0]]
                        const refBottom = (refBlock.props.y || 0) + (refBlock.props.height || 100)
                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          const h = b.props.height || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, y: refBottom - h } }
                        })
                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >⬇️ Bas</button>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 10, marginTop: 12, textTransform: 'uppercase' }}>
                    Distribution
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/* Distribute Horizontally */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Distribuer horizontalement"
                      disabled={selectedIndices.length < 3}
                      onClick={() => {
                        if (selectedIndices.length < 3) return
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]

                        // Sort by x position
                        const sorted = [...selectedIndices].sort((a, b) => (blocks[a].props.x || 0) - (blocks[b].props.x || 0))
                        const first = blocks[sorted[0]]
                        const last = blocks[sorted[sorted.length - 1]]
                        const startX = first.props.x || 0
                        const endX = (last.props.x || 0) + (last.props.width || 100)
                        const totalWidth = sorted.reduce((sum, i) => sum + (blocks[i].props.width || 100), 0)
                        const gap = (endX - startX - totalWidth) / (sorted.length - 1)

                        let currentX = startX
                        sorted.forEach(i => {
                          const w = blocks[i].props.width || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: currentX } }
                          currentX += w + gap
                        })

                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >↔️ Espacer H</button>

                    {/* Distribute Vertically */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Distribuer verticalement"
                      disabled={selectedIndices.length < 3}
                      onClick={() => {
                        if (selectedIndices.length < 3) return
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]

                        // Sort by y position
                        const sorted = [...selectedIndices].sort((a, b) => (blocks[a].props.y || 0) - (blocks[b].props.y || 0))
                        const first = blocks[sorted[0]]
                        const last = blocks[sorted[sorted.length - 1]]
                        const startY = first.props.y || 0
                        const endY = (last.props.y || 0) + (last.props.height || 100)
                        const totalHeight = sorted.reduce((sum, i) => sum + (blocks[i].props.height || 100), 0)
                        const gap = (endY - startY - totalHeight) / (sorted.length - 1)

                        let currentY = startY
                        sorted.forEach(i => {
                          const h = blocks[i].props.height || 100
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, y: currentY } }
                          currentY += h + gap
                        })

                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >↕️ Espacer V</button>

                    {/* Center on Page */}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      title="Centrer sur la page"
                      onClick={() => {
                        const pages = [...tpl.pages]
                        const page = { ...pages[selectedPage] }
                        const blocks = [...page.blocks]

                        // Calculate bounding box of selection
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          const x = b.props.x || 0
                          const y = b.props.y || 0
                          const w = b.props.width || 100
                          const h = b.props.height || 100
                          minX = Math.min(minX, x)
                          minY = Math.min(minY, y)
                          maxX = Math.max(maxX, x + w)
                          maxY = Math.max(maxY, y + h)
                        })

                        const selectionW = maxX - minX
                        const selectionH = maxY - minY
                        const offsetX = (pageWidth - selectionW) / 2 - minX
                        const offsetY = (pageHeight - selectionH) / 2 - minY

                        selectedIndices.forEach(i => {
                          const b = blocks[i]
                          blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: (b.props.x || 0) + offsetX, y: (b.props.y || 0) + offsetY } }
                        })

                        pages[selectedPage] = { ...page, blocks }
                        updateTpl({ ...tpl, pages })
                      }}
                    >🎯 Centrer Page</button>
                  </div>
                </div>
              )}
              {selectedIndex != null && tpl.pages[selectedPage]?.blocks[selectedIndex] ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{
                    padding: '10px 14px',
                    background: '#f0f4ff',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#667eea',
                    textAlign: 'center'
                  }}>
                    {tpl.pages[selectedPage].blocks[selectedIndex].type.toUpperCase()}
                  </div>

                  {/* Position Section */}
                  <div style={{
                    padding: '14px',
                    background: '#f8f9fa',
                    borderRadius: 10,
                    marginBottom: 8
                  }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6c757d',
                      marginBottom: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Position
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>X</label>
                        <input
                          type="number"
                          value={tpl.pages[selectedPage].blocks[selectedIndex].props.x || 0}
                          onChange={e => updateSelected({ x: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '2px solid #e9ecef',
                            fontSize: 13
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Y</label>
                        <input
                          type="number"
                          value={tpl.pages[selectedPage].blocks[selectedIndex].props.y || 0}
                          onChange={e => updateSelected({ y: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '2px solid #e9ecef',
                            fontSize: 13
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Z-Index Section */}
                  <div style={{
                    padding: '14px',
                    background: '#f8f9fa',
                    borderRadius: 10,
                    marginBottom: 8
                  }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6c757d',
                      marginBottom: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Ordre d'affichage
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        placeholder="Z-index"
                        type="number"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.z ?? selectedIndex}
                        onChange={e => updateSelected({ z: Number(e.target.value) })}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '2px solid #e9ecef',
                          fontSize: 13
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          const zs = tpl.pages[selectedPage].blocks.map(b => (b.props?.z ?? 0))
                          const maxZ = zs.length ? Math.max(...zs) : 0
                          updateSelected({ z: maxZ + 1 })
                        }}
                        style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}
                      >
                        ⬆️ Devant
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          const zs = tpl.pages[selectedPage].blocks.map(b => (b.props?.z ?? 0))
                          const minZ = zs.length ? Math.min(...zs) : 0
                          updateSelected({ z: minZ - 1 })
                        }}
                        style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}
                      >
                        ⬇️ Derrière
                      </button>
                    </div>
                  </div>

                  {/* Style Section */}
                  <div style={{
                    padding: '14px',
                    background: '#f8f9fa',
                    borderRadius: 10,
                    marginBottom: 8
                  }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6c757d',
                      marginBottom: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Style
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Couleur</label>
                      <input
                        type="color"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.color || '#000000'}
                        onChange={e => updateSelected({ color: e.target.value })}
                        style={{
                          width: '100%',
                          height: 40,
                          padding: 4,
                          borderRadius: 6,
                          border: '2px solid #e9ecef',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Taille police</label>
                      <input
                        placeholder="Taille"
                        type="number"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.fontSize || tpl.pages[selectedPage].blocks[selectedIndex].props.size || 12}
                        onChange={e => updateSelected({ fontSize: Number(e.target.value), size: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '2px solid #e9ecef',
                          fontSize: 13
                        }}
                      />
                    </div>
                    {tpl.pages[selectedPage].blocks[selectedIndex].type === 'text' && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 6, fontWeight: 600 }}>Texte</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <button
                            className="btn secondary"
                            style={{
                              padding: '8px 10px',
                              fontSize: 13,
                              fontWeight: 700,
                              borderRadius: 6,
                              border: '2px solid #e9ecef',
                              background: tpl.pages[selectedPage].blocks[selectedIndex].props.bold ? '#667eea' : '#fff',
                              color: tpl.pages[selectedPage].blocks[selectedIndex].props.bold ? '#fff' : '#2d3436'
                            }}
                            onClick={() => updateSelected({ bold: !tpl.pages[selectedPage].blocks[selectedIndex].props.bold })}
                          >
                            Bold
                          </button>
                          <button
                            className="btn secondary"
                            style={{
                              padding: '8px 10px',
                              fontSize: 13,
                              fontWeight: 700,
                              borderRadius: 6,
                              border: '2px solid #e9ecef',
                              background: tpl.pages[selectedPage].blocks[selectedIndex].props.underline ? '#667eea' : '#fff',
                              color: tpl.pages[selectedPage].blocks[selectedIndex].props.underline ? '#fff' : '#2d3436',
                              textDecoration: 'underline'
                            }}
                            onClick={() => updateSelected({ underline: !tpl.pages[selectedPage].blocks[selectedIndex].props.underline })}
                          >
                            Underline
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Type-specific properties */}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'text' && (
                    <div style={{
                      padding: '14px',
                      background: '#f8f9fa',
                      borderRadius: 10,
                      marginBottom: 8
                    }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 8, fontWeight: 600 }}>CONTENU</label>
                      <textarea
                        placeholder="Texte"
                        rows={4}
                        value={(() => {
                          const b = tpl.pages[selectedPage].blocks[selectedIndex]
                          if (Array.isArray(b.props.runs) && b.props.runs.length) {
                            return (b.props.runs as any[]).map(r => String(r?.text || '')).join('')
                          }
                          return b.props.text || ''
                        })()}
                        onChange={e => updateSelected({ text: e.target.value, runs: null })}
                        onSelect={(e) => {
                          const start = Number((e.currentTarget as any).selectionStart ?? 0)
                          const end = Number((e.currentTarget as any).selectionEnd ?? 0)
                          if (start === end) setTextSelection(null)
                          else setTextSelection({ start, end })
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '2px solid #e9ecef',
                          fontSize: 13,
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                      {(() => {
                        const b = tpl.pages[selectedPage].blocks[selectedIndex]
                        const selection = textSelection
                        if (!selection || b.type !== 'text') return null
                        const baseBold = !!b.props.bold
                        const baseUnderline = !!b.props.underline
                        const runs = normalizeTextRuns(b.props)
                        const s = getSelectionEffectiveAll(runs, selection.start, selection.end, { bold: baseBold, underline: baseUnderline })
                        if (!s.any) return null

                        return (
                          <div style={{ marginTop: 10 }}>
                            <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 6, fontWeight: 600 }}>
                              Sélection ({Math.max(0, selection.end - selection.start)} caractères)
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                              <button
                                className="btn secondary"
                                style={{
                                  padding: '8px 10px',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  border: '2px solid #e9ecef',
                                  background: s.allBold ? '#667eea' : '#fff',
                                  color: s.allBold ? '#fff' : '#2d3436'
                                }}
                                onClick={() => {
                                  const nextBold = !s.allBold
                                  const out = applyStyleToSelection(b.props, selection, { bold: nextBold })
                                  updateSelected({ text: out.text, runs: out.runs })
                                }}
                              >
                                Bold
                              </button>
                              <button
                                className="btn secondary"
                                style={{
                                  padding: '8px 10px',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  border: '2px solid #e9ecef',
                                  background: s.allUnderline ? '#667eea' : '#fff',
                                  color: s.allUnderline ? '#fff' : '#2d3436',
                                  textDecoration: 'underline'
                                }}
                                onClick={() => {
                                  const nextUnderline = !s.allUnderline
                                  const out = applyStyleToSelection(b.props, selection, { underline: nextUnderline })
                                  updateSelected({ text: out.text, runs: out.runs })
                                }}
                              >
                                Underline
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                              <input
                                type="color"
                                value={String(b.props.color || '#000000')}
                                onChange={(ev) => {
                                  const out = applyStyleToSelection(b.props, selection, { color: ev.target.value })
                                  updateSelected({ text: out.text, runs: out.runs })
                                }}
                                style={{
                                  width: '100%',
                                  height: 38,
                                  padding: 4,
                                  borderRadius: 6,
                                  border: '2px solid #e9ecef',
                                  cursor: 'pointer'
                                }}
                              />
                              <button
                                className="btn secondary"
                                style={{ padding: '8px 10px', fontSize: 12 }}
                                onClick={() => setTextSelection(null)}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'image' && (
                    <>
                      <div style={{
                        padding: '14px',
                        background: '#f8f9fa',
                        borderRadius: 10,
                        marginBottom: 8
                      }}>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 8, fontWeight: 600 }}>URL IMAGE</label>
                        <input
                          placeholder="URL image"
                          value={tpl.pages[selectedPage].blocks[selectedIndex].props.url || ''}
                          onChange={e => updateSelected({ url: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '2px solid #e9ecef',
                            fontSize: 13,
                            marginBottom: 8
                          }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Largeur</label>
                            <input
                              type="number"
                              value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 120}
                              onChange={e => updateSelected({ width: Number(e.target.value) })}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: '2px solid #e9ecef',
                                fontSize: 13
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Hauteur</label>
                            <input
                              type="number"
                              value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 120}
                              onChange={e => updateSelected({ height: Number(e.target.value) })}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: '2px solid #e9ecef',
                                fontSize: 13
                              }}
                            />
                          </div>
                        </div>
                        <label
                          style={{
                            display: 'block',
                            padding: '10px 14px',
                            background: '#667eea',
                            color: '#fff',
                            borderRadius: 6,
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 600
                          }}
                        >
                          📁 Télécharger une image
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={async e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              const fd = new FormData()
                              fd.append('file', f)
                              const r = await fetch('/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
                              const data = await r.json()
                              if (data?.url) { updateSelected({ url: data.url }); await refreshGallery() }
                            }}
                          />
                        </label>
                        {tpl.pages[selectedPage].blocks[selectedIndex].props.url && (
                          <button
                            onClick={() => setCropModeBlockId(tpl.pages[selectedPage].blocks[selectedIndex].props.blockId || null)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '10px 14px',
                              background: cropModeBlockId === tpl.pages[selectedPage].blocks[selectedIndex].props.blockId ? '#dc3545' : '#28a745',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              textAlign: 'center',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              marginTop: 8
                            }}
                          >
                            {cropModeBlockId === tpl.pages[selectedPage].blocks[selectedIndex].props.blockId ? '✕ Annuler le recadrage' : '✂️ Recadrer l\'image'}
                          </button>
                        )}
                        {tpl.pages[selectedPage].blocks[selectedIndex].props.cropData && (
                          <button
                            onClick={() => updateSelected({ cropData: undefined })}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 14px',
                              background: '#dc3545',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              textAlign: 'center',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 500,
                              marginTop: 4
                            }}
                          >
                            ✕ Supprimer le recadrage
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {gallery.filter(u => u.type === 'file').map(u => (
                          <div key={u.path} className="card" style={{ padding: 4, cursor: 'pointer' }} onClick={() => updateSelected({ url: `/uploads${u.path}` })}>
                            <img src={`/uploads${u.path}`} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                            <div className="note" style={{ fontSize: 10, marginTop: 4 }}>{u.name}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'table' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                        <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 8, textTransform: 'uppercase' }}>
                            Designs (Table Expand)
                          </div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div>
                              <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Design sauvegardé</label>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <select
                                  value={selectedExpandedTableDesignId}
                                  onChange={e => setSelectedExpandedTableDesignId(e.target.value)}
                                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                >
                                  <option value="">—</option>
                                  {expandedTableDesignPresets.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <button
                                  className="btn secondary"
                                  disabled={!selectedExpandedTableDesignId}
                                  style={{ fontSize: 12, padding: '8px 10px' }}
                                  onClick={() => {
                                    const preset = expandedTableDesignPresets.find(p => p.id === selectedExpandedTableDesignId)
                                    if (preset) applyExpandedTableDesignToSelectedTable(preset.style)
                                  }}
                                >
                                  Appliquer
                                </button>
                              </div>
                            </div>

                            <div>
                              <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Sauvegarder le design actuel</label>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                  value={newExpandedTableDesignName}
                                  onChange={e => setNewExpandedTableDesignName(e.target.value)}
                                  placeholder="Nom du design"
                                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                />
                                <button
                                  className="btn secondary"
                                  disabled={!newExpandedTableDesignName.trim()}
                                  style={{ fontSize: 12, padding: '8px 10px' }}
                                  onClick={saveCurrentExpandedTableDesign}
                                >
                                  Sauvegarder
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 8, textTransform: 'uppercase' }}>
                          Style Global
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Taille Police</label>
                            <input
                              type="number"
                              placeholder="Ex: 12"
                              onChange={(e) => {
                                const newSize = Number(e.target.value);
                                if (newSize > 0) {
                                  updateSelectedTable(p => ({
                                    ...p,
                                    cells: (p.cells || []).map((row: any[]) =>
                                      row.map((cell: any) => ({ ...cell, fontSize: newSize }))
                                    )
                                  }))
                                }
                              }}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Couleur</label>
                            <input
                              type="color"
                              onChange={(e) => {
                                updateSelectedTable(p => ({
                                  ...p,
                                  cells: (p.cells || []).map((row: any[]) =>
                                    row.map((cell: any) => ({ ...cell, color: e.target.value }))
                                  )
                                }))
                              }}
                              style={{ width: '100%', height: 38, padding: 4, borderRadius: 6, border: '2px solid #e9ecef', cursor: 'pointer' }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Rayon (px)</label>
                            <input
                              type="number"
                              value={tpl.pages[selectedPage].blocks[selectedIndex].props.borderRadius || 0}
                              onChange={e => updateSelectedTable(p => ({ ...p, borderRadius: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Esp. Lignes</label>
                            <input
                              type="number"
                              value={tpl.pages[selectedPage].blocks[selectedIndex].props.rowGap || 0}
                              onChange={e => updateSelectedTable(p => ({ ...p, rowGap: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Esp. Cols</label>
                            <input
                              type="number"
                              value={tpl.pages[selectedPage].blocks[selectedIndex].props.colGap || 0}
                              onChange={e => updateSelectedTable(p => ({ ...p, colGap: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                            />
                          </div>
                        </div>

                        {/* Expand Table Section */}
                        <div style={{ marginTop: 12, borderTop: '1px solid #e9ecef', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 8, textTransform: 'uppercase' }}>
                            Expansion des Lignes
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                            <input
                              type="checkbox"
                              checked={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows || false}
                              onChange={e => {
                                const isExpanding = e.target.checked
                                const tableBlock = tpl.pages[selectedPage].blocks[selectedIndex]
                                const tableX = tableBlock.props.x || 0
                                const tableY = tableBlock.props.y || 0

                                if (isExpanding) {
                                  const wantTitle = tableBlock.props.showExpandedTitle !== false

                                  if (!wantTitle) {
                                    updateSelectedTable(p => ({ ...p, expandedRows: true }))
                                    return
                                  }

                                  const tableBlockId = tableBlock.props.blockId
                                  if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                    const linkedTitle = tpl.pages[selectedPage].blocks.find(
                                      b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId
                                    )
                                    if (linkedTitle && typeof linkedTitle.props?.blockId === 'string' && linkedTitle.props.blockId.trim()) {
                                      updateSelectedTable(p => ({
                                        ...p,
                                        expandedRows: true,
                                        showExpandedTitle: true,
                                        titleBlockId: linkedTitle.props.blockId
                                      }))
                                      return
                                    }
                                  }

                                  // Check if title block already exists
                                  if (tableBlock.props.titleBlockId) {
                                    const existingTitle = tpl.pages[selectedPage].blocks.find(b => b.props.blockId === tableBlock.props.titleBlockId)
                                    if (existingTitle) {
                                      // Title already exists, just enable expandedRows
                                      updateSelectedTable(p => ({ ...p, expandedRows: true }))
                                      return
                                    }
                                  }

                                  const titleOffsetX = Number(tableBlock.props.titleOffsetX || 0)
                                  const titleOffsetY = Number(tableBlock.props.titleOffsetY || -265)
                                  const blockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)
                                  const titleBlock: Block = {
                                    type: 'gradebook_pocket',
                                    props: {
                                      x: tableX + titleOffsetX,
                                      y: Math.max(0, tableY + titleOffsetY),
                                      z: (tableBlock.props.z || 0) + 1,
                                      blockId,
                                      width: 90,
                                      number: String(tableBlock.props.expandedTitleText || 'A'),
                                      fontSize: 18,
                                      linkedTableBlockId: tableBlock.props.blockId
                                    }
                                  }

                                  const pages = [...tpl.pages]
                                  const page = { ...pages[selectedPage] }
                                  const blocks = [...page.blocks]

                                  // Update table with expandedRows and link to title
                                  blocks[selectedIndex] = {
                                    ...blocks[selectedIndex],
                                    props: { ...blocks[selectedIndex].props, expandedRows: true, titleBlockId: blockId, titleOffsetX, titleOffsetY, showExpandedTitle: true }
                                  }

                                  // Add the title block
                                  blocks.push(titleBlock)

                                  pages[selectedPage] = { ...page, blocks }
                                  updateTpl({ ...tpl, pages })
                                } else {
                                  // Remove the linked title block if it exists
                                  const titleBlockId = tableBlock.props.titleBlockId
                                  const tableBlockId = tableBlock.props.blockId
                                  const pages = [...tpl.pages]
                                  const page = { ...pages[selectedPage] }
                                  let blocks = [...page.blocks]

                                  // Update table to remove expandedRows
                                  blocks[selectedIndex] = {
                                    ...blocks[selectedIndex],
                                    props: { ...blocks[selectedIndex].props, expandedRows: false, titleBlockId: undefined }
                                  }

                                  // Remove the title block if it exists
                                  if (titleBlockId) {
                                    blocks = blocks.filter(b => b.props.blockId !== titleBlockId)
                                  }
                                  if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                    blocks = blocks.filter(b => !(b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId))
                                  }

                                  pages[selectedPage] = { ...page, blocks }
                                  updateTpl({ ...tpl, pages })

                                  // Adjust selectedIndex if needed (if title was after table)
                                  const newSelectedIndex = blocks.findIndex(b => b.props.blockId === tableBlock.props.blockId)
                                  if (newSelectedIndex !== selectedIndex) {
                                    setSelectedIndex(newSelectedIndex)
                                  }
                                }
                              }}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Activer l'expansion des lignes</span>
                          </label>
                          {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                            <div style={{ padding: 12, background: '#f0f4ff', borderRadius: 8, marginTop: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={tpl.pages[selectedPage].blocks[selectedIndex].props.showExpandedTitle !== false}
                                  onChange={(e) => {
                                    const want = e.target.checked
                                    const tableBlock = tpl.pages[selectedPage].blocks[selectedIndex]
                                    const tableX = Number(tableBlock.props.x || 0)
                                    const tableY = Number(tableBlock.props.y || 0)
                                    const tableBlockId = tableBlock.props.blockId

                                    const pages = [...tpl.pages]
                                    const page = { ...pages[selectedPage] }
                                    let blocks = [...page.blocks]

                                    const titleBlockId = tableBlock.props.titleBlockId
                                    const titleBlockIdx = titleBlockId ? blocks.findIndex(b => b.props.blockId === titleBlockId) : -1
                                    const existingTitleBlock = titleBlockIdx >= 0 ? blocks[titleBlockIdx] : null
                                    const linkedTitleBlockIdx = !existingTitleBlock && typeof tableBlockId === 'string' && tableBlockId.trim()
                                      ? blocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
                                      : -1
                                    const existingOrLinkedTitleBlock = existingTitleBlock || (linkedTitleBlockIdx >= 0 ? blocks[linkedTitleBlockIdx] : null)

                                    if (!want) {
                                      const nextTitleText = (existingOrLinkedTitleBlock && typeof existingOrLinkedTitleBlock.props?.number === 'string')
                                        ? existingOrLinkedTitleBlock.props.number
                                        : tableBlock.props.expandedTitleText
                                      if (titleBlockId) {
                                        blocks = blocks.filter(b => b.props.blockId !== titleBlockId)
                                      }
                                      if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                        blocks = blocks.filter(b => !(b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId))
                                      }
                                      blocks[selectedIndex] = {
                                        ...blocks[selectedIndex],
                                        props: {
                                          ...blocks[selectedIndex].props,
                                          showExpandedTitle: false,
                                          titleBlockId: undefined,
                                          expandedTitleText: nextTitleText
                                        }
                                      }
                                      pages[selectedPage] = { ...page, blocks }
                                      updateTpl({ ...tpl, pages })
                                      return
                                    }

                                    if (existingOrLinkedTitleBlock) {
                                      blocks[selectedIndex] = {
                                        ...blocks[selectedIndex],
                                        props: {
                                          ...blocks[selectedIndex].props,
                                          showExpandedTitle: true,
                                          titleBlockId: existingOrLinkedTitleBlock.props.blockId
                                        }
                                      }
                                      pages[selectedPage] = { ...page, blocks }
                                      updateTpl({ ...tpl, pages })
                                      return
                                    }

                                    const titleOffsetX = Number(tableBlock.props.titleOffsetX || 0)
                                    const titleOffsetY = Number(tableBlock.props.titleOffsetY || -265)
                                    const nextBlockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)
                                    const titleBlock: Block = {
                                      type: 'gradebook_pocket',
                                      props: {
                                        x: tableX + titleOffsetX,
                                        y: Math.max(0, tableY + titleOffsetY),
                                        z: (tableBlock.props.z || 0) + 1,
                                        blockId: nextBlockId,
                                        width: 90,
                                        number: String(tableBlock.props.expandedTitleText || 'A'),
                                        fontSize: 18,
                                        linkedTableBlockId: tableBlock.props.blockId
                                      }
                                    }

                                    blocks[selectedIndex] = {
                                      ...blocks[selectedIndex],
                                      props: {
                                        ...blocks[selectedIndex].props,
                                        showExpandedTitle: true,
                                        titleBlockId: nextBlockId,
                                        titleOffsetX,
                                        titleOffsetY
                                      }
                                    }
                                    blocks.push(titleBlock)
                                    pages[selectedPage] = { ...page, blocks }
                                    updateTpl({ ...tpl, pages })
                                  }}
                                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: 13, fontWeight: 500 }}>Afficher le titre</span>
                              </label>

                              {(() => {
                                const tableBlock = tpl.pages[selectedPage].blocks[selectedIndex]
                                const tableX = Number(tableBlock.props.x || 0)
                                const tableY = Number(tableBlock.props.y || 0)
                                const tableBlockId = tableBlock.props.blockId
                                const titleBlockId = tableBlock.props.titleBlockId

                                const byId = (typeof titleBlockId === 'string' && titleBlockId.trim())
                                  ? tpl.pages[selectedPage].blocks.find(b => b?.props?.blockId === titleBlockId)
                                  : null
                                const byLink = (!byId && typeof tableBlockId === 'string' && tableBlockId.trim())
                                  ? tpl.pages[selectedPage].blocks.find(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
                                  : null
                                const titleBlock = byId || byLink

                                const titleOffsetX = Number(tableBlock.props.titleOffsetX || 0)
                                const titleOffsetY = Number(tableBlock.props.titleOffsetY || -265)
                                const titleText =
                                  (titleBlock && typeof titleBlock.props?.number === 'string' && titleBlock.props.number.length)
                                    ? titleBlock.props.number
                                    : String(tableBlock.props.expandedTitleText || 'A')

                                const wantTitle = tableBlock.props.showExpandedTitle !== false

                                return (
                                  <div style={{ marginBottom: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#3498db' }}>📝 Texte du Titre</label>
                                    <input
                                      type="text"
                                      value={titleText}
                                      onChange={e => {
                                        const nextTitle = e.target.value
                                        const pages = [...tpl.pages]
                                        const page = { ...pages[selectedPage] }
                                        const blocks = [...page.blocks]
                                        const nextTableBlock = { ...blocks[selectedIndex] }
                                        const nextTableProps = { ...nextTableBlock.props, expandedTitleText: nextTitle }

                                        const resolveTitleIdx = () => {
                                          if (typeof nextTableProps.titleBlockId === 'string' && nextTableProps.titleBlockId.trim()) {
                                            const idx = blocks.findIndex(b => b?.props?.blockId === nextTableProps.titleBlockId)
                                            if (idx >= 0) return idx
                                          }
                                          if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                            const idx = blocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
                                            if (idx >= 0) return idx
                                          }
                                          return -1
                                        }

                                        let titleIdx = wantTitle ? resolveTitleIdx() : -1

                                        if (wantTitle && titleIdx < 0) {
                                          const nextBlockId = (window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11)
                                          const newTitleBlock: Block = {
                                            type: 'gradebook_pocket',
                                            props: {
                                              x: tableX + titleOffsetX,
                                              y: Math.max(0, tableY + titleOffsetY),
                                              z: (nextTableProps.z || 0) + 1,
                                              blockId: nextBlockId,
                                              width: 90,
                                              number: String(nextTitle || 'A'),
                                              fontSize: 18,
                                              linkedTableBlockId: tableBlockId
                                            }
                                          }
                                          blocks.push(newTitleBlock)
                                          nextTableProps.titleBlockId = nextBlockId
                                          titleIdx = blocks.length - 1
                                        }

                                        if (wantTitle && titleIdx >= 0) {
                                          const b = blocks[titleIdx]
                                          blocks[titleIdx] = { ...b, props: { ...b.props, number: nextTitle } }
                                          if (typeof blocks[titleIdx].props?.blockId === 'string' && blocks[titleIdx].props.blockId.trim()) {
                                            nextTableProps.titleBlockId = blocks[titleIdx].props.blockId
                                          }
                                        }

                                        blocks[selectedIndex] = { ...nextTableBlock, props: nextTableProps }
                                        pages[selectedPage] = { ...page, blocks }
                                        updateTpl({ ...tpl, pages })
                                      }}
                                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                      placeholder="A, B, C..."
                                    />

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                                      <div>
                                        <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Décalage X (px)</label>
                                        <input
                                          type="number"
                                          value={titleOffsetX}
                                          onChange={e => {
                                            const nextX = Number(e.target.value)
                                            const pages = [...tpl.pages]
                                            const page = { ...pages[selectedPage] }
                                            const blocks = [...page.blocks]

                                            const nextTable = { ...blocks[selectedIndex] }
                                            const nextTableProps = { ...nextTable.props, titleOffsetX: nextX }
                                            blocks[selectedIndex] = { ...nextTable, props: nextTableProps }

                                            if (wantTitle) {
                                              const resolveTitleIdx = () => {
                                                if (typeof nextTableProps.titleBlockId === 'string' && nextTableProps.titleBlockId.trim()) {
                                                  const idx = blocks.findIndex(b => b?.props?.blockId === nextTableProps.titleBlockId)
                                                  if (idx >= 0) return idx
                                                }
                                                if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                                  const idx = blocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
                                                  if (idx >= 0) return idx
                                                }
                                                return -1
                                              }
                                              const titleIdx = resolveTitleIdx()
                                              if (titleIdx >= 0) {
                                                const tb = blocks[titleIdx]
                                                blocks[titleIdx] = { ...tb, props: { ...tb.props, x: tableX + nextX } }
                                              }
                                            }

                                            pages[selectedPage] = { ...page, blocks }
                                            updateTpl({ ...tpl, pages })
                                          }}
                                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Décalage Y (px)</label>
                                        <input
                                          type="number"
                                          value={titleOffsetY}
                                          onChange={e => {
                                            const nextY = Number(e.target.value)
                                            const pages = [...tpl.pages]
                                            const page = { ...pages[selectedPage] }
                                            const blocks = [...page.blocks]

                                            const nextTable = { ...blocks[selectedIndex] }
                                            const nextTableProps = { ...nextTable.props, titleOffsetY: nextY }
                                            blocks[selectedIndex] = { ...nextTable, props: nextTableProps }

                                            if (wantTitle) {
                                              const resolveTitleIdx = () => {
                                                if (typeof nextTableProps.titleBlockId === 'string' && nextTableProps.titleBlockId.trim()) {
                                                  const idx = blocks.findIndex(b => b?.props?.blockId === nextTableProps.titleBlockId)
                                                  if (idx >= 0) return idx
                                                }
                                                if (typeof tableBlockId === 'string' && tableBlockId.trim()) {
                                                  const idx = blocks.findIndex(b => b?.type === 'gradebook_pocket' && b?.props?.linkedTableBlockId === tableBlockId)
                                                  if (idx >= 0) return idx
                                                }
                                                return -1
                                              }
                                              const titleIdx = resolveTitleIdx()
                                              if (titleIdx >= 0) {
                                                const tb = blocks[titleIdx]
                                                blocks[titleIdx] = { ...tb, props: { ...tb.props, y: Math.max(0, tableY + nextY) } }
                                              }
                                            }

                                            pages[selectedPage] = { ...page, blocks }
                                            updateTpl({ ...tpl, pages })
                                          }}
                                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                              <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 8 }}>
                                💡 Chaque ligne affichera une zone d'expansion avec les toggles de langue (V2) en dessous.
                              </div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div>
                                  <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Hauteur zone expansion</label>
                                  <input
                                    type="number"
                                    value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRowHeight || 34}
                                    onChange={e => updateSelectedTable(p => ({ ...p, expandedRowHeight: Number(e.target.value) }))}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Type de toggles</label>
                                  <select
                                    value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedToggleStyle || 'v2'}
                                    onChange={e => updateSelectedTable(p => ({ ...p, expandedToggleStyle: e.target.value }))}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                  >
                                    <option value="v2">V2 (Emojis)</option>
                                    <option value="v1">V1 (Drapeaux)</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Épaisseur ligne séparatrice</label>
                                  <input
                                    type="number"
                                    value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedDividerWidth || 0.5}
                                    onChange={e => updateSelectedTable(p => ({ ...p, expandedDividerWidth: Number(e.target.value) }))}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Couleur ligne séparatrice</label>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <input
                                      type="color"
                                      value={(() => {
                                        const c = tpl.pages[selectedPage].blocks[selectedIndex].props.expandedDividerColor || ''
                                        // Color picker only supports hex, convert rgba to hex or use white fallback
                                        if (c.startsWith('#') && (c.length === 7 || c.length === 4)) return c
                                        return '#ffffff'
                                      })()}
                                      onChange={e => updateSelectedTable(p => ({ ...p, expandedDividerColor: e.target.value }))}
                                      style={{ height: 38, width: 40, padding: 0, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
                                    />
                                    <input
                                      type="text"
                                      value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedDividerColor || DEFAULT_DIVIDER_COLOR}
                                      onChange={e => updateSelectedTable(p => ({ ...p, expandedDividerColor: e.target.value }))}
                                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                                    />
                                  </div>
                                </div>

                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: 12, borderTop: '1px solid #e9ecef', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 8, textTransform: 'uppercase' }}>Bordures Globales</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div>
                              <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Couleur</label>
                              <input type="color" value={globalBorderColor} onChange={e => setGlobalBorderColor(e.target.value)} style={{ width: '100%', height: 38, padding: 4, borderRadius: 6, border: '2px solid #e9ecef', cursor: 'pointer' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600, color: '#6c757d' }}>Épaisseur</label>
                              <input type="number" value={globalBorderWidth} onChange={e => setGlobalBorderWidth(Number(e.target.value))} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => {
                              updateSelectedTable(p => ({
                                ...p,
                                cells: (p.cells || []).map((row: any[]) =>
                                  row.map((cell: any) => ({
                                    ...cell,
                                    borders: {
                                      l: { color: globalBorderColor, width: globalBorderWidth },
                                      r: { color: globalBorderColor, width: globalBorderWidth },
                                      t: { color: globalBorderColor, width: globalBorderWidth },
                                      b: { color: globalBorderColor, width: globalBorderWidth }
                                    }
                                  }))
                                )
                              }))
                            }}>Appliquer tout</button>
                            <button className="btn secondary" style={{ flex: 1, fontSize: 12, color: '#e53e3e', borderColor: '#fed7d7', background: '#fff5f5' }} onClick={() => {
                              updateSelectedTable(p => ({
                                ...p,
                                cells: (p.cells || []).map((row: any[]) =>
                                  row.map((cell: any) => ({
                                    ...cell,
                                    borders: { l: { width: 0 }, r: { width: 0 }, t: { width: 0 }, b: { width: 0 } }
                                  }))
                                )
                              }))
                            }}>Supprimer tout</button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{
                          padding: '14px',
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          marginBottom: 8
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 10, textTransform: 'uppercase' }}>Colonnes</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(tpl.pages[selectedPage].blocks[selectedIndex].props.columnWidths || []).map((w: number, i: number) => (
                              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 32px', gap: 8, alignItems: 'center' }}>
                                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>#{i + 1}</div>
                                <input
                                  type="number"
                                  value={Math.round(w)}
                                  onChange={e => {
                                    const cols = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.columnWidths || [])]
                                    cols[i] = Number(e.target.value)
                                    updateSelectedTable(p => ({ ...p, columnWidths: cols }))
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #e2e8f0',
                                    fontSize: 13,
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                  }}
                                  onFocus={e => e.target.style.borderColor = '#667eea'}
                                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                                <button
                                  className="btn secondary"
                                  onClick={() => {
                                    const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                    const cols = [...(props.columnWidths || [])]
                                    if (!cols.length) return
                                    const cells = (props.cells || []).map((row: any[]) => row.filter((_: any, ci: number) => ci !== i))
                                    cols.splice(i, 1)
                                    updateSelectedTable(p => ({ ...p, columnWidths: cols, cells }))
                                    if (selectedCell) {
                                      if (selectedCell.ci === i) setSelectedCell(null)
                                      else if (selectedCell.ci > i) setSelectedCell({ ri: selectedCell.ri, ci: selectedCell.ci - 1 })
                                    }
                                  }}
                                  style={{
                                    padding: '6px',
                                    color: '#ef4444',
                                    border: '1px solid #fee2e2',
                                    background: '#fef2f2',
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                  }}
                                  title="Supprimer la colonne"
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="toolbar" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn secondary" style={{ flex: 1, padding: '8px', fontSize: 12, justifyContent: 'center' }} onClick={() => {
                              const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                              const cols = [...(props.columnWidths || [])]
                              const rows = [...(props.rowHeights || [])]
                              const cells = (props.cells || []).map((row: any[]) => [...row, { text: '', fontSize: 12, color: '#000', fill: 'transparent', borders: { l: {}, r: {}, t: {}, b: {} } }])
                              cols.push(120)
                              updateSelectedTable(p => ({ ...p, columnWidths: cols, cells }))
                            }}>+ Ajouter colonne</button>
                          </div>
                        </div>

                        <div>
                          <div style={{
                            padding: '14px',
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            marginBottom: 8
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', marginBottom: 10, textTransform: 'uppercase' }}>Lignes</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {(() => {
                                const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                const hCount = (props.rowHeights || []).length
                                const cCount = (props.cells || []).length
                                const count = Math.max(hCount, cCount)
                                return Array.from({ length: count }).map((_, i) => {
                                  const h = (props.rowHeights || [])[i] ?? 40
                                  return (
                                    <div key={i} style={{ marginBottom: 4, paddingBottom: 8, borderBottom: i < count - 1 ? '1px dashed #f1f5f9' : 'none' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                        <div style={{ fontWeight: 500, fontSize: 12, color: '#64748b' }}>#{i + 1}</div>
                                        <input
                                          type="number"
                                          value={Math.round(h)}
                                          onChange={e => {
                                            const rows = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.rowHeights || [])]
                                            rows[i] = Number(e.target.value)
                                            updateSelectedTable(p => ({ ...p, rowHeights: rows }))
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: '1px solid #e2e8f0',
                                            fontSize: 13,
                                            outline: 'none',
                                            transition: 'border-color 0.2s'
                                          }}
                                          onFocus={e => e.target.style.borderColor = '#667eea'}
                                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                          title="Hauteur de la ligne"
                                        />

                                        <button
                                          className="btn secondary"
                                          onClick={() => {
                                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                            const rows = [...(props.rowHeights || [])]
                                            if (!rows.length) return
                                            rows.splice(i, 1)
                                            const cells = (props.cells || []).filter((_: any, ri: number) => ri !== i)
                                            const rowLanguages = [...(props.rowLanguages || [])]
                                            if (rowLanguages.length > i) rowLanguages.splice(i, 1)
                                            updateSelectedTable(p => ({ ...p, rowHeights: rows, cells, rowLanguages }))
                                            if (selectedCell) {
                                              if (selectedCell.ri === i) setSelectedCell(null)
                                              else if (selectedCell.ri > i) setSelectedCell({ ri: selectedCell.ri - 1, ci: selectedCell.ci })
                                            }
                                          }}
                                          style={{
                                            padding: '6px',
                                            color: '#ef4444',
                                            border: '1px solid #fee2e2',
                                            background: '#fef2f2',
                                            borderRadius: 6,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer'
                                          }}
                                          title="Supprimer la ligne"
                                        >
                                          🗑️
                                        </button>
                                      </div>

                                      {/* Row Language Editor Inline */}
                                      {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                                        <div style={{ marginLeft: 32 }}>
                                          {(() => {
                                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                            const rowIdx = i // Capture current index
                                            const myRowLangs = props.rowLanguages?.[rowIdx]
                                            const globalLangs = props.expandedLanguages || [
                                              { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                              { code: 'en', label: 'English', emoji: '🇬🇧', active: false },
                                              { code: 'ar', label: 'Lebanese', emoji: '🇱🇧', active: false }
                                            ]
                                            const currentLangs = myRowLangs || globalLangs
                                            const isCustom = !!myRowLangs

                                            return (
                                              <div style={{ marginTop: 4 }}>

                                                <div style={{ marginTop: 4 }}>
                                                  <div style={{ borderRadius: 6, background: '#f0fff4', border: '1px solid #c6f6d5', padding: 8 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                      <div style={{ fontSize: 11, color: '#276749', fontWeight: 600 }}>
                                                        Langues ({currentLangs.length})
                                                      </div>
                                                      {isCustom && (
                                                        <button className="btn secondary" style={{
                                                          padding: '2px 6px',
                                                          fontSize: 10,
                                                          color: '#c53030',
                                                          background: '#fff',
                                                          border: '1px solid #feb2b2',
                                                          borderRadius: 4
                                                        }} onClick={() => {
                                                          updateSelectedTable(p => {
                                                            const rl = [...(p.rowLanguages || [])]
                                                            if (rl.length > rowIdx) rl[rowIdx] = undefined
                                                            return { ...p, rowLanguages: rl }
                                                          })
                                                        }}>Rétablir Global</button>
                                                      )}
                                                    </div>

                                                    {/* List of Langs for Row */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                      {currentLangs.map((lang: any, li: number) => (
                                                        <div key={li} style={{
                                                          display: 'grid',
                                                          gridTemplateColumns: 'auto 1fr 40px auto',
                                                          gap: 4,
                                                          alignItems: 'center',
                                                          padding: 4,
                                                          background: '#fff',
                                                          borderRadius: 4,
                                                          border: '1px solid #e2e8f0'
                                                        }}>
                                                          <input
                                                            type="text"
                                                            value={lang.emoji}
                                                            onChange={e => {
                                                              updateSelectedTable(p => {
                                                                const rl = [...(p.rowLanguages || [])]
                                                                // Initialize from current if not custom yet
                                                                const rowL = rl[rowIdx] ? [...rl[rowIdx]] : JSON.parse(JSON.stringify(currentLangs))
                                                                rowL[li] = { ...rowL[li], emoji: e.target.value }
                                                                rl[rowIdx] = rowL
                                                                return { ...p, rowLanguages: rl }
                                                              })
                                                            }}
                                                            style={{ width: 24, textAlign: 'center', padding: 2, borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }}
                                                          />
                                                          <input
                                                            type="text"
                                                            value={lang.label}
                                                            onChange={e => {
                                                              updateSelectedTable(p => {
                                                                const rl = [...(p.rowLanguages || [])]
                                                                const rowL = rl[rowIdx] ? [...rl[rowIdx]] : JSON.parse(JSON.stringify(currentLangs))
                                                                rowL[li] = { ...rowL[li], label: e.target.value }
                                                                rl[rowIdx] = rowL
                                                                return { ...p, rowLanguages: rl }
                                                              })
                                                            }}
                                                            style={{ width: '100%', padding: '2px 4px', borderRadius: 3, border: '1px solid #ddd', fontSize: 11 }}
                                                          />
                                                          <select
                                                            value={lang.level || ''}
                                                            onChange={e => {
                                                              updateSelectedTable(p => {
                                                                const rl = [...(p.rowLanguages || [])]
                                                                const rowL = rl[rowIdx] ? [...rl[rowIdx]] : JSON.parse(JSON.stringify(currentLangs))
                                                                rowL[li] = { ...rowL[li], level: e.target.value }
                                                                rl[rowIdx] = rowL
                                                                return { ...p, rowLanguages: rl }
                                                              })
                                                            }}
                                                            title="Niveau"
                                                            style={{ width: '100%', padding: '0px', borderRadius: 3, border: '1px solid #ddd', fontSize: 10, height: 22 }}
                                                          >
                                                            <option value="">-</option>
                                                            <option value="PS">PS</option>
                                                            <option value="MS">MS</option>
                                                            <option value="GS">GS</option>
                                                          </select>
                                                          <button style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 10 }} onClick={() => {
                                                            updateSelectedTable(p => {
                                                              const rl = [...(p.rowLanguages || [])]
                                                              const rowL = rl[rowIdx] ? [...rl[rowIdx]] : JSON.parse(JSON.stringify(currentLangs))
                                                              rowL.splice(li, 1)
                                                              rl[rowIdx] = rowL
                                                              return { ...p, rowLanguages: rl }
                                                            })
                                                          }}>✕</button>
                                                        </div>
                                                      ))}

                                                      {/* Quick Add Dropdown */}
                                                      <div style={{ marginTop: 2 }}>
                                                        <select
                                                          value=""
                                                          onChange={(e) => {
                                                            const val = e.target.value
                                                            if (!val) return
                                                            updateSelectedTable(p => {
                                                              const rl = [...(p.rowLanguages || [])]
                                                              const rowL = rl[rowIdx] ? [...rl[rowIdx]] : JSON.parse(JSON.stringify(currentLangs))
                                                              let newLang = { code: 'new', label: 'New', emoji: '🏳️', active: false }

                                                              if (val === 'fr') newLang = { code: 'fr', label: 'French', emoji: '🇫🇷', active: false }
                                                              else if (val === 'en') newLang = { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                                              else if (val === 'lb') newLang = { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false }

                                                              rowL.push(newLang)
                                                              rl[rowIdx] = rowL
                                                              return { ...p, rowLanguages: rl }
                                                            })
                                                          }}
                                                          style={{
                                                            width: '100%',
                                                            padding: '4px',
                                                            fontSize: 11,
                                                            border: '1px solid #bee3f8',
                                                            background: '#ebf8ff',
                                                            color: '#3182ce',
                                                            borderRadius: 3,
                                                            cursor: 'pointer'
                                                          }}
                                                        >
                                                          <option value="">+ Ajouter langue...</option>
                                                          <option value="fr">🇫🇷 French</option>
                                                          <option value="en">🇬🇧 English</option>
                                                          <option value="ar">🇱🇧 Lebanese</option>
                                                        </select>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                                )
                                              </div>
                                            )
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                              })()}
                            </div>
                            <div className="toolbar" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <button className="btn secondary" style={{ flex: 1, padding: '8px', fontSize: 12, justifyContent: 'center' }} onClick={() => {
                                const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                const rows = [...(props.rowHeights || [])]
                                const cols = [...(props.columnWidths || [])]
                                const newRow = cols.map(() => ({ text: '', fontSize: 12, color: '#000', fill: 'transparent', borders: { l: {}, r: {}, t: {}, b: {} } }))
                                const cells = [...(props.cells || [])]
                                rows.push(40)
                                cells.push(newRow)
                                const rowIds = [...(props.rowIds || [])]
                                // Fill rowIds for existing rows if they are missing
                                while (rowIds.length < (props.cells?.length || 0)) {
                                  rowIds.push((window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11))
                                }
                                rowIds.push((window.crypto as any).randomUUID ? (window.crypto as any).randomUUID() : Math.random().toString(36).substring(2, 11))

                                // Maintain rowLanguages array length
                                const rowLanguages = [...(props.rowLanguages || [])]
                                updateSelectedTable(p => ({ ...p, rowHeights: rows, cells, rowLanguages, rowIds }))
                              }}>+ Ajouter ligne</button>
                            </div>
                          </div>
                          {selectedCell && (
                            <div>
                              <div className="note">Cellule: ligne {selectedCell.ri + 1}, colonne {selectedCell.ci + 1}</div>
                              {(() => {
                                const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                const cell = props.cells?.[selectedCell.ri]?.[selectedCell.ci] || {}
                                return (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    <textarea rows={3} placeholder="Texte" value={cell.text || ''} onChange={e => {
                                      updateSelectedTable(p => {
                                        const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, text: e.target.value } : c)))
                                        return { ...p, cells }
                                      })
                                    }} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                                    <input type="number" placeholder="Taille police" value={cell.fontSize || 12} onChange={e => {
                                      updateSelectedTable(p => {
                                        const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, fontSize: Number(e.target.value) } : c)))
                                        return { ...p, cells }
                                      })
                                    }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                                    <input placeholder="Couleur texte" value={cell.color || ''} onChange={e => {
                                      updateSelectedTable(p => {
                                        const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, color: e.target.value } : c)))
                                        return { ...p, cells }
                                      })
                                    }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                                    <input placeholder="Fond" value={cell.fill || ''} onChange={e => {
                                      updateSelectedTable(p => {
                                        const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, fill: e.target.value } : c)))
                                        return { ...p, cells }
                                      })
                                    }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                                    <div className="toolbar" style={{ display: 'grid', gap: 8 }}>
                                      {(['l', 'r', 't', 'b'] as const).map(side => (
                                        <div key={side} style={{ display: 'flex', gap: 8 }}>
                                          <input placeholder={`Bordure ${side} couleur`} value={(cell.borders?.[side]?.color || '')} onChange={e => {
                                            updateSelectedTable(p => {
                                              const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, borders: { ...c.borders, [side]: { ...(c.borders?.[side] || {}), color: e.target.value } } } : c)))
                                              return { ...p, cells }
                                            })
                                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }} />
                                          <input placeholder={`Bordure ${side} largeur`} type="number" value={Number(cell.borders?.[side]?.width || 0)} onChange={e => {
                                            updateSelectedTable(p => {
                                              const cells = p.cells.map((row: any[], ri: number) => row.map((c: any, ci: number) => (ri === selectedCell.ri && ci === selectedCell.ci ? { ...c, borders: { ...c.borders, [side]: { ...(c.borders?.[side] || {}), width: Number(e.target.value) } } } : c)))
                                              return { ...p, cells }
                                            })
                                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: 120 }} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'student_photo' && (
                    <div style={{
                      padding: '14px',
                      background: '#f8f9fa',
                      borderRadius: 10,
                      marginBottom: 8
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Largeur</label>
                          <input
                            type="number"
                            value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 0}
                            onChange={e => updateSelected({ width: Number(e.target.value) })}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Hauteur</label>
                          <input
                            type="number"
                            value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 0}
                            onChange={e => updateSelected({ height: Number(e.target.value) })}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '2px solid #e9ecef', fontSize: 13 }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'category_title' && (
                    <input placeholder="ID catégorie" value={tpl.pages[selectedPage].blocks[selectedIndex].props.categoryId || ''} onChange={e => updateSelected({ categoryId: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'competency_list' && (
                    <input placeholder="ID catégorie (optionnel)" value={tpl.pages[selectedPage].blocks[selectedIndex].props.categoryId || ''} onChange={e => updateSelected({ categoryId: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                  )}
                  {/* Signature Box Configuration */}
                  {(tpl.pages[selectedPage].blocks[selectedIndex].type === 'signature_box' || tpl.pages[selectedPage].blocks[selectedIndex].type === 'final_signature_box') && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">Configuration Signature</div>
                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Type (Période)</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.period || 'mid-year'}
                        onChange={e => updateSelected({ period: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="mid-year">Mi-Année (Semestre 1)</option>
                        <option value="end-year">Fin d'Année (Semestre 2)</option>
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Label</label>
                      <input
                        placeholder="Label"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.label || ''}
                        onChange={e => updateSelected({ label: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                      />

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Niveau spécifique (Optionnel)</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.level || ''}
                        onChange={e => updateSelected({ level: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Tous les niveaux</option>
                        {levels.map(l => (
                          <option key={l.name} value={l.name}>{l.name}</option>
                        ))}
                      </select>

                      <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 200} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 80} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    </div>
                  )}

                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'signature_date' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">Date de signature (Subadmin)</div>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Niveau</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.level || ''}
                        onChange={e => updateSelected({ level: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Tous les niveaux</option>
                        <option value="PS">PS</option>
                        <option value="MS">MS</option>
                        <option value="GS">GS</option>
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Semestre</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.semester || 1}
                        onChange={e => updateSelected({ semester: Number(e.target.value) })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value={1}>Semestre 1</option>
                        <option value={2}>Semestre 2</option>
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Label (optionnel)</label>
                      <input
                        placeholder="Label"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.label || ''}
                        onChange={e => updateSelected({ label: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                      />

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tpl.pages[selectedPage].blocks[selectedIndex].props.showMeta !== false}
                          onChange={(e) => updateSelected({ showMeta: e.target.checked })}
                        />
                        Afficher niveau + semestre
                      </label>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 220} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 34} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input placeholder="Taille" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.fontSize || 12} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        <input type="color" value={tpl.pages[selectedPage].blocks[selectedIndex].props.color || '#2d3436'} onChange={e => updateSelected({ color: e.target.value })} style={{ height: 38, padding: 4, borderRadius: 8, border: '1px solid #ddd', width: '100%' }} />
                      </div>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Alignement</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.align || 'flex-start'}
                        onChange={e => updateSelected({ align: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="flex-start">Gauche</option>
                        <option value="center">Centre</option>
                        <option value="flex-end">Droite</option>
                      </select>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'promotion_info' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">
                        Configuration Info Passage
                      </div>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Type d'information</label>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.field || ''}
                        onChange={e => updateSelected({ field: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">-- Complet (Bloc résumé) --</option>
                        <option value="currentLevel">Niveau Actuel (ex: PS)</option>
                        <option value="nextLevel">Niveau Suivant (ex: MS)</option>
                        <option value="year">Année Suivante (ex: 2026/2027)</option>
                        <option value="currentYear">Année Actuelle (ex: 2025/2026)</option>
                        <option value="class">Classe (ex: A)</option>
                        <option value="student">Nom complet de l'élève</option>
                        <option value="studentFirstName">Prénom de l'élève</option>
                        <option value="studentLastName">Nom de famille de l'élève</option>
                        <option value="level">Label Passage (ex: "Passage en MS")</option>
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Visibilité par Niveau (Optionnel)</label>
                      <div className="note" style={{ marginBottom: 4 }}>
                        Afficher ce bloc uniquement pour ce niveau.
                      </div>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.level || ''}
                        onChange={e => updateSelected({ level: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Tous les niveaux</option>
                        {levels.map(l => (
                          <option key={l.name} value={l.name}>{l.name}</option>
                        ))}
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Visibilité par Période (Optionnel)</label>
                      <div className="note" style={{ marginBottom: 4 }}>
                        Lier ce bloc à une signature (Mi-Année ou Fin d'Année).
                      </div>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.period || ''}
                        onChange={e => updateSelected({ period: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Toujours visible</option>
                        <option value="mid-year">Mi-Année seulement</option>
                        <option value="end-year">Fin d'Année seulement</option>
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Niveau cible (Avancé)</label>
                      <div className="note" style={{ marginBottom: 4 }}>
                        Force le calcul de promotion vers ce niveau (ex: Vers MS). Utile si le niveau de l'élève est ambigu.
                      </div>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.targetLevel || ''}
                        onChange={e => updateSelected({ targetLevel: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Automatique (Basé sur niveau actuel)</option>
                        <option value="MS">Vers MS</option>
                        <option value="GS">Vers GS</option>
                        <option value="EB1">Vers EB1</option>
                        <option value="KG2">Vers KG2</option>
                        <option value="KG3">Vers KG3</option>
                      </select>

                      <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || (tpl.pages[selectedPage].blocks[selectedIndex].props.field ? 150 : 300)} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || (tpl.pages[selectedPage].blocks[selectedIndex].props.field ? 30 : 100)} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'teacher_text' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">
                        Configuration Zone Texte Prof Polyvalent
                      </div>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Libellé</label>
                      <input
                        placeholder="Zone de texte prof"
                        type="text"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.label || ''}
                        onChange={e => updateSelected({ label: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      />

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Texte d'aide (placeholder)</label>
                      <input
                        placeholder="Texte éditable par le prof polyvalent..."
                        type="text"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.placeholder || ''}
                        onChange={e => updateSelected({ placeholder: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      />

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Visibilité par Niveau (Optionnel)</label>
                      <div className="note" style={{ marginBottom: 4 }}>
                        Afficher ce bloc uniquement pour ce niveau.
                      </div>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.level || ''}
                        onChange={e => updateSelected({ level: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Tous les niveaux</option>
                        {levels.map(l => (
                          <option key={l.name} value={l.name}>{l.name}</option>
                        ))}
                      </select>

                      <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Visibilité par Période (Optionnel)</label>
                      <div className="note" style={{ marginBottom: 4 }}>
                        Lier ce bloc à une signature (Mi-Année ou Fin d'Année).
                      </div>
                      <select
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.period || ''}
                        onChange={e => updateSelected({ period: e.target.value })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                      >
                        <option value="">Toujours visible</option>
                        <option value="mid-year">Mi-Année seulement</option>
                        <option value="end-year">Fin d'Année seulement</option>
                      </select>

                      <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 300} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 60} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'language_toggle' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Rayon</label>
                          <input placeholder="Rayon" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.radius || 40} onChange={e => updateSelected({ radius: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Espace</label>
                          <input placeholder="Espacement" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.spacing || 12} onChange={e => updateSelected({ spacing: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Taille Police</label>
                        <input placeholder="Taille" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.fontSize || 10} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Direction</label>
                        <select
                          value={tpl.pages[selectedPage].blocks[selectedIndex].props.direction || 'column'}
                          onChange={e => updateSelected({ direction: e.target.value })}
                          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                        >
                          <option value="column">Vertical</option>
                          <option value="row">Horizontal</option>
                        </select>
                      </div>
                      <div className="note">Langues ({(tpl.pages[selectedPage].blocks[selectedIndex].props.items || []).length})</div>
                      {((tpl.pages[selectedPage].blocks[selectedIndex].props.items || []) as any[]).map((it: any, i: number) => (
                        <div key={i} className="card" style={{ padding: 8, background: '#f9f9f9' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                            <select value={it.code || 'en'} onChange={e => {
                              const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                              const langData: Record<string, any> = {
                                'en': { code: 'en', label: 'English', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg' },
                                'fr': { code: 'fr', label: 'Français', logo: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg' },
                                'ar': { code: 'ar', label: 'العربية', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg' }
                              }
                              items[i] = { ...items[i], ...langData[e.target.value] }
                              updateSelected({ items })
                            }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }}>
                              <option value="en">English</option>
                              <option value="fr">Français</option>
                              <option value="ar">العربية</option>
                            </select>
                            <button className="btn secondary" onClick={() => {
                              const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                              items[i] = { ...items[i], active: !items[i].active }
                              updateSelected({ items })
                            }} style={{ padding: '4px 12px' }}>{it.active ? 'Actif' : 'Inactif'}</button>
                            <button className="btn secondary" onClick={() => {
                              const items = (tpl.pages[selectedPage].blocks[selectedIndex].props.items || []).filter((_: any, idx: number) => idx !== i)
                              updateSelected({ items })
                            }} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff' }}>✕</button>
                          </div>
                          <input placeholder="Label (optionnel)" value={it.label || ''} onChange={e => {
                            const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                            items[i] = { ...items[i], label: e.target.value }
                            updateSelected({ items })
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', marginBottom: 8 }} />
                          <input placeholder="Logo URL (optionnel)" value={it.logo || ''} onChange={e => {
                            const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                            items[i] = { ...items[i], logo: e.target.value }
                            updateSelected({ items })
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }} />
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#6c757d', marginBottom: 4 }}>Niveaux assignés:</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {levels.map(l => (
                                <label key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={(it.levels || []).includes(l.name)}
                                    onChange={e => {
                                      const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                                      const currentLevels = items[i].levels || []
                                      if (e.target.checked) items[i] = { ...items[i], levels: [...currentLevels, l.name] }
                                      else items[i] = { ...items[i], levels: currentLevels.filter((x: string) => x !== l.name) }
                                      updateSelected({ items })
                                    }}
                                  />
                                  {l.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <button className="btn secondary" onClick={() => {
                        const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                        items.push({ code: 'en', label: 'English', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg', active: false })
                        updateSelected({ items })
                      }}>+ Ajouter une langue</button>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'language_toggle_v2' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Largeur</label>
                          <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 300} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Hauteur</label>
                          <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 100} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Couleur Fond</label>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input type="color" value={tpl.pages[selectedPage].blocks[selectedIndex].props.backgroundColor || '#1e3a8a'} onChange={e => updateSelected({ backgroundColor: e.target.value })} style={{ height: 38, width: 40, padding: 0, border: '1px solid #ddd', borderRadius: 4 }} />
                            <input type="text" value={tpl.pages[selectedPage].blocks[selectedIndex].props.backgroundColor || '#1e3a8a'} onChange={e => updateSelected({ backgroundColor: e.target.value })} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Rayon (Border Radius)</label>
                          <input placeholder="Rayon" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.borderRadius || 12} onChange={e => updateSelected({ borderRadius: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Padding</label>
                          <input placeholder="Padding" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.padding || 24} onChange={e => updateSelected({ padding: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Espace (Gap)</label>
                          <input placeholder="Espacement" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.spacing || 12} onChange={e => updateSelected({ spacing: Number(e.target.value) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Direction</label>
                          <select
                            value={tpl.pages[selectedPage].blocks[selectedIndex].props.direction || 'row'}
                            onChange={e => updateSelected({ direction: e.target.value })}
                            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                          >
                            <option value="column">Vertical</option>
                            <option value="row">Horizontal</option>
                          </select>
                        </div>
                      </div>

                      <div className="note">Langues ({(tpl.pages[selectedPage].blocks[selectedIndex].props.items || []).length})</div>
                      {((tpl.pages[selectedPage].blocks[selectedIndex].props.items || []) as any[]).map((it: any, i: number) => (
                        <div key={i} className="card" style={{ padding: 8, background: '#f9f9f9' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                            <select value={it.code || 'en'} onChange={e => {
                              const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                              const langData: Record<string, any> = {
                                'en': { code: 'en', label: 'English', emoji: '🇬🇧', logo: 'https://flagcdn.com/gb.svg' },
                                'fr': { code: 'fr', label: 'Français', emoji: '🇫🇷', logo: 'https://flagcdn.com/fr.svg' },
                                'ar': { code: 'ar', label: 'العربية', emoji: '🇱🇧', logo: 'https://flagcdn.com/lb.svg' },
                                'lb': { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', logo: 'https://flagcdn.com/lb.svg' }
                              }
                              items[i] = { ...items[i], ...langData[e.target.value] }
                              updateSelected({ items })
                            }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }}>
                              <option value="en">English</option>
                              <option value="fr">Français</option>
                              <option value="ar">العربية</option>
                              <option value="lb">Lebanese</option>
                            </select>
                            <button className="btn secondary" onClick={() => {
                              const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                              items[i] = { ...items[i], active: !items[i].active }
                              updateSelected({ items })
                            }} style={{ padding: '4px 12px' }}>{it.active ? 'Actif' : 'Inactif'}</button>
                            <button className="btn secondary" onClick={() => {
                              const items = (tpl.pages[selectedPage].blocks[selectedIndex].props.items || []).filter((_: any, idx: number) => idx !== i)
                              updateSelected({ items })
                            }} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff' }}>✕</button>
                          </div>
                          <input placeholder="Label (optionnel)" value={it.label || ''} onChange={e => {
                            const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                            items[i] = { ...items[i], label: e.target.value }
                            updateSelected({ items })
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', marginBottom: 8 }} />
                          <input placeholder="Logo URL (optionnel)" value={it.logo || ''} onChange={e => {
                            const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                            items[i] = { ...items[i], logo: e.target.value }
                            updateSelected({ items })
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', marginBottom: 8 }} />
                          <input placeholder="Emoji" value={it.emoji || ''} onChange={e => {
                            const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                            items[i] = { ...items[i], emoji: e.target.value }
                            updateSelected({ items })
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }} />
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#6c757d', marginBottom: 4 }}>Niveaux assignés:</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {levels.map(l => (
                                <label key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={(it.levels || []).includes(l.name)}
                                    onChange={e => {
                                      const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                                      const currentLevels = items[i].levels || []
                                      if (e.target.checked) items[i] = { ...items[i], levels: [...currentLevels, l.name] }
                                      else items[i] = { ...items[i], levels: currentLevels.filter((x: string) => x !== l.name) }
                                      updateSelected({ items })
                                    }}
                                  />
                                  {l.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <button className="btn secondary" onClick={() => {
                        const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                        items.push({ code: 'en', label: 'English', emoji: '🇬🇧', logo: 'https://flagcdn.com/gb.svg', active: false })
                        updateSelected({ items })
                      }}>+ Ajouter une langue</button>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'dropdown' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ padding: 8, background: '#f0f4ff', borderRadius: 8, fontWeight: 'bold', color: '#6c5ce7' }}>Dropdown #{tpl.pages[selectedPage].blocks[selectedIndex].props.dropdownNumber || '?'}</div>
                      <input placeholder="Label" value={tpl.pages[selectedPage].blocks[selectedIndex].props.label || ''} onChange={e => updateSelected({ label: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Nom variable (ex: obs1)" value={tpl.pages[selectedPage].blocks[selectedIndex].props.variableName || ''} onChange={e => updateSelected({ variableName: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />

                      <div style={{ marginTop: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6c757d', marginBottom: 4 }}>Niveaux assignés:</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {levels.map(l => (
                            <label key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={(tpl.pages[selectedPage].blocks[selectedIndex].props.levels || []).includes(l.name)}
                                onChange={e => {
                                  const currentLevels = tpl.pages[selectedPage].blocks[selectedIndex].props.levels || []
                                  if (e.target.checked) updateSelected({ levels: [...currentLevels, l.name] })
                                  else updateSelected({ levels: currentLevels.filter((x: string) => x !== l.name) })
                                }}
                              />
                              {l.name}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6c757d', marginBottom: 4 }}>Semestres assignés:</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {[1, 2].map(sem => (
                            <label key={sem} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={(tpl.pages[selectedPage].blocks[selectedIndex].props.semesters || [1, 2]).includes(sem)}
                                onChange={e => {
                                  const currentSemesters = tpl.pages[selectedPage].blocks[selectedIndex].props.semesters || [1, 2]
                                  if (e.target.checked) updateSelected({ semesters: [...currentSemesters, sem].sort() })
                                  else updateSelected({ semesters: currentSemesters.filter((x: number) => x !== sem) })
                                }}
                              />
                              Semestre {sem}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="note">Options ({(tpl.pages[selectedPage].blocks[selectedIndex].props.options || []).length})</div>
                      {(tpl.pages[selectedPage].blocks[selectedIndex].props.options || []).map((opt: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            placeholder={`Option ${i + 1}`}
                            value={opt}
                            onChange={e => {
                              const options = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.options || [])]
                              options[i] = e.target.value
                              updateSelected({ options })
                            }}
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }}
                          />
                          <button className="btn secondary" onClick={() => {
                            const options = (tpl.pages[selectedPage].blocks[selectedIndex].props.options || []).filter((_: string, idx: number) => idx !== i)
                            updateSelected({ options })
                          }} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff' }}>✕</button>
                        </div>
                      ))}
                      <button className="btn secondary" onClick={() => {
                        const options = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.options || []), '']
                        updateSelected({ options })
                      }}>+ Ajouter une option</button>
                      <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 200} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 32} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'dropdown_reference' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">Référence à un dropdown</div>
                      <input
                        placeholder="Numéro du dropdown"
                        type="number"
                        min="1"
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.dropdownNumber || 1}
                        onChange={e => updateSelected({ dropdownNumber: Number(e.target.value) })}
                        style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                      />
                      <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 200} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <input placeholder="Hauteur minimale" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 40} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                      <div style={{ padding: 8, background: '#fff9e6', borderRadius: 8, fontSize: 12 }}>
                        💡 Ce bloc affichera la valeur sélectionnée dans le Dropdown #{tpl.pages[selectedPage].blocks[selectedIndex].props.dropdownNumber || 1}
                      </div>
                    </div>
                  )}
                  {tpl.pages[selectedPage].blocks[selectedIndex].type === 'gradebook_pocket' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="note">📝 Title - Configuration</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 500 }}>Texte / Numéro</label>
                          <input
                            placeholder="Ex: 1, A, CP..."
                            value={tpl.pages[selectedPage].blocks[selectedIndex].props.number || '1'}
                            onChange={e => updateSelected({ number: e.target.value })}
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 500 }}>Taille Police</label>
                          <input
                            type="number"
                            placeholder="Auto"
                            value={tpl.pages[selectedPage].blocks[selectedIndex].props.fontSize || ''}
                            onChange={e => updateSelected({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12, fontWeight: 500 }}>Taille (largeur)</label>
                        <input
                          type="number"
                          min="60"
                          max="300"
                          value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 120}
                          onChange={e => updateSelected({ width: Number(e.target.value) })}
                          style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                        />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn secondary" onClick={duplicateBlock} style={{ flex: 1 }}>Dupliquer le bloc</button>
                    <button className="btn secondary" onClick={copySelection} style={{ flex: 1 }}>Copier</button>
                    <button className="btn secondary" onClick={() => {
                      const pages = [...tpl.pages]
                      const page = { ...pages[selectedPage] }
                      const blocks = page.blocks.filter((_, i) => i !== selectedIndex)
                      pages[selectedPage] = { ...page, blocks }
                      setTpl({ ...tpl, pages }); setSelectedIndex(null)
                      setSelectedCell(null)
                    }} style={{ flex: 1, color: '#dc3545', borderColor: '#ffcdd2', background: '#fff' }}>Supprimer</button>
                  </div>
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#6c757d'
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🎯</div>
                  <p style={{ margin: 0, fontSize: 14 }}>Sélectionnez un bloc sur le canevas pour modifier ses propriétés</p>
                </div>
              )
              }
            </div >
          )}
        </div >
      </div >

      {/* Template Propagation Modal */}
      {
        showPropagationModal && tpl._id && (
          <TemplatePropagationModal
            templateId={tpl._id}
            templateName={tpl.name}
            currentVersion={(tpl as any).currentVersion || 1}
            onClose={() => setShowPropagationModal(false)}
            onSave={handlePropagationSave}
          />
        )
      }

      {/* Template History Modal (Student Gradebook History) */}
      {
        showHistoryModal && tpl._id && (
          <TemplateHistoryModal
            templateId={tpl._id}
            templateName={tpl.name}
            onClose={() => setShowHistoryModal(false)}
          />
        )
      }

      {/* Template State History Modal */}
      {
        showTemplateStateHistoryModal && tpl._id && (
          <TemplateStateHistoryModal
            templateId={tpl._id}
            templateName={tpl.name}
            currentVersion={(tpl as any).currentVersion || 1}
            onClose={() => setShowTemplateStateHistoryModal(false)}
          />
        )
      }

          </div >
  )
}
