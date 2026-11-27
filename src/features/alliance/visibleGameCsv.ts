import { parseCsvLine } from '../import-export/dataTools'
import { normalizeGameName } from '../../store/usePlannerStore'
import type { AllianceRank, Player, StateSnapshot } from '../../types'
import type { DarkWarRosterResult } from './darkWarSync'

export const VISIBLE_GAME_CSV = 'visible-game-csv'
export const visibleGameCsvHeader = 'type,uid,name,power,rank,allianceRank,allianceTag,allianceName,level,totalKills,leader,currentMembers,maxMembers'

export function parseVisibleGameCsv(
  text: string, roster: readonly Player[], previous: readonly StateSnapshot[], capturedAt = new Date().toISOString(),
): DarkWarRosterResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  const header = parseCsvLine(lines.shift() ?? '').map(value => value.trim().toLowerCase())
  if (!lines.length || !['type', 'name', 'power'].every(column => header.includes(column)))
    throw new Error('The CSV needs type, name, and power columns and at least one data row.')
  if (new Set(header).size !== header.length) throw new Error('The CSV has duplicate column names.')

  const result: DarkWarRosterResult = {
    source: VISIBLE_GAME_CSV, capturedAt, players: [],
    statePlayerKillRanking: [], stateAllianceKillRanking: [], playerPositions: [], playerProfileUpdates: [],
  }
  const playerRanking: StateSnapshot['playerRanking'] = []
  const allianceRanking: StateSnapshot['allianceRanking'] = []
  const knownPlayers = previous.find(snapshot => snapshot.playerRanking.length)?.playerRanking ?? []
  const knownAlliances = previous.find(snapshot => snapshot.allianceRanking.length)?.allianceRanking ?? []
  const seen = new Set<string>()

  for (const [index, line] of lines.entries()) {
    try {
      const row = parseCsvLine(line)
      if (row.length !== header.length) throw new Error('The row has a different number of columns than the header.')
      const get = (column: string) => (row[header.indexOf(column)] ?? '').trim()
      const type = get('type').toLowerCase()
      const name = get('name')
      if (!name) throw new Error('A name is required.')
      const numeric = (column: string, required = false) => {
        const raw = get(column)
        if (!raw && !required) return undefined
        const input = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replaceAll(',', '') : raw
        const match = input.match(/^(\d+(?:\.\d+)?)([KMB])?$/i)
        const scale = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }
        const suffix = match?.[2]?.toUpperCase() as keyof typeof scale | undefined
        const value = match ? suffix ? Math.round(Number(match[1]) * scale[suffix]) : Number(match[1]) : NaN
        if ((suffix && column !== 'power' && column !== 'totalkills') || !Number.isSafeInteger(value) || value < 0)
          throw new Error(`Enter a valid ${column} value.`)
        return value
      }
      if (!['member', 'state-player', 'state-alliance'].includes(type))
        throw new Error('Type must be member, state-player, or state-alliance.')
      const known = type === 'state-alliance' ? knownAlliances : type === 'state-player' ? knownPlayers : roster
      const matches = new Set(known.filter(item => item.uid && normalizeGameName(item.name) === normalizeGameName(name)).map(item => item.uid))
      const explicitUid = get('uid')
      const uid = explicitUid || (matches.size === 1 ? [...matches][0] : undefined)
      if (!uid || !/^\d+$/.test(uid)) throw new Error(`Enter the exact numeric UID for ${name}.`)
      const id = `${type}:${uid}`
      if (seen.has(id)) throw new Error(`Duplicate UID for ${type}.`)
      seen.add(id)
      const power = numeric('power', true)!
      const totalKills = numeric('totalkills')
      const level = numeric('level')
      if (type === 'member') {
        const allianceRank = get('alliancerank').toUpperCase()
        if (allianceRank && !/^R[1-5]$/.test(allianceRank)) throw new Error('Alliance rank must be R1 through R5.')
        result.players.push({ uid, name, power, rank: index + 1, totalKills, mainBuildingLevel: level, allianceRank: (allianceRank || undefined) as AllianceRank | undefined })
        continue
      }
      const rank = numeric('rank', true)!
      if (rank < 1) throw new Error('Rank must be at least 1.')
      if (type === 'state-player') {
        const old = knownPlayers.find(item => item.uid === uid)
        playerRanking.push({
          ...old, uid, name, rank, power, totalKills: totalKills ?? old?.totalKills,
          level: level ?? old?.level ?? null, allianceTag: get('alliancetag') || old?.allianceTag || '',
          allianceName: get('alliancename') || old?.allianceName || '',
        })
      } else {
        const old = knownAlliances.find(item => item.uid === uid)
        allianceRanking.push({
          ...old, uid, name, rank, power, totalKills: totalKills ?? old?.totalKills,
          tag: get('alliancetag') || old?.tag || '', leader: get('leader') || old?.leader || '',
          currentMembers: numeric('currentmembers') ?? old?.currentMembers ?? 0,
          maxMembers: numeric('maxmembers') ?? old?.maxMembers ?? 0,
        })
      }
    } catch (error) {
      throw new Error(`CSV row ${index + 2}. ${error instanceof Error ? error.message : 'Invalid row.'}`)
    }
  }
  if (playerRanking.length || allianceRanking.length) {
    result.stateSnapshot = {
      id: capturedAt, capturedAt,
      playerRanking: playerRanking.sort((a, b) => a.rank - b.rank),
      allianceRanking: allianceRanking.sort((a, b) => a.rank - b.rank),
    }
  }
  return result
}
