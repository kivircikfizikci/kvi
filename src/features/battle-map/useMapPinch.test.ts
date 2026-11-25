import { describe, expect, it } from 'vitest'
import { BGB_TILE_SIZE, unprojectBlackGold } from './blackGoldGeometry'
import { TILE_HEIGHT, TILE_WIDTH, unproject } from './mapGeometry'
import { zoomMapBetween } from './useMapPinch'

describe('battle map zoom gestures', () => {
  const viewport = { width: 390, height: 580 }
  const limits = { clampCenter: (value: number) => Math.max(0, value), clampZoom: (value: number) => Math.min(1, value) }

  it.each([
    { name: 'Black Gold Battlefield', tileX: BGB_TILE_SIZE, tileY: BGB_TILE_SIZE, unprojectPoint: unprojectBlackGold },
    { name: 'Game Map', tileX: TILE_WIDTH, tileY: -TILE_HEIGHT, unprojectPoint: unproject },
  ])('keeps the world point under the moving pinch midpoint on $name', ({ tileX, tileY, unprojectPoint }) => {
    const camera = { x: 74, y: 74, zoom: .25 }
    const before = { x: 130, y: 250 }
    const after = { x: 165, y: 270 }
    const zoomed = zoomMapBetween(camera, before, after, 2, viewport, { ...limits, tileX, tileY })
    const original = unprojectPoint(before.x, before.y, camera, viewport.width, viewport.height)
    const anchored = unprojectPoint(after.x, after.y, zoomed, viewport.width, viewport.height)

    expect(zoomed.zoom).toBe(.5)
    expect(anchored.x).toBeCloseTo(original.x)
    expect(anchored.y).toBeCloseTo(original.y)
    const restored = zoomMapBetween(zoomed, after, before, .5, viewport, { ...limits, tileX, tileY })
    expect(restored.x).toBeCloseTo(camera.x)
    expect(restored.y).toBeCloseTo(camera.y)
    expect(restored.zoom).toBe(camera.zoom)
  })

  it('keeps the camera still when zooming past its limit around a stationary point', () => {
    const camera = { x: 74, y: 74, zoom: 1 }
    const point = { x: 160, y: 250 }
    expect(zoomMapBetween(camera, point, point, 2, viewport, { ...limits, tileX: 24, tileY: 24 })).toEqual(camera)
  })
})
