import { Link, useNavigate } from 'react-router-dom'

export default function NavBar() {
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const displayName = typeof window !== 'undefined' ? localStorage.getItem('displayName') : null
  const navigate = useNavigate()
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
              '/teacher/classes'
        } className="nav-brand">NVCar</Link>
      </div>
      <div className="nav-center">
        {role === 'ADMIN' && (
          <>
            <Link to="/admin" className="nav-link">Accueil</Link>
            <Link to="/admin/users" className="nav-link">Utilisateurs</Link>
            <Link to="/admin/assignments" className="nav-link">Assignations</Link>
            <Link to="/admin/template-builder" className="nav-link">Templates</Link>
            <Link to="/admin/media" className="nav-link">Média</Link>
          </>
        )}
        {role === 'SUBADMIN' && (
          <>
            <Link to="/subadmin/dashboard" className="nav-link">Tableau de bord</Link>
            <Link to="/subadmin/signature" className="nav-link">Ma signature</Link>
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
