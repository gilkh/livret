import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useSchoolYear } from '../context/SchoolYearContext'
import './AdminSettings.css'

export default function AdminSettings() {
  const navigate = useNavigate()
  const { years, activeYearId, setActiveYearId } = useSchoolYear()
  const [teacherLogin, setTeacherLogin] = useState(true)
  const [subAdminLogin, setSubAdminLogin] = useState(true)
  const [microsoftLogin, setMicrosoftLogin] = useState(true)
  const [subAdminRestriction, setSubAdminRestriction] = useState(true)
  const [subAdminExemptStandard, setSubAdminExemptStandard] = useState(false)
  const [subAdminExemptFinal, setSubAdminExemptFinal] = useState(false)
  const [assignmentKeysStr, setAssignmentKeysStr] = useState('')
  const [assignmentAutoInfer, setAssignmentAutoInfer] = useState(true)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const [backupInterval, setBackupInterval] = useState(60) // in minutes
  const [dirHandle, setDirHandle] = useState<any>(null)
  const [nextBackupTime, setNextBackupTime] = useState<Date | null>(null)
  const [systemStatus, setSystemStatus] = useState<{ backend: string; database: string; uptime: number } | null>(null)
  const [backups, setBackups] = useState<{ name: string, size: number, date: string }[]>([])
  const [emptyClickCount, setEmptyClickCount] = useState(0)

  const openSimulationLab = () => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token')
    const url = token ? `/simulation-lab?token=${encodeURIComponent(token)}` : '/simulation-lab'
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    loadBackups()
  }, [])

  

  const loadBackups = async () => {
    try {
      const res = await api.get('/backup/list')
      setBackups(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  const createBackup = async () => {
    setBackupLoading(true)
    try {
      await api.post('/backup/create')
      setMsg('Sauvegarde créée avec succès')
      await loadBackups()
    } catch (e) {
      console.error(e)
      setMsg('Erreur lors de la création de la sauvegarde')
    } finally {
      setBackupLoading(false)
    }
  }

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Voulez-vous vraiment restaurer la sauvegarde "${filename}" ?\nATTENTION : La base de données actuelle sera écrasée !`)) return

    setBackupLoading(true)
    try {
      await api.post(`/backup/restore/${filename}`)
      setMsg('Restauration effectuée avec succès')
      setTimeout(() => window.location.reload(), 2000)
    } catch (e) {
      console.error(e)
      setMsg('Erreur lors de la restauration')
    } finally {
      setBackupLoading(false)
    }
  }

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer la sauvegarde "${filename}" ?`)) return
    try {
      await api.delete(`/backup/${filename}`)
      setMsg('Sauvegarde supprimée')
      loadBackups()
    } catch (e) {
      console.error(e)
      setMsg('Erreur lors de la suppression')
    }
  }

  const emptyDb = async () => {
    if (emptyClickCount < 4) {
      setEmptyClickCount(prev => prev + 1)
      return
    }

    const code = prompt('Pour confirmer, tapez "CONFIRMER" en toutes lettres.\nATTENTION : Cela supprimera TOUTES les données (sauf admin et niveaux par défaut).')
    if (code !== 'CONFIRMER') {
      setEmptyClickCount(0)
      return
    }

    setBackupLoading(true)
    try {
      await api.post('/backup/empty')
      setMsg('Base de données vidée avec succès')
      setTimeout(() => window.location.reload(), 2000)
    } catch (e) {
      console.error(e)
      setMsg('Erreur lors du nettoyage de la BDD')
    } finally {
      setBackupLoading(false)
      setEmptyClickCount(0)
    }
  }

  useEffect(() => {
    let intervalId: any;

    if (autoBackupEnabled && dirHandle) {
      // Calculate next backup time
      const now = new Date();
      const next = new Date(now.getTime() + backupInterval * 60000);
      setNextBackupTime(next);

      intervalId = setInterval(async () => {
        await performAutoBackup();
      }, backupInterval * 60000);
    } else {
      setNextBackupTime(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoBackupEnabled, dirHandle, backupInterval]);

  const pickFolder = async () => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      setDirHandle(handle);
      setMsg('Dossier de sauvegarde sélectionné');
    } catch (err) {
      console.error(err);
      setMsg('Erreur lors de la sélection du dossier');
    }
  };

  const performAutoBackup = async () => {
    if (!dirHandle) return;

    try {
      // Don't set global loading to avoid blocking UI, maybe just a toast
      const res = await api.get('/backup/full', { responseType: 'blob' });
      const blob = new Blob([res.data]);

      const filename = `nvcar-auto-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

      // @ts-ignore
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      // @ts-ignore
      await writable.write(blob);
      // @ts-ignore
      await writable.close();

      setMsg(`Sauvegarde automatique effectuée : ${filename}`);

      // Update next backup time
      const now = new Date();
      setNextBackupTime(new Date(now.getTime() + backupInterval * 60000));

    } catch (err) {
      console.error('Auto backup failed', err);
      setMsg('Échec de la sauvegarde automatique');
    }
  };

  useEffect(() => {
    loadSettings()
    checkStatus()
  }, [])

  

  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => setMsg(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [msg])

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings')
      // If value is undefined, default to true for booleans
      setTeacherLogin(res.data.login_enabled_teacher !== false)
      setSubAdminLogin(res.data.login_enabled_subadmin !== false)
      setMicrosoftLogin(res.data.login_enabled_microsoft !== false)
      setSubAdminRestriction(res.data.subadmin_restriction_enabled !== false)
      setSubAdminExemptStandard(res.data.subadmin_restriction_exempt_standard === true)
      setSubAdminExemptFinal(res.data.subadmin_restriction_exempt_final === true)

      if (Array.isArray(res.data.assignment_long_term_keys)) {
        setAssignmentKeysStr(res.data.assignment_long_term_keys.join(', '))
      } else {
        setAssignmentKeysStr('longTermNotes, permanentNotes, medicalInfo, iep, edPlan, chronicNotes, comments, variables, personalHistory')
      }

      // Auto-infer toggle (defaults to true)
      setAssignmentAutoInfer(res.data.assignment_long_term_auto_infer !== false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    try {
      const res = await api.get('/settings/status')
      setSystemStatus(res.data)
    } catch (e) {
      setSystemStatus({ backend: 'offline', database: 'unknown', uptime: 0 })
    }
  }

  

  const saveSetting = async (key: string, value: any) => {
    try {
      await api.post('/settings', { key, value })
      setMsg('Paramètres mis à jour avec succès')
      return true
    } catch (err) {
      console.error(err)
      setMsg('Erreur lors de la mise à jour')
      return false
    }
  }

  const toggleTeacher = async () => {
    const newVal = !teacherLogin
    setTeacherLogin(newVal)
    if (!(await saveSetting('login_enabled_teacher', newVal))) setTeacherLogin(!newVal)
  }

  const toggleSubAdmin = async () => {
    const newVal = !subAdminLogin
    setSubAdminLogin(newVal)
    if (!(await saveSetting('login_enabled_subadmin', newVal))) setSubAdminLogin(!newVal)
  }

  const toggleMicrosoft = async () => {
    const newVal = !microsoftLogin
    setMicrosoftLogin(newVal)
    if (!(await saveSetting('login_enabled_microsoft', newVal))) setMicrosoftLogin(!newVal)
  }

  const toggleSubAdminRestriction = async () => {
    const newVal = !subAdminRestriction
    setSubAdminRestriction(newVal)
    if (!(await saveSetting('subadmin_restriction_enabled', newVal))) setSubAdminRestriction(!newVal)
  }

  const toggleSubAdminExemptStandard = async () => {
    const newVal = !subAdminExemptStandard
    setSubAdminExemptStandard(newVal)
    if (!(await saveSetting('subadmin_restriction_exempt_standard', newVal))) setSubAdminExemptStandard(!newVal)
  }

  const toggleSubAdminExemptFinal = async () => {
    const newVal = !subAdminExemptFinal
    setSubAdminExemptFinal(newVal)
    if (!(await saveSetting('subadmin_restriction_exempt_final', newVal))) setSubAdminExemptFinal(!newVal)
  }

  const downloadBackup = async () => {
    for (let i = 1; i <= 5; i++) {
      if (!confirm(`CONFIRMATION ${i}/5 : Voulez-vous vraiment télécharger une copie complète de l'application (Code + BDD) ? Cela peut prendre du temps.`)) {
        return
      }
    }

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

      setMsg('Sauvegarde téléchargée')
    } catch (e) {
      console.error(e)
      setMsg('Erreur lors de la sauvegarde')
    } finally {
      setBackupLoading(false)
    }
  }



  if (loading) return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Chargement...</h1>
      </div>
    </div>
  )

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Paramètres Globaux</h1>
        <p className="settings-subtitle">Gérez les configurations et les accès de l'application</p>
      </div>

      {msg && (
        <>
          <div className="toast-message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>{msg}</span>
          </div>
        </>
      )}

      <div className="settings-section">
        <div className="section-header">
          <div className="section-icon-wrapper" style={{ background: 'rgba(0, 184, 148, 0.1)', color: '#00b894' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <h2 className="section-title">Simulation Lab (Sandbox)</h2>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <h3>Ouvrir Simulation Lab</h3>
            <p>Ouvre un nouvel onglet isolé pour démarrer le serveur sandbox et lancer les simulations.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={openSimulationLab}>
              Ouvrir dans un nouvel onglet
            </button>
          </div>
        </div>
      </div>

      <div className="settings-grid">

        {/* System Status Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(0, 184, 148, 0.1)', color: '#00b894' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
            <h2 className="section-title">État du Système</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Frontend (Client)</h3>
              <p>Interface utilisateur</p>
            </div>
            <div className="status-indicator">
              <span className="dot active"></span>
              <span style={{ color: 'var(--success)' }}>En ligne</span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Backend (Serveur)</h3>
              <p>API et logique métier</p>
            </div>
            <div className="status-indicator">
              <span className={`dot ${systemStatus?.backend === 'online' ? 'active' : 'inactive'}`}></span>
              <span style={{ color: systemStatus?.backend === 'online' ? 'var(--success)' : '#ff7675' }}>
                {systemStatus?.backend === 'online' ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Base de données</h3>
              <p>MongoDB</p>
            </div>
            <div className="status-indicator">
              <span className={`dot ${systemStatus?.database === 'connected' ? 'active' : 'inactive'}`}></span>
              <span style={{ color: systemStatus?.database === 'connected' ? 'var(--success)' : '#ff7675' }}>
                {systemStatus?.database === 'connected' ? 'Connectée' : 'Déconnectée'}
              </span>
            </div>
          </div>
        </div>

        {/* Monitoring & Diagnostics Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(255, 118, 117, 0.1)', color: '#ff7675' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <h2 className="section-title">Surveillance & Diagnostics</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>État de Surveillance</h3>
              <p>Consulter le bilan des fonctionnalités de monitoring et de sécurité.</p>
            </div>
            <button
              className="btn"
              onClick={() => navigate('/admin/monitoring')}
              style={{ background: '#ff7675', fontWeight: 600 }}
            >
              🔍 Ouvrir les Diagnostics
            </button>
          </div>
        </div>

        {/* Session View Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(108, 92, 231, 0.1)', color: 'var(--primary)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <h2 className="section-title">Année Scolaire (Vue Admin)</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Année active pour cette session</h3>
              <p>Changez l'année visible uniquement pour vous (n'affecte pas les autres utilisateurs)</p>
            </div>
            <select
              value={activeYearId}
              onChange={(e) => setActiveYearId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                minWidth: '200px',
                backgroundColor: 'white'
              }}
            >
              {years.map(y => (
                <option key={y._id} value={y._id}>
                  {y.name} {y.active ? '(Active par défaut)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Access & Security Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h2 className="section-title">Accès et Sécurité</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Connexion Enseignants</h3>
              <p>Autoriser les enseignants à accéder à leur espace personnel</p>
            </div>
            <div className="flex items-center" style={{ gap: '1rem' }}>
              <div className="status-indicator">
                <span className={`dot ${teacherLogin ? 'active' : 'inactive'}`}></span>
                <span style={{ color: teacherLogin ? 'var(--success)' : '#ff7675' }}>
                  {teacherLogin ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={teacherLogin}
                  onChange={toggleTeacher}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Connexion Préfets</h3>
              <p>Autoriser les préfets à accéder au panneau de gestion</p>
            </div>
            <div className="flex items-center" style={{ gap: '1rem' }}>
              <div className="status-indicator">
                <span className={`dot ${subAdminLogin ? 'active' : 'inactive'}`}></span>
                <span style={{ color: subAdminLogin ? 'var(--success)' : '#ff7675' }}>
                  {subAdminLogin ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={subAdminLogin}
                  onChange={toggleSubAdmin}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Connexion Microsoft / Outlook</h3>
              <p>Afficher le bouton de connexion Microsoft sur la page d'accueil</p>
            </div>
            <div className="flex items-center" style={{ gap: '1rem' }}>
              <div className="status-indicator">
                <span className={`dot ${microsoftLogin ? 'active' : 'inactive'}`}></span>
                <span style={{ color: microsoftLogin ? 'var(--success)' : '#ff7675' }}>
                  {microsoftLogin ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={microsoftLogin}
                  onChange={toggleMicrosoft}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Signature Restrictions Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(255, 159, 67, 0.1)', color: '#ff9f43' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <h2 className="section-title">Restrictions de Signature (Sous-Admin)</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Activer les restrictions</h3>
              <p>Si désactivé, les sous-admins peuvent signer n'importe quel carnet sans contrainte.</p>
            </div>
            <div className="flex items-center" style={{ gap: '1rem' }}>
              <div className="status-indicator">
                <span className={`dot ${subAdminRestriction ? 'active' : 'inactive'}`}></span>
                <span style={{ color: subAdminRestriction ? 'var(--success)' : '#ff7675' }}>
                  {subAdminRestriction ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={subAdminRestriction}
                  onChange={toggleSubAdminRestriction}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {subAdminRestriction && (
            <>
              <div className="setting-item" style={{ borderLeft: '4px solid #ff9f43', paddingLeft: '1rem', background: '#fffaf0' }}>
                <div className="setting-info">
                  <h3>Exempter 1ère Signature (Standard)</h3>
                  <p>Autoriser la signature standard même si le carnet n'est pas terminé.</p>
                </div>
                <div className="flex items-center" style={{ gap: '1rem' }}>
                  <div className="status-indicator">
                    <span className={`dot ${subAdminExemptStandard ? 'active' : 'inactive'}`}></span>
                    <span style={{ color: subAdminExemptStandard ? 'var(--success)' : '#64748b' }}>
                      {subAdminExemptStandard ? 'Exempté' : 'Restreint'}
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={subAdminExemptStandard}
                      onChange={toggleSubAdminExemptStandard}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item" style={{ borderLeft: '4px solid #ff9f43', paddingLeft: '1rem', background: '#fffaf0' }}>
                <div className="setting-info">
                  <h3>Exempter Fin d'Année / Promotion</h3>
                  <p>Autoriser la signature de fin d'année et la promotion sans contraintes strictes.</p>
                </div>
                <div className="flex items-center" style={{ gap: '1rem' }}>
                  <div className="status-indicator">
                    <span className={`dot ${subAdminExemptFinal ? 'active' : 'inactive'}`}></span>
                    <span style={{ color: subAdminExemptFinal ? 'var(--success)' : '#64748b' }}>
                      {subAdminExemptFinal ? 'Exempté' : 'Restreint'}
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={subAdminExemptFinal}
                      onChange={toggleSubAdminExemptFinal}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {/* Assignment long-term keys */}
              <div className="setting-item" style={{ borderLeft: '4px solid #1b9af7', paddingLeft: '1rem', background: '#f0f8ff' }}>
                <div className="setting-info">
                  <h3>Clés persistantes (données de long terme)</h3>
                  <p>Liste (séparée par des virgules) des champs de <code>TemplateAssignment.data</code> qui doivent être copiés lors de la promotion/transition d'année.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <textarea value={assignmentKeysStr} onChange={(e) => setAssignmentKeysStr(e.target.value)} rows={3} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={async () => {
                      const arr = assignmentKeysStr.split(',').map(s => s.trim()).filter(Boolean)
                      if (!(await saveSetting('assignment_long_term_keys', arr))) setAssignmentKeysStr(arr.join(', '))
                    }}>Sauvegarder</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={assignmentAutoInfer} onChange={async () => {
                        const newVal = !assignmentAutoInfer
                        setAssignmentAutoInfer(newVal)
                        if (!(await saveSetting('assignment_long_term_auto_infer', newVal))) setAssignmentAutoInfer(!newVal)
                      }} />
                      <span style={{ fontSize: 14 }}>Activer la détection automatique des champs persistants (inférence)</span>
                    </label>
                    <div style={{ color: '#64748b', fontSize: 13 }}>
                      L'inférence inspecte les derniers carnets d'un élève pour suggérer des champs à copier lors de la promotion. (Unionne avec la liste ci-dessus si elle est renseignée.)
                    </div>
                  </div>                </div>
              </div>

            </>
          )}
        </div>

        {/* Database Management Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
            </div>
            <h2 className="section-title">Gestion de la Base de Données</h2>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Créer une sauvegarde</h3>
              <p>Sauvegarder l'état actuel de la base de données sur le serveur.</p>
            </div>
            <button
              className="btn primary"
              onClick={createBackup}
              disabled={backupLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {backupLoading ? 'Création...' : '💾 Créer Sauvegarde'}
            </button>
          </div>

          {backups.length > 0 && (
            <div style={{ marginTop: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#64748b' }}>Nom / Date</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>Taille</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 500 }}>{new Date(b.date).toLocaleString()}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{b.name}</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>
                        {(b.size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => restoreBackup(b.name)}
                            disabled={backupLoading}
                            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            Restaurer
                          </button>
                          <button
                            onClick={() => deleteBackup(b.name)}
                            disabled={backupLoading}
                            style={{ padding: '6px', borderRadius: '4px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="setting-item" style={{ marginTop: '2rem', borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
            <div className="setting-info">
              <h3 style={{ color: '#ef4444' }}>Zone de Danger</h3>
              <p>Vider complètement la base de données (irréversible).</p>
            </div>
            <button
              className="btn danger"
              onClick={emptyDb}
              disabled={backupLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: emptyClickCount > 0 ? '#b91c1c' : '#ef4444',
                color: 'white',
                border: 'none',
                transition: 'all 0.2s'
              }}
            >
              {emptyClickCount > 0
                ? emptyClickCount === 4
                  ? '⚠️ DERNIÈRE CHANCE !'
                  : `⚠️ Confirmer (${emptyClickCount}/5)`
                : '⚠️ Vider la BDD'
              }
            </button>
          </div>
        </div>

        {/* Maintenance Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(253, 121, 168, 0.1)', color: 'var(--accent)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1-2-2l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
            <h2 className="section-title">Maintenance</h2>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <h3>Sauvegarde complète</h3>
              <p>Télécharger une archive ZIP contenant tout le code source et la base de données</p>
            </div>
            <button
              className="btn secondary"
              onClick={downloadBackup}
              disabled={backupLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {backupLoading ? 'Création de l\'archive...' : '⬇️ Télécharger Backup Complet'}
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Redémarrer le serveur</h3>
              <p>Redémarrer le backend pour appliquer les nouvelles fonctionnalités</p>
            </div>
            <button
              className="btn secondary"
              onClick={async () => {
                if (!confirm('Voulez-vous vraiment redémarrer le serveur ? Cela peut prendre quelques secondes.')) return
                try {
                  await api.post('/settings/restart')
                  setMsg('Redémarrage en cours...')
                } catch (e) {
                  setMsg('Erreur lors du redémarrage')
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, borderColor: '#ff7675', backgroundColor: '#ff7675', color: '#fff' }}
            >
              🔄 Redémarrer
            </button>
          </div>



          <div className="setting-item auto-backup-container" style={{
            marginTop: '1.5rem',
            padding: '1.5rem',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'block'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div className="setting-info">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  Sauvegarde Automatique
                </h3>
                <p style={{ marginTop: '0.5rem' }}>Sauvegarder automatiquement dans un dossier local (nécessite que l'onglet reste ouvert)</p>
              </div>

              <div className="flex items-center" style={{ gap: '1rem' }}>
                <div className="status-indicator">
                  <span className={`dot ${autoBackupEnabled ? 'active' : 'inactive'}`}></span>
                  <span style={{ color: autoBackupEnabled ? 'var(--success)' : '#64748b', fontWeight: 500 }}>
                    {autoBackupEnabled ? 'Activé' : 'Désactivé'}
                  </span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={autoBackupEnabled}
                    onChange={(e) => {
                      if (e.target.checked && !dirHandle) {
                        alert("Veuillez d'abord choisir un dossier de sauvegarde.");
                        return;
                      }
                      setAutoBackupEnabled(e.target.checked);
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              alignItems: 'end'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 500, color: '#475569' }}>Fréquence de sauvegarde</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    value={backupInterval}
                    onChange={(e) => setBackupInterval(parseInt(e.target.value) || 60)}
                    style={{
                      width: '80px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.95rem'
                    }}
                    disabled={autoBackupEnabled}
                  />
                  <span style={{ color: '#64748b' }}>minutes</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 500, color: '#475569' }}>Destination</label>
                <button
                  className="btn secondary"
                  onClick={pickFolder}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    background: dirHandle ? '#e0f2fe' : 'white',
                    borderColor: dirHandle ? '#7dd3fc' : '#cbd5e1',
                    color: dirHandle ? '#0284c7' : '#475569'
                  }}
                >
                  {dirHandle ? '📁 Dossier sélectionné' : '📁 Choisir le dossier'}
                </button>
              </div>
            </div>

            {nextBackupTime && autoBackupEnabled && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#ecfdf5',
                borderRadius: '6px',
                border: '1px solid #a7f3d0',
                color: '#047857',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Prochaine sauvegarde prévue à <strong>{nextBackupTime.toLocaleTimeString()}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
