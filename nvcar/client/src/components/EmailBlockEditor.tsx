import React, { useState, useCallback, useRef } from 'react'
import { Type, AlignLeft, Image, Minus, Square, MousePointer, Table2, Trash2, Copy, ChevronUp, ChevronDown, GripVertical, Columns, Plus, X, Upload } from 'lucide-react'
import './EmailBlockEditor.css'

// Types
export type BlockType = 'heading' | 'text' | 'image' | 'divider' | 'spacer' | 'button' | 'info-table' | 'columns'

export interface EmailBlock {
  id: string
  type: BlockType
  props: Record<string, any>
  children?: EmailBlock[][] // Used for 'columns' type
}

interface Props {
  blocks: EmailBlock[]
  onChange: (blocks: EmailBlock[], html: string) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

const BLOCK_TYPES: { type: BlockType; label: string; icon: any }[] = [
  { type: 'heading', label: 'Titre', icon: Type },
  { type: 'text', label: 'Texte', icon: AlignLeft },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'columns', label: 'Ligne / Colonnes', icon: Columns },
  { type: 'divider', label: 'Séparateur', icon: Minus },
  { type: 'spacer', label: 'Espace', icon: Square },
  { type: 'button', label: 'Bouton', icon: MousePointer },
  { type: 'info-table', label: 'Tableau Info', icon: Table2 },
]

const VARIABLES = [
  { key: '{{studentName}}', label: 'Nom élève' },
  { key: '{{yearName}}', label: 'Année' },
  { key: '{{level}}', label: 'Niveau' },
  { key: '{{className}}', label: 'Classe' },
  { key: '{{schoolName}}', label: 'École' },
]

function defaultProps(type: BlockType): Record<string, any> {
  switch (type) {
    case 'heading': return { text: 'Titre', fontSize: 24, fontWeight: '800', color: '#1e293b', alignment: 'center', bg: '' }
    case 'text': return { text: 'Votre texte ici...', fontSize: 16, color: '#334155', alignment: 'left', lineHeight: 1.6, bg: '' }
    case 'image': return { src: 'https://via.placeholder.com/560x120?text=Logo', alt: 'Image', imgWidth: 100, alignment: 'center' }
    case 'divider': return { borderColor: '#e2e8f0', borderWidth: 2 }
    case 'spacer': return { height: 24 }
    case 'button': return { buttonText: 'Cliquer ici', buttonUrl: '#', buttonColor: '#3b82f6', buttonTextColor: '#fff', borderRadius: 8, fontSize: 16, alignment: 'center' }
    case 'info-table': return { rows: [{ label: 'Année scolaire', value: '{{yearName}}' }, { label: 'Niveau', value: '{{level}}' }, { label: 'Classe', value: '{{className}}' }], tableBg: '#f8fafc', borderColor: '#e2e8f0', labelColor: '#64748b', valueColor: '#1e293b' }
    case 'columns': return { columnGap: 20, verticalAlign: 'top', padding: '10px 0' }
    default: return {}
  }
}

