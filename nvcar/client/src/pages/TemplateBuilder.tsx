import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSocket } from '../context/SocketContext'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[]; updatedAt?: string }
type Year = { _id: string; name: string }
type ClassDoc = { _id: string; name: string; schoolYearId: string; level?: string }
type StudentDoc = { _id: string; firstName: string; lastName: string; level?: string; nextLevel?: string; className?: string }

const pageWidth = 800
const pageHeight = 1120

export default function TemplateBuilder() {
  const navigate = useNavigate()
  const { levels } = useLevels()
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
  const [snap, setSnap] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null)
  const [globalBorderColor, setGlobalBorderColor] = useState('#000000')
  const [globalBorderWidth, setGlobalBorderWidth] = useState(1)
  const [list, setList] = useState<Template[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [continuousScroll, setContinuousScroll] = useState(true)
  const [previewData, setPreviewData] = useState<Record<string, string>>({})
  const [rightPanelView, setRightPanelView] = useState<'properties' | 'slides'>('properties')
  const [deleteConfirmations, setDeleteConfirmations] = useState<{ [id: string]: number }>({})
  const [activeGuides, setActiveGuides] = useState<{ type: 'x' | 'y', pos: number }[]>([])

  // Undo/Redo History State
  const [history, setHistory] = useState<Template[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedoAction = useRef(false)

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

  const normalizeTemplateNumbers = (t: Template): Template => {
    const pages = (t.pages || []).map(p => ({
      ...p,
      blocks: (p.blocks || []).map(b => {
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

      const timer = setTimeout(() => {
        socket.emit('update-template', { templateId: tpl._id, template: tpl })
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [tpl, viewMode, socket])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'edit') return

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        redo()
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
  }, [historyIndex, history, viewMode, undo, redo, tpl, selectedPage, selectedIndex, selectedIndices])

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

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
    { type: 'promotion_info', props: { field: 'currentLevel', width: 100, height: 30, fontSize: 12, color: '#2d3436', label: 'Niveau Actuel' } },
    { type: 'promotion_info', props: { field: 'class', width: 100, height: 30, fontSize: 12, color: '#2d3436', label: 'Classe' } },
    { type: 'promotion_info', props: { field: 'level', width: 150, height: 30, fontSize: 12, color: '#2d3436', label: 'Niveau Suivant (Passage)' } },
    { type: 'promotion_info', props: { field: 'year', width: 120, height: 30, fontSize: 12, color: '#2d3436', label: 'Année Suivante' } },

    // Legacy Final Signature Info (kept for compatibility but updated label)
    { type: 'final_signature_info', props: { field: 'nextLevel', width: 150, height: 30, fontSize: 12, color: '#2d3436', label: 'Info (Legacy) - Niveau Suivant', placeholder: '...' } },

    // Signatures
    { type: 'signature_box', props: { width: 200, height: 80, label: 'Signature', period: 'mid-year' } },
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
    { type: 'dynamic_text', props: { text: '{student.firstName} {student.lastName}', fontSize: 14, color: '#2d3436' } },
  ]), [])

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

  const addBlock = (b: Block) => {
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    const nextZ = (zList.length ? Math.max(...zList) : 0) + 1

    // If adding a dropdown, assign it the next available number
    let newProps = { ...b.props, x: 100, y: 100, z: nextZ }
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

    // Handle dropdown numbering if it's a dropdown
    if (blockToDuplicate.type === 'dropdown') {
      const allDropdowns = getAllDropdowns()
      const maxNum = allDropdowns.reduce((max, d) => Math.max(max, d.block.props.dropdownNumber || 0), 0)
      newProps.dropdownNumber = maxNum + 1
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
    blocks[selectedIndex] = { ...blocks[selectedIndex], props: { ...blocks[selectedIndex].props, ...patch } }
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

  const onDrag = (e: React.MouseEvent, pageIndex: number, idx: number) => {
    const startX = e.clientX
    const startY = e.clientY

    // Determine which blocks are moving
    const movingIndices = new Set<number>()
    const isMultiSelect = selectedIndices.includes(idx) || selectedIndex === idx

    if (isMultiSelect) {
      selectedIndices.forEach(i => movingIndices.add(i))
      if (selectedIndex !== null) movingIndices.add(selectedIndex)
    } else {
      movingIndices.add(idx)
    }

    // Capture initial positions
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

    const onMove = (ev: MouseEvent) => {
      hasMoved = true
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const pages = [...tpl.pages]
      const page = { ...pages[pageIndex] }
      const blocks = [...page.blocks]

      let proposedX = Math.max(0, Math.min(pageWidth - 20, baseX + dx))
      let proposedY = Math.max(0, Math.min(pageHeight - 20, baseY + dy))

      let nx = proposedX
      let ny = proposedY

      // Smart Guides Logic
      const threshold = 5
      const guides: { type: 'x' | 'y', pos: number }[] = []

      // Snap X
      let snappedX = false
      const cx = nx + blockW / 2

      for (const ob of otherBlocks) {
        const ocx = ob.x + ob.w / 2

        // Left align
        if (Math.abs(nx - ob.x) < threshold) { nx = ob.x; guides.push({ type: 'x', pos: ob.x }); snappedX = true }
        // Right align
        else if (Math.abs((nx + blockW) - (ob.x + ob.w)) < threshold) { nx = (ob.x + ob.w) - blockW; guides.push({ type: 'x', pos: ob.x + ob.w }); snappedX = true }
        // Left to Right
        else if (Math.abs(nx - (ob.x + ob.w)) < threshold) { nx = ob.x + ob.w; guides.push({ type: 'x', pos: ob.x + ob.w }); snappedX = true }
        // Right to Left
        else if (Math.abs((nx + blockW) - ob.x) < threshold) { nx = ob.x - blockW; guides.push({ type: 'x', pos: ob.x }); snappedX = true }
        // Center X
        else if (Math.abs(cx - ocx) < threshold) { nx = ocx - blockW / 2; guides.push({ type: 'x', pos: ocx }); snappedX = true }

        if (snappedX) break
      }

      // Snap Y
      let snappedY = false
      const cy = ny + blockH / 2

      for (const ob of otherBlocks) {
        const ocy = ob.y + ob.h / 2

        // Top align
        if (Math.abs(ny - ob.y) < threshold) { ny = ob.y; guides.push({ type: 'y', pos: ob.y }); snappedY = true }
        // Bottom align
        else if (Math.abs((ny + blockH) - (ob.y + ob.h)) < threshold) { ny = (ob.y + ob.h) - blockH; guides.push({ type: 'y', pos: ob.y + ob.h }); snappedY = true }
        // Top to Bottom
        else if (Math.abs(ny - (ob.y + ob.h)) < threshold) { ny = ob.y + ob.h; guides.push({ type: 'y', pos: ob.y + ob.h }); snappedY = true }
        // Bottom to Top
        else if (Math.abs((ny + blockH) - ob.y) < threshold) { ny = ob.y - blockH; guides.push({ type: 'y', pos: ob.y }); snappedY = true }
        // Center Y
        else if (Math.abs(cy - ocy) < threshold) { ny = ocy - blockH / 2; guides.push({ type: 'y', pos: ocy }); snappedY = true }

        if (snappedY) break
      }

      setActiveGuides(guides)

      const sx = snap && !snappedX ? Math.round(nx / 10) * 10 : nx
      const sy = snap && !snappedY ? Math.round(ny / 10) * 10 : ny

      const finalDx = sx - baseX
      const finalDy = sy - baseY

      movingIndices.forEach(i => {
        const init = initialPositions.get(i)!
        blocks[i] = { ...blocks[i], props: { ...blocks[i].props, x: init.x + finalDx, y: init.y + finalDy } }
      })

      pages[pageIndex] = { ...page, blocks }
      // Use setTpl here to avoid history spam, we save on Up
      setTpl({ ...tpl, pages })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setActiveGuides([])
      if (hasMoved) {
        // Manually push the *previous* state to history before confirming the move?
        // No, updateTpl pushes the *new* state to history.
        // But wait, updateTpl pushes newTpl to history.
        // So if we just called setTpl during drag, history wasn't updated.
        // Now we need to update history with the final state.
        // BUT, we need to push the state BEFORE drag to history first?
        // My updateTpl implementation: pushes `newTpl` to history.
        // This means `history` contains [state1, state2, state3].
        // If I am at state3, and I drag, I want state3 to be in history, and new state4 to be current.

        // Current logic:
        // updateTpl(newTpl):
        //   history.push(newTpl) -> history = [s1, s2, s3, s4]
        //   setTpl(newTpl) -> tpl = s4

        // But during drag, I called setTpl(s4_draft) repeatedly without history.
        // So tpl IS s4_draft.
        // If I call updateTpl(tpl) now:
        //   history.push(tpl) -> history = [s1, s2, s3, s4]
        //   setTpl(tpl)

        // Correct? Yes.
        // But wait, `history` currently has [s1, s2, s3].
        // tpl is s4.
        // If I call updateTpl(tpl), it pushes s4.
        // So if I undo, I go to s3.
        // s3 is the state before drag? Yes, because we haven't pushed anything since s3.
        // So this is correct.

        // One catch: My `updateTpl` implementation pushes `newTpl` to history.
        // So history becomes [s1, s2, s3, s4].
        // Undo -> index at s3. tpl = s3. Correct.

        // Wait, if I am at s3. tpl is s3.
        // Drag starts. tpl becomes s3_modified.
        // Drag ends. I call updateTpl(s3_modified).
        // history becomes [s1, s2, s3, s3_modified].
        // Undo -> index at s3. tpl = s3.
        // Correct.

        // HOWEVER, I need to pass the *final* tpl from the closure?
        // No, `tpl` in `onUp` refers to the `tpl` when `onDrag` started (closure).
        // So `tpl` inside `onUp` is the OLD tpl.
        // `setTpl` updates the state but `onUp` doesn't see it?
        // `onDrag` closes over `tpl`.
        // Inside `onMove`, we calculate `pages` based on `tpl` (closure) + `dx/dy`.
        // So `pages` in `onMove` is correct relative to start.

        // We need to capture the final pages in `onUp`.
        // But `onMove` variables are local to `onMove`.
        // We can use a mutable ref or variable in outer scope of `onDrag`.
      }
    }

    // We need to track the latest calculated state to save it on Up
    // Since we can't easily access the result of onMove from onUp without shared var
    // Re-implementing logic slightly

    // ... Actually, I can just use `setTpl` with a callback in `onMove`?
    // No, `onMove` has the `nx, ny`.
    // Let's use a ref or variable.

    // Better:
    // Just re-calculate final position in onUp? No, mouse position might be different.

    // Let's use a temp variable in onDrag scope.
    let finalTpl = tpl

    const onMoveWithCapture = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const pages = [...tpl.pages]
      const page = { ...pages[pageIndex] }
      const blocks = [...page.blocks]
      let nx = Math.max(0, Math.min(pageWidth - 20, baseX + dx))
      let ny = Math.max(0, Math.min(pageHeight - 20, baseY + dy))

      // Smart Guides (Copy-paste logic from above or refactor? Copying for safety/speed within tool)
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

      blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, x: sx, y: sy } }
      pages[pageIndex] = { ...page, blocks }
      finalTpl = { ...tpl, pages }
      hasMoved = true
      setTpl(finalTpl)
    }

    const onUpWithCapture = () => {
      window.removeEventListener('mousemove', onMoveWithCapture)
      window.removeEventListener('mouseup', onUpWithCapture)
      setActiveGuides([])
      if (hasMoved) {
        updateTpl(finalTpl)
      }
    }

    window.addEventListener('mousemove', onMoveWithCapture)
    window.addEventListener('mouseup', onUpWithCapture)
  }

  const save = async () => {
    if (tpl._id) {
      const r = await api.patch(`/templates/${tpl._id}`, tpl)
      setTpl(normalizeTemplateNumbers(r.data))
    } else {
      const r = await api.post('/templates', tpl)
      setTpl(normalizeTemplateNumbers(r.data))
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
  const loadYears = async () => { try { const r = await api.get('/school-years'); setYears(r.data) } catch { } }
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
      setTpl(normalizeTemplateNumbers(r.data))
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
      setTpl(normalizeTemplateNumbers(r.data))
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
                  setTpl(item);
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
            onClick={() => { setViewMode('list'); loadTemplates() }}
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
            onClick={() => setContinuousScroll(!continuousScroll)}
            style={{
              padding: '8px 16px',
              fontSize: 14
            }}
          >
            {continuousScroll ? '📄 Vue page par page' : '📜 Vue continue'}
          </button>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: '#f8f9fa',
            borderRadius: 8,
            fontSize: 14,
            minWidth: 200
          }}>
            <span>🔍 Zoom</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 600, minWidth: 45, textAlign: 'right' }}>{Math.round(scale * 100)}%</span>
          </label>

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
                  const r = await api.get(`/pdf-v2/preview/${tpl._id}/${studentId}`, {
                    responseType: 'blob'
                  })
                  const stu = students.find(s => s._id === studentId)
                  const name = stu ? `carnet-${stu.lastName}-${stu.firstName}.pdf` : 'carnet.pdf'
                  const blob = new Blob([r.data], { type: 'application/pdf' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = name
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  URL.revokeObjectURL(url)
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
      <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
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
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
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
                ...blocksPalette.filter(b => ['text', 'image', 'table', 'qr', 'line', 'arrow', 'rect', 'circle'].includes(b.type))
              ]
            },
            {
              title: 'Promotion & Signatures',
              items: [
                ...blocksPalette.filter(b => ['promotion_info', 'signature_box', 'signature', 'student_photo'].includes(b.type))
              ]
            },
            {
              title: 'Interactif',
              items: [
                ...blocksPalette.filter(b => ['language_toggle', 'language_toggle_v2', 'dropdown', 'dropdown_reference', 'dynamic_text'].includes(b.type))
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
                      {b.type === 'signature_box' && '✍️'}
                      {b.type === 'signature' && '👥'}
                      {b.type === 'student_photo' && '📸'}
                      {b.type === 'language_toggle' && '🌐'}
                      {b.type === 'language_toggle_v2' && '🏳️'}
                      {b.type === 'dropdown' && '🔽'}
                      {b.type === 'dropdown_reference' && '🔗'}
                      {b.type === 'dynamic_text' && '🔤'}
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
                                          b.type === 'signature_box' ? 'Signature Box' :
                                            b.type === 'signature' ? 'Signatures (Noms)' :
                                              b.type === 'student_photo' ? 'Photo Élève' :
                                                b.type === 'language_toggle' ? 'Langues (V1)' :
                                                  b.type === 'language_toggle_v2' ? 'Langues (V2)' :
                                                    b.type === 'dropdown' ? 'Menu déroulant' :
                                                      b.type === 'dropdown_reference' ? 'Référence Dropdown' :
                                                        b.type === 'dynamic_text' ? 'Texte Dynamique' :
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start', minWidth: 0, overflowX: 'auto', paddingBottom: 24 }}>
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
                    onClick={() => setSelectedPage(pageIndex)}
                  >
                    <div className="page-margins" />
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
                    {page.blocks.map((b, idx) => {
                      const isSelected = (selectedIndex === idx || selectedIndices.includes(idx)) && selectedPage === pageIndex
                      return (
                        <div
                          key={idx}
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
                          {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize, width: b.props.width, height: b.props.height, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{b.props.text}</div>}
                          {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} />}
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
                                text = text.replace(/{student.firstName}/g, s.firstName).replace(/{student.lastName}/g, s.lastName)
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
                              border: '1px solid #000',
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
                                const currentYear = new Date().getFullYear()
                                const yearStr = `Année ${currentYear}-${currentYear + 1}`

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
                                if (b.props.field === 'year') return <div>{yearStr}</div>
                                if (b.props.field === 'class') return <div>{className || (studentId ? '' : '(Classe)')}</div>
                                if (b.props.field === 'currentLevel') return <div>{currentLevel || '(Niveau)'}</div>

                                return <div>Variable inconnue: {b.props.field}</div>
                              })()}
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
                                    zIndex: 1000,
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
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4ff'}
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
                              const expandedDividerColor = b.props.expandedDividerColor || 'rgba(255, 255, 255, 0.2)'
                              const expandedPadding = 4
                              const expandedTopGap = 6
                              const expandedLanguages = b.props.expandedLanguages || [
                                { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
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
                                  gridTemplateColumns: !expandedRows ? cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' ') : undefined,
                                  gridTemplateRows: !expandedRows ? rows.map(h => `${Math.max(1, Math.round(h))}px`).join(' ') : undefined,
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
                                        <div key={`row-unit-${ri}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>

                                          {/* Main Row Grid */}
                                          <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' '),
                                            columnGap: gapCol,
                                            height: mainRowHeight
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
                                            paddingBottom: expandedPadding
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
                                                  const toggleKey = `table_${idx}_row_${ri}_lang_${li}`
                                                  const isActive = previewData[toggleKey] === 'true'

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
                                                            onClick={(ev) => {
                                                                ev.stopPropagation()
                                                                setPreviewData({ ...previewData, [toggleKey]: isActive ? 'false' : 'true' })
                                                            }}
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
                                                      onClick={(ev) => {
                                                        ev.stopPropagation()
                                                        setPreviewData({ ...previewData, [toggleKey]: isActive ? 'false' : 'true' })
                                                      }}
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
                          {['image', 'text', 'dynamic_text', 'student_info', 'student_photo', 'category_title', 'competency_list', 'signature', 'signature_box', 'promotion_info', 'language_toggle', 'language_toggle_v2'].includes(b.type) && selectedIndex === idx && selectedPage === pageIndex && (
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
          style={{
            position: 'sticky',
            top: 24,
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 16,
            padding: '24px 20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
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
                        {b.type === 'text' && <div style={{ color: b.props.color, fontSize: (b.props.fontSize || 12) * 0.3 }}>{(b.props.text || '').slice(0, 20)}</div>}
                        {b.type === 'image' && <img src={b.props.url} style={{ width: (b.props.width || 120) * 0.3, height: (b.props.height || 120) * 0.3, borderRadius: 2 }} />}
                        {b.type === 'rect' && <div style={{ width: (b.props.width || 80) * 0.3, height: (b.props.height || 80) * 0.3, background: b.props.color, borderRadius: 2 }} />}
                        {b.type === 'signature_box' && <div style={{ width: (b.props.width || 200) * 0.3, height: (b.props.height || 80) * 0.3, border: '0.5px solid #000', background: '#fff' }} />}
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
              {selectedIndex != null ? (
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
                        value={tpl.pages[selectedPage].blocks[selectedIndex].props.text || ''}
                        onChange={e => updateSelected({ text: e.target.value })}
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
                              const r = await fetch('http://localhost:4000/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
                              const data = await r.json()
                              if (data?.url) { updateSelected({ url: data.url }); await refreshGallery() }
                            }}
                          />
                        </label>
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
                              onChange={e => updateSelectedTable(p => ({ ...p, expandedRows: e.target.checked }))}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Activer l'expansion des lignes</span>
                          </label>
                          {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                            <div style={{ padding: 12, background: '#f0f4ff', borderRadius: 8, marginTop: 8 }}>
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
                                      value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedDividerColor || '#ffffff'}
                                      onChange={e => updateSelectedTable(p => ({ ...p, expandedDividerColor: e.target.value }))}
                                      style={{ height: 38, width: 40, padding: 0, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
                                    />
                                    <input
                                      type="text"
                                      value={tpl.pages[selectedPage].blocks[selectedIndex].props.expandedDividerColor || 'rgba(255, 255, 255, 0.5)'}
                                      onChange={e => updateSelectedTable(p => ({ ...p, expandedDividerColor: e.target.value }))}
                                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                                    />
                                  </div>
                                </div>
                                <div className="note" style={{ marginTop: 4 }}>
                                  Les toggles de langue V2 seront configurés automatiquement pour chaque ligne.
                                  Vous pouvez personnaliser les langues disponibles ci-dessous:
                                </div>
                                <div style={{ display: 'grid', gap: 8 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6c757d' }}>Langues pour les toggles:</div>
                                  {((tpl.pages[selectedPage].blocks[selectedIndex].props.expandedLanguages || [
                                    { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                    { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                    { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                  ]) as any[]).map((lang: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, background: '#fff', borderRadius: 6 }}>
                                      <select
                                        value={lang.code}
                                        onChange={e => {
                                          const langData: Record<string, any> = {
                                            'en': { code: 'en', label: 'English', emoji: '🇬🇧' },
                                            'fr': { code: 'fr', label: 'Français', emoji: '🇫🇷' },
                                            'ar': { code: 'ar', label: 'العربية', emoji: '🇱🇧' },
                                            'lb': { code: 'lb', label: 'Lebanese', emoji: '🇱🇧' }
                                          }
                                          const langs = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.expandedLanguages || [
                                            { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                            { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                            { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                          ])]
                                          langs[i] = { ...langs[i], ...langData[e.target.value] }
                                          updateSelectedTable(p => ({ ...p, expandedLanguages: langs }))
                                        }}
                                        style={{ padding: 6, borderRadius: 6, border: '1px solid #ddd', flex: 1 }}
                                      >
                                        <option value="en">English</option>
                                        <option value="fr">Français</option>
                                        <option value="ar">العربية</option>
                                        <option value="lb">Lebanese</option>
                                      </select>
                                      <button
                                        className="btn secondary"
                                        onClick={() => {
                                          const langs = (tpl.pages[selectedPage].blocks[selectedIndex].props.expandedLanguages || [
                                            { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                            { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                            { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                          ]).filter((_: any, idx: number) => idx !== i)
                                          updateSelectedTable(p => ({ ...p, expandedLanguages: langs }))
                                        }}
                                        style={{ padding: '4px 8px', background: '#ef4444', color: '#fff' }}
                                      >✕</button>
                                    </div>
                                  ))}
                                  <button
                                    className="btn secondary"
                                    onClick={() => {
                                      const langs = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.expandedLanguages || [
                                        { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                        { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                        { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                      ])]
                                      langs.push({ code: 'en', label: 'English', emoji: '🇬🇧', active: false })
                                      updateSelectedTable(p => ({ ...p, expandedLanguages: langs }))
                                    }}
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                  >+ Ajouter une langue</button>
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
                        <div className="note">Colonnes</div>
                        {(tpl.pages[selectedPage].blocks[selectedIndex].props.columnWidths || []).map((w: number, i: number) => (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div>#{i + 1}</div>
                            <input type="number" value={Math.round(w)} onChange={e => {
                              const cols = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.columnWidths || [])]
                              cols[i] = Number(e.target.value)
                              updateSelectedTable(p => ({ ...p, columnWidths: cols }))
                            }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: 120 }} />
                            <button className="btn secondary" onClick={() => {
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
                            }}>Supprimer</button>
                          </div>
                        ))}
                        <div className="toolbar" style={{ display: 'flex', gap: 8 }}>
                          <button className="btn secondary" onClick={() => {
                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                            const cols = [...(props.columnWidths || [])]
                            const rows = [...(props.rowHeights || [])]
                            const cells = (props.cells || []).map((row: any[]) => [...row, { text: '', fontSize: 12, color: '#000', fill: 'transparent', borders: { l: {}, r: {}, t: {}, b: {} } }])
                            cols.push(120)
                            updateSelectedTable(p => ({ ...p, columnWidths: cols, cells }))
                          }}>Ajouter colonne</button>
                          <button className="btn secondary" onClick={() => {
                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                            const cols = [...(props.columnWidths || [])]
                            if (!cols.length) return
                            cols.pop()
                            const cells = (props.cells || []).map((row: any[]) => row.slice(0, cols.length))
                            updateSelectedTable(p => ({ ...p, columnWidths: cols, cells }))
                          }}>Supprimer colonne</button>
                        </div>
                      </div>
                      <div>
                        <div className="note">Lignes</div>
                        {(tpl.pages[selectedPage].blocks[selectedIndex].props.rowHeights || []).map((h: number, i: number) => (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div>#{i + 1}</div>
                            <input type="number" value={Math.round(h)} onChange={e => {
                              const rows = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.rowHeights || [])]
                              rows[i] = Number(e.target.value)
                              updateSelectedTable(p => ({ ...p, rowHeights: rows }))
                            }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: 120, marginRight: 8 }} />
                            {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                              <button
                                className="btn secondary"
                                title="Configurer les langues de cette ligne"
                                style={{ padding: '8px 10px', background: '#f0f4ff', color: '#6c5ce7', marginRight: 8, fontSize: 16 }}
                                onClick={() => setSelectedCell({ ri: i, ci: 0 })}
                              >
                                🌍
                              </button>
                            )}
                            <button className="btn secondary" onClick={() => {
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
                            }}>Supprimer</button>
                          </div>
                        ))}
                        <div className="toolbar" style={{ display: 'flex', gap: 8 }}>
                          <button className="btn secondary" onClick={() => {
                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                            const rows = [...(props.rowHeights || [])]
                            const cols = [...(props.columnWidths || [])]
                            const newRow = cols.map(() => ({ text: '', fontSize: 12, color: '#000', fill: 'transparent', borders: { l: {}, r: {}, t: {}, b: {} } }))
                            const cells = [...(props.cells || [])]
                            rows.push(40)
                            cells.push(newRow)
                            // Maintain rowLanguages array length
                            const rowLanguages = [...(props.rowLanguages || [])]
                            // Ensure it's at least as long as rows before pushing? No, just match length.
                            // If rowLanguages was shorter than rows (sparse), we just ignore.
                            // But accurate maintenance:
                            updateSelectedTable(p => ({ ...p, rowHeights: rows, cells, rowLanguages }))
                          }}>Ajouter ligne</button>
                          <button className="btn secondary" onClick={() => {
                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                            const rows = [...(props.rowHeights || [])]
                            if (!rows.length) return
                            rows.pop()
                            const cells = (props.cells || []).slice(0, rows.length)
                            const rowLanguages = (props.rowLanguages || []).slice(0, rows.length)
                            updateSelectedTable(p => ({ ...p, rowHeights: rows, cells, rowLanguages }))
                          }}>Supprimer ligne</button>
                        </div>
                      </div>
                      {selectedCell && (
                        <div>
                          {/* Row Expansion Config for this cell's row */}
                          {tpl.pages[selectedPage].blocks[selectedIndex].props.expandedRows && (
                            <div style={{ marginBottom: 12, borderBottom: '1px solid #e9ecef', paddingBottom: 12 }}>
                              <div className="note" style={{ fontWeight: 600, color: '#6c5ce7' }}>
                                Expansion Ligne {selectedCell.ri + 1}
                              </div>
                              {(() => {
                                const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                                const myRowLangs = props.rowLanguages?.[selectedCell.ri]
                                const globalLangs = props.expandedLanguages || [
                                  { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                                  { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                                  { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
                                ]
                                const currentLangs = myRowLangs || globalLangs
                                const isCustom = !!myRowLangs

                                return (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {!isCustom ? (
                                      <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                                        Utilise les paramètres globaux ({currentLangs.length} langues).
                                        <button className="btn secondary" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10 }} onClick={() => {
                                          updateSelectedTable(p => {
                                            const rl = [...(p.rowLanguages || [])]
                                            // Fill with undefined if sparse
                                            while (rl.length <= selectedCell.ri) { rl.push(undefined) }
                                            rl[selectedCell.ri] = JSON.parse(JSON.stringify(globalLangs))
                                            return { ...p, rowLanguages: rl }
                                          })
                                        }}>Personnaliser pour cette ligne</button>
                                      </div>
                                    ) : (
                                      <div>
                                        <div style={{ fontSize: 11, color: '#2ecc71', marginBottom: 6, fontWeight: 600 }}>
                                          ✓ Personnalisé pour cette ligne
                                          <button className="btn secondary" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10, color: '#e74c3c' }} onClick={() => {
                                            updateSelectedTable(p => {
                                              const rl = [...(p.rowLanguages || [])]
                                              if (rl.length > selectedCell.ri) rl[selectedCell.ri] = undefined
                                              return { ...p, rowLanguages: rl }
                                            })
                                          }}>Rétablir Global</button>
                                        </div>
                                        {/* Language Editor for Row */}
                                        <div style={{ display: 'grid', gap: 6 }}>
                                          {currentLangs.map((lang: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 4, background: '#f8f9fa', borderRadius: 4 }}>
                                              <div style={{ fontSize: 16 }}>{lang.emoji}</div>
                                              <div style={{ fontSize: 11, flex: 1 }}>{lang.label}</div>
                                              <button className="btn secondary" style={{ padding: '2px 6px', fontSize: 10, color: '#e74c3c' }} onClick={() => {
                                                updateSelectedTable(p => {
                                                  const rl = [...(p.rowLanguages || [])]
                                                  const rowL = [...(rl[selectedCell.ri] || [])]
                                                  rowL.splice(i, 1)
                                                  rl[selectedCell.ri] = rowL
                                                  return { ...p, rowLanguages: rl }
                                                })
                                              }}>✕</button>
                                            </div>
                                          ))}
                                          <div style={{ display: 'flex', gap: 4 }}>
                                            {/* Quick Add Buttons */}
                                            {[
                                              { code: 'en', label: 'English', emoji: '🇬🇧' },
                                              { code: 'fr', label: 'Français', emoji: '🇫🇷' },
                                              { code: 'ar', label: 'العربية', emoji: '🇱🇧' },
                                              { code: 'lb', label: 'Lebanese', emoji: '🇱🇧' }
                                            ].filter(x => !currentLangs.find((l: any) => l.code === x.code)).map(opt => (
                                              <button key={opt.code} className="btn secondary" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => {
                                                updateSelectedTable(p => {
                                                  const rl = [...(p.rowLanguages || [])]
                                                  const rowL = [...(rl[selectedCell.ri] || [])]
                                                  rowL.push({ ...opt, active: false })
                                                  rl[selectedCell.ri] = rowL
                                                  return { ...p, rowLanguages: rl }
                                                })
                                              }}>+ {opt.code.toUpperCase()}</button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}

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
                        <option value="year">Année Scolaire (ex: 2025/2026)</option>
                        <option value="class">Classe (ex: A)</option>
                        <option value="student">Nom de l'élève</option>
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
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn secondary" onClick={duplicateBlock} style={{ flex: 1 }}>Dupliquer le bloc</button>
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
