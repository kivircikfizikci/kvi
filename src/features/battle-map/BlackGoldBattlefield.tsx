import { Clock3, Crosshair, Download, LocateFixed, MapPin, MousePointer2, Pencil, Plus, Trash2, UserPlus, Users, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Badge, Button, Input, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { BlackGoldParticipant, BlackGoldParticipantRole, BlackGoldTeam, BlackGoldTeamId } from '../../types'
import { now, uid } from '../../utils/format'
import { BGB_ACTIVE_LIMIT, BGB_GRID_SIZE, BGB_RESERVE_LIMIT, BGB_TILE_SIZE, blackGoldExportCamera, blackGoldRosterLimitError, clampBlackGoldCoordinate, participantAtScreenPoint, type BlackGoldCamera, unprojectBlackGold, validateBlackGoldPosition } from './blackGoldGeometry'
import { renderBlackGoldMap } from './blackGoldRenderer'
import './black-gold.css'

type Mode='view'|'edit'|'place'
const TEAM_COLORS:Record<BlackGoldTeamId,string>={'team-a':'#38bdf8','team-b':'#f59e0b'}
const MARKER_COLORS=['#38bdf8','#a78bfa','#34d399','#fb7185','#fbbf24','#60a5fa','#f97316','#22d3ee','#e879f9','#a3e635']
const createTeams=():BlackGoldTeam[]=>[
  {id:'team-a',name:'Team A',eventTime:'',participants:[],updatedAt:now()},
  {id:'team-b',name:'Team B',eventTime:'',participants:[],updatedAt:now()},
]

export function BlackGoldBattlefield({canEdit=true}:{canEdit?:boolean}){
  const canvasRef=useRef<HTMLCanvasElement>(null),wrapRef=useRef<HTMLDivElement>(null)
  const dragRef=useRef<{type:'pending'|'pan'|'participant';sx:number;sy:number;camera:BlackGoldCamera;moved:boolean;participantId?:string;offsetX?:number;offsetY?:number}|null>(null)
  const [size,setSize]=useState({width:1000,height:700}),[camera,setCamera]=useState<BlackGoldCamera>({x:74,y:74,zoom:.18})
  const [teams,setTeams]=useState<BlackGoldTeam[]>(createTeams),[activeTeamId,setActiveTeamId]=useState<BlackGoldTeamId>('team-a'),[loaded,setLoaded]=useState(false)
  const [mode,setMode]=useState<Mode>('view'),[selectedId,setSelectedId]=useState<string|null>(null),[pointer,setPointer]=useState<{x:number;y:number}|null>(null),[message,setMessage]=useState<string|null>(null)
  const [draft,setDraft]=useState<{playerId:string;name:string;role:BlackGoldParticipantRole}>({playerId:'',name:'',role:'active'})
  const players=usePlannerStore(state=>state.players),playerById=useMemo(()=>new Map(players.map(player=>[player.id,player])),[players])
  const team=teams.find(item=>item.id===activeTeamId)??teams[0],teamColor=TEAM_COLORS[activeTeamId]
  const participants=team.participants,activeParticipants=participants.filter(item=>item.role==='active'),reserveParticipants=participants.filter(item=>item.role==='reserve')
  const selected=participants.find(item=>item.id===selectedId)??null,placed=activeParticipants.filter(item=>item.x!==undefined&&item.y!==undefined)
  const usedPlayerIds=useMemo(()=>new Set(participants.flatMap(item=>item.playerId?[item.playerId]:[])),[participants])
  const rosterOptions=useMemo(()=>[...players].filter(player=>!usedPlayerIds.has(player.id)).sort((a,b)=>b.totalPower-a.totalPower||a.name.localeCompare(b.name)),[players,usedPlayerIds])
  const displayName=useCallback((participant:BlackGoldParticipant)=>participant.playerId?playerById.get(participant.playerId)?.name??participant.name:participant.name,[playerById])

  const updateTeam=useCallback((id:BlackGoldTeamId,updater:(value:BlackGoldTeam)=>BlackGoldTeam)=>setTeams(values=>values.map(value=>value.id===id?{...updater(value),updatedAt:now()}:value)),[])
  useEffect(()=>{void db.blackGoldTeams.toArray().then(rows=>{const defaults=createTeams();setTeams(defaults.map(team=>rows.find(row=>row.id===team.id)??team));setLoaded(true)}).catch(()=>{setMessage('Black Gold plans could not be loaded.');setLoaded(true)})},[])
  useEffect(()=>{if(!loaded||!canEdit)return;const timer=window.setTimeout(()=>void db.transaction('rw',db.blackGoldTeams,async()=>{await db.blackGoldTeams.clear();await db.blackGoldTeams.bulkPut(teams)}).then(()=>window.dispatchEvent(new Event('planner-local-change'))),180);return()=>window.clearTimeout(timer)},[teams,loaded,canEdit])
  useEffect(()=>{const node=wrapRef.current;if(!node)return;const observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;setSize({width:Math.max(320,Math.floor(rect.width)),height:Math.max(430,Math.floor(rect.height))})});observer.observe(node);return()=>observer.disconnect()},[])
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);canvas.style.width=`${size.width}px`;canvas.style.height=`${size.height}px`;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);renderBlackGoldMap(ctx,size.width,size.height,camera,activeParticipants.map(item=>({...item,name:displayName(item)})),{selectedId,pointer,teamColor,teamName:team.name})},[size,camera,activeParticipants,selectedId,pointer,teamColor,team.name,displayName])
  useEffect(()=>{setSelectedId(null);setMode('view');setMessage(null)},[activeTeamId])

  const addParticipant=()=>{
    const player=draft.playerId?playerById.get(draft.playerId):null,name=player?.name??draft.name.trim(),limitError=blackGoldRosterLimitError(draft.role,participants)
    if(!name){setMessage('Choose an alliance member or enter a participant name.');return}
    if(limitError){setMessage(limitError);return}
    const stamp=now(),participant:BlackGoldParticipant={id:uid(),playerId:player?.id,name,role:draft.role,color:MARKER_COLORS[participants.length%MARKER_COLORS.length],createdAt:stamp,updatedAt:stamp}
    updateTeam(activeTeamId,value=>({...value,participants:[...value.participants,participant]}));setDraft({playerId:'',name:'',role:draft.role});setSelectedId(participant.id);setMessage(null)
  }
  const removeParticipant=(id:string)=>{updateTeam(activeTeamId,value=>({...value,participants:value.participants.filter(item=>item.id!==id)}));if(selectedId===id)setSelectedId(null)}
  const changeRole=(participant:BlackGoldParticipant)=>{
    const role:BlackGoldParticipantRole=participant.role==='active'?'reserve':'active',limitError=blackGoldRosterLimitError(role,participants)
    if(limitError){setMessage(limitError);return}
    updateTeam(activeTeamId,value=>({...value,participants:value.participants.map(item=>item.id===participant.id?{...item,role,x:role==='reserve'?undefined:item.x,y:role==='reserve'?undefined:item.y,updatedAt:now()}:item)}));setMessage(null)
  }
  const armPlacement=(participant:BlackGoldParticipant)=>{setSelectedId(participant.id);setMode('place');setMessage(`Click a clear 3×3 plot to place ${displayName(participant)}.`)}
  const focusParticipant=(participant:BlackGoldParticipant)=>{setSelectedId(participant.id);if(participant.x!==undefined&&participant.y!==undefined)setCamera(value=>({...value,x:participant.x!,y:participant.y!,zoom:Math.max(value.zoom,.42)}))}
  const setPosition=(id:string,x:number,y:number)=>updateTeam(activeTeamId,value=>({...value,participants:value.participants.map(item=>item.id===id?{...item,x,y,updatedAt:now()}:item)}))
  const clearPosition=(id:string)=>updateTeam(activeTeamId,value=>({...value,participants:value.participants.map(item=>item.id===id?{...item,x:undefined,y:undefined,updatedAt:now()}:item)}))
  const canvasPoint=(event:{clientX:number;clientY:number})=>{const rect=canvasRef.current!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top}}
  const panChord=(buttons:number)=>(buttons&4)===4||(buttons&3)===3
  const onPointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const screen=canvasPoint(event),world=unprojectBlackGold(screen.x,screen.y,camera,size.width,size.height),hit=participantAtScreenPoint(placed,screen.x,screen.y,camera,size.width,size.height)
    if(panChord(event.buttons)){dragRef.current={type:'pan',sx:screen.x,sy:screen.y,camera,moved:false};return}
    if(event.button!==0){dragRef.current=null;return}
    if(hit){setSelectedId(hit.id);if(canEdit&&mode==='edit')dragRef.current={type:'participant',participantId:hit.id,sx:screen.x,sy:screen.y,camera,moved:false,offsetX:hit.x!-world.x,offsetY:hit.y!-world.y};return}
    if(canEdit&&mode==='place'&&selected?.role==='active')dragRef.current={type:'pending',sx:screen.x,sy:screen.y,camera,moved:false}
  }
  const onPointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const screen=canvasPoint(event),world=unprojectBlackGold(screen.x,screen.y,camera,size.width,size.height);setPointer(world);const drag=dragRef.current
    if(panChord(event.buttons)){if(!drag||drag.type!=='pan'){dragRef.current={type:'pan',sx:screen.x,sy:screen.y,camera,moved:false};return}const dx=screen.x-drag.sx,dy=screen.y-drag.sy;drag.moved=true;setCamera({...drag.camera,x:Math.max(0,Math.min(BGB_GRID_SIZE-1,drag.camera.x-dx/(BGB_TILE_SIZE*drag.camera.zoom))),y:Math.max(0,Math.min(BGB_GRID_SIZE-1,drag.camera.y-dy/(BGB_TILE_SIZE*drag.camera.zoom)))});return}
    if(!drag||drag.type==='pan')return;const dx=screen.x-drag.sx,dy=screen.y-drag.sy;if(Math.hypot(dx,dy)>4)drag.moved=true
    if(drag.type==='participant'&&drag.participantId&&(event.buttons&1)===1){const x=clampBlackGoldCoordinate(world.x+(drag.offsetX??0)),y=clampBlackGoldCoordinate(world.y+(drag.offsetY??0));if(!validateBlackGoldPosition(x,y,placed,drag.participantId))setPosition(drag.participantId,x,y)}
  }
  const onPointerUp=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    const drag=dragRef.current;dragRef.current=null;if(drag?.type!=='pending'||drag.moved||!selected)return;const screen=canvasPoint(event),world=unprojectBlackGold(screen.x,screen.y,camera,size.width,size.height),x=clampBlackGoldCoordinate(world.x),y=clampBlackGoldCoordinate(world.y),error=validateBlackGoldPosition(x,y,placed,selected.id);if(error){setMessage(error);return}setPosition(selected.id,x,y);setMode('edit');setMessage(null)
  }
  const onWheel=(event:WheelEvent<HTMLCanvasElement>)=>{event.preventDefault();const screen=canvasPoint(event),world=unprojectBlackGold(screen.x,screen.y,camera,size.width,size.height),zoom=Math.max(.08,Math.min(1.2,camera.zoom*(event.deltaY>0?.82:1.22)));setCamera({x:Math.max(0,Math.min(BGB_GRID_SIZE-1,world.x-(screen.x-size.width/2)/(BGB_TILE_SIZE*zoom))),y:Math.max(0,Math.min(BGB_GRID_SIZE-1,world.y-(screen.y-size.height/2)/(BGB_TILE_SIZE*zoom))),zoom})}
  const exportPng=()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const ctx=canvas.getContext('2d');if(!ctx)return;const exportCamera=blackGoldExportCamera(canvas.width,canvas.height);renderBlackGoldMap(ctx,canvas.width,canvas.height,exportCamera,activeParticipants.map(item=>({...item,name:displayName(item)})),{exportMode:true,teamColor,teamName:team.name});ctx.fillStyle='rgba(7,10,13,.94)';ctx.fillRect(0,0,canvas.width,70);ctx.fillStyle='#f1b84b';ctx.font='700 15px Inter, system-ui';ctx.fillText('KVI · DARK WAR: SURVIVAL · BLACK GOLD BATTLEFIELD',28,27);ctx.fillStyle='#f4f7fb';ctx.font='700 24px Inter, system-ui';ctx.fillText(`${team.name}${team.eventTime?` · ${team.eventTime}`:''}`,28,55);ctx.textAlign='right';ctx.fillStyle='#aab3bf';ctx.font='13px Inter, system-ui';ctx.fillText(`${activeParticipants.length}/20 active · ${reserveParticipants.length}/10 reserve`,canvas.width-28,43);canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`kvi-black-gold-${team.name.toLowerCase().replace(/\s+/g,'-')}.png`;anchor.click();URL.revokeObjectURL(url)},'image/png')}

  const rosterSection=(role:BlackGoldParticipantRole,list:BlackGoldParticipant[],limit:number)=><section className="bgb-roster-section"><h3>{role==='active'?'Active roster':'Reserves'} <span>{list.length}/{limit}</span></h3>{list.length?list.map(participant=><div key={participant.id} className={`bgb-roster-row ${selectedId===participant.id?'active':''}`}><button className="bgb-person" onClick={()=>focusParticipant(participant)}><i style={{background:participant.color}}/><span><strong>{displayName(participant)}</strong><small>{participant.x!==undefined?`${participant.x}, ${participant.y}`:role==='active'?'Not placed':'Reserve'}</small></span>{participant.x!==undefined&&<LocateFixed/>}</button>{canEdit&&<div className="bgb-row-actions">{role==='active'&&<button title={participant.x===undefined?'Place on map':'Move on map'} aria-label={`Place ${displayName(participant)}`} onClick={()=>armPlacement(participant)}><MapPin/></button>}<button title={role==='active'?'Move to reserves':'Move to active roster'} aria-label={`Change role for ${displayName(participant)}`} onClick={()=>changeRole(participant)}><Users/></button>{participant.x!==undefined&&<button title="Clear map position" aria-label={`Clear position for ${displayName(participant)}`} onClick={()=>clearPosition(participant.id)}><Crosshair/></button>}<button className="danger" title="Remove participant" aria-label={`Remove ${displayName(participant)}`} onClick={()=>removeParticipant(participant.id)}><Trash2/></button></div>}</div>):<div className="map-empty">No {role==='active'?'active participants':'reserves'} yet.</div>}</section>

  return <main className="battle-shell bgb-shell">
    <aside className="map-sidebar bgb-sidebar">
      <header><p className="eyebrow">Black Gold Battlefield</p><h2>{team.name} Plan</h2></header>
      <div className="bgb-team-tabs">{teams.map(item=><button key={item.id} className={item.id===activeTeamId?'active':''} onClick={()=>setActiveTeamId(item.id)}><span>{item.name}</span><small>{item.eventTime||'Time not set'}</small></button>)}</div>
      <section className="bgb-event-time"><label><Clock3/>Event time<Input disabled={!canEdit} type="time" value={team.eventTime} onChange={event=>updateTeam(activeTeamId,value=>({...value,eventTime:event.target.value}))}/></label><div><Badge tone={activeParticipants.length===20?'green':'blue'}>{activeParticipants.length}/20 active</Badge><Badge tone={reserveParticipants.length===10?'amber':'muted'}>{reserveParticipants.length}/10 reserve</Badge></div></section>
      <div className={`mode-switch ${canEdit?'':'read-only'}`}><button className={mode==='view'?'active':''} onClick={()=>setMode('view')}><MousePointer2/>View</button>{canEdit&&<><button className={mode==='edit'?'active':''} onClick={()=>setMode('edit')}><Pencil/>Move</button><button className={mode==='place'?'active':''} disabled={!selected||selected.role!=='active'} onClick={()=>selected&&armPlacement(selected)}><Plus/>Place</button></>}</div>
      {message&&<div className="map-message">{message}<button onClick={()=>setMessage(null)}>×</button></div>}
      {canEdit&&<section className="map-form bgb-add-form"><h3>Add participant <UserPlus/></h3><label>Alliance member<NativeSelect value={draft.playerId} onChange={event=>{const player=playerById.get(event.target.value);setDraft(value=>({...value,playerId:event.target.value,name:player?.name??value.name}))}}><option value="">Custom participant</option>{rosterOptions.map(player=><option key={player.id} value={player.id}>{player.name}</option>)}</NativeSelect></label><label>Name<Input disabled={Boolean(draft.playerId)} value={draft.name} onChange={event=>setDraft(value=>({...value,name:event.target.value}))} placeholder="Participant name"/></label><label>Roster<NativeSelect value={draft.role} onChange={event=>setDraft(value=>({...value,role:event.target.value as BlackGoldParticipantRole}))}><option value="active">Active participant</option><option value="reserve">Reserve</option></NativeSelect></label><Button onClick={addParticipant}><UserPlus/>Add to {team.name}</Button></section>}
      {rosterSection('active',activeParticipants,BGB_ACTIVE_LIMIT)}
      {rosterSection('reserve',reserveParticipants,BGB_RESERVE_LIMIT)}
    </aside>
    <section className="map-stage"><div className="map-toolbar"><div><Button variant="secondary" onClick={()=>setCamera(value=>({...value,zoom:Math.min(1.2,value.zoom*1.25)}))}><ZoomIn/></Button><Button variant="secondary" onClick={()=>setCamera(value=>({...value,zoom:Math.max(.08,value.zoom/1.25)}))}><ZoomOut/></Button><Button variant="secondary" onClick={()=>setCamera({x:74,y:74,zoom:.18})}><Crosshair/>Fit</Button></div><span>{Math.round(camera.zoom*100)}% · Pan: middle or left + right drag</span><Button onClick={exportPng}><Download/>Export PNG</Button></div><div ref={wrapRef} className={`map-canvas-wrap bgb-canvas-wrap mode-${mode}`}><canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={()=>{dragRef.current=null}} onPointerLeave={()=>setPointer(null)} onContextMenu={event=>event.preventDefault()} onWheel={onWheel}/><div className="map-legend"><span><i className="legend-bgb-objective"/>Fixed objective</span><span><i style={{background:teamColor}}/>Active shelter</span><span><i className="legend-bgb-hq"/>HQ territory</span></div></div></section>
  </main>
}