// Blocks → HTML
export function blocksToHtml(blocks: EmailBlock[]): string {
  const renderBlocks = (blks: EmailBlock[]): string => {
    return blks.map(b => {
      const p = b.props
      switch (b.type) {
        case 'heading':
          return `<div style="font-size:${p.fontSize||24}px;font-weight:${p.fontWeight||'800'};color:${p.color||'#1e293b'};text-align:${p.alignment||'center'};${p.bg?`background-color:${p.bg};`:''}padding:${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px;">${p.text||''}</div>`
        case 'text':
          return `<div style="font-size:${p.fontSize||16}px;color:${p.color||'#334155'};text-align:${p.alignment||'left'};line-height:${p.lineHeight||1.6};${p.bg?`background-color:${p.bg};`:''}padding:${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px;">${(p.text||'').replace(/\n/g,'<br/>')}</div>`
        case 'image':
          return `<div style="text-align:${p.alignment||'center'};padding:${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px;"><img src="${p.src||''}" alt="${p.alt||''}" style="max-width:${p.imgWidth||100}%;height:auto;display:inline-block;" /></div>`
        case 'divider':
          return `<hr style="border:none;border-top:${p.borderWidth||1}px solid ${p.borderColor||'#e2e8f0'};margin:12px 0;" />`
        case 'spacer':
          return `<div style="height:${p.height||20}px;"></div>`
        case 'button':
          return `<div style="text-align:${p.alignment||'center'};padding:12px 0;"><a href="${p.buttonUrl||'#'}" style="display:inline-block;padding:12px 28px;background:${p.buttonColor||'#3b82f6'};color:${p.buttonTextColor||'#fff'};border-radius:${p.borderRadius||8}px;font-size:${p.fontSize||16}px;font-weight:600;text-decoration:none;">${p.buttonText||'Button'}</a></div>`
        case 'info-table': {
          const rows = (p.rows || []).map((r: any) =>
            `<tr><td style="padding:6px 0;font-size:14px;color:${p.labelColor||'#64748b'};width:140px;">${r.label}</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:${p.valueColor||'#1e293b'};">${r.value}</td></tr>`
          ).join('')
          return `<div style="background:${p.tableBg||'#f8fafc'};border-radius:10px;padding:16px;border:1px solid ${p.borderColor||'#e2e8f0'};margin:8px 0;"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`
        }
        case 'columns': {
          const cols = (b.children || []).map(colBlocks => 
            `<td width="${Math.floor(100 / (b.children?.length || 1))}%" valign="${p.verticalAlign || 'top'}" style="padding:0 ${p.columnGap / 2 || 10}px;">${renderBlocks(colBlocks)}</td>`
          ).join('')
          return `<div style="padding:${p.padding || '10px 0'}"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>${cols}</tr></table></div>`
        }
        default: return ''
      }
    }).join('\n')
  }

  const innerHtml = renderBlocks(blocks)
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">\n${innerHtml}\n</div>`
}

export const DEFAULT_BLOCKS: EmailBlock[] = [
  { id: uid(), type: 'heading', props: { text: '{{schoolName}}', fontSize: 14, fontWeight: '600', color: '#4f46e5', alignment: 'left', bg: '' } },
  { id: uid(), type: 'heading', props: { text: 'Carnet Scolaire', fontSize: 24, fontWeight: '800', color: '#1e293b', alignment: 'left', bg: '' } },
  { id: uid(), type: 'divider', props: { borderColor: '#f1f5f9', borderWidth: 2 } },
  { id: uid(), type: 'text', props: { text: 'Bonjour,', fontSize: 16, color: '#334155', alignment: 'left', lineHeight: 1.6, bg: '' } },
  { id: uid(), type: 'text', props: { text: 'Nous vous prions de trouver ci-joint le carnet scolaire de :\n{{studentName}}', fontSize: 16, color: '#334155', alignment: 'left', lineHeight: 1.6, bg: '' } },
  { id: uid(), type: 'info-table', props: { rows: [{ label: 'Année scolaire', value: '{{yearName}}' }, { label: 'Niveau', value: '{{level}}' }, { label: 'Classe', value: '{{className}}' }], tableBg: '#f8fafc', borderColor: '#e2e8f0', labelColor: '#64748b', valueColor: '#1e293b' } },
]

