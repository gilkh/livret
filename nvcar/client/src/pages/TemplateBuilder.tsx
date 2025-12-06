import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useLevels } from '../context/LevelContext'
import { useSocket } from '../context/SocketContext'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Year = { _id: string; name: string }
type ClassDoc = { _id: string; name: string; schoolYearId: string }
type StudentDoc = { _id: string; firstName: string; lastName: string }

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
  const [gallery, setGallery] = useState<{ name: string, path: string, type: string }[]>([])
  const [scale, setScale] = useState(1)
  const [snap, setSnap] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null)
  const [list, setList] = useState<Template[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [continuousScroll, setContinuousScroll] = useState(false)
  const [previewData, setPreviewData] = useState<Record<string, string>>({})
  const [rightPanelView, setRightPanelView] = useState<'properties' | 'slides'>('properties')

  const [error, setError] = useState('')
  const pptxInputRef = useRef<HTMLInputElement>(null)

  const socket = useSocket()
  const isRemoteUpdate = useRef(false)

  useEffect(() => {
    if (viewMode === 'edit' && tpl._id && socket) {
      socket.emit('join-template', tpl._id)
      
      const handleUpdate = (newTpl: any) => {
        isRemoteUpdate.current = true
        setTpl(newTpl)
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

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  
  // Custom dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const blocksPalette: Block[] = useMemo(() => ([
    { type: 'text', props: { text: 'Titre', fontSize: 20, color: '#333' } },
    { type: 'image', props: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Eo_circle_pink_blank.svg/120px-Eo_circle_pink_blank.svg.png', width: 120, height: 120 } },
    { type: 'student_info', props: { fields: ['name', 'class', 'dob'], fontSize: 12, color: '#2d3436' } },
    { type: 'category_title', props: { categoryId: '', fontSize: 16, color: '#6c5ce7' } },
    { type: 'competency_list', props: { fontSize: 12, color: '#2d3436' } },
    { type: 'signature', props: { labels: ['Directeur', 'Enseignant', 'Parent'], fontSize: 12 } },
    { type: 'signature_box', props: { width: 200, height: 80, label: 'Signature Mi-Année', period: 'mid-year' } },
    { type: 'signature_box', props: { width: 200, height: 80, label: 'Signature Fin d\'Année', period: 'end-year' } },
    
    // PS -> MS
    { type: 'promotion_info', props: { field: 'year', targetLevel: 'MS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Année (PS->MS)' } },
    { type: 'promotion_info', props: { field: 'currentLevel', targetLevel: 'MS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Niveau (PS)' } },
    { type: 'promotion_info', props: { field: 'class', targetLevel: 'MS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Classe (PS)' } },
    { type: 'promotion_info', props: { field: 'level', targetLevel: 'MS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Passage en MS' } },
    
    // MS -> GS
    { type: 'promotion_info', props: { field: 'year', targetLevel: 'GS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Année (MS->GS)' } },
    { type: 'promotion_info', props: { field: 'currentLevel', targetLevel: 'GS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Niveau (MS)' } },
    { type: 'promotion_info', props: { field: 'class', targetLevel: 'GS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Classe (MS)' } },
    { type: 'promotion_info', props: { field: 'level', targetLevel: 'GS', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Passage en GS' } },

    // GS -> EB1
    { type: 'promotion_info', props: { field: 'year', targetLevel: 'EB1', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Année (GS->EB1)' } },
    { type: 'promotion_info', props: { field: 'currentLevel', targetLevel: 'EB1', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Niveau (GS)' } },
    { type: 'promotion_info', props: { field: 'class', targetLevel: 'EB1', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Classe (GS)' } },
    { type: 'promotion_info', props: { field: 'level', targetLevel: 'EB1', fontSize: 12, color: '#2d3436', width: 150, height: 30, label: 'Passage en EB1' } },
    
    { type: 'rect', props: { width: 160, height: 80, color: '#eef1f7' } },
    { type: 'circle', props: { radius: 60, color: '#ffeaa7' } },
    {
      type: 'language_toggle', props: {
        radius: 40, spacing: 12, items: [
          { code: 'en', label: 'English', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg', active: false },
          { code: 'fr', label: 'Français', logo: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg', active: false },
          { code: 'ar', label: 'العربية', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg', active: false },
        ]
      }
    },
    { type: 'dropdown', props: { label: 'Menu déroulant', options: ['Option 1', 'Option 2'], variableName: 'var1', width: 200, height: 40, fontSize: 12, color: '#333', semesters: [1, 2] } },
    { type: 'dropdown_reference', props: { dropdownNumber: 1, text: 'Référence dropdown #{number}', fontSize: 12, color: '#2d3436' } },
    { type: 'line', props: { x2: 300, y2: 0, stroke: '#b2bec3', strokeWidth: 2 } },
    { type: 'arrow', props: { x2: 120, y2: 0, stroke: '#6c5ce7', strokeWidth: 2 } },
    { type: 'dynamic_text', props: { text: '{student.firstName} {student.lastName}', fontSize: 14, color: '#2d3436' } },
    { type: 'qr', props: { url: 'https://example.com', width: 120, height: 120 } },
    { type: 'table', props: { x: 100, y: 100, columnWidths: [120, 160], rowHeights: [40, 40], cells: [[{ text: 'A1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }], [{ text: 'A2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }]] } },
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
    setTpl({ ...tpl, pages })
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
    setTpl({ ...tpl, pages })
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
    setTpl({ ...tpl, pages })
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
    setTpl({ ...tpl, pages })
  }

  const onDrag = (e: React.MouseEvent, pageIndex: number, idx: number) => {
    const startX = e.clientX
    const startY = e.clientY
    const block = tpl.pages[pageIndex].blocks[idx]
    const baseX = block.props.x || 0
    const baseY = block.props.y || 0
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const pages = [...tpl.pages]
      const page = { ...pages[pageIndex] }
      const blocks = [...page.blocks]
      const nx = Math.max(0, Math.min(pageWidth - 20, baseX + dx))
      const ny = Math.max(0, Math.min(pageHeight - 20, baseY + dy))
      const sx = snap ? Math.round(nx / 10) * 10 : nx
      const sy = snap ? Math.round(ny / 10) * 10 : ny
      blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, x: sx, y: sy } }
      pages[pageIndex] = { ...page, blocks }
      setTpl({ ...tpl, pages })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const save = async () => {
    if (tpl._id) {
      const r = await api.patch(`/templates/${tpl._id}`, tpl)
      setTpl(r.data)
    } else {
      const r = await api.post('/templates', tpl)
      setTpl(r.data)
    }
  }

  const previewUrl = tpl._id && studentId ? `http://localhost:4000/pdf/student/${studentId}?templateId=${tpl._id}` : ''
  const bulkUrl = tpl._id && classId ? `http://localhost:4000/pdf/class/${classId}/batch?templateId=${tpl._id}` : ''

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
  const loadStudents = async (cls: string) => { try { const r = await api.get(`/students/by-class/${cls}`); setStudents(r.data) } catch { } }


  const handlePptxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)

    try {
      setSaveStatus('Importation en cours...')
      const r = await api.post('/templates/import-pptx', fd)
      setTpl(r.data)
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
      setTpl(r.data)
      setViewMode('edit')
      setShowCreateModal(false)
      setNewTemplateName('')
      await loadTemplates()
    } catch (e) {
      setError('Erreur lors de la création')
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce template ?')) return
    try {
      await api.delete(`/templates/${id}`)
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
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  minHeight: 220,
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  border: '2px solid #e9ecef',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)'
                  e.currentTarget.style.borderColor = '#667eea'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                  e.currentTarget.style.borderColor = '#e9ecef'
                }}
              >
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  height: 4, 
                  background: 'linear-gradient(90deg, #667eea, #764ba2)'
                }} />
                
                <div style={{ flex: 1, padding: '20px 24px' }}>
                  <h3 style={{ 
                    margin: '0 0 12px 0', 
                    fontSize: 20, 
                    fontWeight: 600,
                    color: '#2d3436',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </h3>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 16,
                    fontSize: 14,
                    color: '#6c757d'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <span>{item.pages.length} page{item.pages.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                <div style={{ 
                  padding: '16px 24px', 
                  background: '#f8f9fa',
                  borderTop: '1px solid #e9ecef',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end'
                }}>
                  <button 
                    className="btn secondary" 
                    onClick={(e) => { e.stopPropagation(); duplicateTemplate(item) }} 
                    title="Dupliquer"
                    style={{ 
                      padding: '8px 16px',
                      fontSize: 14,
                      background: '#fff',
                      border: '1px solid #dee2e6'
                    }}
                  >
                    📋 Dupliquer
                  </button>
                  <button 
                    className="btn secondary" 
                    onClick={(e) => { e.stopPropagation(); item._id && deleteTemplate(item._id) }} 
                    title="Supprimer" 
                    style={{ 
                      padding: '8px 16px',
                      fontSize: 14,
                      background: '#fff',
                      border: '1px solid #ffcdd2',
                      color: '#dc3545'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#dc3545'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff'
                      e.currentTarget.style.color = '#dc3545'
                    }}
                  >
                    🗑️
                  </button>
                  <button 
                    className="btn" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setTpl(item); 
                      setViewMode('edit'); 
                      setSelectedPage(0); 
                      setSelectedIndex(null) 
                    }}
                    style={{ 
                      padding: '8px 20px',
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    ✏️ Éditer
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

      {/* Status Messages */}
      {saveStatus && (
        <div style={{ 
          padding: '14px 20px', 
          background: 'linear-gradient(135deg, #10b981, #059669)', 
          color: 'white', 
          borderRadius: 12, 
          marginBottom: 20, 
          fontWeight: 600, 
          fontSize: 15,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span style={{ fontSize: 20 }}>✓</span> {saveStatus}
        </div>
      )}
      {error && (
        <div style={{ 
          padding: '14px 20px', 
          background: 'linear-gradient(135deg, #ef4444, #dc2626)', 
          color: 'white', 
          borderRadius: 12, 
          marginBottom: 20, 
          fontWeight: 600, 
          fontSize: 15,
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span style={{ fontSize: 20 }}>✗</span> {error}
        </div>
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
            <a 
              className="btn secondary" 
              href={previewUrl} 
              target="_blank"
              style={{ 
                padding: '8px 16px',
                fontSize: 14,
                textDecoration: 'none'
              }}
            >
              👁️ Aperçu PDF
            </a>
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
                await fetch('http://localhost:4000/media/upload?folder=gradebook-templates', { 
                  method: 'POST', 
                  headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, 
                  body: fd 
                })
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

          {/* Text & Content */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Texte & Contenu
            </div>
            {[
              blocksPalette.find(b => b.type === 'text'),
              blocksPalette.find(b => b.type === 'dynamic_text'),
              blocksPalette.find(b => b.type === 'student_info'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'text' && '📝'}
                    {b!.type === 'dynamic_text' && '🔤'}
                    {b!.type === 'student_info' && '👤'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'text' && 'Texte'}
                    {b!.type === 'dynamic_text' && 'Texte dynamique'}
                    {b!.type === 'student_info' && 'Info élève'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Shapes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Formes
            </div>
            {[
              blocksPalette.find(b => b.type === 'rect'),
              blocksPalette.find(b => b.type === 'circle'),
              blocksPalette.find(b => b.type === 'line'),
              blocksPalette.find(b => b.type === 'arrow'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'rect' && '▭'}
                    {b!.type === 'circle' && '⬤'}
                    {b!.type === 'line' && '━'}
                    {b!.type === 'arrow' && '➜'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'rect' && 'Rectangle'}
                    {b!.type === 'circle' && 'Cercle'}
                    {b!.type === 'line' && 'Ligne'}
                    {b!.type === 'arrow' && 'Flèche'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Media & Advanced */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Média & Avancé
            </div>
            {[
              blocksPalette.find(b => b.type === 'image'),
              blocksPalette.find(b => b.type === 'qr'),
              blocksPalette.find(b => b.type === 'table'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'image' && '🖼️'}
                    {b!.type === 'qr' && '📱'}
                    {b!.type === 'table' && '📊'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'image' && 'Image'}
                    {b!.type === 'qr' && 'QR Code'}
                    {b!.type === 'table' && 'Tableau'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Competencies */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Compétences
            </div>
            {[
              blocksPalette.find(b => b.type === 'category_title'),
              blocksPalette.find(b => b.type === 'competency_list'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'category_title' && '📑'}
                    {b!.type === 'competency_list' && '✅'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'category_title' && 'Catégorie'}
                    {b!.type === 'competency_list' && 'Compétences'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Signatures */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Signatures
            </div>
            {[
              blocksPalette.find(b => b.type === 'signature'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'signature' && '✍️'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature' && 'Signatures'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Mi-Année PS */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Mi-Année PS
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year')?.props, level: 'PS' } },
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Mi-Année')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Mi-Année MS */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Mi-Année MS
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year')?.props, level: 'MS' } },
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Mi-Année')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Mi-Année GS */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Mi-Année GS
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'mid-year')?.props, level: 'GS' } },
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Mi-Année')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Fin d'Année PS (Vers MS) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Fin d'Année PS (Vers MS)
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year')?.props, level: 'PS' } },
              ...blocksPalette.filter(b => b.type === 'promotion_info' && b.props.targetLevel === 'MS').map(b => ({ ...b, props: { ...b.props, level: 'PS' } })),
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                    {b!.type === 'promotion_info' && '🎓'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Fin Année')}
                    {b!.type === 'promotion_info' && (b!.props.label || 'Info Passage')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Fin d'Année MS (Vers GS) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Fin d'Année MS (Vers GS)
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year')?.props, level: 'MS' } },
              ...blocksPalette.filter(b => b.type === 'promotion_info' && b.props.targetLevel === 'GS').map(b => ({ ...b, props: { ...b.props, level: 'MS' } })),
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                    {b!.type === 'promotion_info' && '🎓'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Fin Année')}
                    {b!.type === 'promotion_info' && (b!.props.label || 'Info Passage')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Fin d'Année GS (Vers EB1) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Fin d'Année GS (Vers EB1)
            </div>
            {[
              { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year'), props: { ...blocksPalette.find(b => b.type === 'signature_box' && b.props.period === 'end-year')?.props, level: 'GS' } },
              ...blocksPalette.filter(b => b.type === 'promotion_info' && b.props.targetLevel === 'EB1').map(b => ({ ...b, props: { ...b.props, level: 'GS' } })),
            ].filter(b => b.type).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b as Block)}
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
                    {b!.type === 'signature_box' && '📝'}
                    {b!.type === 'promotion_info' && '🎓'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'signature_box' && (b!.props.label || 'Signature Fin Année')}
                    {b!.type === 'promotion_info' && (b!.props.label || 'Info Passage')}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>

          {/* Interactif */}
          <div>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              color: '#6c757d', 
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Interactif
            </div>
            {[
              blocksPalette.find(b => b.type === 'dropdown'),
              blocksPalette.find(b => b.type === 'dropdown_reference'),
              blocksPalette.find(b => b.type === 'language_toggle'),
            ].filter(Boolean).map((b, i) => (
              <div 
                key={i}
                onClick={() => addBlock(b!)}
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
                    {b!.type === 'dropdown' && '📋'}
                    {b!.type === 'dropdown_reference' && '🔗'}
                    {b!.type === 'language_toggle' && '🌐'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {b!.type === 'dropdown' && 'Menu déroulant'}
                    {b!.type === 'dropdown_reference' && 'Réf. dropdown'}
                    {b!.type === 'language_toggle' && 'Langues'}
                  </span>
                </div>
                <span style={{ fontSize: 18, color: '#667eea' }}>+</span>
              </div>
            ))}
          </div>
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
                  {page.blocks.map((b, idx) => {
                    const isSelected = selectedIndex === idx && selectedPage === pageIndex
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
                        onClick={(e) => { e.stopPropagation(); setSelectedPage(pageIndex); setSelectedIndex(idx) }}
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
                {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} />}
                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%', border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none' }} />}
                {b.type === 'language_toggle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: b.props.spacing || 12 }}>
                    {(b.props.items || []).map((it: any, i: number) => {
                      const r = b.props.radius || 40
                      const size = r * 2
                      return (
                        <div key={i} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', position: 'relative', cursor: 'pointer', boxShadow: it.active ? '0 0 0 2px #6c5ce7' : 'none' }}
                          onClick={(ev) => { ev.stopPropagation(); const pages = [...tpl.pages]; const page = { ...pages[selectedPage] }; const blocks = [...page.blocks]; const items = [...(blocks[idx].props.items || [])]; items[i] = { ...items[i], active: !items[i].active }; blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, items } }; pages[selectedPage] = { ...page, blocks }; setTpl({ ...tpl, pages }) }}>
                          {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                          <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{it.label || it.code}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{(() => {
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
                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{(() => {
                  if (studentId) {
                    const s = students.find(st => st._id === studentId) as any
                    if (s) return `${s.firstName} ${s.lastName}, ${s.className || 'Classe'}, ${s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : 'Date'}`
                  }
                  return 'Nom, Classe, Naissance'
                })()}</div>}
                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Titre catégorie</div>}
                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Liste des compétences</div>}
                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
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
                    {!b.props.field && (
                      <>
                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>🎓 Passage en {b.props.targetLevel || '...'}</div>
                        <div>{studentId ? 'Nom Prénom' : '{Nom Prénom}'}</div>
                        <div style={{ fontSize: '0.9em', opacity: 0.7 }}>Année {new Date().getFullYear()}-{new Date().getFullYear()+1}</div>
                      </>
                    )}
                    {b.props.field === 'level' && (
                      <div style={{ fontWeight: 'bold' }}>Passage en {b.props.targetLevel || '...'}</div>
                    )}
                    {b.props.field === 'student' && (
                      <div>{studentId ? 'Nom Prénom' : '{Nom Prénom}'}</div>
                    )}
                    {b.props.field === 'year' && (
                      <div>Année {new Date().getFullYear()}-{new Date().getFullYear()+1}</div>
                    )}
                    {b.props.field === 'class' && (
                      <div>{studentId ? 'Classe' : '{Classe}'}</div>
                    )}
                    {b.props.field === 'currentLevel' && (
                      <div>{studentId ? 'Niveau' : '{Niveau}'}</div>
                    )}
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
                    const cols: number[] = b.props.columnWidths || []
                    const rows: number[] = b.props.rowHeights || []
                    const cells: any[][] = b.props.cells || []
                    const width = cols.reduce((a, c) => a + (c || 0), 0)
                    const height = rows.reduce((a, r) => a + (r || 0), 0)
                    const colOffsets: number[] = [0]
                    for (let i = 0; i < cols.length; i++) colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0)
                    const rowOffsets: number[] = [0]
                    for (let i = 0; i < rows.length; i++) rowOffsets[i + 1] = rowOffsets[i] + (rows[i] || 0)
                    return (
                      <div style={{ position: 'relative', width, height, display: 'grid', gridTemplateColumns: cols.map(w => `${Math.max(1, Math.round(w))}px`).join(' '), gridTemplateRows: rows.map(h => `${Math.max(1, Math.round(h))}px`).join(' ') }}>
                        {cells.flatMap((row, ri) => row.map((cell, ci) => {
                          const bl = cell?.borders?.l; const br = cell?.borders?.r; const bt = cell?.borders?.t; const bb = cell?.borders?.b
                          const style: React.CSSProperties = {
                            background: cell?.fill || 'transparent',
                            borderLeft: bl?.width ? `${bl.width}px solid ${bl.color || '#000'}` : 'none',
                            borderRight: br?.width ? `${br.width}px solid ${br.color || '#000'}` : 'none',
                            borderTop: bt?.width ? `${bt.width}px solid ${bt.color || '#000'}` : 'none',
                            borderBottom: bb?.width ? `${bb.width}px solid ${bb.color || '#000'}` : 'none',
                            padding: 4, boxSizing: 'border-box'
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
                        }))}
                        {cols.map((_, i) => (
                          <div key={`col-h-${i}`} style={{ position: 'absolute', left: Math.max(0, (colOffsets[i + 1] || 0) - 3), top: 0, width: 6, height, cursor: 'col-resize' }}
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
                          <div key={`row-h-${i}`} style={{ position: 'absolute', left: 0, top: Math.max(0, (rowOffsets[i + 1] || 0) - 3), width, height: 6, cursor: 'row-resize' }}
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
                {(b.type === 'image' || b.type === 'text') && selectedIndex === idx && selectedPage === pageIndex && (
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
                            const startW = b.props.width || (b.type === 'text' ? 120 : 120)
                            const startH = b.props.height || (b.type === 'text' ? 60 : 120)
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

                              updateSelected({ width: newW, height: newH, x: newX, y: newY })
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
            <h3 style={{ 
              margin: '0 0 20px 0', 
              fontSize: 18, 
              fontWeight: 600,
              color: '#2d3436'
            }}>
              Propriétés du bloc
            </h3>
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
                            if (data?.url) { updateSelected({ url: `http://localhost:4000${data.url}` }); await refreshGallery() }
                          }} 
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {gallery.filter(u => u.type === 'file').map(u => (
                        <div key={u.path} className="card" style={{ padding: 4, cursor: 'pointer' }} onClick={() => updateSelected({ url: `http://localhost:4000/uploads${u.path}` })}>
                          <img src={`http://localhost:4000/uploads${u.path}`} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                          <div className="note" style={{ fontSize: 10, marginTop: 4 }}>{u.name}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'table' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="note">Table</div>
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
                          }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: 120 }} />
                          <button className="btn secondary" onClick={() => {
                            const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                            const rows = [...(props.rowHeights || [])]
                            if (!rows.length) return
                            rows.splice(i, 1)
                            const cells = (props.cells || []).filter((_: any, ri: number) => ri !== i)
                            updateSelectedTable(p => ({ ...p, rowHeights: rows, cells }))
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
                          updateSelectedTable(p => ({ ...p, rowHeights: rows, cells }))
                        }}>Ajouter ligne</button>
                        <button className="btn secondary" onClick={() => {
                          const props = tpl.pages[selectedPage].blocks[selectedIndex].props
                          const rows = [...(props.rowHeights || [])]
                          if (!rows.length) return
                          rows.pop()
                          const cells = (props.cells || []).slice(0, rows.length)
                          updateSelectedTable(p => ({ ...p, rowHeights: rows, cells }))
                        }}>Supprimer ligne</button>
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
                                {(['l','r','t','b'] as const).map(side => (
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
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'category_title' && (
                  <input placeholder="ID catégorie" value={tpl.pages[selectedPage].blocks[selectedIndex].props.categoryId || ''} onChange={e => updateSelected({ categoryId: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'competency_list' && (
                  <input placeholder="ID catégorie (optionnel)" value={tpl.pages[selectedPage].blocks[selectedIndex].props.categoryId || ''} onChange={e => updateSelected({ categoryId: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'signature' && (
                  <textarea placeholder="Labels séparés par des virgules" rows={3} value={(tpl.pages[selectedPage].blocks[selectedIndex].props.labels || []).join(',')} onChange={e => updateSelected({ labels: e.target.value.split(',').map(s => s.trim()) })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'promotion_info' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="note">
                      {tpl.pages[selectedPage].blocks[selectedIndex].props.field === 'level' && 'Info Passage (Niveau)'}
                      {tpl.pages[selectedPage].blocks[selectedIndex].props.field === 'student' && 'Info Passage (Élève)'}
                      {tpl.pages[selectedPage].blocks[selectedIndex].props.field === 'year' && 'Info Passage (Année)'}
                      {!tpl.pages[selectedPage].blocks[selectedIndex].props.field && 'Info Passage (Complet)'}
                    </div>
                    <label style={{ display: 'block', fontSize: 11, color: '#6c757d', marginBottom: 4, fontWeight: 600 }}>Niveau cible</label>
                    <select 
                      value={tpl.pages[selectedPage].blocks[selectedIndex].props.targetLevel || 'MS'} 
                      onChange={e => updateSelected({ targetLevel: e.target.value })} 
                      style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', width: '100%' }}
                    >
                      <option value="MS">MS</option>
                      <option value="GS">GS</option>
                      <option value="EB1">EB1</option>
                    </select>
                    <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || (tpl.pages[selectedPage].blocks[selectedIndex].props.field ? 150 : 300)} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || (tpl.pages[selectedPage].blocks[selectedIndex].props.field ? 30 : 100)} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                  </div>
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'language_toggle' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input placeholder="Rayon" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.radius || 40} onChange={e => updateSelected({ radius: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Espacement" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.spacing || 12} onChange={e => updateSelected({ spacing: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
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
