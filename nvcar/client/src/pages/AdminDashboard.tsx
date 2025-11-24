import { Link } from 'react-router-dom'

export default function AdminDashboard() {
  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Admin Dashboard</h2>
        <div className="grid2">
          <div className="card">
            <h3>Ressource</h3>
            <Link className="btn" to="/admin/ressource">Créer et gérer</Link>
          </div>
          <div className="card">
            <h3>Utilisateurs</h3>
            <Link className="btn" to="/admin/users">Gérer les utilisateurs</Link>
          </div>
          <div className="card">
            <h3>Templates de carnets</h3>
            <Link className="btn" to="/admin/template-builder">Éditeur visuel</Link>
          </div>
          <div className="card">
            <h3>Carnets sauvegardés</h3>
            <Link className="btn" to="/admin/gradebooks">Ouvrir</Link>
          </div>
          <div className="card">
            <h3>Gestion des assignations</h3>
            <div className="toolbar">
              <Link className="btn" to="/admin/assignments">Créer assignation</Link>
              <Link className="btn secondary" to="/admin/assignment-list">Voir toutes</Link>
            </div>
            <div className="note" style={{ marginTop: 8 }}>Gérer enseignants, carnets, sous-admins</div>
          </div>
          <div className="card">
            <h3>Journal d'activité</h3>
            <Link className="btn" to="/admin/audit-logs">Voir les logs</Link>
            <div className="note" style={{ marginTop: 8 }}>Suivi des actions utilisateurs</div>
          </div>
        </div>
      </div>
    </div>
  )
}
