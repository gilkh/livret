import { Link, useNavigate } from 'react-router-dom'
import { useSchoolYear } from '../context/SchoolYearContext'

export default function NavBar() {
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const displayName = typeof window !== 'undefined' ? localStorage.getItem('displayName') : null
  const navigate = useNavigate()
  const { activeYear } = useSchoolYear()

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('displayName')
    navigate('/login')
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
            <Link to="/admin" className="nav-link">Accueil</Link>
            <Link to="/admin/ressource" className="nav-link">Structure Scolaire</Link>
            <Link to="/admin/users" className="nav-link">Utilisateurs</Link>
            <Link to="/admin/assignments" className="nav-link">Assignations</Link>
            <Link to="/admin/template-builder" className="nav-link">Templates</Link>
          </>
        )}
        {role === 'SUBADMIN' && (
          <>
            <Link to="/subadmin/dashboard" className="nav-link">Tableau de bord</Link>
            <Link to="/subadmin/progress" className="nav-link">Progression</Link>
            <Link to="/subadmin/teacher-progress" className="nav-link">Suivi Enseignants</Link>
            <Link to="/subadmin/gradebooks" className="nav-link">Carnet</Link>
            <Link to="/subadmin/signature" className="nav-link">Ma signature</Link>
          </>
        )}
        {role === 'AEFE' && (
          <>
            <Link to="/aefe/dashboard" className="nav-link">Tableau de bord</Link>
            <Link to="/aefe/progress" className="nav-link">Progression</Link>
            <Link to="/aefe/teacher-progress" className="nav-link">Suivi Enseignants</Link>
            <Link to="/aefe/gradebooks" className="nav-link">Carnet</Link>
          </>
        )}
        {role === 'TEACHER' && token && (
          <>
            <Link to="/teacher/classes" className="nav-link">Mes Classes</Link>
          </>
        )}
      </div>
      <div className="nav-right">
        {!token ? (
          <Link to="/login" className="btn">Connexion</Link>
        ) : (
          <>
            {role === 'ADMIN' && (
              <>
                {activeYear && (
                  <span style={{ 
                    marginRight: '16px', 
                    fontWeight: '600',
                    color: 'var(--primary)',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '0.85rem'
                  }}>
                    {activeYear.name} - S{activeYear.activeSemester || 1}
                  </span>
                )}
                <Link to="/admin/settings" className="nav-link" title="Paramètres" style={{ marginRight: '16px', display: 'inline-flex', alignItems: 'center' }}>
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
                  <path d="M10 10c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
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
