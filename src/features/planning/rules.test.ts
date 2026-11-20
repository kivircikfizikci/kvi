import { describe, expect, it } from 'vitest'
import type { Plan, Player, Rally } from '../../types'
import { rallyMetrics, validateAssignment, validatePlan } from './rules'

const player=(id:string,opts:Partial<Player>={}):Player=>({id,name:id,totalPower:1000,rallyCapacity:500,formations:{1:{power:100},2:{power:null},3:{power:null},4:{power:null}},availability:'both',allowLeader:true,priority:3,active:true,notes:'',...opts})
const rally=(id:string,leader:string|null,participants:string[]=[]):Rally=>({id,name:id,leader:leader?{playerId:leader,formation:1,locked:false}:null,participants:participants.map(playerId=>({playerId,formation:1,locked:false}))})
const plan=(round1:Rally[]=[],round2:Rally[]=[]):Plan=>({id:'p',name:'Plan',rounds:{1:round1,2:round2},roundTimes:{1:'',2:''},rules:{enforceRoundExclusivity:true,enforceCapacity:true,enforceAvailability:true,maxRalliesPerRound:3,minimumRallyPower:null},optimizationMode:'maximum',objectiveScore:0,createdAt:'x',updatedAt:'x'})

describe('planning rules',()=>{
 it('enforces round exclusivity',()=>{const p=plan([rally('a','leader',['member'])],[rally('b','other')]);expect(validateAssignment(p,[player('leader'),player('member'),player('other')],2,'b',{playerId:'member',formation:1,locked:false}).some(i=>i.code==='exclusive')).toBe(true)})
 it('allows valid power-only assignments without troop counts',()=>{const r=rally('a','leader',['one']);const players=[player('leader',{rallyCapacity:150}),player('one'),player('two')];expect(rallyMetrics(r,players).power).toBe(200);expect(validateAssignment(plan([r]),players,1,'a',{playerId:'two',formation:1,locked:false}).some(i=>i.code==='capacity')).toBe(false)})
 it('detects leader and participant conflicts',()=>{const p=plan([rally('a','same',['same'])]);expect(validatePlan(p,[player('same')]).some(i=>i.code==='leader-participant-conflict')).toBe(true)})
 it('detects duplicate participant assignments across rallies',()=>{const p=plan([rally('a','lead1',['one']),rally('b','lead2',['one'])]);expect(validatePlan(p,[player('one'),player('lead1'),player('lead2')]).some(i=>i.code==='duplicate')).toBe(true)})
 it('rejects missing formation and capacity data',()=>{const incomplete=player('incomplete',{rallyCapacity:null,formations:{1:{power:null},2:{power:null},3:{power:null},4:{power:null}}});const p=plan([rally('a','incomplete')]);const issues=validatePlan(p,[incomplete]);expect(issues.some(i=>i.code==='formation')).toBe(true);expect(issues.some(i=>i.code==='capacity-missing')).toBe(true)})
 it('allows four leader rallies but rejects a fifth',()=>{const rallies=['a','b','c','d'].map(id=>rally(id,'leader'));rallies.push(rally('e','other'));const p=plan(rallies);const players=[player('leader'),player('other')];expect(validatePlan(p,players).some(i=>i.code==='leader-limit')).toBe(false);expect(validateAssignment(p,players,1,'e',{playerId:'leader',formation:1,locked:false},true).some(i=>i.code==='leader-limit')).toBe(true)})
 it('caps each rally at twelve participants',()=>{const ids=Array.from({length:12},(_,i)=>`p${i}`);const r=rally('a','leader',ids);const players=[player('leader'),...ids.map(id=>player(id)),player('extra')];expect(validateAssignment(plan([r]),players,1,'a',{playerId:'extra',formation:1,locked:false}).some(i=>i.code==='participant-limit')).toBe(true)})
})
