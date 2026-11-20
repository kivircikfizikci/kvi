import { useEffect, useState } from 'react'
import { Button, Input, Modal, NativeSelect } from '../../components/ui'
import type { Availability, FormationId, Player } from '../../types'
import { uid } from '../../utils/format'

const blank=():Player=>({id:uid(),name:'',totalPower:0,rallyCapacity:null,formations:{1:{power:null},2:{power:null},3:{power:null},4:{power:null}},availability:'unavailable',allowLeader:true,priority:3,active:false,notes:''})
const numberValue=(v:string)=>v===''?null:Math.max(0,Number(v))
export function PlayerEditor({open,onOpenChange,player,onSave}:{open:boolean;onOpenChange:(v:boolean)=>void;player:Player|null;onSave:(p:Player)=>void}){
 const [draft,setDraft]=useState<Player>(blank());const [error,setError]=useState('')
 useEffect(()=>{if(open){setDraft(player?structuredClone(player):blank());setError('')}},[open,player])
 const setFormationPower=(id:FormationId,value:string)=>setDraft(d=>({...d,formations:{...d.formations,[id]:{power:value===''?null:Math.max(0,Number(value))*1_000_000}}}))
 const save=()=>{if(!draft.name.trim()){setError('Player name is required.');return}if(draft.totalPower<0){setError('Power cannot be negative.');return}onSave({...draft,name:draft.name.trim()});onOpenChange(false)}
 return <Modal open={open} onOpenChange={onOpenChange} title={player?`Edit ${player.name}`:'Add player'} wide>
  <div className="editor-grid">
   <section><h3>General</h3><label>Name<Input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><div className="form-2"><label>Total power<Input type="number" min="0" value={draft.totalPower} onChange={e=>setDraft({...draft,totalPower:Number(e.target.value)})}/></label><label>Rally capacity<Input type="number" min="0" placeholder="Unknown" value={draft.rallyCapacity??''} onChange={e=>setDraft({...draft,rallyCapacity:numberValue(e.target.value)})}/></label></div><label>Notes<textarea className="input textarea" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></section>
   <section><h3>Formations</h3><p className="form-hint">Power is entered in millions. Example: 20.1 = 20.1M.</p><div className="formation-table power-only"><span></span><span>Power (M)</span>{([1,2,3,4] as FormationId[]).map(f=><div className="formation-row" key={f}><strong>F{f}</strong><Input type="number" min="0" step="0.1" placeholder="e.g. 20.1" value={draft.formations[f].power==null?'':draft.formations[f].power/1_000_000} onChange={e=>setFormationPower(f,e.target.value)}/></div>)}</div></section>
   <section><h3>Availability</h3><label>Event rounds<NativeSelect value={draft.availability} onChange={e=>setDraft({...draft,availability:e.target.value as Availability})}><option value="both">Both rounds</option><option value="round1">Round 1 only</option><option value="round2">Round 2 only</option><option value="unavailable">Unavailable</option></NativeSelect></label></section>
   <section><h3>Additional settings</h3><label>Priority<NativeSelect value={draft.priority} onChange={e=>setDraft({...draft,priority:Number(e.target.value)})}>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} {v===5?'(highest)':''}</option>)}</NativeSelect></label><label className="check"><input type="checkbox" checked={draft.allowLeader} onChange={e=>setDraft({...draft,allowLeader:e.target.checked})}/> Allow as rally leader</label><label className="check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Included in Rally Planner</label></section>
  </div>{error&&<p className="form-error">{error}</p>}<div className="actions"><Button variant="secondary" onClick={()=>onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save player</Button></div>
 </Modal>
}
