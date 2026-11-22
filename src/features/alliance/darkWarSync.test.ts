import { describe, expect, it } from 'vitest'
import { matchedGamePlayer, normalizeGameName } from '../../store/usePlannerStore'
import type { Player } from '../../types'
import { parseSavedDarkWarRoster } from './darkWarSync'

const player=(name:string,gameAliases:string[]=[]):Player=>({id:name,name,totalPower:1,rallyCapacity:null,formations:{1:{power:null},2:{power:null},3:{power:null},4:{power:null}},availability:'both',allowLeader:false,active:true,notes:'',gameAliases})

describe('Dark War roster name matching',()=>{
  it('normalizes compatibility characters, whitespace and invisible marks',()=>{
    expect(normalizeGameName('  ＫＶＩ\u200b  Player  ')).toBe('kvi player')
  })

  it('matches a previously saved in-game alias without fuzzy guessing',()=>{
    const member=player('Old alliance name',['New Game Name'])
    expect(matchedGamePlayer([member],' new   game name ')).toBe(member)
    expect(matchedGamePlayer([member],'Another Name')).toBeUndefined()
  })
})

describe('saved Dark War roster',()=>{
  it('loads the local helper JSON without private fields',()=>{
    const result=parseSavedDarkWarRoster(JSON.stringify({players:[{rank:1,name:'Hank Da Tank',power:123456789}],capturedAt:'2026-11-22T00:00:00Z'}))
    expect(result.players).toEqual([{rank:1,name:'Hank Da Tank',power:123456789,totalKills:null,uid:undefined,allianceRank:undefined,mainBuildingLevel:null,sex:null,allianceTag:undefined,allianceName:undefined,country:undefined}])
  })
  it('loads UID-based alliance members and a state snapshot',()=>{
    const result=parseSavedDarkWarRoster(JSON.stringify({capturedAt:'2026-11-22T10:00:00Z',players:[{uid:'1025967256000716',name:'kvi',power:69588750,armyKill:382632,rank:4,allianceRank:'R4',mainBuildingLevel:25,sex:1,allianceTag:'F4FO'}],stateSnapshot:{id:'scan-1',capturedAt:'2026-11-22T10:00:00Z',playerRanking:[],allianceRanking:[]}}))
    expect(result.players[0]).toMatchObject({uid:'1025967256000716',name:'kvi',power:69588750,totalKills:382632,allianceRank:'R4',mainBuildingLevel:25,sex:1})
    expect(result.stateSnapshot?.id).toBe('scan-1')
  })
})
