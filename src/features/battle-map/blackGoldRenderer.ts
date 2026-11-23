import type { BlackGoldParticipant } from '../../types'
import { BGB_GRID_SIZE, BGB_OBJECTIVE_SIZE, BGB_PARTICIPANT_SIZE, BGB_TILE_SIZE, BLACK_GOLD_OBJECTIVES, type BlackGoldCamera, type BlackGoldObjective, footprint, projectBlackGold, unprojectBlackGold } from './blackGoldGeometry'

interface BlackGoldRenderOptions{selectedId?:string|null;pointer?:{x:number;y:number}|null;exportMode?:boolean;teamColor:string;teamName:string}
const objectiveColors={
  'golden-ball':'#f6c84a',
  'field-hospital':'#45c58c',
  'military-center':'#ef7b45',
  'oil-refinery':'#d49a42',
  headquarters:'#5c8fd9',
}

function drawFootprint(ctx:CanvasRenderingContext2D,camera:BlackGoldCamera,w:number,h:number,x:number,y:number,size:number,fill:string,stroke:string){
  const rect=footprint(x,y,size),a=projectBlackGold({x:rect.minX-.5,y:rect.minY-.5},camera,w,h),b=projectBlackGold({x:rect.maxX+.5,y:rect.maxY+.5},camera,w,h)
  ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)
}

function label(ctx:CanvasRenderingContext2D,x:number,y:number,title:string,subtitle:string,accent:string){
  ctx.save();ctx.font='700 12px Inter, system-ui';const width=Math.max(ctx.measureText(title).width,ctx.measureText(subtitle).width)+18;ctx.fillStyle='rgba(9,12,14,.9)';ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-width/2,y,width,36,6);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f7f0dc';ctx.fillText(title,x,y+14);ctx.font='10px Inter, system-ui';ctx.fillStyle='#a8adac';ctx.fillText(subtitle,x,y+28);ctx.restore()
}

