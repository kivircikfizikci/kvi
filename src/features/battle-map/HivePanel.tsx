import { Box, Lock, MapPin, Move, Scan, Trash2, Undo2, Unlock, WandSparkles } from 'lucide-react'
import { Button, NativeSelect } from '../../components/ui'
import type { HiveLayout } from '../../types'
import { formatPower } from '../../utils/format'
import { MAX_PLAYERS } from '../players/constants'
import { chamberBounds, shelterBounds } from './hiveLayout'
import { intersectsShieldZone } from './shieldZone'
import type { useHivePlanner } from './useHivePlanner'

const layouts = [
  { value: 'compact', label: 'Compact', description: 'A packed block of 3 × 3 shelters.' },
  { value: 'cross', label: 'Cross', description: 'Four wings with corridors up to two tiles wide.' },
  { value: 'lanes', label: 'Access lanes', description: 'Lanes up to two tiles wide between pairs of shelter columns.' },
] as const

export function HivePanel({ hive, focus }: {
  hive: ReturnType<typeof useHivePlanner>
  focus: (point: { x: number; y: number }) => void
}) {
  const { bounds, chamber, layout } = hive.settings
  const players = new Map(hive.roster.map(player => [player.id, player]))
  const roster = [...hive.roster].sort((a, b) => a.name.localeCompare(b.name))
  const selectedShelter = hive.placements.find(placement => placement.playerId === hive.selectedId)
  return <aside className="map-sidebar hive-sidebar">
    <header>
      <h2>Hive Planner</h2>
      <span>Frankenstein placements · {hive.placements.length}/{Math.min(hive.roster.length, MAX_PLAYERS)} members</span>
    </header>
    <section className="hive-controls">
      <label htmlFor="hive-layout">Layout</label>
      <NativeSelect id="hive-layout" disabled={!hive.editable} value={layout}
        onChange={event => hive.selectLayout(event.target.value as HiveLayout)}>
        {layouts.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </NativeSelect>
      <p>{layouts.find(item => item.value === layout)?.description}</p>
      <dl>
        <dt>Hive area</dt><dd>X:{bounds.minX}–{bounds.maxX} · Y:{bounds.minY}–{bounds.maxY}</dd>
        <dt>Frankenstein</dt><dd>X:{chamber.x}–{chamber.x + 3} · Y:{chamber.y}–{chamber.y + 3}</dd>
      </dl>
      {intersectsShieldZone(bounds) &&
        <p className="hive-warning">Part of this hive area is in the gray zone, where shields are unavailable.</p>}
      {hive.canEdit && <>
        <div className="hive-actions">
          <Button variant="secondary" disabled={!hive.editable} aria-pressed={hive.mode === 'area'} onClick={() => hive.setMode(hive.mode === 'area' ? 'pan' : 'area')}>
            <Scan />Draw area
          </Button>
          <Button variant="secondary" disabled={!hive.editable} aria-pressed={hive.mode === 'edit-area'} onClick={() => hive.setMode(hive.mode === 'edit-area' ? 'pan' : 'edit-area')}>
            <Move />Edit area
          </Button>
          <Button variant="secondary" disabled={!hive.editable} aria-pressed={hive.mode === 'chamber'} onClick={() => hive.setMode(hive.mode === 'chamber' ? 'pan' : 'chamber')}>
            <Box />Move Frankenstein
          </Button>
          <Button variant="secondary" disabled={!hive.canClear} onClick={hive.clearPlacements}><Trash2 />Clear placements</Button>
        </div>
        <label htmlFor="hive-manual-player">Manual placement</label>
        <NativeSelect id="hive-manual-player" disabled={!hive.editable} value={hive.selectedId ?? ''}
          onChange={event => {
            hive.setSelectedId(event.target.value || undefined)
            hive.setMode(event.target.value ? 'shelter' : 'pan')
          }}>
          <option value="">Select an alliance member</option>
          {roster.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
          {selectedShelter && !players.has(selectedShelter.playerId) &&
            <option value={selectedShelter.playerId}>{selectedShelter.name}</option>}
        </NativeSelect>
        <div className="hive-actions">
          <Button variant="secondary" disabled={!hive.editable || !hive.selectedId} aria-pressed={hive.mode === 'shelter'}
            onClick={() => hive.setMode(hive.mode === 'shelter' ? 'pan' : 'shelter')}><MapPin />Place on map</Button>
          {selectedShelter?.manual && <Button variant="secondary" disabled={!hive.editable} onClick={hive.releaseShelter}>
            <Unlock />Release shelter
          </Button>}
        </div>
        {hive.mode !== 'pan' && <p className="hive-instruction" role="status">{
          hive.mode === 'area' ? 'Drag from one corner of the hive to the opposite corner on the map.' :
            hive.mode === 'edit-area' ? 'Drag inside the area to move it. Drag an edge or corner to resize.' :
            hive.mode === 'chamber' ? 'Drag Frankenstein, or tap the new southwest tile for the chamber.' :
              'Tap the center tile to pin this 3 × 3 shelter.'
        }</p>}
        <div className="hive-actions">
          <Button disabled={!hive.editable || !hive.roster.length} onClick={hive.generate}><WandSparkles />Generate & save</Button>
          <Button variant="secondary" disabled={!hive.canUndo} onClick={() => void hive.undo()}><Undo2 />Undo</Button>
          {hive.hasDraft && <Button variant="secondary" disabled={!hive.editable} onClick={hive.cancelDraft}>Discard changes</Button>}
        </div>
      </>}
      {!hive.ready && !hive.feedback && <p>Loading the shared hive plan…</p>}
      {hive.feedback && <p className={hive.feedback.error ? 'hive-warning' : 'hive-instruction'} role={hive.feedback.error ? 'alert' : 'status'}>{hive.feedback.text}</p>}
      {intersectsShieldZone(chamberBounds(chamber)) &&
        <p className="hive-warning">The Frankenstein chamber overlaps the gray zone.</p>}
    </section>
    <section className="tower-list hive-roster">
      <h3>Planned shelters <span>{hive.placements.length}</span></h3>
      {hive.placements.map(placement => {
        const player = players.get(placement.playerId)
        return <button key={placement.playerId} type="button" className={hive.selectedId === placement.playerId ? 'active' : ''}
          aria-pressed={hive.selectedId === placement.playerId} onClick={() => {
            hive.setSelectedId(placement.playerId)
            focus(placement)
          }}>
          <i className={placement.manual ? 'hive-manual-marker' : undefined} />
          <span><strong>{player?.name ?? placement.name}{player && ` (${formatPower(player.totalPower)})`}</strong>
            <small>X:{placement.x} · Y:{placement.y}{placement.manual && ' · Pinned'}{intersectsShieldZone(shelterBounds(placement)) && ' · Shield unavailable'}</small></span>
          {placement.manual ? <Lock /> : <MapPin />}
        </button>
      })}
    </section>
  </aside>
}
