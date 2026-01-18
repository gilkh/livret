import React, { useState, useRef, useEffect } from 'react'

interface CropData {
  x: number
  y: number
  width: number
  height: number
  naturalWidth?: number
  naturalHeight?: number
}

interface ImageCropOverlayProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  initialCrop?: CropData
  onApply: (cropData: CropData) => void
  onCancel: () => void
}

export const ImageCropOverlay: React.FC<ImageCropOverlayProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  initialCrop,
  onApply,
  onCancel
}) => {
  const [crop, setCrop] = useState<CropData | null>(initialCrop || null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const startPos = useRef<{ x: number; y: number; crop: CropData } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      setNaturalSize({ width: nw, height: nh })
      if (initialCrop) {
        setCrop({
          x: initialCrop.x,
          y: initialCrop.y,
          width: initialCrop.width,
          height: initialCrop.height,
          naturalWidth: initialCrop.naturalWidth ?? nw,
          naturalHeight: initialCrop.naturalHeight ?? nh
        })
        return
      }
      setCrop({ x: 0, y: 0, width: nw, height: nh, naturalWidth: nw, naturalHeight: nh })
    }
    img.src = imageUrl
  }, [imageUrl, initialCrop])

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation()
    e.preventDefault()
    if (!crop) return
    setDragging(handle)
    startPos.current = { x: e.clientX, y: e.clientY, crop: { ...crop } }
  }

  useEffect(() => {
    if (!dragging || !naturalSize || !startPos.current) return

    const scale = imageWidth / naturalSize.width

    const handleMouseMove = (e: MouseEvent) => {
      if (!startPos.current) return
      const dx = (e.clientX - startPos.current.x) / scale
      const dy = (e.clientY - startPos.current.y) / scale
      const prev = startPos.current.crop

      let newCrop = { ...prev }
      const minSize = 20 / scale

      switch (dragging) {
        case 'n':
          newCrop.y = Math.max(0, Math.min(prev.y + dy, prev.y + prev.height - minSize))
          newCrop.height = prev.height - (newCrop.y - prev.y)
          break
        case 's':
          newCrop.height = Math.max(minSize, Math.min(prev.height + dy, naturalSize.height - prev.y))
          break
        case 'w':
          newCrop.x = Math.max(0, Math.min(prev.x + dx, prev.x + prev.width - minSize))
          newCrop.width = prev.width - (newCrop.x - prev.x)
          break
        case 'e':
          newCrop.width = Math.max(minSize, Math.min(prev.width + dx, naturalSize.width - prev.x))
          break
        case 'nw':
          newCrop.x = Math.max(0, Math.min(prev.x + dx, prev.x + prev.width - minSize))
          newCrop.y = Math.max(0, Math.min(prev.y + dy, prev.y + prev.height - minSize))
          newCrop.width = prev.width - (newCrop.x - prev.x)
          newCrop.height = prev.height - (newCrop.y - prev.y)
          break
        case 'ne':
          newCrop.y = Math.max(0, Math.min(prev.y + dy, prev.y + prev.height - minSize))
          newCrop.width = Math.max(minSize, Math.min(prev.width + dx, naturalSize.width - prev.x))
          newCrop.height = prev.height - (newCrop.y - prev.y)
          break
        case 'sw':
          newCrop.x = Math.max(0, Math.min(prev.x + dx, prev.x + prev.width - minSize))
          newCrop.width = prev.width - (newCrop.x - prev.x)
          newCrop.height = Math.max(minSize, Math.min(prev.height + dy, naturalSize.height - prev.y))
          break
        case 'se':
          newCrop.width = Math.max(minSize, Math.min(prev.width + dx, naturalSize.width - prev.x))
          newCrop.height = Math.max(minSize, Math.min(prev.height + dy, naturalSize.height - prev.y))
          break
      }

      setCrop({
        ...newCrop,
        naturalWidth: prev.naturalWidth ?? naturalSize.width,
        naturalHeight: prev.naturalHeight ?? naturalSize.height
      })
    }

    const handleMouseUp = () => {
      setDragging(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, naturalSize, imageWidth])

  if (!naturalSize || !crop) return null

  const scale = imageWidth / naturalSize.width
  const displayCrop = {
    x: crop.x * scale,
    y: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale
  }

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    background: '#fff',
    border: '2px solid #667eea',
    borderRadius: 2,
    zIndex: 10,
    cursor
  })

  const cornerSize = 10
  const edgeThickness = 6

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: imageWidth, height: imageHeight, pointerEvents: 'none' }}>
      {/* Darkened areas outside crop */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: imageWidth, height: displayCrop.y, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', top: displayCrop.y, left: 0, width: displayCrop.x, height: displayCrop.height, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', top: displayCrop.y, left: displayCrop.x + displayCrop.width, width: imageWidth - displayCrop.x - displayCrop.width, height: displayCrop.height, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', top: displayCrop.y + displayCrop.height, left: 0, width: imageWidth, height: imageHeight - displayCrop.y - displayCrop.height, background: 'rgba(0,0,0,0.5)' }} />

      {/* Crop border */}
      <div style={{
        position: 'absolute',
        top: displayCrop.y,
        left: displayCrop.x,
        width: displayCrop.width,
        height: displayCrop.height,
        border: '2px dashed #667eea',
        boxSizing: 'border-box',
        pointerEvents: 'none'
      }} />

      {/* Corner handles */}
      <div style={{ ...handleStyle('nw-resize'), top: displayCrop.y - cornerSize / 2, left: displayCrop.x - cornerSize / 2, width: cornerSize, height: cornerSize, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'nw')} />
      <div style={{ ...handleStyle('ne-resize'), top: displayCrop.y - cornerSize / 2, left: displayCrop.x + displayCrop.width - cornerSize / 2, width: cornerSize, height: cornerSize, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'ne')} />
      <div style={{ ...handleStyle('sw-resize'), top: displayCrop.y + displayCrop.height - cornerSize / 2, left: displayCrop.x - cornerSize / 2, width: cornerSize, height: cornerSize, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'sw')} />
      <div style={{ ...handleStyle('se-resize'), top: displayCrop.y + displayCrop.height - cornerSize / 2, left: displayCrop.x + displayCrop.width - cornerSize / 2, width: cornerSize, height: cornerSize, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'se')} />

      {/* Edge handles */}
      <div style={{ ...handleStyle('n-resize'), top: displayCrop.y - edgeThickness / 2, left: displayCrop.x + displayCrop.width / 2 - 15, width: 30, height: edgeThickness, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'n')} />
      <div style={{ ...handleStyle('s-resize'), top: displayCrop.y + displayCrop.height - edgeThickness / 2, left: displayCrop.x + displayCrop.width / 2 - 15, width: 30, height: edgeThickness, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 's')} />
      <div style={{ ...handleStyle('w-resize'), top: displayCrop.y + displayCrop.height / 2 - 15, left: displayCrop.x - edgeThickness / 2, width: edgeThickness, height: 30, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'w')} />
      <div style={{ ...handleStyle('e-resize'), top: displayCrop.y + displayCrop.height / 2 - 15, left: displayCrop.x + displayCrop.width - edgeThickness / 2, width: edgeThickness, height: 30, pointerEvents: 'auto' }} onMouseDown={e => handleMouseDown(e, 'e')} />

      {/* Action buttons */}
      <div style={{
        position: 'absolute',
        top: displayCrop.y + displayCrop.height + 8,
        left: displayCrop.x + displayCrop.width / 2,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        pointerEvents: 'auto'
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel() }}
          style={{
            padding: '6px 12px',
            background: '#666',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500
          }}
        >
          Annuler
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onApply(crop) }}
          style={{
            padding: '6px 12px',
            background: '#667eea',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600
          }}
        >
          ✓ Appliquer
        </button>
      </div>
    </div>
  )
}

export default ImageCropOverlay
