import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { seedPlayers } from './seed'

describe('plan persistence',()=>{afterEach(async()=>{await db.players.clear();await db.plans.clear()});it('round-trips player data through IndexedDB',async()=>{const original=seedPlayers()[0];await db.players.put(original);const restored=await db.players.get(original.id);expect(restored).toEqual(original);expect(restored?.formations[1].power).toBeNull()})})
