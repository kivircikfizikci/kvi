import { db } from '../db'
import { usePlannerStore } from '../store/usePlannerStore'
import type { AllianceProfile, BlackGoldTeam, MapTower, OfficerNote, Plan, Player, StateSnapshot } from '../types'

export const CLOUD_API_URL='https://kvi-planner-cloud-api.graciousdrive32.chatgpt.site'
export type CloudRole='viewer'|'member'|'r4'|'r5'
export interface CloudSnapshot{version:1;players:Player[];plans:Plan[];activePlanId:string;mapTowers:MapTower[];blackGoldTeams?:BlackGoldTeam[];allianceProfile:AllianceProfile|null;officerNotes:OfficerNote[];stateSnapshots:StateSnapshot[]}
export interface CloudStateResponse{state:CloudSnapshot|null;revision:number;updatedAt:string|null}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CLOUD_API_URL}${path}`, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : 'Cloud request failed.'
    throw Object.assign(new Error(message), { status: response.status })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Cloud service returned an invalid response.')
  }
  return body as T
}
export async function fetchCloudState(token: string) {
  const result = await request<CloudStateResponse>('/api/state', { headers: { Authorization: `Bearer ${token}` } })
  if (!Number.isSafeInteger(result.revision) || (result.state !== null &&
    (!Array.isArray(result.state?.players) || !Array.isArray(result.state?.plans)))) {
    throw new Error('Cloud service returned an invalid workspace.')
  }
  return result
}

export async function fetchPublicState() {
  const result = await request<{ stateSnapshots: StateSnapshot[]; updatedAt: string | null }>('/api/public-state')
  if (!Array.isArray(result.stateSnapshots)) {
    throw new Error('Cloud service returned invalid public State data.')
  }
  return result
}
export const loginWithUid=(uid:string)=>request<{token:string;role:'member'|'r4'|'r5';label:string;expiresAt:string}>('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})})
export const validateCloudSession=(token:string)=>request<{role:'member'|'r4'|'r5'}>('/api/session',{headers:{Authorization:`Bearer ${token}`}})
export async function saveCloudState(token: string, state: CloudSnapshot, expectedRevision: number) {
  const result = await request<{ revision: number; updatedAt: string }>('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ state, expectedRevision }),
  })
  if (!Number.isSafeInteger(result.revision)) {
    throw new Error('Cloud service did not confirm the save revision.')
  }
  return result
}

export async function collectCloudSnapshot():Promise<CloudSnapshot>{const state=usePlannerStore.getState();const [mapTowers,blackGoldTeams,allianceProfile,officerNotes,stateSnapshots]=await Promise.all([db.mapTowers.toArray(),db.blackGoldTeams.toArray(),db.allianceProfiles.get('primary'),db.officerNotes.toArray(),db.stateSnapshots.orderBy('capturedAt').reverse().limit(30).toArray()]);return{version:1,players:structuredClone(state.players),plans:structuredClone(state.plans),activePlanId:state.activePlanId,mapTowers,blackGoldTeams,allianceProfile:allianceProfile??null,officerNotes,stateSnapshots}}
export async function applyCloudSnapshot(snapshot: CloudSnapshot) {
  const tables = [
    db.players, db.plans, db.mapTowers, db.blackGoldTeams,
    db.allianceProfiles, db.officerNotes, db.stateSnapshots,
  ]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map(table => table.clear()))
    await Promise.all([
      db.players.bulkPut(snapshot.players),
      db.plans.bulkPut(snapshot.plans),
      db.mapTowers.bulkPut(snapshot.mapTowers ?? []),
      db.blackGoldTeams.bulkPut(snapshot.blackGoldTeams ?? []),
      snapshot.allianceProfile && db.allianceProfiles.put(snapshot.allianceProfile),
      db.officerNotes.bulkPut(snapshot.officerNotes ?? []),
      db.stateSnapshots.bulkPut(snapshot.stateSnapshots ?? []),
    ])
  })
  usePlannerStore.getState().hydrateCloud(snapshot.players, snapshot.plans, snapshot.activePlanId)
}

export function applyPublicState(stateSnapshots: StateSnapshot[]) {
  return applyCloudSnapshot({
    version: 1,
    players: [],
    plans: [],
    activePlanId: '',
    mapTowers: [],
    allianceProfile: null,
    officerNotes: [],
    stateSnapshots,
  })
}
