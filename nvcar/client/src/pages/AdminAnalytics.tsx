import { useEffect, useState } from 'react'
import api from '../api'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { 
  Users, School, GraduationCap, FileText, 
  Activity
} from 'lucide-react'

interface AnalyticsData {
  counts: {
    users: number
    classes: number
    students: number
  }
  distribution: {
    usersByRole: Record<string, number>
    assignmentsByStatus: Record<string, number>
  }
  recentActivity: any[]
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Connexion',
  CREATE_OUTLOOK_USER: 'Création utilisateur Outlook',
  UPDATE_OUTLOOK_USER: 'Mise à jour utilisateur Outlook',
  DELETE_OUTLOOK_USER: 'Suppression utilisateur Outlook',
  START_IMPERSONATION: 'Début impersonnation',
  STOP_IMPERSONATION: 'Fin impersonnation',
}

const formatDetails = (details: any) => {
  if (!details) return null
  return Object.entries(details)
    .filter(([key]) => !['passwordHash', '_id', '__v'].includes(key))
    .map(([key, value]) => {
      const label = key === 'email' ? 'Email' 
                  : key === 'role' ? 'Rôle' 
                  : key === 'targetUserEmail' ? 'Cible'
                  : key
      return `${label}: ${value}`
    })
    .join(' | ')
}

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await api.get('/analytics')
        setData(res.data)
      } catch (e) {
        console.error("Failed to load stats", e)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>
  if (!data) return <div className="container" style={{ textAlign: 'center', padding: '40px', color: 'red' }}>Erreur de chargement</div>

  const assignmentData = Object.entries(data.distribution.assignmentsByStatus || {}).map(([name, value]) => ({
    name: name === 'draft' ? 'Brouillon' : 
          name === 'in_progress' ? 'En cours' : 
          name === 'completed' ? 'Terminé' : 
          name === 'signed' ? 'Signé' : name,
    value
  }))

  const roleData = Object.entries(data.distribution.usersByRole || {}).map(([name, value]) => ({
    name: name === 'ADMIN' ? 'Admin' : 
          name === 'SUBADMIN' ? 'Coordinateur' : 
          name === 'TEACHER' ? 'Enseignant' : name,
    value
  }))

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ 
        padding: '12px', 
        borderRadius: '12px', 
        background: `${color}20`, // 20% opacity
        color: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon size={32} />
      </div>
      <div>
        <p className="note" style={{ fontSize: '14px', margin: 0 }}>{title}</p>
        <h3 style={{ fontSize: '24px', fontWeight: 'bold', margin: '4px 0 0 0', color: '#2d3436' }}>{value}</h3>
      </div>
    </div>
  )

  return (
    <div className="container">
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '600', margin: '0 0 8px 0', color: '#2d3436' }}>Tableau de bord analytique</h1>
        <p className="note" style={{ fontSize: '16px' }}>Vue d'ensemble de l'activité de l'école</p>
      </div>

      {/* Key Metrics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px', 
        marginBottom: '32px' 
      }}>
        <StatCard 
          title="Utilisateurs" 
          value={data.counts.users} 
          icon={Users} 
          color="#2563eb" // blue-600
        />
        <StatCard 
          title="Classes" 
          value={data.counts.classes} 
          icon={School} 
          color="#059669" // emerald-600
        />
        <StatCard 
          title="Élèves" 
          value={data.counts.students} 
          icon={GraduationCap} 
          color="#7c3aed" // violet-600
        />
        <StatCard 
          title="Livrets (Total)" 
          value={Object.values(data.distribution.assignmentsByStatus || {}).reduce((a, b) => a + b, 0)} 
          icon={FileText} 
          color="#d97706" // amber-600
        />
      </div>

      {/* Charts Section */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
        gap: '32px', 
        marginBottom: '32px' 
      }}>
        {/* Assignment Status Chart */}
        <div className="card">
          <h3 className="title" style={{ marginBottom: '24px', fontSize: '18px' }}>État des Livrets</h3>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={assignmentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {assignmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Distribution Chart */}
        <div className="card">
          <h3 className="title" style={{ marginBottom: '24px', fontSize: '18px' }}>Répartition des Rôles</h3>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
