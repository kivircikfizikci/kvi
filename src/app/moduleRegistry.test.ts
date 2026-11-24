import { describe,expect,it } from 'vitest'
import { initialModule,moduleUrl,PLANNER_MODULES } from './moduleRegistry'

describe('planner module registry',()=>{
 it('keeps module IDs unique and supports direct links',()=>{expect(new Set(PLANNER_MODULES.map(m=>m.id)).size).toBe(PLANNER_MODULES.length);expect(initialModule('?module=battle-map')).toBe('battle-map');expect(initialModule('?module=rally-planner')).toBe('rally-planner');expect(initialModule('?module=alliance')).toBe('alliance');expect(initialModule('?module=state')).toBe('state')})
 it('keeps the legacy map link working',()=>{expect(initialModule('?view=map')).toBe('battle-map')})
 it('removes module routing from the visible URL',()=>{expect(moduleUrl('https://example.com/kvi/?module=alliance&preview=1')).toBe('/kvi/?preview=1')})
})
