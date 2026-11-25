import { describe, expect, it } from "vitest";
import type { BlackGoldParticipant, Player } from "../../types";
import { blackGoldRosterIndex } from "./blackGoldRoster";

function player(id: string, name: string, gameUid?: string, gameAliases?: string[]): Player {
  return {
    id, name, uid: gameUid, gameAliases, totalPower: 1, rallyCapacity: null,
    formations: { 1: { power: null }, 2: { power: null }, 3: { power: null }, 4: { power: null } },
    availability: "both", allowLeader: true, active: true, notes: "",
  };
}

function assignment(playerId: string | undefined, name: string, role: BlackGoldParticipant["role"]): BlackGoldParticipant {
  return { id: name, playerId, name, role, color: "", createdAt: "", updatedAt: "" };
}

describe("Black Gold roster exclusions", () => {
  it("excludes starters and reserves from both teams and uses the game UID across local IDs", () => {
    const players = [
      player("1", "Team A starter", "111"),
      player("1-alt", "Same player reimported", "111"),
      player("2", "Team A reserve"),
      player("3", "Team B starter"),
      player("4", "Unassigned"),
    ];
    const roster = blackGoldRosterIndex(players);
    const teamA = roster.assignedKeys([assignment("1", "Team A starter", "active"), assignment("2", "Team A reserve", "reserve")]);
    const teamB = roster.assignedKeys([assignment("3", "Team B starter", "active")]);
    expect(players.filter(item => !teamA.has(roster.playerKey(item)) && !teamB.has(roster.playerKey(item))).map(item => item.id)).toEqual(["4"]);
  });

  it("locates a legacy reserve by a unique normalized alias without assuming ambiguous names", () => {
    const renamed = player("new", "New Name", "111", ["Old Name"]);
    const legacy = assignment("gone", " old   NAME ", "reserve");
    expect(blackGoldRosterIndex([renamed]).assignedKeys([legacy]).has("uid:111")).toBe(true);
    expect(blackGoldRosterIndex([renamed, player("other", "Old Name")]).resolve(legacy)).toBeUndefined();
  });
});
