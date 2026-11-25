import type { BlackGoldParticipant } from '../../types'
import { BGB_GRID_SIZE, BGB_OBJECTIVE_SIZE, BGB_PARTICIPANT_SIZE, BGB_TILE_SIZE, BLACK_GOLD_OBJECTIVES, type BlackGoldCamera, type BlackGoldObjective, type BlackGoldPoint, type BlackGoldRect, footprint, projectBlackGold, unprojectBlackGold } from './blackGoldGeometry'
import { placeBlackGoldLabel } from './blackGoldLabels'
import { drawPlayerMarker } from './mapRenderer'

interface BlackGoldRenderOptions {
  selectedId?: string | null;
  pointer?: { x: number; y: number } | null;
  exportMode?: boolean;
  teamColor: string;
  teamName: string;
  routes?: { from: {x:number;y:number}; to: {x:number;y:number}; color: string; highlighted: boolean }[];
}
const objectiveColors={
  'golden-ball':'#f6c84a',
  'field-hospital':'#45c58c',
  'military-center':'#ef7b45',
  'oil-refinery':'#d49a42',
  headquarters:'#5c8fd9',
}

interface MapLabel {
  anchor: BlackGoldPoint;
  title: string;
  subtitle?: string;
  color: string;
  selected?: boolean;
}

function drawBlackGoldLabels(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  labels: MapLabel[], blocked: BlackGoldRect[],
) {
  ctx.save();
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  const fitted = labels.flatMap(label => {
    const { anchor, subtitle, selected } = label;
    if (anchor.x < 0 || anchor.x > width || anchor.y < 0 || anchor.y > height) return [];
    const limit = Math.max(30, Math.min(width - 24, selected ? 200 : 102));
    let title = label.title;
    if (ctx.measureText(title).width > limit) {
      const chars = Array.from(title);
      do { chars.pop(); title = chars.join('') + '…'; }
      while (chars.length && ctx.measureText(title).width > limit);
    }
    const boxWidth = Math.max(ctx.measureText(title).width, subtitle ? ctx.measureText(subtitle).width : 0) + 14;
    const rect = placeBlackGoldLabel(anchor, boxWidth, subtitle ? 32 : 20, { width, height }, blocked, selected);
    if (!rect) return [];
    blocked.push(rect);
    return [{ ...label, title, rect }];
  });

  for (const { anchor, rect, color, selected } of fitted) {
    const x = Math.max(rect.minX, Math.min(rect.maxX, anchor.x));
    const y = Math.max(rect.minY, Math.min(rect.maxY, anchor.y));
    const distance = Math.hypot(x - anchor.x, y - anchor.y);
    if (!distance) continue;
    const start = Math.min(16 / distance, 1);
    ctx.globalAlpha = selected ? .95 : .55;
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(anchor.x + (x - anchor.x) * start, anchor.y + (y - anchor.y) * start);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { title, subtitle, color, selected, rect } of fitted) {
    const center = (rect.minX + rect.maxX) / 2;
    ctx.fillStyle = 'rgba(8,12,18,.94)';
    ctx.strokeStyle = selected ? '#fff4d9' : color;
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY, 5);
    ctx.fill();
    ctx.stroke();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f3f6fb';
    ctx.fillText(title, center, rect.minY + 10);
    if (subtitle) {
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#a8b5c6';
      ctx.fillText(subtitle, center, rect.minY + 23);
    }
  }
  ctx.restore();
}

function drawFootprint(ctx:CanvasRenderingContext2D,camera:BlackGoldCamera,w:number,h:number,x:number,y:number,size:number,fill:string,stroke:string){
  const rect=footprint(x,y,size),a=projectBlackGold({x:rect.minX-.5,y:rect.minY-.5},camera,w,h),b=projectBlackGold({x:rect.maxX+.5,y:rect.maxY+.5},camera,w,h)
  ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)
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
  const scale=Math.max(.72,Math.min(1.35,camera.zoom*3.8))
  const showLabels=camera.zoom>=.13||Boolean(options.exportMode)
  const showCoordinates=camera.zoom>=.38||Boolean(options.exportMode)
  const blocked: BlackGoldRect[] = [{ minX: 12, maxX: 297, minY: h - 38, maxY: h - 12 }];
  const objectiveLabels: MapLabel[] = [];
  for(const objective of BLACK_GOLD_OBJECTIVES){
    const color=objective.type==='headquarters'?(objective.side==='red'?'#d45757':'#5b91e8'):objectiveColors[objective.type]
    drawFootprint(ctx,camera,w,h,objective.x,objective.y,BGB_OBJECTIVE_SIZE,`${color}20`,`${color}88`)
    const p=projectBlackGold(objective,camera,w,h)
    objectiveIcon(ctx,objective,p.x,p.y,scale)
    blocked.push(footprint(p.x,p.y,36*scale))
    if(showLabels) objectiveLabels.push({ anchor:p, title:objective.name, color, subtitle:showCoordinates?`X:${objective.x}  Y:${objective.y}`:undefined })
  }
  const placed=participants.filter(participant=>participant.x!==undefined&&participant.y!==undefined)
  for (const route of options.routes ?? []) {
    const from = projectBlackGold(route.from, camera, w, h);
    const to = projectBlackGold(route.to, camera, w, h);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.save();
    ctx.strokeStyle = route.color;
    ctx.fillStyle = route.color;
    const head = route.highlighted ? 16 : 13;
    ctx.globalAlpha = route.highlighted ? 1 : .82;
    ctx.lineWidth = route.highlighted ? 5 : 3.2;
    ctx.lineCap = 'round';
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle - .53), to.y - head * Math.sin(angle - .53));
    ctx.lineTo(to.x - head * Math.cos(angle + .53), to.y - head * Math.sin(angle + .53));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  for(const participant of placed){drawFootprint(ctx,camera,w,h,participant.x!,participant.y!,BGB_PARTICIPANT_SIZE,participant.id===options.selectedId?`${options.teamColor}55`:`${options.teamColor}25`,participant.id===options.selectedId?'#ffffff':options.teamColor)}
  const participantLabels: MapLabel[] = [];
  for(const participant of placed){
    const p=projectBlackGold({x:participant.x!,y:participant.y!},camera,w,h)
    const color=participant.color||options.teamColor
    const selected=participant.id===options.selectedId
    drawPlayerMarker(ctx,p.x,p.y,color,scale,true)
    blocked.push(footprint(p.x,p.y,30*scale))
    if(showLabels||selected) participantLabels.push({ anchor:p, title:participant.name, color, selected, subtitle:selected||showCoordinates?`X:${participant.x}  Y:${participant.y}`:undefined })
  }
  participantLabels.sort((a,b)=>Number(b.selected)-Number(a.selected))
  drawBlackGoldLabels(ctx,w,h,[...participantLabels,...objectiveLabels],blocked)
  if(options.pointer&&camera.zoom>=.2){const x=Math.round(options.pointer.x),y=Math.round(options.pointer.y),p=projectBlackGold({x,y},camera,w,h),size=BGB_TILE_SIZE*camera.zoom;ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);ctx.fillStyle='#ffe7a8';ctx.font='11px Inter, system-ui';ctx.fillText(`${x}, ${y}`,p.x+8,p.y-8)}
  ctx.fillStyle='rgba(7,10,12,.82)';ctx.fillRect(12,h-38,285,26);ctx.fillStyle='#d7cfba';ctx.font='12px Inter, system-ui';ctx.fillText(`${options.teamName} · ${placed.length} placed · ${Math.round(camera.zoom*100)}%`,22,h-21)
}
