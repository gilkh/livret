import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import Modal from '../components/Modal'
import Toast, { ToastType } from '../components/Toast'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }

type Template = {
    _id: string
    name: string
    pages: Page[]
    currentVersion?: number
}

const pageWidth = 800
const pageHeight = 1120

export default function SuggestionGradebookTemplates() {
    const location = useLocation()
    const navigate = useNavigate()
    const isAefeUser = location.pathname.includes('/aefe/')

    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [selectedTemplateId, setSelectedTemplateId] = useState('')
    const selectedTemplate = useMemo(
        () => templates.find(t => String(t._id) === String(selectedTemplateId)) || null,
        [templates, selectedTemplateId]
    )

    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
    const showToast = (message: string, type: ToastType = 'info') => setToast({ message, type })

    const [suggestionModal, setSuggestionModal] = useState<{
        pageIndex: number
        blockIndex: number
        blockId?: string
        originalText: string
        isOpen: boolean
    } | null>(null)
    const [suggestionText, setSuggestionText] = useState('')

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                setError('')
                const r = await api.get('/templates')
                const list = Array.isArray(r.data) ? r.data : []
                setTemplates(list)
            } catch (e: any) {
                setError('Impossible de charger les templates')
                console.error(e)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [])

    const submitSuggestion = async () => {
        if (!suggestionModal || !selectedTemplate) return
        try {
            await api.post('/suggestions', {
                type: 'template_edit',
                templateId: selectedTemplate._id,
                templateVersion: selectedTemplate.currentVersion,
                pageIndex: suggestionModal.pageIndex,
                blockIndex: suggestionModal.blockIndex,
                blockId: suggestionModal.blockId,
                originalText: suggestionModal.originalText,
                suggestedText: suggestionText
            })
            showToast('Suggestion envoyée !', 'success')
            setSuggestionModal(null)
            setSuggestionText('')
        } catch (e: any) {
            showToast('Erreur lors de l\'envoi', 'error')
            console.error(e)
        }
    }

    return (
        <div className="container">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <Modal
                isOpen={!!suggestionModal}
                onClose={() => setSuggestionModal(null)}
                title="Suggérer une modification"
                footer={
                    <>
                        <button className="btn secondary" onClick={() => setSuggestionModal(null)}>Annuler</button>
                        <button className="btn" onClick={submitSuggestion}>Envoyer</button>
                    </>
                }
            >
                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Texte original</label>
                    <div style={{ padding: 8, background: '#f1f5f9', borderRadius: 4, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                        {suggestionModal?.originalText}
                    </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Suggestion</label>
                    <textarea
                        value={suggestionText}
                        onChange={e => setSuggestionText(e.target.value)}
                        style={{ width: '100%', height: 120, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                        placeholder="Entrez votre suggestion..."
                        autoFocus
                    />
                </div>
            </Modal>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <button
                            onClick={() => navigate(isAefeUser ? '/aefe/suggestion' : '/subadmin/suggestion')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '8px 14px',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                color: '#475569',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                marginBottom: 16,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = '#e2e8f0'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = '#f1f5f9'
                            }}
                        >
                            ← Retour aux demandes
                        </button>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 6, color: '#1e293b' }}>Modifications des Carnets</h2>
                        <div className="note" style={{ fontSize: 14, color: '#64748b' }}>
                            {isAefeUser ? 'RPP / Direction' : 'Sous-admin'} — suggérez des modifications sur les carnets (templates).
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr', gap: 12, maxWidth: 640 }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#475569' }}>Template (carnet)</label>
                        <select
                            className="filter-select"
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            style={{ width: '100%' }}
                            disabled={loading}
                        >
                            <option value="">Sélectionner un template...</option>
                            {templates.map(t => (
                                <option key={t._id} value={t._id}>{t.name}</option>
                            ))}
                        </select>
                        {error && <div className="note" style={{ color: '#dc2626', marginTop: 8 }}>{error}</div>}
                        {loading && <div className="note" style={{ marginTop: 8 }}>Chargement...</div>}
                    </div>
                </div>

                {selectedTemplate && (
                    <div style={{ marginTop: 22 }}>
                        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedTemplate.name}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Cliquez sur ✎ pour proposer une modification de texte/options.
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
                            {selectedTemplate.pages
                                .filter(p => !p.excludeFromPdf)
                                .map((page, pageIndex) => (
                                    <div
                                        key={pageIndex}
                                        className="card page-canvas"
                                        style={{
                                            height: pageHeight,
                                            width: pageWidth,
                                            background: page.bgColor || '#fff',
                                            overflow: 'hidden',
                                            position: 'relative'
                                        }}
                                    >
                                        {page.blocks.map((b, blockIndex) => {
                                            if (!b || !b.props) return null

                                            const blockId = typeof b.props.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : undefined

                                            const openSuggest = (originalText: string) => {
                                                setSuggestionModal({
                                                    pageIndex,
                                                    blockIndex,
                                                    blockId,
                                                    originalText,
                                                    isOpen: true
                                                })
                                                setSuggestionText('')
                                            }

                                            if (b.type === 'text' || b.type === 'dynamic_text') {
                                                const display = (() => {
                                                    if (Array.isArray(b.props?.runs) && b.props.runs.length) {
                                                        return (b.props.runs as any[]).map(r => String(r?.text || '')).join('')
                                                    }
                                                    return b.props?.text ?? b.props?.content ?? ''
                                                })()
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <div style={{ color: b.props.color, fontSize: b.props.fontSize, whiteSpace: 'pre-wrap' }}>{display}</div>
                                                            <div
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    openSuggest(String(display || ''))
                                                                }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: -10,
                                                                    right: -10,
                                                                    background: '#f59e0b',
                                                                    color: 'white',
                                                                    borderRadius: '50%',
                                                                    width: 20,
                                                                    height: 20,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'pointer',
                                                                    fontSize: 12,
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                                }}
                                                                title="Suggérer une modification"
                                                            >
                                                                ✎
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'dropdown' || b.type === 'dropdown_reference') {
                                                const options = Array.isArray(b.props.options) ? b.props.options : []
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ width: b.props.width || 200, position: 'relative' }}>
                                                            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>Dropdown #{b.props.dropdownNumber || '?'}</div>
                                                            {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                                                            <div
                                                                style={{
                                                                    width: '100%',
                                                                    minHeight: b.props.height || 32,
                                                                    fontSize: b.props.fontSize || 12,
                                                                    color: b.props.color || '#333',
                                                                    padding: '4px 8px',
                                                                    borderRadius: 4,
                                                                    border: '1px solid #ccc',
                                                                    background: '#f9f9f9',
                                                                    cursor: 'default',
                                                                    whiteSpace: 'pre-wrap'
                                                                }}
                                                            >
                                                                Sélectionner...
                                                            </div>
                                                            <div
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    openSuggest(options.join('\n'))
                                                                }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: -10,
                                                                    right: -10,
                                                                    background: '#f59e0b',
                                                                    color: 'white',
                                                                    borderRadius: '50%',
                                                                    width: 20,
                                                                    height: 20,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'pointer',
                                                                    fontSize: 12,
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                                }}
                                                                title="Suggérer une modification des options"
                                                            >
                                                                ✎
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'image' && b.props?.url) {
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ position: 'relative', width: b.props.width || 160, height: b.props.height || 'auto', background: '#fafafa', border: '1px solid #eee', padding: 6 }}>
                                                            <img src={b.props.url} alt={b.props.alt || 'image'} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                                                            <div
                                                                onClick={(e) => { e.stopPropagation(); openSuggest(String(b.props.url || '')) }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: -10,
                                                                    right: -10,
                                                                    background: '#f59e0b',
                                                                    color: 'white',
                                                                    borderRadius: '50%',
                                                                    width: 20,
                                                                    height: 20,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'pointer',
                                                                    fontSize: 12,
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                                }}
                                                                title="Suggérer une modification (URL)"
                                                            >
                                                                ✎
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (['rect', 'circle', 'line', 'arrow', 'qr'].includes(b.type)) {
                                                // Simple visual placeholder for shapes/qr
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ width: b.props.width || 80, height: b.props.height || 40, background: '#fff', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
                                                            {b.type.toUpperCase()}
                                                        </div>
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); openSuggest(JSON.stringify(b.props || {})) }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: -10,
                                                                right: -10,
                                                                background: '#f59e0b',
                                                                color: 'white',
                                                                borderRadius: '50%',
                                                                width: 20,
                                                                height: 20,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                fontSize: 12,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                            }}
                                                            title="Suggérer une modification"
                                                        >
                                                            ✎
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'table') {
                                                const rows = Array.isArray(b.props.rows) ? b.props.rows : b.props.data || []
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ background: '#fff', border: '1px solid #eee', padding: 6, maxWidth: 420, overflow: 'auto' }}>
                                                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                                                <tbody>
                                                                    {rows.map((r: any, i: number) => (
                                                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                            {Array.isArray(r) ? r.map((c: any, j: number) => <td key={j} style={{ padding: 6, fontSize: 12 }}>{String(c)}</td>) : <td style={{ padding: 6 }}>{String(r)}</td>}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            <div
                                                                onClick={(e) => { e.stopPropagation(); openSuggest(JSON.stringify(b.props || {})) }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: -10,
                                                                    right: -10,
                                                                    background: '#f59e0b',
                                                                    color: 'white',
                                                                    borderRadius: '50%',
                                                                    width: 20,
                                                                    height: 20,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'pointer',
                                                                    fontSize: 12,
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                                }}
                                                                title="Suggérer une modification"
                                                            >
                                                                ✎
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'student_info' || b.type === 'category_title' || b.type === 'competency_list' || b.type === 'promotion_info') {
                                                const title = b.props?.title || b.props?.label || b.props?.category || b.type
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{title}</div>
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); openSuggest(String(b.props?.content || title || '')) }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: -10,
                                                                right: -10,
                                                                background: '#f59e0b',
                                                                color: 'white',
                                                                borderRadius: '50%',
                                                                width: 20,
                                                                height: 20,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                fontSize: 12,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                            }}
                                                            title="Suggérer une modification"
                                                        >
                                                            ✎
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'signature' || b.type === 'signature_box') {
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ width: b.props.width || 180, height: b.props.height || 60, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>{b.props?.label || 'Signature'}</div>
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); openSuggest(String(b.props?.label || '')) }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: -10,
                                                                right: -10,
                                                                background: '#f59e0b',
                                                                color: 'white',
                                                                borderRadius: '50%',
                                                                width: 20,
                                                                height: 20,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                fontSize: 12,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                            }}
                                                            title="Suggérer une modification"
                                                        >
                                                            ✎
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            if (b.type === 'language_toggle' || b.type === 'language_toggle_v2') {
                                                const items = Array.isArray(b.props.items) ? b.props.items : []
                                                return (
                                                    <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            {items.map((it: any, ii: number) => (
                                                                <div key={ii} style={{ padding: '6px 10px', background: '#f1f5f9', borderRadius: 8, fontSize: 12 }}>{it.label || it}</div>
                                                            ))}
                                                        </div>
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); openSuggest(JSON.stringify(b.props || {})) }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: -10,
                                                                right: -10,
                                                                background: '#f59e0b',
                                                                color: 'white',
                                                                borderRadius: '50%',
                                                                width: 20,
                                                                height: 20,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                fontSize: 12,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                            }}
                                                            title="Suggérer une modification"
                                                        >
                                                            ✎
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            // Render a minimal JSON fallback for unknown block types so admins see content and can suggest changes
                                            return (
                                                <div key={blockIndex} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIndex, padding: 6 }}>
                                                    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, maxWidth: 420, fontSize: 12, color: '#334155' }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{b.type}</div>
                                                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(b.props || {}, null, 2)}</pre>
                                                    </div>
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); openSuggest(JSON.stringify(b.props || {})) }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: -10,
                                                            right: -10,
                                                            background: '#f59e0b',
                                                            color: 'white',
                                                            borderRadius: '50%',
                                                            width: 20,
                                                            height: 20,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            fontSize: 12,
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                        }}
                                                        title="Suggérer une modification"
                                                    >
                                                        ✎
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
