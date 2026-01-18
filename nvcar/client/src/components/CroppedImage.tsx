import React, { useEffect, useState } from 'react'

interface CropData {
  x: number
  y: number
  width: number
  height: number
  naturalWidth?: number
  naturalHeight?: number
}

interface CroppedImageProps {
  src: string
  displayWidth: number
  displayHeight: number
  cropData?: CropData
  borderRadius?: number
  alt?: string
  style?: React.CSSProperties
}

export const CroppedImage: React.FC<CroppedImageProps> = ({
  src,
  displayWidth,
  displayHeight,
  cropData,
  borderRadius = 8,
  alt = '',
  style = {}
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!cropData || (cropData.naturalWidth && cropData.naturalHeight)) return
    const img = new Image()
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = src
  }, [src, cropData])

  if (!cropData) {
    return (
      <img
        src={src}
        alt={alt}
        style={{
          width: displayWidth,
          height: displayHeight,
          borderRadius,
          objectFit: 'cover',
          ...style
        }}
      />
    )
  }

  const naturalWidth = cropData.naturalWidth || naturalSize?.width || displayWidth
  const naturalHeight = cropData.naturalHeight || naturalSize?.height || displayHeight
  const scale = displayWidth / cropData.width
  const imgWidth = naturalWidth * scale
  const imgHeight = naturalHeight * scale
  const offsetX = -cropData.x * scale
  const offsetY = -cropData.y * scale

  return (
    <div
      style={{
        width: displayWidth,
        height: displayHeight,
        borderRadius,
        overflow: 'hidden',
        position: 'relative',
        ...style
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          position: 'absolute',
          width: imgWidth,
          height: imgHeight,
          maxWidth: 'none',
          left: offsetX,
          top: offsetY
        }}
      />
    </div>
  )
}

export default CroppedImage
