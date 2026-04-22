import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Plus, Trash2, Edit2, Save } from 'lucide-react';
import api from '../../api';

interface YearManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  years: any[];
  onYearsChanged: () => void;
}

export default function YearManagerModal({ isOpen, onClose, years, onYearsChanged }: YearManagerModalProps) {
  const [creatingPreviousYear, setCreatingPreviousYear] = useState(false);
  const [selectedYear, setSelectedYear] = useState<any | null>(null);
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '', active: true, activeSemester: 1 });

  const oldestYearId = useMemo(() => {
    if (years.length === 0) return '';
    let oldest = years[0];
    let oldestTime = new Date(oldest.startDate).getTime();
    for (const y of years) {
      const t = new Date(y.startDate).getTime();
      if (!isNaN(t) && (isNaN(oldestTime) || t < oldestTime)) {
        oldest = y;
        oldestTime = t;
      }
    }
    return oldest._id;
  }, [years]);

  if (!isOpen) return null;

  const selectYear = (y: any) => {
    setSelectedYear(y);
    setYearForm({
      name: y.name,
      startDate: y.startDate?.slice(0, 10) || '',
      endDate: y.endDate?.slice(0, 10) || '',
      active: !!y.active,
      activeSemester: y.activeSemester || 1
    });
  };

  const addPreviousYear = async () => {
    if (creatingPreviousYear) return;

    let startYear = new Date().getFullYear();
    const oldest = years.find(y => y._id === oldestYearId);
    if (oldest) {
      const parts = oldest.name.split('/');
      if (parts.length === 2) {
        const y1 = parseInt(parts[0]);
        if (!isNaN(y1)) startYear = y1 - 1;
      } else {
        const match = oldest.name.match(/(\d{4})/);
        if (match) {
          startYear = parseInt(match[1]) - 1;
        } else {
          const d = new Date(oldest.startDate);
          if (!isNaN(d.getTime())) startYear = d.getFullYear() - 1;
        }
      }
    }

    const name = `${startYear}/${startYear + 1}`;
    if (years.some(y => y.name === name)) {
      alert("Cette année scolaire existe déjà");
      return;
    }

    const startDate = `${startYear}-09-01`;
    const endDate = `${startYear + 1}-07-01`;

    try {
      setCreatingPreviousYear(true);
      await api.post('/school-years', { name, startDate, endDate, active: false });
      onYearsChanged();
    } finally {
      setCreatingPreviousYear(false);
    }
  };

  const addNextYear = async () => {
    const sorted = [...years].sort((a, b) => a.name.localeCompare(b.name));
    const last = sorted[sorted.length - 1];
    let startYear = new Date().getFullYear();
    if (last) {
      const parts = last.name.split('/');
      if (parts.length === 2) {
        const y1 = parseInt(parts[0]);
        if (!isNaN(y1)) startYear = y1 + 1;
      } else {
        const match = last.name.match(/(\d{4})/);
        if (match) startYear = parseInt(match[1]) + 1;
      }
    }

    const name = `${startYear}/${startYear + 1}`;
    const startDate = `${startYear}-09-01`;
    const endDate = `${startYear + 1}-07-01`;

    await api.post('/school-years', { name, startDate, endDate, active: false });
    onYearsChanged();
  };

  const saveYear = async () => {
    if (selectedYear) {
      try {
        const payload: any = { ...yearForm };
        if (selectedYear.activeSemester !== payload.activeSemester) {
          payload.active = true;
        }

        const r = await api.patch(`/school-years/${selectedYear._id}`, payload);
        onYearsChanged();
        setSelectedYear(r.data);
      } catch (e) {
        alert('Erreur lors de l\'enregistrement');
      }
    }
  };

  const deleteYear = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette année scolaire ?')) return;
    await api.delete(`/school-years/${id}`);
    onYearsChanged();
    if (selectedYear?._id === id) setSelectedYear(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 16, width: '90%', maxWidth: 700, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', maxHeight: '80vh'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={20} />
            Gestion des Années Scolaires
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#64748b" /></button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Liste des années */}
          <div style={{ width: '45%', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 14 }}>
              Années ({years.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {years.map(y => (
                <div
                  key={y._id}
                  onClick={() => selectYear(y)}
                  style={{
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: selectedYear?._id === y._id ? '#eff6ff' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedYear?._id === y._id ? '#bfdbfe' : 'transparent',
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{y.name}</div>
                    {y.active && <div style={{ fontSize: 11, color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>Actif {y.activeSemester ? `(S${y.activeSemester})` : ''}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {y._id === oldestYearId && (
                      <button onClick={(e) => { e.stopPropagation(); addPreviousYear(); }} disabled={creatingPreviousYear} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer' }} title="Ajouter l'année précédente">
                        <Plus size={14} />
                      </button>
                    )}
                    <button onClick={(e) => deleteYear(e, y._id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer' }} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addNextYear}
                style={{
                  width: '100%', padding: '10px', background: '#f1f5f9', color: '#475569', border: '1px dashed #cbd5e1', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 500, marginTop: 8
                }}
              >
                <Plus size={16} /> Nouvelle année (suivante)
              </button>
            </div>
          </div>

          {/* Édition de l'année */}
          <div style={{ width: '55%', padding: 24, background: '#f8fafc', overflowY: 'auto' }}>
            {selectedYear ? (
              <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#334155' }}>
                  <Edit2 size={16} /> Modifier {selectedYear.name}
                </h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Nom</label>
                  <input value={yearForm.name} onChange={e => setYearForm({ ...yearForm, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Début</label>
                    <input type="date" value={yearForm.startDate} onChange={e => setYearForm({ ...yearForm, startDate: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Fin</label>
                    <input type="date" value={yearForm.endDate} onChange={e => setYearForm({ ...yearForm, endDate: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Semestre Actif</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setYearForm({ ...yearForm, activeSemester: 1 })}
                      style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid', borderColor: yearForm.activeSemester === 1 ? '#3b82f6' : '#cbd5e1', background: yearForm.activeSemester === 1 ? '#eff6ff' : 'white', color: yearForm.activeSemester === 1 ? '#1d4ed8' : '#475569', fontWeight: yearForm.activeSemester === 1 ? 600 : 400, cursor: 'pointer' }}
                    >Semestre 1</button>
                    <button
                      onClick={() => setYearForm({ ...yearForm, activeSemester: 2 })}
                      style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid', borderColor: yearForm.activeSemester === 2 ? '#3b82f6' : '#cbd5e1', background: yearForm.activeSemester === 2 ? '#eff6ff' : 'white', color: yearForm.activeSemester === 2 ? '#1d4ed8' : '#475569', fontWeight: yearForm.activeSemester === 2 ? 600 : 400, cursor: 'pointer' }}
                    >Semestre 2</button>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, cursor: 'pointer' }}>
                  <input type="checkbox" checked={yearForm.active} onChange={e => setYearForm({ ...yearForm, active: e.target.checked })} />
                  <span style={{ fontSize: 14, color: '#334155' }}>Définir comme année active</span>
                </label>

                <button onClick={saveYear} style={{ width: '100%', padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, cursor: 'pointer' }}>
                  <Save size={16} /> Enregistrer
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontStyle: 'italic' }}>
                Sélectionnez une année pour la modifier
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
