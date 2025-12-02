import { useEffect, useState } from 'react'
import api from '../api'
import './AdminSettings.css'

export default function AdminSettings() {
  const [teacherLogin, setTeacherLogin] = useState(true)
  const [subAdminLogin, setSubAdminLogin] = useState(true)
  const [microsoftLogin, setMicrosoftLogin] = useState(true)
  const [schoolName, setSchoolName] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)

  useEffect(() => {
    loadSettings()
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
      setSchoolName(res.data.school_name || '')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
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

  const handleSchoolNameBlur = async () => {
    await saveSetting('school_name', schoolName)
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
        <div className="toast-message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>{msg}</span>
        </div>
      )}

      <div className="settings-grid">
        
        {/* General Information Section */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <h2 className="section-title">Identité de l'École</h2>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <h3>Nom de l'établissement</h3>
              <p>Ce nom apparaîtra sur les documents officiels</p>
            </div>
            <div style={{ width: '300px' }}>
              <input 
                type="text" 
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                onBlur={handleSchoolNameBlur}
                placeholder="Ex: École Maternelle Victor Hugo"
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  borderRadius: '8px', 
                  border: '1px solid #e2e8f0',
                  fontSize: '0.95rem'
                }}
              />
            </div>
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
              <h3>Connexion Sous-Administrateurs</h3>
              <p>Autoriser les sous-administrateurs à accéder au panneau de gestion</p>
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
        </div>
      </div>
    </div>
  )
}
