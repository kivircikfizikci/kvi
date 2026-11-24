import { describe, expect, it } from "vitest";
import {
  matchedGamePlayer,
  normalizeGameName,
} from "../../store/usePlannerStore";
import type { Player } from "../../types";
import { parseSavedDarkWarRoster } from "./darkWarSync";

const player = (name: string, gameAliases: string[] = []): Player => ({
  id: name,
  name,
  totalPower: 1,
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
  gameAliases,
});

describe("Dark War roster name matching", () => {
  it("normalizes compatibility characters, whitespace and invisible marks", () => {
    expect(normalizeGameName("  ＫＶＩ\u200b  Player  ")).toBe("kvi player");
  });

  it("matches a previously saved in-game alias without fuzzy guessing", () => {
    const member = player("Old alliance name", ["New Game Name"]);
    expect(matchedGamePlayer([member], " new   game name ")).toBe(member);
    expect(matchedGamePlayer([member], "Another Name")).toBeUndefined();
  });
});

describe("saved Dark War roster", () => {
  it("accepts private observations without a ranking and checks map boundaries", () => {
    const result = parseSavedDarkWarRoster(JSON.stringify({
      playerPositions: [
        { uid: "1", x: 0, y: 999 },
        { uid: "2", x: null, y: 1 },
        { uid: "3", x: 1000, y: 1 },
      ],
      playerProfileUpdates: [
        { uid: "1", lastUpdateTime: "1795545910" },
        { uid: "2", lastUpdateTime: 0 },
      ],
    }));
    expect(result.playerPositions).toEqual([{ uid: "1", x: 0, y: 999 }]);
    expect(result.playerProfileUpdates).toEqual([{ uid: "1", lastUpdateTime: 1795545910 }]);
    expect(result.stateSnapshot).toBeUndefined();
  });
  it("loads the local helper JSON without private fields", () => {
    const result = parseSavedDarkWarRoster(
      JSON.stringify({
        players: [{ rank: 1, name: "Hank Da Tank", power: 123456789 }],
        capturedAt: "2026-11-22T00:00:00Z",
      }),
    );
    expect(result.players).toEqual([
      {
        rank: 1,
        name: "Hank Da Tank",
        power: 123456789,
        totalKills: null,
        uid: undefined,
        allianceRank: undefined,
        mainBuildingLevel: null,
        sex: null,
        allianceTag: undefined,
        allianceName: undefined,
        country: undefined,
      },
    ]);
  });
  it("loads UID-based alliance members and a state snapshot", () => {
    const result = parseSavedDarkWarRoster(
      JSON.stringify({
        capturedAt: "2026-11-22T10:00:00Z",
        players: [
          {
            uid: "1025967256000716",
            name: "kvi",
            power: 69588750,
            armyKill: 382632,
            rank: 4,
            allianceRank: "R4",
            mainBuildingLevel: 25,
            sex: 1,
            allianceTag: "F4FO",
          },
        ],
        stateSnapshot: {
          id: "scan-1",
          capturedAt: "2026-11-22T10:00:00Z",
          playerRanking: [],
          allianceRanking: [],
        },
      }),
    );
    expect(result.players[0]).toMatchObject({
      uid: "1025967256000716",
      name: "kvi",
      power: 69588750,
      totalKills: 382632,
      allianceRank: "R4",
      mainBuildingLevel: 25,
      sex: 1,
    });
    expect(result.stateSnapshot?.id).toBe("scan-1");
  });
  it("keeps a partial helper capture when only State data was found", () => {
    const result = parseSavedDarkWarRoster(
      JSON.stringify({
        capturedAt: "2026-11-22T11:00:00Z",
        players: [],
        stateSnapshot: {
          id: "partial-1",
          capturedAt: "2026-11-22T11:00:00Z",
          playerRanking: [
            {
              uid: "1",
              name: "Player",
              rank: 1,
              power: 100,
              level: 30,
              allianceName: "Alliance",
              allianceTag: "TAG",
            },
          ],
          allianceRanking: [],
        },
      }),
    );
    expect(result.players).toEqual([]);
    expect(result.stateSnapshot?.playerRanking).toHaveLength(1);
  });
  it("keeps kill-only ranking data for merging with the previous State snapshot", () => {
    const result = parseSavedDarkWarRoster(
      JSON.stringify({
        capturedAt: "2026-11-22T12:00:00Z",
        players: [],
        statePlayerKillRanking: [
          { uid: "1", name: "Player", rank: 1, totalKills: 456 },
        ],
        stateAllianceKillRanking: [
          { uid: "a1", name: "Alliance", tag: "TAG", rank: 1, totalKills: 789 },
        ],
      }),
    );
    expect(result.statePlayerKillRanking).toEqual([
      { uid: "1", name: "Player", rank: 1, totalKills: 456 },
    ]);
    expect(result.stateAllianceKillRanking).toEqual([
      { uid: "a1", name: "Alliance", tag: "TAG", rank: 1, totalKills: 789 },
    ]);
  });
});
