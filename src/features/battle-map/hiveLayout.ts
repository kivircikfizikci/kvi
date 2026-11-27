import type { HivePlan, Player, StoredHivePlan } from '../../types'
import { MAX_PLAYERS } from '../players/constants'
import { FIXED_BUILDINGS, MAP_MAX, MAP_MIN, fixedBuildingFootprint, overlaps, type MapPoint, type Rect } from './mapGeometry'

export type HiveSettings = Pick<HivePlan, 'layout' | 'bounds' | 'chamber'>
type Placement = HivePlan['placements'][number]
export function normalizeHivePlan(plan: StoredHivePlan): HivePlan {
  return { ...plan, layout: plan.layout === 'stepped-cross' ? 'cross' : plan.layout }
}
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

function packedCenters(anchor: number, min: number, max: number) {
  const start = anchor + 3 * Math.ceil((min + 1 - anchor) / 3)
  const centers: number[] = []
  for (let center = start; center < max; center += 3) centers.push(center)
  return centers
}

function crossCenters(anchor: number, min: number, max: number, clearance = 0) {
  // The two inside edges leave exactly the center two tiles open.
  return [
    ...packedCenters(anchor - 1 - clearance, min, anchor - clearance),
    ...packedCenters(anchor + 4 + clearance, anchor + 3 + clearance, max),
  ]
}

function laneCenters(anchor: number, min: number, max: number) {
  const centers = [anchor, anchor + 3]
  // The pair containing the chamber gets a one-tile lane on each side.
  for (let center = anchor - 4; center > min; center -= 8) centers.push(center, center - 3)
  for (let center = anchor + 7; center < max; center += 8) centers.push(center, center + 3)
  return centers.filter(center => center > min && center < max)
}

// Map coordinates from the reference, anchored at the chamber's southwest tile.
const wingedBlocks = [
  { columns: [459, 462, 465, 482, 485, 488], rows: [445, 442, 439, 436, 423, 420, 417, 414] },
  { columns: [469, 472, 475, 478], rows: [445, 442, 437, 434, 425, 422, 417, 414] },
  { columns: [458, 461, 464, 467, 470, 477, 480, 483, 486, 489], rows: [431, 428] },
]

function ringCenters(chamber: MapPoint): MapPoint[] {
  return [12, 22, 32, 42].flatMap(size => {
    const perSide = Math.floor(size / 3)
    const remainder = size % 3
    // Keep both corner shelters flush with the perimeter. Any leftover tiles
    // form a gap in the middle of the side, away from the corners.
    const start = 3 - size / 2
    const offsets = Array.from({ length: perSide }, (_, index) =>
      start + index * 3 + (index >= Math.ceil(perSide / 2) ? remainder : 0))
    const first = offsets[0], last = offsets[offsets.length - 1]
    return offsets.flatMap(x => (x === first || x === last ? offsets : [first, last])
      .map(y => ({ x: chamber.x + x, y: chamber.y + y })))
  })
}

function layoutCenters({ layout, bounds, chamber }: HiveSettings): MapPoint[] {
  if (layout === 'rings') return ringCenters(chamber)
  if (layout === 'winged') {
    return wingedBlocks.flatMap(({ columns, rows }) => columns.flatMap(x =>
      rows.map(y => ({ x: chamber.x + x - 472, y: chamber.y + y - 428 }))))
  }
  const columns = layout === 'cross' ? crossCenters(chamber.x, bounds.minX, bounds.maxX) :
    layout === 'lanes' ? laneCenters(chamber.x, bounds.minX, bounds.maxX) :
      packedCenters(chamber.x, bounds.minX, bounds.maxX)
  const rows = layout === 'cross' ? crossCenters(chamber.y, bounds.minY, bounds.maxY) :
    packedCenters(chamber.y, bounds.minY, bounds.maxY)
  const chamberRows = layout === 'cross' ? crossCenters(chamber.y, bounds.minY, bounds.maxY, 1) : rows
  return columns.flatMap(x => {
    // Move the two central columns one tile away from the chamber's 4×4 corners.
    const columnRows = x === chamber.x - 1 || x === chamber.x + 4 ? chamberRows : rows
    return columnRows.map(y => ({ x, y }))
  })
}

