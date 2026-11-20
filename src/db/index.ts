import Dexie, { type EntityTable } from 'dexie'
import type { Plan, Player } from '../types'

class PlannerDatabase extends Dexie {
  players!: EntityTable<Player, 'id'>
  plans!: EntityTable<Plan, 'id'>
  constructor() {
    super('frankenstein-rally-planner')
    this.version(1).stores({ players: 'id, name, totalPower, availability, active', plans: 'id, name, updatedAt' })
  }
}
export const db = new PlannerDatabase()
export const replacePlayers = async (players: Player[]) => db.transaction('rw', db.players, async () => { await db.players.clear(); await db.players.bulkPut(players) })
export const replacePlans = async (plans: Plan[]) => db.transaction('rw', db.plans, async () => { await db.plans.clear(); await db.plans.bulkPut(plans) })
