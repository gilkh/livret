import { ChevronRight, ChevronDown, UserX } from 'lucide-react'

interface StudentSidebarProps {
  years: { _id: string; name: string; active: boolean }[]
  selectedYearId: string
  onYearChange: (id: string) => void
  groupedStudents: {
    grouped: Record<string, Record<string, any[]>>
    unassigned: any[]
  }
  expandedLevels: Set<string>
  onToggleLevel: (level: string) => void
  selectedClass: string | null
  viewUnassigned: boolean
  onSelectClass: (cls: string | null) => void
  onViewUnassigned: () => void
}

export default function StudentSidebar({
  years,
  selectedYearId,
  onYearChange,
  groupedStudents,
  expandedLevels,
  onToggleLevel,
  selectedClass,
  viewUnassigned,
  onSelectClass,
  onViewUnassigned
}: StudentSidebarProps) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
        <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>Année Scolaire</label>
        <select 
          value={selectedYearId} 
          onChange={e => onYearChange(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white' }}
        >
          {years.map(y => (
            <option key={y._id} value={y._id}>{y.name} {y.active ? '(Active)' : ''}</option>
          ))}
        </select>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <div 
          onClick={onViewUnassigned}
          style={{ 
            padding: '10px 12px', 
            borderRadius: 8, 
            cursor: 'pointer', 
            background: viewUnassigned ? '#eff6ff' : 'transparent',
            color: viewUnassigned ? '#3b82f6' : '#475569',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
            transition: 'all 0.2s',
            fontWeight: viewUnassigned ? 600 : 500
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserX size={16} />
            <span>Non assignés</span>
          </div>
          <span className="pill" style={{ background: viewUnassigned ? '#dbeafe' : '#f1f5f9', color: viewUnassigned ? '#1e40af' : '#64748b', fontSize: 11, padding: '2px 8px' }}>
            {groupedStudents.unassigned.length}
          </span>
        </div>

        {Object.entries(groupedStudents.grouped).map(([level, classes]) => {
          const classNames = Object.keys(classes).sort()
          if (classNames.length === 0) return null
          
          const isExpanded = expandedLevels.has(level)
          return (
            <div key={level} style={{ marginBottom: 4 }}>
              <div 
                onClick={() => onToggleLevel(level)}
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: '#334155',
                  userSelect: 'none'
                }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span style={{ fontSize: 13 }}>{level}</span>
              </div>
              
              {isExpanded && (
                <div style={{ paddingLeft: 16, marginTop: 4 }}>
                  {classNames.map(cls => (
                    <div 
                      key={cls}
                      onClick={() => onSelectClass(cls)}
                      style={{ 
                        padding: '8px 12px 8px 34px', 
                        borderRadius: 6, 
                        cursor: 'pointer',
                        background: selectedClass === cls && !viewUnassigned ? '#eff6ff' : 'transparent',
                        color: selectedClass === cls && !viewUnassigned ? '#3b82f6' : '#64748b',
                        fontSize: 13,
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 2,
                        fontWeight: selectedClass === cls && !viewUnassigned ? 600 : 400
                      }}
                    >
                      <span>{cls}</span>
                      <span style={{ fontSize: 11, opacity: 0.6, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>
                        {classes[cls].length}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