export function generateHive(settings: HiveSettings, players: readonly Player[], pinned: readonly Placement[] = []) {
  const error = hiveSettingsError(settings)
  if (error) return { error, placements: [], unplaced: [] }
  for (const placement of pinned) {
    const issue = hiveShelterError(settings, pinned, placement, placement.playerId)
    if (issue) return { error: `${placement.name}: ${issue} Move or release this shelter first.`, placements: [], unplaced: [] }
  }
  const { layout, bounds, chamber } = settings
  const reserved = chamberBounds(chamber)
  const pinnedAreas = pinned.map(shelterBounds)
  const candidates: { x: number; y: number; shape: number; distance: number }[] = []
  for (const point of layoutCenters(settings)) {
    const shelter = shelterBounds(point)
    if (!contains(bounds, shelter) || overlaps(shelter, reserved) ||
      obstacles.some(({ bounds }) => overlaps(shelter, bounds)) ||
      pinnedAreas.some(area => overlaps(area, shelter))) continue
    const dx = Math.abs(point.x - chamber.x - 1.5)
    const dy = Math.abs(point.y - chamber.y - 1.5)
    const distance = distanceFromChamber(point, chamber)
    const shape = layout === 'compact' || layout === 'rings' ? Math.max(dx, dy) : layout === 'cross' ? dx + dy : distance
    candidates.push({ ...point, shape, distance })
  }
  const pinnedIds = new Set(pinned.map(placement => placement.playerId))
  const roster = players.filter(player => !pinnedIds.has(player.id)).sort((a, b) =>
    b.totalPower - a.totalPower || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const proximity = (a: typeof candidates[number], b: typeof candidates[number]) =>
    a.distance - b.distance || b.y - a.y || a.x - b.x
  const slots = candidates.sort((a, b) => a.shape - b.shape || proximity(a, b))
    .slice(0, Math.min(Math.max(0, MAX_PLAYERS - pinned.length), roster.length)).sort(proximity)
  const placements = slots.map(({ x, y }, index): Placement => ({
    x, y, playerId: roster[index].id, name: roster[index].name,
  }))
  return { error: null, placements: [...pinned, ...placements], unplaced: roster.slice(slots.length) }
}

function hiveShelterError(settings: HiveSettings, placements: readonly Placement[], point: MapPoint, ignore: string) {
  const shelter = shelterBounds(point)
  if (!contains(settings.bounds, shelter)) return 'Keep all 3 × 3 shelter tiles inside the hive area.'
  if (overlaps(shelter, chamberBounds(settings.chamber))) return 'This shelter overlaps Frankenstein.'
  const obstacle = obstacles.find(({ bounds }) => overlaps(shelter, bounds))
  if (obstacle) return `This shelter overlaps ${obstacle.name}.`
  const occupied = placements.find(other => other.playerId !== ignore && overlaps(shelter, shelterBounds(other)))
  return occupied ? `This shelter overlaps ${occupied.name}.` : null
}

export function moveHiveShelter(plan: HivePlan, placement: Pick<Placement, 'playerId' | 'name'>, point: MapPoint): HivePlan {
  const error = hiveShelterError(plan, plan.placements, point, placement.playerId)
  if (error) throw new Error(error)
  const existing = plan.placements.find(other => other.playerId === placement.playerId)
  if (!existing && plan.placements.length >= MAX_PLAYERS) throw new Error('The hive already has 100 shelters.')
  const manuallyPlaced = { ...placement, ...point, manual: true }
  const placements = existing ? plan.placements.map(other => other === existing ? manuallyPlaced : other) : [...plan.placements, manuallyPlaced]
  return { ...plan, placements }
}
