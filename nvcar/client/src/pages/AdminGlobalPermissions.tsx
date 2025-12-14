import { Link } from 'react-router-dom'

export default function AdminGlobalPermissions() {
    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: 32 }}>
                <h2 className="title" style={{ fontSize: 28, marginBottom: 8 }}>Supervision Globale</h2>
                <p className="note" style={{ fontSize: 16, color: '#64748b' }}>
                    Consulter l'ensemble des carnets et gérer les signatures des préfets.
                </p>
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    <Link to="/admin/all-gradebooks" className="btn primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        Voir tous les carnets (Admin)
                    </Link>
                    <Link to="/admin/signatures" className="btn secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        Signatures
                    </Link>
                </div>
            </div>
        </div>
    )
}
