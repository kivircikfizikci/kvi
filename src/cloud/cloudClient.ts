import { db, replacePlans, replacePlayers } from '../db'
import { usePlannerStore } from '../store/usePlannerStore'
import type { AllianceProfile, MapTower, Plan, Player } from '../types'

export const CLOUD_API_URL='https://kvi-planner-cloud-api.graciousdrive32.chatgpt.site'
export type CloudRole='viewer'|'r4'|'r5'
export interface CloudSnapshot{version:1;players:Player[];plans:Plan[];activePlanId:string;mapTowers:MapTower[];allianceProfile:AllianceProfile|null}
export interface CloudStateResponse{state:CloudSnapshot|null;revision:number;updatedAt:string|null}

async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`${CLOUD_API_URL}${path}`,init);const body=await response.json().catch(()=>({error:'Cloud service returned an invalid response.'}));if(!response.ok)throw Object.assign(new Error(body.error||'Cloud request failed.'),{status:response.status,body});return body as T}
export const fetchCloudState=()=>request<CloudStateResponse>('/api/state')
export const loginWithUid=(uid:string)=>request<{token:string;role:'r4'|'r5';label:string;expiresAt:string}>('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})})
export const validateCloudSession=(token:string)=>request<{role:'r4'|'r5'}>('/api/session',{headers:{Authorization:`Bearer ${token}`}})
export const saveCloudState=(token:string,state:CloudSnapshot,expectedRevision:number)=>request<{revision:number;updatedAt:string}>('/api/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({state,expectedRevision})})

export async function collectCloudSnapshot():Promise<CloudSnapshot>{const state=usePlannerStore.getState();const [mapTowers,allianceProfile]=await Promise.all([db.mapTowers.toArray(),db.allianceProfiles.get('primary')]);return{version:1,players:structuredClone(state.players),plans:structuredClone(state.plans),activePlanId:state.activePlanId,mapTowers,allianceProfile:allianceProfile??null}}
export async function applyCloudSnapshot(snapshot:CloudSnapshot){await Promise.all([replacePlayers(snapshot.players),replacePlans(snapshot.plans),db.transaction('rw',db.mapTowers,async()=>{await db.mapTowers.clear();await db.mapTowers.bulkPut(snapshot.mapTowers??[])}),db.transaction('rw',db.allianceProfiles,async()=>{await db.allianceProfiles.clear();if(snapshot.allianceProfile)await db.allianceProfiles.put(snapshot.allianceProfile)})]);usePlannerStore.getState().hydrateCloud(snapshot.players,snapshot.plans,snapshot.activePlanId)}
