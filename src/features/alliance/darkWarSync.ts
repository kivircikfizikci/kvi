import type { GameRosterEntry } from '../../store/usePlannerStore'

const connectionKey='kvi-dark-war-sync'
const fragmentKey='dark-war-sync'

export interface DarkWarConnection{url:string;token:string}
export interface DarkWarRosterResult{players:GameRosterEntry[];capturedAt:string;source:'alliance-cp-ranking'}

function decodeFragment(value:string){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');return decodeURIComponent(escape(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))))}

export function loadDarkWarConnection():DarkWarConnection|null{
  const params=new URLSearchParams(window.location.hash.replace(/^#/,'')),incoming=params.get(fragmentKey)
  if(incoming){try{const parsed=JSON.parse(decodeFragment(incoming)) as DarkWarConnection;if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(parsed.url)||parsed.token.length<20)throw new Error('Invalid local sync connection.');localStorage.setItem(connectionKey,JSON.stringify(parsed));params.delete(fragmentKey);history.replaceState(null,'',`${location.pathname}${location.search}${params.size?`#${params}`:''}`);return parsed}catch{localStorage.removeItem(connectionKey)}}
  try{const stored=JSON.parse(localStorage.getItem(connectionKey)??'null') as DarkWarConnection|null;return stored&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(stored.url)?stored:null}catch{return null}
}

async function request<T>(connection:DarkWarConnection,path:string,method='GET'):Promise<T>{const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),60_000);try{const response=await fetch(`${connection.url}${path}`,{method,headers:{'X-KVI-Sync-Token':connection.token},signal:controller.signal});const body=await response.json().catch(()=>({error:'The local helper returned an invalid response.'}));if(!response.ok)throw new Error(body.error??'Dark War sync failed.');return body as T}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('The local helper did not respond within 60 seconds. Close it, start it again, and reopen Ranking → CP during capture.');throw error}finally{window.clearTimeout(timer)}}
export const checkDarkWarSync=(connection:DarkWarConnection)=>request<{ok:true;capturing:boolean}>(connection,'/health')
export const startDarkWarCapture=(connection:DarkWarConnection)=>request<{capturing:true}>(connection,'/capture/start','POST')
export const finishDarkWarCapture=(connection:DarkWarConnection)=>request<DarkWarRosterResult>(connection,'/capture/finish','POST')
