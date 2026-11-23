import type { BlackGoldParticipant } from '../../types'

export const BGB_GRID_SIZE = 149
export const BGB_TILE_SIZE = 24
export const BGB_PARTICIPANT_SIZE = 3
export const BGB_OBJECTIVE_SIZE = 5
export const BGB_ACTIVE_LIMIT = 20
export const BGB_RESERVE_LIMIT = 10

export interface BlackGoldPoint { x:number; y:number }
export interface BlackGoldCamera { x:number; y:number; zoom:number }
export type BlackGoldObjectiveType='golden-ball'|'field-hospital'|'military-center'|'oil-refinery'|'headquarters'
export interface BlackGoldObjective extends BlackGoldPoint { id:string; name:string; type:BlackGoldObjectiveType; side?:'blue'|'red' }

export const BLACK_GOLD_OBJECTIVES:BlackGoldObjective[]=[
  {id:'golden-ball',name:'Golden Ball',type:'golden-ball',x:74,y:74},
  {id:'military-center-north-west',name:'Military Center',type:'military-center',x:10,y:10},
  {id:'field-hospital-north',name:'Field Hospital',type:'field-hospital',x:74,y:16},
  {id:'headquarters-north-east',name:'Blue HQ',type:'headquarters',side:'blue',x:142,y:6},
  {id:'headquarters-south-west',name:'Red HQ',type:'headquarters',side:'red',x:6,y:142},
  {id:'field-hospital-south',name:'Field Hospital',type:'field-hospital',x:74,y:132},
  {id:'military-center-south-east',name:'Military Center',type:'military-center',x:138,y:138},
  {id:'oil-refinery-west',name:'Oil Refinery',type:'oil-refinery',x:14,y:74},
  {id:'oil-refinery-east',name:'Oil Refinery',type:'oil-refinery',x:134,y:74},
  {id:'oil-refinery-north-west',name:'Oil Refinery',type:'oil-refinery',x:39,y:39},
  {id:'oil-refinery-north-east',name:'Oil Refinery',type:'oil-refinery',x:109,y:39},
  {id:'oil-refinery-south-west',name:'Oil Refinery',type:'oil-refinery',x:39,y:109},
  {id:'oil-refinery-south-east',name:'Oil Refinery',type:'oil-refinery',x:109,y:109},
]

export interface BlackGoldRect { minX:number; maxX:number; minY:number; maxY:number }
export const footprint=(x:number,y:number,size:number):BlackGoldRect=>{const half=(size-1)/2;return{minX:x-half,maxX:x+half,minY:y-half,maxY:y+half}}
export const overlaps=(a:BlackGoldRect,b:BlackGoldRect)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY
export const projectBlackGold=(point:BlackGoldPoint,camera:BlackGoldCamera,width:number,height:number)=>({x:width/2+(point.x-camera.x)*BGB_TILE_SIZE*camera.zoom,y:height/2+(point.y-camera.y)*BGB_TILE_SIZE*camera.zoom})
export const unprojectBlackGold=(sx:number,sy:number,camera:BlackGoldCamera,width:number,height:number):BlackGoldPoint=>({x:(sx-width/2)/(BGB_TILE_SIZE*camera.zoom)+camera.x,y:(sy-height/2)/(BGB_TILE_SIZE*camera.zoom)+camera.y})
export const clampBlackGoldCoordinate=(value:number)=>Math.max(1,Math.min(BGB_GRID_SIZE-2,Math.round(value)))

export function participantAtScreenPoint(participants:BlackGoldParticipant[],sx:number,sy:number,camera:BlackGoldCamera,width:number,height:number){
  const radius=Math.max(19,BGB_TILE_SIZE*camera.zoom*1.7)
  return [...participants].reverse().find(participant=>participant.x!==undefined&&participant.y!==undefined&&Math.hypot(sx-projectBlackGold({x:participant.x,y:participant.y},camera,width,height).x,sy-projectBlackGold({x:participant.x,y:participant.y},camera,width,height).y)<=radius)
}

export function validateBlackGoldPosition(x:number,y:number,participants:BlackGoldParticipant[],ignoreId?:string):string|null{
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<1||x>BGB_GRID_SIZE-2||y<1||y>BGB_GRID_SIZE-2)return`Shelter center must stay between 1 and ${BGB_GRID_SIZE-2}.`
  const area=footprint(x,y,BGB_PARTICIPANT_SIZE)
  for(const objective of BLACK_GOLD_OBJECTIVES)if(overlaps(area,footprint(objective.x,objective.y,BGB_OBJECTIVE_SIZE)))return`This plot overlaps ${objective.name}.`
  for(const participant of participants)if(participant.id!==ignoreId&&participant.x!==undefined&&participant.y!==undefined&&overlaps(area,footprint(participant.x,participant.y,BGB_PARTICIPANT_SIZE)))return`This plot overlaps ${participant.name}.`
  return null
}

export function blackGoldRosterLimitError(role:BlackGoldParticipant['role'],participants:BlackGoldParticipant[]):string|null{
  const limit=role==='active'?BGB_ACTIVE_LIMIT:BGB_RESERVE_LIMIT,count=participants.filter(participant=>participant.role===role).length
  return count>=limit?`${role==='active'?'Active roster':'Reserve list'} is limited to ${limit}.`:null
}

export function blackGoldExportCamera(width:number,height:number):BlackGoldCamera{
  const world=(BGB_GRID_SIZE+4)*BGB_TILE_SIZE
  return{x:(BGB_GRID_SIZE-1)/2,y:(BGB_GRID_SIZE-1)/2,zoom:Math.min((width-100)/world,(height-100)/world)}
}
