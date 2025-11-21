import { Link, useNavigate } from 'react-router-dom'

export default function NavBar() {
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const navigate = useNavigate()
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('role'); navigate('/login') }
  return (
    <div className="navbar">
      <div className="nav-left">
        <Link to={role === 'ADMIN' || role === 'SUBADMIN' ? '/admin' : '/'} className="nav-brand">NVCar</Link>
      </div>
      <div className="nav-center">
        {role === 'ADMIN' || role === 'SUBADMIN' ? (
          <>
            <Link to="/admin" className="nav-link">Accueil Admin</Link>
            <Link to="/admin/users" className="nav-link">Utilisateurs</Link>
            <Link to="/admin/students" className="nav-link">Élèves</Link>
            <Link to="/admin/template-builder" className="nav-link">Templates</Link>
            <Link to="/admin/media" className="nav-link">Média</Link>
          </>
        ) : token ? (
          <>
            <Link to="/" className="nav-link">Accueil Enseignant</Link>
          </>
        ) : null}
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
