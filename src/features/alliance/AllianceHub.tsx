import { Database, Pencil, Plus, Search, Shield, Trash2, UsersRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { AllianceProfile, Availability, Player } from '../../types'
import { formatPower, now } from '../../utils/format'
import { MAX_PLAYERS } from '../players/constants'
import './alliance.css'

const emptyProfile:AllianceProfile={id:'primary',name:'',tag:'',state:'',updatedAt:''}

export function AllianceHub({onEdit,onData,canEdit=true}:{onEdit:(player:Player|null)=>void;onData:()=>void;canEdit?:boolean}){
  const players=usePlannerStore(state=>state.players)
  const deletePlayer=usePlannerStore(state=>state.deletePlayer)
  const [profile,setProfile]=useState<AllianceProfile>(emptyProfile)
  const [query,setQuery]=useState('')
  const [availability,setAvailability]=useState<'all'|Availability>('all')
  const [scope,setScope]=useState<'all'|'rally'|'roster'>('all')
  const [sort,setSort]=useState<'power'|'name'>('power')
  useEffect(()=>{void db.allianceProfiles.get('primary').then(saved=>saved&&setProfile(saved))},[])
  const saveProfile=(patch:Partial<AllianceProfile>)=>{if(!canEdit)return;const next={...profile,...patch,updatedAt:now()};setProfile(next);void db.allianceProfiles.put(next).then(()=>window.dispatchEvent(new Event('planner-local-change')))}
  const ranked=useMemo(()=>players
    .filter(player=>player.name.toLowerCase().includes(query.toLowerCase()))
    .filter(player=>availability==='all'||player.availability===availability)
    .filter(player=>scope==='all'||(scope==='rally'?player.active:!player.active))
    .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,query,availability,scope,sort])
  const totalPower=players.reduce((sum,player)=>sum+player.totalPower,0)
  const activePlayers=players.filter(player=>player.active).length

  return <main className="alliance-shell">
    <section className="alliance-hero">
      <div><p className="eyebrow">Alliance center</p><h2>{profile.name||'Your alliance'} {profile.tag&&<span>[{profile.tag}]</span>}</h2><p>Manage the shared player roster used by Rally Planner and Battle Map.</p></div>
      <div className="alliance-actions"><Button variant="secondary" onClick={onData}><Database/>Data tools</Button>{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</div>
    </section>
    <section className="alliance-stats">
      <article><UsersRound/><span>Members<strong>{players.length}/{MAX_PLAYERS}</strong></span></article>
      <article><Zap/><span>Total power<strong>{formatPower(totalPower)}</strong></span></article>
      <article><Shield/><span>In Rally Planner<strong>{activePlayers}</strong></span></article>
      <article><span>Average power<strong>{formatPower(players.length?totalPower/players.length:0)}</strong></span></article>
    </section>
    <div className="alliance-grid">
      <section className="alliance-card alliance-profile">
        <header><div><p className="eyebrow">Profile</p><h3>Alliance information</h3></div><Badge tone="green">Saved locally</Badge></header>
        <label>Alliance name<Input disabled={!canEdit} value={profile.name} onChange={event=>saveProfile({name:event.target.value})} placeholder="Alliance name"/></label>
        <div><label>Tag<Input disabled={!canEdit} value={profile.tag} onChange={event=>saveProfile({tag:event.target.value})} placeholder="KVI" maxLength={8}/></label><label>State<Input disabled={!canEdit} value={profile.state} onChange={event=>saveProfile({state:event.target.value})} placeholder="State number"/></label></div>
        <p className="profile-note">Player information is stored locally in this browser and shared across every planner module.</p>
      </section>
      <section className="alliance-card alliance-ranking">
        <header><div><p className="eyebrow">Player directory</p><h3>Alliance members <span>{ranked.length}/{players.length}</span></h3></div>{canEdit&&<Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button>}</header>
        <div className="alliance-player-tools">
          <div className="alliance-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players"/></div>
          <NativeSelect value={availability} onChange={event=>setAvailability(event.target.value as 'all'|Availability)} aria-label="Filter availability"><option value="all">All availability</option><option value="both">Both rounds</option><option value="round1">Round 1</option><option value="round2">Round 2</option><option value="unavailable">Unavailable</option></NativeSelect>
          <NativeSelect value={scope} onChange={event=>setScope(event.target.value as typeof scope)} aria-label="Filter planner status"><option value="all">All members</option><option value="rally">In Rally Planner</option><option value="roster">Roster only</option></NativeSelect>
          <NativeSelect value={sort} onChange={event=>setSort(event.target.value as typeof sort)} aria-label="Sort members"><option value="power">Power: high to low</option><option value="name">Name: A to Z</option></NativeSelect>
        </div>
        <div className="ranking-head"><span>#</span><span>Player</span><span>Power</span><span>Availability</span><span>Planner</span><span/></div>
        <div className="ranking-list">{ranked.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong>{player.name}</strong><small>F1 {formatPower(player.formations[1].power)} · F2 {formatPower(player.formations[2].power)} · F3 {formatPower(player.formations[3].power)} · F4 {formatPower(player.formations[4].power)}</small></span><strong>{formatPower(player.totalPower)}</strong><Badge tone={player.availability==='unavailable'?'muted':'blue'}>{player.availability==='both'?'Both':player.availability.replace('round','R')}</Badge><Badge tone={player.active?'green':'muted'}>{player.active?'Rally':'Roster'}</Badge><span className="ranking-actions">{canEdit&&<><button onClick={()=>onEdit(player)} aria-label={`Edit ${player.name}`} title="Edit player"><Pencil/></button><button onClick={()=>{if(confirm(`Delete ${player.name} from the alliance? This also removes them from rally plans.`))deletePlayer(player.id)}} aria-label={`Delete ${player.name}`} title="Delete player"><Trash2/></button></>}</span></article>)}{!ranked.length&&<div className="alliance-empty">No players match these filters.</div>}</div>
      </section>
    </div>
  </main>
}
