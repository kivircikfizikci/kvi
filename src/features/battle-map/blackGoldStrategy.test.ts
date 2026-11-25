import { describe, expect, it } from "vitest";
import type { BlackGoldParticipant, BlackGoldTeam } from "../../types";
import { validateBlackGoldPosition } from "./blackGoldGeometry";
import { BGB_PHASES, bgbPhases, blackGoldPlanAt, generateBlackGoldOpening, replaceBlackGoldPlayer, reserveOptions, validateBgbTiming } from "./blackGoldStrategy";

const members: BlackGoldParticipant[] = Array.from({ length: 22 }, (_, index) => ({
  id: String(index),
  name: `Member ${index}`,
  role: index < 20 ? "active" : "reserve",
  color: "#38bdf8",
  createdAt: "",
  updatedAt: "",
}));

function createPlan(side: BlackGoldTeam["side"] = "red") {
  const team: BlackGoldTeam = {
    id: "team-a", name: "Team A", eventTime: "", participants: members, side, updatedAt: "",
  };
  return { ...team, ...generateBlackGoldOpening(team, item => 1000 - Number(item.id)) };
}

describe("Black Gold opening and timeline", () => {
  it.each(["red", "blue"] as const)("places all 20 starters in separate legal plots for %s", side => {
    const team = createPlan(side);
    expect(team.strategy.filter(item => item.centerCrew)).toHaveLength(6);
    expect(new Set(team.strategy.map(item => item.refineryId)).size).toBe(6);
    for (const phase of BGB_PHASES) {
      const rows = blackGoldPlanAt(team, phase.minute);
      expect(rows).toHaveLength(20);
      const placed = rows.map(row => ({ ...row.slot, ...row.point }));
      for (const item of placed) {
        expect(item.x).toBeDefined();
        expect(item.y).toBeDefined();
        expect(validateBlackGoldPosition(item.x!, item.y!, placed, item.id)).toBeNull();
      }
    }
  });

  it("preserves locked opening positions", () => {
    const participants = members.map(item => item.id === "0" ? { ...item, x: 24, y: 40, positionLocked: true } : item);
    const plan = generateBlackGoldOpening({ ...createPlan(), participants }, item => 1000 - Number(item.id));
    expect(plan.participants[0]).toMatchObject({ x: 24, y: 40, positionLocked: true });
  });

  it("replaces one slot without changing its previous assignments or other players", () => {
    const original = createPlan();
    const updated = replaceBlackGoldPlayer(original, "0", "20", 7);
    expect(blackGoldPlanAt(updated, 6)).toEqual(blackGoldPlanAt(original, 6));
    const rows = blackGoldPlanAt(updated, 7);
    const before = blackGoldPlanAt(original, 7);
    expect(rows[0]).toEqual({ ...before[0], occupant: members[20] });
    expect(rows.slice(1)).toEqual(before.slice(1));
    expect(blackGoldPlanAt(updated, 25)[0].occupant.id).toBe("20");
    expect(reserveOptions(updated).map(item => item.id)).toEqual(["21"]);
    expect(() => replaceBlackGoldPlayer(updated, "1", "20", 12)).toThrow();
  });

  it("uses edited match times for phase instructions and Gold Ball routes", () => {
    const timing = { buildings: 6, firstBall: 16, secondBall: 27, end: 32 };
    expect(validateBgbTiming(timing)).toBe(true);
    expect(validateBgbTiming({ ...timing, secondBall: 17 })).toBe(false);
    const team = { ...createPlan(), timing };
    expect(bgbPhases(timing)[2].instruction).toContain("14:00");
    const center = team.strategy.find(item => item.centerCrew)!.participantId;
    expect(blackGoldPlanAt(team, 15).find(row => row.slot.id === center)?.task).toContain("Regroup");
    expect(blackGoldPlanAt(team, 16).find(row => row.slot.id === center)?.route?.to).toEqual({ x: 6, y: 142 });
  });
});
