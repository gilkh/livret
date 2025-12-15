import { Link } from 'react-router-dom'
import { 
  BarChart3, 
  School, 
  Users, 
  Image, 
  PenTool, 
  FolderOpen, 
  Link as LinkIcon, 
  ScrollText, 
  Lightbulb, 
  TrendingUp, 
  Key, 
  Globe, 
  Eye, 
  GraduationCap, 
  Activity 
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import './AdminDashboard.css'

export default function AdminDashboard() {
  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Tableau de Bord</h1>
        <p className="dashboard-subtitle">Bienvenue dans l'espace d'administration. Gérez les ressources scolaires, les utilisateurs et les carnets.</p>
      </header>
      
      <div className="dashboard-content">
        
        {/* Section: Vue d'ensemble */}
        <section className="dashboard-section">
          <h2 className="section-title">Vue d'ensemble</h2>
          <div className="dashboard-grid">
            <DashboardCard
              title="Analytics"
              description="Vue d'ensemble et statistiques."
              icon={BarChart3}
              to="/admin/analytics"
              color="#e0e7ff"
              iconColor="#4f46e5"
            />
            <DashboardCard
              title="Progression"
              description="Suivi global de l'avancement."
              icon={TrendingUp}
              to="/admin/progress"
              color="#ecfeff"
              iconColor="#0891b2"
            />
            <DashboardCard
              title="Compétences"
              description="Stats par compétence."
              icon={BarChart3}
              to="/admin/skill-analytics"
              color="#fef3c7"
              iconColor="#d97706"
            />
            <DashboardCard
              title="En Ligne"
              description="Utilisateurs actifs en temps réel."
              icon={Activity}
              to="/admin/online-users"
              color="#f0fdf4"
              iconColor="#15803d"
            />
             <DashboardCard
              title="Logs"
              description="Historique des actions."
              icon={ScrollText}
              to="/admin/audit-logs"
              color="#f5f5f5"
              iconColor="#595959"
            />
          </div>
        </section>

        {/* Section: Gestion Scolaire */}
        <section className="dashboard-section">
          <h2 className="section-title">Gestion Scolaire</h2>
          <div className="dashboard-grid">
            <DashboardCard
              title="Structure"
              description="Années, classes et élèves."
              icon={School}
              to="/admin/ressource"
              color="#eef2ff"
              iconColor="#4338ca"
            />
            <DashboardCard
              title="Utilisateurs"
              description="Enseignants et admins."
              icon={Users}
              to="/admin/users"
              color="#fff0f6"
              iconColor="#db2777"
            />
            <DashboardCard
              title="Assignations"
              description="Affectations enseignants."
              icon={LinkIcon}
              color="#fff7e6"
              iconColor="#d46b08"
            >
              <div className="dashboard-toolbar">
                <Link className="dashboard-btn dashboard-btn-primary" to="/admin/assignments">Créer</Link>
                <Link className="dashboard-btn dashboard-btn-secondary" to="/admin/assignment-list">Voir</Link>
              </div>
            </DashboardCard>
             <DashboardCard
              title="Passage Élèves"
              description="Promotions annuelles."
              icon={GraduationCap}
              to="/admin/student-promotions"
              color="#ffedd5"
              iconColor="#c2410c"
            />
          </div>
        </section>

        {/* Section: Contenu & Carnets */}
        <section className="dashboard-section">
          <h2 className="section-title">Contenu & Carnets</h2>
          <div className="dashboard-grid">
            <DashboardCard
              title="Templates"
              description="Éditeur de modèles."
              icon={PenTool}
              to="/admin/template-builder"
              color="#f0f9ff"
              iconColor="#0284c7"
            />
            <DashboardCard
              title="Carnets"
              description="Carnets sauvegardés."
              icon={FolderOpen}
              to="/admin/gradebooks"
              color="#f6ffed"
              iconColor="#52c41a"
            />
             <DashboardCard
              title="Supervision"
              description="Accès global aux carnets."
              icon={Globe}
              to="/admin/global-permissions"
              color="#e0f2fe"
              iconColor="#0369a1"
            />
            <DashboardCard
              title="Média"
              description="Bibliothèque de fichiers."
              icon={Image}
              to="/admin/media"
              color="#fdf4ff"
              iconColor="#c026d3"
            />
          </div>
        </section>

        {/* Section: Administration */}
        <section className="dashboard-section">
          <h2 className="section-title">Administration</h2>
          <div className="dashboard-grid">
            <DashboardCard
              title="Permissions"
              description="Droits des sous-admins."
              icon={Key}
              to="/admin/permissions"
              color="#fffbeb"
              iconColor="#b45309"
            />
            <DashboardCard
              title="Menu"
              description="Visibilité navigation."
              icon={Eye}
              to="/admin/navigation-visibility"
              color="#f3e8ff"
              iconColor="#7e22ce"
            />
            <DashboardCard
              title="Suggestions"
              description="Retours enseignants."
              icon={Lightbulb}
              to="/admin/suggestions"
              color="#fdf2f8"
              iconColor="#be185d"
            />
          </div>
        </section>

      </div>
    </div>
  )
}

