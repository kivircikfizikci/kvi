export type Availability = 'round1' | 'round2' | 'both' | 'unavailable'
export type RoundId = 1 | 2
export type FormationId = 1 | 2 | 3 | 4
export type OptimizationMode = 'maximum' | 'balanced'
export type AllianceRank = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

export interface Player {
  id: string
  name: string
  totalPower: number
  rallyCapacity: number | null
  formations: Record<FormationId, { power: number | null }>
  availability: Availability
  allowLeader: boolean
  active: boolean
  notes: string
  gameAliases?: string[]
  allianceRank?: AllianceRank
}

export interface Assignment { playerId: string; formation: FormationId; locked: boolean }
export interface Rally {
  id: string
  name: string
  leader: Assignment | null
  participants: Assignment[]
}
export interface RuleConfig {
  enforceRoundExclusivity: boolean
  enforceCapacity: boolean
  enforceAvailability: boolean
  maxRalliesPerRound: number
  minimumRallyPower: number | null
}
export interface Plan {
  id: string
  name: string
  rounds: Record<RoundId, Rally[]>
  roundTimes: Record<RoundId, string>
  rules: RuleConfig
  optimizationMode: OptimizationMode
  objectiveScore: number
  createdAt: string
  updatedAt: string
}
export interface ValidationIssue { code: string; message: string; severity: 'error' | 'warning'; playerId?: string; rallyId?: string }
export interface RallyMetrics { power: number; capacity: number | null }
export interface AppExport { version: 1; exportedAt: string; players: Player[]; plans: Plan[] }
export interface MapTower { id: string; playerId?: string; name: string; x: number; y: number; color: string; createdAt: string; updatedAt: string }
export interface AllianceProfile { id: 'primary'; name: string; tag: string; state: string; updatedAt: string }
export type OfficerNoteStatus = 'requested' | 'planned' | 'done'
export interface OfficerNote { id: string; title: string; details: string; status: OfficerNoteStatus; createdBy: string; createdAt: string; updatedAt: string }
