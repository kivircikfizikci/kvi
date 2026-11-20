import { useEffect, useState } from 'react'
import { Button, Input, Modal, NativeSelect } from '../../components/ui'
import type { Availability, FormationId, Player } from '../../types'
import { uid } from '../../utils/format'

const blank=():Player=>({id:uid(),name:'',totalPower:0,rallyCapacity:null,formations:{1:{power:null,troops:null},2:{power:null,troops:null},3:{power:null,troops:null}},availability:'unavailable',participationTime:'',allowLeader:true,priority:3,active:true,notes:''})
const numberValue=(v:string)=>v===''?null:Math.max(0,Number(v))
export function PlayerEditor({open,onOpenChange,player,onSave}:{open:boolean;onOpenChange:(v:boolean)=>void;player:Player|null;onSave:(p:Player)=>void}){
 const [draft,setDraft]=useState<Player>(blank());const [error,setError]=useState('')
 useEffect(()=>{if(open){setDraft(player?structuredClone(player):blank());setError('')}},[open,player])
 const setFormation=(id:FormationId,key:'power'|'troops',value:string)=>setDraft(d=>({...d,formations:{...d.formations,[id]:{...d.formations[id],[key]:numberValue(value)}}}))
 const save=()=>{if(!draft.name.trim()){setError('Player name is required.');return}if(draft.totalPower<0){setError('Power cannot be negative.');return}onSave({...draft,name:draft.name.trim()});onOpenChange(false)}
 return <Modal open={open} onOpenChange={onOpenChange} title={player?`Edit ${player.name}`:'Add player'} wide>
  <div className="editor-grid">
   <section><h3>General</h3><label>Name<Input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><div className="form-2"><label>Total power<Input type="number" min="0" value={draft.totalPower} onChange={e=>setDraft({...draft,totalPower:Number(e.target.value)})}/></label><label>Rally capacity<Input type="number" min="0" placeholder="Unknown" value={draft.rallyCapacity??''} onChange={e=>setDraft({...draft,rallyCapacity:numberValue(e.target.value)})}/></label></div><label>Notes<textarea className="input textarea" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></section>
   <section><h3>Formations</h3><div className="formation-table"><span></span><span>Power</span><span>Troops</span>{([1,2,3] as FormationId[]).map(f=><div className="formation-row" key={f}><strong>F{f}</strong><Input type="number" min="0" placeholder="Unknown" value={draft.formations[f].power??''} onChange={e=>setFormation(f,'power',e.target.value)}/><Input type="number" min="0" placeholder="Unknown" value={draft.formations[f].troops??''} onChange={e=>setFormation(f,'troops',e.target.value)}/></div>)}</div></section>
   <section><h3>Availability</h3><label>Event rounds<NativeSelect value={draft.availability} onChange={e=>setDraft({...draft,availability:e.target.value as Availability})}><option value="both">Both rounds</option><option value="round1">Round 1 only</option><option value="round2">Round 2 only</option><option value="unavailable">Unavailable</option></NativeSelect></label><label>Participation time (optional)<Input placeholder="e.g. 18:00–20:00 UTC" value={draft.participationTime} onChange={e=>setDraft({...draft,participationTime:e.target.value})}/></label></section>
   <section><h3>Additional settings</h3><label>Priority<NativeSelect value={draft.priority} onChange={e=>setDraft({...draft,priority:Number(e.target.value)})}>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} {v===5?'(highest)':''}</option>)}</NativeSelect></label><label className="check"><input type="checkbox" checked={draft.allowLeader} onChange={e=>setDraft({...draft,allowLeader:e.target.checked})}/> Allow as rally leader</label><label className="check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Active player</label></section>
  </div>{error&&<p className="form-error">{error}</p>}<div className="actions"><Button variant="secondary" onClick={()=>onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save player</Button></div>
 </Modal>
}
