import type { Assignment, FormationId, Plan, Player, Rally, RallyMetrics, RoundId, ValidationIssue } from '../../types'

export function formationReady(player: Player, formation: FormationId) {
  const f = player.formations[formation]
  return f.power != null
}
export function rallyMetrics(rally: Rally, players: Player[]): RallyMetrics {
  const byId = new Map(players.map(p => [p.id,p]))
  const leader = rally.leader ? byId.get(rally.leader.playerId) : undefined
  const capacity = leader?.rallyCapacity ?? null
  let power = 0
  if (leader && rally.leader) power += leader.formations[rally.leader.formation].power ?? 0
  for (const a of rally.participants) {
    const p = byId.get(a.playerId); if (!p) continue
    power += p.formations[a.formation].power ?? 0
  }
  return { power, capacity }
}
export function assignedRound(plan: Plan, playerId: string): RoundId | null {
  for (const round of [1,2] as RoundId[]) for (const r of plan.rounds[round])
    if (r.leader?.playerId===playerId || r.participants.some(a=>a.playerId===playerId)) return round
  return null
}
export function validateAssignment(plan: Plan, players: Player[], round: RoundId, rallyId: string, assignment: Assignment, asLeader=false): ValidationIssue[] {
  const issues: ValidationIssue[]=[]; const player=players.find(p=>p.id===assignment.playerId); const rally=plan.rounds[round].find(r=>r.id===rallyId)
  if (!player || !rally) return [{code:'missing',message:'Player or rally no longer exists.',severity:'error'}]
  if (plan.rules.enforceAvailability && !(['both',`round${round}`].includes(player.availability))) issues.push({code:'availability',message:`${player.name} is not available for Round ${round}.`,severity:'error',playerId:player.id})
  if (!formationReady(player,assignment.formation)) issues.push({code:'formation',message:`${player.name}'s Formation ${assignment.formation} is incomplete.`,severity:'error',playerId:player.id})
  if (asLeader && !player.allowLeader) issues.push({code:'leader',message:`${player.name} cannot lead rallies.`,severity:'error',playerId:player.id})
  const otherRound: RoundId = round===1?2:1
  if (plan.rules.enforceRoundExclusivity && plan.rounds[otherRound].some(r=>r.leader?.playerId===player.id||r.participants.some(a=>a.playerId===player.id))) issues.push({code:'exclusive',message:`${player.name} is already assigned to Round ${otherRound}.`,severity:'error',playerId:player.id})
  const leaderRallies=plan.rounds[round].filter(r=>r.leader?.playerId===player.id)
  const participantRallies=plan.rounds[round].filter(r=>r.participants.some(a=>a.playerId===player.id))
  if(asLeader){
    if(participantRallies.length)issues.push({code:'leader-participant-conflict',message:`${player.name} is already a participant in Round ${round}.`,severity:'error',playerId:player.id})
    const alreadyLeadsTarget=rally.leader?.playerId===player.id
    if(!alreadyLeadsTarget&&leaderRallies.length>=4)issues.push({code:'leader-limit',message:`${player.name} already leads 4 rallies in Round ${round}.`,severity:'error',playerId:player.id})
  }else{
    if(leaderRallies.length||participantRallies.length)issues.push({code:'duplicate',message:`${player.name} is already assigned in Round ${round}.`,severity:'error',playerId:player.id})
    if(rally.participants.length>=12)issues.push({code:'participant-limit',message:`${rally.name} already has the maximum 12 participants.`,severity:'error',rallyId})
  }
  // Capacity enforcement is paused while participant troop counts are not tracked.
  return issues
}
export function validatePlan(plan: Plan, players: Player[]): ValidationIssue[] {
  const issues:ValidationIssue[]=[]; const global=new Map<string,RoundId>()
  for (const round of [1,2] as RoundId[]) for (const rally of plan.rounds[round]) {
    if (!rally.leader) issues.push({code:'leader-missing',message:`${rally.name} needs a leader.`,severity:'warning',rallyId:rally.id})
    const members=[...(rally.leader?[rally.leader]:[]),...rally.participants]
    for(const a of members){ const p=players.find(x=>x.id===a.playerId); if(!p) continue; const prev=global.get(p.id); if(prev && prev!==round && plan.rules.enforceRoundExclusivity) issues.push({code:'exclusive',message:`${p.name} appears in both rounds.`,severity:'error',playerId:p.id}); else global.set(p.id,round); if(!formationReady(p,a.formation)) issues.push({code:'formation',message:`${p.name} has incomplete Formation ${a.formation}.`,severity:'error',playerId:p.id}) }
    if(rally.participants.length>12)issues.push({code:'participant-limit',message:`${rally.name} has more than 12 participants.`,severity:'error',rallyId:rally.id})
    const m=rallyMetrics(rally,players); if(m.capacity==null&&rally.leader) issues.push({code:'capacity-missing',message:`${rally.name} leader has no rally capacity.`,severity:'warning',rallyId:rally.id});if(plan.rules.minimumRallyPower!=null&&m.power<plan.rules.minimumRallyPower)issues.push({code:'minimum-power',message:`${rally.name} is below the configured minimum power.`,severity:'warning',rallyId:rally.id})
  }
  for(const round of [1,2] as RoundId[])for(const player of players){const leaderCount=plan.rounds[round].filter(r=>r.leader?.playerId===player.id).length;const participantCount=plan.rounds[round].filter(r=>r.participants.some(a=>a.playerId===player.id)).length;if(leaderCount>4)issues.push({code:'leader-limit',message:`${player.name} leads more than 4 rallies in Round ${round}.`,severity:'error',playerId:player.id});if(participantCount>1)issues.push({code:'duplicate',message:`${player.name} participates in more than one rally in Round ${round}.`,severity:'error',playerId:player.id});if(leaderCount&&participantCount)issues.push({code:'leader-participant-conflict',message:`${player.name} is both leader and participant in Round ${round}.`,severity:'error',playerId:player.id})}
  return issues
}
