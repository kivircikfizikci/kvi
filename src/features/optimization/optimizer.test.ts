import { describe, expect, it } from 'vitest'
import type { Plan, Player } from '../../types'
import { validatePlan } from '../planning/rules'
import { optimizePlan } from './optimizer'

const make=(id:string,availability:Player['availability']='both'):Player=>({id,name:id,totalPower:1000,rallyCapacity:400,formations:{1:{power:100,troops:100},2:{power:80,troops:80},3:{power:null,troops:null},4:{power:null,troops:null}},availability,allowLeader:true,priority:3,active:true,notes:''})
const base:Plan={id:'p',name:'P',rounds:{1:[],2:[]},roundTimes:{1:'',2:''},rules:{enforceRoundExclusivity:true,enforceCapacity:true,enforceAvailability:true,maxRalliesPerRound:1,minimumRallyPower:null},optimizationMode:'maximum',objectiveScore:0,createdAt:'x',updatedAt:'x'}
describe('optimizer',()=>{it('produces a feasible exclusive plan and skips incomplete players',()=>{const incomplete={...make('bad'),formations:{1:{power:null,troops:null},2:{power:null,troops:null},3:{power:null,troops:null},4:{power:null,troops:null}}};const players=[make('r1','round1'),make('r2','round2'),make('both1'),make('both2'),incomplete];const result=optimizePlan(base,players,'balanced');expect(validatePlan(result,players).filter(i=>i.severity==='error')).toEqual([]);const assigned=([1,2] as const).flatMap(n=>result.rounds[n].flatMap(r=>[...(r.leader?[r.leader.playerId]:[]),...r.participants.map(a=>a.playerId)]));expect(new Set(assigned).size).toBe(assigned.length);expect(assigned).not.toContain('bad');expect(result.objectiveScore).toBeGreaterThan(0)})})
