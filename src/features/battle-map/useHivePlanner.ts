import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { HiveLayout, HivePlan } from '../../types'
import { chamberBounds, DEFAULT_HIVE, defaultChamber, generateHive, hiveSettingsError, moveHiveShelter, shelterBounds, transformHive, type HiveAreaChange, type HiveSettings } from './hiveLayout'
import { overlaps, type MapPoint, type Rect } from './mapGeometry'

type Mode = 'pan' | 'area' | 'edit-area' | 'chamber' | 'shelter'
type HiveDraft = HiveSettings & Pick<HivePlan, 'placements'>
type HiveUndo = { saved?: HivePlan; draft?: HiveDraft; expected?: string }

export function useHivePlanner(canEdit: boolean, enabled: boolean) {
  const roster = usePlannerStore(state => state.players)
  const [saved, setSaved] = useState<HivePlan>()
  const [draft, setDraft] = useState<HiveDraft>()
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<Mode>('pan')
  const [selectedId, setSelectedId] = useState<string>()
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>()
  const [history, setHistory] = useState<HiveUndo[]>([])
  const settings = draft ?? saved ?? DEFAULT_HIVE
  const placements = draft?.placements ?? saved?.placements ?? []
  const editable = canEdit && enabled && ready && !saving
  const canUndo = editable && history.length > 0 && history.at(-1)?.expected === saved?.updatedAt

  useEffect(() => {
    if (!enabled) return
    const subscription = liveQuery(() => db.hivePlans.get('primary')).subscribe({
      next(plan) {
        setSaved(plan)
        setReady(true)
      },
      error() { setFeedback({ text: 'The shared hive plan could not be loaded.', error: true }) },
    })
    return () => subscription.unsubscribe()
  }, [enabled])

  function recordUndo(expected: string | undefined) {
    setHistory(entries => {
      const previous = entries.at(-1)?.expected === saved?.updatedAt ? entries.slice(-29) : []
      return [...previous, { saved, draft, expected }]
    })
  }

  function changeSettings(next: HiveSettings, nextMode: Mode = 'pan', proposed = placements) {
    recordUndo(saved?.updatedAt)
    setDraft({ ...next, placements: proposed.filter(placement => placement.manual) })
    setSelectedId(undefined)
    setMode(nextMode)
    setFeedback(undefined)
  }

  function selectLayout(layout: HiveLayout) {
    if (editable) changeSettings({ layout, bounds: settings.bounds, chamber: settings.chamber })
  }

  function selectArea(bounds: Rect) {
    if (!editable) return false
    if (bounds.maxX - bounds.minX < 3 || bounds.maxY - bounds.minY < 3) {
      setFeedback({ text: 'Draw an area at least 4 × 4 tiles wide.', error: true })
      return false
    }
    changeSettings({ layout: settings.layout, bounds, chamber: defaultChamber(bounds) })
    return true
  }

  async function writePlan(plan?: HivePlan) {
    await db.transaction('rw', db.hivePlans, async () => {
      const current = await db.hivePlans.get('primary')
      if (current?.updatedAt !== saved?.updatedAt) throw new Error('The hive plan changed. Review it and try again.')
      if (plan) await db.hivePlans.put(plan)
      else await db.hivePlans.delete('primary')
    })
    setSaved(plan)
    window.dispatchEvent(new Event('planner-local-change'))
  }

  async function save(plan: HivePlan, message: string, nextMode: Mode = 'pan') {
    setSaving(true)
    try {
      await writePlan(plan)
      recordUndo(plan.updatedAt)
      setDraft(undefined)
      setMode(nextMode)
      setFeedback({ text: message })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'The hive plan could not be saved.', error: true })
    } finally {
      setSaving(false)
    }
  }

  async function undo() {
    const previous = history.at(-1)
    if (!canUndo || !previous) return
    setSaving(true)
    try {
      let restored = previous.saved
      if (restored?.updatedAt !== saved?.updatedAt) {
        if (restored) restored = { ...restored, updatedAt: new Date().toISOString() }
        await writePlan(restored)
      }
      setDraft(previous.draft)
      setHistory(entries => {
        const remaining = entries.slice(0, -1)
        const top = remaining.at(-1)
        if (top) remaining[remaining.length - 1] = { ...top, expected: restored?.updatedAt }
        return remaining
      })
      setMode('pan')
      setSelectedId(undefined)
      setFeedback({ text: 'Last hive change undone.' })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'The hive change could not be undone.', error: true })
    } finally {
      setSaving(false)
    }
  }

  function editArea(change: HiveAreaChange) {
    if (!editable) return
    const next = transformHive({ ...settings, placements }, change)
    if (saved && !draft && next.canKeepPlacements) {
      void save({ ...saved, ...next.settings, placements: next.placements, updatedAt: new Date().toISOString() },
        'Hive area updated.', 'edit-area')
      return
    }
    changeSettings(next.settings, 'edit-area', next.placements)
    if (!next.canKeepPlacements) {
      const issue = hiveSettingsError(next.settings)
      setFeedback({ text: issue ?? 'Generate & save a new layout to apply this area.', error: Boolean(issue) })
    }
  }

  function generate() {
    if (!editable || !roster.length) return
    const pinned = placements.filter(placement => placement.manual)
    const result = generateHive(settings, roster, pinned)
    if (result.error || !result.placements.length) {
      setFeedback({ text: result.error ?? 'There is no room for a 3 × 3 shelter in this area.', error: true })
      return
    }
    const placed = pinned.length
      ? `${pinned.length} pinned · ${result.placements.length - pinned.length} generated`
      : `${result.placements.length} members placed by total power`
    void save({
      id: 'primary', layout: settings.layout, bounds: settings.bounds, chamber: settings.chamber,
      placements: result.placements, updatedAt: new Date().toISOString(),
    }, result.unplaced.length
      ? `${placed} · ${result.unplaced.length} could not fit. Draw a larger area to fit everyone.`
      : `${placed}.`)
  }

  function savePlacements(next: HivePlan['placements'], message: string) {
    void save({ ...settings, id: 'primary', placements: next, updatedAt: new Date().toISOString() }, message)
  }

  function clearPlacements() {
    if (!editable || (!placements.length && !saved?.placements.length)) return
    const issue = hiveSettingsError(settings)
    if (issue) {
      setFeedback({ text: issue, error: true })
      return
    }
    setSelectedId(undefined)
    savePlacements([], 'All shelters cleared.')
  }

  function releaseShelter() {
    if (!editable || !placements.some(placement => placement.playerId === selectedId && placement.manual)) return
    if (draft) {
      changeSettings(settings, 'pan', placements.filter(placement => placement.playerId !== selectedId))
      return
    }
    savePlacements(placements.map(placement => placement.playerId === selectedId ? { ...placement, manual: false } : placement),
      'Shelter released. The next generation can move it.')
  }

  function placeChamber(point: MapPoint) {
    if (!editable || (point.x === settings.chamber.x && point.y === settings.chamber.y)) return
    const next = { layout: settings.layout, bounds: settings.bounds, chamber: point }
    const error = hiveSettingsError(next)
    if (error) {
      setFeedback({ text: error, error: true })
      return
    }
    const pinned = placements.find(placement => placement.manual && overlaps(chamberBounds(point), shelterBounds(placement)))
    if (pinned) {
      setFeedback({ text: `Frankenstein overlaps ${pinned.name}. Move or release that shelter first.`, error: true })
      return
    }
    const occupied = placements.some(placement => overlaps(chamberBounds(point), shelterBounds(placement)))
    if (saved && !draft && !occupied) {
      void save({ ...saved, chamber: point, updatedAt: new Date().toISOString() }, 'Frankenstein moved.')
      return
    }
    changeSettings(next)
    if (occupied) setFeedback({ text: 'Frankenstein overlaps planned shelters. Generate & save to rearrange them.' })
  }

  function chooseTile(point: MapPoint) {
    if (mode === 'chamber') {
      placeChamber(point)
      return
    }
    if (mode === 'shelter' && editable && selectedId) {
      const existing = placements.find(placement => placement.playerId === selectedId)
      const player = roster.find(member => member.id === selectedId)
      const name = player?.name ?? existing?.name
      if (!name) return
      const issue = hiveSettingsError(settings)
      if (issue) {
        setFeedback({ text: issue, error: true })
        return
      }
      try {
        const moved = moveHiveShelter({ ...settings, id: 'primary', placements, updatedAt: '' }, { playerId: selectedId, name }, point)
        savePlacements(moved.placements, `${name} pinned at X:${point.x} Y:${point.y}.`)
      } catch (error) {
        setFeedback({ text: error instanceof Error ? error.message : 'This shelter could not be moved.', error: true })
      }
      return
    }
    const tile = { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y }
    setSelectedId(placements.find(placement => overlaps(shelterBounds(placement), tile))?.playerId)
  }

  return {
    roster, settings, placements, ready, canEdit, editable, mode, setMode, selectedId, setSelectedId, feedback,
    selectLayout, selectArea, editArea, chooseTile, placeChamber, generate, canUndo, undo, clearPlacements, releaseShelter,
    canClear: editable && Boolean(placements.length || saved?.placements.length),
    cancelDraft: () => {
      if (!editable || !draft) return
      recordUndo(saved?.updatedAt)
      setDraft(undefined)
      setMode('pan')
      setFeedback(undefined)
    },
    hasDraft: Boolean(draft),
  }
}
