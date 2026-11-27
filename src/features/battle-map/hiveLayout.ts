import type { HivePlan, Player } from '../../types'
import { MAX_PLAYERS } from '../players/constants'
import { FIXED_BUILDINGS, MAP_MAX, MAP_MIN, fixedBuildingFootprint, overlaps, type MapPoint, type Rect } from './mapGeometry'

export type HiveSettings = Pick<HivePlan, 'layout' | 'bounds' | 'chamber'>
type Placement = HivePlan['placements'][number]
export const DEFAULT_HIVE: HiveSettings = {
  layout: 'compact',
  bounds: { minX: 490, maxX: 536, minY: 399, maxY: 445 },
  chamber: { x: 512, y: 421 },
}

const obstacles = FIXED_BUILDINGS.map(building => ({
  name: building.name,
  bounds: fixedBuildingFootprint(building),
}))
const contains = (outer: Rect, inner: Rect) =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
  inner.minY >= outer.minY && inner.maxY <= outer.maxY
export const chamberBounds = ({ x, y }: MapPoint): Rect =>
  ({ minX: x, maxX: x + 3, minY: y, maxY: y + 3 })
export const shelterBounds = ({ x, y }: MapPoint): Rect =>
  ({ minX: x - 1, maxX: x + 1, minY: y - 1, maxY: y + 1 })
export const boundsBetween = (start: MapPoint, end: MapPoint): Rect => ({
  minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x),
  minY: Math.min(start.y, end.y), maxY: Math.max(start.y, end.y),
})
export const defaultChamber = (bounds: Rect): MapPoint => ({
  x: Math.floor((bounds.minX + bounds.maxX - 3) / 2),
  y: Math.floor((bounds.minY + bounds.maxY - 3) / 2),
})

export type HiveAreaHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 }
export type HiveAreaChange = { bounds: Rect; offset?: MapPoint }

export function hiveAreaHandle(bounds: Rect, point: MapPoint, tolerance: MapPoint): HiveAreaHandle | undefined {
  const { minX, maxX, minY, maxY } = bounds
  if (point.x < minX - .5 - tolerance.x || point.x > maxX + .5 + tolerance.x ||
    point.y < minY - .5 - tolerance.y || point.y > maxY + .5 + tolerance.y) return
  const edge = (value: number, low: number, high: number, margin: number) => {
    const left = Math.abs(value - low + .5), right = Math.abs(value - high - .5)
    return Math.min(left, right) > margin ? 0 : left <= right ? -1 : 1
  }
  return { x: edge(point.x, minX, maxX, tolerance.x), y: edge(point.y, minY, maxY, tolerance.y) }
}

export function adjustHiveArea(bounds: Rect, handle: HiveAreaHandle, delta: MapPoint): HiveAreaChange {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const { minX, maxX, minY, maxY } = bounds
  if (!handle.x && !handle.y) {
    const x = clamp(delta.x, MAP_MIN - minX, MAP_MAX - maxX)
    const y = clamp(delta.y, MAP_MIN - minY, MAP_MAX - maxY)
    return { bounds: { minX: minX + x, maxX: maxX + x, minY: minY + y, maxY: maxY + y }, offset: { x, y } }
  }
  return { bounds: {
    minX: handle.x === -1 ? clamp(minX + delta.x, MAP_MIN, maxX - 3) : minX,
    maxX: handle.x === 1 ? clamp(maxX + delta.x, minX + 3, MAP_MAX) : maxX,
    minY: handle.y === -1 ? clamp(minY + delta.y, MAP_MIN, maxY - 3) : minY,
    maxY: handle.y === 1 ? clamp(maxY + delta.y, minY + 3, MAP_MAX) : maxY,
  } }
}

export function transformHive(plan: Pick<HivePlan, 'layout' | 'chamber' | 'placements'>, change: HiveAreaChange) {
  const offset = change.offset ?? { x: 0, y: 0 }
  const shift = (point: MapPoint) => ({ x: point.x + offset.x, y: point.y + offset.y })
  const chamber = shift(plan.chamber)
  const settings = { layout: plan.layout, bounds: change.bounds, chamber }
  const placements = plan.placements.map(placement => ({ ...placement, ...shift(placement) }))
  const canKeepPlacements = !hiveSettingsError(settings) && placements.every(placement => {
    const area = shelterBounds(placement)
    return contains(change.bounds, area) && !obstacles.some(obstacle => overlaps(area, obstacle.bounds))
  })
  return {
    settings: contains(change.bounds, chamberBounds(chamber)) ? settings : { ...settings, chamber: defaultChamber(change.bounds) },
    placements,
    canKeepPlacements,
  }
}

