import { describe, expect, it } from 'vitest'
import type { BlackGoldParticipant } from '../../types'
import { BLACK_GOLD_OBJECTIVES, blackGoldExportCamera, blackGoldRosterLimitError, projectBlackGold, unprojectBlackGold, validateBlackGoldPosition } from './blackGoldGeometry'

const participant=(overrides:Partial<BlackGoldParticipant>={}):BlackGoldParticipant=>({id:'p1',name:'Alpha',role:'active',color:'#38bdf8',createdAt:'x',updatedAt:'x',...overrides})

describe('Black Gold battlefield geometry',()=>{
  it('keeps the reference layout on its 149 by 149 grid',()=>{expect(BLACK_GOLD_OBJECTIVES).toHaveLength(13);expect(BLACK_GOLD_OBJECTIVES.find(item=>item.id==='golden-ball')).toMatchObject({x:74,y:74});expect(BLACK_GOLD_OBJECTIVES.find(item=>item.id==='headquarters-north-east')).toMatchObject({x:142,y:6})})
  it('round trips screen and grid coordinates',()=>{const camera={x:74,y:74,zoom:.3},screen=projectBlackGold({x:31,y:118},camera,900,700);expect(unprojectBlackGold(screen.x,screen.y,camera,900,700)).toEqual({x:31,y:118})})
  it('blocks fixed objectives and overlapping shelters',()=>{expect(validateBlackGoldPosition(74,74,[])).toContain('Golden Ball');expect(validateBlackGoldPosition(50,50,[participant({x:52,y:50})])).toContain('Alpha');expect(validateBlackGoldPosition(48,50,[participant({x:52,y:50})])).toBeNull()})
  it('fits the full battlefield for export',()=>{expect(blackGoldExportCamera(1800,1200).zoom).toBeGreaterThan(.2)})
  it('enforces 20 active and 10 reserve slots',()=>{const active=Array.from({length:20},(_,index)=>participant({id:`a${index}`})),reserves=Array.from({length:10},(_,index)=>participant({id:`r${index}`,role:'reserve'}));expect(blackGoldRosterLimitError('active',active)).toContain('20');expect(blackGoldRosterLimitError('reserve',reserves)).toContain('10');expect(blackGoldRosterLimitError('active',active.slice(0,19))).toBeNull()})
})
