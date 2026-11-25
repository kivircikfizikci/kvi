import { describe, expect, it } from "vitest";
import { overlaps } from "./blackGoldGeometry";
import { placeBlackGoldLabel } from "./blackGoldLabels";

describe("Black Gold map label layout", () => {
  it("finds separate boxes around a crowded marker", () => {
    const viewport = { width: 340, height: 240 };
    const center = { x: 170, y: 120 };
    const icon = { minX: 155, minY: 105, maxX: 185, maxY: 135 };
    const first = placeBlackGoldLabel(center, 115, 32, viewport, [icon], true)!;
    const second = placeBlackGoldLabel(center, 115, 20, viewport, [icon, first])!;
    expect(overlaps(first, icon)).toBe(false);
    expect(overlaps(second, icon)).toBe(false);
    expect(overlaps(second, first)).toBe(false);
  });

  it("keeps labels on screen and skips them when no room is available", () => {
    const viewport = { width: 200, height: 160 };
    const label = placeBlackGoldLabel({ x: 1, y: 2 }, 100, 20, viewport, [])!;
    expect(label.minX).toBeGreaterThanOrEqual(5);
    expect(label.minY).toBeGreaterThanOrEqual(5);
    expect(placeBlackGoldLabel({ x: 10, y: 10 }, 100, 20, viewport, [
      { minX: 0, minY: 0, maxX: 200, maxY: 160 },
    ])).toBeUndefined();
  });
});
