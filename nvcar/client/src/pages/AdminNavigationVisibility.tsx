import { useEffect, useState } from 'react'
import api from '../api'
import Toast, { ToastType } from '../components/Toast'
import { 
  LayoutDashboard, 
  TrendingUp, 
  UserCheck, 
  BookOpen, 
  GraduationCap, 
  PenTool, 
  Users, 
  Shield, 
  School,
  Menu
} from 'lucide-react'
import './AdminNavigationVisibility.css'

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface Permissions {
  [role: string]: {
    [key: string]: boolean;
  };
}

const NavPermissionSection = ({ role, label, icon, items, permissions, onToggle }: { 
  role: string; 
  label: string; 
  icon: React.ReactNode;
  items: NavItem[]; 
  permissions: Permissions; 
  onToggle: (role: string, key: string) => void 
}) => {
  const roleClass = role.toLowerCase()
  
  return (
    <div className="role-card">
      <div className="role-header">
        <div className={`role-icon ${roleClass}`}>
          {icon}
        </div>
        <h3 className="role-title">{label}</h3>
      </div>
      
      <div className="permissions-list">
        {items.map((item) => {
          const isEnabled = permissions[role]?.[item.key] !== false // Default true
          return (
            <div 
              key={item.key} 
              className="permission-item"
              onClick={() => onToggle(role, item.key)}
            >
              <div className="permission-label">
                <span style={{ color: '#64748b' }}>{item.icon}</span>
                {item.label}
              </div>
              <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                <input 
                  type="checkbox" 
                  checked={isEnabled} 
                  onChange={() => onToggle(role, item.key)}
                />
                <span className="slider"></span>
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
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings/public')
      setNavPermissions(res.data.nav_permissions || {})
    } catch (e) {
      console.error(e)
      setToast({ message: "Erreur lors du chargement des configurations", type: 'error' })
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
      // Optional: Show success toast only on explicit save or maybe just silent success is better for toggles?
      // Let's show a subtle success toast
      // setToast({ message: "Configuration sauvegardée", type: 'success' })
    } catch (e) {
      console.error("Error saving permissions", e)
      setToast({ message: "Erreur lors de la sauvegarde", type: 'error' })
      // Revert on error
      newPermissions[role][key] = current
      setNavPermissions({ ...newPermissions })
    }
  }

  const teacherItems: NavItem[] = [
    { key: 'classes', label: 'Mes Classes', icon: <School size={18} /> }
  ]

  const subAdminItems: NavItem[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={18} /> },
    { key: 'progress', label: 'Progression', icon: <TrendingUp size={18} /> },
    { key: 'teacher-progress', label: 'Suivi Enseignants', icon: <UserCheck size={18} /> },
    { key: 'gradebooks', label: 'Carnet', icon: <BookOpen size={18} /> },
    { key: 'eleves', label: 'Élèves', icon: <GraduationCap size={18} /> },
    { key: 'signature', label: 'Ma signature', icon: <PenTool size={18} /> }
  ]

  const aefeItems: NavItem[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={18} /> },
    { key: 'progress', label: 'Progression', icon: <TrendingUp size={18} /> },
    { key: 'teacher-progress', label: 'Suivi Enseignants', icon: <UserCheck size={18} /> },
    { key: 'gradebooks', label: 'Carnet', icon: <BookOpen size={18} /> }
  ]

  return (
    <div className="admin-nav-visibility">
      <header className="nav-header">
        <h1 className="nav-title">
          <Menu size={40} strokeWidth={2.5} />
          Visibilité du Menu
        </h1>
        <p className="nav-subtitle">
          Personnalisez l'expérience utilisateur en contrôlant l'accès aux différentes sections de l'application pour chaque rôle.
        </p>
      </header>
      
      <div className="roles-grid">
        <NavPermissionSection 
          role="TEACHER" 
          label="Enseignants" 
          icon={<Users />}
          items={teacherItems} 
          permissions={navPermissions} 
          onToggle={toggleNavPermission} 
        />
        <NavPermissionSection 
          role="SUBADMIN" 
          label="Préfets" 
          icon={<Shield />}
          items={subAdminItems} 
          permissions={navPermissions} 
          onToggle={toggleNavPermission} 
        />
        <NavPermissionSection 
          role="AEFE" 
          label="RPP et Direction" 
          icon={<School />}
          items={aefeItems} 
          permissions={navPermissions} 
          onToggle={toggleNavPermission} 
        />
      </div>

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  )
}

