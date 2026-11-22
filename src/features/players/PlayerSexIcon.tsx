import { Mars, Venus } from 'lucide-react'
import type { Player } from '../../types'
import './player-sex-icon.css'

export function PlayerSexIcon({sex}:{sex:Player['sex']}){
  if(sex===1)return <Mars className="player-sex player-sex-male" aria-label="Male"/>
  if(sex===2)return <Venus className="player-sex player-sex-female" aria-label="Female"/>
  return null
}
