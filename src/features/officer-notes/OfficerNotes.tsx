import { CheckCircle2, ClipboardList, Clock3, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input, Modal, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import type { OfficerNote, OfficerNoteStatus } from '../../types'
import { now, uid } from '../../utils/format'
import { siteUpdates } from './siteUpdates'
import './officer-notes.css'
import './site-updates.css'

const statusLabel:Record<OfficerNoteStatus,string>={requested:'Requested',planned:'Planned',done:'Completed'}
const emptyDraft=()=>({title:'',details:'',status:'requested' as OfficerNoteStatus})

export function OfficerNotes({canEdit,author}:{canEdit:boolean;author:string}){
  const [notes,setNotes]=useState<OfficerNote[]>([]),[open,setOpen]=useState(false),[editingId,setEditingId]=useState<string|null>(null),[draft,setDraft]=useState(emptyDraft())
  useEffect(()=>{void db.officerNotes.orderBy('updatedAt').reverse().toArray().then(setNotes)},[])
  const grouped=useMemo(()=>notes.slice().sort((a,b)=>a.status===b.status?b.updatedAt.localeCompare(a.updatedAt):(['requested','planned','done'].indexOf(a.status)-['requested','planned','done'].indexOf(b.status))),[notes])
  const persist=async(next:OfficerNote[])=>{setNotes(next);await db.transaction('rw',db.officerNotes,async()=>{await db.officerNotes.clear();await db.officerNotes.bulkPut(next)});window.dispatchEvent(new Event('planner-local-change'))}
  const startNew=()=>{setEditingId(null);setDraft(emptyDraft());setOpen(true)}
  const startEdit=(note:OfficerNote)=>{setEditingId(note.id);setDraft({title:note.title,details:note.details,status:note.status});setOpen(true)}
  const save=()=>{if(!canEdit||!draft.title.trim())return;const stamp=now(),existing=notes.find(note=>note.id===editingId);const note:OfficerNote=existing?{...existing,title:draft.title.trim(),details:draft.details.trim(),status:draft.status,updatedAt:stamp}:{id:uid(),title:draft.title.trim(),details:draft.details.trim(),status:draft.status,createdBy:author,createdAt:stamp,updatedAt:stamp};void persist(existing?notes.map(item=>item.id===note.id?note:item):[note,...notes]);setOpen(false)}
  const updateStatus=(note:OfficerNote,status:OfficerNoteStatus)=>void persist(notes.map(item=>item.id===note.id?{...item,status,updatedAt:now()}:item))
  const remove=(note:OfficerNote)=>{if(confirm(`Delete “${note.title}”?`))void persist(notes.filter(item=>item.id!==note.id))}
  return <main className="notes-shell"><section className="notes-hero"><div><p className="eyebrow">Shared workspace</p><h2>Officer Notes</h2><p>Collect requested improvements and organization notes for the alliance planning tools.</p></div>{canEdit&&<Button onClick={startNew}><Plus/>Add note</Button>}</section>
    <div className="notes-columns">
      <aside className="notes-updates" aria-labelledby="notes-updates-heading" lang="tr">
        <h3 id="notes-updates-heading"><History aria-hidden="true" /> Güncellemeler</h3>
        <ul>
          {siteUpdates.map(update => (
            <li key={update.title}>
              <time dateTime={update.date}>{new Date(update.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time>
              <h4>{update.title}</h4>
              <p>{update.summary}</p>
            </li>
          ))}
        </ul>
      </aside>
      <div className="notes-content">
    <section className="notes-summary"><article><ClipboardList/><span>Open requests<strong>{notes.filter(note=>note.status!=='done').length}</strong></span></article><article><Clock3/><span>Planned<strong>{notes.filter(note=>note.status==='planned').length}</strong></span></article><article><CheckCircle2/><span>Completed<strong>{notes.filter(note=>note.status==='done').length}</strong></span></article></section>
    <section className="notes-list">{grouped.map(note=><article key={note.id} className={`note-card ${note.status}`}><header><Badge tone={note.status==='done'?'green':note.status==='planned'?'blue':'amber'}>{statusLabel[note.status]}</Badge><small>Updated {new Date(note.updatedAt).toLocaleString()}</small></header><h3>{note.title}</h3><div className="note-created"><strong>{note.createdBy||'Unknown officer'}</strong><span>Created {new Date(note.createdAt).toLocaleString()}</span></div>{note.details&&<p>{note.details}</p>}{canEdit&&<footer><NativeSelect value={note.status} onChange={event=>updateStatus(note,event.target.value as OfficerNoteStatus)} aria-label={`${note.title} status`}><option value="requested">Requested</option><option value="planned">Planned</option><option value="done">Completed</option></NativeSelect><button onClick={()=>startEdit(note)} aria-label={`Edit ${note.title}`}><Pencil/></button><button onClick={()=>remove(note)} aria-label={`Delete ${note.title}`}><Trash2/></button></footer>}</article>)}{!grouped.length&&<div className="notes-empty"><ClipboardList/><strong>No notes yet</strong><span>{canEdit?'Add the first requested feature or organization note.':'Officers have not added any notes yet.'}</span></div>}</section>
      </div>
    </div>
    <Modal open={canEdit&&open} onOpenChange={setOpen} title={editingId?'Edit note':'Add officer note'}><div className="note-editor"><label>Title<Input autoFocus value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} placeholder="Requested improvement"/></label><label>Details<textarea className="input textarea" value={draft.details} onChange={event=>setDraft({...draft,details:event.target.value})} placeholder="Describe what should be improved or organized…"/></label><label>Status<NativeSelect value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as OfficerNoteStatus})}><option value="requested">Requested</option><option value="planned">Planned</option><option value="done">Completed</option></NativeSelect></label><div className="actions"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={!draft.title.trim()} onClick={save}>Save note</Button></div></div></Modal>
  </main>
}
