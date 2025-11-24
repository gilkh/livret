import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'

type Change = {
    _id: string
    changeType: string
    timestamp: Date
    templateName?: string
    studentName?: string
    pageIndex: number
    blockIndex: number
    before?: any
    after?: any
}

export default function SubAdminTeacherView() {
    const { teacherId } = useParams<{ teacherId: string }>()
    const [changes, setChanges] = useState<Change[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadChanges = async () => {
            try {
                setLoading(true)
                const r = await api.get(`/subadmin/teachers/${teacherId}/changes`)
                setChanges(r.data)
            } catch (e: any) {
                setError('Impossible de charger les modifications')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        if (teacherId) loadChanges()
    }, [teacherId])

    return (
        <div className="container">
            <div className="card">
                <button className="btn secondary" onClick={() => window.history.back()} style={{ marginBottom: 16 }}>← Retour</button>
                <h2 className="title">Modifications de l'enseignant</h2>

                {loading && <div className="note">Chargement...</div>}
                {error && <div className="note" style={{ color: 'crimson' }}>{error}</div>}

                <div style={{ marginTop: 16 }}>
                    {changes.map(c => (
                        <div key={c._id} className="card" style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                                <div>
                                    <div className="title" style={{ fontSize: 16 }}>{c.templateName || 'Carnet'}</div>
                                    <div className="note">{c.studentName || 'Élève'}</div>
                                </div>
                                <div className="note" style={{ fontSize: 12 }}>
                                    {new Date(c.timestamp).toLocaleString()}
                                </div>
                            </div>

                            <div className="note">
                                Type: {c.changeType} | Page {c.pageIndex + 1}, Bloc {c.blockIndex + 1}
                            </div>

                            {c.before && c.after && (
                                <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 6 }}>
                                    <div style={{ fontSize: 12 }}>
                                        <strong>Avant:</strong> {JSON.stringify(c.before.items?.map((i: any) => ({ code: i.code, active: i.active })))}
                                    </div>
                                    <div style={{ fontSize: 12, marginTop: 4 }}>
                                        <strong>Après:</strong> {JSON.stringify(c.after.items?.map((i: any) => ({ code: i.code, active: i.active })))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {!loading && changes.length === 0 && (
                        <div className="note">Aucune modification enregistrée.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
