import { BarChart3, ClipboardList, MapPinned, Swords, UsersRound, type LucideIcon } from 'lucide-react'

export type PlannerModuleId='rally-planner'|'battle-map'|'alliance'|'state'|'officer-notes'
export interface PlannerModuleDefinition { id:PlannerModuleId; label:string; description:string; icon:LucideIcon }

export const PLANNER_MODULES:PlannerModuleDefinition[]=[
  {id:'alliance',label:'Alliance',description:'Alliance profile, roster and power rankings',icon:UsersRound},
  {id:'state',label:'State',description:'State player and alliance rankings with update history',icon:BarChart3},
  {id:'rally-planner',label:'Rally Planner',description:'Players, rounds, rally leaders and formations',icon:Swords},
  {id:'battle-map',label:'Battle Map',description:'Capital Clash and Black Gold battlefield planning',icon:MapPinned},
  {id:'officer-notes',label:'Officer Notes',description:'Shared requests and development notes',icon:ClipboardList},
]

export function initialModule(search:string):PlannerModuleId{
  const params=new URLSearchParams(search),requested=params.get('module')
  if(requested==='battle-map'||requested==='rally-planner'||requested==='alliance'||requested==='state'||requested==='officer-notes')return requested
  return params.get('view')==='map'?'battle-map':'alliance'
}

export function moduleUrl(href=window.location.href){const url=new URL(href);url.searchParams.delete('view');url.searchParams.delete('module');return`${url.pathname}${url.search}${url.hash}`}