export default function EmailBlockEditor({ blocks, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeColIdx, setActiveColIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<{ id: string | null; idx: number | null; col?: number }>({ id: null, idx: null })

  const findBlockRecursive = (blks: EmailBlock[], id: string): EmailBlock | null => {
    for (const b of blks) {
      if (b.id === id) return b
      if (b.children) {
        for (const col of b.children) {
          const found = findBlockRecursive(col, id)
          if (found) return found
        }
      }
    }
    return null
  }

  const selected = selectedId ? findBlockRecursive(blocks, selectedId) : null

  const emit = useCallback((next: EmailBlock[]) => {
    onChange(next, blocksToHtml(next))
  }, [onChange])

  const updateBlockRecursive = (blks: EmailBlock[], id: string, props: Record<string, any>): EmailBlock[] => {
    return blks.map(b => {
      if (b.id === id) return { ...b, props: { ...b.props, ...props } }
      if (b.children) {
        return { ...b, children: b.children.map(col => updateBlockRecursive(col, id, props)) }
      }
      return b
    })
  }

  const updateBlock = (id: string, props: Record<string, any>) => {
    emit(updateBlockRecursive(blocks, id, props))
  }

  const deleteBlockRecursive = (blks: EmailBlock[], id: string): EmailBlock[] => {
    return blks.filter(b => b.id !== id).map(b => {
      if (b.children) {
        return { ...b, children: b.children.map(col => deleteBlockRecursive(col, id)) }
      }
      return b
    })
  }

  const deleteBlock = (id: string) => {
    if (selectedId === id) setSelectedId(null)
    emit(deleteBlockRecursive(blocks, id))
  }

  const duplicateBlockRecursive = (blks: EmailBlock[], id: string): EmailBlock[] => {
    const idx = blks.findIndex(b => b.id === id)
    if (idx >= 0) {
      const copy = { ...blks[idx], id: uid(), props: { ...blks[idx].props } }
      if (copy.children) {
        copy.children = copy.children.map(col => col.map(child => ({ ...child, id: uid() })))
      }
      const next = [...blks]
      next.splice(idx + 1, 0, copy)
      return next
    }
    return blks.map(b => {
      if (b.children) {
        return { ...b, children: b.children.map(col => duplicateBlockRecursive(col, id)) }
      }
      return b
    })
  }

  const duplicateBlock = (id: string) => {
    emit(duplicateBlockRecursive(blocks, id))
  }

  const moveBlockRecursive = (blks: EmailBlock[], id: string, dir: -1 | 1): EmailBlock[] => {
    const idx = blks.findIndex(b => b.id === id)
    if (idx >= 0) {
      const target = idx + dir
      if (target < 0 || target >= blks.length) return blks
      const next = [...blks]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    }
    return blks.map(b => {
      if (b.children) {
        return { ...b, children: b.children.map(col => moveBlockRecursive(col, id, dir)) }
      }
      return b
    })
  }

  const moveBlock = (id: string, dir: -1 | 1) => {
    emit(moveBlockRecursive(blocks, id, dir))
  }


  // Drag & drop handlers
  const onPaletteDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('block-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onBlockDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('block-id', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDropZoneDragOver = (e: React.DragEvent, parentId: string | null, idx: number, col?: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('block-type') ? 'copy' : 'move'
    setDragOverIdx({ id: parentId, idx, col })
  }

  const insertBlockAtIdx = (blks: EmailBlock[], newBlock: EmailBlock, targetIdx: number): EmailBlock[] => {
    const next = [...blks]
    next.splice(targetIdx, 0, newBlock)
    return next
  }

  const onDropZoneDrop = (e: React.DragEvent, parentId: string | null, idx: number, col?: number) => {
    e.preventDefault()
    setDragOverIdx({ id: null, idx: null })
    const type = e.dataTransfer.getData('block-type') as BlockType
    const moveId = e.dataTransfer.getData('block-id')

    let blockToInsert: EmailBlock | null = null
    if (type) {
      blockToInsert = { id: uid(), type, props: defaultProps(type) }
      if (type === 'columns') blockToInsert.children = [[], []]
      setSelectedId(blockToInsert.id)
    } else if (moveId) {
      blockToInsert = findBlockRecursive(blocks, moveId)
      if (!blockToInsert) return
    }

    if (!blockToInsert) return

    // If it's a move, delete from old position first
    let nextState = moveId ? deleteBlockRecursive(blocks, moveId) : blocks

    if (parentId === null) {
      // Top level
      nextState = insertBlockAtIdx(nextState, blockToInsert, idx)
    } else {
      // Inside a column
      const updateChildren = (blks: EmailBlock[]): EmailBlock[] => {
        return blks.map(b => {
          if (b.id === parentId && b.children && col !== undefined) {
            const nextCols = [...b.children]
            nextCols[col] = insertBlockAtIdx(nextCols[col], blockToInsert!, idx)
            return { ...b, children: nextCols }
          }
          if (b.children) return { ...b, children: b.children.map(updateChildren) }
          return b
        })
      }
      nextState = updateChildren(nextState)
    }
    
    emit(nextState)
  }

  const addBlock = (type: BlockType) => {
    const newBlock: EmailBlock = { id: uid(), type, props: defaultProps(type) }
    if (type === 'columns') newBlock.children = [[], []]
    setSelectedId(newBlock.id)
    emit([...blocks, newBlock])
  }

  const addColumn = (parentId: string) => {
    const update = (blks: EmailBlock[]): EmailBlock[] => {
      return blks.map(b => {
        if (b.id === parentId && b.children) return { ...b, children: [...b.children, []] }
        if (b.children) return { ...b, children: b.children.map(update) }
        return b
      })
    }
    emit(update(blocks))
  }

  const convertToColumns = (id: string) => {
    const target = findBlockRecursive(blocks, id)
    if (!target || target.type === 'columns') return

    const newRow: EmailBlock = {
      id: uid(),
      type: 'columns',
      props: defaultProps('columns'),
      children: [[{ ...target }], []]
    }

    const update = (blks: EmailBlock[]): EmailBlock[] => {
      const idx = blks.findIndex(b => b.id === id)
      if (idx >= 0) {
        const next = [...blks]
        next[idx] = newRow
        return next
      }
      return blks.map(b => {
        if (b.children) return { ...b, children: b.children.map(update) }
        return b
      })
    }
    
    emit(update(blocks))
    setSelectedId(newRow.id)
  }

  const addBlockToCol = (parentId: string, col: number, type: BlockType) => {
    const newBlock = { id: uid(), type, props: defaultProps(type) }
    const update = (blks: EmailBlock[]): EmailBlock[] => {
      return blks.map(b => {
        if (b.id === parentId && b.children) {
          const nextCols = [...b.children]
          nextCols[col] = [...nextCols[col], newBlock]
          return { ...b, children: nextCols }
        }
        if (b.children) return { ...b, children: b.children.map(update) }
        return b
      })
    }
    emit(update(blocks))
    setSelectedId(newBlock.id)
  }

  const removeColumn = (parentId: string, idx: number) => {
    const update = (blks: EmailBlock[]): EmailBlock[] => {
      return blks.map(b => {
        if (b.id === parentId && b.children) {
          const nextCols = [...b.children]
          nextCols.splice(idx, 1)
          return { ...b, children: nextCols }
        }
        if (b.children) return { ...b, children: b.children.map(update) }
        return b
      })
    }
    emit(update(blocks))
  }

  const resizerRef = useRef<{ id: string, prop: string, startVal: number, startPos: number, direction: string } | null>(null)

  const handleResizeStart = (e: React.MouseEvent, id: string, prop: string, startVal: number, direction: 'top'|'bottom'|'left'|'right') => {
    e.preventDefault()
    e.stopPropagation()
    const isVertical = direction === 'top' || direction === 'bottom'
    resizerRef.current = { id, prop, startVal, startPos: isVertical ? e.clientY : e.clientX, direction }
    
    const move = (me: MouseEvent) => {
      if (!resizerRef.current) return
      const { id, prop, startVal, startPos, direction } = resizerRef.current
      const isVertical = direction === 'top' || direction === 'bottom'
      const currentPos = isVertical ? me.clientY : me.clientX
      
      let delta = currentPos - startPos
      if (direction === 'top' || direction === 'left') {
        delta = -delta // Reverse delta for top/left
      }
      
      let newVal = startVal + (prop === 'imgWidth' ? delta / 5 : delta)
      newVal = Math.max(prop === 'imgWidth' ? 10 : 0, newVal)
      if (prop === 'imgWidth') newVal = Math.min(100, newVal)
      
      updateBlock(id, { [prop]: Math.round(newVal) })
    }

    const end = () => {
      resizerRef.current = null
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', end)
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', end)
    document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
  }

  // Renderers
  const renderBlockPreview = (block: EmailBlock) => {
    const p = block.props
    switch (block.type) {
      case 'heading':
        return <div style={{ fontSize: p.fontSize, fontWeight: p.fontWeight, color: p.color, textAlign: p.alignment, background: p.bg || 'transparent', padding: `${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px` }}>{highlightVars(p.text)}</div>
      case 'text':
        return <div style={{ fontSize: p.fontSize, color: p.color, textAlign: p.alignment, lineHeight: p.lineHeight, background: p.bg || 'transparent', padding: `${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px`, whiteSpace: 'pre-wrap' }}>{highlightVars(p.text)}</div>
      case 'image':
        return <div style={{ textAlign: p.alignment, padding: `${p.paddingTop??8}px ${p.paddingRight??0}px ${p.paddingBottom??8}px ${p.paddingLeft??0}px` }}><img src={p.src} alt={p.alt} style={{ maxWidth: `${p.imgWidth}%`, height: 'auto' }} /></div>
      case 'divider':
        return <hr style={{ border: 'none', borderTop: `${p.borderWidth}px solid ${p.borderColor}`, margin: '12px 0' }} />
      case 'spacer':
        return <div style={{ height: p.height, background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)' }} />
      case 'button':
        return <div style={{ textAlign: p.alignment, padding: '12px 0' }}><span style={{ display: 'inline-block', padding: '12px 28px', background: p.buttonColor, color: p.buttonTextColor, borderRadius: p.borderRadius, fontSize: p.fontSize, fontWeight: 600 }}>{p.buttonText}</span></div>
      case 'info-table':
        return (
          <div style={{ background: p.tableBg, borderRadius: 10, padding: 16, border: `1px solid ${p.borderColor}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(p.rows || []).map((r: any, i: number) => (
                  <tr key={i}><td style={{ padding: '6px 0', fontSize: 14, color: p.labelColor, width: 140 }}>{r.label}</td><td style={{ padding: '6px 0', fontSize: 14, fontWeight: 700, color: p.valueColor }}>{highlightVars(r.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'columns':
        return (
          <div className="ebe-columns-preview" style={{ padding: p.padding }}>
            {selectedId === block.id && <div className="ebe-row-label">Ligne — {block.children?.length || 0} col.</div>}
            {block.children?.map((col, idx) => {
              const isActiveCol = selectedId === block.id && activeColIdx === idx
              return (
                <div
                  key={idx}
                  className={`ebe-column ${isActiveCol ? 'col-selected' : ''}`}
                  style={{ verticalAlign: p.verticalAlign, padding: `0 ${p.columnGap / 2}px` }}
                  onClick={e => { e.stopPropagation(); setSelectedId(block.id); setActiveColIdx(idx) }}
                >
                  <div className="ebe-col-header">
                    <span className="col-label">Col {idx + 1}</span>
                    <span className="col-actions">
                      <button type="button" title="Ajouter texte" onClick={e => { e.stopPropagation(); addBlockToCol(block.id, idx, 'text') }}><Plus size={12} /></button>
                      {(block.children?.length || 0) > 1 && (
                        <button type="button" className="danger-col" title="Supprimer colonne" onClick={e => { e.stopPropagation(); removeColumn(block.id, idx) }}><X size={12} /></button>
                      )}
                    </span>
                  </div>
                  <div className="ebe-column-inner">
                    {renderBlockList(col, block.id, idx)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      default: return null
    }
  }

  const renderBlockList = (blks: EmailBlock[], parentId: string | null, colIdx?: number) => (
    <div className={`ebe-block-list ${blks.length === 0 ? 'empty' : ''}`}>
      <DropZone parentId={parentId} idx={0} col={colIdx} />
      {blks.length === 0 && parentId !== null && (
        <div className="ebe-empty-col-hint">
          <div className="hint-text">Colonne vide</div>
          <div className="ebe-quick-type-bar">
            <button type="button" className="ebe-quick-type-btn" onClick={e => { e.stopPropagation(); addBlockToCol(parentId, colIdx!, 'heading') }}><Type size={11} /> Titre</button>
            <button type="button" className="ebe-quick-type-btn" onClick={e => { e.stopPropagation(); addBlockToCol(parentId, colIdx!, 'text') }}><AlignLeft size={11} /> Texte</button>
            <button type="button" className="ebe-quick-type-btn" onClick={e => { e.stopPropagation(); addBlockToCol(parentId, colIdx!, 'image') }}><Image size={11} /> Image</button>
            <button type="button" className="ebe-quick-type-btn" onClick={e => { e.stopPropagation(); addBlockToCol(parentId, colIdx!, 'button') }}><MousePointer size={11} /> Bouton</button>
          </div>
        </div>
      )}
      {blks.map((block, i) => (
        <React.Fragment key={block.id}>
          <div
            className={`ebe-block ${selectedId === block.id ? 'selected' : ''} ${block.type === 'columns' ? 'is-columns-block' : ''}`}
            onClick={e => { e.stopPropagation(); setSelectedId(block.id); if (block.type !== 'columns') setActiveColIdx(null) }}
            draggable
            onDragStart={e => { e.stopPropagation(); onBlockDragStart(e, block.id) }}
          >
            <div className="ebe-block-grip"><GripVertical size={14} /></div>
            <div className="ebe-block-content">{renderBlockPreview(block)}</div>
            
            {selectedId === block.id && (
              <>
                <div className="ebe-block-toolbar">
                  {parentId && (
                    <button 
                      title="Sélectionner la ligne parente" 
                      onClick={e => { e.stopPropagation(); setSelectedId(parentId) }}
                    >
                      <ChevronUp size={14} /> <span>Ligne parente</span>
                    </button>
                  )}
                  <button 
                    title="Ajouter une colonne" 
                    className="special" 
                    onClick={e => { 
                      e.stopPropagation(); 
                      if (block.type === 'columns') addColumn(block.id);
                      else convertToColumns(block.id);
                    }}
                  >
                    <Plus size={14} /> <span>Colonne +</span>
                  </button>
                  <button title="Monter" onClick={e => { e.stopPropagation(); moveBlock(block.id, -1) }}><ChevronUp size={14} /></button>
                  <button title="Descendre" onClick={e => { e.stopPropagation(); moveBlock(block.id, 1) }}><ChevronDown size={14} /></button>
                  <button title="Dupliquer" onClick={e => { e.stopPropagation(); duplicateBlock(block.id) }}><Copy size={14} /></button>
                  <button title="Supprimer" className="danger" onClick={e => { e.stopPropagation(); deleteBlock(block.id) }}><Trash2 size={14} /></button>
                </div>

                {/* Resize Handles */}
                {block.type === 'spacer' ? (
                  <>
                    <div className="ebe-resize-h-top" onMouseDown={e => handleResizeStart(e, block.id, 'height', block.props.height || 20, 'top')} />
                    <div className="ebe-resize-h-bottom" onMouseDown={e => handleResizeStart(e, block.id, 'height', block.props.height || 20, 'bottom')} />
                  </>
                ) : (
                  <>
                    <div className="ebe-resize-h-top" onMouseDown={e => handleResizeStart(e, block.id, 'paddingTop', block.props.paddingTop ?? 8, 'top')} />
                    <div className="ebe-resize-h-bottom" onMouseDown={e => handleResizeStart(e, block.id, 'paddingBottom', block.props.paddingBottom ?? 8, 'bottom')} />
                    <div className="ebe-resize-h-left" onMouseDown={e => handleResizeStart(e, block.id, 'paddingLeft', block.props.paddingLeft ?? 0, 'left')} />
                    {block.type !== 'image' && (
                      <div className="ebe-resize-h-right" onMouseDown={e => handleResizeStart(e, block.id, 'paddingRight', block.props.paddingRight ?? 0, 'right')} />
                    )}
                  </>
                )}
                
                {block.type === 'image' && (
                  <div className="ebe-resize-h-right img-width-handle" onMouseDown={e => handleResizeStart(e, block.id, 'imgWidth', block.props.imgWidth || 100, 'right')} />
                )}
              </>
            )}
          </div>
          <DropZone parentId={parentId} idx={i + 1} col={colIdx} />
        </React.Fragment>
      ))}
    </div>
  )

  const renderProperties = () => {
    if (!selected) return <div className="ebe-props-empty"><p>Cliquez sur un bloc pour modifier ses propriétés</p></div>
    const p = selected.props
    const set = (key: string, val: any) => updateBlock(selected.id, { [key]: val })

    return (
      <div className="ebe-props-content">
        <div className="ebe-props-title">{BLOCK_TYPES.find(t => t.type === selected.type)?.label}</div>

        {(selected.type === 'heading' || selected.type === 'text') && (
          <>
            <label>Contenu</label>
            <div className="ebe-var-bar">
              {VARIABLES.map(v => <button key={v.key} type="button" className="ebe-var-chip" onClick={() => set('text', (p.text || '') + v.key)}>{v.label}</button>)}
            </div>
            {selected.type === 'heading'
              ? <input className="ebe-input" value={p.text || ''} onChange={e => set('text', e.target.value)} />
              : <textarea className="ebe-textarea" rows={5} value={p.text || ''} onChange={e => set('text', e.target.value)} />
            }
            <label>Taille police</label>
            <input type="number" className="ebe-input" value={p.fontSize || 16} onChange={e => set('fontSize', +e.target.value)} />
            <label>Couleur</label>
            <div className="ebe-color-row"><input type="color" value={p.color || '#000000'} onChange={e => set('color', e.target.value)} /><input className="ebe-input" value={p.color || ''} onChange={e => set('color', e.target.value)} /></div>
            <label>Alignement</label>
            <div className="ebe-align-row">
              {(['left','center','right'] as const).map(a => <button key={a} className={`ebe-align-btn ${p.alignment === a ? 'active' : ''}`} onClick={() => set('alignment', a)}>{a === 'left' ? '◀' : a === 'center' ? '●' : '▶'}</button>)}
            </div>
            {selected.type === 'heading' && <>
              <label>Poids</label>
              <select className="ebe-input" value={p.fontWeight || '800'} onChange={e => set('fontWeight', e.target.value)}>
                <option value="400">Normal</option><option value="600">Semi-gras</option><option value="700">Gras</option><option value="800">Extra-gras</option>
              </select>
            </>}
            <label>Fond</label>
            <div className="ebe-color-row"><input type="color" value={p.bg || '#ffffff'} onChange={e => set('bg', e.target.value)} /><input className="ebe-input" value={p.bg || ''} onChange={e => set('bg', e.target.value)} placeholder="transparent" /></div>
          </>
        )}

        {selected.type === 'columns' && <>
          <label>Nombre de colonnes : {selected.children?.length}</label>
          <div className="ebe-cols-mgmt">
            <button className="ebe-add-col" onClick={() => addColumn(selected.id)}><Plus size={14} /> Ajouter colonne</button>
            <div className="ebe-cols-list">
              {selected.children?.map((_, i) => (
                <div key={i} className="ebe-col-item">
                  <span>Col {i + 1}</span>
                  <button onClick={() => removeColumn(selected.id, i)} disabled={selected.children && selected.children.length <= 1}>×</button>
                </div>
              ))}
            </div>
          </div>
          <label>Espace entre colonnes</label>
          <input type="range" min={0} max={40} value={p.columnGap || 20} onChange={e => set('columnGap', +e.target.value)} /><span>{p.columnGap || 20}px</span>
          <label>Alignement vertical</label>
          <select className="ebe-input" value={p.verticalAlign || 'top'} onChange={e => set('verticalAlign', e.target.value)}>
            <option value="top">Haut</option><option value="middle">Milieu</option><option value="bottom">Bas</option>
          </select>
        </>}

        {selected.type === 'image' && <>
          <label>URL de l'image</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input className="ebe-input" value={p.src || ''} onChange={e => set('src', e.target.value)} placeholder="https://..." />
            <label className="ebe-quick-add" style={{ margin: 0, padding: '8px', cursor: 'pointer', width: 'auto' }} title="Uploader une image">
              <Upload size={14} />
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.append('file', f);
                try {
                  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                  const r = await fetch('/media/upload?folder=email-templates', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd
                  });
                  const data = await r.json();
                  if (data?.url) {
                    set('src', data.url.startsWith('http') ? data.url : data.url);
                  }
                } catch (err) {
                  console.error('Upload failed', err);
                }
              }} />
            </label>
          </div>
          <label>Texte alternatif</label>
          <input className="ebe-input" value={p.alt || ''} onChange={e => set('alt', e.target.value)} />
          <label>Largeur (%)</label>
          <input type="range" min={10} max={100} value={p.imgWidth || 100} onChange={e => set('imgWidth', +e.target.value)} /><span>{p.imgWidth || 100}%</span>
          <label>Alignement</label>
          <div className="ebe-align-row">
            {(['left','center','right'] as const).map(a => <button key={a} className={`ebe-align-btn ${p.alignment === a ? 'active' : ''}`} onClick={() => set('alignment', a)}>{a === 'left' ? '◀' : a === 'center' ? '●' : '▶'}</button>)}
          </div>
        </>}

        {selected.type === 'divider' && <>
          <label>Couleur</label>
          <div className="ebe-color-row"><input type="color" value={p.borderColor || '#e2e8f0'} onChange={e => set('borderColor', e.target.value)} /><input className="ebe-input" value={p.borderColor || ''} onChange={e => set('borderColor', e.target.value)} /></div>
          <label>Épaisseur</label>
          <input type="number" className="ebe-input" min={1} max={10} value={p.borderWidth || 1} onChange={e => set('borderWidth', +e.target.value)} />
        </>}

        {selected.type === 'spacer' && <>
          <label>Hauteur (px)</label>
          <input type="range" min={4} max={80} value={p.height || 20} onChange={e => set('height', +e.target.value)} /><span>{p.height || 20}px</span>
        </>}

        {selected.type === 'button' && <>
          <label>Texte</label>
          <input className="ebe-input" value={p.buttonText || ''} onChange={e => set('buttonText', e.target.value)} />
          <label>URL</label>
          <input className="ebe-input" value={p.buttonUrl || ''} onChange={e => set('buttonUrl', e.target.value)} />
          <label>Couleur fond</label>
          <div className="ebe-color-row"><input type="color" value={p.buttonColor || '#3b82f6'} onChange={e => set('buttonColor', e.target.value)} /><input className="ebe-input" value={p.buttonColor || ''} onChange={e => set('buttonColor', e.target.value)} /></div>
          <label>Couleur texte</label>
          <div className="ebe-color-row"><input type="color" value={p.buttonTextColor || '#ffffff'} onChange={e => set('buttonTextColor', e.target.value)} /><input className="ebe-input" value={p.buttonTextColor || ''} onChange={e => set('buttonTextColor', e.target.value)} /></div>
          <label>Rayon bordure</label>
          <input type="range" min={0} max={30} value={p.borderRadius || 8} onChange={e => set('borderRadius', +e.target.value)} /><span>{p.borderRadius || 8}px</span>
          <label>Alignement</label>
          <div className="ebe-align-row">
            {(['left','center','right'] as const).map(a => <button key={a} className={`ebe-align-btn ${p.alignment === a ? 'active' : ''}`} onClick={() => set('alignment', a)}>{a === 'left' ? '◀' : a === 'center' ? '●' : '▶'}</button>)}
          </div>
        </>}

        {selected.type === 'info-table' && <>
          <label>Lignes</label>
          {(p.rows || []).map((r: any, i: number) => (
            <div key={i} className="ebe-table-row-edit">
              <input className="ebe-input sm" value={r.label} placeholder="Label" onChange={e => {
                const rows = [...(p.rows || [])]; rows[i] = { ...rows[i], label: e.target.value }; set('rows', rows)
              }} />
              <input className="ebe-input sm" value={r.value} placeholder="Valeur / {{var}}" onChange={e => {
                const rows = [...(p.rows || [])]; rows[i] = { ...rows[i], value: e.target.value }; set('rows', rows)
              }} />
              <button className="ebe-row-del" onClick={() => { const rows = [...(p.rows || [])]; rows.splice(i, 1); set('rows', rows) }}>×</button>
            </div>
          ))}
          <button className="ebe-add-row" onClick={() => set('rows', [...(p.rows || []), { label: 'Label', value: 'Valeur' }])}>+ Ajouter ligne</button>
          <label>Fond tableau</label>
          <div className="ebe-color-row"><input type="color" value={p.tableBg || '#f8fafc'} onChange={e => set('tableBg', e.target.value)} /><input className="ebe-input" value={p.tableBg || ''} onChange={e => set('tableBg', e.target.value)} /></div>
        </>}
      </div>
    )
  }

  const DropZone = ({ parentId, idx, col }: { parentId: string | null; idx: number; col?: number }) => (
    <div
      className={`ebe-dropzone ${dragOverIdx.id === parentId && dragOverIdx.idx === idx && dragOverIdx.col === col ? 'active' : ''}`}
      onDragOver={e => onDropZoneDragOver(e, parentId, idx, col)}
      onDragLeave={() => setDragOverIdx({ id: null, idx: null })}
      onDrop={e => onDropZoneDrop(e, parentId, idx, col)}
    />
  )

  return (
    <div className="ebe-root">
      {/* Left: Palette */}
      <div className="ebe-palette">
        <div className="ebe-palette-title">Blocs</div>
        {BLOCK_TYPES.map(bt => (
          <div key={bt.type} className="ebe-palette-item" draggable onDragStart={e => onPaletteDragStart(e, bt.type)} onClick={() => addBlock(bt.type)}>
            <bt.icon size={18} />
            <span>{bt.label}</span>
          </div>
        ))}
      </div>

      {/* Center: Canvas */}
      <div className="ebe-canvas-wrap" onClick={() => { setSelectedId(null); setActiveColIdx(null) }}>
        <div className="ebe-canvas" onClick={e => e.stopPropagation()}>
          {blocks.length === 0 && (
            <div className="ebe-canvas-empty">
              <p>Glissez un bloc ici ou cliquez dans le panneau de gauche</p>
            </div>
          )}
          {renderBlockList(blocks, null)}
        </div>
      </div>

      {/* Right: Properties */}
      <div className="ebe-props">
        <div className="ebe-props-header">Propriétés</div>
        {renderProperties()}
      </div>
    </div>
  )
}

function highlightVars(text: string): React.ReactNode {
  if (!text) return ''
  const parts = text.split(/({{[^}]+}})/)
  return parts.map((p, i) =>
    p.startsWith('{{') ? <span key={i} className="ebe-var-highlight">{p}</span> : p
  )
}
