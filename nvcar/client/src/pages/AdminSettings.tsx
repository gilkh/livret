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
  Monitor: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
}

type SectionId = 'status' | 'monitoring' | 'errors' | 'year' | 'access' | 'device' | 'teacher' | 'smtp' | 'signature' | 'database' | 'maintenance' | 'sandbox' | 'notiftest'

const StatusIndicator = ({ active, activeText = 'Activé', inactiveText = 'Désactivé' }: { active: boolean; activeText?: string; inactiveText?: string }) => (
  <div className="status-indicator">
    <span className={`status-dot ${active ? 'active' : 'inactive'}`} />
    <span style={{ color: active ? 'var(--success)' : '#f87171' }}>{active ? activeText : inactiveText}</span>
  </div>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <label className="switch"><input type="checkbox" checked={checked} onChange={onChange} /><span className="slider" /></label>
)

const SectionCard = ({ id, children, collapsedSections, toggleSection, sectionRefs }: {
  id: SectionId;
  children: React.ReactNode;
  collapsedSections: Set<SectionId>;
  toggleSection: (id: SectionId) => void;
  sectionRefs: React.MutableRefObject<Record<SectionId, HTMLDivElement | null>>;
}) => {
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

interface NavItem {
  id: SectionId
  label: string
  icon: keyof typeof Icons
  color: string
  description: string
}

interface ErrorLogEntry {
  _id: string
  userId: string
  role: string
  displayName?: string
  email?: string
  source?: string
  message: string
  method?: string
  url?: string
  status?: number
  resolved?: boolean
  createdAt?: string
  resolvedAt?: string
}

const navItems: NavItem[] = [
  { id: 'sandbox', label: 'Simulation Lab', icon: 'Grid', color: '#00b894', description: 'Environnement de test' },
  { id: 'status', label: 'État du Système', icon: 'Activity', color: '#00b894', description: 'Statut des services' },
  { id: 'monitoring', label: 'Diagnostics', icon: 'Box', color: '#ff7675', description: 'Surveillance & logs' },
  { id: 'errors', label: 'Erreurs Utilisateurs', icon: 'AlertTriangle', color: '#ef4444', description: 'Suivi des erreurs' },
  { id: 'year', label: 'Année Scolaire', icon: 'Calendar', color: '#6c5ce7', description: 'Session admin' },
  { id: 'access', label: 'Accès & Sécurité', icon: 'Lock', color: '#6c5ce7', description: 'Connexions utilisateurs' },
  { id: 'device', label: 'Appareils', icon: 'Monitor', color: '#e17055', description: 'Restrictions écran' },
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

  // Mobile/Device blocking
  const [mobileBlockEnabled, setMobileBlockEnabled] = useState(false)
  const [mobileMinWidth, setMobileMinWidth] = useState(1024)
  const [mobileAccessLogs, setMobileAccessLogs] = useState<any[]>([])
  const [mobileLogsLoading, setMobileLogsLoading] = useState(false)

  // Error logs
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([])
  const [errorLogsLoading, setErrorLogsLoading] = useState(false)
  const [errorLogFilter, setErrorLogFilter] = useState<'open' | 'resolved' | 'all'>('open')

  // Previous year dropdown editability per level
  const [dropdownEditablePS, setDropdownEditablePS] = useState(false)
  const [dropdownEditableMS, setDropdownEditableMS] = useState(false)
  const [dropdownEditableGS, setDropdownEditableGS] = useState(false)

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
  useEffect(() => { loadSettings(); checkStatus(); loadBackups(); loadMobileAccessLogs() }, [])
  useEffect(() => { loadErrorLogs(errorLogFilter) }, [errorLogFilter])
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
      // Mobile blocking
      setMobileBlockEnabled(res.data.mobile_block_enabled === true)
      setMobileMinWidth(res.data.mobile_min_width || 1024)
      // Previous year dropdown editability
      setDropdownEditablePS(res.data.previous_year_dropdown_editable_PS === true)
      setDropdownEditableMS(res.data.previous_year_dropdown_editable_MS === true)
      setDropdownEditableGS(res.data.previous_year_dropdown_editable_GS === true)
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

  // Mobile access logs functions
  const loadMobileAccessLogs = async () => {
    setMobileLogsLoading(true)
    try {
      const res = await api.get('/settings/mobile-access-logs?limit=50')
      setMobileAccessLogs(res.data)
    } catch (err) {
      console.error('Failed to load mobile access logs:', err)
      showMsg('Erreur lors du chargement des journaux', 'error')
    } finally {
      setMobileLogsLoading(false)
    }
  }

  const clearMobileAccessLogs = async () => {
    if (!confirm('Voulez-vous vraiment supprimer tous les journaux d\'accès mobile ?')) return
    try {
      await api.delete('/settings/mobile-access-logs')
      setMobileAccessLogs([])
      showMsg('Journaux supprimés')
    } catch (err) {
      console.error('Failed to clear mobile access logs:', err)
      showMsg('Erreur lors de la suppression', 'error')
    }
  }

  // Error logs functions
  const loadErrorLogs = async (status: 'open' | 'resolved' | 'all') => {
    setErrorLogsLoading(true)
    try {
      const res = await api.get(`/error-logs?status=${status}&limit=200`)
      setErrorLogs(res.data.logs || [])
    } catch (err) {
      console.error('Failed to load error logs:', err)
      showMsg('Erreur lors du chargement des erreurs', 'error')
    } finally {
      setErrorLogsLoading(false)
    }
  }

  const resolveErrorLog = async (id: string) => {
    try {
      await api.patch(`/error-logs/${id}/resolve`)
      setErrorLogs(prev => {
        if (errorLogFilter === 'open') return prev.filter(l => l._id !== id)
        return prev.map(l => l._id === id ? { ...l, resolved: true, resolvedAt: new Date().toISOString() } : l)
      })
      showMsg('Erreur marquée comme résolue')
    } catch (err) {
      console.error('Failed to resolve error log:', err)
      showMsg('Erreur lors de la mise à jour', 'error')
    }
  }

  const resolveAllErrorLogs = async () => {
    if (!confirm('Marquer toutes les erreurs comme résolues ?')) return
    try {
      await api.patch('/error-logs/resolve-all')
      setErrorLogs(prev => {
        if (errorLogFilter === 'open') return []
        return prev.map(l => ({ ...l, resolved: true, resolvedAt: new Date().toISOString() }))
      })
      showMsg('Toutes les erreurs sont résolues')
    } catch (err) {
      console.error('Failed to resolve all error logs:', err)
      showMsg('Erreur lors de la mise à jour', 'error')
    }
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

  const emptyDb = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (emptyClickCount < 4) { setEmptyClickCount(c => c + 1); return }
    const code = prompt('Tapez "CONFIRMER" pour vider la BDD.')
    if (code !== 'CONFIRMER') { setEmptyClickCount(0); return }
    setBackupLoading(true)
    try {
      await api.post('/backup/empty')
      showMsg('BDD vidée - Déconnexion...')
      // Clear auth tokens and redirect to login
      setTimeout(() => {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('role')
        sessionStorage.removeItem('displayName')
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        localStorage.removeItem('displayName')
        navigate('/login')
      }, 1500)
    }
    catch { showMsg('Erreur', 'error'); setBackupLoading(false); setEmptyClickCount(0) }
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

  const sectionCardProps = { collapsedSections, toggleSection, sectionRefs }

  return (
    <div className="admin-settings">
      {/* Mobile backdrop */}
      <div className={`mobile-menu-backdrop ${mobileMenuOpen ? 'visible' : ''}`} onClick={() => setMobileMenuOpen(false)} />

      {/* Sidebar */}
      <aside className={`settings-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="settings-sidebar-header">
          <h1 className="settings-sidebar-title"><Icons.Settings /> Paramètres</h1>
        </div>
        {navItems.map(item => {
          const Icon = Icons[item.icon]
          return (
            <button type="button" key={item.id} className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`} onClick={() => scrollToSection(item.id)}>
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
              <button type="button" className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} style={{ display: 'none' }}><Icons.Menu /> Menu</button>
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
          <SectionCard id="sandbox" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🧪 Ouvrir Simulation Lab</h3>
                <p>Environnement isolé pour tester les fonctionnalités sans affecter les données réelles.</p>
              </div>
              <button type="button" className="settings-btn primary" onClick={openSimulationLab}>Ouvrir dans un nouvel onglet</button>
            </div>
          </SectionCard>

          {/* System Status */}
          <SectionCard id="status" {...sectionCardProps}>
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
          <SectionCard id="monitoring" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔍 État de Surveillance</h3>
                <p>Consulter le bilan des fonctionnalités de monitoring et de sécurité.</p>
              </div>
              <button type="button" className="settings-btn" style={{ background: '#ff7675', color: 'white' }} onClick={() => navigate('/admin/monitoring')}>Ouvrir les Diagnostics</button>
            </div>
          </SectionCard>

          {/* Error Logs */}
          <SectionCard id="errors" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🧯 Erreurs utilisateurs ({errorLogs.filter(l => !l.resolved).length})</h3>
                <p>Liste des erreurs rencontrées par les utilisateurs (enseignants, préfets, AEFE, admin).</p>
              </div>
              <div className="settings-btn-group">
                <select className="settings-select" value={errorLogFilter} onChange={e => setErrorLogFilter(e.target.value as any)}>
                  <option value="open">Non résolues</option>
                  <option value="resolved">Résolues</option>
                  <option value="all">Toutes</option>
                </select>
                <button type="button" className="settings-btn secondary" onClick={() => loadErrorLogs(errorLogFilter)} disabled={errorLogsLoading}>
                  {errorLogsLoading ? '⏳' : '🔄'} Rafraîchir
                </button>
                {errorLogs.some(l => !l.resolved) && (
                  <button type="button" className="settings-btn danger" onClick={resolveAllErrorLogs}>
                    ✅ Tout résoudre
                  </button>
                )}
              </div>
            </div>

            {errorLogsLoading && errorLogs.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                ⏳ Chargement des erreurs...
              </div>
            )}

            {!errorLogsLoading && errorLogs.length === 0 && (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: 12,
                marginTop: '1rem'
              }}>
                ✅ Aucune erreur enregistrée
              </div>
            )}

            {errorLogs.length > 0 && (
              <div className="backup-table-wrapper" style={{ marginTop: '1rem' }}>
                <table className="backup-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Utilisateur</th>
                      <th>Rôle</th>
                      <th>Endpoint</th>
                      <th>Message</th>
                      <th>Statut</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map(log => (
                      <tr key={log._id}>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {log.createdAt ? new Date(log.createdAt).toLocaleDateString('fr-FR') : '-'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {log.createdAt ? new Date(log.createdAt).toLocaleTimeString('fr-FR') : ''}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{log.displayName || 'Utilisateur'}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{log.email || log.userId}</div>
                        </td>
                        <td>
                          <span className={`error-log-badge ${log.role?.toLowerCase() || 'role'}`}>
                            {log.role || '-'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{log.method || 'GET'}</div>
                          <div style={{ color: '#64748b' }}>{log.url || '-'}</div>
                        </td>
                        <td style={{ fontSize: 12, color: '#0f172a' }}>
                          {log.message || '-'}
                          {log.status ? <div style={{ color: '#64748b' }}>HTTP {log.status}</div> : null}
                        </td>
                        <td>
                          <span className={`error-log-status ${log.resolved ? 'resolved' : 'open'}`}>
                            {log.resolved ? 'Résolue' : 'Ouverte'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!log.resolved && (
                            <button type="button" className="settings-btn success" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => resolveErrorLog(log._id)}>
                              ✅ Résoudre
                            </button>
                          )}
                          {log.resolved && (
                            <span style={{ fontSize: 12, color: '#64748b' }}>✔</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* School Year */}
          <SectionCard id="year" {...sectionCardProps}>
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
          <SectionCard id="access" {...sectionCardProps}>
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

          {/* Device / Mobile Blocking */}
          <SectionCard id="device" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>📱 Bloquer les appareils mobiles</h3>
                <p>Empêcher l'accès à l'application depuis les téléphones et tablettes. Un message invite à utiliser un ordinateur.</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={mobileBlockEnabled} activeText="Bloqué" inactiveText="Autorisé" />
                <Toggle checked={mobileBlockEnabled} onChange={() => toggleSetting('mobile_block_enabled', mobileBlockEnabled, setMobileBlockEnabled)} />
              </div>
            </div>
            {mobileBlockEnabled && (
              <div className="conditional-settings">
                <div className="setting-item conditional-item">
                  <div className="setting-info">
                    <h3>📏 Largeur d'écran minimale</h3>
                    <p>Les appareils avec une largeur inférieure à cette valeur seront bloqués. Recommandé : 1024px (ancien laptops compatibles) ou 1280px (tablettes bloquées).</p>
                  </div>
                  <div className="settings-form-group" style={{ marginLeft: 'auto', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="768"
                        max="1920"
                        className="settings-input"
                        value={mobileMinWidth}
                        onChange={e => setMobileMinWidth(parseInt(e.target.value) || 1024)}
                        style={{ width: 80, textAlign: 'center' }}
                      />
                      <span style={{ color: '#64748b' }}>px</span>
                      <button
                        type="button"
                        className="settings-btn primary"
                        onClick={() => saveSetting('mobile_min_width', mobileMinWidth)}
                        style={{ padding: '8px 12px', fontSize: 13 }}
                      >
                        💾
                      </button>
                    </div>
                  </div>
                </div>
                <div className="setting-item" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>
                  <div className="setting-info">
                    <h3 style={{ color: '#b45309' }}>ℹ️ Valeurs recommandées</h3>
                    <p style={{ color: '#92400e' }}>
                      <strong>1024px</strong> : Supporte les anciens laptops, bloque la plupart des tablettes<br />
                      <strong>1280px</strong> : Bloque presque toutes les tablettes<br />
                      <strong>1366px</strong> : Bloque toutes les tablettes (peut bloquer les très petits laptops)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Access Logs */}
            <div className="setting-item" style={{ marginTop: '1.5rem' }}>
              <div className="setting-info">
                <h3>📋 Journaux d'accès mobile ({mobileAccessLogs.length})</h3>
                <p>Historique des tentatives d'accès depuis des appareils bloqués (IP, appareil, heure).</p>
              </div>
              <div className="settings-btn-group">
                <button type="button" className="settings-btn secondary" onClick={loadMobileAccessLogs} disabled={mobileLogsLoading}>
                  {mobileLogsLoading ? '⏳' : '🔄'} Rafraîchir
                </button>
                {mobileAccessLogs.length > 0 && (
                  <button type="button" className="settings-btn danger" onClick={clearMobileAccessLogs}>
                    🗑️ Vider
                  </button>
                )}
              </div>
            </div>

            {mobileLogsLoading && mobileAccessLogs.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                ⏳ Chargement des journaux...
              </div>
            )}

            {!mobileLogsLoading && mobileAccessLogs.length === 0 && (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: 12,
                marginTop: '1rem'
              }}>
                ✅ Aucune tentative d'accès mobile enregistrée
              </div>
            )}

            {mobileAccessLogs.length > 0 && (
              <div className="backup-table-wrapper" style={{ marginTop: '1rem' }}>
                <table className="backup-table">
                  <thead>
                    <tr>
                      <th>Date/Heure</th>
                      <th>Adresse IP</th>
                      <th>Appareil</th>
                      <th>Écran</th>
                      <th>Navigateur</th>
                      <th>OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mobileAccessLogs.map((log, i) => (
                      <tr key={log._id || i}>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {new Date(log.timestamp).toLocaleDateString('fr-FR')}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {new Date(log.timestamp).toLocaleTimeString('fr-FR')}
                          </div>
                        </td>
                        <td>
                          <code style={{
                            background: '#f1f5f9',
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontFamily: 'monospace'
                          }}>
                            {log.ipAddress}
                          </code>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 500,
                            background: log.deviceType === 'phone' ? '#fef2f2' : log.deviceType === 'tablet' ? '#fef3c7' : '#f0fdf4',
                            color: log.deviceType === 'phone' ? '#dc2626' : log.deviceType === 'tablet' ? '#d97706' : '#16a34a'
                          }}>
                            {log.deviceType === 'phone' ? '📱' : log.deviceType === 'tablet' ? '📱' : '💻'}
                            {log.deviceType === 'phone' ? 'Téléphone' : log.deviceType === 'tablet' ? 'Tablette' : log.deviceType}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {log.screenWidth}×{log.screenHeight}
                        </td>
                        <td style={{ fontSize: 12 }}>{log.browser || '-'}</td>
                        <td style={{ fontSize: 12 }}>{log.os || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  fontSize: 12,
                  color: '#64748b',
                  textAlign: 'center'
                }}>
                  Affichage des {mobileAccessLogs.length} dernières tentatives
                </div>
              </div>
            )}
          </SectionCard>

          {/* Previous Year Dropdown Editability */}
          <SectionCard id="teacher" {...sectionCardProps}>
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
            <div className="setting-item" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <div className="setting-info">
                <h3>🔓 Dropdowns PS - Année Précédente</h3>
                <p>Permettre la modification des menus déroulants pour les données PS des années précédentes</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={dropdownEditablePS} />
                <Toggle checked={dropdownEditablePS} onChange={() => toggleSetting('previous_year_dropdown_editable_PS', dropdownEditablePS, setDropdownEditablePS)} />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔓 Dropdowns MS - Année Précédente</h3>
                <p>Permettre la modification des menus déroulants pour les données MS des années précédentes</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={dropdownEditableMS} />
                <Toggle checked={dropdownEditableMS} onChange={() => toggleSetting('previous_year_dropdown_editable_MS', dropdownEditableMS, setDropdownEditableMS)} />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔓 Dropdowns GS - Année Précédente</h3>
                <p>Permettre la modification des menus déroulants pour les données GS des années précédentes</p>
              </div>
              <div className="setting-actions">
                <StatusIndicator active={dropdownEditableGS} />
                <Toggle checked={dropdownEditableGS} onChange={() => toggleSetting('previous_year_dropdown_editable_GS', dropdownEditableGS, setDropdownEditableGS)} />
              </div>
            </div>
          </SectionCard>

          {/* SMTP */}
          <SectionCard id="smtp" {...sectionCardProps}>
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
              <button type="button" className="settings-btn primary" onClick={saveSmtpSettings}>💾 Sauvegarder</button>
              <button type="button" className="settings-btn secondary" onClick={() => testSmtpConnection(false)} disabled={smtpTesting || !smtpHost || !smtpUser || !smtpPass}>
                {smtpTesting ? '⏳ Test...' : '🔌 Tester la connexion'}
              </button>
            </div>
            <div className="email-test-section">
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#475569' }}>Envoyer un email de test</label>
              <div className="email-test-row">
                <input type="email" className="settings-input" value={smtpTestEmail} onChange={e => setSmtpTestEmail(e.target.value)} placeholder="destinataire@email.com" />
                <button type="button" className="settings-btn success" onClick={() => testSmtpConnection(true)} disabled={smtpTesting || !smtpHost || !smtpUser || !smtpPass || !smtpTestEmail}>
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
          <SectionCard id="signature" {...sectionCardProps}>
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
          <SectionCard id="database" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>💾 Créer une sauvegarde</h3>
                <p>Sauvegarder l'état actuel de la base de données sur le serveur.</p>
              </div>
              <button type="button" className="settings-btn primary" onClick={createBackup} disabled={backupLoading}>{backupLoading ? 'Création...' : '💾 Créer Sauvegarde'}</button>
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
                            <button type="button" className="settings-btn secondary" onClick={() => restoreBackup(b.name)} disabled={backupLoading}>Restaurer</button>
                            <button type="button" className="settings-btn danger" onClick={() => deleteBackup(b.name)} disabled={backupLoading}>🗑️</button>
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
                <button type="button" className="settings-btn danger" onClick={emptyDb} disabled={backupLoading} style={{ background: emptyClickCount > 0 ? '#b91c1c' : undefined }}>
                  {emptyClickCount > 0 ? (emptyClickCount === 4 ? '⚠️ DERNIÈRE CHANCE !' : `⚠️ Confirmer (${emptyClickCount}/5)`) : '⚠️ Vider la BDD'}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Maintenance */}
          <SectionCard id="maintenance" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info"><h3>⬇️ Sauvegarde complète</h3><p>Télécharger une archive ZIP contenant tout le code source et la base de données</p></div>
              <button type="button" className="settings-btn secondary" onClick={downloadBackup} disabled={backupLoading}>{backupLoading ? 'Création...' : '⬇️ Télécharger Backup Complet'}</button>
            </div>
            <div className="setting-item">
              <div className="setting-info"><h3>🔄 Redémarrer le serveur</h3><p>Redémarrer le backend pour appliquer les nouvelles fonctionnalités</p></div>
              <button type="button" className="settings-btn danger" onClick={async () => { if (!confirm('Redémarrer le serveur ?')) return; try { await api.post('/settings/restart'); showMsg('Redémarrage en cours...') } catch { showMsg('Erreur', 'error') } }}>🔄 Redémarrer</button>
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
                  <button type="button" className="settings-btn secondary" onClick={pickFolder} style={{ background: dirHandle ? '#e0f2fe' : 'white', borderColor: dirHandle ? '#7dd3fc' : '#e2e8f0', color: dirHandle ? '#0284c7' : '#475569' }}>
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
          <SectionCard id="notiftest" {...sectionCardProps}>
            <div className="setting-item">
              <div className="setting-info">
                <h3>🔔 Tester la Notification de Session</h3>
                <p>Simulez la notification d'expiration de session qui apparaît 5 minutes avant la fin. Cela vous permet de voir l'apparence et de tester le bouton "+30 min".</p>
              </div>
              <button
                type="button"
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
      </main >

      {/* Toast */}
      {
        msg && (
          <div className={`toast-message ${msgType === 'error' ? 'error' : ''}`}>
            {msgType === 'success' ? <Icons.Check /> : <Icons.AlertTriangle />}
            <span>{msg}</span>
          </div>
        )
      }

      {/* Test Toast for Session Notification */}
      {
        testToast && (
          <Toast
            message={testToast.message}
            type={testToast.type}
            duration={59000}
            onClose={() => setTestToast(null)}
            actionLabel={testToast.actionLabel}
            onAction={testToast.onAction}
            actionDisabled={testExtending}
          />
        )
      }
    </div >
  )
}
