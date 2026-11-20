import { describe,expect,it } from 'vitest'
import { deduplicateRowsInOrder, normalizeOcrPower, type ExtractedPlayer } from './screenshotOcr'

describe('alliance screenshot OCR helpers',()=>{
  it('normalizes outlined-power OCR noise',()=>{expect(normalizeOcrPower('[761948!500]')).toBe(761948500);expect(normalizeOcrPower('54,038,420')).toBe(54038420)})
  it('rejects incomplete or overlong power values',()=>{expect(normalizeOcrPower('689')).toBeNull();expect(normalizeOcrPower('6513087160')).toBeNull()})
  it('keeps screenshot row order while removing repeated names',()=>{
    const row=(name:string,power:number):ExtractedPlayer=>({id:name+power,name,power,confidence:90,selected:true})
    expect(deduplicateRowsInOrder([row('First',20),row('Second',40),row('First',50)]).map(item=>item.name)).toEqual(['First','Second'])
  })
})
