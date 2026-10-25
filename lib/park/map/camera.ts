// The map's camera: one continuous view instead of three fixed tabs. `view` is the half-width of
// what's visible, in world units (the same units everything else on the island uses) — zooming is
// just shrinking or growing that number, panning is moving its centre. Pure maths, no DOM, no
// three.js: components/park/map/MapCanvas.tsx turns this into pixels.
export interface Camera {
  cx: number;
  cz: number;
  /** half-width of the visible square, in world units (smaller = more zoomed in) */
  view: number;
}

/** closest you can zoom in: a park land fills most of the screen */
export const VIEW_MIN = 22;
/** furthest out: the whole ocean, out past the edge of the world (set by lib/park/map/entities.ts's
 *  world-edge constant at setup time, via `setViewMax`, so this module never imports the registries) */
export let VIEW_MAX = 900;
export function setViewMax(v: number) {
  VIEW_MAX = v;
}

export function clampView(view: number): number {
  return Math.min(VIEW_MAX, Math.max(VIEW_MIN, view));
}

/** keep the camera's centre from drifting absurdly far past the world's edge, however far a kid
 *  drags — a generous pad (2x the max view) so panning never feels clipped near the rim */
export function clampCamera(cam: Camera, worldR = VIEW_MAX): Camera {
  const view = clampView(cam.view);
  const pad = worldR * 1.4;
  return {
    cx: Math.min(pad, Math.max(-pad, cam.cx)),
    cz: Math.min(pad, Math.max(-pad, cam.cz)),
    view,
  };
}

/** world (x,z) -> screen px, for a square-ish viewport of size (w,h) centred on the camera (north
 *  stays up; the big map never rotates — only the little HUD map does, and that's handled by
 *  rotating the canvas transform around the kid, not by this function) */
export function worldToScreen(cam: Camera, w: number, h: number, x: number, z: number): [number, number] {
  const s = Math.min(w, h) / (cam.view * 2);
  return [w / 2 + (x - cam.cx) * s, h / 2 + (z - cam.cz) * s];
}

export function screenToWorld(cam: Camera, w: number, h: number, sx: number, sz: number): [number, number] {
  const s = Math.min(w, h) / (cam.view * 2);
  return [cam.cx + (sx - w / 2) / s, cam.cz + (sz - h / 2) / s];
}

/** pixels-per-world-unit at this zoom, for sizing icons/strokes so they stay a steady size on screen */
export function scaleOf(cam: Camera, w: number, h: number): number {
  return Math.min(w, h) / (cam.view * 2);
}

/** zoom by `factor` (>1 = in) keeping the world point under (fx, fz) screen px fixed in place —
 *  the natural feel for pinch-zoom and the scroll wheel */
export function zoomAt(cam: Camera, w: number, h: number, factor: number, fx: number, fz: number): Camera {
  const [wx, wz] = screenToWorld(cam, w, h, fx, fz);
  const view = clampView(cam.view / factor);
  // after changing the view, re-solve cx/cz so (wx,wz) still projects to (fx,fz)
  const s = Math.min(w, h) / (view * 2);
  const cx = wx - (fx - w / 2) / s;
  const cz = wz - (fz - h / 2) / s;
  return clampCamera({ cx, cz, view });
}

/** pan by a screen-pixel delta */
export function pan(cam: Camera, w: number, h: number, dxPx: number, dzPx: number): Camera {
  const s = scaleOf(cam, w, h);
  return clampCamera({ cx: cam.cx - dxPx / s, cz: cam.cz - dzPx / s, view: cam.view });
}

/** linear tween between two cameras (0..1) — used for the animated fly-to when a kid picks a place */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const k = Math.min(1, Math.max(0, t));
  // ease the view (zoom) with smoothstep so the fly-to doesn't feel linear/mechanical
  const e = k * k * (3 - 2 * k);
  return { cx: a.cx + (b.cx - a.cx) * e, cz: a.cz + (b.cz - a.cz) * e, view: a.view + (b.view - a.view) * e };
}

export type ZoomBand = "close" | "park" | "island" | "world";

/** which "band" of detail a view half-width falls into — gates which registries' pins/labels draw
 *  and which cached base bitmap (lib/park/map/artwork.ts) is blitted. `islandView`/`worldView` come
 *  from the registries (worldMap.ts), passed in so this module stays free of them. */
export function bandFor(view: number, islandView: number, worldView: number): ZoomBand {
  if (view < 95) return "close";
  if (view < islandView * 0.52) return "park";
  if (view < worldView * 0.62) return "island";
  return "world";
}

/** de-clutter by priority, not just by screen distance: once you've zoomed out past the park, a
 *  dozen lands/rides/wizard-spot pins all piled on top of each other reads as noise, not detail —
 *  hide anything below this band's threshold instead of drawing (and clustering) all of it */
export function minPriorityForBand(band: ZoomBand): number {
  if (band === "world") return 7;
  if (band === "island") return 6;
  return 0;
}
