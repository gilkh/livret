import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api'

export default function SubAdminSignature() {
    const navigate = useNavigate()
    const location = useLocation()
    const isAefeUser = location.pathname.includes('/aefe')
    const apiPrefix = isAefeUser ? '/aefe' : '/subadmin'
    const dashboardPath = isAefeUser ? '/aefe/dashboard' : '/subadmin/dashboard'
    const [signature, setSignature] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const tripleConfirm = (message: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!confirm(`${message}\n\nConfirmation ${attempt}/3`)) return false
        }
        return true
    }

    useEffect(() => {
        loadSignature()
    }, [])

    const loadSignature = async () => {
        try {
            const r = await api.get(`${apiPrefix}/signature`)
            setSignature(r.data.signatureUrl)
        } catch (e: any) {
            if (e.response?.status !== 404) {
                console.error(e)
            }
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            setError('Veuillez sélectionner une image')
            return
        }

        try {
            setUploading(true)
            setError('')
            setSuccess('')

            const formData = new FormData()
            formData.append('file', file)

            const r = await api.post(`${apiPrefix}/signature/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })

            setSignature(r.data.signatureUrl)
            setSuccess('Signature enregistrée avec succès')
        } catch (e: any) {
            setError('Échec de l\'upload de la signature')
            console.error(e)
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async () => {
        if (!tripleConfirm('Êtes-vous sûr de vouloir supprimer votre signature ?')) return

        try {
            setError('')
            await api.delete(`${apiPrefix}/signature`)
            setSignature(null)
            setSuccess('Signature supprimée')
        } catch (e: any) {
            setError('Échec de la suppression')
            console.error(e)
        }
    }

    return (
        <div className="container">
            <div className="card">
                <button className="btn secondary" onClick={() => navigate(dashboardPath)} style={{ 
                    marginBottom: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 500,
                    border: '1px solid #e2e8f0'
                }}>
                    ← Retour au tableau de bord
                </button>

                <h2 className="title" style={{ fontSize: 28, marginBottom: 8, color: '#1e293b' }}>✍️ Ma signature</h2>
                <div className="note" style={{ fontSize: 14, color: '#64748b' }}>
                    Téléchargez une image de votre signature. Elle sera automatiquement insérée dans les carnets lorsque vous les signerez.
                </div>

                {error && (
                    <div className="note" style={{ marginTop: 16, padding: 14, background: '#fef2f2', color: '#dc2626', borderRadius: 8, border: '1px solid #fecaca', fontWeight: 500 }}>
                        ⚠️ {error}
                    </div>
                )}

                {success && (
                    <div className="note" style={{ marginTop: 16, padding: 14, background: '#d1fae5', color: '#065f46', borderRadius: 8, border: '1px solid #6ee7b7', fontWeight: 500 }}>
                        ✅ {success}
                    </div>
                )}

                <div style={{ marginTop: 28 }}>
                    {signature ? (
                        <div>
                            <div className="note" style={{ marginBottom: 14, fontSize: 15, fontWeight: 600, color: '#475569' }}>📝 Signature actuelle :</div>
                            <div style={{ 
                                padding: 24, 
                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                                border: '2px solid #e2e8f0', 
                                borderRadius: 12,
                                display: 'inline-block',
                                maxWidth: '100%',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
                            }}>
                                <img 
                                    src={signature} 
                                    alt="Signature" 
                                    style={{ 
                                        maxWidth: 400, 
                                        maxHeight: 200,
                                        display: 'block'
                                    }} 
                                />
                            </div>
                            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                                <label className="btn" style={{
                                    background: 'linear-gradient(135deg, #6c5ce7 0%, #5b4bc4 100%)',
                                    fontWeight: 500,
                                    padding: '12px 20px',
                                    boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)',
                                    cursor: uploading ? 'not-allowed' : 'pointer',
                                    opacity: uploading ? 0.7 : 1
                                }}>
                                    {uploading ? '⏳ Upload...' : '🔄 Remplacer la signature'}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handleFileUpload} 
                                        disabled={uploading}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                <button className="btn secondary" onClick={handleDelete} style={{
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    fontWeight: 500,
                                    padding: '12px 20px'
                                }}>
                                    🗑️ Supprimer
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="note" style={{ marginBottom: 14, fontSize: 15, fontWeight: 600, color: '#475569' }}>⚠️ Aucune signature enregistrée</div>
                            <label className="btn" style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                fontWeight: 500,
                                padding: '12px 20px',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                opacity: uploading ? 0.7 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8
                            }}>
                                {uploading ? '⏳ Upload...' : '📤 Télécharger une signature'}
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleFileUpload} 
                                    disabled={uploading}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                    )}
                </div>

                <div className="card" style={{ 
                    marginTop: 28, 
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1px solid #e2e8f0'
                }}>
                    <h3 style={{ fontSize: 16, marginBottom: 12, color: '#1e293b', fontWeight: 600 }}>💡 Conseils</h3>
                    <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, paddingLeft: 20 }}>
                        <li>Utilisez une image sur fond transparent (PNG) pour un meilleur résultat</li>
                        <li>La signature doit être claire et lisible</li>
                        <li>Taille recommandée : 300-500 pixels de largeur</li>
                        <li>Formats acceptés : PNG, JPG, JPEG, GIF</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
