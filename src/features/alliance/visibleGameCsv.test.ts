import { describe, expect, it } from 'vitest'
import { seedPlayers } from '../../db/seed'
import { parseVisibleGameCsv } from './visibleGameCsv'

describe('visible game CSV', () => {
  it('uses a unique known member name and preserves explicit long UIDs as text', () => {
    const roster = [{ ...seedPlayers()[0], name: 'Known Player', uid: '10000001' }]
    const csv = 'type,uid,name,power,rank\nmember,,Known Player,186.5M,\nstate-player,009007199254740993,"New, Player","52,000,000",2'
    const result = parseVisibleGameCsv(csv, roster, [], '2026-11-27T18:00:00.000Z')
    expect(result.players[0]).toMatchObject({ uid: '10000001', power: 186_500_000 })
    expect(result.stateSnapshot?.playerRanking).toEqual([
      expect.objectContaining({ uid: '009007199254740993', name: 'New, Player', power: 52_000_000, rank: 2 }),
    ])
  })

  it('uses the last known State details for optional fields', () => {
    const previous = [{ id: 'previous', capturedAt: '2026-11-26', playerRanking: [], allianceRanking: [
      { uid: '77', name: 'Alliance', rank: 3, power: 1, tag: 'ABC', leader: 'Leader', currentMembers: 80, maxMembers: 100 },
    ] }]
    const result = parseVisibleGameCsv('type,name,power,rank\nstate-alliance,Alliance,1.5B,2', [], previous)
    expect(result.stateSnapshot?.allianceRanking[0]).toEqual({
      ...previous[0].allianceRanking[0], rank: 2, power: 1_500_000_000,
    })
  })

  it('requires a UID for an ambiguous name and rejects invalid power values', () => {
    const roster = ['11', '12'].map(uid => ({ ...seedPlayers()[0], uid, name: 'Same name' }))
    expect(() => parseVisibleGameCsv('type,name,power\nmember,Same name,50M', roster, []))
      .toThrow('CSV row 2. Enter the exact numeric UID')
    expect(() => parseVisibleGameCsv('type,uid,name,power\nmember,11,Same name,NaN', roster, []))
      .toThrow('CSV row 2. Enter a valid power value.')
  })
})
