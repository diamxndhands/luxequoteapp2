// Every image the app stores — a logo, a room photo — competes for the same few
// megabytes of localStorage as the floor plans themselves, and a phone camera file is
// two orders of magnitude bigger than what any of these are displayed at. Downscaling
// on the way in is what makes storing them viable at all. Ported unchanged from the
// prototype.

export interface ImageSize {
  width: number
  height: number
}

export function loadImageSize(dataUrl: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = dataUrl
  })
}

// Fits the image inside maxEdge x maxEdge without cropping, then re-encodes as JPEG.
// PNG is kept for logos (transparency matters on a letterhead); photos go to JPEG,
// which is roughly a tenth of the size at quality 0.72 with no visible loss at these
// dimensions.
export function downscaleImage(
  file: File,
  { maxEdge = 1280, quality = 0.72, keepAlpha = false }: { maxEdge?: number; quality?: number; keepAlpha?: boolean } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read image'))
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
        const width = Math.max(1, Math.round(img.naturalWidth * scale))
        const height = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // No 2D context (very old browser, or a blocked canvas): the original data URL
          // is still usable, just larger than we would like.
          resolve(reader.result as string)
          return
        }
        if (!keepAlpha) {
          // JPEG has no alpha; without this a transparent source composites onto black.
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
