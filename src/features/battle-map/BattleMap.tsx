import { Crosshair, Download, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Button } from '../../components/ui'
import { db } from '../../db'
import type { MapTower } from '../../types'
import { clampCoordinate, exportCamera, TILE_HEIGHT, TILE_WIDTH, unproject, type Camera, type MapPoint, type Rect } from './mapGeometry'
import { renderBattleMap } from './mapRenderer'
import { BlackGoldBattlefield } from './BlackGoldBattlefield'
import { useMapPinch, zoomMapBetween } from './useMapPinch'
import { useHivePlanner } from './useHivePlanner'
import { HivePanel } from './HivePanel'
import { adjustHiveArea, boundsBetween, DEFAULT_HIVE, hiveAreaHandle, type HiveAreaChange, type HiveAreaHandle } from './hiveLayout'
import './battle-map.css'
import './hive-planner.css'

const defaultCamera: Camera = { x: 501.5, y: 499.5, zoom: .075 }
const clampCenter = (value: number) => Math.max(0, Math.min(999, value))
const clampZoom = (value: number) => Math.max(.008, Math.min(1, value))
const zoomLimits = { tileX: TILE_WIDTH, tileY: -TILE_HEIGHT, clampCenter, clampZoom }

function fitHive(bounds: Rect, width: number, height: number): Camera {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: clampZoom(Math.min(
      width * .88 / ((bounds.maxX - bounds.minX + 1) * TILE_WIDTH),
      height * .85 / ((bounds.maxY - bounds.minY + 1) * TILE_HEIGHT),
    )),
  }
}

