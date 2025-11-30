import { Link } from 'react-router-dom'

export default function AdminDashboard() {
  return (
    <div className="container">
      <div style={{ marginBottom: 32 }}>
        <h2 className="title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Admin Dashboard</h2>
        <p className="note" style={{ fontSize: '1rem' }}>Welcome back. Manage your school resources and users from here.</p>
      </div>
      
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        
        {/* Analytics - NEW */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#e0e7ff', padding: 12, borderRadius: 12, fontSize: 24 }}>📊</div>
            <h3 style={{ margin: 0 }}>Analytics</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Vue d'ensemble et statistiques.</p>
          <Link className="btn" to="/admin/analytics" style={{ textAlign: 'center' }}>Voir les stats</Link>
        </div>

        {/* Structure Scolaire (was Ressource) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#eef2ff', padding: 12, borderRadius: 12, fontSize: 24 }}>🏫</div>
            <h3 style={{ margin: 0 }}>Structure Scolaire</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Années, Classes, Élèves.</p>
          <Link className="btn" to="/admin/ressource" style={{ textAlign: 'center' }}>Gérer la structure</Link>
        </div>

        {/* User Management */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fff0f6', padding: 12, borderRadius: 12, fontSize: 24 }}>👥</div>
            <h3 style={{ margin: 0 }}>Utilisateurs</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Enseignants, Admins, Sous-admins.</p>
          <Link className="btn" to="/admin/users" style={{ textAlign: 'center' }}>Gérer les utilisateurs</Link>
        </div>

        {/* Media Management - NEW LINK */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fdf4ff', padding: 12, borderRadius: 12, fontSize: 24 }}>🖼️</div>
            <h3 style={{ margin: 0 }}>Média</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Bibliothèque d'images et fichiers.</p>
          <Link className="btn" to="/admin/media" style={{ textAlign: 'center' }}>Gérer les médias</Link>
        </div>

        {/* Template Builder */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 12, fontSize: 24 }}>✏️</div>
            <h3 style={{ margin: 0 }}>Templates</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Créer et éditer les modèles de carnets.</p>
          <Link className="btn" to="/admin/template-builder" style={{ textAlign: 'center' }}>Éditeur visuel</Link>
        </div>

        {/* Saved Gradebooks */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f6ffed', padding: 12, borderRadius: 12, fontSize: 24 }}>📂</div>
            <h3 style={{ margin: 0 }}>Carnets</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Voir et gérer les carnets sauvegardés.</p>
          <Link className="btn" to="/admin/gradebooks" style={{ textAlign: 'center' }}>Ouvrir</Link>
        </div>

        {/* Assignments */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gridColumn: 'span 1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fff7e6', padding: 12, borderRadius: 12, fontSize: 24 }}>🔗</div>
            <h3 style={{ margin: 0 }}>Assignations</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Gérer enseignants, carnets, sous-admins.</p>
          <div className="toolbar" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Link className="btn" to="/admin/assignments" style={{ textAlign: 'center' }}>Créer</Link>
            <Link className="btn secondary" to="/admin/assignment-list" style={{ textAlign: 'center' }}>Voir tout</Link>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 12, fontSize: 24 }}>📜</div>
            <h3 style={{ margin: 0 }}>Logs</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Suivi des actions utilisateurs.</p>
          <Link className="btn" to="/admin/audit-logs" style={{ textAlign: 'center' }}>Voir les logs</Link>
        </div>

        {/* Suggestions */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fdf2f8', padding: 12, borderRadius: 12, fontSize: 24 }}>💡</div>
            <h3 style={{ margin: 0 }}>Suggestions</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Revoir les suggestions des sous-admins.</p>
          <Link className="btn" to="/admin/suggestions" style={{ textAlign: 'center' }}>Voir les suggestions</Link>
        </div>
      </div>
    </div>
  )
}
