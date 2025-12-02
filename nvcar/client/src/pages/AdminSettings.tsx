import { useEffect, useState } from 'react'
import api from '../api'
import './AdminSettings.css'

export default function AdminSettings() {
  const [teacherLogin, setTeacherLogin] = useState(true)
  const [subAdminLogin, setSubAdminLogin] = useState(true)
  const [microsoftLogin, setMicrosoftLogin] = useState(true)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const [backupInterval, setBackupInterval] = useState(60) // in minutes
  const [dirHandle, setDirHandle] = useState<any>(null)
  const [nextBackupTime, setNextBackupTime] = useState<Date | null>(null)

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
