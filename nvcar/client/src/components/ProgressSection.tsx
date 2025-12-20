import React from 'react'
import './ProgressSection.css'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

type CategoryProgress = {
  name: string
  total: number
  filled: number
  percentage: number
}

type ProgressProps = {
  title: string
  subtitle?: string
  progress: { total: number; filled: number; percentage: number }
  byCategory: CategoryProgress[]
  color?: string
  compact?: boolean
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

export default function ProgressSection({
  title,
  subtitle,
  progress,
  byCategory,
  color = '#fff',
  compact = false
}: ProgressProps) {
  const titleId = `progress-section-${title.replace(/\s+/g, '-')}`

  // Accessible summary for screen readers
  const srSummary = `${title} — ${progress.percentage}% complété. ${progress.filled} sur ${progress.total} éléments remplis.`

  return (
    <section
      className="progress-section"
      role="region"
      aria-labelledby={titleId}
      tabIndex={0}
      style={{
        background: color,
        borderRadius: compact ? 10 : 12,
        border: '1px solid #e2e8f0',
        padding: compact ? 16 : 24,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: compact ? 12 : 24 }}>
        <div>
          <h4 id={titleId} style={{ fontSize: compact ? 16 : 20, fontWeight: 600, color: '#0f172a', margin: 0 }}>{title}</h4>
          {subtitle && <div style={{ color: '#64748b', fontSize: compact ? 13 : 15, marginTop: 4 }}>{subtitle}</div>}
        </div>
      </div>

      {/* Hidden textual summary for screen readers */}
      <div aria-hidden={false} style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        {srSummary}
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 16 : 32 }}>
        {/* Global Progress Pie Chart */}
        <div style={{ flex: compact ? '0 0 180px' : '0 0 250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h5 style={{ fontSize: compact ? 13 : 16, fontWeight: 600, color: '#475569', marginBottom: compact ? 8 : 12 }}>Progression Globale</h5>
          <div style={{ width: compact ? 140 : 200, height: compact ? 140 : 200, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart aria-label={`Diagramme circulaire de progression: ${progress.percentage}% complété`}>
                <Pie
                  data={[{ name: 'Rempli', value: progress.filled }, { name: 'Restant', value: progress.total - progress.filled }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={compact ? 42 : 60}
                  outerRadius={compact ? 58 : 80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell key="filled" fill="#22c55e" />
                  <Cell key="remaining" fill="#e2e8f0" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: compact ? 18 : 24, fontWeight: 700, color: '#0f172a' }}>{progress.percentage}%</div>
              <div style={{ fontSize: compact ? 11 : 12, color: '#64748b' }}>complété</div>
            </div>
          </div>
        </div>

        {/* Category Progress Bar Chart */}
        <div style={{ flex: 1, minWidth: compact ? 260 : 300 }}>
          <h5 style={{ fontSize: compact ? 13 : 16, fontWeight: 600, color: '#475569', marginBottom: compact ? 8 : 12 }}>Par Domaine / Langue</h5>
          <div style={{ width: '100%', height: compact ? 160 : 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} layout="vertical" margin={{ top: 5, right: 18, left: compact ? 18 : 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis dataKey="name" type="category" width={compact ? 80 : 100} tick={{ fontSize: compact ? 11 : 12 }} />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    const data = props.payload
                    return [`${data.filled}/${data.total} (${value}%)`, 'Progression']
                  }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={compact ? 12 : 20} aria-label="Barres de progression">
                  {byCategory.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend for categories */}
          <div role="list" aria-label={`${title} légende`} style={{ marginTop: 12 }}>
            {byCategory.map((cat: any, idx: number) => (
              <div key={cat.name} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span aria-hidden style={{ width: 12, height: 12, background: COLORS[idx % COLORS.length], borderRadius: 3, display: 'inline-block' }} />
                <span style={{ fontSize: 13, color: '#334155' }}>{cat.name} — <span style={{ color: '#64748b', fontSize: 12 }}>{cat.percentage}%</span> <span style={{ color: '#9aa4b2', fontSize: 12 }}>({cat.filled}/{cat.total})</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
