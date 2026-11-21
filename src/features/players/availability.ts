import type { Availability } from '../../types'

export const frankyParticipationLabel=(availability:Availability)=>({both:'Round 1 & Round 2',round1:'Round 1',round2:'Round 2',unavailable:'Not participating'} as const)[availability]
