import { Search, User } from 'lucide-react'

interface StudentGridProps {
  students: any[]
  loading: boolean
  viewUnassigned: boolean
  selectedClass: string | null
  search: string
  onSearchChange: (val: string) => void
  selectedStudentId?: string
  onSelectStudent: (student: any) => void
}

export default function StudentGrid({
  students,
  loading,
  viewUnassigned,
  selectedClass,
  search,
  onSearchChange,
  selectedStudentId,
  onSelectStudent
}: StudentGridProps) {
  
  const title = viewUnassigned 
    ? '🚫 Élèves non assignés' 
    : selectedClass 
      ? `🏫 ${selectedClass}` 
      : 'Sélectionnez une classe'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 16, background: 'white', zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          {title}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            placeholder="Rechercher..." 
            value={search} 
            onChange={e => onSearchChange(e.target.value)} 
            style={{ 
              padding: '8px 12px 8px 36px', 
              borderRadius: 20, 
              border: '1px solid #e2e8f0', 
              width: 240,
              fontSize: 14,
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = '#6c5ce7'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
             <div className="spinner" style={{ marginBottom: 16 }}></div>
             Chargement...
          </div>
        ) : !viewUnassigned && !selectedClass ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ background: '#e2e8f0', borderRadius: '50%', padding: 24, marginBottom: 20 }}>
              <span style={{ fontSize: 40 }}>👈</span>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#475569' }}>Aucune classe sélectionnée</h3>
            <p style={{ margin: 0, maxWidth: 300 }}>Veuillez choisir une classe ou un niveau dans le menu de gauche pour afficher les élèves.</p>
          </div>
        ) : students.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ background: '#e2e8f0', borderRadius: '50%', padding: 24, marginBottom: 20 }}>
              <User size={40} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#475569' }}>Aucun élève trouvé</h3>
            <p style={{ margin: 0 }}>Il n'y a pas d'élèves dans cette catégorie.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }}>
            {students.map(s => (
              <div 
                key={s._id}
                onClick={() => onSelectStudent(s)}
                style={{ 
                  background: 'white', 
                  borderRadius: 16, 
                  padding: 20, 
                  boxShadow: selectedStudentId === s._id ? '0 0 0 2px #6c5ce7, 0 10px 20px rgba(108, 92, 231, 0.1)' : '0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  transition: 'all 0.2s ease',
                  transform: selectedStudentId === s._id ? 'translateY(-4px)' : 'none',
                  border: '1px solid transparent',
                  borderColor: selectedStudentId === s._id ? 'transparent' : '#f1f5f9'
                }}
                onMouseEnter={e => {
                  if (selectedStudentId !== s._id) {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }
                }}
                onMouseLeave={e => {
                  if (selectedStudentId !== s._id) {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)'
                  }
                }}
              >
                <div style={{ 
                  width: 80, height: 80, borderRadius: '50%', marginBottom: 12,
                  background: '#f1f5f9', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '3px solid white',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <User size={32} color="#cbd5e1" />
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, color: '#1e293b' }}>{s.firstName}</div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#64748b' }}>{s.lastName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, background: '#f8fafc', padding: '2px 8px', borderRadius: 4 }}>
                  {s.logicalKey}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