function GameMap({ hiveMode, canEdit }: { hiveMode: boolean; canEdit: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    x: number; y: number; pointerId: number; camera: Camera; start: MapPoint
    mode: ReturnType<typeof useHivePlanner>['mode']; navigationOnly: boolean
    handle?: HiveAreaHandle
  } | null>(null)
  const fitted = useRef(false)
  const [preview, setPreview] = useState<HiveAreaChange>()
  const [middlePan, setMiddlePan] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [camera, setCamera] = useState(defaultCamera)
  const pinch = useMapPinch(setCamera, size, zoomLimits)
  const hive = useHivePlanner(canEdit, hiveMode)
  const [towers, setTowers] = useState<MapTower[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const hiveTowers = useMemo(() => {
    const names = new Map(hive.roster.map(player => [player.id, player.name]))
    return hive.placements.map(placement => ({
      ...placement, id: placement.playerId, name: names.get(placement.playerId) ?? placement.name,
      color: '#67c5ea', createdAt: '', updatedAt: '',
    }))
  }, [hive.placements, hive.roster])
  const visibleTowers = hiveMode ? hiveTowers : towers
  const selected = hiveMode ? hive.selectedId : selectedId
  const { bounds, chamber } = hive.settings

  useEffect(() => {
    if (hiveMode) return
    let active = true
    const load = async () => {
      const [profile, roster] = await Promise.all([
        db.allianceProfiles.get('primary'),
        db.stateSnapshots.orderBy('capturedAt').reverse()
          .filter(snapshot => Boolean(snapshot.allianceMembers?.length)).first(),
      ])
      const positions = new Map(profile?.gameObservations?.positions.map(row => [row.uid, row]))
      if (!active) return
      setTowers((roster?.allianceMembers ?? []).flatMap(member => {
        const position = positions.get(member.uid)
        if (!position) return []
        return [{
          id: member.uid,
          name: member.name,
          x: position.x,
          y: position.y,
          color: '#38bdf8',
          createdAt: position.capturedAt,
          updatedAt: position.capturedAt,
        }]
      }))
      setFailed(false)
      setLoaded(true)
    }
    const refresh = () => void load().catch(() => {
      if (active) setFailed(true)
    })
    refresh()
    window.addEventListener('planner-local-change', refresh)
    return () => {
      active = false
      window.removeEventListener('planner-local-change', refresh)
    }
  }, [hiveMode])

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!hiveMode || !hive.ready || !size.width || fitted.current) return
    fitted.current = true
    setCamera(fitHive(bounds, size.width, size.height))
  }, [bounds, hiveMode, hive.ready, size])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !size.width) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(size.width * dpr), height = Math.round(size.height * dpr)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderBattleMap(ctx, size.width, size.height, camera, visibleTowers, {
      selectedId: selected, hive: hiveMode ? { bounds, chamber, preview, editing: hive.mode === 'edit-area' } : undefined,
    })
  }, [size, camera, visibleTowers, selected, hiveMode, bounds, chamber, preview, hive.mode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setCamera(current => zoomMapBetween(current, point, point, event.deltaY > 0 ? .82 : 1.22, size, zoomLimits))
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [size])

  function worldPoint(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return unproject(event.clientX - box.left, event.clientY - box.top, camera, size.width, size.height)
  }

  function tile(event: PointerEvent<HTMLCanvasElement>) {
    const point = worldPoint(event)
    return { x: clampCoordinate(point.x), y: clampCoordinate(point.y) }
  }

  function areaChange(start: MapPoint, end: MapPoint, handle: HiveAreaHandle) {
    return adjustHiveArea(bounds, handle, { x: end.x - start.x, y: end.y - start.y })
  }

  function startGesture(event: PointerEvent<HTMLCanvasElement>) {
    const middle = event.pointerType === 'mouse' && event.button === 1
    if (!middle && event.button !== 0) return
    if (middle) event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pinch.start(event)) {
      drag.current = null
      setPreview(undefined)
      return
    }
    const mode = hiveMode && !middle ? hive.mode : 'pan'
    const handle = mode === 'edit-area' ? hiveAreaHandle(bounds, worldPoint(event), {
      x: 11 / (TILE_WIDTH * camera.zoom),
      y: 11 / (TILE_HEIGHT * camera.zoom),
    }) : undefined
    const start = tile(event)
    const navigationOnly = middle || (mode === 'edit-area' && !handle)
    drag.current = {
      x: event.clientX, y: event.clientY, pointerId: event.pointerId,
      camera, start, mode: navigationOnly ? 'pan' : mode, navigationOnly, handle,
    }
    if (middle) setMiddlePan(true)
    if (mode === 'area') setPreview({ bounds: boundsBetween(start, start) })
  }

  function pan(event: PointerEvent<HTMLCanvasElement>) {
    if (pinch.move(event)) return
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    if (start.mode === 'area') {
      setPreview({ bounds: boundsBetween(start.start, tile(event)) })
      return
    }
    if (start.handle) {
      setPreview(areaChange(start.start, tile(event), start.handle))
      return
    }
    if (start.mode !== 'pan') return
    setCamera({
      x: clampCenter(start.camera.x - (event.clientX - start.x) / (TILE_WIDTH * start.camera.zoom)),
      y: clampCenter(start.camera.y + (event.clientY - start.y) / (TILE_HEIGHT * start.camera.zoom)),
      zoom: start.camera.zoom,
    })
  }

  function cancelGesture(event: PointerEvent<HTMLCanvasElement>) {
    pinch.end(event)
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null
      setPreview(undefined)
      setMiddlePan(false)
    }
  }

  function endGesture(event: PointerEvent<HTMLCanvasElement>) {
    const wasPinching = pinch.end(event)
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    drag.current = null
    setPreview(undefined)
    setMiddlePan(false)
    if (!hiveMode || wasPinching || start.navigationOnly || event.button !== 0) return
    const point = tile(event)
    if (start.mode === 'area') {
      const area = boundsBetween(start.start, point)
      if (hive.selectArea(area)) setCamera(fitHive(area, size.width, size.height))
    } else if (start.handle) {
      const change = areaChange(start.start, point, start.handle)
      const box = change.bounds
      if (box.minX !== bounds.minX || box.maxX !== bounds.maxX || box.minY !== bounds.minY || box.maxY !== bounds.maxY)
        hive.editArea(change)
    } else if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) {
      hive.chooseTile(point)
    }
  }

  function fitMap() {
    setCamera(hiveMode ? fitHive(bounds, size.width, size.height) :
      towers.length ? exportCamera(towers, size.width, size.height) : defaultCamera)
  }

  function exportPng() {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const view = hiveMode ? fitHive(bounds, canvas.width, canvas.height) : exportCamera(towers, canvas.width, canvas.height)
    renderBattleMap(ctx, canvas.width, canvas.height, view, visibleTowers, {
      exportMode: true, hive: hiveMode ? { bounds, chamber } : undefined,
    })
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = hiveMode ? 'kvi-frankenstein-hive.png' : 'kvi-game-map.png'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return <main className={`battle-shell${hiveMode ? ' hive-shell' : ''}`}>
    {hiveMode ? <HivePanel hive={hive}
      focus={point => setCamera(current => ({ ...point, zoom: Math.max(current.zoom, .22) }))}
      resetArea={() => {
        hive.resetArea()
        setCamera(fitHive(DEFAULT_HIVE.bounds, size.width, size.height))
      }} /> :
    <aside className="map-sidebar">
      <header><h2>Game Map</h2><span>Last captured alliance positions</span></header>
      <div className="shield-zone-key"><i />Gray zone · Shields unavailable</div>
      <section className="tower-list">
        <h3>Alliance members <span>{towers.length}</span></h3>
        {towers.map(tower => <button key={tower.id} type="button"
          className={selectedId === tower.id ? 'active' : ''}
          onClick={() => {
            setSelectedId(tower.id)
            setCamera(current => ({ x: tower.x, y: tower.y, zoom: Math.max(current.zoom, .22) }))
          }}>
          <i style={{ background: tower.color }} />
          <span><strong>{tower.name}</strong><small>X:{tower.x} · Y:{tower.y} · {new Date(tower.updatedAt).toLocaleString()}</small></span>
          <LocateFixed />
        </button>)}
        {failed ? <div className="map-empty">Game positions could not be loaded.</div>
          : loaded && !towers.length && <div className="map-empty">Import an Alliance capture with map coordinates to place members.</div>}
      </section>
    </aside>}
    <section className="map-stage">
      <div className="map-toolbar">
        <div>
          <Button variant="secondary" aria-label="Zoom in" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom * 1.25) }))}><ZoomIn /></Button>
          <Button variant="secondary" aria-label="Zoom out" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom / 1.25) }))}><ZoomOut /></Button>
          <Button variant="secondary" aria-label={hiveMode ? 'Fit hive area' : 'Fit alliance positions'} onClick={fitMap}><Crosshair />Fit map</Button>
        </div>
        <span>{Math.round(camera.zoom * 100)}% · Middle-drag to pan · Pinch or scroll to zoom</span>
        <Button onClick={exportPng}><Download />Export PNG</Button>
      </div>
      <div ref={wrapRef} className="map-canvas-wrap">
        <canvas ref={canvasRef} aria-label={hiveMode ? 'Hive plan map' : 'Game map'}
          className={middlePan ? 'hive-middle-pan' : hiveMode && hive.mode !== 'pan' ? 'hive-targeting' : 'cursor-grab active:cursor-grabbing'}
          onPointerDown={startGesture}
          onMouseDown={event => { if (event.button === 1) event.preventDefault() }}
          onAuxClick={event => { if (event.button === 1) event.preventDefault() }}
          onPointerMove={pan}
          onPointerUp={endGesture}
          onPointerCancel={cancelGesture}
          onLostPointerCapture={cancelGesture}
        />
      </div>
    </section>
  </main>
}

export function BattleMap({ canEdit = true }: { canEdit?: boolean }) {
  const [battlefield, setBattlefield] = useState<'game' | 'hive' | 'black-gold'>('game')
  return <div className="battle-map-page">
    <nav className="battlefield-switch" aria-label="Battlefield type">
      <button className={battlefield === 'game' ? 'active' : ''} onClick={() => setBattlefield('game')}>Game Map</button>
      <button className={battlefield === 'hive' ? 'active' : ''} onClick={() => setBattlefield('hive')}>Hive Planner</button>
      <button className={battlefield === 'black-gold' ? 'active' : ''} onClick={() => setBattlefield('black-gold')}>Black Gold Battlefield</button>
    </nav>
    {battlefield === 'black-gold' ? <BlackGoldBattlefield canEdit={canEdit} /> :
      <GameMap key={battlefield} hiveMode={battlefield === 'hive'} canEdit={canEdit} />}
  </div>
}
