import type { Player } from '../types'

const seedData: [string, number][] = [
  ['Supplar',183282490],['Hank Da Tank',175791187],['Danne0681',107847530],['Few hours',94940900],
  ['MostlyPeacefl304',94200170],['INnaNa',92550410],['The Savage One',87220160],['HëX',81954170],
  ['Joey306',76948500],['Nø † Mërcy',75440570],['CYREN',73739540],['KD99',70431840],
  ['JB간지서퍼',67481370],['Woopia',67394720],['KassAndEffect304',67205910],['kvi',65308160],
  ['Rick304',62028020],['Gotowash',62025950],['TheMage',59475450],['DonWithYou304',54038420]
]
export const seedPlayers = (): Player[] => seedData.map(([name,totalPower], index) => ({
  id: `seed-${index + 1}`, name, totalPower, rallyCapacity: null,
  formations: { 1:{power:null},2:{power:null},3:{power:null},4:{power:null} },
  availability:'unavailable', allowLeader:true, priority:3, active:true, notes:''
}))
