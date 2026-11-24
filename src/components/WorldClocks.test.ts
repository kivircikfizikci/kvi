import { describe, expect, it } from "vitest";
import { formatWorldClock } from "./WorldClocks";

describe("world clocks", () => {
  it("converts one instant to each configured regional time", () => {
    const instant = new Date("2026-07-01T12:00:00Z");

    expect(formatWorldClock(instant, "America/New_York").time).toBe(
      "08:00:00",
    );
    expect(formatWorldClock(instant, "Europe/Berlin").time).toBe(
      "14:00:00",
    );
    expect(formatWorldClock(instant, "Asia/Seoul").time).toBe(
      "21:00:00",
    );
  });
});
