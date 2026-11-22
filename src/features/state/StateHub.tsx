import { Building2, Search, TrendingDown, TrendingUp, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Input } from '../../components/ui'
import { db } from '../../db'
import type { StateAllianceRanking, StatePlayerRanking, StateSnapshot } from '../../types'
import { formatPower } from '../../utils/format'
import './state.css'

const delta=(current:number,previous?:number)=>previous&&previous>0?(current-previous)/previous*100:null
function Change({value,rankChange}:{value:number|null;rankChange?:number}){
  if(value==null)return <span className="state-change state-change-new">New</span>
  const positive=value>0,negative=value<0,Icon=positive?TrendingUp:TrendingDown
  return <span className={`state-change ${positive?'positive':negative?'negative':'neutral'}`}>{value!==0&&<Icon/>}{value>0?'+':''}{value.toFixed(1)}%{rankChange?` · ${rankChange>0?'↑':'↓'}${Math.abs(rankChange)}`:''}</span>
}

export function StateHub(){
  const [snapshots,setSnapshots]=useState<StateSnapshot[]>([]),[mode,setMode]=useState<'players'|'alliances'>('players'),[query,setQuery]=useState('')
  useEffect(()=>{const load=()=>void db.stateSnapshots.orderBy('capturedAt').reverse().limit(12).toArray().then(setSnapshots);load();window.addEventListener('planner-local-change',load);return()=>window.removeEventListener('planner-local-change',load)},[])
  const latest=snapshots[0],previous=snapshots[1]
  const players=useMemo(()=>{if(!latest)return[];const before=new Map((previous?.playerRanking??[]).map(row=>[row.uid,row]));return latest.playerRanking.filter(row=>`${row.name} ${row.allianceName} ${row.allianceTag}`.toLowerCase().includes(query.toLowerCase())).map(row=>({row,before:before.get(row.uid)}))},[latest,previous,query])
  const alliances=useMemo(()=>{if(!latest)return[];const before=new Map((previous?.allianceRanking??[]).map(row=>[row.uid,row]));return latest.allianceRanking.filter(row=>`${row.name} ${row.tag} ${row.leader}`.toLowerCase().includes(query.toLowerCase())).map(row=>({row,before:before.get(row.uid)}))},[latest,previous,query])
  return <main className="state-shell"><section className="state-hero"><div><p className="eyebrow">State intelligence</p><h2>State rankings</h2><p>Power snapshots from Dark War, compared by permanent UID.</p></div>{latest&&<div><strong>{new Date(latest.capturedAt).toLocaleString()}</strong><small>{snapshots.length} saved update{snapshots.length===1?'':'s'}</small></div>}</section>
    {!latest?<section className="state-empty"><Building2/><h3>No state snapshot yet</h3><p>Import a full Dark War game-data JSON from the Alliance tab.</p></section>:<>
      <section className="state-summary"><article><UsersRound/><span>Ranked players<strong>{latest.playerRanking.length}</strong></span></article><article><Building2/><span>Ranked alliances<strong>{latest.allianceRanking.length}</strong></span></article><article><span>Top player<strong>{latest.playerRanking[0]?.name??'—'}</strong><small>{formatPower(latest.playerRanking[0]?.power??0)}</small></span></article><article><span>Top alliance<strong>[{latest.allianceRanking[0]?.tag}] {latest.allianceRanking[0]?.name}</strong><small>{formatPower(latest.allianceRanking[0]?.power??0)}</small></span></article></section>
      <section className="state-card"><header><div className="state-tabs"><button className={mode==='players'?'active':''} onClick={()=>setMode('players')}>Player power</button><button className={mode==='alliances'?'active':''} onClick={()=>setMode('alliances')}>Alliance power</button></div><div className="state-search"><Search/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search ranking"/></div></header>
        {mode==='players'?<PlayerRanking rows={players}/>:<AllianceRanking rows={alliances}/>}</section>
    </>}
  </main>
}

function PlayerRanking({rows}:{rows:{row:StatePlayerRanking;before?:StatePlayerRanking}[]}){return <div className="state-table"><div className="state-table-head"><span>Rank</span><span>Player</span><span>Alliance</span><span>HQ</span><span>Total power</span><span>Change</span></div>{rows.map(({row,before})=><article key={row.uid}><b>#{row.rank}</b><span><strong>{row.name}</strong><small>UID {row.uid}</small></span><Badge tone="muted">{row.allianceTag||'—'}</Badge><span>Lv. {row.level??'—'}</span><strong>{formatPower(row.power)}</strong><Change value={delta(row.power,before?.power)} rankChange={before?before.rank-row.rank:undefined}/></article>)}</div>}
function AllianceRanking({rows}:{rows:{row:StateAllianceRanking;before?:StateAllianceRanking}[]}){return <div className="state-table"><div className="state-table-head"><span>Rank</span><span>Alliance</span><span>Leader</span><span>Members</span><span>Total power</span><span>Change</span></div>{rows.map(({row,before})=><article key={row.uid}><b>#{row.rank}</b><span><strong>[{row.tag}] {row.name}</strong><small>{row.uid}</small></span><span>{row.leader}</span><span>{row.currentMembers}/{row.maxMembers}</span><strong>{formatPower(row.power)}</strong><Change value={delta(row.power,before?.power)} rankChange={before?before.rank-row.rank:undefined}/></article>)}</div>}
