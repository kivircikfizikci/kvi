import { NativeSelect } from '../../components/ui'
import { usePlannerStore } from '../../store/usePlannerStore'
import { formatPower } from '../../utils/format'

export function PlayerSelect({ value, onChange, label = 'Alliance player' }: { value: string; onChange: (playerId: string) => void; label?: string }) {
  const players = usePlannerStore(state => state.players)
  const options = [...players].filter(player => player.active).sort((a, b) => b.totalPower - a.totalPower || a.name.localeCompare(b.name))

  return <label>{label}<NativeSelect value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Custom / unlinked tower</option>
    {options.map(player => <option key={player.id} value={player.id}>{player.name} · {formatPower(player.totalPower)}</option>)}
  </NativeSelect></label>
}
