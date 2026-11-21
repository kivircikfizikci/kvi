import type { AllianceRank, Player } from '../../types'
import './alliance-rank-badge.css'

export const playerAllianceRank=(player:Player):AllianceRank=>player.allianceRank??'R1'

export function AllianceRankBadge({rank}:{rank:AllianceRank}){
  return <span className={`alliance-rank-badge alliance-rank-${rank.toLowerCase()}`}>{rank}</span>
}
