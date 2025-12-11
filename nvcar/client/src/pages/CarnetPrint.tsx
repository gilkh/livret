import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../api'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth: Date; className?: string; avatarUrl?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

export default function CarnetPrint({ mode }: { mode?: 'saved' }) {
    const { assignmentId, savedId } = useParams<{ assignmentId: string, savedId: string }>()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    
    const [template, setTemplate] = useState<Template | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [signature, setSignature] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const getNextLevel = (current: string) => {
        const c = (current || '').toUpperCase()
        if (c === 'TPS') return 'PS'
        if (c === 'PS') return 'MS'
        if (c === 'MS') return 'GS'
        if (c === 'GS') return 'EB1'
        if (c === 'KG1') return 'KG2'
        if (c === 'KG2') return 'KG3'
        if (c === 'KG3') return 'EB1'
        return ''
    }

    useEffect(() => {
        // Initialize as not ready
        // @ts-ignore
        window.__READY_FOR_PDF__ = false
        
        const loadData = async () => {
            try {
                setLoading(true)
                // Use token from URL if provided
                if (token) {
                    localStorage.setItem('token', token)
                }
                
                if (mode === 'saved' && savedId) {
                    console.log('[CarnetPrint] Loading saved gradebook:', savedId)
                    const r = await api.get(`/saved-gradebooks/${savedId}`)
                    const savedData = r.data
                    
                    setStudent({
                        ...savedData.data.student,
                        className: savedData.data.className || savedData.data.student.className
                    })
                    setAssignment(savedData.data.assignment)
                    setSignature(savedData.data.signature)
                    
                    if (savedData.templateId) {
                         const t = await api.get(`/templates/${savedData.templateId}`)
                         let templateData = t.data
                         
                         // Handle versioning
                         const assignment = savedData.data.assignment
                         if (assignment?.templateVersion && templateData.versionHistory) {
                             const version = templateData.versionHistory.find((v: any) => v.version === assignment.templateVersion)
                             if (version) {
                                 templateData = {
                                     ...templateData,
                                     pages: version.pages,
                                     variables: version.variables || {},
                                     watermark: version.watermark
                                 }
                             }
                         }

                         // Merge assignment data into template blocks (specifically for language toggles)
                         if (assignment && assignment.data) {
                             templateData.pages.forEach((page: any, pIdx: number) => {
                                 page.blocks.forEach((block: any, bIdx: number) => {
                                     if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                                         const key = `language_toggle_${pIdx}_${bIdx}`
                                         if (assignment.data[key]) {
                                             block.props.items = assignment.data[key]
                                         }
                                     }
                                 })
                             })
                         }

                         setTemplate(templateData)
                    }
                } else if (assignmentId) {
                    console.log('[CarnetPrint] Loading data for assignment:', assignmentId)
                    const r = await api.get(`/subadmin/templates/${assignmentId}/review`)
                    setTemplate(r.data.template)
                    setStudent(r.data.student)
                    setAssignment(r.data.assignment)
                    setSignature(r.data.signature)
                }
                
                console.log('[CarnetPrint] Data loaded successfully')
                
            } catch (e: any) {
                setError(e.response?.data?.error || 'Erreur de chargement')
                console.error('[CarnetPrint] Error loading data:', e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [assignmentId, savedId, token, mode])
    
    // Signal ready after render is complete
    useEffect(() => {
        if (!loading && template && student) {
            console.log('[CarnetPrint] Rendering complete, signaling ready for PDF')
            // Small delay to ensure all images/fonts are loaded
            setTimeout(() => {
                // @ts-ignore
                window.__READY_FOR_PDF__ = true
                console.log('[CarnetPrint] Ready for PDF generation')
            }, 500)
        }
    }, [loading, template, student])

    if (loading) return <div style={{ padding: 20 }}>Chargement...</div>
    if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>
    if (!template || !student) return <div style={{ padding: 20 }}>Données introuvables</div>

    return (
        <div style={{ margin: 0, padding: 0 }}>
            <style>{`
                @page {
                    size: A4;
                    margin: 0;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .page-canvas {
                        page-break-after: always;
                        page-break-inside: avoid;
                    }
                }
            `}</style>
            {template.pages.filter(p => !p.excludeFromPdf).map((page, pageIdx) => (
                <div 
                    key={pageIdx}
                    className="page-canvas" 
                    style={{ 
                        height: pageHeight, 
                        width: pageWidth, 
                        background: page.bgColor || '#fff', 
                        overflow: 'hidden', 
                        position: 'relative',
                        pageBreakAfter: 'always',
                        pageBreakInside: 'avoid',
                        margin: '0 auto'
                    }}
                >
                    {page.blocks.map((b, idx) => (
                        <div key={idx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? idx }}>
                            {b.type === 'text' && (
                                <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>{b.props.text}</div>
                            )}
                            {b.type === 'dynamic_text' && (
                                <div style={{ color: b.props.color, fontSize: b.props.fontSize }}>
                                    {(b.props.text || '')
                                        .replace(/\{student\.firstName\}/g, student.firstName)
                                        .replace(/\{student\.lastName\}/g, student.lastName)
                                        .replace(/\{student\.dob\}/g, new Date(student.dateOfBirth).toLocaleDateString())
                                    }
                                </div>
                            )}
                            {b.type === 'image' && <img src={b.props.url} style={{ width: b.props.width || 120, height: b.props.height || 120, borderRadius: 8 }} alt="" />}
                            {b.type === 'student_photo' && (
                                student?.avatarUrl ? (
                                    <img src={student.avatarUrl} style={{ width: b.props.width || 100, height: b.props.height || 100, objectFit: 'cover', borderRadius: 8 }} alt="Student" />
                                ) : (
                                    <div style={{ width: b.props.width || 100, height: b.props.height || 100, borderRadius: 8, background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                                        <div style={{ fontSize: 24 }}>👤</div>
                                    </div>
                                )
                            )}
                            {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: b.props.radius || 8 }} />}
                            {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: '50%' }} />}
                            {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                            {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                            
                            {b.type === 'language_toggle' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: b.props.spacing || 12 }}>
                                    {(b.props.items || []).map((it: any, i: number) => {
                                        const isAllowed = !(it.levels && it.levels.length > 0 && student?.level && !it.levels.includes(student.level));
                                        const r = b.props.radius || 40
                                        const size = r * 2
                                        return (
                                            <div 
                                                key={i}  
                                                style={{ 
                                                    width: size, 
                                                    height: size, 
                                                    borderRadius: '50%', 
                                                    overflow: 'hidden', 
                                                    position: 'relative',
                                                    boxShadow: it.active ? '0 0 0 3px #6c5ce7' : '0 0 0 1px #ddd',
                                                    opacity: isAllowed ? 0.9 : 0.5
                                                }}
                                            >
                                                {it.logo ? <img src={it.logo} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: it.active ? 'brightness(1.1)' : 'brightness(0.6)' }} alt="" /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            
                            {b.type === 'dropdown' && (
                                <div style={{ width: b.props.width || 200 }}>
                                    <div style={{ fontSize: 10, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 2 }}>
                                        {b.props.dropdownNumber && `Dropdown #${b.props.dropdownNumber}`}
                                    </div>
                                    {b.props.label && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{b.props.label}</div>}
                                    <div style={{ 
                                        width: '100%', 
                                        minHeight: b.props.height || 32, 
                                        fontSize: b.props.fontSize || 12, 
                                        color: b.props.color || '#333', 
                                        padding: '4px 8px', 
                                        borderRadius: 4, 
                                        border: '1px solid #ccc',
                                        background: '#fff',
                                        wordWrap: 'break-word',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {(() => {
                                            const currentValue = b.props.dropdownNumber 
                                                ? assignment?.data?.[`dropdown_${b.props.dropdownNumber}`]
                                                : b.props.variableName ? assignment?.data?.[b.props.variableName] : ''
                                            return currentValue || 'Sélectionner...'
                                        })()}
                                    </div>
                                </div>
                            )}
                            
                            {b.type === 'dropdown_reference' && (
                                <div style={{ 
                                    color: b.props.color || '#333', 
                                    fontSize: b.props.fontSize || 12,
                                    width: b.props.width || 200,
                                    minHeight: b.props.height || 'auto',
                                    wordWrap: 'break-word',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {(() => {
                                        const dropdownNum = b.props.dropdownNumber || 1
                                        const value = assignment?.data?.[`dropdown_${dropdownNum}`]
                                        return value || `[Dropdown #${dropdownNum}]`
                                    })()}
                                </div>
                            )}
                            
                            {b.type === 'promotion_info' && (
                                <div style={{ 
                                    width: b.props.width || (b.props.field ? 150 : 300),
                                    height: b.props.height || (b.props.field ? 30 : 100),
                                    border: b.props.field ? 'none' : '1px solid #6c5ce7',
                                    padding: b.props.field ? 0 : 10,
                                    borderRadius: 8,
                                    fontSize: b.props.fontSize || 12,
                                    color: b.props.color || '#2d3436',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center'
                                }}>
                                    {(() => {
                                        const targetLevel = b.props.targetLevel || getNextLevel(student?.level || '')
                                        const promotions = assignment?.data?.promotions || []
                                        let promoData = promotions.find((p: any) => p.to === targetLevel)
                                        let promo = promoData ? { ...promoData } : null
                                        
                                        if (!promo) {
                                            const currentYear = new Date().getFullYear()
                                            const month = new Date().getMonth()
                                            const startYear = month >= 8 ? currentYear : currentYear - 1
                                            
                                            const isMidYearContext = b.props.period === 'mid-year'
                                            const displayYear = isMidYearContext ? `${startYear}/${startYear + 1}` : `${startYear + 1}/${startYear + 2}`

                                            promo = {
                                                year: displayYear,
                                                from: student?.level || '',
                                                to: targetLevel || '?',
                                                class: student?.className || ''
                                            }
                                        } else {
                                            // Enrich existing promo with current data if missing
                                            if (!promo.class && student?.className) promo.class = student.className
                                            if (!promo.from && student?.level) promo.from = student.level
                                        }

                                        if (promo) {
                                            if (!b.props.field) {
                                                return (
                                                    <>
                                                        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Passage en {promo.to}</div>
                                                        <div>{student?.firstName} {student?.lastName}</div>
                                                        <div style={{ fontSize: (b.props.fontSize || 12) * 0.8, color: '#666', marginTop: 8 }}>Année {promo.year}</div>
                                                    </>
                                                )
                                            } else if (b.props.field === 'level') {
                                                return <div style={{ fontWeight: 'bold' }}>Passage en {promo.to}</div>
                                            } else if (b.props.field === 'student') {
                                                return <div>{student?.firstName} {student?.lastName}</div>
                                            } else if (b.props.field === 'year') {
                                                return <div>{promo.year}</div>
                                            } else if (b.props.field === 'class') {
                                                const raw = promo.class || ''
                                                const parts = raw.split(/\s*[-\s]\s*/)
                                                const section = parts.length ? parts[parts.length - 1] : raw
                                                return <div>{section}</div>
                                            } else if (b.props.field === 'currentLevel') {
                                                return <div>{promo.from || ''}</div>
                                            }
                                        }
                                        return null
                                    })()}
                                </div>
                            )}
                            
                            {b.type === 'table' && (
                                <div style={{ display: 'inline-block', border: '1px solid #ddd' }}>
                                    {(b.props.cells || []).map((row: any[], ri: number) => (
                                        <div key={ri} style={{ display: 'flex' }}>
                                            {row.map((cell: any, ci: number) => (
                                                <div 
                                                    key={ci}
                                                    style={{ 
                                                        width: b.props.columnWidths?.[ci] || 100,
                                                        height: b.props.rowHeights?.[ri] || 40,
                                                        borderRight: ci < row.length - 1 ? '1px solid #ddd' : 'none',
                                                        borderBottom: ri < b.props.cells.length - 1 ? '1px solid #ddd' : 'none',
                                                        background: cell.fill || 'transparent',
                                                        padding: 15,
                                                        fontSize: cell.fontSize || 12,
                                                        color: cell.color || '#333',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {cell.text}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {b.type === 'qr' && (
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=${b.props.width || 120}x${b.props.height || 120}&data=${encodeURIComponent(b.props.url || '')}`}
                                    style={{ width: b.props.width || 120, height: b.props.height || 120 }}
                                    alt="QR Code"
                                />
                            )}
                            
                            {b.type === 'signature_box' && (
                                <div style={{ 
                                    width: b.props.width || 200, 
                                    height: b.props.height || 80, 
                                    border: '1px solid #000', 
                                    background: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    color: '#999'
                                }}>
                                    {signature ? '✓ Signé' : (b.props.label || 'Signature')}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
