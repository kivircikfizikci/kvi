import { describe,expect,it } from 'vitest'
import { normalizeOcrPower } from './screenshotOcr'

describe('alliance screenshot OCR helpers',()=>{
  it('normalizes outlined-power OCR noise',()=>{expect(normalizeOcrPower('[761948!500]')).toBe(761948500);expect(normalizeOcrPower('54,038,420')).toBe(54038420)})
  it('rejects incomplete power values',()=>{expect(normalizeOcrPower('689')).toBeNull()})
})
