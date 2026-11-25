import { normalizeGameName } from "../../store/usePlannerStore";
import type { BlackGoldParticipant, Player } from "../../types";

const playerKey = (player: Player) => player.uid ? `uid:${player.uid}` : `id:${player.id}`;

export function blackGoldRosterIndex(players: Player[]) {
  const byId = new Map(players.map(player => [player.id, player]));
  const byName = new Map<string, Set<Player>>();
  for (const player of players) {
    for (const name of [player.name, ...(player.gameAliases ?? [])]) {
      const key = normalizeGameName(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, new Set());
      byName.get(key)!.add(player);
    }
  }

  function resolve(participant: BlackGoldParticipant) {
    const linked = participant.playerId ? byId.get(participant.playerId) : undefined;
    if (linked) return linked;
    const matching = byName.get(normalizeGameName(participant.name));
    return matching?.size === 1 ? matching.values().next().value : undefined;
  }

  function assignedKeys(participants: BlackGoldParticipant[]) {
    return new Set(participants.map(participant => {
      const player = resolve(participant);
      return player ? playerKey(player) : `unlinked:${participant.playerId || participant.id}`;
    }));
  }

  return { byId, resolve, assignedKeys, playerKey };
}
