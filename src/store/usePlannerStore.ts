import { create } from 'zustand'
import { db, replacePlans, replacePlayers } from '../db'
import { seedPlayers } from '../db/seed'
import type { AllianceRank, Assignment, FormationId, OptimizationMode, Plan, Player, Rally, RoundId, RuleConfig } from '../types'
import { now, uid } from '../utils/format'
import { optimizePlan } from '../features/optimization/optimizer'
import { assignedRound, validateAssignment } from '../features/planning/rules'
import { MAX_PLAYERS } from '../features/players/constants'

const defaultRules:RuleConfig={enforceRoundExclusivity:true,enforceCapacity:true,enforceAvailability:true,maxRalliesPerRound:12,minimumRallyPower:null}
const createPlan=(name='Operation Frankenstein'):Plan=>({id:uid(),name,rounds:{1:[],2:[]},roundTimes:{1:'',2:''},rules:{...defaultRules},optimizationMode:'maximum',objectiveScore:0,createdAt:now(),updatedAt:now()})
type LegacyPlayer=Player&{participationTime?:string;priority?:number;formations:Record<FormationId,{power:number|null;troops?:number|null}>}
type LegacyPlan=Plan&{roundTimes?:Record<RoundId,string>}
const normalizePower=(power:number|null|undefined)=>power!=null&&power>0&&power<1_000_000?power*1_000_000:power??null
const normalizePlayer=(source:LegacyPlayer):Player=>{const {participationTime:_participationTime,priority:_priority,...player}=source;return{...player,uid:player.uid?String(player.uid):undefined,totalKills:player.totalKills??null,mainBuildingLevel:player.mainBuildingLevel??null,sex:player.sex??null,country:player.country??'',formations:{1:{power:normalizePower(player.formations?.[1]?.power)},2:{power:normalizePower(player.formations?.[2]?.power)},3:{power:normalizePower(player.formations?.[3]?.power)},4:{power:normalizePower(player.formations?.[4]?.power)}}} as Player}
const normalizePlan=(plan:LegacyPlan):Plan=>({...plan,roundTimes:{1:plan.roundTimes?.[1]??'',2:plan.roundTimes?.[2]??''},rules:{...plan.rules,maxRalliesPerRound:Math.max(12,plan.rules?.maxRalliesPerRound??12)}})
type Snapshot={players:Player[];plans:Plan[];activePlanId:string}
export interface GameRosterEntry{name:string;power:number;totalKills?:number|null;rank:number;uid?:string;allianceRank?:AllianceRank;mainBuildingLevel?:number|null;sex?:0|1|2|null;allianceTag?:string;allianceName?:string;country?:string}
export type GameRosterMatch='new'|'skip'|string
export const normalizeGameName=(name:string)=>name.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFE0E\uFE0F\uFEFF]/gu,'').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US')
export function matchedGamePlayer(players: Player[], name: string, gameUid?: string) {
  const byUid = gameUid ? players.find(player => player.uid === gameUid) : undefined;
  if (byUid) return byUid;
  const normalized = normalizeGameName(name);
  return players.find(player =>
    (!gameUid || !player.uid) &&
    (normalizeGameName(player.name) === normalized ||
      player.gameAliases?.some(alias => normalizeGameName(alias) === normalized)),
  );
}
interface PlannerState { players:Player[];plans:Plan[];activePlanId:string;loaded:boolean;error:string|null;history:Snapshot[];future:Snapshot[];
  cloudCanEdit:boolean;initialize:()=>Promise<void>; hydrateCloud:(players:Player[],plans:Plan[],activePlanId:string)=>void;setCloudCanEdit:(value:boolean)=>void;setError:(v:string|null)=>void; savePlayer:(p:Player)=>void; deletePlayer:(id:string)=>void; archivePlayersByUid:(uids:string[])=>void; duplicatePlayer:(id:string)=>void; importPlayers:(p:Player[])=>void;syncGameRoster:(entries:GameRosterEntry[],matches?:Record<string,GameRosterMatch>)=>{added:number;updated:number;skipped:number;aliased:number};
  setActivePlan:(id:string)=>void; addPlan:()=>void; renamePlan:(id:string,name:string)=>void; duplicatePlan:(id:string)=>void; deletePlan:(id:string)=>void; importBundle:(p:Player[],plans:Plan[])=>void;
  moveParticipant:(fromRound:RoundId,fromId:string,toRound:RoundId,toId:string,playerId:string,asLeader?:boolean)=>void;
  addRally:(round:RoundId)=>void; deleteRally:(round:RoundId,id:string)=>void; reorderRally:(round:RoundId,from:string,to:string)=>void; updateRoundTime:(round:RoundId,time:string)=>void; assign:(round:RoundId,rallyId:string,playerId:string,formation:FormationId,leader?:boolean)=>boolean; removeAssignment:(round:RoundId,rallyId:string,playerId:string)=>void; updateAssignment:(round:RoundId,rallyId:string,playerId:string,patch:Partial<Assignment>)=>void;
  optimize:(mode:OptimizationMode)=>void; resetPlan:()=>void; updateRules:(r:Partial<RuleConfig>)=>void; undo:()=>void;redo:()=>void;saveNow:()=>Promise<void> }
