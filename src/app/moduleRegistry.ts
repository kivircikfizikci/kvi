import { MapPinned, Swords, type LucideIcon } from 'lucide-react'

export type PlannerModuleId='rally-planner'|'battle-map'
export interface PlannerModuleDefinition { id:PlannerModuleId; label:string; description:string; icon:LucideIcon }

export const PLANNER_MODULES:PlannerModuleDefinition[]=[
  {id:'rally-planner',label:'Rally Planner',description:'Players, rounds, rally leaders and formations',icon:Swords},
  {id:'battle-map',label:'Battle Map',description:'Coordinate-based Capital Clash planning',icon:MapPinned},
]

export function initialModule(search:string):PlannerModuleId{
  const params=new URLSearchParams(search),requested=params.get('module')
  if(requested==='battle-map'||requested==='rally-planner')return requested
  return params.get('view')==='map'?'battle-map':'rally-planner'
}

export function moduleUrl(id:PlannerModuleId){const url=new URL(window.location.href);url.searchParams.delete('view');url.searchParams.set('module',id);return`${url.pathname}${url.search}${url.hash}`}
