import { Database, ImageUp, Pencil, Plus, Search, Shield, UsersRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input } from '../../components/ui'
import { db } from '../../db'
import { MAX_PLAYERS } from '../players/constants'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { AllianceProfile, Player } from '../../types'
import { formatPower, now } from '../../utils/format'
import './alliance.css'

const emptyProfile:AllianceProfile={id:'primary',name:'',tag:'',state:'',updatedAt:''}

export function AllianceHub({onEdit,onData}:{onEdit:(player:Player|null)=>void;onData:()=>void}){
  const players=usePlannerStore(state=>state.players)
  const [profile,setProfile]=useState<AllianceProfile>(emptyProfile)
  const [query,setQuery]=useState('')
  const [screenshot,setScreenshot]=useState<{name:string;url:string}|null>(null)
  useEffect(()=>{void db.allianceProfiles.get('primary').then(saved=>saved&&setProfile(saved))},[])
  useEffect(()=>()=>{if(screenshot)URL.revokeObjectURL(screenshot.url)},[screenshot])
  const saveProfile=(patch:Partial<AllianceProfile>)=>{const next={...profile,...patch,updatedAt:now()};setProfile(next);void db.allianceProfiles.put(next)}
  const ranked=useMemo(()=>[...players].filter(player=>player.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,query])
  const totalPower=players.reduce((sum,player)=>sum+player.totalPower,0)
  const activePlayers=players.filter(player=>player.active).length
  const chooseScreenshot=(file:File|undefined)=>{if(!file)return;if(screenshot)URL.revokeObjectURL(screenshot.url);setScreenshot({name:file.name,url:URL.createObjectURL(file)})}

  return <main className="alliance-shell">
    <section className="alliance-hero">
      <div><p className="eyebrow">Alliance center</p><h2>{profile.name||'Your alliance'} {profile.tag&&<span>[{profile.tag}]</span>}</h2><p>One shared roster for rally planning, battle maps and future organization modules.</p></div>
      <div className="alliance-actions"><Button variant="secondary" onClick={onData}><Database/>Data tools</Button><Button disabled={players.length>=MAX_PLAYERS} onClick={()=>onEdit(null)}><Plus/>Add player</Button></div>
    </section>
    <section className="alliance-stats">
      <article><UsersRound/><span>Roster<strong>{players.length}/{MAX_PLAYERS}</strong></span></article>
      <article><Zap/><span>Total power<strong>{formatPower(totalPower)}</strong></span></article>
      <article><Shield/><span>Active players<strong>{activePlayers}</strong></span></article>
      <article><span>Average power<strong>{formatPower(players.length?totalPower/players.length:0)}</strong></span></article>
    </section>
    <div className="alliance-grid">
      <section className="alliance-card alliance-profile">
        <header><div><p className="eyebrow">Profile</p><h3>Alliance information</h3></div><Badge tone="green">Saved locally</Badge></header>
        <label>Alliance name<Input value={profile.name} onChange={event=>saveProfile({name:event.target.value})} placeholder="Alliance name"/></label>
        <div><label>Tag<Input value={profile.tag} onChange={event=>saveProfile({tag:event.target.value})} placeholder="KVI" maxLength={8}/></label><label>State<Input value={profile.state} onChange={event=>saveProfile({state:event.target.value})} placeholder="State number"/></label></div>
      </section>
      <section className="alliance-card screenshot-import">
        <header><div><p className="eyebrow">Screenshot import</p><h3>Alliance ranking capture</h3></div><Badge tone="amber">Calibration needed</Badge></header>
        <p>Automatic OCR is not enabled yet. Upload a sample ranking screenshot here to verify the image, then send the same screenshot in chat so its name and power columns can be calibrated.</p>
        <label className="screenshot-drop"><ImageUp/><strong>{screenshot?screenshot.name:'Choose ranking screenshot'}</strong><span>PNG, JPG or WEBP</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>chooseScreenshot(event.target.files?.[0])}/></label>
        {screenshot&&<img src={screenshot.url} alt="Alliance ranking screenshot preview"/>}
      </section>
      <section className="alliance-card alliance-ranking">
        <header><div><p className="eyebrow">Shared players</p><h3>Power ranking</h3></div><div className="alliance-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players"/></div></header>
        <div className="ranking-head"><span>#</span><span>Player</span><span>Power</span><span>Availability</span><span/></div>
        <div className="ranking-list">{ranked.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong>{player.name}</strong><small>F1 {formatPower(player.formations[1].power)} · F2 {formatPower(player.formations[2].power)} · F3 {formatPower(player.formations[3].power)} · F4 {formatPower(player.formations[4].power)}</small></span><strong>{formatPower(player.totalPower)}</strong><Badge tone={player.availability==='unavailable'?'muted':'blue'}>{player.availability==='both'?'Both rounds':player.availability.replace('round','R')}</Badge><button onClick={()=>onEdit(player)} aria-label={`Edit ${player.name}`}><Pencil/></button></article>)}{!ranked.length&&<div className="alliance-empty">No players found.</div>}</div>
      </section>
    </div>
  </main>
}
