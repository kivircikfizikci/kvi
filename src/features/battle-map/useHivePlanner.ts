import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { usePlannerStore } from '../../store/usePlannerStore'
import type { HiveLayout, HivePlan } from '../../types'
import { DEFAULT_HIVE, defaultChamber, generateHive, hiveSettingsError, moveHiveShelter, shelterBounds, transformHive, type HiveAreaChange, type HiveSettings } from './hiveLayout'
import { overlaps, type MapPoint, type Rect } from './mapGeometry'

type Mode = 'pan' | 'area' | 'edit-area' | 'chamber' | 'shelter'

export function useHivePlanner(canEdit: boolean, enabled: boolean) {
  const roster = usePlannerStore(state => state.players)
  const [saved, setSaved] = useState<HivePlan>()
  const [draft, setDraft] = useState<HiveSettings>()
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<Mode>('pan')
  const [selectedId, setSelectedId] = useState<string>()
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>()
  const settings = draft ?? saved ?? DEFAULT_HIVE
  const placements = draft ? [] : saved?.placements ?? []
  const editable = canEdit && enabled && ready && !saving

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

  function changeSettings(next: HiveSettings, nextMode: Mode = 'pan') {
    setDraft(next)
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

  async function save(plan: HivePlan, message: string, nextMode: Mode = 'pan') {
    setSaving(true)
    try {
      await db.transaction('rw', db.hivePlans, async () => {
        const current = await db.hivePlans.get('primary')
        if (current?.updatedAt !== saved?.updatedAt) throw new Error('The hive plan changed. Review it and try again.')
        await db.hivePlans.put(plan)
      })
      setSaved(plan)
      setDraft(undefined)
      setMode(nextMode)
      setFeedback({ text: message })
      window.dispatchEvent(new Event('planner-local-change'))
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'The hive plan could not be saved.', error: true })
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
    changeSettings(next.settings, 'edit-area')
    if (!next.canKeepPlacements) {
      const issue = hiveSettingsError(next.settings)
      setFeedback({ text: issue ?? 'Generate & save a new layout to apply this area.', error: Boolean(issue) })
    }
  }

  function generate() {
    if (!editable || !roster.length) return
    const result = generateHive(settings, roster)
    if (result.error || !result.placements.length) {
      setFeedback({ text: result.error ?? 'There is no room for a 3 × 3 shelter in this area.', error: true })
      return
    }
    void save({
      id: 'primary', layout: settings.layout, bounds: settings.bounds, chamber: settings.chamber,
      placements: result.placements, updatedAt: new Date().toISOString(),
    }, result.unplaced.length
      ? `${result.placements.length} placed · ${result.unplaced.length} could not fit. Draw a larger area to fit everyone.`
      : `${result.placements.length} members placed by total power.`)
  }

  function chooseTile(point: MapPoint) {
    if (mode === 'chamber' && editable) {
      const next = { layout: settings.layout, bounds: settings.bounds, chamber: point }
      const error = hiveSettingsError(next)
      if (error) setFeedback({ text: error, error: true })
      else changeSettings(next)
      return
    }
    if (mode === 'shelter' && editable && saved && !draft) {
      const selected = saved.placements.find(placement => placement.playerId === selectedId)
      if (!selected) return
      try {
        const moved = moveHiveShelter(saved, selected, point)
        void save({ ...moved, updatedAt: new Date().toISOString() }, `${selected.name} moved to X:${point.x} Y:${point.y}.`)
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
    selectLayout, selectArea, editArea, chooseTile, generate,
    resetArea: () => { if (editable) changeSettings({ ...DEFAULT_HIVE, layout: settings.layout }) },
    cancelDraft: () => { setDraft(undefined); setMode('pan'); setFeedback(undefined) },
    hasDraft: Boolean(draft),
  }
}
