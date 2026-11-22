import { Download, Link2, LoaderCircle, Pencil, Play, Plus, RefreshCw, Search, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input, Modal, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import { matchedGamePlayer, usePlannerStore, type GameRosterEntry, type GameRosterMatch } from '../../store/usePlannerStore'
import type { AllianceProfile, Availability, Player, StateSnapshot } from '../../types'
import { formatPower } from '../../utils/format'
import { MAX_PLAYERS } from '../players/constants'
import { AllianceRankBadge, playerAllianceRank } from '../players/AllianceRankBadge'
import { frankyParticipationLabel } from '../players/availability'
import { PlayerSexIcon } from '../players/PlayerSexIcon'
import { checkDarkWarSync, finishDarkWarCapture, loadDarkWarConnection, parseSavedDarkWarRoster, startDarkWarCapture, type DarkWarConnection, type DarkWarRosterResult } from './darkWarSync'
import './alliance.css'
import './alliance-game-data.css'
import './dark-war-sync.css'

const emptyProfile:AllianceProfile={id:'primary',name:'',tag:'',state:'',updatedAt:''}

export function AllianceHub({onEdit,gameDataOpen,onGameDataOpenChange,canEdit=true}:{onEdit:(player:Player|null)=>void;gameDataOpen:boolean;onGameDataOpenChange:(open:boolean)=>void;canEdit?:boolean}){
  const players=usePlannerStore(state=>state.players)
  const deletePlayer=usePlannerStore(state=>state.deletePlayer)
  const syncGameRoster=usePlannerStore(state=>state.syncGameRoster)
  const [profile,setProfile]=useState<AllianceProfile>(emptyProfile)
  const [query,setQuery]=useState('')
  const [availability,setAvailability]=useState<'all'|Availability>('all')
  const [sort,setSort]=useState<'power'|'name'|'hq'>('power')
  const [syncConnection,setSyncConnection]=useState<DarkWarConnection|null>(null)
  const [syncState,setSyncState]=useState<'disconnected'|'checking'|'ready'|'capturing'|'importing'>('checking')
  const [syncMessage,setSyncMessage]=useState('Checking the local Dark War helper…')
  const [syncReviewOpen,setSyncReviewOpen]=useState(false)
  const [pendingRoster,setPendingRoster]=useState<GameRosterEntry[]>([])
  const [pendingStateSnapshot,setPendingStateSnapshot]=useState<StateSnapshot|undefined>()
  const [syncMatches,setSyncMatches]=useState<Record<string,GameRosterMatch>>({})
  const isProfileAlliance=(entry:GameRosterEntry)=>Boolean((entry.uid&&entry.allianceRank)||(profile.tag.trim()&&entry.allianceTag&&entry.allianceTag.trim().toLocaleLowerCase()===profile.tag.trim().toLocaleLowerCase()))
  useEffect(()=>{void db.allianceProfiles.get('primary').then(saved=>saved&&setProfile(saved))},[])
  useEffect(()=>{const connection=loadDarkWarConnection();setSyncConnection(connection);if(!connection){setSyncState('disconnected');setSyncMessage('Start the Windows sync helper to connect this browser.');return}void checkDarkWarSync(connection).then(result=>{setSyncState(result.capturing?'capturing':'ready');setSyncMessage(result.capturing?'Capture is running. Open Alliance ranking → CP in Dark War.':'Local helper connected.')}).catch(()=>{setSyncState('disconnected');setSyncMessage('The saved helper connection is offline. Start the Windows sync helper again.')})},[])
  const beginGameSync=async()=>{if(!syncConnection)return;setSyncState('checking');try{await startDarkWarCapture(syncConnection);setSyncState('capturing');setSyncMessage('Open Alliance members, State player power and State alliance power, then click Finish & import.')}catch(error){setSyncState('ready');setSyncMessage(error instanceof Error?error.message:'Unable to start capture.')}}
  const reviewRoster=(result:DarkWarRosterResult)=>{const entries=result.players;setPendingRoster(entries);setPendingStateSnapshot(result.stateSnapshot);setSyncMatches({});onGameDataOpenChange(false);setSyncReviewOpen(true);setSyncState('ready');const own=entries.filter(isProfileAlliance),exact=own.filter(entry=>matchedGamePlayer(players,entry.name,entry.uid)).length;setSyncMessage(`Read ${entries.length} alliance members · ${exact} matched by UID/name${result.stateSnapshot?` · ${result.stateSnapshot.playerRanking.length} state players · ${result.stateSnapshot.allianceRanking.length} alliances`:''}.`)}
  const finishGameSync=async()=>{if(!syncConnection)return;setSyncState('importing');try{reviewRoster(await finishDarkWarCapture(syncConnection))}catch(error){setSyncState('ready');setSyncMessage(error instanceof Error?error.message:'Unable to import the game data.')}}
  const loadSavedRoster=async(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;try{reviewRoster(parseSavedDarkWarRoster(await file.text()))}catch(error){setSyncMessage(error instanceof Error?error.message:'Unable to read the saved game data.')}finally{event.target.value=''}}
  const applyGameSync=()=>{const selected=pendingRoster.filter(entry=>isProfileAlliance(entry)||(syncMatches[entry.uid??entry.name]&&syncMatches[entry.uid??entry.name]!=='skip'));const summary=syncGameRoster(selected,syncMatches);if(pendingStateSnapshot)void db.stateSnapshots.put(pendingStateSnapshot).then(()=>window.dispatchEvent(new Event('planner-local-change')));setSyncReviewOpen(false);setSyncMessage(`Sync complete · ${summary.added} added · ${summary.updated} members updated${summary.aliased?` · ${summary.aliased} renamed`:''}${pendingStateSnapshot?' · State snapshot saved':''}.`)}
  const ranked=useMemo(()=>players
    .filter(player=>player.name.toLowerCase().includes(query.toLowerCase()))
    .filter(player=>availability==='all'||player.availability===availability)
    .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='hq'?(b.mainBuildingLevel??-1)-(a.mainBuildingLevel??-1)||a.name.localeCompare(b.name):b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,query,availability,sort])

  return <main className="alliance-shell">
    <section className="alliance-hero">
      <div><p className="eyebrow">Alliance center</p><h2>{profile.tag&&<span>[{profile.tag}] </span>}{profile.name||'Your alliance'} <small>#{(profile.state||'716').replace(/^#/,'')}</small></h2><p>Manage the shared player roster used by Rally Planner and Battle Map.</p></div>
      <div className="alliance-actions">{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</div>
    </section>
    <div className="alliance-grid">
      <section className="alliance-card alliance-ranking">
        <header><div><p className="eyebrow">Player directory</p><h3>Alliance members <span>{ranked.length}/{players.length}</span></h3></div>{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</header>
        <div className="alliance-player-tools">
          <div className="alliance-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players"/></div>
          <NativeSelect value={availability} onChange={event=>setAvailability(event.target.value as 'all'|Availability)} aria-label="Filter Franky round participation"><option value="all">All Franky rounds</option><option value="both">Round 1 & Round 2</option><option value="round1">Round 1</option><option value="round2">Round 2</option><option value="unavailable">Not participating</option></NativeSelect>
          <NativeSelect value={sort} onChange={event=>setSort(event.target.value as typeof sort)} aria-label="Sort members"><option value="power">Power: high to low</option><option value="hq">HQ: high to low</option><option value="name">Name: A to Z</option></NativeSelect>
        </div>
        <div className="ranking-head"><span>#</span><button className={sort==='name'?'active':''} onClick={()=>setSort('name')}>Player</button><button className={sort==='hq'?'active':''} onClick={()=>setSort('hq')}>Main Building</button><button className={sort==='power'?'active':''} onClick={()=>setSort('power')}>Power</button><span>Franky rounds</span><span/></div>
        <div className="ranking-list">{ranked.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong className="alliance-player-name"><AllianceRankBadge rank={playerAllianceRank(player)}/><PlayerSexIcon sex={player.sex}/>{player.name}</strong><small>{player.uid?`UID ${player.uid}`:'Manual player'} · F1 {formatPower(player.formations[1].power)} · F2 {formatPower(player.formations[2].power)} · F3 {formatPower(player.formations[3].power)} · F4 {formatPower(player.formations[4].power)}</small></span><strong>Lv. {player.mainBuildingLevel??'—'}</strong><strong>{formatPower(player.totalPower)}</strong><Badge tone={player.availability==='unavailable'?'muted':'blue'}>{frankyParticipationLabel(player.availability)}</Badge><span className="ranking-actions">{canEdit&&<><button onClick={()=>onEdit(player)} aria-label={`Edit ${player.name}`} title="Edit player"><Pencil/></button><button onClick={()=>{if(confirm(`Delete ${player.name} from the alliance? This also removes them from rally plans.`))deletePlayer(player.id)}} aria-label={`Delete ${player.name}`} title="Delete player"><Trash2/></button></>}</span></article>)}{!ranked.length&&<div className="alliance-empty">No players match these filters.</div>}</div>
      </section>
    </div>
    <Modal open={canEdit&&gameDataOpen} onOpenChange={onGameDataOpenChange} title="Dark War game data"><section className={`game-sync game-sync-${syncState}`}><header><div><p className="eyebrow">Game data</p><h3>Alliance & State sync</h3></div>{syncState==='ready'?<Badge tone="green"><Link2/>Connected</Badge>:syncState==='capturing'?<Badge tone="blue"><RefreshCw/>Capturing</Badge>:<Badge tone="muted">Windows app</Badge>}</header><p>{syncMessage}</p>{syncState==='disconnected'&&<a className="btn btn-secondary wide" href="./downloads/KVI-DarkWar-Sync.exe" download><Download/>Download KVI Sync app</a>}{syncState==='ready'&&<Button className="wide" onClick={()=>void beginGameSync()}><Play/>Start capture</Button>}{syncState==='capturing'&&<Button className="wide" onClick={()=>void finishGameSync()}><Square/>Finish & import</Button>}{(syncState==='checking'||syncState==='importing')&&<Button className="wide" disabled><LoaderCircle className="sync-spin"/>{syncState==='importing'?'Reading game data…':'Connecting…'}</Button>}<label className="btn btn-secondary wide game-sync-file"><Upload/>Load saved game data<input type="file" accept=".json,application/json" hidden onChange={event=>void loadSavedRoster(event)}/></label></section></Modal>
    <Modal open={syncReviewOpen} onOpenChange={setSyncReviewOpen} title="Review Dark War alliance sync" wide><div className="sync-review"><p>Members are matched by permanent User ID first. Game name, R1–R5 rank, Main Building Level, gender and total power will be refreshed. Manual formation and Franky participation data stays unchanged.</p><div className="sync-review-summary"><Badge tone="green">{pendingRoster.filter(isProfileAlliance).length} alliance members</Badge><Badge tone="blue">{pendingRoster.filter(entry=>entry.uid&&matchedGamePlayer(players,entry.name,entry.uid)).length} UID matches</Badge>{pendingStateSnapshot&&<Badge tone="amber">State: {pendingStateSnapshot.playerRanking.length} players · {pendingStateSnapshot.allianceRanking.length} alliances</Badge>}</div><div className="sync-review-head"><span>Rank</span><span>Game player</span><span>HQ</span><span>Power</span><span>UID match</span></div><div className="sync-review-list">{pendingRoster.map(entry=>{const own=isProfileAlliance(entry),automatic=own?matchedGamePlayer(players,entry.name,entry.uid):undefined,key=entry.uid??entry.name;return <div key={key} className={automatic?'matched':own?'own-alliance':'other-alliance'}><b>{entry.allianceRank??`#${entry.rank}`}</b><strong>{entry.name}</strong><span>Lv. {entry.mainBuildingLevel??'—'}</span><span>{formatPower(entry.power)}</span>{automatic?<span className="sync-auto-match"><Link2/>{automatic.name}</span>:own?<NativeSelect value={syncMatches[key]??'new'} onChange={event=>setSyncMatches(value=>({...value,[key]:event.target.value}))}><option value="new">Add as new member</option><option value="skip">Skip this player</option><optgroup label="Match existing member">{[...players].sort((a,b)=>a.name.localeCompare(b.name)).map(player=><option key={player.id} value={player.id}>{player.name} · {formatPower(player.totalPower)}</option>)}</optgroup></NativeSelect>:<span>Skipped: other alliance</span>}</div>})}</div><div className="sync-review-actions"><span/><Button variant="secondary" onClick={()=>setSyncReviewOpen(false)}>Cancel</Button><Button onClick={applyGameSync}>Apply game update</Button></div></div></Modal>
  </main>
}
