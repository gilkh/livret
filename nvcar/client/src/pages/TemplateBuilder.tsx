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
  const [clipboard, setClipboard] = useState<Block[] | null>(null)
  const [list, setList] = useState<Template[]>([])
  const [saveStatus, setSaveStatus] = useState('')

  const [error, setError] = useState('')
  const pptxInputRef = useRef<HTMLInputElement>(null)

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

  const onDrag = (e: React.MouseEvent, idx: number) => {
    const startX = e.clientX
    const startY = e.clientY
    const block = tpl.pages[selectedPage].blocks[idx]
    const baseX = block.props.x || 0
    const baseY = block.props.y || 0
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const pages = [...tpl.pages]
      const page = { ...pages[selectedPage] }
      const blocks = [...page.blocks]
      const nx = Math.max(0, Math.min(pageWidth - 20, baseX + dx))
      const ny = Math.max(0, Math.min(pageHeight - 20, baseY + dy))
      const sx = snap ? Math.round(nx / 10) * 10 : nx
      const sy = snap ? Math.round(ny / 10) * 10 : ny
      blocks[idx] = { ...blocks[idx], props: { ...blocks[idx].props, x: sx, y: sy } }
      pages[selectedPage] = { ...page, blocks }
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
      // Check if it's an authentication error
      if (e.response?.status === 401 || e.response?.status === 403) {
        setError('Session expirée. Veuillez vous reconnecter.')
        // Redirect to login after a short delay
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

    // Reset input
    if (pptxInputRef.current) pptxInputRef.current.value = ''
  }

  useEffect(() => { refreshGallery(); loadTemplates(); loadYears() }, [])
  useEffect(() => { if (yearId) { loadClasses(yearId); setClassId(''); setStudents([]); setStudentId('') } }, [yearId])
  useEffect(() => { if (classId) { loadStudents(classId); setStudentId('') } }, [classId])

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <h2 className="title">Éditeur de template</h2>
        <div className="toolbar" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input placeholder="Nom du template" value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <button className="btn" onClick={() => { const pages = [...tpl.pages, { title: `Page ${tpl.pages.length + 1}`, blocks: [] }]; setTpl({ ...tpl, pages }); setSelectedPage(pages.length - 1); setSelectedIndex(null) }}>Ajouter une page</button>
          <select value={selectedPage} onChange={e => setSelectedPage(Number(e.target.value))} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
            {tpl.pages.map((p, i) => <option key={i} value={i}>{p.title || `Page ${i + 1}`}</option>)}
          </select>
          <input placeholder="Couleur de fond (ex: #f9f1ff)" value={tpl.pages[selectedPage].bgColor || ''} onChange={e => { const pages = [...tpl.pages]; pages[selectedPage] = { ...pages[selectedPage], bgColor: e.target.value }; setTpl({ ...tpl, pages }) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap</label>
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
          <button className="btn" onClick={async () => { try { setError(''); setSaveStatus(''); await save(); setSaveStatus('Enregistré'); await loadTemplates() } catch (e: any) { setError('Échec de l\'enregistrement') } }}>Enregistrer</button>
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
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: 12 }}>
          <div className="card">
            <h3>Blocs</h3>
            {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}
            {blocksPalette.map((b, i) => (
              <div key={i} className="competency" style={{ cursor: 'pointer' }} onClick={() => addBlock(b)}>
                <div>{b.type}</div>
                <div className="pill">Ajouter</div>
              </div>
            ))}
            <h3 style={{ marginTop: 12 }}>Templates</h3>
            {list.map((item) => (
              <div key={String(item._id)} className="competency">
                <div>{item.name}</div>
                <div className="toolbar">
                  <button className="btn" onClick={() => { setTpl(item); setSelectedPage(0); setSelectedIndex(null) }}>Ouvrir</button>
                  <button className="btn secondary" onClick={async () => { const copy: Template = { name: `${item.name} (copie)`, pages: item.pages }; const r = await api.post('/templates', copy); await loadTemplates(); setTpl(r.data) }}>Dupliquer</button>
                  <button className="btn" onClick={async () => { if (!item._id) return; await api.delete(`/templates/${item._id}`); await loadTemplates() }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
          <div className="card page-canvas" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', height: pageHeight, width: pageWidth, background: tpl.pages[selectedPage].bgColor || '#fff', overflow: 'hidden' }}>
            <div className="page-margins" />
            {tpl.pages[selectedPage].blocks.map((b, idx) => (
              <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: (b.props.z ?? idx), border: selectedIndex === idx ? '2px solid var(--accent)' : '1px dashed #ccc', padding: 6, borderRadius: 6 }} onMouseDown={(e) => onDrag(e, idx)} onClick={() => setSelectedIndex(idx)}>
                {b.type === 'text' && <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>}
                {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} />}
                {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, borderRadius: b.props.radius || 8 }} />}
                {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, borderRadius: '50%' }} />}
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
                {(b.type === 'image' || b.type === 'text') && selectedIndex === idx && (
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
          <div className="card">
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
