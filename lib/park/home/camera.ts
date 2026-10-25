// My Home's camera framing (pure, no three.js; tested): where the camera looks from for a screen
// shape. Landscape: the whole cottage at once (the splayed side walls included, see rules.ts
// SIDE_SPLAY); portrait phones: a closer view of part of a room that pans with the kid, and that
// swings round a little toward a side wall as the kid walks up to it, so what hangs there reads.
import { WALL_H } from "./rules";

export interface HomeCamIn {
  aspect: number;
  /** vertical field of view (degrees) */
  fov: number;
  editing: boolean;
  /** (portrait) where along x the view should centre: the kid, or the ghost / selection decorating */
  focusX: number;
  /** (portrait, decorating) the viewed room's x range the view may pan over, else the whole cottage */
  panLo?: number;
  panHi?: number;
}
export interface HomeCam {
  look: { x: number; y: number; z: number };
  pos: { x: number; y: number; z: number };
  portrait: boolean;
  /** half the view's width at the floor (portrait: how far the pan stops short of the ends) */
  half: number;
}

/** the cottage's x extent the walking view pans over (its splayed side walls reach out past ±9.8) */
export const HOME_PAN = 10.6;

export function homeCamera(c: HomeCamIn): HomeCam {
  const aspect = c.aspect || 1;
  const tanV = Math.tan((c.fov * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;
  const portrait = aspect < 1.15;
  const pitch = portrait ? (c.editing ? 1.12 : 1.0) : c.editing ? 1.02 : 0.9;
  const viewW = portrait ? Math.min(10.6, Math.max(7.4, 16 * aspect)) : 26.4;
  const depth = 8.6;
  const needH = (depth * Math.sin(pitch) + WALL_H * Math.cos(pitch) * 0.9) / 2;
  const d = portrait ? viewW / 2 / tanH : Math.max(viewW / 2 / tanH, needH / tanV) * (c.editing ? 1.12 : 1.02);
  const half = viewW / 2 - 0.35;
  let fx = 0;
  let lean = 0;
  if (portrait) {
    const lo = (c.panLo ?? -HOME_PAN) + half;
    const hi = (c.panHi ?? HOME_PAN) - half;
    fx = lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, c.focusX));
    // walking up to a side wall: the camera swings in toward the middle of the house, looking out at
    // the wall more face-on
    if (!c.editing && hi > lo) lean = Math.max(-1, Math.min(1, (fx - (lo + hi) / 2) / ((hi - lo) / 2)));
  }
  // decorate mode: slide the house up the screen so the bar at the bottom doesn't cover it
  const fz = 0.4 + (c.editing ? d * (portrait ? 0.16 : 0.07) : 0);
  const look = { x: fx, y: 0.9, z: fz };
  const swing = lean * lean * Math.sign(lean) * 3.2;
  return { look, pos: { x: fx - swing, y: look.y + Math.sin(pitch) * d, z: fz + Math.cos(pitch) * d }, portrait, half };
}
