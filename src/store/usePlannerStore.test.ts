import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedPlayers } from '../db/seed'
import type { Plan, Player } from '../types'
import { matchedGamePlayer, selectActivePlan, usePlannerStore } from './usePlannerStore'

const player: Player = {
  ...seedPlayers()[0],
  uid: '10000001',
  formations: { 1: { power: 100_000_000 }, 2: { power: 50_000_000 }, 3: { power: null }, 4: { power: null } },
  availability: 'both',
}
const assignment = { playerId: player.id, formation: 2, locked: false } as const
const plan: Plan = {
  id: 'plan',
  name: 'Test plan',
  rounds: {
    1: [{ id: 'source', name: 'Source', leader: null, participants: [assignment] },
      { id: 'target', name: 'Target', leader: null, participants: [] }],
    2: [],
  },
  roundTimes: { 1: '', 2: '' },
  rules: { enforceRoundExclusivity: true, enforceCapacity: true, enforceAvailability: true, maxRalliesPerRound: 12, minimumRallyPower: null },
  optimizationMode: 'maximum',
  objectiveScore: 0,
  createdAt: '2026-11-26T00:00:00Z',
  updatedAt: '2026-11-26T00:00:00Z',
}

describe('Rally Planner moves', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    usePlannerStore.getState().hydrateCloud([player], [structuredClone(plan)], plan.id)
    usePlannerStore.setState({ cloudCanEdit: true, error: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('moves the selected formation in a single change', () => {
    usePlannerStore.getState().moveParticipant(1, 'source', 1, 'target', player.id)
    const state = usePlannerStore.getState()
    expect(selectActivePlan(state)?.rounds[1].map(rally => rally.participants)).toEqual([[], [assignment]])
    expect(state.history).toHaveLength(1)
  })

  it('preserves the original assignment when the destination is invalid', () => {
    usePlannerStore.getState().moveParticipant(1, 'source', 2, 'missing', player.id)
    const state = usePlannerStore.getState()
    expect(selectActivePlan(state)?.rounds).toEqual(plan.rounds)
    expect(state.error).toBe('Player or rally no longer exists.')
    expect(state.history).toHaveLength(0)
  })
})

it('matches roster entries by UID without taking over an existing same-name player', () => {
  const renamed = { ...player, name: 'Previous name' }
  expect(matchedGamePlayer([player], player.name, 'different-uid')).toBeUndefined()
  expect(matchedGamePlayer([renamed], player.name, player.uid)).toBe(renamed)
  expect(matchedGamePlayer([{ ...player, uid: undefined }], player.name, player.uid)?.id).toBe(player.id)
})