let persistTimer:number|undefined
let initializationInFlight=false
const persist = (get: () => PlannerState) => {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const state = get();
    if (!state.cloudCanEdit) return;
    void state.saveNow().catch(() => {
      state.setError("Changes could not be saved to this browser.");
    });
  }, 180);
};
export const usePlannerStore=create<PlannerState>((set,get)=>{
 const snapshot=():Snapshot=>({players:structuredClone(get().players),plans:structuredClone(get().plans),activePlanId:get().activePlanId})
 const commit=(fn:(s:PlannerState)=>Partial<PlannerState>)=>{if(!get().cloudCanEdit){set({error:'Read-only mode. Sign in with an R4 or R5 User ID to make changes.'});return}const before=snapshot();set(s=>({...fn(s),history:[...s.history.slice(-29),before],future:[]}));persist(get)}
 const updatePlan=(fn:(p:Plan)=>Plan)=>commit(s=>({plans:s.plans.map(p=>p.id===s.activePlanId?{...fn(structuredClone(p)),updatedAt:now()}:p)}))
 return {
   players: [],
   plans: [],
   activePlanId: "",
   loaded: false,
   error: null,
   history: [],
   future: [],
   cloudCanEdit: false,
   initialize: async () => {
     if (initializationInFlight || get().loaded) return;
     initializationInFlight = true;
     try {
       let players = (await db.players.toArray())
         .map((p) => normalizePlayer(p as LegacyPlayer))
         .slice(0, MAX_PLAYERS);
       let plans = (await db.plans.toArray()).map((p) =>
         normalizePlan(p as LegacyPlan),
       );
       if (!players.length) {
         players = seedPlayers().slice(0, MAX_PLAYERS);
         await db.players.bulkPut(players);
       }
       if (!plans.length) {
         plans = [createPlan()];
         await db.plans.bulkPut(plans);
       } else {
         await Promise.all([replacePlayers(players), replacePlans(plans)]);
       }
       set({ players, plans, activePlanId: plans[0].id, loaded: true });
     } catch (e) {
       set({
         error:
           e instanceof Error ? e.message : "Unable to open local database",
         loaded: true,
       });
     } finally {
       initializationInFlight = false;
     }
   },
   hydrateCloud: (players, plans, activePlanId) =>
     set({
       players: players.map((p) => normalizePlayer(p as LegacyPlayer)),
       plans: plans.map((p) => normalizePlan(p as LegacyPlan)),
       activePlanId: plans.some((p) => p.id === activePlanId)
         ? activePlanId
         : (plans[0]?.id ?? ""),
       history: [],
       future: [],
     }),
   setCloudCanEdit: (value) => set({ cloudCanEdit: value }),
   setError: (v) => set({ error: v }),
   savePlayer: (p) => {
     const exists = get().players.some((x) => x.id === p.id);
     if (!exists && get().players.length >= MAX_PLAYERS) {
       set({ error: `Alliance roster is limited to ${MAX_PLAYERS} players.` });
       return;
     }
     commit((s) => ({
       players: exists
         ? s.players.map((x) => (x.id === p.id ? normalizePlayer(p) : x))
         : [...s.players, normalizePlayer(p)],
     }));
   },
   deletePlayer: (id) =>
     commit((s) => ({
       players: s.players.filter((p) => p.id !== id),
       plans: s.plans.map((plan) => ({
         ...plan,
         rounds: {
           1: plan.rounds[1].map((r) => strip(r, id)),
           2: plan.rounds[2].map((r) => strip(r, id)),
         },
       })),
     })),
   archivePlayersByUid: (uids) => {
     if (!uids.length) return;
     const departing = new Set(uids);
     commit((s) => {
       const ids = new Set(
         s.players
           .filter((player) => player.uid && departing.has(player.uid))
           .map((player) => player.id),
       );
       return {
         players: s.players.filter((player) => !ids.has(player.id)),
         plans: s.plans.map((plan) => ({
           ...plan,
           rounds: {
             1: plan.rounds[1].map((rally) =>
               [...ids].reduce((value, id) => strip(value, id), rally),
             ),
             2: plan.rounds[2].map((rally) =>
               [...ids].reduce((value, id) => strip(value, id), rally),
             ),
           },
         })),
       };
     });
   },
   duplicatePlayer: (id) => {
     const p = get().players.find((x) => x.id === id);
     if (!p) return;
     if (get().players.length >= MAX_PLAYERS) {
       set({ error: `Alliance roster is limited to ${MAX_PLAYERS} players.` });
       return;
     }
     commit((s) => ({
       players: [
         ...s.players,
         { ...structuredClone(p), id: uid(), name: `${p.name} copy` },
       ],
     }));
   },
   importPlayers: (incoming) => {
     let truncated = false;
     commit((s) => {
       const existing = new Map(s.players.map((p) => [p.id, p]));
       incoming
         .map((p) => normalizePlayer(p))
         .forEach((p) => {
           if (existing.size >= MAX_PLAYERS) {
             truncated = true;
             return;
           }
           const next = existing.has(p.id) ? { ...p, id: uid() } : p;
           existing.set(next.id, next);
         });
       return { players: [...existing.values()].slice(0, MAX_PLAYERS) };
     });
     if (truncated)
       set({ error: `Only the first ${MAX_PLAYERS} players were kept.` });
   },
   syncGameRoster: (entries, matches = {}) => {
     const current = get().players;
     const unique = new Map(
       entries
         .filter(
           (entry) =>
             entry.name.trim() &&
             Number.isFinite(entry.power) &&
             entry.power >= 0,
         )
         .map((entry) => [
           entry.uid
             ? `uid:${entry.uid}`
             : `name:${normalizeGameName(entry.name)}`,
           {
             ...entry,
             uid: entry.uid ? String(entry.uid) : undefined,
             name: entry.name.trim(),
           },
         ]),
     );
     let added = 0,
       updated = 0,
       skipped = 0,
       aliased = 0;
     const next = [...current];
     const used = new Set<string>();
     for (const entry of unique.values()) {
       let existing = matchedGamePlayer(next, entry.name, entry.uid);
       const decision = matches[entry.uid ?? entry.name] ?? matches[entry.name];
       if (!existing && decision && decision !== "new" && decision !== "skip")
         existing = next.find((player) => player.id === decision);
       if (existing) {
         if (used.has(existing.id)) {
           skipped++;
           continue;
         }
         used.add(existing.id);
         const index = next.findIndex((player) => player.id === existing.id);
         if (index < 0) continue;
         const before = next[index],
           aliases = before.gameAliases ?? [],
           sameName =
             normalizeGameName(before.name) === normalizeGameName(entry.name),
           hasOldAlias = aliases.some(
             (alias) =>
               normalizeGameName(alias) === normalizeGameName(before.name),
           );
         const nextAliases =
           sameName || hasOldAlias ? aliases : [...aliases, before.name];
         const changed =
           before.name !== entry.name ||
           before.totalPower !== entry.power ||
           before.totalKills !== (entry.totalKills ?? before.totalKills) ||
           before.uid !== entry.uid ||
           before.allianceRank !== entry.allianceRank ||
           before.mainBuildingLevel !==
             (entry.mainBuildingLevel ?? before.mainBuildingLevel) ||
           before.sex !== (entry.sex ?? before.sex);
         next[index] = {
           ...before,
           uid: entry.uid ?? before.uid,
           name: entry.name,
           totalPower: entry.power,
           totalKills: entry.totalKills ?? before.totalKills,
           allianceRank: entry.allianceRank ?? before.allianceRank,
           mainBuildingLevel:
             entry.mainBuildingLevel ?? before.mainBuildingLevel,
           sex: entry.sex ?? before.sex,
           country: entry.country ?? before.country,
           gameSyncedAt: now(),
           gameAliases: nextAliases,
         };
         if (changed) updated++;
         if (!sameName && !hasOldAlias) aliased++;
         continue;
       }
       if (decision === "skip" || (!entry.uid && decision !== "new")) {
         skipped++;
         continue;
       }
       if (next.length >= MAX_PLAYERS) {
         skipped++;
         continue;
       }
       next.push({
         id: uid(),
         uid: entry.uid,
         name: entry.name,
         totalPower: entry.power,
         totalKills: entry.totalKills ?? null,
         rallyCapacity: null,
         formations: {
           1: { power: null },
           2: { power: null },
           3: { power: null },
           4: { power: null },
         },
         availability: "both",
         allowLeader: false,
         active: true,
         notes: "",
         gameAliases: [],
         allianceRank: entry.allianceRank ?? "R1",
         mainBuildingLevel: entry.mainBuildingLevel ?? null,
         sex: entry.sex ?? null,
         country: entry.country ?? "",
         gameSyncedAt: now(),
       });
       added++;
     }
     if (added || updated || aliased) commit(() => ({ players: next }));
     return { added, updated, skipped, aliased };
   },
   setActivePlan: (id) => set({ activePlanId: id, history: [], future: [] }),
   addPlan: () => {
     const p = createPlan(`Plan ${get().plans.length + 1}`);
     commit((s) => ({ plans: [...s.plans, p], activePlanId: p.id }));
   },
   renamePlan: (id, name) =>
     commit((s) => ({
       plans: s.plans.map((p) =>
         p.id === id ? { ...p, name, updatedAt: now() } : p,
       ),
     })),
   duplicatePlan: (id) => {
     const p = get().plans.find((x) => x.id === id);
     if (p) {
       const copy = {
         ...structuredClone(p),
         id: uid(),
         name: `${p.name} copy`,
         createdAt: now(),
         updatedAt: now(),
       };
       commit((s) => ({ plans: [...s.plans, copy], activePlanId: copy.id }));
     }
   },
   deletePlan: (id) => {
     if (get().plans.length <= 1) return;
     commit((s) => {
       const plans = s.plans.filter((p) => p.id !== id);
       return {
         plans,
         activePlanId: s.activePlanId === id ? plans[0].id : s.activePlanId,
       };
     });
   },
   importBundle: (players, plans) => {
     commit(() => ({
       players: players
         .slice(0, MAX_PLAYERS)
         .map((p) => normalizePlayer(p as LegacyPlayer)),
       plans: plans.map((p) => normalizePlan(p as LegacyPlan)),
       activePlanId: plans[0]?.id ?? createPlan().id,
     }));
     if (players.length > MAX_PLAYERS)
       set({ error: `Only the first ${MAX_PLAYERS} players were kept.` });
   },
   addRally: (round) =>
     updatePlan((p) => {
       if (p.rounds[round].length >= p.rules.maxRalliesPerRound) return p;
       p.rounds[round].push({
         id: uid(),
         name: `Rally ${p.rounds[round].length + 1}`,
         leader: null,
         participants: [],
       });
       return p;
     }),
   deleteRally: (round, id) =>
     updatePlan((p) => {
       p.rounds[round] = p.rounds[round].filter((r) => r.id !== id);
       return p;
     }),
   reorderRally: (round, from, to) =>
     updatePlan((p) => {
       const a = p.rounds[round];
       const i = a.findIndex((r) => r.id === from),
         j = a.findIndex((r) => r.id === to);
       if (i < 0 || j < 0) return p;
       const [x] = a.splice(i, 1);
       a.splice(j, 0, x);
       return p;
     }),
   updateRoundTime: (round, time) =>
     updatePlan((p) => {
       p.roundTimes[round] = time;
       return p;
     }),
   assign: (round, rallyId, playerId, formation, leader = false) => {
     const p = get().plans.find((x) => x.id === get().activePlanId);
     if (!p) return false;
     const issues = validateAssignment(
       p,
       get().players,
       round,
       rallyId,
       { playerId, formation, locked: false },
       leader,
     );
     if (issues.some((x) => x.severity === "error")) {
       set({ error: issues[0].message });
       return false;
     }
     updatePlan((plan) => {
       const rally = plan.rounds[round].find((r) => r.id === rallyId)!;
       if (leader) rally.leader = { playerId, formation, locked: false };
       else rally.participants.push({ playerId, formation, locked: false });
       return plan;
     });
     return true;
   },
   moveParticipant: (fromRound, fromId, toRound, toId, playerId, asLeader = false) => {
     if (!get().cloudCanEdit || (!asLeader && fromRound === toRound && fromId === toId)) return;
     const current = selectActivePlan(get());
     if (!current) return;
     const plan = structuredClone(current);
     const source = plan.rounds[fromRound].find(rally => rally.id === fromId);
     const assignment = source?.participants.find(member => member.playerId === playerId);
     if (!source || !assignment || assignment.locked) return;
     source.participants = source.participants.filter(member => member.playerId !== playerId);

     const issue = validateAssignment(plan, get().players, toRound, toId, assignment, asLeader)
       .find(item => item.severity === "error");
     if (issue) {
       set({ error: issue.message });
       return;
     }
     const target = plan.rounds[toRound].find(rally => rally.id === toId)!;
     if (asLeader) target.leader = assignment;
     else target.participants.push(assignment);
     updatePlan(() => plan);
   },
   removeAssignment: (round, rallyId, playerId) =>
     updatePlan((p) => {
       const r = p.rounds[round].find((x) => x.id === rallyId);
       if (r) {
         if (r.leader?.playerId === playerId) r.leader = null;
         r.participants = r.participants.filter((a) => a.playerId !== playerId);
       }
       return p;
     }),
   updateAssignment: (round, rallyId, playerId, patch) =>
     updatePlan((p) => {
       const r = p.rounds[round].find((x) => x.id === rallyId);
       if (!r) return p;
       if (r.leader?.playerId === playerId)
         r.leader = { ...r.leader, ...patch };
       r.participants = r.participants.map((a) =>
         a.playerId === playerId ? { ...a, ...patch } : a,
       );
       return p;
     }),
   optimize: (mode) => updatePlan((p) => optimizePlan(p, get().players, mode)),
   resetPlan: () =>
     updatePlan((p) => ({ ...p, rounds: { 1: [], 2: [] }, objectiveScore: 0 })),
   updateRules: (r) =>
     updatePlan((p) => ({ ...p, rules: { ...p.rules, ...r } })),
   undo: () => {
     if (!get().cloudCanEdit) return;
     const h = get().history;
     if (!h.length) return;
     const current = snapshot(),
       prev = h[h.length - 1];
     set({
       ...prev,
       history: h.slice(0, -1),
       future: [current, ...get().future],
     });
     persist(get);
   },
   redo: () => {
     if (!get().cloudCanEdit) return;
     const f = get().future;
     if (!f.length) return;
     const current = snapshot(),
       next = f[0];
     set({ ...next, history: [...get().history, current], future: f.slice(1) });
     persist(get);
   },
   saveNow: async () => {
     if (!get().cloudCanEdit) return;
     const { players, plans } = get();
     await db.transaction("rw", db.players, db.plans, async () => {
       await Promise.all([replacePlayers(players), replacePlans(plans)]);
     });
     window.dispatchEvent(new Event("planner-local-change"));
   },
 };
})
const strip=(r:Rally,id:string):Rally=>({...r,leader:r.leader?.playerId===id?null:r.leader,participants:r.participants.filter(a=>a.playerId!==id)})
export const selectActivePlan=(s:PlannerState)=>s.plans.find(p=>p.id===s.activePlanId)
export const isAssigned=(s:PlannerState,id:string)=>{const p=s.plans.find(x=>x.id===s.activePlanId);return p?assignedRound(p,id):null}
