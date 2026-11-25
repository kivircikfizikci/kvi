import { Crosshair, Download, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '../../components/ui'
import { db } from '../../db'
import type { MapTower } from '../../types'
import { exportCamera, TILE_HEIGHT, TILE_WIDTH, type Camera } from './mapGeometry'
import { renderBattleMap } from './mapRenderer'
import { BlackGoldBattlefield } from './BlackGoldBattlefield'
import { useMapPinch, zoomMapBetween } from './useMapPinch'
import './battle-map.css'

const defaultCamera: Camera = { x: 501.5, y: 499.5, zoom: .075 }
const clampCenter = (value: number) => Math.max(0, Math.min(999, value))
const clampZoom = (value: number) => Math.max(.008, Math.min(1, value))
const zoomLimits = { tileX: TILE_WIDTH, tileY: -TILE_HEIGHT, clampCenter, clampZoom }

function GameMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const [camera, setCamera] = useState(defaultCamera)
  const pinch = useMapPinch(setCamera, size, zoomLimits)
  const [towers, setTowers] = useState<MapTower[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
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
  }, [])

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
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderBattleMap(ctx, size.width, size.height, camera, towers, { selectedId })
  }, [size, camera, towers, selectedId])

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

  function pan(event: PointerEvent<HTMLCanvasElement>) {
    if (pinch.move(event)) return
    const start = drag.current
    if (!start) return
    setCamera({
      x: clampCenter(start.camera.x - (event.clientX - start.x) / (TILE_WIDTH * start.camera.zoom)),
      y: clampCenter(start.camera.y + (event.clientY - start.y) / (TILE_HEIGHT * start.camera.zoom)),
      zoom: start.camera.zoom,
    })
  }

  function endGesture(event: PointerEvent<HTMLCanvasElement>) {
    pinch.end(event)
    drag.current = null
  }

  function exportPng() {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const view = exportCamera(towers, canvas.width, canvas.height)
    renderBattleMap(ctx, canvas.width, canvas.height, view, towers, { exportMode: true })
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'kvi-game-map.png'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return <main className="battle-shell">
    <aside className="map-sidebar">
      <header><h2>Game Map</h2><span>Last captured alliance positions</span></header>
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
    </aside>
    <section className="map-stage">
      <div className="map-toolbar">
        <div>
          <Button variant="secondary" aria-label="Zoom in" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom * 1.25) }))}><ZoomIn /></Button>
          <Button variant="secondary" aria-label="Zoom out" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom / 1.25) }))}><ZoomOut /></Button>
          <Button variant="secondary" aria-label="Fit alliance positions" onClick={() => setCamera(towers.length ? exportCamera(towers, size.width, size.height) : defaultCamera)}><Crosshair />Fit map</Button>
        </div>
        <span>{Math.round(camera.zoom * 100)}% · Pinch or scroll to zoom</span>
        <Button onClick={exportPng}><Download />Export PNG</Button>
      </div>
      <div ref={wrapRef} className="map-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Game map" className="cursor-grab active:cursor-grabbing"
          onPointerDown={event => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = pinch.start(event) ? null : { x: event.clientX, y: event.clientY, camera }
          }}
          onPointerMove={pan}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
        />
      </div>
    </section>
  </main>
}

export function BattleMap({ canEdit = true }: { canEdit?: boolean }) {
  const [battlefield, setBattlefield] = useState<'game' | 'black-gold'>('game')
  return <div className="battle-map-page">
    <nav className="battlefield-switch" aria-label="Battlefield type">
      <button className={battlefield === 'game' ? 'active' : ''} onClick={() => setBattlefield('game')}>Game Map</button>
      <button className={battlefield === 'black-gold' ? 'active' : ''} onClick={() => setBattlefield('black-gold')}>Black Gold Battlefield</button>
    </nav>
    {battlefield === 'game' ? <GameMap /> : <BlackGoldBattlefield canEdit={canEdit} />}
  </div>
}
