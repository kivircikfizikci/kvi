import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { seedPlayers } from './seed'
import { applyCloudSnapshot } from '../cloud/cloudClient'
import type { OfficerNote } from '../types'

describe('plan persistence',()=>{afterEach(async()=>{await db.players.clear();await db.plans.clear()});it('round-trips player data through IndexedDB',async()=>{const original=seedPlayers()[0];await db.players.put(original);const restored=await db.players.get(original.id);expect(restored).toEqual(original);expect(restored?.formations[1].power).toBeNull()})})

it('preserves local workspace records if a cloud snapshot cannot be stored', async () => {
  const player = seedPlayers()[0]
  await db.players.put(player)
  try {
    await expect(applyCloudSnapshot({
      version: 1, players: [], plans: [], activePlanId: '', mapTowers: [],
      allianceProfile: null, officerNotes: [{} as OfficerNote], stateSnapshots: [],
    })).rejects.toThrow()
    expect(await db.players.get(player.id)).toEqual(player)
  } finally {
    await db.players.delete(player.id)
  }
})
