import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function SubAdminSignature() {
    const navigate = useNavigate()
    const [signature, setSignature] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        loadSignature()
    }, [])

    const loadSignature = async () => {
        try {
            const r = await api.get('/subadmin/signature')
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

            const r = await api.post('/subadmin/signature/upload', formData, {
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
        if (!confirm('Êtes-vous sûr de vouloir supprimer votre signature ?')) return

        try {
            setError('')
            await api.delete('/subadmin/signature')
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
                <button className="btn secondary" onClick={() => navigate('/subadmin/dashboard')} style={{ marginBottom: 16 }}>
                    ← Retour au tableau de bord
                </button>

                <h2 className="title">Ma signature</h2>
                <div className="note">
                    Téléchargez une image de votre signature. Elle sera automatiquement insérée dans les carnets lorsque vous les signerez.
                </div>

                {error && (
                    <div className="note" style={{ marginTop: 16, padding: 12, background: '#ffebee', color: '#c62828', borderRadius: 8 }}>
                        {error}
                    </div>
                )}

                {success && (
                    <div className="note" style={{ marginTop: 16, padding: 12, background: '#e8f5e9', color: '#2e7d32', borderRadius: 8 }}>
                        {success}
                    </div>
                )}

                <div style={{ marginTop: 24 }}>
                    {signature ? (
                        <div>
                            <div className="note" style={{ marginBottom: 12 }}>Signature actuelle :</div>
                            <div style={{ 
                                padding: 16, 
                                background: '#fff', 
                                border: '2px solid #ddd', 
                                borderRadius: 8,
                                display: 'inline-block',
                                maxWidth: '100%'
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
                            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                                <label className="btn">
                                    {uploading ? 'Upload...' : 'Remplacer la signature'}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handleFileUpload} 
                                        disabled={uploading}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                <button className="btn secondary" onClick={handleDelete}>
                                    Supprimer
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="note" style={{ marginBottom: 12 }}>Aucune signature enregistrée</div>
                            <label className="btn">
                                {uploading ? 'Upload...' : 'Télécharger une signature'}
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

                <div className="card" style={{ marginTop: 24, background: '#f5f5f5' }}>
                    <h3 style={{ fontSize: 14 }}>Conseils</h3>
                    <ul style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
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
