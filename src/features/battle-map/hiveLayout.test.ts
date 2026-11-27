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
  it.each<HiveLayout>(['compact', 'cross', 'lanes'])('fits 100 members in %s with the strongest nearest', layout => {
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

  it.each<HiveLayout>(['compact', 'cross', 'lanes'])('keeps the gaps below 3 × 3 with fewer members and a moved chamber in %s', layout => {
    const settings = { ...DEFAULT_HIVE, layout, chamber: { x: 506, y: 417 } }
    for (const count of [24, 50, 78]) {
      const { placements } = generateHive(settings, roster.slice(0, count))
      expect(placements).toHaveLength(count)
      expect(internalLandingPads(settings.bounds, [chamberBounds(settings.chamber), ...placements.map(shelterBounds)])).toEqual([])
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
    expect(moveHiveShelter(plan, placements[0], { x: 491, y: 400 }).placements[0]).toMatchObject({ x: 491, y: 400 })
    expect(plan.placements[0]).toEqual(placements[0])
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
