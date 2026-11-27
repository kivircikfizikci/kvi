import { describe, expect, it } from 'vitest'
import { seedPlayers } from '../../db/seed'
import type { HiveLayout, HivePlan } from '../../types'
import { adjustHiveArea, chamberBounds, DEFAULT_HIVE, distanceFromChamber, generateHive, hiveAreaHandle, moveHiveShelter, shelterBounds, transformHive } from './hiveLayout'
import { ARMORIES, fixedBuildingFootprint, overlaps, type Rect } from './mapGeometry'
import { intersectsShieldZone, SHIELD_ZONE_OUTLINE } from './shieldZone'

const roster = Array.from({ length: 100 }, (_, index) => ({
  ...seedPlayers()[0], id: String(index), name: `Member ${index}`, totalPower: (index + 1) * 1_000_000,
}))

function internalLandingPads(bounds: Rect, occupied: Rect[]) {
  const pads: Rect[] = []
  for (let x = bounds.minX; x <= bounds.maxX - 2; x++) {
    for (let y = bounds.minY; y <= bounds.maxY - 2; y++) {
      const pad = { minX: x, maxX: x + 2, minY: y, maxY: y + 2 }
      if (occupied.some(area => overlaps(area, pad))) continue
      const across = [y, y + 1, y + 2].every(row => {
        const plots = occupied.filter(area => area.minY <= row && area.maxY >= row)
        return plots.some(area => area.maxX < x) && plots.some(area => area.minX > pad.maxX)
      })
      const vertical = [x, x + 1, x + 2].every(col => {
        const plots = occupied.filter(area => area.minX <= col && area.maxX >= col)
        return plots.some(area => area.maxY < y) && plots.some(area => area.minY > pad.maxY)
      })
      if (across || vertical) pads.push(pad)
    }
  }
  return pads
}

