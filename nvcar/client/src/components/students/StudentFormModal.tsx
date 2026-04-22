import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import api from '../../api';

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any | null;
  classes: { _id: string; name: string }[];
  selectedClassId?: string;
  onSuccess: () => void;
}

export default function StudentFormModal({ isOpen, onClose, student, classes, selectedClassId, onSuccess }: StudentFormModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [fatherEmail, setFatherEmail] = useState('');
  const [motherEmail, setMotherEmail] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (student && student._id) {
        setFirstName(student.firstName || '');
        setLastName(student.lastName || '');
        setDateOfBirth(student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : '');
        setSex(student.sex || '');
        setFatherName(student.fatherName || student.parentName || '');
        setFatherEmail(student.fatherEmail || '');
        setMotherEmail(student.motherEmail || '');
        setStudentEmail(student.studentEmail || '');
        setTargetClassId(student.classId || selectedClassId || '');
      } else {
        setFirstName('');
        setLastName('');
        setDateOfBirth('');
        setSex('');
        setFatherName('');
        setFatherEmail('');
        setMotherEmail('');
        setStudentEmail('');
        setTargetClassId(selectedClassId || (classes.length > 0 ? classes[0]._id : ''));
      }
    }
  }, [isOpen, student, selectedClassId, classes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !dateOfBirth.trim() || !targetClassId) return;

    setLoading(true);
    try {
      const payload = {
        firstName, lastName, dateOfBirth, sex, fatherName, fatherEmail, motherEmail, studentEmail, classId: targetClassId
      };
      
      if (student && student._id) {
        await api.patch(`/students/${student._id}`, payload);
      } else {
        await api.post('/students', payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Erreur: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 16, width: '90%', maxWidth: 600, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>
            {student && student._id ? 'Modifier l\'élève' : 'Ajouter un élève'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#64748b" /></button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto' }}>
          <form id="student-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Prénom *</label>
                <input required value={firstName} onChange={e => setFirstName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Nom *</label>
                <input required value={lastName} onChange={e => setLastName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Date de naissance *</label>
                <input required type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Sexe</label>
                <select value={sex} onChange={e => setSex(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', outline: 'none' }}>
                  <option value="">Non renseigné</option>
                  <option value="female">Fille</option>
                  <option value="male">Garçon</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Classe *</label>
              <select required value={targetClassId} onChange={e => setTargetClassId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', outline: 'none' }}>
                <option value="" disabled>Sélectionner une classe</option>
                {classes.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Nom du parent (Père/Contact)</label>
              <input value={fatherName} onChange={e => setFatherName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Email Père</label>
                <input type="email" value={fatherEmail} onChange={e => setFatherEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Email Mère</label>
                <input type="email" value={motherEmail} onChange={e => setMotherEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 500 }}>Email Élève</label>
                <input type="email" value={studentEmail} onChange={e => setStudentEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }} />
              </div>
            </div>
          </form>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
            Annuler
          </button>
          <button type="submit" form="student-form" disabled={loading} style={{ padding: '10px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
            <Save size={16} />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
