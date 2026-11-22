import type { GameRosterEntry } from '../../store/usePlannerStore'
import type { AllianceRank, StateSnapshot } from '../../types'

const connectionKey='kvi-dark-war-sync'
const fragmentKey='dark-war-sync'

export interface DarkWarConnection{url:string;token:string}
export interface DarkWarRosterResult{players:GameRosterEntry[];capturedAt:string;source:string;stateSnapshot?:StateSnapshot}

function decodeFragment(value:string){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');return decodeURIComponent(escape(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))))}

export function loadDarkWarConnection():DarkWarConnection|null{
  const params=new URLSearchParams(window.location.hash.replace(/^#/,'')),incoming=params.get(fragmentKey)
  if(incoming){try{const parsed=JSON.parse(decodeFragment(incoming)) as DarkWarConnection;if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(parsed.url)||parsed.token.length<20)throw new Error('Invalid local sync connection.');localStorage.setItem(connectionKey,JSON.stringify(parsed));params.delete(fragmentKey);history.replaceState(null,'',`${location.pathname}${location.search}${params.size?`#${params}`:''}`);return parsed}catch{localStorage.removeItem(connectionKey)}}
  try{const stored=JSON.parse(localStorage.getItem(connectionKey)??'null') as DarkWarConnection|null;return stored&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(stored.url)?stored:null}catch{return null}
}

async function request<T>(connection:DarkWarConnection,path:string,method='GET'):Promise<T>{const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),60_000);try{const response=await fetch(`${connection.url}${path}`,{method,headers:{'X-KVI-Sync-Token':connection.token},signal:controller.signal});const body=await response.json().catch(()=>({error:'The local helper returned an invalid response.'}));if(!response.ok)throw new Error(body.error??'Dark War sync failed.');return body as T}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('The local helper did not respond within 60 seconds. Use the saved JSON import if the browser cannot reach it.');throw error}finally{window.clearTimeout(timer)}}
export const checkDarkWarSync=(connection:DarkWarConnection)=>request<{ok:true;capturing:boolean}>(connection,'/health')
export const startDarkWarCapture=(connection:DarkWarConnection)=>request<{capturing:true}>(connection,'/capture/start','POST')
export const finishDarkWarCapture=(connection:DarkWarConnection)=>request<DarkWarRosterResult>(connection,'/capture/finish','POST')

type AnyRow=Record<string,unknown>
const text=(value:unknown)=>value==null?'':String(value).trim()
const number=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
const rank=(value:unknown):AllianceRank|undefined=>{const normalized=text(value).toUpperCase();if(['R1','R2','R3','R4','R5'].includes(normalized))return normalized as AllianceRank;const numeric=Number(value);return numeric>=1&&numeric<=5?`R${numeric}` as AllianceRank:undefined}

function playerRows(rows:AnyRow[]):GameRosterEntry[]{return rows.map((row,index)=>{
  const explicitAllianceRank=row.allianceRank??row.rankNumber??(row.mainCityLv!=null?row.rank:undefined)
  const sex=number(row.sex)
  return{uid:text(row.uid)||undefined,name:text(row.name??row.userName),power:number(row.power??row.totalPower),rank:number(row.rankNumber??row.rank??index+1),allianceRank:rank(explicitAllianceRank),mainBuildingLevel:row.mainBuildingLevel!=null?number(row.mainBuildingLevel):row.mainCityLv!=null?number(row.mainCityLv):null,sex:sex===1||sex===2?sex:null,allianceTag:text(row.allianceTag??row.abbr)||undefined,allianceName:text(row.allianceName)||undefined,country:text(row.country)||undefined} as GameRosterEntry
 }).filter(row=>row.name&&Number.isFinite(row.power)&&row.power>=0)}

export function parseSavedDarkWarRoster(valueText:string):DarkWarRosterResult{
  const value=JSON.parse(valueText) as AnyRow[]|Record<string,unknown>
  const object=Array.isArray(value)?{}:value
  const rawRows=Array.isArray(value)?value:(object.players??object.members)
  if(!Array.isArray(rawRows)||!rawRows.length)throw new Error('This file does not contain a Dark War alliance roster.')
  const players=playerRows(rawRows as AnyRow[])
  if(!players.length)throw new Error('No valid player rows were found in this file.')
  const capturedAt=text(object.capturedAt)||new Date().toISOString()
  const rawSnapshot=object.stateSnapshot as StateSnapshot|undefined
  const stateSnapshot=rawSnapshot&&Array.isArray(rawSnapshot.playerRanking)&&Array.isArray(rawSnapshot.allianceRanking)?{...rawSnapshot,id:rawSnapshot.id||capturedAt,capturedAt:rawSnapshot.capturedAt||capturedAt}:undefined
  return{players,capturedAt,source:text(object.source)||'dark-war-game-data',stateSnapshot}
}
