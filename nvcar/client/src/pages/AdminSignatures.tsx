import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

type AdminSignature = {
    _id: string
    name: string
    dataUrl: string
    isActive: boolean
    createdAt: string
}

export default function AdminSignatures() {
    const [signatures, setSignatures] = useState<AdminSignature[]>([])
    const [uploading, setUploading] = useState(false)
    const [newName, setNewName] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const tripleConfirm = (message: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!confirm(`${message}\n\nConfirmation ${attempt}/3`)) return false
        }
        return true
    }

    useEffect(() => {
        loadSignatures()
    }, [])

    const loadSignatures = async () => {
        try {
            const r = await api.get('/signatures/admin')
            setSignatures(r.data)
        } catch (e) {
            console.error(e)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!newName) {
            setError('Veuillez entrer un nom pour la signature')
            return
        }

        // Convert to base64
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = async () => {
            try {
                setUploading(true)
                setError('')
                setSuccess('')
                
                await api.post('/signatures/admin', {
                    name: newName,
                    dataUrl: reader.result
                })

                setNewName('')
                loadSignatures()
                setSuccess('Signature ajoutée')
            } catch (e) {
                setError('Erreur lors de l\'ajout')
            } finally {
                setUploading(false)
            }
        }
    }

    const handleActivate = async (id: string) => {
        try {
            await api.post(`/signatures/admin/${id}/activate`, {})
            loadSignatures()
            setSuccess('Signature activée')
        } catch (e) {
            setError('Erreur activation')
        }
    }

    const handleDelete = async (id: string) => {
        if (!tripleConfirm('Supprimer cette signature ?')) return
        try {
            await api.delete(`/signatures/admin/${id}`)
            loadSignatures()
            setSuccess('Signature supprimée')
        } catch (e) {
            setError('Erreur suppression')
        }
    }

    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
             <div style={{ marginBottom: 32 }}>
                <Link to="/admin/permissions" className="btn secondary" style={{ textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
                    ← Retour
                </Link>
                <h2 className="title">Signatures Admin</h2>
                <p className="note">Gérez les signatures disponibles pour l'administrateur.</p>
            </div>

            {error && <div className="note" style={{ background: '#fef2f2', color: '#dc2626', marginBottom: 20, padding: 10, borderRadius: 8 }}>{error}</div>}
            {success && <div className="note" style={{ background: '#dcfce7', color: '#166534', marginBottom: 20, padding: 10, borderRadius: 8 }}>{success}</div>}

            <div className="card" style={{ padding: 24, marginBottom: 32 }}>
                <h3>Ajouter une signature</h3>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                    <input 
                        type="text" 
                        placeholder="Nom (ex: Signature Directeur)" 
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', flex: 1 }}
                    />
                    <label className="btn" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {uploading ? '...' : 'Choisir image'}
                        <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
                {signatures.map(sig => (
                    <div key={sig._id} className="card" style={{ 
                        padding: 16, 
                        border: sig.isActive ? '2px solid #10b981' : '1px solid #e2e8f0',
                        position: 'relative'
                    }}>
                        {sig.isActive && (
                            <div style={{ 
                                position: 'absolute', top: 10, right: 10, 
                                background: '#10b981', color: 'white', 
                                padding: '2px 8px', borderRadius: 12, fontSize: 12 
                            }}>
                                Active
                            </div>
                        )}
                        <h4 style={{ margin: '0 0 12px 0' }}>{sig.name}</h4>
                        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 8, marginBottom: 12 }}>
                            <img src={sig.dataUrl} alt={sig.name} style={{ maxHeight: '100%', maxWidth: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {!sig.isActive && (
                                <button className="btn" onClick={() => handleActivate(sig._id)} style={{ flex: 1, fontSize: 13 }}>
                                    Activer
                                </button>
                            )}
                            <button className="btn secondary" onClick={() => handleDelete(sig._id)} style={{ color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2' }}>
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
