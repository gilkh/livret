import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LucideIcon } from 'lucide-react'

interface DashboardCardProps {
  title: string
  description: string
  icon: LucideIcon
  to?: string
  color: string // CSS color variable or hex for the icon background
  iconColor?: string // Optional icon color, defaults to the color prop but darker or specific
  children?: ReactNode
  className?: string
}

export default function DashboardCard({
  title,
  description,
  icon: Icon,
  to,
  color,
  iconColor,
  children,
  className = ''
}: DashboardCardProps) {
  const CardContent = (
    <div className={`dashboard-card ${className}`}>
      <div className="dashboard-card-header">
        <div 
          className="dashboard-card-icon"
          style={{ background: color, color: iconColor || 'var(--text)' }}
        >
          <Icon size={24} />
        </div>
        <h3 className="dashboard-card-title">{title}</h3>
      </div>
      
      <p className="dashboard-card-description">{description}</p>
      
      <div className="dashboard-card-footer">
        {children ? (
          children
        ) : to ? (
          <span className="dashboard-card-link">
            Accéder &rarr;
          </span>
        ) : null}
      </div>
    </div>
  )

  if (to && !children) {
    return (
      <Link to={to} className="dashboard-card-wrapper">
        {CardContent}
      </Link>
    )
  }

  return <div className="dashboard-card-wrapper">{CardContent}</div>
}
