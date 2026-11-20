import type { Assignment, FormationId, Plan, Player, Rally, RallyMetrics, RoundId, ValidationIssue } from '../../types'

export function formationReady(player: Player, formation: FormationId) {
  const f = player.formations[formation]
  return f.power != null && f.troops != null
}
export function rallyMetrics(rally: Rally, players: Player[]): RallyMetrics {
  const byId = new Map(players.map(p => [p.id,p]))
  const leader = rally.leader ? byId.get(rally.leader.playerId) : undefined
  const capacity = leader?.rallyCapacity ?? null
  let power = 0, usedCapacity = 0
  if (leader && rally.leader) power += leader.formations[rally.leader.formation].power ?? 0
  for (const a of rally.participants) {
    const p = byId.get(a.playerId); if (!p) continue
    power += p.formations[a.formation].power ?? 0
    usedCapacity += p.formations[a.formation].troops ?? 0
  }
  return { power, usedCapacity, capacity, remaining: capacity == null ? null : capacity-usedCapacity, utilization: capacity && capacity > 0 ? usedCapacity/capacity*100 : null }
}
export function assignedRound(plan: Plan, playerId: string): RoundId | null {
  for (const round of [1,2] as RoundId[]) for (const r of plan.rounds[round])
    if (r.leader?.playerId===playerId || r.participants.some(a=>a.playerId===playerId)) return round
  return null
}
export function validateAssignment(plan: Plan, players: Player[], round: RoundId, rallyId: string, assignment: Assignment, asLeader=false): ValidationIssue[] {
  const issues: ValidationIssue[]=[]; const player=players.find(p=>p.id===assignment.playerId); const rally=plan.rounds[round].find(r=>r.id===rallyId)
  if (!player || !rally) return [{code:'missing',message:'Player or rally no longer exists.',severity:'error'}]
  if (!player.active) issues.push({code:'inactive',message:`${player.name} is inactive.`,severity:'error',playerId:player.id})
  if (plan.rules.enforceAvailability && !(['both',`round${round}`].includes(player.availability))) issues.push({code:'availability',message:`${player.name} is not available for Round ${round}.`,severity:'error',playerId:player.id})
  if (!formationReady(player,assignment.formation)) issues.push({code:'formation',message:`${player.name}'s Formation ${assignment.formation} is incomplete.`,severity:'error',playerId:player.id})
  if (asLeader && !player.allowLeader) issues.push({code:'leader',message:`${player.name} cannot lead rallies.`,severity:'error',playerId:player.id})
  const otherRound: RoundId = round===1?2:1
  if (plan.rules.enforceRoundExclusivity && plan.rounds[otherRound].some(r=>r.leader?.playerId===player.id||r.participants.some(a=>a.playerId===player.id))) issues.push({code:'exclusive',message:`${player.name} is already assigned to Round ${otherRound}.`,severity:'error',playerId:player.id})
  const sameRound = plan.rounds[round].some(r=>r.leader?.playerId===player.id||r.participants.some(a=>a.playerId===player.id))
  if (sameRound) issues.push({code:'duplicate',message:`${player.name} is already assigned in Round ${round}.`,severity:'error',playerId:player.id})
  if (!asLeader && plan.rules.enforceCapacity) {
    const m=rallyMetrics(rally,players); const troops=player.formations[assignment.formation].troops
    if (m.capacity==null) issues.push({code:'capacity-missing',message:'Leader rally capacity is missing.',severity:'error',rallyId})
    else if (troops!=null && m.usedCapacity+troops>m.capacity) issues.push({code:'capacity',message:'This assignment would exceed rally capacity.',severity:'error',rallyId})
  }
  return issues
}
export function validatePlan(plan: Plan, players: Player[]): ValidationIssue[] {
  const issues:ValidationIssue[]=[]; const global=new Map<string,RoundId>(); const occurrences=new Map<string,number>()
  for (const round of [1,2] as RoundId[]) for (const rally of plan.rounds[round]) {
    if (!rally.leader) issues.push({code:'leader-missing',message:`${rally.name} needs a leader.`,severity:'warning',rallyId:rally.id})
    const members=[...(rally.leader?[rally.leader]:[]),...rally.participants]
    for(const a of members){ const p=players.find(x=>x.id===a.playerId); if(!p) continue; const key=`${round}-${p.id}`;const count=(occurrences.get(key)??0)+1;occurrences.set(key,count);if(count>1)issues.push({code:'duplicate',message:`${p.name} is assigned more than once in Round ${round}.`,severity:'error',playerId:p.id}); const prev=global.get(p.id); if(prev && prev!==round && plan.rules.enforceRoundExclusivity) issues.push({code:'exclusive',message:`${p.name} appears in both rounds.`,severity:'error',playerId:p.id}); else global.set(p.id,round); if(!formationReady(p,a.formation)) issues.push({code:'formation',message:`${p.name} has incomplete Formation ${a.formation}.`,severity:'error',playerId:p.id}) }
    const m=rallyMetrics(rally,players); if(m.capacity==null&&rally.leader) issues.push({code:'capacity-missing',message:`${rally.name} leader has no rally capacity.`,severity:'warning',rallyId:rally.id}); else if(m.remaining!=null&&m.remaining<0) issues.push({code:'capacity',message:`${rally.name} exceeds capacity.`,severity:'error',rallyId:rally.id});if(plan.rules.minimumRallyPower!=null&&m.power<plan.rules.minimumRallyPower)issues.push({code:'minimum-power',message:`${rally.name} is below the configured minimum power.`,severity:'warning',rallyId:rally.id})
  }
  return issues
}
