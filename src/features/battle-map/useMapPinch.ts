import { useRef, type Dispatch, type PointerEvent, type SetStateAction } from "react";

type Point = { x: number; y: number };
type Camera = Point & { zoom: number };
type Viewport = { width: number; height: number };
type Limits = {
  tileX: number;
  tileY: number;
  clampCenter: (value: number) => number;
  clampZoom: (value: number) => number;
};

export function zoomMapBetween(
  camera: Camera, before: Point, after: Point, factor: number,
  viewport: Viewport, limits: Limits,
): Camera {
  const zoom = limits.clampZoom(camera.zoom * factor);
  const move = (previous: number, next: number, center: number, tile: number) =>
    (previous - center) / (tile * camera.zoom) - (next - center) / (tile * zoom);
  return {
    x: limits.clampCenter(camera.x + move(before.x, after.x, viewport.width / 2, limits.tileX)),
    y: limits.clampCenter(camera.y + move(before.y, after.y, viewport.height / 2, limits.tileY)),
    zoom,
  };
}

function pair(points: Map<number, Point>) {
  const [a, b] = points.values();
  return a && b ? {
    midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y),
  } : undefined;
}

type CanvasPointer = PointerEvent<HTMLCanvasElement>;
function relativePosition(event: CanvasPointer): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function useMapPinch(
  setCamera: Dispatch<SetStateAction<Camera>>,
  viewport: Viewport,
  limits: Limits,
) {
  const touches = useRef(new Map<number, Point>());
  const pinching = useRef(false);

  return {
    start(event: CanvasPointer) {
      if (event.pointerType !== "touch") return false;
      touches.current.set(event.pointerId, relativePosition(event));
      if (touches.current.size >= 2) pinching.current = true;
      return pinching.current;
    },
    move(event: CanvasPointer) {
      if (event.pointerType !== "touch" || !touches.current.has(event.pointerId)) return false;
      const before = pair(touches.current);
      touches.current.set(event.pointerId, relativePosition(event));
      const after = pair(touches.current);
      if (before && after && before.distance >= 4 && after.distance >= 4) {
        setCamera(camera => zoomMapBetween(
          camera, before.midpoint, after.midpoint, after.distance / before.distance, viewport, limits,
        ));
      }
      return pinching.current;
    },
    end(event: CanvasPointer) {
      if (event.pointerType !== "touch") return false;
      const handled = pinching.current;
      touches.current.delete(event.pointerId);
      if (!touches.current.size) pinching.current = false;
      return handled;
    },
  };
}
