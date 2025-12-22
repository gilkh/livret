import { useEffect, useState } from 'react'
import api from '../api'

interface NavItem {
  key: string;
  label: string;
}

interface Permissions {
  [role: string]: {
    [key: string]: boolean;
  };
}

const NavPermissionSection = ({ role, label, items, permissions, onToggle }: { 
  role: string; 
  label: string; 
  items: NavItem[]; 
  permissions: Permissions; 
  onToggle: (role: string, key: string) => void 
}) => {
  return (
    <div className="card" style={{ 
      padding: '24px', 
      borderRadius: '12px', 
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)', 
      border: '1px solid #e2e8f0', 
      marginBottom: '24px',
      backgroundColor: 'white'
    }}>
      <h3 style={{ 
        margin: '0 0 16px 0', 
        fontSize: '18px', 
        fontWeight: 600, 
        color: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span>{label} - Menu Navigation</span>
      </h3>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '12px' 
      }}>
        {items.map((item) => {
          const isEnabled = permissions[role]?.[item.key] !== false // Default true
          return (
            <div 
              key={item.key} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                transition: 'background-color 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onClick={() => onToggle(role, item.key)}
            >
              <input 
                type="checkbox" 
                checked={isEnabled} 
                onChange={() => onToggle(role, item.key)}
                id={`perm-${role}-${item.key}`}
                style={{ 
                  width: '16px', 
                  height: '16px', 
                  cursor: 'pointer',
                  accentColor: '#6c5ce7'
                }}
              />
              <label 
                htmlFor={`perm-${role}-${item.key}`} 
                style={{ 
                  cursor: 'pointer', 
                  fontSize: '14px', 
                  color: '#334155',
                  userSelect: 'none'
                }}
              >
                {item.label}
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminNavigationVisibility() {
  const [navPermissions, setNavPermissions] = useState<Permissions>({})

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings/public')
      setNavPermissions(res.data.nav_permissions || {})
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const toggleNavPermission = async (role: string, key: string) => {
    const newPermissions = { ...navPermissions }
    if (!newPermissions[role]) newPermissions[role] = {}
    
    // Toggle
    const current = newPermissions[role][key] !== false
    newPermissions[role][key] = !current
    
    setNavPermissions(newPermissions)
    
    try {
      await api.post('/settings', {
        key: 'nav_permissions',
        value: newPermissions
      })
    } catch (e) {
      console.error("Error saving permissions", e)
      alert("Erreur lors de la sauvegarde des permissions")
    }
  }

  const teacherItems: NavItem[] = [
    { key: 'classes', label: 'Mes Classes' }
  ]

  const subAdminItems: NavItem[] = [
    { key: 'dashboard', label: 'Tableau de bord' },
    { key: 'progress', label: 'Progression' },
    { key: 'teacher-progress', label: 'Suivi Enseignants' },
    { key: 'gradebooks', label: 'Carnet' },
    { key: 'eleves', label: 'Élèves' },
    { key: 'signature', label: 'Ma signature' }
  ]

  const aefeItems: NavItem[] = [
    { key: 'dashboard', label: 'Tableau de bord' },
    { key: 'progress', label: 'Progression' },
    { key: 'teacher-progress', label: 'Suivi Enseignants' },
    { key: 'gradebooks', label: 'Carnet' }
  ]

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header" style={{
        background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
        marginBottom: '2rem'
      }}>
        <h1 className="dashboard-title">Visibilité du Menu de Navigation</h1>
        <p className="dashboard-subtitle">Contrôlez quels éléments du menu sont visibles pour chaque rôle utilisateur</p>
      </header>
      
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div className="dashboard-section">
          <h2 className="section-title" style={{
            color: '#475569',
            fontSize: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            Configurations par Rôle
          </h2>
          
          <NavPermissionSection 
            role="TEACHER" 
            label="Enseignants" 
            items={teacherItems} 
            permissions={navPermissions} 
            onToggle={toggleNavPermission} 
          />
          <NavPermissionSection 
            role="SUBADMIN" 
            label="Préfets" 
            items={subAdminItems} 
            permissions={navPermissions} 
            onToggle={toggleNavPermission} 
          />
          <NavPermissionSection 
            role="AEFE" 
            label="RPP ET DIRECTION" 
            items={aefeItems} 
            permissions={navPermissions} 
            onToggle={toggleNavPermission} 
          />
        </div>
      </div>
    </div>
  )
}
