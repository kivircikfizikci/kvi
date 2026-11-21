import { Database, Download, Link2, LoaderCircle, Pencil, Play, Plus, RefreshCw, Search, Shield, Square, Trash2, UsersRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input, Modal, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import { matchedGamePlayer, usePlannerStore, type GameRosterEntry, type GameRosterMatch } from '../../store/usePlannerStore'
import type { AllianceProfile, Availability, Player } from '../../types'
import { formatPower, now } from '../../utils/format'
import { MAX_PLAYERS } from '../players/constants'
import { AllianceRankBadge, playerAllianceRank } from '../players/AllianceRankBadge'
import { frankyParticipationLabel } from '../players/availability'
import { checkDarkWarSync, finishDarkWarCapture, loadDarkWarConnection, startDarkWarCapture, type DarkWarConnection } from './darkWarSync'
import './alliance.css'
import './dark-war-sync.css'

const emptyProfile:AllianceProfile={id:'primary',name:'',tag:'',state:'',updatedAt:''}

export function AllianceHub({onEdit,onData,canEdit=true}:{onEdit:(player:Player|null)=>void;onData:()=>void;canEdit?:boolean}){
  const players=usePlannerStore(state=>state.players)
  const deletePlayer=usePlannerStore(state=>state.deletePlayer)
  const syncGameRoster=usePlannerStore(state=>state.syncGameRoster)
  const [profile,setProfile]=useState<AllianceProfile>(emptyProfile)
  const [query,setQuery]=useState('')
  const [availability,setAvailability]=useState<'all'|Availability>('all')
  const [sort,setSort]=useState<'power'|'name'>('power')
  const [syncConnection,setSyncConnection]=useState<DarkWarConnection|null>(null)
  const [syncState,setSyncState]=useState<'disconnected'|'checking'|'ready'|'capturing'|'importing'>('checking')
  const [syncMessage,setSyncMessage]=useState('Checking the local Dark War helper…')
  const [syncReviewOpen,setSyncReviewOpen]=useState(false)
  const [pendingRoster,setPendingRoster]=useState<GameRosterEntry[]>([])
  const [syncMatches,setSyncMatches]=useState<Record<string,GameRosterMatch>>({})
  useEffect(()=>{void db.allianceProfiles.get('primary').then(saved=>saved&&setProfile(saved))},[])
  useEffect(()=>{const connection=loadDarkWarConnection();setSyncConnection(connection);if(!connection){setSyncState('disconnected');setSyncMessage('Start the Windows sync helper to connect this browser.');return}void checkDarkWarSync(connection).then(result=>{setSyncState(result.capturing?'capturing':'ready');setSyncMessage(result.capturing?'Capture is running. Open Alliance ranking → CP in Dark War.':'Local helper connected.')}).catch(()=>{setSyncState('disconnected');setSyncMessage('The saved helper connection is offline. Start the Windows sync helper again.')})},[])
  const beginGameSync=async()=>{if(!syncConnection)return;setSyncState('checking');try{await startDarkWarCapture(syncConnection);setSyncState('capturing');setSyncMessage('Now open Alliance ranking → CP in Dark War, then return here and click Finish & import.')}catch(error){setSyncState('ready');setSyncMessage(error instanceof Error?error.message:'Unable to start capture.')}}
  const finishGameSync=async()=>{if(!syncConnection)return;setSyncState('importing');try{const result=await finishDarkWarCapture(syncConnection);setPendingRoster(result.players);setSyncMatches({});setSyncReviewOpen(true);setSyncState('ready');const exact=result.players.filter(entry=>matchedGamePlayer(players,entry.name)).length;setSyncMessage(`Read ${result.players.length} ranked players · ${exact} matched automatically · review ${result.players.length-exact} names.`)}catch(error){setSyncState('ready');setSyncMessage(error instanceof Error?error.message:'Unable to import the ranking.')}}
  const applyGameSync=()=>{const summary=syncGameRoster(pendingRoster,syncMatches);setSyncReviewOpen(false);setSyncMessage(`Sync complete · ${summary.added} added · ${summary.updated} powers updated · ${summary.aliased} name aliases saved${summary.skipped?` · ${summary.skipped} skipped`:''}.`)}
  const saveProfile=(patch:Partial<AllianceProfile>)=>{if(!canEdit)return;const next={...profile,...patch,updatedAt:now()};setProfile(next);void db.allianceProfiles.put(next).then(()=>window.dispatchEvent(new Event('planner-local-change')))}
  const ranked=useMemo(()=>players
    .filter(player=>player.name.toLowerCase().includes(query.toLowerCase()))
    .filter(player=>availability==='all'||player.availability===availability)
    .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,query,availability,sort])
  const totalPower=players.reduce((sum,player)=>sum+player.totalPower,0)
  const availablePlayers=players.filter(player=>player.availability!=='unavailable').length

  return <main className="alliance-shell">
    <section className="alliance-hero">
      <div><p className="eyebrow">Alliance center</p><h2>{profile.name||'Your alliance'} {profile.tag&&<span>[{profile.tag}]</span>}</h2><p>Manage the shared player roster used by Rally Planner and Battle Map.</p></div>
      <div className="alliance-actions"><Button variant="secondary" onClick={onData}><Database/>Data tools</Button>{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</div>
    </section>
    <section className="alliance-stats">
      <article><UsersRound/><span>Members<strong>{players.length}/{MAX_PLAYERS}</strong></span></article>
      <article><Zap/><span>Total power<strong>{formatPower(totalPower)}</strong></span></article>
      <article><Shield/><span>Franky participants<strong>{availablePlayers}</strong></span></article>
      <article><span>Average power<strong>{formatPower(players.length?totalPower/players.length:0)}</strong></span></article>
    </section>
    <div className="alliance-grid">
      <section className="alliance-card alliance-profile">
        <header><div><p className="eyebrow">Profile</p><h3>Alliance information</h3></div><Badge tone="green">Cloud synced</Badge></header>
        <label>Alliance name<Input disabled={!canEdit} value={profile.name} onChange={event=>saveProfile({name:event.target.value})} placeholder="Alliance name"/></label>
        <div><label>Tag<Input disabled={!canEdit} value={profile.tag} onChange={event=>saveProfile({tag:event.target.value})} placeholder="KVI" maxLength={8}/></label><label>State<Input disabled={!canEdit} value={profile.state} onChange={event=>saveProfile({state:event.target.value})} placeholder="State number"/></label></div>
        <p className="profile-note">Player information is shared through the alliance cloud workspace and used by every planner module.</p>
        {canEdit&&<section className={`game-sync game-sync-${syncState}`}><header><div><p className="eyebrow">Game roster</p><h3>Dark War CP sync</h3></div>{syncState==='ready'?<Badge tone="green"><Link2/>Connected</Badge>:syncState==='capturing'?<Badge tone="blue"><RefreshCw/>Capturing</Badge>:<Badge tone="muted">Local helper</Badge>}</header><p>{syncMessage}</p>{syncState==='disconnected'&&<a className="btn btn-secondary wide" href="./downloads/kvi-darkwar-sync.zip" download><Download/>Download Windows helper</a>}{syncState==='ready'&&<Button className="wide" onClick={()=>void beginGameSync()}><Play/>Start capture</Button>}{syncState==='capturing'&&<Button className="wide" onClick={()=>void finishGameSync()}><Square/>Finish & import</Button>}{(syncState==='checking'||syncState==='importing')&&<Button className="wide" disabled><LoaderCircle className="sync-spin"/>{syncState==='importing'?'Reading ranking…':'Connecting…'}</Button>}</section>}
      </section>
      <section className="alliance-card alliance-ranking">
        <header><div><p className="eyebrow">Player directory</p><h3>Alliance members <span>{ranked.length}/{players.length}</span></h3></div>{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</header>
        <div className="alliance-player-tools">
          <div className="alliance-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players"/></div>
          <NativeSelect value={availability} onChange={event=>setAvailability(event.target.value as 'all'|Availability)} aria-label="Filter Franky round participation"><option value="all">All Franky rounds</option><option value="both">Round 1 & Round 2</option><option value="round1">Round 1</option><option value="round2">Round 2</option><option value="unavailable">Not participating</option></NativeSelect>
          <NativeSelect value={sort} onChange={event=>setSort(event.target.value as typeof sort)} aria-label="Sort members"><option value="power">Power: high to low</option><option value="name">Name: A to Z</option></NativeSelect>
        </div>
        <div className="ranking-head"><span>#</span><span>Player</span><span>Power</span><span>Franky rounds</span><span/></div>
        <div className="ranking-list">{ranked.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong className="alliance-player-name"><AllianceRankBadge rank={playerAllianceRank(player)}/>{player.name}</strong><small>F1 {formatPower(player.formations[1].power)} · F2 {formatPower(player.formations[2].power)} · F3 {formatPower(player.formations[3].power)} · F4 {formatPower(player.formations[4].power)}</small></span><strong>{formatPower(player.totalPower)}</strong><Badge tone={player.availability==='unavailable'?'muted':'blue'}>{frankyParticipationLabel(player.availability)}</Badge><span className="ranking-actions">{canEdit&&<><button onClick={()=>onEdit(player)} aria-label={`Edit ${player.name}`} title="Edit player"><Pencil/></button><button onClick={()=>{if(confirm(`Delete ${player.name} from the alliance? This also removes them from rally plans.`))deletePlayer(player.id)}} aria-label={`Delete ${player.name}`} title="Delete player"><Trash2/></button></>}</span></article>)}{!ranked.length&&<div className="alliance-empty">No players match these filters.</div>}</div>
      </section>
    </div>
    <Modal open={syncReviewOpen} onOpenChange={setSyncReviewOpen} title="Review Dark War player matches" wide><div className="sync-review"><p>Exact names and saved aliases update automatically. For each unmatched game name, choose the existing alliance member, add a new member, or skip it. A manual match is remembered for future syncs.</p><div className="sync-review-summary"><Badge tone="green">{pendingRoster.filter(entry=>matchedGamePlayer(players,entry.name)).length} automatic</Badge><Badge tone="amber">{pendingRoster.filter(entry=>!matchedGamePlayer(players,entry.name)).length} need review</Badge></div><div className="sync-review-head"><span>Rank</span><span>Game player</span><span>CP</span><span>Match to alliance roster</span></div><div className="sync-review-list">{pendingRoster.map(entry=>{const automatic=matchedGamePlayer(players,entry.name);return <div key={`${entry.rank}-${entry.name}`} className={automatic?'matched':''}><b>#{entry.rank}</b><strong>{entry.name}</strong><span>{formatPower(entry.power)}</span>{automatic?<span className="sync-auto-match"><Link2/>{automatic.name}</span>:<NativeSelect value={syncMatches[entry.name]??'skip'} onChange={event=>setSyncMatches(value=>({...value,[entry.name]:event.target.value}))}><option value="skip">Skip this player</option><option value="new">Add as new member</option><optgroup label="Match existing member">{[...players].sort((a,b)=>a.name.localeCompare(b.name)).map(player=><option key={player.id} value={player.id}>{player.name} · {formatPower(player.totalPower)}</option>)}</optgroup></NativeSelect>}</div>})}</div><div className="sync-review-actions"><Button variant="secondary" onClick={()=>{const next={...syncMatches};for(const entry of pendingRoster)if(!matchedGamePlayer(players,entry.name))next[entry.name]='new';setSyncMatches(next)}}>Add all unmatched as new</Button><span/><Button variant="secondary" onClick={()=>setSyncReviewOpen(false)}>Cancel</Button><Button onClick={applyGameSync}>Apply roster sync</Button></div></div></Modal>
  </main>
}
