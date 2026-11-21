import type { Assignment, FormationId, OptimizationMode, Plan, Player, Rally, RoundId } from '../../types'
import { formationReady, rallyMetrics } from '../planning/rules'
import { now, uid } from '../../utils/format'

const bestFormation=(p:Player):FormationId|null=> ([1,2,3,4] as FormationId[]).filter(f=>formationReady(p,f)).sort((a,b)=>(p.formations[b].power??0)-(p.formations[a].power??0))[0]??null
const eligible=(p:Player,r:RoundId)=>p.availability!=='unavailable' && (p.availability==='both'||p.availability===`round${r}`) && bestFormation(p)!=null

export function optimizePlan(source:Plan, players:Player[], mode:OptimizationMode):Plan {
  const plan=structuredClone(source); const locked=new Set<string>()
  for(const round of [1,2] as RoundId[]) for(const rally of plan.rounds[round]) {
    if(rally.leader?.locked) locked.add(rally.leader.playerId); else rally.leader=null
    rally.participants=rally.participants.filter(a=>{if(a.locked){locked.add(a.playerId);return true} return false})
  }
  const pool=players.filter(p=>!locked.has(p.id)&&bestFormation(p)!=null).sort((a,b)=>(b.formations[bestFormation(b)!].power??0)-(a.formations[bestFormation(a)!].power??0))
  const roundOneOnly=players.filter(p=>eligible(p,1)&&!eligible(p,2)).length,roundTwoOnly=players.filter(p=>eligible(p,2)&&!eligible(p,1)).length,both=players.filter(p=>eligible(p,1)&&eligible(p,2)).length
  const targetRallies:Record<RoundId,number>={1:Math.min(plan.rules.maxRalliesPerRound,Math.ceil((roundOneOnly+Math.ceil(both/2))/12)),2:Math.min(plan.rules.maxRalliesPerRound,Math.ceil((roundTwoOnly+Math.floor(both/2))/12))}
  const totals:Record<RoundId,number>={1:plan.rounds[1].reduce((sum,r)=>sum+rallyMetrics(r,players).power,0),2:plan.rounds[2].reduce((sum,r)=>sum+rallyMetrics(r,players).power,0)}; const used=new Set(locked)
  const assignedTo=new Map<string,RoundId>(),leaderCounts:Record<RoundId,Map<string,number>>={1:new Map(),2:new Map()}
  for(const round of [1,2] as RoundId[])for(const rally of plan.rounds[round]){if(rally.leader){assignedTo.set(rally.leader.playerId,round);leaderCounts[round].set(rally.leader.playerId,(leaderCounts[round].get(rally.leader.playerId)??0)+1)}for(const assignment of rally.participants)assignedTo.set(assignment.playerId,round)}
  const chooseRound=(p:Player):RoundId|null=>{const valid=([1,2] as RoundId[]).filter(r=>eligible(p,r)); if(!valid.length)return null; if(valid.length===1)return valid[0]; return mode==='balanced'?(totals[1]<=totals[2]?1:2):(plan.rounds[1].length<=plan.rounds[2].length?1:2)}
  // Leaders first: capacity matters before raw strength. New groups are created only when a valid leader exists.
  for(const round of [1,2] as RoundId[]) {
    const chooseLeader=()=>players.filter(p=>eligible(p,round)&&p.allowLeader&&(leaderCounts[round].get(p.id)??0)<4&&(!assignedTo.has(p.id)||assignedTo.get(p.id)===round)&&!plan.rounds[round].some(r=>r.participants.some(a=>a.playerId===p.id))).sort((a,b)=>(leaderCounts[round].get(a.id)??0)-(leaderCounts[round].get(b.id)??0)||(b.rallyCapacity??0)-(a.rallyCapacity??0)||((b.formations[bestFormation(b)!].power??0)-(a.formations[bestFormation(a)!].power??0)))[0]
    const setLeader=(rally:Rally,candidate:Player)=>{const f=bestFormation(candidate)!;rally.leader={playerId:candidate.id,formation:f,locked:false};used.add(candidate.id);assignedTo.set(candidate.id,round);leaderCounts[round].set(candidate.id,(leaderCounts[round].get(candidate.id)??0)+1);totals[round]+=candidate.formations[f].power??0}
    for(const rally of plan.rounds[round]) if(!rally.leader){const candidate=chooseLeader();if(candidate)setLeader(rally,candidate)}
    while(plan.rounds[round].length<targetRallies[round]){const candidate=chooseLeader();if(!candidate)break;const rally={id:uid(),name:`Rally ${plan.rounds[round].length+1}`,leader:null,participants:[]} satisfies Rally;setLeader(rally,candidate);plan.rounds[round].push(rally)}
  }
  for(const p of pool){if(used.has(p.id))continue;let round=chooseRound(p);if(!round)continue;const f=bestFormation(p)!;const candidates=plan.rounds[round].filter(r=>r.leader&&r.participants.length<12).sort((a,b)=>a.participants.length-b.participants.length||rallyMetrics(a,players).power-rallyMetrics(b,players).power);let rally=candidates[0]
    if(!rally&&p.availability==='both'){const alt:RoundId=round===1?2:1; rally=plan.rounds[alt].filter(r=>r.leader&&r.participants.length<12).sort((a,b)=>a.participants.length-b.participants.length||rallyMetrics(a,players).power-rallyMetrics(b,players).power)[0];if(rally)round=alt}
    if(rally){rally.participants.push({playerId:p.id,formation:f,locked:false});used.add(p.id);totals[round]+=p.formations[f].power??0}
  }
  plan.optimizationMode=mode;plan.objectiveScore=totals[1]+totals[2];plan.updatedAt=now();return plan
}
