import type { MapTower } from '../../types'

export const MAP_MIN = 0
export const MAP_MAX = 999
export const TILE_WIDTH = 60
export const TILE_HEIGHT = 40

export interface MapPoint { x: number; y: number }
export interface Camera { x: number; y: number; zoom: number }
export interface FixedBuilding extends MapPoint { id: string; name: string; type: 'capital'|'turret'|'armory'; size: number }

export const CAPITAL:FixedBuilding={id:'capital',name:'Capital',type:'capital',x:496,y:494,size:15}
export const TURRETS:FixedBuilding[]=[
  {id:'turret-1',name:'Turret 1',type:'turret',x:489,y:501,size:2},
  {id:'turret-2',name:'Turret 2',type:'turret',x:489,y:487,size:2},
  {id:'turret-3',name:'Turret 3',type:'turret',x:504,y:501,size:2},
  {id:'turret-4',name:'Turret 4',type:'turret',x:504,y:487,size:2},
]
export const ARMORIES:FixedBuilding[]=[
  {id:'armory-1',name:'Armory 1',type:'armory',x:462,y:460,size:9},
  {id:'armory-2',name:'Armory 2',type:'armory',x:502,y:460,size:9},
  {id:'armory-3',name:'Armory 3',type:'armory',x:541,y:460,size:9},
  {id:'armory-4',name:'Armory 4',type:'armory',x:541,y:500,size:9},
  {id:'armory-5',name:'Armory 5',type:'armory',x:541,y:539,size:9},
  {id:'armory-6',name:'Armory 6',type:'armory',x:502,y:539,size:9},
  {id:'armory-7',name:'Armory 7',type:'armory',x:462,y:539,size:9},
  {id:'armory-8',name:'Armory 8',type:'armory',x:462,y:500,size:9},
]
export const FIXED_BUILDINGS=[CAPITAL,...TURRETS,...ARMORIES]
export const CAPITAL_BLOCKED={minX:489,maxX:503,minY:487,maxY:501}

export function project(point:MapPoint,camera:Camera,width:number,height:number){
  return{x:width/2+(point.x-camera.x)*TILE_WIDTH*camera.zoom,y:height/2-(point.y-camera.y)*TILE_HEIGHT*camera.zoom}
}
export function unproject(sx:number,sy:number,camera:Camera,width:number,height:number):MapPoint{
  return{x:(sx-width/2)/(TILE_WIDTH*camera.zoom)+camera.x,y:camera.y-(sy-height/2)/(TILE_HEIGHT*camera.zoom)}
}
export function clampCoordinate(value:number){return Math.max(MAP_MIN,Math.min(MAP_MAX,Math.round(value)))}
export const isPanChord=(buttons:number)=>(buttons&3)===3
export function gridStepForZoom(zoom:number){
  if(zoom>=.55)return 1
  if(zoom>=.28)return 2
  if(zoom>=.12)return 5
  if(zoom>=.06)return 10
  if(zoom>=.025)return 25
  return 50
}

export function towerAtScreenPoint(towers:MapTower[],sx:number,sy:number,camera:Camera,width:number,height:number):MapTower|undefined{
  const halfWidth=Math.max(22,TILE_WIDTH*camera.zoom*1.5)
  const halfHeight=Math.max(22,TILE_HEIGHT*camera.zoom*1.5)
  return [...towers].reverse().find(tower=>{const point=project(tower,camera,width,height);return Math.abs(sx-point.x)<=halfWidth&&Math.abs(sy-point.y)<=halfHeight})
}

export interface Rect{minX:number;maxX:number;minY:number;maxY:number}
const footprint=(x:number,y:number,size:number):Rect=>{const half=(size-1)/2;return{minX:x-half,maxX:x+half,minY:y-half,maxY:y+half}}
const overlaps=(a:Rect,b:Rect)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY
export function fixedBuildingFootprint(building:FixedBuilding):Rect{
  if(building.type==='turret')return{minX:building.x-1,maxX:building.x,minY:building.y-1,maxY:building.y}
  if(building.type==='armory')return footprint(building.x,building.y-2,building.size)
  return footprint(building.x,building.y,building.size)
}
export function validateTowerPosition(x:number,y:number,towers:MapTower[],ignoreId?:string):string|null{
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<1||x>998||y<1||y>998)return'Tower center must stay between X:1–998 and Y:1–998.'
  const area=footprint(x,y,3)
  if(overlaps(area,CAPITAL_BLOCKED))return'This 3×3 area overlaps the Capital no-teleport zone.'
  for(const building of [...TURRETS,...ARMORIES])if(overlaps(area,fixedBuildingFootprint(building)))return`This area overlaps ${building.name}.`
  for(const tower of towers)if(tower.id!==ignoreId&&overlaps(area,footprint(tower.x,tower.y,3)))return`This area overlaps ${tower.name}.`
  return null
}

export function exportCamera(points:MapPoint[],width:number,height:number):Camera{
  const all=[...FIXED_BUILDINGS,...points]
  const projected=all.map(p=>({u:p.x*TILE_WIDTH,v:-p.y*TILE_HEIGHT}))
  const minU=Math.min(...projected.map(p=>p.u)),maxU=Math.max(...projected.map(p=>p.u)),minV=Math.min(...projected.map(p=>p.v)),maxV=Math.max(...projected.map(p=>p.v))
  const zoom=Math.max(.008,Math.min(1,(width-180)/Math.max(1,maxU-minU),(height-180)/Math.max(1,maxV-minV)))
  return{x:((minU+maxU)/2)/TILE_WIDTH,y:-((minV+maxV)/2)/TILE_HEIGHT,zoom}
}
