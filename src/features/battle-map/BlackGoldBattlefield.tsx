import { Clock3, Crosshair, Download, Lock, MapPin, Pencil, Trash2, Unlock, UserPlus, Users, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { liveQuery } from 'dexie'
import { Badge, Button, Input, Modal, NativeSelect } from '../../components/ui'
import { db } from '../../db'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { BlackGoldParticipant, BlackGoldParticipantRole, BlackGoldTeam, BlackGoldTeamId } from '../../types'
import { formatPower, now, uid } from '../../utils/format'
import {
  BGB_ACTIVE_LIMIT, BGB_GRID_SIZE, BGB_RESERVE_LIMIT, BGB_TILE_SIZE, blackGoldExportCamera,
  blackGoldRosterLimitError, clampBlackGoldCoordinate, participantAtScreenPoint, type BlackGoldCamera,
  type BlackGoldPoint, unprojectBlackGold, validateBlackGoldPosition,
} from './blackGoldGeometry'
import { renderBlackGoldMap } from './blackGoldRenderer'
import { blackGoldRosterIndex } from './blackGoldRoster'
import {
  BGB_DEFAULT_TIMING, bgbPhases, blackGoldPlanAt, formatBgbMinute,
  generateBlackGoldOpening, replaceBlackGoldPlayer, reserveOptions, validateBgbTiming,
} from './blackGoldStrategy'
import './black-gold.css'
import './black-gold-timeline.css'

const SIDE_COLORS = { red: '#f07370', blue: '#38bdf8' }
const initialCamera: BlackGoldCamera = { x: 74, y: 74, zoom: .18 }
const clampCenter = (value: number) => Math.max(0, Math.min(BGB_GRID_SIZE - 1, value))
const clampZoom = (value: number) => Math.max(.055, Math.min(1.2, value))
const createTeams = (): BlackGoldTeam[] => [
  { id: 'team-a', name: 'Team A', eventTime: '', participants: [], updatedAt: now() },
  { id: 'team-b', name: 'Team B', eventTime: '', participants: [], updatedAt: now() },
]

type Mode = 'view' | 'move' | 'place'
type Drag = {
  type: 'pan' | 'move' | 'place'
  x: number
  y: number
  camera: BlackGoldCamera
  slotId?: string
  offset?: BlackGoldPoint
}

export function BlackGoldBattlefield({ canEdit = true }: { canEdit?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const saveQueue = useRef(Promise.resolve())
  const pendingTeams = useRef(new Map<BlackGoldTeamId, BlackGoldTeam>())
  const teamsRef = useRef<BlackGoldTeam[]>(createTeams())
  const [teams, setTeams] = useState(teamsRef.current)
  const [activeTeamId, setActiveTeamId] = useState<BlackGoldTeamId>('team-a')
  const [loaded, setLoaded] = useState(false)
  const [size, setSize] = useState({ width: 900, height: 580 })
  const [camera, setCamera] = useState(initialCamera)
  const [minute, setMinute] = useState(0)
  const [mode, setMode] = useState<Mode>('view')
  const [selectedId, setSelectedId] = useState<string>()
  const [preview, setPreview] = useState<{ id: string; point: BlackGoldPoint }>()
  const [message, setMessage] = useState<string>()
  const [playerId, setPlayerId] = useState('')
  const [role, setRole] = useState<BlackGoldParticipantRole>('active')
  const [replacement, setReplacement] = useState<{ slotId: string; reserveId: string }>()
  const players = usePlannerStore(state => state.players)
  const roster = useMemo(() => blackGoldRosterIndex(players), [players])
  const team = teams.find(item => item.id === activeTeamId)!
  const side = team.side ?? 'red'
  const teamColor = SIDE_COLORS[side]
  const otherTeam = teams.find(item => item.id !== activeTeamId)!
  const teamIds = roster.assignedKeys(team.participants)
  const otherIds = roster.assignedKeys(otherTeam.participants)
  const hasOverlap = [...teamIds].some(id => otherIds.has(id))
  const rosterOptions = loaded ? players.filter(player => !teamIds.has(roster.playerKey(player)) && !otherIds.has(roster.playerKey(player)))
    .sort((a, b) => b.totalPower - a.totalPower || a.name.localeCompare(b.name)) : []
  const nameOf = (item: BlackGoldParticipant) => roster.resolve(item)?.name ?? item.name
  const powerOf = (item: BlackGoldParticipant) => roster.resolve(item)?.totalPower
  const reserves = team.participants.filter(item => item.role === 'reserve')
  const availableReserves = reserveOptions(team).filter(item => {
    const player = roster.resolve(item)
    return !player || !otherIds.has(roster.playerKey(player))
  })
  const hasSubstitutions = Boolean(team.substitutions?.length)
  const editableOpening = canEdit && loaded && !hasSubstitutions
  const plan = useMemo(() => blackGoldPlanAt(team, minute), [team, minute])
  const selected = plan.find(row => row.slot.id === selectedId)
  const timing = team.timing ?? BGB_DEFAULT_TIMING
  const phases = bgbPhases(timing)
  const phase = [...phases].reverse().find(item => item.minute <= minute) ?? phases[0]
  const markers = useMemo(() => plan.map(row => ({
    ...row.slot,
    x: preview?.id === row.slot.id ? preview.point.x : row.point?.x,
    y: preview?.id === row.slot.id ? preview.point.y : row.point?.y,
    name: roster.resolve(row.occupant)?.name ?? row.occupant.name,
  })), [plan, roster, preview])
  const routes = plan.flatMap(row => row.route
    ? [{ ...row.route, color: row.slot.color || teamColor, highlighted: row.slot.id === selectedId }]
    : [])
  const placed = markers.filter(item => item.x !== undefined && item.y !== undefined)

  useEffect(() => {
    const subscription = liveQuery(() => db.blackGoldTeams.toArray()).subscribe({
      next(records) {
        teamsRef.current = createTeams().map(item =>
          pendingTeams.current.get(item.id) ?? records.find(record => record.id === item.id) ?? item,
        )
        setTeams(teamsRef.current)
        setLoaded(true)
      },
      error() { setMessage('Black Gold plans could not be loaded.') },
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(1, Math.floor(entry.contentRect.width)), height: Math.max(1, Math.floor(entry.contentRect.height)) })
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
    const arrows = plan.flatMap(row => row.route ? [{
      ...row.route, color: row.slot.color || teamColor, highlighted: row.slot.id === selectedId,
    }] : [])
    renderBlackGoldMap(ctx, size.width, size.height, camera, markers, {
      selectedId, teamColor, teamName: team.name, routes: arrows,
    })
  }, [size, camera, markers, selectedId, teamColor, team.name, plan])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      setCamera(current => {
        const world = unprojectBlackGold(x, y, current, size.width, size.height)
        const next = clampZoom(current.zoom * (event.deltaY > 0 ? .82 : 1.22))
        return {
          x: clampCenter(world.x - (x - size.width / 2) / (BGB_TILE_SIZE * next)),
          y: clampCenter(world.y - (y - size.height / 2) / (BGB_TILE_SIZE * next)),
          zoom: next,
        }
      })
    }
    canvas.addEventListener('wheel', zoom, { passive: false })
    return () => canvas.removeEventListener('wheel', zoom)
  }, [size])

  function updateTeam(update: (current: BlackGoldTeam) => BlackGoldTeam) {
    if (!canEdit || !loaded) return
    try {
      const current = teamsRef.current.find(item => item.id === activeTeamId)!
      const updated = { ...update(current), updatedAt: now() }
      pendingTeams.current.set(updated.id, updated)
      teamsRef.current = teamsRef.current.map(item => item.id === activeTeamId ? updated : item)
      setTeams(teamsRef.current)
      setMessage(undefined)
      saveQueue.current = saveQueue.current
        .then(async () => {
          await db.blackGoldTeams.put(updated)
          window.dispatchEvent(new Event('planner-local-change'))
        })
        .catch(() => setMessage('The change could not be saved.'))
        .finally(() => {
          if (pendingTeams.current.get(updated.id) === updated) pendingTeams.current.delete(updated.id)
        })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The plan could not be updated.')
    }
  }

  function selectMinute(value: number) {
    drag.current = null
    setPreview(undefined)
    setMinute(value)
    setMode('view')
    setMessage(undefined)
  }

  function switchTeam(id: BlackGoldTeamId) {
    setActiveTeamId(id)
    setPlayerId('')
    setSelectedId(undefined)
    setReplacement(undefined)
    selectMinute(0)
  }

  function addMember() {
    const player = roster.byId.get(playerId)
    const nextRole = hasSubstitutions ? 'reserve' : role
    if (!player || (!editableOpening && nextRole === 'active')) return
    if (!rosterOptions.some(option => option.id === playerId)) {
      setMessage('This player is already assigned to a match team.')
      return
    }
    const error = blackGoldRosterLimitError(nextRole, team.participants)
    if (error) { setMessage(error); return }
    const stamp = now()
    const participant: BlackGoldParticipant = {
      id: uid(), playerId, name: player.name, role: nextRole, color: teamColor, createdAt: stamp, updatedAt: stamp,
    }
    updateTeam(value => ({ ...value, participants: [...value.participants, participant] }))
    setPlayerId('')
    setSelectedId(nextRole === 'active' ? participant.id : undefined)
  }

  function editRoster(item: BlackGoldParticipant, action: 'remove' | 'swap') {
    if (hasSubstitutions && (item.role === 'active' || action === 'swap' || !reserveOptions(team).includes(item))) return
    const nextRole = item.role === 'active' ? 'reserve' : 'active'
    const error = action === 'swap' && blackGoldRosterLimitError(nextRole, team.participants)
    if (error) { setMessage(error); return }
    updateTeam(value => ({
      ...value,
      strategy: value.strategy?.filter(assignment => assignment.participantId !== item.id),
      participants: action === 'remove' ? value.participants.filter(member => member.id !== item.id)
        : value.participants.map(member => member.id === item.id
          ? { ...member, role: nextRole, x: undefined, y: undefined, positionLocked: false, updatedAt: now() }
          : member),
    }))
    if (selectedId === item.id) setSelectedId(undefined)
  }

  function generateOpening() {
    if (!editableOpening || hasOverlap || !plan.length) return
    selectMinute(0)
    setCamera(blackGoldExportCamera(size.width, size.height))
    updateTeam(current => ({ ...current, ...generateBlackGoldOpening(current, item => powerOf(item) ?? 0) }))
  }

  function mapPoint(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function updatePosition(id: string, point: BlackGoldPoint) {
    updateTeam(current => ({
      ...current,
      participants: current.participants.map(item => item.id === id ? { ...item, ...point, updatedAt: now() } : item),
    }))
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = mapPoint(event)
    const hit = participantAtScreenPoint(placed, point.x, point.y, camera, size.width, size.height)
    const left = event.button === 0
    if (!left && event.button !== 1 && event.button !== 2) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (left && hit) {
      setSelectedId(hit.id)
      if (mode === 'move' && minute === 0 && editableOpening && !hit.positionLocked) {
        const world = unprojectBlackGold(point.x, point.y, camera, size.width, size.height)
        drag.current = { ...point, type: 'move', camera, slotId: hit.id, offset: { x: hit.x! - world.x, y: hit.y! - world.y } }
      }
    } else if (left && mode === 'place' && minute === 0 && editableOpening && selected) {
      drag.current = { ...point, type: 'place', camera, slotId: selected.slot.id }
    } else {
      drag.current = { ...point, type: 'pan', camera }
    }
  }

  function getPlot(point: BlackGoldPoint, offset?: BlackGoldPoint): BlackGoldPoint {
    const world = unprojectBlackGold(point.x, point.y, camera, size.width, size.height)
    return { x: clampBlackGoldCoordinate(world.x + (offset?.x ?? 0)), y: clampBlackGoldCoordinate(world.y + (offset?.y ?? 0)) }
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current
    if (!current) return
    const point = mapPoint(event)
    if (current.type === 'pan') {
      setCamera({
        ...current.camera,
        x: clampCenter(current.camera.x - (point.x - current.x) / (BGB_TILE_SIZE * current.camera.zoom)),
        y: clampCenter(current.camera.y - (point.y - current.y) / (BGB_TILE_SIZE * current.camera.zoom)),
      })
    } else if (current.type === 'move' && current.slotId && Math.hypot(point.x - current.x, point.y - current.y) > 3) {
      const next = getPlot(point, current.offset)
      if (!validateBlackGoldPosition(next.x, next.y, placed, current.slotId)) setPreview({ id: current.slotId, point: next })
    }
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current
    drag.current = null
    setPreview(undefined)
    if (!current?.slotId || !editableOpening || minute !== 0) return
    const point = mapPoint(event)
    const distance = Math.hypot(point.x - current.x, point.y - current.y)
    if (current.type === 'move' ? distance <= 3 : distance > 5) return
    const next = getPlot(point, current.offset)
    const error = validateBlackGoldPosition(next.x, next.y, placed, current.slotId)
    if (error) { setMessage(error); return }
    updatePosition(current.slotId, next)
    if (current.type === 'place') setMode('move')
  }

  function confirmReplacement() {
    if (!replacement?.reserveId) return
    updateTeam(current => replaceBlackGoldPlayer(current, replacement.slotId, replacement.reserveId, minute))
    setReplacement(undefined)
    setMode('view')
  }

  function exportPng() {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderBlackGoldMap(ctx, canvas.width, canvas.height, blackGoldExportCamera(canvas.width, canvas.height), markers, {
      exportMode: true, teamColor, teamName: team.name, routes,
    })
    ctx.fillStyle = 'rgba(7,10,13,.94)'
    ctx.fillRect(0, 0, canvas.width, 70)
    ctx.fillStyle = '#f4f7fb'
    ctx.font = '700 24px Inter, system-ui'
    ctx.fillText(`${team.name} · ${formatBgbMinute(minute)} · ${phase.name}`, 28, 44)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kvi-black-gold-${team.id}-${minute}m.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const teamTabs = (className: string) => <div className={`bgb-team-tabs ${className}`} role="group" aria-label="Match roster">
    {teams.map(item => <button key={item.id} className={item.id === activeTeamId ? 'active' : ''} aria-pressed={item.id === activeTeamId} onClick={() => switchTeam(item.id)}>
      <span>{item.name}</span><small>{item.eventTime || 'Time not set'}</small>
    </button>)}
  </div>

  return <main className="battle-shell bgb-shell">
    <aside className="map-sidebar bgb-sidebar">
      <header><p className="eyebrow">Black Gold Battlefield</p><h2>{team.name} Plan</h2></header>
      {teamTabs('bgb-team-tabs-sidebar')}
      <section className="bgb-event-time">
        <label><Clock3 />Event time<Input disabled={!canEdit || !loaded} type="time" value={team.eventTime} onChange={event => { const value = event.target.value; updateTeam(current => ({ ...current, eventTime: value })) }} /></label>
        <div><Badge tone="blue">{plan.length}/{BGB_ACTIVE_LIMIT} active</Badge><Badge tone="muted">{reserves.length}/{BGB_RESERVE_LIMIT} reserves</Badge></div>
      </section>
      {canEdit && <section className="map-form bgb-opening">
        <label>Starting side<NativeSelect value={side} disabled={!editableOpening} onChange={event => {
          const next = event.target.value as 'red' | 'blue'
          updateTeam(current => ({ ...current, side: next, strategy: undefined }))
          selectMinute(0)
        }}><option value="red">Red HQ · Southwest</option><option value="blue">Blue HQ · Northeast</option></NativeSelect></label>
        <Button disabled={!editableOpening || !plan.length || hasOverlap} onClick={generateOpening}>Generate Opening Plan</Button>
        <details className="bgb-timing-settings">
          <summary>Timing settings</summary>
          <div>{([
            ['buildings', 'Buildings unlock'], ['firstBall', 'First Gold Ball'],
            ['secondBall', 'Second Gold Ball'], ['end', 'Match end'],
          ] as const).map(([key, label]) => <label key={key}>
            {label} (min)
            <Input key={timing[key]} type="number" min="1" max="90" defaultValue={timing[key]} disabled={!editableOpening} onBlur={event => {
              const value = Number(event.target.value)
              if (value === timing[key]) return
              const next = { ...timing, [key]: value }
              if (!validateBgbTiming(next)) {
                event.target.value = String(timing[key])
                setMessage('Choose times in order, with room for both preparation phases.')
                return
              }
              selectMinute(Math.min(minute, next.end))
              updateTeam(current => ({ ...current, timing: next }))
            }} />
          </label>)}</div>
        </details>
        {hasSubstitutions && <p>Opening positions are locked while replacements are recorded.</p>}
      </section>}
      {(message || hasOverlap) && <div className="map-message" role="status">{message ?? 'Resolve players listed on both teams before generating a plan.'}</div>}
      {canEdit && <section className="map-form bgb-add-form">
        <h3>Add participant <UserPlus /></h3>
        <label>Available alliance member<NativeSelect disabled={!loaded || !rosterOptions.length} value={rosterOptions.some(player => player.id === playerId) ? playerId : ''} onChange={event => setPlayerId(event.target.value)}>
          <option value="">{!loaded ? 'Loading rosters…' : rosterOptions.length ? 'Select unassigned member' : 'No unassigned members'}</option>
          {rosterOptions.map(player => <option key={player.id} value={player.id}>{player.name} ({formatPower(player.totalPower)})</option>)}
        </NativeSelect></label>
        <label>Roster<NativeSelect value={hasSubstitutions ? 'reserve' : role} disabled={hasSubstitutions} onChange={event => setRole(event.target.value as BlackGoldParticipantRole)}>
          <option value="active">Starter</option><option value="reserve">Reserve</option>
        </NativeSelect></label>
        <Button disabled={!rosterOptions.some(player => player.id === playerId)} onClick={addMember}><UserPlus />Add to {team.name}</Button>
      </section>}
      <section className="bgb-roster-section">
        <h3>Active roster <span>{plan.length}/{BGB_ACTIVE_LIMIT}</span></h3>
        {plan.map(row => <div key={row.slot.id} className={`bgb-roster-row ${selectedId === row.slot.id ? 'active' : ''}`}>
          <button className="bgb-person" aria-pressed={selectedId === row.slot.id} onClick={() => {
            setSelectedId(row.slot.id)
            const point = row.point
            if (point) setCamera(current => ({ ...point, zoom: Math.max(current.zoom, .28) }))
          }}>
            <i style={{ background: row.slot.color || teamColor }} />
            <span><strong>{nameOf(row.occupant)}{powerOf(row.occupant) != null ? ` (${formatPower(powerOf(row.occupant))})` : ''}</strong>
              <small>{row.point ? `X:${row.point.x} · Y:${row.point.y}` : 'Not placed'}</small></span>
            <MapPin />
          </button>
          {editableOpening && <div className="bgb-row-actions">
            <button aria-label={`Place ${nameOf(row.slot)}`} title="Set opening position" disabled={row.slot.positionLocked} onClick={() => {
              selectMinute(0); setSelectedId(row.slot.id); setMode('place')
            }}><MapPin /></button>
            <button aria-label={`Move ${nameOf(row.slot)} to reserves`} title="Move to reserves" onClick={() => editRoster(row.slot, 'swap')}><Users /></button>
            <button className="danger" aria-label={`Remove ${nameOf(row.slot)}`} onClick={() => editRoster(row.slot, 'remove')}><Trash2 /></button>
          </div>}
        </div>)}
        {!plan.length && <p className="map-empty">No starters yet.</p>}
      </section>
      <section className="bgb-roster-section">
        <h3>Reserves <span>{reserves.length}/{BGB_RESERVE_LIMIT}</span></h3>
        {reserves.map(item => {
          const deployment = team.substitutions?.find(change => change.reserveId === item.id)
          return <div className="bgb-roster-row" key={item.id}>
            <div className="bgb-person"><i style={{ background: item.color || teamColor }} /><span>
              <strong>{nameOf(item)}{powerOf(item) != null ? ` (${formatPower(powerOf(item))})` : ''}</strong>
              <small>{deployment ? `Deployed from ${formatBgbMinute(deployment.minute)}` : 'Available reserve'}</small>
            </span></div>
            {canEdit && !deployment && <div className="bgb-row-actions">
              {editableOpening && <button aria-label={`Move ${nameOf(item)} to starters`} onClick={() => editRoster(item, 'swap')}><Users /></button>}
              <button className="danger" aria-label={`Remove ${nameOf(item)}`} onClick={() => editRoster(item, 'remove')}><Trash2 /></button>
            </div>}
          </div>
        })}
        {!reserves.length && <p className="map-empty">No reserves yet.</p>}
        {canEdit && hasSubstitutions && <Button className="wide" variant="secondary" onClick={() => updateTeam(current => ({ ...current, substitutions: current.substitutions?.slice(0, -1) }))}>Undo last replacement</Button>}
      </section>
    </aside>
    <section className="map-stage">
      {teamTabs('bgb-team-tabs-map')}
      <div className="map-toolbar">
        <div>
          <Button variant="secondary" aria-label="Zoom in" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom * 1.25) }))}><ZoomIn /></Button>
          <Button variant="secondary" aria-label="Zoom out" onClick={() => setCamera(current => ({ ...current, zoom: clampZoom(current.zoom / 1.25) }))}><ZoomOut /></Button>
          <Button variant="secondary" onClick={() => setCamera(blackGoldExportCamera(size.width, size.height))}><Crosshair />Fit</Button>
        </div>
        <span>Drag empty space to pan · Scroll to zoom</span>
        <Button onClick={exportPng}><Download />Export PNG</Button>
      </div>
      <section className="bgb-timeline" aria-label="Match timeline">
        <div className="bgb-timeline-head">
          <strong>{formatBgbMinute(minute)} · {phase.name}</strong>
          <small>Planned positions · elapsed match time</small>
        </div>
        <input type="range" min="0" max={timing.end} step="1" value={minute} aria-label="Elapsed match minute" aria-valuetext={`${formatBgbMinute(minute)} · ${phase.name}`} onChange={event => selectMinute(Number(event.target.value))} />
        <div className="bgb-phases">
          {phases.map(item => <button key={item.index} type="button" aria-pressed={phase.index === item.index} onClick={() => selectMinute(item.minute)}><b>{formatBgbMinute(item.minute)}</b>{item.name}</button>)}
        </div>
        <p>{team.strategy?.length ? phase.instruction : 'Generate an opening plan to add positions and tasks to the timeline.'}</p>
      </section>
      {selected && <section className="bgb-selection" aria-label="Selected player assignment">
        <div><strong>{nameOf(selected.occupant)}</strong>
          <small>{selected.point ? `X:${selected.point.x} · Y:${selected.point.y} · ` : ''}{selected.task}</small>
        </div>
        <div className="bgb-selection-actions">
          {editableOpening && minute === 0 && selected.point && <>
            <Button variant="secondary" aria-pressed={Boolean(selected.slot.positionLocked)} onClick={() => updateTeam(current => ({
              ...current,
              participants: current.participants.map(item => item.id === selected.slot.id ? { ...item, positionLocked: !item.positionLocked } : item),
            }))}>{selected.slot.positionLocked ? <Unlock /> : <Lock />}{selected.slot.positionLocked ? 'Unlock position' : 'Lock position'}</Button>
            <Button variant="secondary" aria-pressed={mode === 'move'} disabled={selected.slot.positionLocked} onClick={() => setMode(mode === 'move' ? 'view' : 'move')}><Pencil />Move</Button>
          </>}
          {canEdit && <Button variant="secondary" disabled={!availableReserves.length} onClick={() => setReplacement({ slotId: selected.slot.id, reserveId: '' })}><Users />Replace Player</Button>}
        </div>
      </section>}
      <div ref={wrapRef} className={`map-canvas-wrap bgb-canvas-wrap mode-${mode === 'move' ? 'edit' : mode}`}>
        <canvas ref={canvasRef} aria-label="Black Gold Battlefield plan map" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onLostPointerCapture={() => { drag.current = null; setPreview(undefined) }} onContextMenu={event => event.preventDefault()} />
      </div>
    </section>
    <Modal open={canEdit && Boolean(replacement)} onOpenChange={open => { if (!open) setReplacement(undefined) }} title="Replace Player">
      <div className="bgb-replacement">
        <p>{selected && nameOf(selected.occupant)} · {team.name} · {formatBgbMinute(minute)}</p>
        <p>The reserve takes this slot’s position and remaining tasks from the selected minute.</p>
        <label>Available reserve<NativeSelect value={replacement?.reserveId ?? ''} onChange={event => {
          const value = event.target.value
          setReplacement(current => current ? { ...current, reserveId: value } : undefined)
        }}><option value="">Select reserve</option>{availableReserves.map(item => <option key={item.id} value={item.id}>{nameOf(item)} ({formatPower(powerOf(item))})</option>)}</NativeSelect></label>
        <div className="actions"><Button variant="secondary" onClick={() => setReplacement(undefined)}>Cancel</Button><Button disabled={!replacement?.reserveId} onClick={confirmReplacement}>Confirm replacement</Button></div>
      </div>
    </Modal>
  </main>
}
