import { NativeSelect } from '../../components/ui'
import { usePlannerStore } from '../../store/usePlannerStore'
import { formatPower } from '../../utils/format'
import { playerAllianceRank } from './AllianceRankBadge'

export function PlayerSelect({ value, onChange, label = 'Alliance player', excludeIds = [] }: { value: string; onChange: (playerId: string) => void; label?: string; excludeIds?: Iterable<string> }) {
  const players = usePlannerStore(state => state.players)
  const excluded = new Set(excludeIds)
  const options = [...players].filter(player => !excluded.has(player.id) || player.id === value).sort((a, b) => b.totalPower - a.totalPower || a.name.localeCompare(b.name))

  return <label>{label}<NativeSelect value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Custom / unlinked tower</option>
    {options.map(player => <option key={player.id} value={player.id}>[{playerAllianceRank(player)}] {player.name} · {formatPower(player.totalPower)}</option>)}
  </NativeSelect></label>
}
