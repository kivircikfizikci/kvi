import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Copy, GripVertical, Pencil, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge, Input, NativeSelect } from '../../components/ui'
import { isAssigned, usePlannerStore } from '../../store/usePlannerStore'
import type { Player } from '../../types'
import { formatPower } from '../../utils/format'
import { MAX_PLAYERS } from './constants'
import { AllianceRankBadge, playerAllianceRank } from './AllianceRankBadge'
import { frankyParticipationLabel } from './availability'
import { PlayerSexIcon } from './PlayerSexIcon'

function PlayerCard({player,onEdit}:{player:Player;onEdit:(p:Player)=>void}){
 const assigned=usePlannerStore(s=>isAssigned(s,player.id));const canEdit=usePlannerStore(s=>s.cloudCanEdit);const duplicate=usePlannerStore(s=>s.duplicatePlayer);const del=usePlannerStore(s=>s.deletePlayer);const atLimit=usePlannerStore(s=>s.players.length>=MAX_PLAYERS)
 const {attributes,listeners,setNodeRef,isDragging}=useDraggable({id:`player-${player.id}`,disabled:!canEdit,data:{type:'player',playerId:player.id}})
 return <article ref={setNodeRef} className={`player-card ${isDragging?'dragging':''} ${canEdit?'':'read-only'}`}>
  {canEdit&&<button className="drag-handle" {...listeners} {...attributes} aria-label={`Drag ${player.name}`}><GripVertical size={17}/></button>}
  <button className="player-main" onClick={()=>canEdit&&onEdit(player)}><span className="player-title"><strong><AllianceRankBadge rank={playerAllianceRank(player)}/><PlayerSexIcon sex={player.sex}/>{player.name}</strong><span>{formatPower(player.totalPower)}</span></span><span className="formation-pills">{([1,2,3,4] as const).map(f=><span key={f}>F{f} {formatPower(player.formations[f].power)}</span>)}</span><span className="player-meta">HQ {player.mainBuildingLevel??'—'} · Capacity {formatPower(player.rallyCapacity)} · {frankyParticipationLabel(player.availability)}</span></button>
  <div className="player-actions">{assigned&&<Badge tone="blue">R{assigned} assigned</Badge>}{canEdit&&<><button onClick={()=>onEdit(player)} aria-label="Edit"><Pencil/></button><button disabled={atLimit} onClick={()=>duplicate(player.id)} aria-label="Duplicate" title={atLimit?`Maximum ${MAX_PLAYERS} players`:undefined}><Copy/></button><button onClick={()=>{if(confirm(`Delete ${player.name}?`))del(player.id)}} aria-label="Delete"><Trash2/></button></>}</div>
 </article>
}
export function PlayerRoster({onEdit,headerSlot}:{onEdit:(p:Player|null)=>void;headerSlot?:ReactNode}){
 const players=usePlannerStore(s=>s.players);const plan=usePlannerStore(s=>s.plans.find(p=>p.id===s.activePlanId));const [query,setQuery]=useState('');const [sort,setSort]=useState('total');const [availability,setAvailability]=useState('all');const [assignment,setAssignment]=useState('all');const {setNodeRef,isOver}=useDroppable({id:'unassigned-roster',data:{type:'unassigned'}})
 const filtered=useMemo(()=>players.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).filter(p=>availability==='all'||p.availability===availability).filter(p=>{if(assignment==='all'||!plan)return true;const a=plan.rounds[1].some(r=>r.leader?.playerId===p.id||r.participants.some(x=>x.playerId===p.id))||plan.rounds[2].some(r=>r.leader?.playerId===p.id||r.participants.some(x=>x.playerId===p.id));return assignment==='assigned'?a:!a}).sort((a,b)=>{if(sort==='capacity')return(b.rallyCapacity??-1)-(a.rallyCapacity??-1);if(sort.startsWith('f')){const f=Number(sort[1]) as 1|2|3|4;return(b.formations[f].power??-1)-(a.formations[f].power??-1)}return b.totalPower-a.totalPower}),[players,plan,query,sort,availability,assignment])
 return <aside ref={setNodeRef} className={`panel roster ${isOver?'drop-target':''}`}>{headerSlot}<header className="panel-head"><div><p className="eyebrow">Rally roster</p><h2>Players <span>{filtered.length}/{players.length} alliance members</span></h2></div></header>
  <div className="roster-tools"><div className="search"><Search/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search players"/></div><div className="filter-row"><NativeSelect value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort players"><option value="total">Total power</option><option value="f1">Formation 1</option><option value="f2">Formation 2</option><option value="f3">Formation 3</option><option value="f4">Formation 4</option><option value="capacity">Rally capacity</option></NativeSelect><NativeSelect value={availability} onChange={e=>setAvailability(e.target.value)} aria-label="Filter Franky round participation"><option value="all">All Franky rounds</option><option value="both">Round 1 & Round 2</option><option value="round1">Round 1</option><option value="round2">Round 2</option><option value="unavailable">Not participating</option></NativeSelect><NativeSelect value={assignment} onChange={e=>setAssignment(e.target.value)} aria-label="Filter assignment"><option value="all">All assignments</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></NativeSelect></div></div>
  <div className="player-list">{filtered.length?filtered.map(p=><PlayerCard key={p.id} player={p} onEdit={onEdit}/>):<div className="empty"><Search/><strong>No players found</strong><span>Try changing your filters.</span></div>}</div>
 </aside>
}
