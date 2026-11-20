export interface ExtractedPlayer { id:string; name:string; power:number; confidence:number; selected:boolean }

const luminance=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b
const distance=(r:number,g:number,b:number,background:[number,number,number])=>Math.hypot(r-background[0],g-background[1],b-background[2])

export function normalizeOcrPower(raw:string):number|null{
  let value=raw.toUpperCase().replace(/[OQD]/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/[^0-9]/g,'')
  if(value.length<8||value.length>9)return null
  const parsed=Number(value)
  return Number.isFinite(parsed)&&parsed>0?parsed:null
}

export function deduplicateRowsInOrder(rows:ExtractedPlayer[]):ExtractedPlayer[]{
  const names=new Set<string>(),result:ExtractedPlayer[]=[]
  for(const row of rows){
    const key=row.name.trim().toLocaleLowerCase()
    if(key&&names.has(key))continue
    if(key)names.add(key)
    result.push(row)
  }
  return result
}

function cleanName(raw:string){return raw.replace(/[\[\]{}|]/g,'').replace(/\s+/g,' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').trim()}
function findNameBands(ctx:CanvasRenderingContext2D,width:number,height:number){
  const pixels=ctx.getImageData(0,0,width,height).data,active:boolean[]=[]
  for(let y=0;y<height;y++){
    const bgOffset=(y*width+Math.floor(width*.66))*4,background:[number,number,number]=[pixels[bgOffset],pixels[bgOffset+1],pixels[bgOffset+2]],bgLum=luminance(...background)
    let ink=0
    for(let x=4;x<width*.62;x+=2){const offset=(y*width+x)*4,r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];if(luminance(r,g,b)<bgLum-18&&distance(r,g,b,background)>28)ink++}
    active[y]=ink>=3
  }
  const bands:{start:number;end:number}[]=[];let start=-1,gap=0
  for(let y=0;y<=height;y++){if(active[y]){if(start<0)start=y;gap=0}else if(start>=0){gap++;if(gap>2){const end=y-gap;if(end-start>=5)bands.push({start,end});start=-1;gap=0}}}
  return bands
}
function binaryCrop(ctx:CanvasRenderingContext2D,sx:number,sy:number,sw:number,sh:number,kind:'name'|'power'){
  const source=ctx.getImageData(sx,sy,sw,sh),data=source.data
  let br=0,bg=0,bb=0,count=0
  const sampleX=kind==='name'?sw-3:2
  for(let y=0;y<sh;y++){for(let dx=0;dx<3;dx++){const offset=(y*sw+Math.max(0,Math.min(sw-1,sampleX+dx-1)))*4;br+=data[offset];bg+=data[offset+1];bb+=data[offset+2];count++}}
  const background:[number,number,number]=[br/count,bg/count,bb/count],bgLum=luminance(...background)
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],pixelLum=luminance(r,g,b),delta=distance(r,g,b,background),ink=kind==='power'?delta>18&&(pixelLum<bgLum-12||pixelLum>bgLum+7):pixelLum<bgLum-16&&delta>24;const color=ink?0:255;data[i]=color;data[i+1]=color;data[i+2]=color;data[i+3]=255}
  const small=document.createElement('canvas');small.width=sw;small.height=sh;small.getContext('2d')!.putImageData(source,0,0)
  const scale=3,padding=8,result=document.createElement('canvas');result.width=(sw+padding*2)*scale;result.height=(sh+padding*2)*scale
  const output=result.getContext('2d')!;output.fillStyle='#fff';output.fillRect(0,0,result.width,result.height);output.imageSmoothingEnabled=false;output.drawImage(small,padding*scale,padding*scale,sw*scale,sh*scale)
  return result
}
async function imageCanvas(file:File){const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();return canvas}

export async function extractPlayersFromScreenshots(files:File[],onProgress:(value:number,message:string)=>void):Promise<ExtractedPlayer[]>{
  const prepared:{name:HTMLCanvasElement;power:HTMLCanvasElement}[]=[]
  for(let fileIndex=0;fileIndex<files.length;fileIndex++){
    onProgress(2+fileIndex/files.length*8,`Preparing ${files[fileIndex].name}`)
    const canvas=await imageCanvas(files[fileIndex]),ctx=canvas.getContext('2d')!,bands=findNameBands(ctx,canvas.width,canvas.height)
    for(const band of bands){const sy=Math.max(0,band.start-7),sh=Math.min(canvas.height,band.end+8)-sy;prepared.push({name:binaryCrop(ctx,0,sy,Math.floor(canvas.width*.68),sh,'name'),power:binaryCrop(ctx,Math.floor(canvas.width*.66),sy,canvas.width-Math.floor(canvas.width*.66),sh,'power')})}
  }
  if(!prepared.length)throw new Error('No player rows were detected in the selected screenshots.')
  const {createWorker,OEM,PSM}=await import('tesseract.js')
  onProgress(12,'Loading OCR language data')
  const worker=await createWorker(['eng','kor'],OEM.LSTM_ONLY,{logger:message=>{if(message.status==='loading tesseract core')onProgress(15,'Loading OCR engine')}})
  const names:{text:string;confidence:number}[]=[]
  try{
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE})
    for(let index=0;index<prepared.length;index++){const result=await worker.recognize(prepared[index].name);names.push({text:cleanName(result.data.text),confidence:result.data.confidence});onProgress(20+(index+1)/prepared.length*35,`Reading player names ${index+1}/${prepared.length}`)}
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_WORD,tessedit_char_whitelist:'0123456789,.'})
    const rows:ExtractedPlayer[]=[]
    for(let index=0;index<prepared.length;index++){const result=await worker.recognize(prepared[index].power),power=normalizeOcrPower(result.data.text),name=names[index].text;if(name||power)rows.push({id:crypto.randomUUID(),name,power:power??0,confidence:Math.round((names[index].confidence+result.data.confidence)/2),selected:Boolean(name&&power)});onProgress(55+(index+1)/prepared.length*45,`Reading power values ${index+1}/${prepared.length}`)}
    const unique=deduplicateRowsInOrder(rows)
    if(!unique.length)throw new Error('OCR could not match player names with power values. Try clearer screenshots.')
    return unique
  }finally{await worker.terminate()}
}
