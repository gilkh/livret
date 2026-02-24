import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import Modal from '../components/Modal'
import Toast, { ToastType } from '../components/Toast'
import TemplateReviewPreview from '../components/TemplateReviewPreview'
import { openPdfExport, buildPreviewEmptyPdfUrl } from '../utils/pdfExport'
import { Download, Sparkles } from 'lucide-react'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }

type Template = {
    _id: string
    name: string
    pages: Page[]
    currentVersion?: number
}

type SuggestionItem = {
    _id: string
    templateId?: string
    pageIndex?: number
    blockIndex?: number
    blockId?: string
    originalText?: string
    suggestedText?: string
    status?: 'pending' | 'approved' | 'rejected'
    createdAt?: string
}

const pageWidth = 800
const pageHeight = 1120

const extractSuggestionText = (block: Block) => {
    const props = block?.props || {}

    if (block.type === 'text' || block.type === 'dynamic_text') {
        if (Array.isArray(props.runs) && props.runs.length > 0) {
            return props.runs.map((r: any) => String(r?.text || '')).join('')
        }
        return String(props.text ?? props.content ?? '')
    }

    if (block.type === 'dropdown' || block.type === 'dropdown_reference') {
        const options = Array.isArray(props.options) ? props.options : []
        return options.map((o: any) => String(o ?? '')).join('\n')
    }

    if (block.type === 'image') {
        return String(props.url || '')
    }

    if (block.type === 'language_toggle' || block.type === 'language_toggle_v2') {
        const items = Array.isArray(props.items) ? props.items : []
        return items.map((it: any) => String(it?.label || it?.code || it || '')).join(' | ')
    }

    if (block.type === 'table') {
        const rows = Array.isArray(props.rows) ? props.rows : props.data || []
        return JSON.stringify(rows, null, 2)
    }

    if (['student_info', 'category_title', 'competency_list', 'promotion_info', 'signature', 'signature_box'].includes(block.type)) {
        return String(props.content || props.label || props.title || props.category || '')
    }

    return JSON.stringify(props || {}, null, 2)
}

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
    const [mySuggestions, setMySuggestions] = useState<SuggestionItem[]>([])
    const [loadingMySuggestions, setLoadingMySuggestions] = useState(false)
    const [deletingSuggestionId, setDeletingSuggestionId] = useState('')
    const [exportQualityChoice, setExportQualityChoice] = useState<{ callback: (hq: boolean) => void } | null>(null)
    const [hoveredBlock, setHoveredBlock] = useState<{
        pageIndex: number
        left: number
        top: number
        width: number
        height: number
        z: number
    } | null>(null)

    const getSuggestionKey = (pageIndex: number, blockIndex: number, blockId?: string) => {
        const bid = String(blockId || '').trim()
        if (bid) return `id:${bid}`
        return `idx:${pageIndex}:${blockIndex}`
    }

    const existingSuggestionKeys = useMemo(() => {
        const keys = new Set<string>()
        mySuggestions.forEach(s => {
            const pi = typeof s.pageIndex === 'number' ? s.pageIndex : -1
            const bi = typeof s.blockIndex === 'number' ? s.blockIndex : -1
            keys.add(getSuggestionKey(pi, bi, s.blockId))
        })
        return keys
    }, [mySuggestions])

    const previewStudent = useMemo(() => ({
        _id: 'preview-student',
        firstName: '',
        lastName: '',
        level: '',
        className: '',
        dateOfBirth: ''
    }), [])

    const previewAssignment = useMemo(() => ({
        _id: 'preview-assignment',
        status: 'draft',
        data: {}
    }), [])

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

    useEffect(() => {
        const loadMine = async () => {
            if (!selectedTemplateId) {
                setMySuggestions([])
                return
            }
            try {
                setLoadingMySuggestions(true)
                const r = await api.get('/suggestions/mine', {
                    params: {
                        templateId: selectedTemplateId,
                        type: 'template_edit'
                    }
                })
                setMySuggestions(Array.isArray(r.data) ? r.data : [])
            } catch (e) {
                console.error(e)
                setMySuggestions([])
            } finally {
                setLoadingMySuggestions(false)
            }
        }

        loadMine()
    }, [selectedTemplateId])

    const submitSuggestion = async () => {
        if (!suggestionModal || !selectedTemplate) return
        try {
            const created = await api.post('/suggestions', {
                type: 'template_edit',
                templateId: selectedTemplate._id,
                templateVersion: selectedTemplate.currentVersion,
                pageIndex: suggestionModal.pageIndex,
                blockIndex: suggestionModal.blockIndex,
                blockId: suggestionModal.blockId,
                originalText: suggestionModal.originalText,
                suggestedText: suggestionText
            })
            if (created?.data?._id) {
                setMySuggestions(prev => [created.data, ...prev])
            }
            showToast('Suggestion envoyée !', 'success')
            setSuggestionModal(null)
            setSuggestionText('')
        } catch (e: any) {
            showToast('Erreur lors de l\'envoi', 'error')
            console.error(e)
        }
    }

    const deleteSuggestion = async (id: string) => {
        try {
            setDeletingSuggestionId(id)
            await api.delete(`/suggestions/${id}`)
            setMySuggestions(prev => prev.filter(s => String(s._id) !== String(id)))
            showToast('Suggestion supprimée', 'success')
        } catch (e: any) {
            showToast('Impossible de supprimer la suggestion', 'error')
            console.error(e)
        } finally {
            setDeletingSuggestionId('')
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
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Contenu original</label>
                    <div style={{ padding: 8, background: '#f1f5f9', borderRadius: 4, fontSize: 14, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
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
                            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}
                        >
                            ← Retour aux demandes
                        </button>
                        <h2 className="title" style={{ fontSize: 28, marginBottom: 6, color: '#1e293b' }}>Modifications des Carnets</h2>
                        <div className="note" style={{ fontSize: 14, color: '#64748b' }}>
                            {isAefeUser ? 'RPP / Direction' : 'Sous-admin'} — vue carnet identique au rendu élève (sans données élève), cliquez sur ✎ pour suggérer.
                        </div>
                    </div>
                    {selectedTemplate && (
                        <button
                            onClick={() => {
                                setExportQualityChoice({
                                    callback: (hq: boolean) => {
                                        const base = (api.defaults.baseURL || '').replace(/\/$/, '')
                                        const pdfUrl = buildPreviewEmptyPdfUrl(base, selectedTemplate._id)
                                        openPdfExport(pdfUrl, selectedTemplate.name || 'Template', 'single', 1, hq)
                                    }
                                })
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 18px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                border: 'none',
                                borderRadius: 10,
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                                transition: 'all 0.2s',
                                alignSelf: 'flex-start'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)' }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)' }}
                        >
                            📄 Exporter en PDF
                        </button>
                    )}
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
                                Cliquez sur ✎ sur un bloc pour proposer une modification ciblée.
                            </div>
                        </div>

                        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Mes suggestions envoyées</div>
                            {loadingMySuggestions ? (
                                <div className="note">Chargement...</div>
                            ) : mySuggestions.length === 0 ? (
                                <div className="note">Aucune suggestion envoyée pour ce template.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                                    {mySuggestions.map(s => (
                                        <div key={s._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                                <div style={{ fontSize: 12, color: '#475569' }}>
                                                    Bloc p.{(typeof s.pageIndex === 'number' ? s.pageIndex + 1 : '?')} / b.{(typeof s.blockIndex === 'number' ? s.blockIndex + 1 : '?')} • {s.status || 'pending'}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn secondary"
                                                    onClick={() => deleteSuggestion(String(s._id))}
                                                    disabled={deletingSuggestionId === String(s._id)}
                                                    style={{ padding: '4px 10px', fontSize: 12 }}
                                                >
                                                    {deletingSuggestionId === String(s._id) ? 'Suppression...' : 'Supprimer'}
                                                </button>
                                            </div>
                                            <div style={{ marginTop: 6, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>
                                                {String(s.suggestedText || '')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
                            {selectedTemplate.pages
                                .map((page, originalPageIdx) => ({ page, originalPageIdx }))
                                .filter(({ page }) => !page.excludeFromPdf)
                                .map(({ page, originalPageIdx }) => (
                                    <div key={originalPageIdx} style={{ position: 'relative', width: pageWidth }}>
                                        <TemplateReviewPreview
                                            template={{ ...(selectedTemplate as any), pages: [page] }}
                                            student={previewStudent as any}
                                            assignment={previewAssignment as any}
                                            signature={null}
                                            finalSignature={null}
                                            minimalMode
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                top: 0,
                                                width: pageWidth,
                                                height: pageHeight,
                                                pointerEvents: 'none'
                                            }}
                                        >
                                            {hoveredBlock && hoveredBlock.pageIndex === originalPageIdx && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        left: hoveredBlock.left,
                                                        top: hoveredBlock.top,
                                                        width: hoveredBlock.width,
                                                        height: hoveredBlock.height,
                                                        border: '2px solid #f59e0b',
                                                        borderRadius: 6,
                                                        boxSizing: 'border-box',
                                                        zIndex: hoveredBlock.z + 900,
                                                        pointerEvents: 'none'
                                                    }}
                                                />
                                            )}
                                            {page.blocks.map((b, blockIndex) => {
                                                if (!b || !b.props) return null
                                                const left = Number(b.props.x || 0)
                                                const top = Number(b.props.y || 0)
                                                const width = Number(b.props.width || 120)
                                                const height = Number(b.props.height || 40)
                                                const z = Number(b.props.z ?? blockIndex)
                                                const blockId = typeof b.props.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : undefined
                                                const suggestionKey = getSuggestionKey(originalPageIdx, blockIndex, blockId)
                                                const hasSuggestion = existingSuggestionKeys.has(suggestionKey)

                                                return (
                                                    <button
                                                        key={`${originalPageIdx}-${blockIndex}`}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSuggestionModal({
                                                                pageIndex: originalPageIdx,
                                                                blockIndex,
                                                                blockId,
                                                                originalText: extractSuggestionText(b),
                                                                isOpen: true
                                                            })
                                                            setSuggestionText('')
                                                        }}
                                                        onMouseEnter={() => {
                                                            setHoveredBlock({
                                                                pageIndex: originalPageIdx,
                                                                left,
                                                                top,
                                                                width: Math.max(width, 40),
                                                                height: Math.max(height, 28),
                                                                z
                                                            })
                                                        }}
                                                        onMouseLeave={() => setHoveredBlock(null)}
                                                        style={{
                                                            position: 'absolute',
                                                            left: Math.max(0, left + width - 10),
                                                            top: Math.max(0, top - 10),
                                                            width: 22,
                                                            height: 22,
                                                            borderRadius: '50%',
                                                            border: 'none',
                                                            background: hasSuggestion ? '#0ea5e9' : '#f59e0b',
                                                            color: '#fff',
                                                            fontSize: 12,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                            zIndex: z + 1000,
                                                            pointerEvents: 'auto'
                                                        }}
                                                    >
                                                        ✎
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Export quality choice modal */}
            {exportQualityChoice && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onClick={() => setExportQualityChoice(null)}
                >
                    <div
                        style={{
                            background: 'white', borderRadius: 16, padding: '28px 32px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxWidth: 420, width: '90%'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#1e293b' }}>
                            Qualité de l'export
                        </h3>
                        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                            Choisissez la qualité du carnet PDF exporté.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                                onClick={() => {
                                    const cb = exportQualityChoice.callback
                                    setExportQualityChoice(null)
                                    cb(false)
                                }}
                                style={{
                                    padding: '14px 18px', borderRadius: 12,
                                    border: '2px solid #e2e8f0', background: '#f8fafc',
                                    cursor: 'pointer', textAlign: 'left' as const,
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    transition: 'border-color 0.15s, background 0.15s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff' }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
                            >
                                <Download size={22} style={{ color: '#3b82f6', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                                        Compressé
                                        <span style={{ fontWeight: 500, fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>— rapide</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                                        Fichier léger, bonne qualité visuelle (JPEG)
                                    </div>
                                </div>
                            </button>
                            <button
                                onClick={() => {
                                    const cb = exportQualityChoice.callback
                                    setExportQualityChoice(null)
                                    cb(true)
                                }}
                                style={{
                                    padding: '14px 18px', borderRadius: 12,
                                    border: '2px solid #e2e8f0', background: '#f8fafc',
                                    cursor: 'pointer', textAlign: 'left' as const,
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    transition: 'border-color 0.15s, background 0.15s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = '#f5f3ff' }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
                            >
                                <Sparkles size={22} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                                        Qualité maximale
                                        <span style={{ fontWeight: 500, fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>— plus lent</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                                        Aucune perte de pixels, fichier plus volumineux (PNG)
                                    </div>
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={() => setExportQualityChoice(null)}
                            style={{
                                marginTop: 16, width: '100%', padding: '10px',
                                borderRadius: 10, border: '1px solid #e2e8f0',
                                background: 'transparent', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 14, fontWeight: 500
                            }}
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