describe('Frankenstein hive planning', () => {
  it.each<HiveLayout>(['compact', 'cross', 'lanes', 'winged', 'stepped-cross'])('fits 100 members in %s with the strongest nearest', layout => {
    const settings = { ...DEFAULT_HIVE, layout }
    const { placements, unplaced, error } = generateHive(settings, roster)
    expect(error).toBeNull()
    expect(placements).toHaveLength(100)
    expect(unplaced).toHaveLength(0)
    expect(placements[0].playerId).toBe('99')
    const chamber = chamberBounds(settings.chamber)
    expect(internalLandingPads(settings.bounds, [chamber, ...placements.map(shelterBounds)])).toEqual([])
    for (const [index, placement] of placements.entries()) {
      const area = shelterBounds(placement)
      expect(overlaps(area, chamber)).toBe(false)
      expect(placements.slice(0, index).some(other => overlaps(area, shelterBounds(other)))).toBe(false)
      expect(ARMORIES.some(building => overlaps(area, fixedBuildingFootprint(building)))).toBe(false)
      expect(intersectsShieldZone(area)).toBe(false)
      expect(placement.playerId).toBe(String(99 - index))
      if (index > 0) expect(distanceFromChamber(placement, settings.chamber))
        .toBeGreaterThanOrEqual(distanceFromChamber(placements[index - 1], settings.chamber))
    }
  })

  it.each<HiveLayout>(['compact', 'cross', 'lanes', 'winged', 'stepped-cross'])('keeps the gaps below 3 × 3 with fewer members and a moved chamber in %s', layout => {
    const settings = { ...DEFAULT_HIVE, layout, chamber: { x: 506, y: 417 } }
    for (const count of [24, 50, 78]) {
      const { placements } = generateHive(settings, roster.slice(0, count))
      expect(placements).toHaveLength(count)
      expect(internalLandingPads(settings.bounds, [chamberBounds(settings.chamber), ...placements.map(shelterBounds)])).toEqual([])
    }
  })

  it('preserves the reference block and wing coordinates when the chamber is moved', () => {
    const result = generateHive({
      layout: 'winged',
      bounds: { minX: 454, maxX: 493, minY: 411, maxY: 446 },
      chamber: { x: 472, y: 428 },
    }, roster)
    expect(result.error).toBeNull()
    const columnsAt = (y: number) => result.placements.filter(slot => slot.y === y).map(slot => slot.x).sort((a, b) => a - b)
    expect(columnsAt(445)).toEqual([459, 462, 465, 469, 472, 475, 478, 482, 485, 488])
    expect(columnsAt(439)).toEqual([459, 462, 465, 482, 485, 488])
    expect(columnsAt(434)).toEqual([469, 472, 475, 478])
    expect(columnsAt(431)).toEqual([458, 461, 464, 467, 470, 477, 480, 483, 486, 489])
    expect(columnsAt(425)).toEqual([469, 472, 475, 478])
  })

  it('gives each stepped cross quadrant 25 shelters in four tiers', () => {
    const settings = { ...DEFAULT_HIVE, layout: 'stepped-cross' as const }
    const { placements } = generateHive(settings, roster)
    for (const horizontal of [-1, 1]) {
      for (const vertical of [-1, 1]) {
        const wing = placements.filter(slot =>
          Math.sign(slot.x - settings.chamber.x - 1.5) === horizontal &&
          Math.sign(slot.y - settings.chamber.y - 1.5) === vertical)
        expect(wing).toHaveLength(25)
      }
    }
    const eastern = placements.filter(slot => slot.x >= settings.chamber.x + 4 && slot.y >= settings.chamber.y + 4)
    for (const [row, width] of [7, 5, 5, 3, 3, 1, 1].entries()) {
      const y = settings.chamber.y + 4 + row * 3
      expect(eastern.filter(slot => slot.y === y || (slot.x === settings.chamber.x + 4 && slot.y === y + 1))).toHaveLength(width)
    }
  })

  it('handles a full chamber with no room for shelters and rejects fixed-building overlap', () => {
    const chamber = DEFAULT_HIVE.chamber
    const crowded = generateHive({ ...DEFAULT_HIVE, bounds: chamberBounds(chamber) }, roster)
    expect(crowded.placements).toHaveLength(0)
    expect(crowded.unplaced).toHaveLength(100)
    const armory = ARMORIES[2]
    const blocked = generateHive({
      ...DEFAULT_HIVE,
      chamber: { x: armory.x, y: armory.y },
      bounds: { minX: 500, maxX: 580, minY: 425, maxY: 480 },
    }, roster)
    expect(blocked.error).toContain('Armory 3')
  })

  it('supports a manual move and rejects a collision without changing the plan', () => {
    const { placements } = generateHive(DEFAULT_HIVE, roster.slice(0, 2))
    const plan: HivePlan = { ...DEFAULT_HIVE, id: 'primary', placements, updatedAt: '2026-11-27' }
    expect(() => moveHiveShelter(plan, placements[0], placements[1])).toThrow('overlaps')
    expect(moveHiveShelter(plan, placements[0], { x: 491, y: 400 }).placements[0]).toMatchObject({ x: 491, y: 400, manual: true })
    expect(plan.placements[0]).toEqual(placements[0])
  })

  it('pins a member before generating and keeps the exact position across layouts', () => {
    const plan: HivePlan = { ...DEFAULT_HIVE, id: 'primary', placements: [], updatedAt: '' }
    const pinned = moveHiveShelter(plan, { playerId: roster[0].id, name: roster[0].name }, { x: 496, y: 417 }).placements
    expect(pinned).toEqual([{ playerId: roster[0].id, name: roster[0].name, x: 496, y: 417, manual: true }])
    for (const layout of ['compact', 'cross', 'lanes', 'winged', 'stepped-cross'] as const) {
      const result = generateHive({ ...DEFAULT_HIVE, layout }, roster, pinned)
      expect(result.error).toBeNull()
      expect(result.placements).toHaveLength(100)
      expect(result.placements[0]).toEqual(pinned[0])
      expect(result.placements[1].playerId).toBe(roster[99].id)
      expect(new Set(result.placements.map(item => item.playerId)).size).toBe(100)
      expect(result.placements.slice(1).some(item => overlaps(shelterBounds(item), shelterBounds(pinned[0])))).toBe(false)
    }
  })

  it('flags a pinned shelter outside new area bounds without silently moving it', () => {
    const pinned = [{ playerId: roster[0].id, name: roster[0].name, x: 491, y: 400, manual: true }]
    const result = generateHive({ ...DEFAULT_HIVE, bounds: { ...DEFAULT_HIVE.bounds, minX: 500 } }, roster, pinned)
    expect(result.error).toContain(`${roster[0].name}: Keep all 3 × 3 shelter tiles inside the hive area.`)
    expect(result.placements).toHaveLength(0)
  })

  it('moves the chamber and all shelters together when the area is dragged', () => {
    const { placements } = generateHive(DEFAULT_HIVE, roster)
    const handle = hiveAreaHandle(DEFAULT_HIVE.bounds, DEFAULT_HIVE.chamber, { x: 1, y: 1 })
    expect(handle).toEqual({ x: 0, y: 0 })
    const change = adjustHiveArea(DEFAULT_HIVE.bounds, handle!, { x: -5, y: -6 })
    const moved = transformHive({ ...DEFAULT_HIVE, placements }, change)
    expect(moved.canKeepPlacements).toBe(true)
    expect(moved.settings.chamber).toEqual({ x: 507, y: 415 })
    expect(moved.placements).toEqual(placements.map(item => ({ ...item, x: item.x - 5, y: item.y - 6 })))
  })

  it('resizes from a corner and flags shelters that no longer fit', () => {
    const { bounds } = DEFAULT_HIVE
    const handle = hiveAreaHandle(bounds, { x: bounds.minX - .5, y: bounds.maxY + .5 }, { x: 1, y: 1 })
    expect(handle).toEqual({ x: -1, y: 1 })
    const { placements } = generateHive(DEFAULT_HIVE, roster)
    const change = adjustHiveArea(bounds, handle!, { x: 20, y: -10 })
    expect(change.bounds).toEqual({ ...bounds, minX: bounds.minX + 20, maxY: bounds.maxY - 10 })
    const proposal = transformHive({ ...DEFAULT_HIVE, placements }, change)
    expect(proposal.canKeepPlacements).toBe(false)
    expect(proposal.placements).toEqual(placements)
  })
})

describe('gray zone', () => {
  const inZone = (x: number, y: number) =>
    intersectsShieldZone({ minX: x, maxX: x, minY: y, maxY: y })

  it('honors the specified steps and mirrors the southwest corner', () => {
    const edges = [
      [549, 453, 546], [548, 451, 548], [547, 450, 549],
      [546, 449, 550], [545, 449, 551], [544, 448, 551],
      [446, 453, 546], [447, 451, 549], [448, 450, 550],
      [449, 449, 551], [450, 449, 551], [451, 448, 551],
    ]
    for (const [y, left, right] of edges) {
      expect(inZone(left - 1, y)).toBe(false)
      expect(inZone(left, y)).toBe(true)
      expect(inZone(right, y)).toBe(true)
      expect(inZone(right + 1, y)).toBe(false)
    }
    expect(inZone(448, 554)).toBe(false)
    expect(SHIELD_ZONE_OUTLINE).toContainEqual({ x: 452.5, y: 549.5 })
  })
})