export function hiveSettingsError(settings: HiveSettings) {
  const { bounds, chamber } = settings
  if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, chamber.x, chamber.y].every(Number.isInteger) ||
    bounds.minX < MAP_MIN || bounds.maxX > MAP_MAX || bounds.minY < MAP_MIN || bounds.maxY > MAP_MAX)
    return 'Use whole map coordinates from 0 to 999.'
  if (bounds.maxX - bounds.minX < 3 || bounds.maxY - bounds.minY < 3)
    return 'Draw an area at least 4 × 4 tiles wide.'
  const chamberArea = chamberBounds(chamber)
  if (!contains(bounds, chamberArea)) return 'Place all 4 × 4 Frankenstein tiles inside the hive area.'
  const obstacle = obstacles.find(({ bounds }) => overlaps(chamberArea, bounds))
  return obstacle ? `Frankenstein overlaps ${obstacle.name}.` : null
}

export const distanceFromChamber = (point: MapPoint, chamber: MapPoint) =>
  Math.hypot(point.x - chamber.x - 1.5, point.y - chamber.y - 1.5)

export function generateHive(settings: HiveSettings, players: readonly Player[]) {
  const error = hiveSettingsError(settings)
  if (error) return { error, placements: [], unplaced: [] }
  const { layout, bounds, chamber } = settings
  const reserved = chamberBounds(chamber)
  const candidates: { x: number; y: number; shape: number; distance: number }[] = []
  const rowStart = chamber.y + 1 - 3 * Math.floor((chamber.y - bounds.minY) / 3)
  const columnStart = chamber.x + 1 - 3 * Math.floor((chamber.x - bounds.minX) / 3)
  for (let x = columnStart, column = 0; x < bounds.maxX; x += layout === 'lanes' && column % 2 === 1 ? 5 : 3, column++) {
    for (let y = rowStart; y < bounds.maxY; y += 3) {
      const point = { x, y }
      const dx = Math.abs(x - chamber.x - 1.5)
      const dy = Math.abs(y - chamber.y - 1.5)
      if (layout === 'cross' && (dx < 2.5 || dy < 2.5)) continue
      const shelter = shelterBounds(point)
      if (!contains(bounds, shelter) || overlaps(shelter, reserved) ||
        obstacles.some(({ bounds }) => overlaps(shelter, bounds))) continue
      const distance = distanceFromChamber(point, chamber)
      const shape = layout === 'compact' ? Math.max(dx, dy) : layout === 'cross' ? dx + dy : distance
      candidates.push({ ...point, shape, distance })
    }
  }
  const roster = [...players].sort((a, b) =>
    b.totalPower - a.totalPower || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const proximity = (a: typeof candidates[number], b: typeof candidates[number]) =>
    a.distance - b.distance || b.y - a.y || a.x - b.x
  const slots = candidates.sort((a, b) => a.shape - b.shape || proximity(a, b))
    .slice(0, Math.min(MAX_PLAYERS, roster.length)).sort(proximity)
  const placements = slots.map(({ x, y }, index): Placement => ({
    x, y, playerId: roster[index].id, name: roster[index].name,
  }))
  return { error: null, placements, unplaced: roster.slice(slots.length) }
}

export function moveHiveShelter(plan: HivePlan, placement: Placement, point: MapPoint): HivePlan {
  const shelter = shelterBounds(point)
  if (!contains(plan.bounds, shelter)) throw new Error('Keep all 3 × 3 shelter tiles inside the hive area.')
  if (overlaps(shelter, chamberBounds(plan.chamber))) throw new Error('This shelter overlaps Frankenstein.')
  const obstacle = obstacles.find(({ bounds }) => overlaps(shelter, bounds))
  if (obstacle) throw new Error(`This shelter overlaps ${obstacle.name}.`)
  const occupied = plan.placements.find(other => other.playerId !== placement.playerId && overlaps(shelter, shelterBounds(other)))
  if (occupied) throw new Error(`This shelter overlaps ${occupied.name}.`)
  return { ...plan, placements: plan.placements.map(other => other.playerId === placement.playerId ? { ...other, ...point } : other) }
}
