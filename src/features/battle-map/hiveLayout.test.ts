import { describe, expect, it } from 'vitest'
import { seedPlayers } from '../../db/seed'
import type { HiveLayout, HivePlan } from '../../types'
import { chamberBounds, DEFAULT_HIVE, distanceFromChamber, generateHive, moveHiveShelter, shelterBounds } from './hiveLayout'
import { ARMORIES, fixedBuildingFootprint, overlaps } from './mapGeometry'
import { intersectsShieldZone, SHIELD_ZONE_OUTLINE } from './shieldZone'

const roster = Array.from({ length: 100 }, (_, index) => ({
  ...seedPlayers()[0], id: String(index), name: `Member ${index}`, totalPower: (index + 1) * 1_000_000,
}))

describe('Frankenstein hive planning', () => {
  it.each<HiveLayout>(['compact', 'cross', 'lanes'])('fits 100 members in %s with the strongest nearest', layout => {
    const settings = { ...DEFAULT_HIVE, layout }
    const { placements, unplaced, error } = generateHive(settings, roster)
    expect(error).toBeNull()
    expect(placements).toHaveLength(100)
    expect(unplaced).toHaveLength(0)
    expect(placements[0].playerId).toBe('99')
    const chamber = chamberBounds(settings.chamber)
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
