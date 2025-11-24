import { Link, useNavigate } from 'react-router-dom'

export default function NavBar() {
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
            <Link to="/admin/template-builder" className="nav-link">Templates</Link>
            <Link to="/admin/media" className="nav-link">Média</Link>
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
          <button className="btn secondary" onClick={logout}>Déconnexion</button>
        )}
      </div>
    </div>
  )
}
