import type { MapPoint, Rect } from './mapGeometry'

export const SHIELD_ZONE: Rect = { minX: 448, maxX: 551, minY: 446, maxY: 549 }

const northWest = [5, 3, 2, 1, 1]
const northEast = [5, 3, 2, 1]
const southEast = [5, 2, 1]

function row(y: number) {
  const north = SHIELD_ZONE.maxY - y
  const south = y - SHIELD_ZONE.minY
  return {
    minX: SHIELD_ZONE.minX + (northWest[north] ?? northWest[south] ?? 0),
    maxX: SHIELD_ZONE.maxX - (northEast[north] ?? southEast[south] ?? 0),
  }
}

export function intersectsShieldZone(bounds: Rect) {
  for (let y = Math.max(bounds.minY, SHIELD_ZONE.minY); y <= Math.min(bounds.maxY, SHIELD_ZONE.maxY); y++) {
    const { minX, maxX } = row(y)
    if (bounds.minX <= maxX && bounds.maxX >= minX) return true
  }
  return false
}

function edge(side: 'minX' | 'maxX', offset: number): MapPoint[] {
  let x = row(SHIELD_ZONE.maxY)[side] + offset
  const vertices = [{ x, y: SHIELD_ZONE.maxY + .5 }]
  for (let y = SHIELD_ZONE.maxY - 1; y >= SHIELD_ZONE.minY; y--) {
    const next = row(y)[side] + offset
    if (next === x) continue
    vertices.push({ x, y: y + .5 }, { x: next, y: y + .5 })
    x = next
  }
  vertices.push({ x, y: SHIELD_ZONE.minY - .5 })
  return vertices
}

export const SHIELD_ZONE_OUTLINE = [...edge('minX', -.5), ...edge('maxX', .5).reverse()]
