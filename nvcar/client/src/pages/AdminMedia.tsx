import { useEffect, useState } from 'react'
import api from '../api'

export default function AdminMedia() {
  const [folder, setFolder] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [newFolder, setNewFolder] = useState('')
  const load = async () => { const r = await api.get('/media/list', { params: { folder } }); setItems(r.data) }
  useEffect(() => { load() }, [folder])
  const upload = async (f: File) => { const fd = new FormData(); fd.append('file', f); await fetch(`http://localhost:4000/media/upload?folder=${encodeURIComponent(folder)}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd }); await load() }
  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Media Manager</h2>
        <div className="toolbar">
          <input placeholder="Dossier" value={folder} onChange={e => setFolder(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <input type="file" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          <input placeholder="Nouveau dossier" value={newFolder} onChange={e => setNewFolder(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <button className="btn" onClick={async () => { await api.post('/media/mkdir', { folder: newFolder }); setFolder(newFolder); setNewFolder('') }}>Créer dossier</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          {items.map(u => (
            <div key={u} className="card" style={{ padding: 8 }}>
              <img src={`http://localhost:4000/uploads${u}`} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }} />
              <div className="toolbar" style={{ marginTop: 8 }}>
                <button className="btn" onClick={async () => { const name = prompt('Renommer vers:'); if (!name) return; await api.post('/media/rename', { from: u, to: `${folder ? folder + '/' : ''}${name}` }); await load() }}>Renommer</button>
                <button className="btn secondary" onClick={async () => { await api.post('/media/delete', { target: u }); await load() }}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
