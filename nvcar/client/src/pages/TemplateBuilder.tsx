import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Year = { _id: string; name: string }
type ClassDoc = { _id: string; name: string; schoolYearId: string }
type StudentDoc = { _id: string; firstName: string; lastName: string }

const pageWidth = 800
const pageHeight = 1120

export default function TemplateBuilder() {
  const navigate = useNavigate()
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
  const [gallery, setGallery] = useState<string[]>([])
  const [scale, setScale] = useState(1)
  const [snap, setSnap] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null)
  const [list, setList] = useState<Template[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [continuousScroll, setContinuousScroll] = useState(false)

  const [error, setError] = useState('')
  const pptxInputRef = useRef<HTMLInputElement>(null)

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

  const blocksPalette: Block[] = useMemo(() => ([
    { type: 'text', props: { text: 'Titre', fontSize: 20, color: '#333' } },
    { type: 'image', props: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Eo_circle_pink_blank.svg/120px-Eo_circle_pink_blank.svg.png', width: 120, height: 120 } },
    { type: 'student_info', props: { fields: ['name', 'class', 'dob'], fontSize: 12, color: '#2d3436' } },
    { type: 'category_title', props: { categoryId: '', fontSize: 16, color: '#6c5ce7' } },
    { type: 'competency_list', props: { fontSize: 12, color: '#2d3436' } },
    { type: 'signature', props: { labels: ['Directeur', 'Enseignant', 'Parent'], fontSize: 12 } },
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
    { type: 'line', props: { x2: 300, y2: 0, stroke: '#b2bec3', strokeWidth: 2 } },
    { type: 'arrow', props: { x2: 120, y2: 0, stroke: '#6c5ce7', strokeWidth: 2 } },
    { type: 'dynamic_text', props: { text: '{student.firstName} {student.lastName}', fontSize: 14, color: '#2d3436' } },
    { type: 'qr', props: { url: 'https://example.com', width: 120, height: 120 } },
    { type: 'table', props: { x: 100, y: 100, columnWidths: [120, 160], rowHeights: [40, 40], cells: [[{ text: 'A1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B1', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }], [{ text: 'A2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }, { text: 'B2', fontSize: 12, color: '#000', fill: '#fff', borders: { l: { color: '#000', width: 1 }, r: { color: '#000', width: 1 }, t: { color: '#000', width: 1 }, b: { color: '#000', width: 1 } } }]] } },
  ]), [])

  const addBlock = (b: Block) => {
    const pages = [...tpl.pages]
    const page = { ...pages[selectedPage] }
    const zList = (page.blocks || []).map(bb => (bb.props?.z ?? 0))
    const nextZ = (zList.length ? Math.max(...zList) : 0) + 1
    const blocks = [...page.blocks, { type: b.type, props: { ...b.props, x: 100, y: 100, z: nextZ } }]
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

  if (viewMode === 'list') {
    return (
      <div className="container">
        <div className="header" style={{ justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 className="title">Mes Templates</h2>
          <button className="btn" onClick={() => setShowCreateModal(true)}>+ Nouveau Template</button>
        </div>
        
        {error && <div className="note" style={{ color: 'crimson', marginBottom: 16 }}>{error}</div>}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {list.map(item => (
            <div key={item._id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{item.name}</h3>
                <div className="note">{item.pages.length} page(s)</div>
              </div>
              <div className="toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={() => duplicateTemplate(item)} title="Dupliquer">
                   📋
                </button>
                <button className="btn secondary" onClick={() => item._id && deleteTemplate(item._id)} title="Supprimer" style={{ background: '#ff7675' }}>
                   🗑️
                </button>
                <button className="btn" onClick={() => { setTpl(item); setViewMode('edit'); setSelectedPage(0); setSelectedIndex(null) }}>
                   Éditer
                </button>
              </div>
            </div>
          ))}
        </div>

        {showCreateModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: 400 }}>
              <h3>Créer un nouveau template</h3>
              <input 
                autoFocus
                placeholder="Nom du template" 
                value={newTemplateName} 
                onChange={e => setNewTemplateName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && createTemplate()}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ddd', marginBottom: 16, boxSizing: 'border-box' }} 
              />
              <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={() => setShowCreateModal(false)}>Annuler</button>
                <button className="btn" onClick={createTemplate}>Créer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn secondary" onClick={() => { setViewMode('list'); loadTemplates() }}>← Retour</button>
            <h2 className="title" style={{ margin: 0 }}>Éditeur: {tpl.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
             <button className="btn" onClick={async () => { try { setError(''); setSaveStatus(''); await save(); setSaveStatus('Enregistré'); await loadTemplates() } catch (e: any) { setError('Échec de l\'enregistrement') } }}>Enregistrer</button>
          </div>
        </div>

        <div className="toolbar" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input placeholder="Nom du template" value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <button className="btn" onClick={() => { const pages = [...tpl.pages, { title: `Page ${tpl.pages.length + 1}`, blocks: [] }]; setTpl({ ...tpl, pages }); setSelectedPage(pages.length - 1); setSelectedIndex(null) }}>Ajouter une page</button>
          <select value={selectedPage} onChange={e => setSelectedPage(Number(e.target.value))} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            {tpl.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
          </select>
          <input placeholder="Couleur de fond (ex: #f9f1ff)" value={tpl.pages[selectedPage].bgColor || ''} onChange={e => { const pages = [...tpl.pages]; pages[selectedPage] = { ...pages[selectedPage], bgColor: e.target.value }; setTpl({ ...tpl, pages }) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap</label>
          <button className="btn secondary" onClick={() => setContinuousScroll(!continuousScroll)}>{continuousScroll ? 'Vue page par page' : 'Vue continue'}</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Zoom <input type="range" min={0.5} max={2} step={0.1} value={scale} onChange={e => setScale(parseFloat(e.target.value))} /></label>
          <select value={yearId} onChange={e => setYearId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Année</option>
            {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
          </select>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Classe</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            <option value="">Élève</option>
            {students.map(s => <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>)}
          </select>
          {previewUrl && <a className="btn secondary" href={previewUrl} target="_blank">Aperçu PDF</a>}
          {bulkUrl && <a className="btn secondary" href={bulkUrl} target="_blank">Export classe (ZIP)</a>}
          
          <button className="btn secondary" onClick={async () => {
            const blob = new Blob([JSON.stringify(tpl)], { type: 'application/json' })
            const fd = new FormData()
            fd.append('file', new File([blob], `${tpl.name || 'template'}.json`, { type: 'application/json' }))
            await fetch('http://localhost:4000/media/upload?folder=gradebook-templates', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
            setSaveStatus('Modèle enregistré dans médias')
          }}>Enregistrer modèle dans médias</button>
          <button className="btn secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(tpl)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${tpl.name || 'template'}.json`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            a.remove()
            URL.revokeObjectURL(url)
          }}>Télécharger JSON</button>
          <button className="btn secondary" onClick={() => pptxInputRef.current?.click()}>Importer PPTX</button>
          <input type="file" ref={pptxInputRef} style={{ display: 'none' }} accept=".pptx" onChange={handlePptxImport} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 380px', gap: 24, alignItems: 'start' }}>
          <div className="card" style={{ position: 'sticky', top: 24, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
            <h3>Blocs</h3>
            {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}
            {blocksPalette.map((b, i) => (
              <div key={i} className="competency" style={{ cursor: 'pointer' }} onClick={() => addBlock(b)}>
                <div>{b.type}</div>
                <div className="pill">Ajouter</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', minWidth: 0 }}>
            {(continuousScroll ? tpl.pages : [tpl.pages[selectedPage]]).map((page, i) => {
              const pageIndex = continuousScroll ? i : selectedPage
              return (
                <div key={pageIndex} className="card page-canvas" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', height: pageHeight, width: pageWidth, background: page.bgColor || '#fff', overflow: 'hidden', position: 'relative', marginBottom: continuousScroll ? 24 : 0 }} onClick={() => setSelectedPage(pageIndex)}>
                  {continuousScroll && <div style={{ position: 'absolute', top: -20, left: 0, color: '#888', fontSize: 12 }}>Page {pageIndex + 1}</div>}
                  <div className="page-margins" />
                  {page.blocks.map((b, idx) => (
                    <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: (b.props.z ?? idx), border: (selectedIndex === idx && selectedPage === pageIndex) ? '2px solid var(--accent)' : '1px dashed #ccc', padding: 6, borderRadius: 6 }} 
                        onMouseDown={(e) => onDrag(e, pageIndex, idx)} 
                        onClick={(e) => { e.stopPropagation(); setSelectedPage(pageIndex); setSelectedIndex(idx) }}>
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
                {b.type === 'dynamic_text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                {b.type === 'student_info' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Nom, Classe, Naissance</div>}
                {b.type === 'category_title' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Titre catégorie</div>}
                {b.type === 'competency_list' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>Liste des compétences</div>}
                {b.type === 'signature' && <div style={{ fontSize: b.props.fontSize }}>{(b.props.labels || []).join(' / ')}</div>}
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
                  ))}
                </div>
              )
            })}
          </div>
          <div className="card" style={{ position: 'sticky', top: 24, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
            <h3>Propriétés</h3>
            {saveStatus && <div className="note">{saveStatus}</div>}
            {selectedIndex != null ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="note">Type: {tpl.pages[selectedPage].blocks[selectedIndex].type}</div>
                <input placeholder="X" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.x || 0} onChange={e => updateSelected({ x: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Y" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.y || 0} onChange={e => updateSelected({ y: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <div className="toolbar" style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Z-index" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.z ?? selectedIndex} onChange={e => updateSelected({ z: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                  <button className="btn secondary" onClick={() => {
                    const zs = tpl.pages[selectedPage].blocks.map(b => (b.props?.z ?? 0))
                    const maxZ = zs.length ? Math.max(...zs) : 0
                    updateSelected({ z: maxZ + 1 })
                  }}>Mettre devant</button>
                  <button className="btn secondary" onClick={() => {
                    const zs = tpl.pages[selectedPage].blocks.map(b => (b.props?.z ?? 0))
                    const minZ = zs.length ? Math.min(...zs) : 0
                    updateSelected({ z: minZ - 1 })
                  }}>Mettre derrière</button>
                </div>
                <input placeholder="Couleur" value={tpl.pages[selectedPage].blocks[selectedIndex].props.color || ''} onChange={e => updateSelected({ color: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <input placeholder="Taille police" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.fontSize || tpl.pages[selectedPage].blocks[selectedIndex].props.size || 12} onChange={e => updateSelected({ fontSize: Number(e.target.value), size: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'text' && (
                  <textarea placeholder="Texte" rows={4} value={tpl.pages[selectedPage].blocks[selectedIndex].props.text || ''} onChange={e => updateSelected({ text: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                )}
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'image' && (
                  <>
                    <input placeholder="URL image" value={tpl.pages[selectedPage].blocks[selectedIndex].props.url || ''} onChange={e => updateSelected({ url: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Largeur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.width || 120} onChange={e => updateSelected({ width: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Hauteur" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.height || 120} onChange={e => updateSelected({ height: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input type="file" accept="image/*" onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const fd = new FormData()
                      fd.append('file', f)
                      const r = await fetch('http://localhost:4000/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd })
                      const data = await r.json()
                      if (data?.url) { updateSelected({ url: `http://localhost:4000${data.url}` }); await refreshGallery() }
                    }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {gallery.map(u => (
                        <div key={u} className="card" style={{ padding: 4, cursor: 'pointer' }} onClick={() => updateSelected({ url: `http://localhost:4000${u}` })}>
                          <img src={`http://localhost:4000${u}`} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                          <div className="note" style={{ fontSize: 10, marginTop: 4 }}>{u.split('/').pop()}</div>
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
                {tpl.pages[selectedPage].blocks[selectedIndex].type === 'language_toggle' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input placeholder="Rayon" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.radius || 40} onChange={e => updateSelected({ radius: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input placeholder="Espacement" type="number" value={tpl.pages[selectedPage].blocks[selectedIndex].props.spacing || 12} onChange={e => updateSelected({ spacing: Number(e.target.value) })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    {((tpl.pages[selectedPage].blocks[selectedIndex].props.items || []) as any[]).map((it: any, i: number) => (
                      <div key={i} className="competency" style={{ alignItems: 'center', gap: 8 }}>
                        <div>{it.label || it.code}</div>
                        <button className="btn secondary" onClick={() => {
                          const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                          items[i] = { ...items[i], active: !items[i].active }
                          updateSelected({ items })
                        }}>{it.active ? 'Actif' : 'Inactif'}</button>
                        <input placeholder="Logo URL" value={it.logo || ''} onChange={e => {
                          const items = [...(tpl.pages[selectedPage].blocks[selectedIndex].props.items || [])]
                          items[i] = { ...items[i], logo: e.target.value }
                          updateSelected({ items })
                        }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }} />
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn secondary" onClick={() => {
                  const pages = [...tpl.pages]
                  const page = { ...pages[selectedPage] }
                  const blocks = page.blocks.filter((_, i) => i !== selectedIndex)
                  pages[selectedPage] = { ...page, blocks }
                  setTpl({ ...tpl, pages }); setSelectedIndex(null)
                  setSelectedCell(null)
                }}>Supprimer le bloc</button>
              </div>
            ) : (
              <div className="note">Sélectionnez un bloc pour éditer ses propriétés.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
