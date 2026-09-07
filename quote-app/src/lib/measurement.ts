import { ScaleCalibration } from '../types/project'

// All geometry comes in as raw image-pixel coordinates from the canvas.
// Nothing here means anything in the real world until a ScaleCalibration
// has been established for the floor plan (see calibrate mode in the canvas).
// Carried over unchanged from the prototype (LuxeQuoteApp) — this part was already right.

export function pixelDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

export function polylineLengthPx(points: number[]): number {
  let total = 0
  for (let i = 0; i < points.length - 2; i += 2) {
    total += pixelDistance(points[i], points[i + 1], points[i + 2], points[i + 3])
  }
  return total
}

// Shoelace formula
export function polygonAreaPx(points: number[]): number {
  let area = 0
  const n = points.length / 2
  for (let i = 0; i < n; i++) {
    const x1 = points[i * 2]
    const y1 = points[i * 2 + 1]
    const j = (i + 1) % n
    const x2 = points[j * 2]
    const y2 = points[j * 2 + 1]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

export function realFeetPerPixel(scale: ScaleCalibration): number {
  const realLengthFeet = scale.unit === 'in' ? scale.realLength / 12 : scale.realLength
  return realLengthFeet / scale.pixelLength
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function areaSqFt(points: number[], scale: ScaleCalibration): number {
  const ftPerPx = realFeetPerPixel(scale)
  return round1(polygonAreaPx(points) * ftPerPx * ftPerPx)
}

export function lengthLinearFt(points: number[], scale: ScaleCalibration): number {
  const ftPerPx = realFeetPerPixel(scale)
  return round1(polylineLengthPx(points) * ftPerPx)
}

export function spanInches(points: number[], scale: ScaleCalibration): number {
  const ftPerPx = realFeetPerPixel(scale)
  return round1(pixelDistance(points[0], points[1], points[2], points[3]) * ftPerPx * 12)
}

// Standard ray-casting point-in-polygon test — used to associate a standalone trace
// (or a printed dimension label) with whichever room polygon contains it.
export function pointInPolygon(x: number, y: number, points: number[]): boolean {
  let inside = false
  const n = points.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2]
    const yi = points[i * 2 + 1]
    const xj = points[j * 2]
    const yj = points[j * 2 + 1]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
