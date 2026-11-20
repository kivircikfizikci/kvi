import { describe,expect,it } from 'vitest'
import type { MapTower } from '../../types'
import { CAPITAL_BLOCKED,project,unproject,validateTowerPosition } from './mapGeometry'

describe('battle map geometry',()=>{
 it('round-trips map coordinates with Y increasing upward',()=>{const camera={x:496,y:496,zoom:1};const screen=project({x:504,y:487},camera,1200,800);const point=unproject(screen.x,screen.y,camera,1200,800);expect(point.x).toBeCloseTo(504);expect(point.y).toBeCloseTo(487);expect(project({x:462,y:539},camera,1200,800).y).toBeLessThan(project({x:462,y:460},camera,1200,800).y)})
 it('blocks the Capital no-teleport zone',()=>{expect(validateTowerPosition(496,496,[])).toContain('no-teleport')})
 it('shifts the Capital no-teleport zone one coordinate upward',()=>{expect(CAPITAL_BLOCKED).toEqual({minX:489,maxX:503,minY:487,maxY:501})})
 it('blocks overlapping 3x3 towers',()=>{const tower:MapTower={id:'a',name:'Alpha',x:520,y:520,color:'#60a5fa',createdAt:'x',updatedAt:'x'};expect(validateTowerPosition(522,520,[tower])).toContain('Alpha');expect(validateTowerPosition(524,520,[tower])).toBeNull()})
})
