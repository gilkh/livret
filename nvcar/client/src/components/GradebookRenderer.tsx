import React from 'react'

type Block = { type: string; props: any }
type Page = { title?: string; bgColor?: string; excludeFromPdf?: boolean; blocks: Block[] }
type Template = { _id?: string; name: string; pages: Page[] }
type Student = { _id: string; firstName: string; lastName: string; level?: string; dateOfBirth: Date; className?: string }
type Assignment = { _id: string; status: string; data?: any }

const pageWidth = 800
const pageHeight = 1120

interface GradebookRendererProps {
    template: Template
    student: Student
    assignment: Assignment
    signature?: any
    finalSignature?: any
    visiblePages?: number[]
}

export const GradebookRenderer: React.FC<GradebookRendererProps> = ({ template, student, assignment, signature, finalSignature, visiblePages }) => {
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

    const getBlockLevel = (b: Block) => {
        if (b.props.level) return b.props.level
        const label = (b.props.label || '').toUpperCase()
        if (/\bPS\b/.test(label)) return 'PS'
        if (/\bMS\b/.test(label)) return 'MS'
        if (/\bGS\b/.test(label)) return 'GS'
        if (/\bEB1\b/.test(label)) return 'EB1'
        if (/\bKG1\b/.test(label)) return 'KG1'
        if (/\bKG2\b/.test(label)) return 'KG2'
        if (/\bKG3\b/.test(label)) return 'KG3'
        return null
    }

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
            {template.pages.map((page, originalPageIdx) => ({ page, originalPageIdx }))
                .filter(({ page, originalPageIdx }) => 
                    !page.excludeFromPdf && 
                    (!visiblePages || visiblePages.includes(originalPageIdx))
                )
                .map(({ page, originalPageIdx }, pageIdx) => (
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
                        margin: '0 auto',
                        marginBottom: 20,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}
                >
                    {page.blocks.map((b, blockIdx) => (
                        <div key={blockIdx} style={{ position: 'absolute', left: b.props.x || 0, top: b.props.y || 0, zIndex: b.props.z ?? blockIdx }}>
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
                            {b.type === 'rect' && <div style={{ width: b.props.width, height: b.props.height, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: b.props.radius || 8 }} />}
                            {b.type === 'circle' && <div style={{ width: (b.props.radius || 60) * 2, height: (b.props.radius || 60) * 2, background: b.props.color, border: b.props.stroke ? `${b.props.strokeWidth || 1}px solid ${b.props.stroke}` : 'none', borderRadius: '50%' }} />}
                            {b.type === 'line' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#b2bec3' }} />}
                            {b.type === 'arrow' && <div style={{ width: b.props.x2 || 100, height: b.props.strokeWidth || 2, background: b.props.stroke || '#6c5ce7', position: 'relative' }}><div style={{ position: 'absolute', right: 0, top: -6, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `12px solid ${b.props.stroke || '#6c5ce7'}` }} /></div>}
                            
                            {b.type === 'language_toggle' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: b.props.spacing || 12 }}>
                                    {(() => {
                                        // Try both keys: with originalPageIdx and with current pageIdx
                                        // This handles cases where versioning might have shifted indices or not
                                        const toggleKeyOriginal = `language_toggle_${originalPageIdx}_${blockIdx}`
                                        const toggleKeyCurrent = `language_toggle_${pageIdx}_${blockIdx}`
                                        
                                        const items = assignment?.data?.[toggleKeyOriginal] || 
                                                      assignment?.data?.[toggleKeyCurrent] || 
                                                      b.props.items || []
                                        
                                        return items.map((it: any, i: number) => {
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
                                        })
                                    })()}
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
                                        // Level filtering: if block has a specific level, check if it matches student's level
                                        if (b.props.level && student?.level && b.props.level !== student.level) {
                                            return null
                                        }

                                        // Period filtering
                                        if (b.props.period === 'mid-year' && !signature && !b.props.field?.includes('signature')) {
                                            // If marked for mid-year but no mid-year signature, hide it
                                            return null
                                        }
                                        if (b.props.period === 'end-year' && !finalSignature && !b.props.field?.includes('signature')) {
                                            // If marked for end-year but no end-year signature, hide it
                                            return null
                                        }

                                        // Target Level filtering: only show if student is in the level preceding targetLevel
                                        if (b.props.targetLevel && student?.level) {
                                            const next = getNextLevel(student.level)
                                            if (next !== b.props.targetLevel) return null
                                        }

                                        // Simple fields that don't need promotion data
                                        if (b.props.field === 'student') return <div>{student?.firstName} {student?.lastName}</div>
                                        if (b.props.field === 'currentLevel') return <div>{student?.level}</div>

                                        const targetLevel = b.props.targetLevel || getNextLevel(student?.level || '')
                                        const promotions = assignment?.data?.promotions || []
                                        let promoData = promotions.find((p: any) => p.to === targetLevel)
                                        let promo = promoData ? { ...promoData } : null

                                        // Fallback: If no promo record, show predictive info
                                        if (!promo) {
                                            const currentYear = new Date().getFullYear()
                                            const month = new Date().getMonth()
                                            const startYear = month >= 8 ? currentYear : currentYear - 1
                                            
                                            // For Mid-Year, "Year" usually refers to Current School Year
                                            // For End-Year, "Year" usually refers to Next School Year (for promotion)
                                            // Default to Next Year for promotion context, unless period is mid-year
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
                                                // If it's purely informational (e.g. "Passage en MS"), show it
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
                                                        padding: 4,
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
                                    color: '#999',
                                    // Hide if level doesn't match
                                    ...((getBlockLevel(b) && student?.level && getBlockLevel(b) !== student.level) ? { display: 'none' } : {})
                                }}>
                                    {b.props.period === 'end-year' ? (
                                        finalSignature?.signatureUrl ? (
                                            <img src={finalSignature.signatureUrl} alt="Signature Fin Année" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                                        ) : (
                                            finalSignature ? '✓ Signé Fin Année' : (b.props.label || 'Signature Fin Année')
                                        )
                                    ) : (
                                        signature?.signatureUrl ? (
                                            <img src={signature.signatureUrl} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                                        ) : (
                                            signature ? '✓ Signé' : (b.props.label || 'Signature')
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
