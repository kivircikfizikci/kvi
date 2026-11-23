import type { StateSnapshot } from "../../types";

export type GrowthRangeDays = 1 | 3 | 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function nearestGrowthSnapshot(
  candidates: StateSnapshot[],
  latestAt: number,
  days: GrowthRangeDays,
) {
  const targetAt = latestAt - days * DAY_MS;
  return [...candidates]
    .filter((snapshot) => new Date(snapshot.capturedAt).getTime() < latestAt)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.capturedAt).getTime() - targetAt) -
        Math.abs(new Date(b.capturedAt).getTime() - targetAt),
    )[0];
}

export function isApproximateGrowthSnapshot(
  snapshot: StateSnapshot | undefined,
  latestAt: number,
  days: GrowthRangeDays,
) {
  if (!snapshot) return false;
  const age = new Date(snapshot.capturedAt).getTime();
  return Math.abs(latestAt - age - days * DAY_MS) > 6 * HOUR_MS;
}
