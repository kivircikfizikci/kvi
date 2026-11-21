import { describe, expect, it } from 'vitest'
import { matchedGamePlayer, normalizeGameName } from '../../store/usePlannerStore'
import type { Player } from '../../types'

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
