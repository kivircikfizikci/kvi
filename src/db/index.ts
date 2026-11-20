import Dexie, { type EntityTable } from 'dexie'
import type { AllianceProfile, MapTower, Plan, Player } from '../types'

class PlannerDatabase extends Dexie {
  players!: EntityTable<Player, 'id'>
  plans!: EntityTable<Plan, 'id'>
  mapTowers!: EntityTable<MapTower, 'id'>
  allianceProfiles!: EntityTable<AllianceProfile, 'id'>
  constructor() {
    // Preserve the original storage key so existing browser data survives the product rename.
    super('frankenstein-rally-planner')
    this.version(1).stores({ players: 'id, name, totalPower, availability, active', plans: 'id, name, updatedAt' })
    this.version(2).stores({ players: 'id, name, totalPower, availability, active', plans: 'id, name, updatedAt', mapTowers: 'id, name, x, y, updatedAt' })
    this.version(3).stores({ players: 'id, name, totalPower, availability, active', plans: 'id, name, updatedAt', mapTowers: 'id, name, x, y, updatedAt', allianceProfiles: 'id, name, tag, state, updatedAt' })
  }
}
export const db = new PlannerDatabase()
export const replacePlayers = async (players: Player[]) => db.transaction('rw', db.players, async () => { await db.players.clear(); await db.players.bulkPut(players) })
export const replacePlans = async (plans: Plan[]) => db.transaction('rw', db.plans, async () => { await db.plans.clear(); await db.plans.bulkPut(plans) })
