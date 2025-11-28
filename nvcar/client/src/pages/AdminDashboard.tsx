import { Link } from 'react-router-dom'

export default function AdminDashboard() {
  return (
    <div className="container">
      <div style={{ marginBottom: 32 }}>
        <h2 className="title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Admin Dashboard</h2>
        <p className="note" style={{ fontSize: '1rem' }}>Welcome back. Manage your school resources and users from here.</p>
      </div>
      
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        {/* Resource Management */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#eef2ff', padding: 12, borderRadius: 12, fontSize: 24 }}>📚</div>
            <h3 style={{ margin: 0 }}>Ressource</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Manage school resources and materials.</p>
          <Link className="btn" to="/admin/ressource" style={{ textAlign: 'center' }}>Créer et gérer</Link>
        </div>

        {/* User Management */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fff0f6', padding: 12, borderRadius: 12, fontSize: 24 }}>👥</div>
            <h3 style={{ margin: 0 }}>Utilisateurs</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Manage teachers, students, and admins.</p>
          <Link className="btn" to="/admin/users" style={{ textAlign: 'center' }}>Gérer les utilisateurs</Link>
        </div>

        {/* Template Builder */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 12, fontSize: 24 }}>✏️</div>
            <h3 style={{ margin: 0 }}>Templates</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>Create and edit gradebook templates.</p>
          <Link className="btn" to="/admin/template-builder" style={{ textAlign: 'center' }}>Éditeur visuel</Link>
        </div>

        {/* Saved Gradebooks */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f6ffed', padding: 12, borderRadius: 12, fontSize: 24 }}>📂</div>
            <h3 style={{ margin: 0 }}>Carnets</h3>
          </div>
          <p className="note" style={{ marginBottom: 24, flex: 1 }}>View and manage saved gradebooks.</p>
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
      </div>
    </div>
  )
}