function objectiveIcon(ctx:CanvasRenderingContext2D,objective:BlackGoldObjective,x:number,y:number,scale:number){
  const color=objective.type==='headquarters'?(objective.side==='red'?'#d45757':'#5b91e8'):objectiveColors[objective.type],r=15*scale
  ctx.save();ctx.translate(x,y);ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=10;ctx.shadowOffsetY=4;ctx.fillStyle=color;ctx.strokeStyle='rgba(255,244,208,.82)';ctx.lineWidth=2
  if(objective.type==='golden-ball'){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#8c6318';ctx.beginPath();ctx.arc(0,0,r*.55,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke()}
  else if(objective.type==='field-hospital'){ctx.beginPath();ctx.roundRect(-r,-r*.78,r*2,r*1.56,4);ctx.fill();ctx.stroke();ctx.fillStyle='#edf8ed';ctx.fillRect(-r*.2,-r*.62,r*.4,r*1.24);ctx.fillRect(-r*.62,-r*.2,r*1.24,r*.4)}
  else if(objective.type==='military-center'){ctx.beginPath();ctx.moveTo(-r,r*.8);ctx.lineTo(-r,-r*.55);ctx.lineTo(-r*.5,-r);ctx.lineTo(0,-r*.55);ctx.lineTo(r*.5,-r);ctx.lineTo(r,-r*.55);ctx.lineTo(r,r*.8);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#2a211e';ctx.fillRect(-r*.18,r*.05,r*.36,r*.75)}
  else if(objective.type==='oil-refinery'){ctx.beginPath();ctx.roundRect(-r,-r*.55,r*2,r*1.25,4);ctx.fill();ctx.stroke();ctx.fillRect(-r*.7,-r,r*.35,r*.5);ctx.beginPath();ctx.arc(r*.45,-r*.48,r*.42,0,Math.PI*2);ctx.fill();ctx.stroke()}
  else{ctx.beginPath();ctx.moveTo(-r,r);ctx.lineTo(-r,-r*.35);ctx.lineTo(0,-r);ctx.lineTo(r,-r*.35);ctx.lineTo(r,r);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#18202a';ctx.fillRect(-r*.18,r*.2,r*.36,r*.8)}
  ctx.restore()
}

function shelter(ctx:CanvasRenderingContext2D,x:number,y:number,color:string,scale:number){
  const r=14*scale;ctx.save();ctx.translate(x,y);ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=8;ctx.shadowOffsetY=4;ctx.fillStyle=color;ctx.strokeStyle='#fff4d7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r,r*.85);ctx.lineTo(-r,-r*.25);ctx.lineTo(0,-r);ctx.lineTo(r,-r*.25);ctx.lineTo(r,r*.85);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(10,15,18,.58)';ctx.fillRect(-r*.2,r*.15,r*.4,r*.7);ctx.restore()
}

export function renderBlackGoldMap(ctx:CanvasRenderingContext2D,w:number,h:number,camera:BlackGoldCamera,participants:BlackGoldParticipant[],options:BlackGoldRenderOptions){
  const sand=ctx.createLinearGradient(0,0,w,h);sand.addColorStop(0,'#4a3b27');sand.addColorStop(.48,'#2f2b21');sand.addColorStop(1,'#211e19');ctx.fillStyle=sand;ctx.fillRect(0,0,w,h)
  const topLeft=projectBlackGold({x:-.5,y:-.5},camera,w,h),bottomRight=projectBlackGold({x:BGB_GRID_SIZE-.5,y:BGB_GRID_SIZE-.5},camera,w,h)
  ctx.fillStyle='rgba(174,133,74,.13)';ctx.fillRect(topLeft.x,topLeft.y,bottomRight.x-topLeft.x,bottomRight.y-topLeft.y)
  ctx.save();ctx.beginPath();ctx.rect(topLeft.x,topLeft.y,bottomRight.x-topLeft.x,bottomRight.y-topLeft.y);ctx.clip()
  const blueCorner=[{x:128,y:0},{x:149,y:0},{x:149,y:21},{x:128,y:21}],redCorner=blueCorner.map(p=>({x:149-p.x,y:149-p.y}))
  for(const [points,color] of [[blueCorner,'rgba(73,127,219,.2)'],[redCorner,'rgba(216,73,73,.2)']] as const){ctx.beginPath();points.forEach((point,index)=>{const p=projectBlackGold(point,camera,w,h);index?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.fillStyle=color;ctx.fill()}
  const corners=[unprojectBlackGold(0,0,camera,w,h),unprojectBlackGold(w,h,camera,w,h)],minX=Math.max(0,Math.floor(Math.min(corners[0].x,corners[1].x))),maxX=Math.min(BGB_GRID_SIZE,Math.ceil(Math.max(corners[0].x,corners[1].x))),minY=Math.max(0,Math.floor(Math.min(corners[0].y,corners[1].y))),maxY=Math.min(BGB_GRID_SIZE,Math.ceil(Math.max(corners[0].y,corners[1].y)))
  const step=camera.zoom>=.45?1:camera.zoom>=.2?5:10;ctx.strokeStyle='rgba(236,218,177,.09)';ctx.lineWidth=1
  for(let x=Math.floor(minX/step)*step;x<=maxX;x+=step){const a=projectBlackGold({x:x-.5,y:minY-.5},camera,w,h),b=projectBlackGold({x:x-.5,y:maxY-.5},camera,w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  for(let y=Math.floor(minY/step)*step;y<=maxY;y+=step){const a=projectBlackGold({x:minX-.5,y:y-.5},camera,w,h),b=projectBlackGold({x:maxX-.5,y:y-.5},camera,w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  ctx.restore()
  const scale=Math.max(.72,Math.min(1.35,camera.zoom*3.8)),showLabels=camera.zoom>=.18||Boolean(options.exportMode)
  for(const objective of BLACK_GOLD_OBJECTIVES){const color=objective.type==='headquarters'?(objective.side==='red'?'#d45757':'#5b91e8'):objectiveColors[objective.type];drawFootprint(ctx,camera,w,h,objective.x,objective.y,BGB_OBJECTIVE_SIZE,`${color}20`,`${color}88`);const p=projectBlackGold(objective,camera,w,h);objectiveIcon(ctx,objective,p.x,p.y,scale);if(showLabels)label(ctx,p.x,p.y+24*scale,objective.name,`${objective.x}, ${objective.y}`,color)}
  const placed=participants.filter(participant=>participant.x!==undefined&&participant.y!==undefined)
  for(const participant of placed){drawFootprint(ctx,camera,w,h,participant.x!,participant.y!,BGB_PARTICIPANT_SIZE,participant.id===options.selectedId?`${options.teamColor}55`:`${options.teamColor}25`,participant.id===options.selectedId?'#ffffff':options.teamColor)}
  for(const participant of placed){const p=projectBlackGold({x:participant.x!,y:participant.y!},camera,w,h);shelter(ctx,p.x,p.y,participant.color||options.teamColor,scale)}
  if(showLabels)for(const participant of placed){const p=projectBlackGold({x:participant.x!,y:participant.y!},camera,w,h);label(ctx,p.x,p.y-46,participant.name,`${participant.x}, ${participant.y}`,participant.color||options.teamColor)}
  if(options.pointer&&camera.zoom>=.2){const x=Math.round(options.pointer.x),y=Math.round(options.pointer.y),p=projectBlackGold({x,y},camera,w,h),size=BGB_TILE_SIZE*camera.zoom;ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);ctx.fillStyle='#ffe7a8';ctx.font='11px Inter, system-ui';ctx.fillText(`${x}, ${y}`,p.x+8,p.y-8)}
  ctx.fillStyle='rgba(7,10,12,.82)';ctx.fillRect(12,h-38,285,26);ctx.fillStyle='#d7cfba';ctx.font='12px Inter, system-ui';ctx.fillText(`${options.teamName} · ${placed.length} placed · ${Math.round(camera.zoom*100)}%`,22,h-21)
}
