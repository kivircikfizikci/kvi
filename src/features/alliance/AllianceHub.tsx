import { CheckCircle2, Database, ImageUp, LoaderCircle, Pencil, Plus, Search, Shield, Trash2, UsersRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input } from '../../components/ui'
import { db } from '../../db'
import { MAX_PLAYERS } from '../players/constants'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { AllianceProfile, Player } from '../../types'
import { formatPower, now, uid } from '../../utils/format'
import { extractPlayersFromScreenshots, type ExtractedPlayer } from './screenshotOcr'
import './alliance.css'

const emptyProfile:AllianceProfile={id:'primary',name:'',tag:'',state:'',updatedAt:''}

export function AllianceHub({onEdit,onData}:{onEdit:(player:Player|null)=>void;onData:()=>void}){
  const players=usePlannerStore(state=>state.players)
  const savePlayer=usePlannerStore(state=>state.savePlayer)
  const [profile,setProfile]=useState<AllianceProfile>(emptyProfile)
  const [query,setQuery]=useState('')
  const [screenshots,setScreenshots]=useState<{file:File;url:string}[]>([])
  const [extracting,setExtracting]=useState(false)
  const [progress,setProgress]=useState({value:0,message:''})
  const [extracted,setExtracted]=useState<ExtractedPlayer[]>([])
  const [importStatus,setImportStatus]=useState<string|null>(null)
  useEffect(()=>{void db.allianceProfiles.get('primary').then(saved=>saved&&setProfile(saved))},[])
  useEffect(()=>()=>{screenshots.forEach(item=>URL.revokeObjectURL(item.url))},[screenshots])
  const saveProfile=(patch:Partial<AllianceProfile>)=>{const next={...profile,...patch,updatedAt:now()};setProfile(next);void db.allianceProfiles.put(next)}
  const ranked=useMemo(()=>[...players].filter(player=>player.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,query])
  const totalPower=players.reduce((sum,player)=>sum+player.totalPower,0)
  const activePlayers=players.filter(player=>player.active).length
  const chooseScreenshots=(files:FileList|null)=>{if(!files?.length)return;screenshots.forEach(item=>URL.revokeObjectURL(item.url));setScreenshots([...files].map(file=>({file,url:URL.createObjectURL(file)})));setExtracted([]);setImportStatus(null)}
  const extract=async()=>{if(!screenshots.length)return;setExtracting(true);setImportStatus(null);try{const rows=await extractPlayersFromScreenshots(screenshots.map(item=>item.file),(value,message)=>setProgress({value,message}));setExtracted(rows);setImportStatus(`${rows.length} rows detected. Review them before applying.`)}catch(error){setImportStatus(error instanceof Error?error.message:'Screenshot extraction failed.')}finally{setExtracting(false)}}
  const updateExtracted=(id:string,patch:Partial<ExtractedPlayer>)=>setExtracted(rows=>rows.map(row=>row.id===id?{...row,...patch}:row))
  const applyExtracted=()=>{let applied=0;for(const row of extracted.filter(item=>item.selected&&item.name.trim()&&item.power>0)){const existing=players.find(player=>player.name.localeCompare(row.name,undefined,{sensitivity:'base'})===0);savePlayer(existing?{...existing,name:row.name.trim(),totalPower:row.power}:{id:uid(),name:row.name.trim(),totalPower:row.power,rallyCapacity:null,formations:{1:{power:null},2:{power:null},3:{power:null},4:{power:null}},availability:'both',allowLeader:true,priority:0,active:false,notes:'Imported from alliance ranking screenshot'});applied++}setImportStatus(`${applied} players added or updated in the shared roster.`)}

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
        <header><div><p className="eyebrow">Screenshot import</p><h3>Alliance ranking capture</h3></div><Badge tone={extracted.length?'green':'blue'}>{extracted.length?'Ready to review':'Local OCR'}</Badge></header>
        <p>Select one or more alliance ranking screenshots. Recognition runs in your browser; review every name and power value before applying.</p>
        <label className="screenshot-drop"><ImageUp/><strong>{screenshots.length?`${screenshots.length} screenshots selected`:'Choose ranking screenshots'}</strong><span>PNG, JPG or WEBP · multiple files supported</span><input multiple type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>chooseScreenshots(event.target.files)}/></label>
        {screenshots.length>0&&<div className="screenshot-thumbs">{screenshots.map(item=><img key={item.url} src={item.url} alt={item.file.name}/>)}</div>}
        <Button className="ocr-action" disabled={!screenshots.length||extracting} onClick={()=>void extract()}>{extracting?<LoaderCircle className="spin"/>:<Search/>}{extracting?`${Math.round(progress.value)}% ${progress.message}`:'Extract players'}</Button>
        {extracting&&<div className="ocr-progress"><i style={{width:`${progress.value}%`}}/></div>}
        {importStatus&&<p className="ocr-status">{importStatus}</p>}
        {extracted.length>0&&<div className="ocr-review"><header><strong>Review detected players</strong><span>{extracted.filter(row=>row.selected).length} selected</span></header>{extracted.map(row=><div key={row.id}><input type="checkbox" checked={row.selected} onChange={event=>updateExtracted(row.id,{selected:event.target.checked})}/><Input value={row.name} onChange={event=>updateExtracted(row.id,{name:event.target.value})} aria-label="Player name"/><Input type="number" min="1" value={row.power} onChange={event=>updateExtracted(row.id,{power:Number(event.target.value)})} aria-label="Player power"/><small>{row.confidence}%</small><button onClick={()=>setExtracted(rows=>rows.filter(item=>item.id!==row.id))} aria-label="Remove detected row"><Trash2/></button></div>)}<Button onClick={applyExtracted}><CheckCircle2/>Apply to Players</Button></div>}
      </section>
      <section className="alliance-card alliance-ranking">
        <header><div><p className="eyebrow">Shared players</p><h3>Power ranking</h3></div><div className="alliance-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players"/></div></header>
        <div className="ranking-head"><span>#</span><span>Player</span><span>Power</span><span>Availability</span><span/></div>
        <div className="ranking-list">{ranked.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong>{player.name}</strong><small>F1 {formatPower(player.formations[1].power)} · F2 {formatPower(player.formations[2].power)} · F3 {formatPower(player.formations[3].power)} · F4 {formatPower(player.formations[4].power)}</small></span><strong>{formatPower(player.totalPower)}</strong><Badge tone={player.availability==='unavailable'?'muted':'blue'}>{player.availability==='both'?'Both rounds':player.availability.replace('round','R')}</Badge><button onClick={()=>onEdit(player)} aria-label={`Edit ${player.name}`}><Pencil/></button></article>)}{!ranked.length&&<div className="alliance-empty">No players found.</div>}</div>
      </section>
    </div>
  </main>
}
