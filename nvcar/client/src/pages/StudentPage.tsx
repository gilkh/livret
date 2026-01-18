import { useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import ToggleIndicator from '../components/ToggleIndicator'
import { useQuery } from '@tanstack/react-query'
import { openPdfExport, buildStudentPdfUrl } from '../utils/pdfExport'

type Category = { _id: string; name: string; competencies: Competency[] }
type Competency = { _id: string; label: string }
type Status = { competencyId: string; en: boolean; fr: boolean; ar: boolean }

export default function StudentPage() {
  const { id } = useParams()
  const [student, setStudent] = useState<any>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const s = await api.get(`/students/${id}`)
      const c = await api.get(`/categories`)
      const st = await api.get(`/students/${id}/competencies`)
      const assigns = await api.get(`/template-assignments/student/${id}`)
      setStudent(s.data)
      setCategories(c.data)
      const map: Record<string, Status> = {}
      for (const m of st.data) map[m.competencyId] = m
      setStatuses(map)
      setAssignments(assigns.data || [])
    }
    load()
  }, [id])

  const toggle = async (compId: string, lang: 'en' | 'fr' | 'ar') => {
    const prev = statuses[compId]
    const next = { ...prev, competencyId: compId, [lang]: !prev?.[lang] }
    setStatuses({ ...statuses, [compId]: next })
    setSaving(true)
    try {
      await api.patch(`/students/${id}/competencies/${compId}`, next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container">
      {student && (
        <div className="card">
          <div className="header">
            <img className="avatar" src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${student.firstName}-${student.lastName}`} />
            <div className="header-info">
              <div className="title">{student.firstName} {student.lastName}</div>
              <div className="note">Classe: {(student.enrollments?.[0]?.classId) || '—'} • {saving ? 'Sauvegarde…' : 'Enregistré'}</div>
              <div className="toolbar">
                {assignments.length > 0 ? (
                  <button className="btn" onClick={() => {
                    const assignment = assignments[0]
                    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                    const pdfUrl = buildStudentPdfUrl(base, id!, assignment.templateId)
                    openPdfExport(pdfUrl, `${student.firstName} ${student.lastName}`, 'single', 1)
                  }}>📄 Exporter le Carnet ({assignments[0]?.template?.name || 'Template assigné'})</button>
                ) : (
                  <div style={{ padding: '8px 12px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 13 }}>
                    ⚠️ Aucun carnet assigné à cet élève. Veuillez d'abord assigner un template à sa classe.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="title">Signatures</h3>
        <SignatureEditor studentId={id!} />
      </div>
      <div className="row">
        <div style={{ flex: 1 }}>
          {categories.map(cat => (
            <div key={cat._id} className="category">
              <div className="title pastel">{cat.name}</div>
              {cat.competencies.map(comp => {
                const st = statuses[comp._id] || { competencyId: comp._id, en: false, fr: false, ar: false }
                return (
                  <div className="competency" key={comp._id}>
                    <div>{comp.label}</div>
                    <div className="indicators">
                      <ToggleIndicator label="EN" variant="en" on={!!st.en} onToggle={() => toggle(comp._id, 'en')} />
                      <ToggleIndicator label="FR" variant="fr" on={!!st.fr} onToggle={() => toggle(comp._id, 'fr')} />
                      <ToggleIndicator label="AR" variant="ar" on={!!st.ar} onToggle={() => toggle(comp._id, 'ar')} />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SignatureEditor({ studentId }: { studentId: string }) {
  const { data, refetch } = useQuery({ queryKey: ['signatures', studentId], queryFn: async () => (await api.get(`/signatures/${studentId}`)).data })
  const { data: gallery } = useQuery({ queryKey: ['gallery'], queryFn: async () => (await api.get('/media/list')).data })
  const [items, setItems] = useState<Array<{ label: string; dataUrl?: string }>>([])
  useEffect(() => { if (data?.items) setItems(data.items) }, [data])
  const add = () => setItems([...items, { label: 'Signature' }])
  const save = async () => { await api.post(`/signatures/${studentId}`, { items }); await refetch() }
  return (
    <div>
      {items.map((it, idx) => (
        <div key={idx} className="competency">
          <input placeholder="Label" value={it.label} onChange={e => { const c = [...items]; c[idx] = { ...it, label: e.target.value }; setItems(c) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Data URL image" value={it.dataUrl || ''} onChange={e => { const c = [...items]; c[idx] = { ...it, dataUrl: e.target.value }; setItems(c) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', flex: 1 }} />
          <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); const r = await fetch('/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: fd }); const data = await r.json(); if (data?.url) { const c = [...items]; c[idx] = { ...it, dataUrl: data.url.startsWith('http') ? data.url : data.url }; setItems(c) } }} />
          <button className="btn" onClick={async () => { const r = await api.get('/media/list'); if (Array.isArray(r.data)) { /* no-op, gallery automatically updates via query */ } }}>Rafraîchir la galerie</button>
          {Array.isArray(gallery) && (
            <select value={(it as any).dataUrl || ''} onChange={e => { const c = [...items]; c[idx] = { ...it, dataUrl: `/uploads${e.target.value}` }; setItems(c) }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}>
              <option value="">Choisir depuis la galerie</option>
              {gallery.filter((u: any) => u.type === 'file').map((u: any) => <option key={u.path} value={u.path}>{u.name}</option>)}
            </select>
          )}
        </div>
      ))}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn" onClick={add}>Ajouter une signature</button>
        <button className="btn secondary" onClick={save}>Enregistrer</button>
      </div>
      <div className="note">Le PDF affichera une ligne si l’image n’est pas fournie.</div>
    </div>
  )
}
