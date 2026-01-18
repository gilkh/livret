import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'

interface ImageCropperProps {
  imageUrl: string
  initialCrop?: { x: number; y: number; width: number; height: number }
  aspectRatio?: number
  onCropComplete: (cropData: { x: number; y: number; width: number; height: number }) => void
  onCancel: () => void
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageUrl,
  initialCrop,
  aspectRatio,
  onCropComplete,
  onCancel
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop)
  }, [])

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom)
  }, [])

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = () => {
    if (croppedAreaPixels) {
      onCropComplete({
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height
      })
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '16px 24px',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #333'
      }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>
          ✂️ Recadrer l'image
        </h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            ✓ Appliquer
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspectRatio}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteHandler}
        />
      </div>

      <div style={{
        padding: '16px 24px',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        borderTop: '1px solid #333'
      }}>
        <span style={{ color: '#aaa', fontSize: 13 }}>Zoom:</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: 200 }}
        />
        <span style={{ color: '#fff', fontSize: 13, minWidth: 40 }}>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}

export default ImageCropper
