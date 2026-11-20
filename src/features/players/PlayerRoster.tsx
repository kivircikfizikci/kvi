import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Copy, GripVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Input, NativeSelect } from '../../components/ui'
import { isAssigned, usePlannerStore } from '../../store/usePlannerStore'
import type { Player } from '../../types'
import { formatPower } from '../../utils/format'

function PlayerCard({player,onEdit}:{player:Player;onEdit:(p:Player)=>void}){
 const assigned=usePlannerStore(s=>isAssigned(s,player.id));const duplicate=usePlannerStore(s=>s.duplicatePlayer);const del=usePlannerStore(s=>s.deletePlayer)
 const {attributes,listeners,setNodeRef,isDragging}=useDraggable({id:`player-${player.id}`,data:{type:'player',playerId:player.id}})
 return <article ref={setNodeRef} className={`player-card ${isDragging?'dragging':''} ${!player.active?'disabled':''}`}>
  <button className="drag-handle" {...listeners} {...attributes} aria-label={`Drag ${player.name}`}><GripVertical size={17}/></button>
  <button className="player-main" onClick={()=>onEdit(player)}><span className="player-title"><strong>{player.name}</strong><span>{formatPower(player.totalPower)}</span></span><span className="formation-pills">{([1,2,3,4] as const).map(f=><span key={f}>F{f} {formatPower(player.formations[f].power)}</span>)}</span><span className="player-meta">Capacity {formatPower(player.rallyCapacity)} · {player.availability==='both'?'Both rounds':player.availability.replace('round','Round ')}</span></button>
  <div className="player-actions">{assigned&&<Badge tone="blue">R{assigned} assigned</Badge>}<button onClick={()=>onEdit(player)} aria-label="Edit"><Pencil/></button><button onClick={()=>duplicate(player.id)} aria-label="Duplicate"><Copy/></button><button onClick={()=>{if(confirm(`Delete ${player.name}?`))del(player.id)}} aria-label="Delete"><Trash2/></button></div>
 </article>
}
export function PlayerRoster({onEdit}:{onEdit:(p:Player|null)=>void}){
 const players=usePlannerStore(s=>s.players);const plan=usePlannerStore(s=>s.plans.find(p=>p.id===s.activePlanId));const [query,setQuery]=useState('');const [sort,setSort]=useState('total');const [availability,setAvailability]=useState('all');const [assignment,setAssignment]=useState('all');const {setNodeRef,isOver}=useDroppable({id:'unassigned-roster',data:{type:'unassigned'}})
 const filtered=useMemo(()=>players.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).filter(p=>availability==='all'||p.availability===availability).filter(p=>{if(assignment==='all'||!plan)return true;const a=plan.rounds[1].some(r=>r.leader?.playerId===p.id||r.participants.some(x=>x.playerId===p.id))||plan.rounds[2].some(r=>r.leader?.playerId===p.id||r.participants.some(x=>x.playerId===p.id));return assignment==='assigned'?a:!a}).sort((a,b)=>{if(sort==='capacity')return(b.rallyCapacity??-1)-(a.rallyCapacity??-1);if(sort.startsWith('f')){const f=Number(sort[1]) as 1|2|3|4;return(b.formations[f].power??-1)-(a.formations[f].power??-1)}return b.totalPower-a.totalPower}),[players,plan,query,sort,availability,assignment])
 return <aside ref={setNodeRef} className={`panel roster ${isOver?'drop-target':''}`}><header className="panel-head"><div><p className="eyebrow">Alliance roster</p><h2>Players <span>{filtered.length}/{players.length}</span></h2></div><Button onClick={()=>onEdit(null)}><Plus size={16}/> Add</Button></header>
  <div className="roster-tools"><div className="search"><Search/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search players"/></div><div className="filter-row"><NativeSelect value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort players"><option value="total">Total power</option><option value="f1">Formation 1</option><option value="f2">Formation 2</option><option value="f3">Formation 3</option><option value="f4">Formation 4</option><option value="capacity">Rally capacity</option></NativeSelect><NativeSelect value={availability} onChange={e=>setAvailability(e.target.value)} aria-label="Filter availability"><option value="all">All availability</option><option value="both">Both</option><option value="round1">Round 1</option><option value="round2">Round 2</option><option value="unavailable">Unavailable</option></NativeSelect><NativeSelect value={assignment} onChange={e=>setAssignment(e.target.value)} aria-label="Filter assignment"><option value="all">All assignments</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></NativeSelect></div></div>
  <div className="player-list">{filtered.length?filtered.map(p=><PlayerCard key={p.id} player={p} onEdit={onEdit}/>):<div className="empty"><Search/><strong>No players found</strong><span>Try changing your filters.</span></div>}</div>
 </aside>
}
