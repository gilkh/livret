import { X, CheckCircle } from 'lucide-react'

interface BatchImportPreviewModalProps {
  rows: any[]
  students: any[]
  onConfirm: () => void
  onCancel: () => void
}

export default function BatchImportPreviewModal({ rows, students, onConfirm, onCancel }: BatchImportPreviewModalProps) {
  // helper to normalize keys
  const normalizeObjectKey = (v: any) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')

  const getRowValue = (row: Record<string, any>, aliases: string[]) => {
    const keyMap = new Map<string, string>()
    for (const k of Object.keys(row || {})) keyMap.set(normalizeObjectKey(k), k)
    for (const alias of aliases) {
      const mapped = keyMap.get(normalizeObjectKey(alias))
      if (mapped) return row[mapped]
    }
    return undefined
  }
  
  // Helper to format dates consistently (DD/MM/YYYY)
  const formatDate = (value: any): string => {
    if (!value) return '-'
    const raw = String(value).trim()
    const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (match) {
      const day = match[1].padStart(2, '0')
      const month = match[2].padStart(2, '0')
      const year = match[3]
      return `${day}/${month}/${year}`
    }
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      // For ISO strings like 2020-07-06T00:00:00.000Z, getUTCDate is stable
      const day = String(d.getUTCDate()).padStart(2, '0')
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      const year = d.getUTCFullYear()
      return `${day}/${month}/${year}`
    }
    return raw
  }
  
  // calculate diffs
  const previewData = rows.map((row, i) => {
    const studentId = getRowValue(row, ['studentid', 'id', '_id'])
    const logicalKey = getRowValue(row, ['logicalkey'])
    const firstName = getRowValue(row, ['firstname', 'prenom'])
    const lastName = getRowValue(row, ['lastname', 'nom'])

    let existing: any = null
    if (studentId) existing = students.find(s => s._id === studentId)
    else if (logicalKey) existing = students.find(s => s.logicalKey === logicalKey)
    else if (firstName && lastName) {
      existing = students.find(s => 
        s.firstName.toLowerCase() === String(firstName).toLowerCase() && 
        s.lastName.toLowerCase() === String(lastName).toLowerCase()
      )
    }

    const proposedClass = getRowValue(row, ['classname', 'class', 'classe', 'nextclass'])
    const proposedLevel = getRowValue(row, ['level', 'targetlevel', 'niveau'])
    const sex = getRowValue(row, ['sex', 'gender', 'sexe'])
    const dob = getRowValue(row, ['dateofbirth', 'dob', 'birthdate'])
    const parentPhone = getRowValue(row, ['parentphone'])

    const oldDob = formatDate(existing?.dateOfBirth)
    const newDob = dob ? formatDate(dob) : '-'

    return {
      _rowIndex: i,
      row,
      existing,
      status: existing ? 'update' : 'new',
      summary: existing ? `Mise à jour de ${existing.firstName} ${existing.lastName}` : `Nouvel élève: ${firstName || 'Inconnu'} ${lastName || 'Inconnu'}`,
      changes: [
        { field: 'Classe', old: existing?.className || '-', new: proposedClass || proposedLevel || '-', hasChange: !!proposedClass || !!proposedLevel },
        { field: 'Sexe', old: existing?.sex || '-', new: sex || '-', hasChange: !!sex && sex !== existing?.sex },
        { field: 'Date de Naissance', old: oldDob, new: newDob, hasChange: !!dob },
        { field: 'Téléphone', old: existing?.parentPhone || '-', new: parentPhone || '-', hasChange: !!parentPhone && parentPhone !== existing?.parentPhone }
      ].filter(c => c.hasChange && String(c.new).toLowerCase() !== String(c.old).toLowerCase())
    }
  }).filter(d => d.status === 'new' || d.changes.length > 0)

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20
    }}>
      <div className="card" style={{ 
        width: '100%', maxWidth: 900, maxHeight: '90vh', 
        display: 'flex', flexDirection: 'column', padding: 0, 
        background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Prévisualisation de l'import</h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>
              {previewData.length} élève(s) avec des modifications. Veuillez vérifier avant de confirmer.
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>
          {previewData.map((d, i) => (
            <div key={i} style={{ 
              background: '#fff', padding: 16, borderRadius: 12, marginBottom: 16, 
              border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {d.status === 'new' ? (
                  <span style={{ padding: '4px 8px', background: '#dcfce7', color: '#166534', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>NOUVEAU</span>
                ) : (
                  <span style={{ padding: '4px 8px', background: '#e0e7ff', color: '#3730a3', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>MISE À JOUR</span>
                )}
                <span style={{ fontWeight: 600, color: '#334155' }}>{d.summary}</span>
              </div>
              
              {d.changes.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {d.changes.map((c, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', fontSize: 14 }}>
                      <span style={{ width: 140, color: '#64748b' }}>{c.field} :</span>
                      {d.status === 'update' && (
                        <>
                          <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{c.old}</span>
                          <span style={{ margin: '0 8px', color: '#cbd5e1' }}>→</span>
                        </>
                      )}
                      <span style={{ color: '#10b981', fontWeight: 500 }}>{c.new}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#94a3b8', fontStyle: 'italic' }}>Aucune modification majeure détectée (ou données non supportées en prévisualisation).</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#fff' }}>
          <button className="btn secondary" onClick={onCancel} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
          <button className="btn" onClick={onConfirm} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={18} /> Confirmer l'import
          </button>
        </div>
      </div>
    </div>
  )
}
