import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import Toast from '../components/Toast'
import './AdminSettings.css'

// Icons as components for cleaner code
const Icons = {
  Settings: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  Activity: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  Lock: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  Users: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Mail: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  FileText: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  Database: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  Tool: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  Calendar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Box: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>,
  ChevronDown: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>,
  Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  AlertTriangle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  Grid: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  Search: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Menu: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Save: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
  Folder: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  Bell: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
}

type SectionId = 'status' | 'monitoring' | 'year' | 'access' | 'teacher' | 'smtp' | 'signature' | 'database' | 'maintenance' | 'sandbox' | 'notiftest'

interface NavItem {
  id: SectionId
  label: string
  icon: keyof typeof Icons
  color: string
  description: string
}

const navItems: NavItem[] = [
  { id: 'sandbox', label: 'Simulation Lab', icon: 'Grid', color: '#00b894', description: 'Environnement de test' },
  { id: 'status', label: 'État du Système', icon: 'Activity', color: '#00b894', description: 'Statut des services' },
  { id: 'monitoring', label: 'Diagnostics', icon: 'Box', color: '#ff7675', description: 'Surveillance & logs' },
  { id: 'year', label: 'Année Scolaire', icon: 'Calendar', color: '#6c5ce7', description: 'Session admin' },
  { id: 'access', label: 'Accès & Sécurité', icon: 'Lock', color: '#6c5ce7', description: 'Connexions utilisateurs' },
  { id: 'teacher', label: 'Options Enseignants', icon: 'Users', color: '#9b59b6', description: 'Affichage & vues' },
  { id: 'smtp', label: 'Email (SMTP)', icon: 'Mail', color: '#3498db', description: 'Configuration email' },
  { id: 'signature', label: 'Restrictions Signature', icon: 'FileText', color: '#ff9f43', description: 'Règles sous-admin' },
  { id: 'database', label: 'Base de Données', icon: 'Database', color: '#3498db', description: 'Sauvegardes' },
  { id: 'maintenance', label: 'Maintenance', icon: 'Tool', color: '#fd79a8', description: 'Outils système' },
  { id: 'notiftest', label: 'Test Notification', icon: 'Bell', color: '#f59e0b', description: 'Tester le popup session' },
]

