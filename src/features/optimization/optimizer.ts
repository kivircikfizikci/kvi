import type { Assignment, FormationId, OptimizationMode, Plan, Player, Rally, RoundId } from '../../types'
import { formationReady, rallyMetrics } from '../planning/rules'
import { now, uid } from '../../utils/format'

const bestFormation=(p:Player):FormationId|null=> ([1,2,3] as FormationId[]).filter(f=>formationReady(p,f)).sort((a,b)=>(p.formations[b].power??0)-(p.formations[a].power??0))[0]??null
const eligible=(p:Player,r:RoundId)=>p.active && p.availability!=='unavailable' && (p.availability==='both'||p.availability===`round${r}`) && bestFormation(p)!=null

export function optimizePlan(source:Plan, players:Player[], mode:OptimizationMode):Plan {
  const plan=structuredClone(source); const locked=new Set<string>()
  for(const round of [1,2] as RoundId[]) for(const rally of plan.rounds[round]) {
    if(rally.leader?.locked) locked.add(rally.leader.playerId); else rally.leader=null
    rally.participants=rally.participants.filter(a=>{if(a.locked){locked.add(a.playerId);return true} return false})
  }
  const pool=players.filter(p=>!locked.has(p.id)&&bestFormation(p)!=null).sort((a,b)=> mode==='balanced' ? (b.priority-a.priority)||((b.formations[bestFormation(b)!].power??0)-(a.formations[bestFormation(a)!].power??0)) : ((b.formations[bestFormation(b)!].power??0)-(a.formations[bestFormation(a)!].power??0))||(b.priority-a.priority))
  const totals:Record<RoundId,number>={1:plan.rounds[1].reduce((sum,r)=>sum+rallyMetrics(r,players).power,0),2:plan.rounds[2].reduce((sum,r)=>sum+rallyMetrics(r,players).power,0)}; const used=new Set(locked)
  const chooseRound=(p:Player):RoundId|null=>{const valid=([1,2] as RoundId[]).filter(r=>eligible(p,r)); if(!valid.length)return null; if(valid.length===1)return valid[0]; return mode==='balanced'?(totals[1]<=totals[2]?1:2):(plan.rounds[1].length<=plan.rounds[2].length?1:2)}
  // Leaders first: capacity matters before raw strength. New groups are created only when a valid leader exists.
  for(const round of [1,2] as RoundId[]) {
    const chooseLeader=()=>pool.filter(p=>!used.has(p.id)&&eligible(p,round)&&p.allowLeader&&p.rallyCapacity!=null).sort((a,b)=>(b.rallyCapacity??0)-(a.rallyCapacity??0)||((b.formations[bestFormation(b)!].power??0)-(a.formations[bestFormation(a)!].power??0)))[0]
    for(const rally of plan.rounds[round]) if(!rally.leader){const candidate=chooseLeader();if(candidate){const f=bestFormation(candidate)!;rally.leader={playerId:candidate.id,formation:f,locked:false};used.add(candidate.id);totals[round]+=candidate.formations[f].power??0}}
    while(plan.rounds[round].length<plan.rules.maxRalliesPerRound){const candidate=chooseLeader();if(!candidate)break;const f=bestFormation(candidate)!;plan.rounds[round].push({id:uid(),name:`Rally ${plan.rounds[round].length+1}`,leader:{playerId:candidate.id,formation:f,locked:false},participants:[]});used.add(candidate.id);totals[round]+=candidate.formations[f].power??0}
  }
  for(const p of pool){if(used.has(p.id))continue;let round=chooseRound(p);if(!round)continue;const f=bestFormation(p)!;const troop=p.formations[f].troops!;const candidates=plan.rounds[round].filter(r=>r.leader&&rallyMetrics(r,players).remaining!>=troop).sort((a,b)=>(rallyMetrics(a,players).remaining??0)-(rallyMetrics(b,players).remaining??0));let rally=candidates[0]
    if(!rally&&p.availability==='both'){const alt:RoundId=round===1?2:1; rally=plan.rounds[alt].filter(r=>r.leader&&rallyMetrics(r,players).remaining!>=troop).sort((a,b)=>(rallyMetrics(a,players).remaining??0)-(rallyMetrics(b,players).remaining??0))[0];if(rally)round=alt}
    if(rally){rally.participants.push({playerId:p.id,formation:f,locked:false});used.add(p.id);totals[round]+=p.formations[f].power??0}
  }
  plan.optimizationMode=mode;plan.objectiveScore=totals[1]+totals[2];plan.updatedAt=now();return plan
}
