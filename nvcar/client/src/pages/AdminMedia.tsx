import { useEffect, useState, useRef } from 'react'
import api from '../api'

interface MediaItem {
  name: string
  type: 'file' | 'folder'
  path: string
}

export default function AdminMedia() {
  const [folder, setFolder] = useState('')
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/media/list', { params: { folder } })
      setItems(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const tripleConfirm = (message: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!confirm(`${message}\n\nConfirmation ${attempt}/3`)) return false
    }
    return true
  }

  useEffect(() => { load() }, [folder])

  const upload = async (f: File) => {
    const fd = new FormData()
    fd.append('file', f)
    try {
      await fetch(`http://localhost:4000/media/upload?folder=${encodeURIComponent(folder)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: fd
      })
      await load()
    } catch (e) {
      alert('Upload failed')
    }
  }

  const createFolder = async () => {
    const name = prompt("Nom du nouveau dossier:")
    if (!name) return
    try {
      await api.post('/media/mkdir', { folder: folder ? `${folder}/${name}` : name })
      await load()
    } catch (e) {
      alert('Erreur lors de la création du dossier')
    }
  }

  const renameItem = async (item: MediaItem) => {
    const newName = prompt('Renommer vers:', item.name)
    if (!newName || newName === item.name) return
    
    const oldPath = item.path // e.g. /folder/oldname
    // Construct new path. item.path is relative to uploads root.
    // We need to send 'from' and 'to' relative to uploads root?
    // The API expects 'from' and 'to'.
    // Let's look at the API implementation again.
    // API: const destPath = path.join(uploadDir, to) -> so 'to' is relative to uploads.
    
    // item.path comes from API as `${folder ? '/' + folder : ''}/${d.name}`
    // So it starts with /.
    
    const parentPath = folder ? folder : ''
    const toPath = parentPath ? `${parentPath}/${newName}` : newName
    
    try {
      await api.post('/media/rename', { from: item.path, to: toPath })
      await load()
    } catch (e) {
      alert('Erreur lors du renommage')
    }
  }

  const deleteItem = async (item: MediaItem) => {
    if (!tripleConfirm(`Supprimer ${item.name} ?`)) return
    try {
      await api.post('/media/delete', { target: item.path })
      await load()
    } catch (e) {
      alert('Erreur lors de la suppression')
    }
  }

  const navigateUp = () => {
    if (!folder) return
    const parts = folder.split('/')
    parts.pop()
    setFolder(parts.join('/'))
  }

  const breadcrumbs = folder.split('/').filter(Boolean)

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 className="title" style={{ margin: 0 }}>Médiathèque</h2>
          <div className="toolbar">
            <button className="btn secondary" onClick={createFolder}>
              <span style={{ marginRight: 8 }}>+</span> Dossier
            </button>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              <span style={{ marginRight: 8 }}>↑</span> Upload
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={e => { 
                const f = e.target.files?.[0]
                if (f) {
                  upload(f)
                  e.target.value = ''
                }
              }} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: '#f8f9fa', borderRadius: 8 }}>
          <button 
            onClick={() => setFolder('')}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: folder ? 'var(--primary)' : 'var(--text)', fontWeight: 500 }}
          >
            Home
          </button>
          {breadcrumbs.map((part, i) => {
            const path = breadcrumbs.slice(0, i + 1).join('/')
            return (
              <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#ccc' }}>/</span>
                <button 
                  onClick={() => setFolder(path)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--primary)', fontWeight: i === breadcrumbs.length - 1 ? 600 : 500 }}
                >
                  {part}
                </button>
              </div>
            )
          })}
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Chargement...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {folder && (
              <div 
                className="card" 
                style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8f9fa', border: '1px dashed #ccc', boxShadow: 'none' }}
                onClick={navigateUp}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>..</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Retour</div>
              </div>
            )}
            
            {items.map(item => (
              <div key={item.path} className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', transition: 'transform 0.2s', border: '1px solid #eee' }}>
                {item.type === 'folder' ? (
                  <div 
                    onClick={() => setFolder(folder ? `${folder}/${item.name}` : item.name)}
                    style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', background: '#fff8e1', height: '100%', boxSizing: 'border-box' }}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#f59e0b" style={{ marginBottom: 12 }}>
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                    </svg>
                    <div style={{ fontWeight: 500, textAlign: 'center', wordBreak: 'break-word' }}>{item.name}</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ height: 120, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {item.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={`http://localhost:4000/uploads${item.path}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ fontSize: 12, color: '#666', padding: 8, textAlign: 'center' }}>{item.name.split('.').pop()?.toUpperCase()} File</div>
                      )}
                    </div>
                    <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, wordBreak: 'break-word', flex: 1 }} title={item.name}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => renameItem(item)}
                          style={{ padding: 4, border: '1px solid #ddd', borderRadius: 4, background: 'white', cursor: 'pointer' }}
                          title="Renommer"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => deleteItem(item)}
                          style={{ padding: 4, border: '1px solid #ddd', borderRadius: 4, background: 'white', cursor: 'pointer', color: 'red' }}
                          title="Supprimer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {items.length === 0 && !folder && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                Aucun fichier. Commencez par uploader quelque chose.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
