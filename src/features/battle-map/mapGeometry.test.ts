import { describe,expect,it } from 'vitest'
import type { MapTower } from '../../types'
import { ARMORIES,CAPITAL,CAPITAL_BLOCKED,fixedBuildingFootprint,isPanChord,project,TILE_HEIGHT,TILE_WIDTH,towerAtScreenPoint,TURRETS,unproject,validateTowerPosition } from './mapGeometry'

describe('battle map geometry',()=>{
 it('uses compact 60 by 40 pixel tiles at maximum zoom',()=>{expect({width:TILE_WIDTH,height:TILE_HEIGHT}).toEqual({width:60,height:40})})
 it('places the Capital marker at X:496 Y:494',()=>{expect(CAPITAL).toMatchObject({x:496,y:494})})
 it('round-trips map coordinates with Y increasing upward',()=>{const camera={x:496,y:496,zoom:1};const screen=project({x:504,y:487},camera,1200,800);const point=unproject(screen.x,screen.y,camera,1200,800);expect(point.x).toBeCloseTo(504);expect(point.y).toBeCloseTo(487);expect(project({x:462,y:539},camera,1200,800).y).toBeLessThan(project({x:462,y:460},camera,1200,800).y)})
 it('blocks the Capital no-teleport zone',()=>{expect(validateTowerPosition(496,496,[])).toContain('no-teleport')})
 it('shifts the Capital no-teleport zone one coordinate upward',()=>{expect(CAPITAL_BLOCKED).toEqual({minX:489,maxX:503,minY:487,maxY:501})})
 it('anchors turret footprints to the left and below their top-right coordinate',()=>{expect(fixedBuildingFootprint(TURRETS[0])).toEqual({minX:488,maxX:489,minY:500,maxY:501});expect(validateTowerPosition(487,499,[])).toContain('Turret 1');expect(validateTowerPosition(486,499,[])).toBeNull()})
 it('shifts armory blocked footprints two coordinates downward',()=>{expect(fixedBuildingFootprint(ARMORIES[0])).toEqual({minX:458,maxX:466,minY:454,maxY:462});expect(validateTowerPosition(462,453,[])).toContain('Armory 1');expect(validateTowerPosition(462,464,[])).toBeNull()})
 it('blocks overlapping 3x3 towers',()=>{const tower:MapTower={id:'a',name:'Alpha',x:520,y:520,color:'#60a5fa',createdAt:'x',updatedAt:'x'};expect(validateTowerPosition(522,520,[tower])).toContain('Alpha');expect(validateTowerPosition(524,520,[tower])).toBeNull()})
 it('keeps player towers easy to grab at distant zoom levels',()=>{const tower:MapTower={id:'a',name:'Alpha',x:520,y:520,color:'#60a5fa',createdAt:'x',updatedAt:'x'},camera={x:520,y:520,zoom:.05};expect(towerAtScreenPoint([tower],621,421,camera,1200,800)?.id).toBe('a');expect(towerAtScreenPoint([tower],623,423,camera,1200,800)).toBeUndefined()})
 it('only pans with primary and secondary mouse buttons together',()=>{expect(isPanChord(1)).toBe(false);expect(isPanChord(2)).toBe(false);expect(isPanChord(3)).toBe(true)})
})
