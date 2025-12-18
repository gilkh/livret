import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useSchoolYear } from '../context/SchoolYearContext'
import { useState, useEffect } from 'react'
import api from '../api'

export default function NavBar() {
  const role = typeof window !== 'undefined' ? (sessionStorage.getItem('role') || localStorage.getItem('role')) : null
  const token = typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null
  const displayName = typeof window !== 'undefined' ? (sessionStorage.getItem('displayName') || localStorage.getItem('displayName')) : null
  const navigate = useNavigate()
  const location = useLocation()
  const { activeYear, years, activeYearId, setActiveYearId } = useSchoolYear()
  const [navPermissions, setNavPermissions] = useState<any>({})

  useEffect(() => {
    api.get('/settings/public').then(res => {
      setNavPermissions(res.data.nav_permissions || {})
    }).catch(err => console.error(err))
  }, [])

  const canShow = (role: string, key: string) => {
    return navPermissions[role]?.[key] !== false
  }

  const logout = () => {
    // Clear both session and local storage
    if (sessionStorage.getItem('token')) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('role')
      sessionStorage.removeItem('displayName')
    }
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('displayName')
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === location.pathname) return true
    // Handle root paths that are prefixes of other paths
    if (['/admin', '/subadmin/dashboard', '/aefe/dashboard'].includes(path)) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="navbar">
      <div className="nav-left">
        <Link to={
          role === 'ADMIN' ? '/admin' :
            role === 'SUBADMIN' ? '/subadmin/dashboard' :
              role === 'AEFE' ? '/aefe/dashboard' :
                '/teacher/classes'
        } className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src="/logosklnav.jpg" alt="Logo SKL" style={{ height: '66px', objectFit: 'contain' }} />
          <img src="/logoaefenav.jpg" alt="Logo AEFE" style={{ height: '66px', objectFit: 'contain' }} />
        </Link>
      </div>
      <div className="nav-center">
        {role === 'ADMIN' && (
          <>
            <Link to="/admin" className={`nav-link ${isActive('/admin') ? 'active' : ''}`}>Accueil</Link>
            <Link to="/admin/ressource" className={`nav-link ${isActive('/admin/ressource') ? 'active' : ''}`}>Structure Scolaire</Link>
            <Link to="/admin/users" className={`nav-link ${isActive('/admin/users') ? 'active' : ''}`}>Utilisateurs</Link>
            <Link to="/admin/assignments" className={`nav-link ${isActive('/admin/assignments') ? 'active' : ''}`}>Assignations</Link>
            <Link to="/admin/template-builder" className={`nav-link ${isActive('/admin/template-builder') ? 'active' : ''}`}>Templates</Link>
          </>
        )}
        {role === 'SUBADMIN' && (
          <>
            {canShow('SUBADMIN', 'dashboard') && <Link to="/subadmin/dashboard" className={`nav-link ${isActive('/subadmin/dashboard') ? 'active' : ''}`}>Tableau de bord</Link>}
            {canShow('SUBADMIN', 'progress') && <Link to="/subadmin/progress" className={`nav-link ${isActive('/subadmin/progress') ? 'active' : ''}`}>Progression</Link>}
            {canShow('SUBADMIN', 'teacher-progress') && <Link to="/subadmin/teacher-progress" className={`nav-link ${isActive('/subadmin/teacher-progress') ? 'active' : ''}`}>Suivi Enseignants</Link>}
            {canShow('SUBADMIN', 'gradebooks') && <Link to="/subadmin/gradebooks" className={`nav-link ${isActive('/subadmin/gradebooks') ? 'active' : ''}`}>Carnet</Link>}
            {canShow('SUBADMIN', 'eleves') && <Link to="/subadmin/eleves" className={`nav-link ${isActive('/subadmin/eleves') ? 'active' : ''}`}>Élèves</Link>}
            {canShow('SUBADMIN', 'signature') && <Link to="/subadmin/signature" className={`nav-link ${isActive('/subadmin/signature') ? 'active' : ''}`}>Ma signature</Link>}
            <Link to="/subadmin/semester-request" className={`nav-link ${isActive('/subadmin/semester-request') ? 'active' : ''}`}>Demande de Semestre</Link>
          </>
        )}
        {role === 'AEFE' && (
          <>
            {canShow('AEFE', 'dashboard') && <Link to="/aefe/dashboard" className={`nav-link ${isActive('/aefe/dashboard') ? 'active' : ''}`}>Tableau de bord</Link>}
            {canShow('AEFE', 'progress') && <Link to="/aefe/progress" className={`nav-link ${isActive('/aefe/progress') ? 'active' : ''}`}>Progression</Link>}
            {canShow('AEFE', 'teacher-progress') && <Link to="/aefe/teacher-progress" className={`nav-link ${isActive('/aefe/teacher-progress') ? 'active' : ''}`}>Suivi Enseignants</Link>}
            {canShow('AEFE', 'gradebooks') && <Link to="/aefe/gradebooks" className={`nav-link ${isActive('/aefe/gradebooks') ? 'active' : ''}`}>Carnet</Link>}
          </>
        )}
        {role === 'TEACHER' && token && (
          <>
            {canShow('TEACHER', 'classes') && <Link to="/teacher/classes" className={`nav-link ${isActive('/teacher/classes') ? 'active' : ''}`}>Mes Classes</Link>}
          </>
        )}
      </div>
      <div className="nav-right">
        {!token ? (
          <Link to="/login" className="btn">Connexion</Link>
        ) : (
          <>
            {/* Year Switcher (hidden for teachers, aefe, and subadmin) */}
            {years.length > 0 && role === 'ADMIN' && (
              <div style={{ marginRight: '16px', position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select
                  value={activeYearId}
                  onChange={(e) => setActiveYearId(e.target.value)}
                  style={{
                    appearance: 'none',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    border: '1px solid rgba(108, 92, 231, 0.2)',
                    borderRadius: '16px',
                    padding: '4px 28px 4px 12px',
                    color: 'var(--primary)',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                >
                  {years.map(y => (
                    <option key={y._id} value={y._id}>
                      {y.name} {y.active ? '(Actif)' : ''}
                    </option>
                  ))}
                </select>
                <svg
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    pointerEvents: 'none',
                    color: 'var(--primary)'
                  }}
                >
                  <polyline points="1 1 5 5 9 1"></polyline>
                </svg>
              </div>
            )}

            {role === 'ADMIN' && (
              <>
                <Link to="/admin/settings" className={`nav-link ${isActive('/admin/settings') ? 'active' : ''}`} title="Paramètres" style={{ marginRight: '16px', display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </Link>
              </>
            )}
            {displayName && (
              <span style={{
                marginRight: '16px',
                fontWeight: '500',
                color: '#333',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6 }}>
                  <path d="M10 10c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                {displayName}
              </span>
            )}
            <button className="btn secondary" onClick={logout}>Déconnexion</button>
          </>
        )}
      </div>
    </div>
  )
}