export default function AdminSettings() {
  const navigate = useNavigate()
  const { years, activeYearId, setActiveYearId } = useSchoolYear()
  const [activeSection, setActiveSection] = useState<SectionId>('status')
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(new Set())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({} as any)

  // Settings state
  const [teacherLogin, setTeacherLogin] = useState(true)
  const [subAdminLogin, setSubAdminLogin] = useState(true)
  const [microsoftLogin, setMicrosoftLogin] = useState(true)
  const [subAdminRestriction, setSubAdminRestriction] = useState(true)
  const [subAdminExemptStandard, setSubAdminExemptStandard] = useState(false)
  const [subAdminExemptFinal, setSubAdminExemptFinal] = useState(false)
  const [teacherQuickGrading, setTeacherQuickGrading] = useState(true)
  const [assignmentKeysStr, setAssignmentKeysStr] = useState('')
  const [assignmentAutoInfer, setAssignmentAutoInfer] = useState(true)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [backupLoading, setBackupLoading] = useState(false)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const [backupInterval, setBackupInterval] = useState(60)
  const [dirHandle, setDirHandle] = useState<any>(null)
  const [nextBackupTime, setNextBackupTime] = useState<Date | null>(null)
  const [systemStatus, setSystemStatus] = useState<{ backend: string; database: string; uptime: number } | null>(null)
  const [backups, setBackups] = useState<{ name: string, size: number, date: string }[]>([])
  const [emptyClickCount, setEmptyClickCount] = useState(0)
  const [testToast, setTestToast] = useState<{ message: string; type: 'info' | 'success' | 'error'; actionLabel?: string; onAction?: () => void } | null>(null)
  const [testExtending, setTestExtending] = useState(false)

  // SMTP
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpTestEmail, setSmtpTestEmail] = useState('')
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg(text)
    setMsgType(type)
  }

  const toggleSection = (id: SectionId) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id)
    setMobileMenuOpen(false)
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // API calls
  useEffect(() => { loadSettings(); checkStatus(); loadBackups() }, [])
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) } }, [msg])

  const loadBackups = async () => { try { const res = await api.get('/backup/list'); setBackups(res.data) } catch (e) { console.error(e) } }
  const checkStatus = async () => { try { const res = await api.get('/settings/status'); setSystemStatus(res.data) } catch { setSystemStatus({ backend: 'offline', database: 'unknown', uptime: 0 }) } }

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings')
      setTeacherLogin(res.data.login_enabled_teacher !== false)
      setSubAdminLogin(res.data.login_enabled_subadmin !== false)
      setMicrosoftLogin(res.data.login_enabled_microsoft !== false)
      setSubAdminRestriction(res.data.subadmin_restriction_enabled !== false)
      setSubAdminExemptStandard(res.data.subadmin_restriction_exempt_standard === true)
      setSubAdminExemptFinal(res.data.subadmin_restriction_exempt_final === true)
      setTeacherQuickGrading(res.data.teacher_quick_grading_enabled !== false)
      setAssignmentKeysStr(Array.isArray(res.data.assignment_long_term_keys) ? res.data.assignment_long_term_keys.join(', ') : 'longTermNotes, permanentNotes, medicalInfo, iep, edPlan, chronicNotes, comments, variables, personalHistory')
      setAssignmentAutoInfer(res.data.assignment_long_term_auto_infer !== false)
      setSmtpHost(res.data.smtp_host || '')
      setSmtpPort(res.data.smtp_port || '587')
      setSmtpUser(res.data.smtp_user || '')
      setSmtpPass(res.data.smtp_pass || '')
      setSmtpSecure(res.data.smtp_secure === true)
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const saveSetting = async (key: string, value: any) => {
    try { await api.post('/settings', { key, value }); showMsg('Paramètres mis à jour'); return true }
    catch { showMsg('Erreur lors de la mise à jour', 'error'); return false }
  }

  const toggleSetting = async (key: string, current: boolean, setter: (v: boolean) => void) => {
    const newVal = !current
    setter(newVal)
    if (!(await saveSetting(key, newVal))) setter(current)
  }

  // Backup functions
  const createBackup = async () => {
    setBackupLoading(true)
    try { await api.post('/backup/create'); showMsg('Sauvegarde créée'); await loadBackups() }
    catch { showMsg('Erreur lors de la création', 'error') }
    finally { setBackupLoading(false) }
  }

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Restaurer "${filename}" ? La BDD actuelle sera écrasée !`)) return
    setBackupLoading(true)
    try { await api.post(`/backup/restore/${filename}`); showMsg('Restauration effectuée'); setTimeout(() => window.location.reload(), 2000) }
    catch { showMsg('Erreur lors de la restauration', 'error') }
    finally { setBackupLoading(false) }
  }

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer "${filename}" ?`)) return
    try { await api.delete(`/backup/${filename}`); showMsg('Sauvegarde supprimée'); loadBackups() }
    catch { showMsg('Erreur lors de la suppression', 'error') }
  }

  const emptyDb = async () => {
    if (emptyClickCount < 4) { setEmptyClickCount(c => c + 1); return }
    const code = prompt('Tapez "CONFIRMER" pour vider la BDD.')
    if (code !== 'CONFIRMER') { setEmptyClickCount(0); return }
    setBackupLoading(true)
    try { await api.post('/backup/empty'); showMsg('BDD vidée'); setTimeout(() => window.location.reload(), 2000) }
    catch { showMsg('Erreur', 'error') }
    finally { setBackupLoading(false); setEmptyClickCount(0) }
  }

  const downloadBackup = async () => {
    for (let i = 1; i <= 5; i++) if (!confirm(`CONFIRMATION ${i}/5 : Télécharger backup complet ?`)) return
    setBackupLoading(true)
    try {
      const response = await api.get('/backup/full', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `nvcar-full-backup-${new Date().toISOString().split('T')[0]}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      showMsg('Sauvegarde téléchargée')
    } catch { showMsg('Erreur', 'error') }
    finally { setBackupLoading(false) }
  }

  // SMTP functions
  const saveSmtpSettings = async () => {
    const results = await Promise.all([
      saveSetting('smtp_host', smtpHost), saveSetting('smtp_port', smtpPort),
      saveSetting('smtp_user', smtpUser), saveSetting('smtp_pass', smtpPass), saveSetting('smtp_secure', smtpSecure)
    ])
    if (results.every(r => r)) showMsg('Configuration SMTP sauvegardée')
  }

  const testSmtpConnection = async (sendTestEmail = false) => {
    setSmtpTesting(true); setSmtpTestResult(null)
    try {
      const res = await api.post('/settings/smtp/test', { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, secure: smtpSecure, testEmail: sendTestEmail ? smtpTestEmail : undefined })
      setSmtpTestResult({ success: true, message: res.data.message })
    } catch (err: any) { setSmtpTestResult({ success: false, message: err.response?.data?.error || 'Erreur SMTP' }) }
    finally { setSmtpTesting(false) }
  }

  // Auto backup
  useEffect(() => {
    if (!autoBackupEnabled || !dirHandle) { setNextBackupTime(null); return }
    setNextBackupTime(new Date(Date.now() + backupInterval * 60000))
    const id = setInterval(async () => {
      try {
        const res = await api.get('/backup/full', { responseType: 'blob' })
        const filename = `nvcar-auto-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(new Blob([res.data]))
        await writable.close()
        showMsg(`Sauvegarde auto: ${filename}`)
        setNextBackupTime(new Date(Date.now() + backupInterval * 60000))
      } catch { showMsg('Échec sauvegarde auto', 'error') }
    }, backupInterval * 60000)
    return () => clearInterval(id)
  }, [autoBackupEnabled, dirHandle, backupInterval])

  const pickFolder = async () => {
    try { const handle = await (window as any).showDirectoryPicker(); setDirHandle(handle); showMsg('Dossier sélectionné') }
    catch { showMsg('Erreur sélection dossier', 'error') }
  }

  const openSimulationLab = () => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token')
    window.open(token ? `/simulation-lab?token=${encodeURIComponent(token)}` : '/simulation-lab', '_blank', 'noopener,noreferrer')
  }

  if (loading) return (
    <div className="admin-settings">
      <div className="settings-loading" style={{ gridColumn: '1 / -1' }}>
        <div className="settings-loading-spinner" />
        <p style={{ color: 'var(--muted)' }}>Chargement des paramètres...</p>
      </div>
    </div>
  )

  const StatusIndicator = ({ active, activeText = 'Activé', inactiveText = 'Désactivé' }: { active: boolean; activeText?: string; inactiveText?: string }) => (
    <div className="status-indicator">
      <span className={`status-dot ${active ? 'active' : 'inactive'}`} />
      <span style={{ color: active ? 'var(--success)' : '#f87171' }}>{active ? activeText : inactiveText}</span>
    </div>
  )

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <label className="switch"><input type="checkbox" checked={checked} onChange={onChange} /><span className="slider" /></label>
  )

  const SectionCard = ({ id, children }: { id: SectionId; children: React.ReactNode }) => {
    const item = navItems.find(n => n.id === id)!
    const Icon = Icons[item.icon]
    const isCollapsed = collapsedSections.has(id)
    return (
      <div ref={el => sectionRefs.current[id] = el} className={`settings-section ${isCollapsed ? 'collapsed' : ''}`} id={id}>
        <div className="section-header" onClick={() => toggleSection(id)}>
          <div className="section-icon-wrapper" style={{ background: `${item.color}15`, color: item.color }}><Icon /></div>
          <div className="section-title-wrapper">
            <h2 className="section-title">{item.label}</h2>
            <p className="section-description">{item.description}</p>
          </div>
          <div className="section-collapse-icon"><Icons.ChevronDown /></div>
        </div>
        {!isCollapsed && <div className="settings-section-content">{children}</div>}
      </div>
    )
  }

  return (
    <div className="admin-settings">
      {/* Mobile backdrop */}
      <div className={`mobile-menu-backdrop ${mobileMenuOpen ? 'visible' : ''}`} onClick={() => setMobileMenuOpen(false)} />

      {/* Sidebar */}
      <aside className={`settings-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="settings-sidebar-header">
          <h1 className="settings-sidebar-title"><Icons.Settings /> Paramètres</h1>
          <p className="settings-sidebar-subtitle">Configuration système</p>
        </div>
        {navItems.map(item => {
          const Icon = Icons[item.icon]
          return (
            <button key={item.id} className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`} onClick={() => scrollToSection(item.id)}>
              <span className="settings-nav-icon"><Icon /></span>
              {item.label}
            </button>
          )
        })}
      </aside>

      {/* Main content */}
      <main className="settings-main">
        <div className="settings-header">
          <div className="settings-header-top">
            <div>
              <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} style={{ display: 'none' }}><Icons.Menu /> Menu</button>
              <h1 className="settings-title">Paramètres Globaux</h1>
              <p className="settings-subtitle">Gérez les configurations et accès de l'application</p>
            </div>
            <div className="settings-search-wrapper">
              <Icons.Search />
              <input type="text" className="settings-search" placeholder="Rechercher un paramètre..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 44 }} />
            </div>
          </div>
        </div>

        <div className="settings-grid">
          {/* Sandbox */}
          <SectionCard id="sandbox">
            <div className="setting-item">
              <div className="setting-info">
                <h3>🧪 Ouvrir Simulation Lab</h3>
                <p>Environnement isolé pour tester les fonctionnalités sans affecter les données réelles.</p>
              </div>
              <button className="settings-btn primary" onClick={openSimulationLab}>Ouvrir dans un nouvel onglet</button>
            </div>
          </SectionCard>

          {/* System Status */}
          <SectionCard id="status">
            <div className="status-cards">
              {[
                { label: 'Frontend', value: 'En ligne', active: true, color: '#00b894' },
                { label: 'Backend', value: systemStatus?.backend === 'online' ? 'En ligne' : 'Hors ligne', active: systemStatus?.backend === 'online', color: '#3498db' },
                { label: 'Base de données', value: systemStatus?.database === 'connected' ? 'Connectée' : 'Déconnectée', active: systemStatus?.database === 'connected', color: '#9b59b6' }
              ].map((s, i) => (
                <div key={i} className="status-card">
                  <div className="status-card-icon" style={{ background: `${s.color}15`, color: s.color }}><Icons.Activity /></div>
                  <div className="status-card-info">
                    <h4>{s.label}</h4>
                    <div className="status-card-value"><span className={`status-dot ${s.active ? 'active' : 'inactive'}`} />{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Monitoring */}
          <SectionCard id="monitoring">
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔍 État de Surveillance</h3>
                <p>Consulter le bilan des fonctionnalités de monitoring et de sécurité.</p>
              </div>
              <button className="settings-btn" style={{ background: '#ff7675', color: 'white' }} onClick={() => navigate('/admin/monitoring')}>Ouvrir les Diagnostics</button>
            </div>
          </SectionCard>

          {/* School Year */}
          <SectionCard id="year">
            <div className="setting-item">
              <div className="setting-info">
                <h3>📅 Année active pour cette session</h3>
                <p>Changez l'année visible uniquement pour vous (n'affecte pas les autres utilisateurs)</p>
              </div>
              <select className="settings-select" value={activeYearId} onChange={e => setActiveYearId(e.target.value)}>
                {years.map(y => <option key={y._id} value={y._id}>{y.name} {y.active ? '(Active par défaut)' : ''}</option>)}
              </select>
            </div>
          </SectionCard>

          {/* Access */}
          <SectionCard id="access">
            {[
              { label: 'Connexion Enseignants', desc: 'Autoriser les enseignants à accéder à leur espace', value: teacherLogin, key: 'login_enabled_teacher', setter: setTeacherLogin },
              { label: 'Connexion Préfets', desc: 'Autoriser les préfets à accéder au panneau de gestion', value: subAdminLogin, key: 'login_enabled_subadmin', setter: setSubAdminLogin },
              { label: 'Connexion Microsoft', desc: 'Afficher le bouton de connexion Microsoft', value: microsoftLogin, key: 'login_enabled_microsoft', setter: setMicrosoftLogin }
            ].map((s, i) => (
              <div key={i} className="setting-item">
                <div className="setting-info"><h3>{s.label}</h3><p>{s.desc}</p></div>
                <div className="setting-actions">
                  <StatusIndicator active={s.value} />
                  <Toggle checked={s.value} onChange={() => toggleSetting(s.key, s.value, s.setter)} />
                </div>
              </div>
            ))}
          </SectionCard>

          {/* Teacher Options */}
          <SectionCard id="teacher">
            <div className="setting-item">
              <div className="setting-info">
                <h3>⚡ Notation rapide</h3>
                <p>Afficher l'option "Notation rapide" en plus de la vue normale pour les enseignants.</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={teacherQuickGrading} activeText="Les deux vues" inactiveText="Vue normale uniquement" />
                <Toggle checked={teacherQuickGrading} onChange={() => toggleSetting('teacher_quick_grading_enabled', teacherQuickGrading, setTeacherQuickGrading)} />
              </div>
            </div>
          </SectionCard>

          {/* SMTP */}
          <SectionCard id="smtp">
            <div className="settings-form-row">
              <div className="settings-form-group">
                <label>Serveur SMTP</label>
                <input type="text" className="settings-input" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
              </div>
              <div className="settings-form-group">
                <label>Port</label>
                <input type="text" className="settings-input" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" />
              </div>
            </div>
            <div className="settings-form-row">
              <div className="settings-form-group">
                <label>Email / Utilisateur</label>
                <input type="email" className="settings-input" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="votre@email.com" />
              </div>
              <div className="settings-form-group">
                <label>Mot de passe</label>
                <input type="password" className="settings-input" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            <div className="setting-item" style={{ marginTop: '1rem' }}>
              <div className="setting-info">
                <h3>🔒 Connexion sécurisée (SSL/TLS)</h3>
                <p>Activer pour le port 465, désactiver pour le port 587 avec STARTTLS</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={smtpSecure} activeText="SSL/TLS" inactiveText="STARTTLS" />
                <Toggle checked={smtpSecure} onChange={() => setSmtpSecure(!smtpSecure)} />
              </div>
            </div>
            <div className="settings-btn-group" style={{ marginTop: '1rem' }}>
              <button className="settings-btn primary" onClick={saveSmtpSettings}>💾 Sauvegarder</button>
              <button className="settings-btn secondary" onClick={() => testSmtpConnection(false)} disabled={smtpTesting || !smtpHost || !smtpUser || !smtpPass}>
                {smtpTesting ? '⏳ Test...' : '🔌 Tester la connexion'}
              </button>
            </div>
            <div className="email-test-section">
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#475569' }}>Envoyer un email de test</label>
              <div className="email-test-row">
                <input type="email" className="settings-input" value={smtpTestEmail} onChange={e => setSmtpTestEmail(e.target.value)} placeholder="destinataire@email.com" />
                <button className="settings-btn success" onClick={() => testSmtpConnection(true)} disabled={smtpTesting || !smtpHost || !smtpUser || !smtpPass || !smtpTestEmail}>
                  {smtpTesting ? '⏳' : '📧'} Envoyer
                </button>
              </div>
            </div>
            {smtpTestResult && (
              <div className={`test-result ${smtpTestResult.success ? 'success' : 'error'}`}>
                {smtpTestResult.success ? '✅' : '❌'} {smtpTestResult.message}
              </div>
            )}
          </SectionCard>

          {/* Signature Restrictions */}
          <SectionCard id="signature">
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔐 Activer les restrictions</h3>
                <p>Si désactivé, les sous-admins peuvent signer n'importe quel carnet sans contrainte.</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={subAdminRestriction} />
                <Toggle checked={subAdminRestriction} onChange={() => toggleSetting('subadmin_restriction_enabled', subAdminRestriction, setSubAdminRestriction)} />
              </div>
            </div>
            {subAdminRestriction && (
              <div className="conditional-settings">
                {[
                  { label: 'Exempter 1ère Signature (Standard)', desc: 'Autoriser la signature standard même si le carnet n\'est pas terminé.', value: subAdminExemptStandard, key: 'subadmin_restriction_exempt_standard', setter: setSubAdminExemptStandard },
                  { label: 'Exempter Fin d\'Année / Promotion', desc: 'Autoriser la signature de fin d\'année et la promotion sans contraintes strictes.', value: subAdminExemptFinal, key: 'subadmin_restriction_exempt_final', setter: setSubAdminExemptFinal }
                ].map((s, i) => (
                  <div key={i} className="setting-item conditional-item warning">
                    <div className="setting-info"><h3>{s.label}</h3><p>{s.desc}</p></div>
                    <div className="setting-actions">
                      <StatusIndicator active={s.value} activeText="Exempté" inactiveText="Restreint" />
                      <Toggle checked={s.value} onChange={() => toggleSetting(s.key, s.value, s.setter)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Database */}
          <SectionCard id="database">
            <div className="setting-item">
              <div className="setting-info">
                <h3>💾 Créer une sauvegarde</h3>
                <p>Sauvegarder l'état actuel de la base de données sur le serveur.</p>
              </div>
              <button className="settings-btn primary" onClick={createBackup} disabled={backupLoading}>{backupLoading ? 'Création...' : '💾 Créer Sauvegarde'}</button>
            </div>
            {backups.length > 0 && (
              <div className="backup-table-wrapper">
                <table className="backup-table">
                  <thead><tr><th>Nom / Date</th><th style={{ textAlign: 'right' }}>Taille</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.name}>
                        <td><div className="backup-name">{new Date(b.date).toLocaleString()}</div><div className="backup-filename">{b.name}</div></td>
                        <td className="backup-size">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                        <td>
                          <div className="backup-actions">
                            <button className="settings-btn secondary" onClick={() => restoreBackup(b.name)} disabled={backupLoading}>Restaurer</button>
                            <button className="settings-btn danger" onClick={() => deleteBackup(b.name)} disabled={backupLoading}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="danger-zone">
              <div className="danger-zone-header"><Icons.AlertTriangle /><h3>Zone de Danger</h3></div>
              <div className="setting-item" style={{ background: '#fef2f2' }}>
                <div className="setting-info"><h3 style={{ color: '#ef4444' }}>Vider la base de données</h3><p>Action irréversible. Supprime toutes les données sauf admin et niveaux par défaut.</p></div>
                <button className="settings-btn danger" onClick={emptyDb} disabled={backupLoading} style={{ background: emptyClickCount > 0 ? '#b91c1c' : undefined }}>
                  {emptyClickCount > 0 ? (emptyClickCount === 4 ? '⚠️ DERNIÈRE CHANCE !' : `⚠️ Confirmer (${emptyClickCount}/5)`) : '⚠️ Vider la BDD'}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Maintenance */}
          <SectionCard id="maintenance">
            <div className="setting-item">
              <div className="setting-info"><h3>⬇️ Sauvegarde complète</h3><p>Télécharger une archive ZIP contenant tout le code source et la base de données</p></div>
              <button className="settings-btn secondary" onClick={downloadBackup} disabled={backupLoading}>{backupLoading ? 'Création...' : '⬇️ Télécharger Backup Complet'}</button>
            </div>
            <div className="setting-item">
              <div className="setting-info"><h3>🔄 Redémarrer le serveur</h3><p>Redémarrer le backend pour appliquer les nouvelles fonctionnalités</p></div>
              <button className="settings-btn danger" onClick={async () => { if (!confirm('Redémarrer le serveur ?')) return; try { await api.post('/settings/restart'); showMsg('Redémarrage en cours...') } catch { showMsg('Erreur', 'error') } }}>🔄 Redémarrer</button>
            </div>
            <div className="auto-backup-card">
              <div className="auto-backup-header">
                <div className="setting-info">
                  <h3><Icons.Save /> Sauvegarde Automatique</h3>
                  <p style={{ marginTop: 4 }}>Sauvegarder automatiquement dans un dossier local (nécessite que l'onglet reste ouvert)</p>
                </div>
                <div className="setting-actions">
                  <StatusIndicator active={autoBackupEnabled} />
                  <Toggle checked={autoBackupEnabled} onChange={() => { if (!autoBackupEnabled && !dirHandle) { alert("Choisissez d'abord un dossier."); return }; setAutoBackupEnabled(!autoBackupEnabled) }} />
                </div>
              </div>
              <div className="auto-backup-grid">
                <div className="settings-form-group">
                  <label>Fréquence</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min="1" className="settings-input" value={backupInterval} onChange={e => setBackupInterval(parseInt(e.target.value) || 60)} disabled={autoBackupEnabled} style={{ width: 80 }} />
                    <span style={{ color: '#64748b' }}>minutes</span>
                  </div>
                </div>
                <div className="settings-form-group">
                  <label>Destination</label>
                  <button className="settings-btn secondary" onClick={pickFolder} style={{ background: dirHandle ? '#e0f2fe' : 'white', borderColor: dirHandle ? '#7dd3fc' : '#e2e8f0', color: dirHandle ? '#0284c7' : '#475569' }}>
                    <Icons.Folder /> {dirHandle ? 'Dossier sélectionné' : 'Choisir le dossier'}
                  </button>
                </div>
              </div>
              {nextBackupTime && autoBackupEnabled && (
                <div className="next-backup-indicator"><Icons.Clock /> Prochaine sauvegarde à <strong>{nextBackupTime.toLocaleTimeString()}</strong></div>
              )}
            </div>
          </SectionCard>

          {/* Notification Test */}
          <SectionCard id="notiftest">
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔔 Tester la Notification de Session</h3>
                <p>Simulez la notification d'expiration de session qui apparaît 5 minutes avant la fin. Cela vous permet de voir l'apparence et de tester le bouton "+30 min".</p>
              </div>
              <button
                className="settings-btn primary"
                onClick={() => {
                  setTestToast({
                    message: 'Votre session expirera dans 5 minutes.',
                    type: 'info',
                    actionLabel: 'Prolonger +30 min',
                    onAction: () => {
                      setTestExtending(true)
                      setTimeout(() => {
                        setTestToast({
                          message: 'Session prolongée de 30 minutes ! (Simulation)',
                          type: 'success'
                        })
                        setTestExtending(false)
                        setTimeout(() => setTestToast(null), 4000)
                      }, 1000)
                    }
                  })
                }}
              >
                🔔 Afficher la Notification Test
              </button>
            </div>
            <div className="setting-item" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>
              <div className="setting-info">
                <h3 style={{ color: '#b45309' }}>ℹ️ À propos de cette notification</h3>
                <p style={{ color: '#92400e' }}>
                  La notification apparaît maintenant en <strong>haut à droite</strong> de l'écran et est plus grande et visible.
                  Elle s'affiche automatiquement 5 minutes avant l'expiration de votre session réelle.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </main>

      {/* Toast */}
      {msg && (
        <div className={`toast-message ${msgType === 'error' ? 'error' : ''}`}>
          {msgType === 'success' ? <Icons.Check /> : <Icons.AlertTriangle />}
          <span>{msg}</span>
        </div>
      )}

      {/* Test Toast for Session Notification */}
      {testToast && (
        <Toast
          message={testToast.message}
          type={testToast.type}
          duration={59000}
          onClose={() => setTestToast(null)}
          actionLabel={testToast.actionLabel}
          onAction={testToast.onAction}
          actionDisabled={testExtending}
        />
      )}
    </div>
  )
}
