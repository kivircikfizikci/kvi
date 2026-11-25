import type { BlackGoldPoint, BlackGoldRect } from "./blackGoldGeometry";
import { overlaps } from "./blackGoldGeometry";

export function placeBlackGoldLabel(
  anchor: BlackGoldPoint,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  blocked: readonly BlackGoldRect[],
  priority = false,
): BlackGoldRect | undefined {
  const inset = 5;
  const maxX = viewport.width - width - inset;
  const maxY = viewport.height - height - inset;
  if (maxX < inset || maxY < inset) return;

  for (const distance of priority ? [21, 37, 55, 80, 115, 160, 220] : [21, 36, 52, 72]) {
    const candidates = [
      [anchor.x - width / 2, anchor.y - height - distance],
      [anchor.x - width / 2, anchor.y + distance],
      [anchor.x + distance, anchor.y - height / 2],
      [anchor.x - distance - width, anchor.y - height / 2],
      [anchor.x + distance, anchor.y - height - distance],
      [anchor.x - distance - width, anchor.y - height - distance],
      [anchor.x + distance, anchor.y + distance],
      [anchor.x - distance - width, anchor.y + distance],
    ];
    for (const [left, top] of candidates) {
      const x = Math.max(inset, Math.min(maxX, left));
      const y = Math.max(inset, Math.min(maxY, top));
      const rect = { minX: x, minY: y, maxX: x + width, maxY: y + height };
      if (!blocked.some(box => overlaps(
        { minX: x - 3, minY: y - 3, maxX: rect.maxX + 3, maxY: rect.maxY + 3 },
        box,
      ))) return rect;
    }
  }
}
