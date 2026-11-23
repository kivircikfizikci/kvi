import { describe, expect, it } from "vitest";
import type { StateSnapshot } from "../../types";
import {
  isApproximateGrowthSnapshot,
  nearestGrowthSnapshot,
} from "./growthPeriod";

const snapshot = (id: string, capturedAt: string): StateSnapshot => ({
  id,
  capturedAt,
  playerRanking: [],
  allianceRanking: [],
});

describe("alliance growth periods", () => {
  const latestAt = new Date("2026-11-10T12:00:00Z").getTime();
  const rows = [
    snapshot("near-1d", "2026-11-09T10:00:00Z"),
    snapshot("near-3d", "2026-11-07T13:00:00Z"),
    snapshot("near-7d", "2026-11-03T12:00:00Z"),
  ];

  it("selects the snapshot nearest to each requested period", () => {
    expect(nearestGrowthSnapshot(rows, latestAt, 1)?.id).toBe("near-1d");
    expect(nearestGrowthSnapshot(rows, latestAt, 3)?.id).toBe("near-3d");
    expect(nearestGrowthSnapshot(rows, latestAt, 7)?.id).toBe("near-7d");
  });

  it("marks comparisons more than six hours from the target as approximate", () => {
    expect(isApproximateGrowthSnapshot(rows[0], latestAt, 1)).toBe(false);
    expect(
      isApproximateGrowthSnapshot(
        snapshot("short", "2026-11-09T22:00:00Z"),
        latestAt,
        1,
      ),
    ).toBe(true);
  });
});
