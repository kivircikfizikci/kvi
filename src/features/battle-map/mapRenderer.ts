import type { MapTower } from '../../types'
import { formatPower } from '../../utils/format'
import { ARMORIES, CAPITAL, CAPITAL_BLOCKED, type Camera, type MapPoint, type Rect, clampCoordinate, fixedBuildingFootprint, gridStepForZoom, MAP_MAX, project, TILE_HEIGHT, TILE_WIDTH, TURRETS, unproject } from './mapGeometry'
import { chamberBounds, type HiveAreaChange } from './hiveLayout'
import { SHIELD_ZONE_OUTLINE } from './shieldZone'

type RenderTower = MapTower & { totalPower?: number }

interface RenderOptions {
  selectedId?: string | null
  pointer?: MapPoint | null
  exportMode?: boolean
  hive?: { bounds: Rect; chamber: MapPoint; preview?: HiveAreaChange; chamberPreview?: MapPoint; invalidChamber?: boolean; editing?: boolean; showPower?: boolean }
}
const polygon=(ctx:CanvasRenderingContext2D,points:{x:number;y:number}[])=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
function area(ctx:CanvasRenderingContext2D,camera:Camera,w:number,h:number,minX:number,maxX:number,minY:number,maxY:number,fill:string,stroke:string){const points=[{x:minX-.5,y:minY-.5},{x:maxX+.5,y:minY-.5},{x:maxX+.5,y:maxY+.5},{x:minX-.5,y:maxY+.5}].map(p=>project(p,camera,w,h));polygon(ctx,points);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke()}
export function drawMapLabel(ctx:CanvasRenderingContext2D,x:number,y:number,title:string,subtitle:string,accent:string){ctx.save();ctx.font='700 13px Inter, system-ui, sans-serif';const width=Math.max(ctx.measureText(title).width,ctx.measureText(subtitle).width)+22;const left=x-width/2,top=y;ctx.fillStyle='rgba(8,12,18,.9)';ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(left,top,width,40,6);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f3f6fb';ctx.fillText(title,x,top+16);ctx.font='11px Inter, system-ui, sans-serif';ctx.fillStyle='#9daabc';ctx.fillText(subtitle,x,top+31);ctx.restore()}
function singleLabel(ctx:CanvasRenderingContext2D,x:number,y:number,title:string,accent:string){ctx.save();ctx.font='700 12px Inter, system-ui, sans-serif';const width=ctx.measureText(title).width+18;ctx.fillStyle='rgba(8,12,18,.88)';ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-width/2,y-12,width,24,6);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f3f6fb';ctx.fillText(title,x,y+4);ctx.restore()}
function marker(ctx:CanvasRenderingContext2D,x:number,y:number,type:'capital'|'turret'|'armory'|'tower',color:string,scale:number){ctx.save();ctx.translate(x,y);ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=10;ctx.shadowOffsetY=5;const r=(type==='capital'?28:type==='armory'?19:type==='turret'?16:18)*scale;ctx.fillStyle=color;ctx.strokeStyle=type==='capital'?'#ffe8a0':'rgba(255,255,255,.75)';ctx.lineWidth=2;if(type==='capital'){ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/2;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#161b22';ctx.fillRect(-r*.45,-r*.2,r*.9,r*.72);ctx.fillStyle='#ffd76d';ctx.fillRect(-r*.12,-r*.72,r*.24,r*.52)}else if(type==='armory'){ctx.beginPath();ctx.rect(-r*.72,-r*.55,r*1.44,r*1.1);ctx.fill();ctx.stroke();ctx.fillRect(-r*.42,-r*.92,r*.25,r*.38);ctx.fillRect(r*.17,-r*.92,r*.25,r*.38);ctx.fillStyle='rgba(8,15,24,.5)';ctx.fillRect(-r*.17,-r*.18,r*.34,r*.73)}else if(type==='turret'){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#18202a';ctx.fillRect(-r*.18,-r*.9,r*.36,r*1.8);ctx.fillRect(-r*.9,-r*.18,r*1.8,r*.36)}else{ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.82,r*.72);ctx.lineTo(-r*.82,r*.72);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.8)';ctx.beginPath();ctx.arc(0,r*.05,r*.2,0,Math.PI*2);ctx.fill()}ctx.restore()}
export function drawPlayerMarker(ctx:CanvasRenderingContext2D,x:number,y:number,color:string,scale:number,pawn:boolean){ctx.save();ctx.translate(x,y);ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=9;ctx.shadowOffsetY=4;ctx.fillStyle=color;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;if(!pawn){const r=10*scale;ctx.beginPath();ctx.moveTo(0,r);ctx.bezierCurveTo(-r*.25,r*.35,-r,-r*.05,-r,-r*.72);ctx.bezierCurveTo(-r,-r*1.35,-r*.55,-r*1.78,0,-r*1.78);ctx.bezierCurveTo(r*.55,-r*1.78,r,-r*1.35,r,-r*.72);ctx.bezierCurveTo(r,-r*.05,r*.25,r*.35,0,r);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(8,15,24,.55)';ctx.beginPath();ctx.arc(0,-r*.75,r*.3,0,Math.PI*2);ctx.fill()}else{const r=16*scale;ctx.beginPath();ctx.arc(0,-r*.72,r*.3,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.28,-r*.34);ctx.bezierCurveTo(-r*.18,-r*.12,-r*.2,r*.08,-r*.48,r*.42);ctx.lineTo(r*.48,r*.42);ctx.bezierCurveTo(r*.2,r*.08,r*.18,-r*.12,r*.28,-r*.34);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.roundRect(-r*.62,r*.38,r*1.24,r*.28,r*.12);ctx.fill();ctx.stroke();ctx.beginPath();ctx.roundRect(-r*.78,r*.62,r*1.56,r*.3,r*.12);ctx.fill();ctx.stroke()}ctx.restore()}

export function renderBattleMap(ctx:CanvasRenderingContext2D,w:number,h:number,camera:Camera,towers:RenderTower[],options:RenderOptions={}){
  const offset = options.hive?.preview?.offset
  const visibleTowers = offset ? towers.map(t => ({ ...t, x: t.x + offset.x, y: t.y + offset.y })) : towers
  const chamber = options.hive?.chamberPreview ?? (options.hive && {
    x: options.hive.chamber.x + (offset?.x ?? 0),
    y: options.hive.chamber.y + (offset?.y ?? 0),
  })
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#2a2524');gradient.addColorStop(1,'#17191d');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h)
  polygon(ctx, SHIELD_ZONE_OUTLINE.map(point => project(point, camera, w, h)))
  ctx.fillStyle = 'rgba(164,173,182,.18)'
  ctx.strokeStyle = 'rgba(195,204,213,.62)'
  ctx.lineWidth = 1.5
  ctx.fill()
  ctx.stroke()
  const corners=[unproject(0,0,camera,w,h),unproject(w,0,camera,w,h),unproject(w,h,camera,w,h),unproject(0,h,camera,w,h)]
  const minX=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x))-3)),maxX=Math.min(MAP_MAX,Math.ceil(Math.max(...corners.map(p=>p.x))+3)),minY=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))-3)),maxY=Math.min(MAP_MAX,Math.ceil(Math.max(...corners.map(p=>p.y))+3))
  const step=gridStepForZoom(camera.zoom)
  ctx.strokeStyle='rgba(170,185,204,.1)';ctx.lineWidth=camera.zoom>=.55?1.25:1
  const startX=Math.floor(minX/step)*step,startY=Math.floor(minY/step)*step
  for(let x=startX;x<=maxX;x+=step){const a=project({x:x-.5,y:minY-.5},camera,w,h),b=project({x:x-.5,y:maxY+.5},camera,w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  for(let y=startY;y<=maxY;y+=step){const a=project({x:minX-.5,y:y-.5},camera,w,h),b=project({x:maxX+.5,y:y-.5},camera,w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  area(ctx,camera,w,h,CAPITAL_BLOCKED.minX,CAPITAL_BLOCKED.maxX,CAPITAL_BLOCKED.minY,CAPITAL_BLOCKED.maxY,'rgba(187,63,63,.18)','rgba(255,100,100,.65)')
  for(const b of ARMORIES){const footprint=fixedBuildingFootprint(b);area(ctx,camera,w,h,footprint.minX,footprint.maxX,footprint.minY,footprint.maxY,'rgba(74,112,146,.14)','rgba(103,167,221,.34)')}
  for(const b of TURRETS){const footprint=fixedBuildingFootprint(b);area(ctx,camera,w,h,footprint.minX,footprint.maxX,footprint.minY,footprint.maxY,'rgba(182,118,54,.18)','rgba(246,171,88,.5)')}
  if (options.hive && chamber) {
    const { bounds, preview, editing } = options.hive
    ctx.save()
    ctx.setLineDash([6, 4])
    const box = preview?.bounds ?? bounds
    area(ctx, camera, w, h, box.minX, box.maxX, box.minY, box.maxY, 'rgba(231,177,95,.08)', 'rgba(252,193,108,.85)')
    ctx.restore()
    const reserved = chamberBounds(chamber)
    area(ctx, camera, w, h, reserved.minX, reserved.maxX, reserved.minY, reserved.maxY,
      options.hive.invalidChamber ? 'rgba(240,102,93,.24)' : 'rgba(134,218,104,.24)',
      options.hive.invalidChamber ? '#f48982' : '#a6eb8e')
    if (editing) drawHiveAreaHandles(ctx, camera, w, h, box)
  }
  for(const t of visibleTowers){area(ctx,camera,w,h,t.x-1,t.x+1,t.y-1,t.y+1,t.id===options.selectedId?'rgba(87,180,255,.3)':'rgba(74,146,210,.18)',t.id===options.selectedId?'#7dd3fc':t.color)}
  const scale=Math.max(.72,Math.min(1.35,camera.zoom*5))
  const fixed=[...ARMORIES,...TURRETS,CAPITAL].sort((a,b)=>b.y-a.y||a.x-b.x)
  for(const b of fixed){const footprint=b.type==='turret'?fixedBuildingFootprint(b):null,point=footprint?{x:(footprint.minX+footprint.maxX)/2,y:(footprint.minY+footprint.maxY)/2}:b,p=project(point,camera,w,h),color=b.type==='capital'?'#d9a52e':b.type==='turret'?'#b76b2d':'#5e7f99';marker(ctx,p.x,p.y,b.type,color,scale);if(b.type!=='turret'&&(camera.zoom>=.045||options.exportMode))drawMapLabel(ctx,p.x,p.y+30*scale,b.name,`X:${b.x}  Y:${b.y}`,color)}
  const sortedTowers=[...visibleTowers].sort((a,b)=>b.y-a.y||a.x-b.x),showPlayerDetails=camera.zoom>=.12||Boolean(options.exportMode)
  const showHiveLabels = Boolean(options.hive && camera.zoom >= .38)
  const plotHeight = 3 * TILE_HEIGHT * camera.zoom
  for(const t of sortedTowers){
    const p=project(t,camera,w,h)
    const markerScale = options.hive ? Math.min(scale, camera.zoom * 5.5) : scale
    if (options.hive?.showPower && t.totalPower != null) {
      if (!showHiveLabels) {
        drawHivePowerBadge(ctx, p, t.totalPower, camera.zoom)
        continue
      }
      const compactScale = Math.min(markerScale * .55, (plotHeight - 38) / 28)
      drawPlayerMarker(ctx, p.x, p.y + plotHeight / 2 - 3 - 11 * compactScale,
        t.id === options.selectedId ? '#bceaff' : t.color, compactScale, true)
      continue
    }
    drawPlayerMarker(ctx,p.x,p.y + (showHiveLabels ? 14 : 0),t.id===options.selectedId?'#bceaff':t.color,
      showHiveLabels ? markerScale * .55 : markerScale,showPlayerDetails)
  }
  if (chamber) {
    const { x, y } = chamber
    const point = project({ x: x + 1.5, y: y + 1.5 }, camera, w, h)
    drawHiveChamber(ctx, point, Math.min(19, 53 * camera.zoom))
  }
  if(options.pointer&&camera.zoom>=.2){const p={x:clampCoordinate(options.pointer.x),y:clampCoordinate(options.pointer.y)},s=project(p,camera,w,h),rx=(TILE_WIDTH/2)*camera.zoom,ry=(TILE_HEIGHT/2)*camera.zoom;ctx.strokeStyle='#f5a55a';ctx.lineWidth=2;ctx.strokeRect(s.x-rx,s.y-ry,rx*2,ry*2);ctx.fillStyle='#f6c48e';ctx.font='12px Inter, system-ui';ctx.fillText(`X:${p.x} Y:${p.y}`,s.x+10,s.y-10)}
  ctx.fillStyle='rgba(7,10,15,.78)';ctx.fillRect(12,h-38,255,26);ctx.fillStyle='#c5cfdd';ctx.font='12px Inter, system-ui';ctx.fillText(`Center X:${Math.round(camera.x)} Y:${Math.round(camera.y)}  ·  ${Math.round(camera.zoom*100)}%`,22,h-21)
  if(camera.zoom>=.045||options.exportMode)for(const turret of TURRETS){const footprint=fixedBuildingFootprint(turret),p=project({x:(footprint.minX+footprint.maxX)/2,y:(footprint.minY+footprint.maxY)/2},camera,w,h);singleLabel(ctx,p.x,p.y,turret.name,'#b76b2d')}
  for (const t of sortedTowers) {
    if (options.hive ? !showHiveLabels && t.id !== options.selectedId : !showPlayerDetails) continue
    const p = project(t, camera, w, h)
    if (showHiveLabels) {
      if (p.x < -100 || p.x > w + 100 || p.y < -70 || p.y > h + 70) continue
      drawHiveShelterLabel(ctx, p, t, camera.zoom, t.id === options.selectedId, options.hive?.showPower ? t.totalPower : undefined)
    } else {
      drawMapLabel(ctx, p.x, p.y - (options.hive ? 43 : 31), t.name, `X:${t.x}  Y:${t.y}`, t.color)
    }
  }
}

function drawHiveAreaHandles(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, bounds: Rect) {
  const x = [bounds.minX - .5, (bounds.minX + bounds.maxX) / 2, bounds.maxX + .5]
  const y = [bounds.minY - .5, (bounds.minY + bounds.maxY) / 2, bounds.maxY + .5]
  ctx.fillStyle = '#ffce88'
  ctx.strokeStyle = '#37261d'
  ctx.lineWidth = 1.5
  for (const [column, worldX] of x.entries()) {
    for (const [row, worldY] of y.entries()) {
      if (column === 1 && row === 1) continue
      const point = project({ x: worldX, y: worldY }, camera, width, height)
      ctx.fillRect(point.x - 4, point.y - 4, 8, 8)
      ctx.strokeRect(point.x - 4, point.y - 4, 8, 8)
    }
  }
}

function drawHivePowerBadge(ctx: CanvasRenderingContext2D, point: MapPoint, power: number, zoom: number) {
  const width = 3 * TILE_WIDTH * zoom
  const height = Math.min(15, 3 * TILE_HEIGHT * zoom)
  ctx.save()
  ctx.fillStyle = '#101922'
  ctx.fillRect(point.x - width / 2, point.y - height / 2, width, height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd49a'
  ctx.font = `700 ${Math.min(11, height * .75)}px Inter, system-ui`
  ctx.fillText(formatPower(power), point.x, point.y, width * .9)
  ctx.restore()
}

function drawHiveShelterLabel(ctx: CanvasRenderingContext2D, point: MapPoint, tower: MapTower, zoom: number, selected: boolean, power?: number) {
  const width = 3 * TILE_WIDTH * zoom - 6
  const top = point.y - 1.5 * TILE_HEIGHT * zoom + 3
  ctx.save()
  ctx.fillStyle = selected ? '#254a5f' : '#101922'
  ctx.beginPath()
  ctx.roundRect(point.x - width / 2, top, width, power == null ? 25 : 35, 3)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f2f7fb'
  ctx.font = '700 11px Inter, system-ui'
  ctx.fillText(tower.name, point.x, top + 10, width - 6)
  ctx.fillStyle = '#a9c4d6'
  ctx.font = '10px Inter, system-ui'
  ctx.fillText(`X:${tower.x} Y:${tower.y}`, point.x, top + 21, width - 6)
  if (power != null) {
    ctx.fillStyle = '#ffd49a'
    ctx.font = '700 10px Inter, system-ui'
    ctx.fillText(formatPower(power), point.x, top + 31, width - 6)
  }
  ctx.restore()
}

function drawHiveChamber(ctx: CanvasRenderingContext2D, point: MapPoint, radius: number) {
  ctx.save()
  ctx.translate(point.x, point.y)
  ctx.fillStyle = '#22392e'
  ctx.strokeStyle = '#9ddc83'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(-radius, -.85 * radius, radius * 2, radius * 1.7, radius * .3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#acf672'
  ctx.beginPath()
  ctx.ellipse(0, 0, radius * .48, radius * .62, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
