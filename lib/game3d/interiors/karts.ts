// Cucaino Karts: the race itself, as its own light "ride" scene (same contract as mini golf/quiz
// coaster — lib/game3d/interiors/types.ts's Interior, + camera/hideKid/actorScale). Runs entirely in
// lib/park/karts/track.ts's LOCAL space: a self-contained track, kerbs, start gantry and sky, driven
// by lib/park/karts/{physics,ai,race,ghost}.ts. The kid's own kart (and every other racer's) carries
// their chosen ParkAnimal, built with the same procedural chibi rig the park itself uses.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getToonRamp } from "@/lib/park/assets/loader";
import type { AnimalId } from "@/lib/park/assets/loader";
import { buildChibi, type ChibiRig } from "@/lib/park/characters/chibi";
import { buildKartTrackShape, nearestOnTrack, trackAt, type KartTrack } from "@/lib/park/karts/track";
import { gridStartState, stepKart, kartProgress, isWrongWay, MAX_SPEED, type KartPhysState, type KartInput } from "@/lib/park/karts/physics";
import { aiInput, aiPower, type AiProfile } from "@/lib/park/karts/ai";
import { createRace, dropKart, isRaceOver, positionOf, positions, raceResults, updateKartProgress, type RaceResult, type RaceState } from "@/lib/park/karts/race";
import { GhostRecorder, ghostLapMs, replayAt } from "@/lib/park/karts/ghost";
import type { GhostLap, KartNet, KartNetMsg, KartPose, KartRacer } from "@/lib/park/karts/types";
import { buildGrandstand, buildPitGarage } from "@/lib/park/world/karts";
import { buildForestTree, buildCloud } from "@/lib/park/world/storybook/geometry";
import { TREE_KINDS, LEAF_GREENS, PINE_GREENS, isPine } from "@/lib/park/world/storybook/plan";
import { rngOf, noise2 } from "@/lib/park/world/fantasy/noise";
import type { Interior } from "./types";

const identity = (p: { x: number; z: number }) => p;
const TAU = Math.PI * 2;
const AI_PROFILES: AiProfile[] = [
  { skill: 0.3, seed: 11 },
  { skill: 0.55, seed: 29 },
  { skill: 0.8, seed: 47 },
];
const DUST_COLOR = new THREE.Color(0xc9a876);
const SPARK_COLOR = new THREE.Color(0xfff2a0);
const SMOKE_COLOR = new THREE.Color(0xe9e6f0);
const FLAME_COLOR_A = new THREE.Color(0xff9a3c);
const FLAME_COLOR_B = new THREE.Color(0xffe066);
const CONFETTI_COLORS = [0xff5fa8, 0xffd23f, 0x5ee6a8, 0x6cc6ff, 0xc38bff, 0xff9a52].map((c) => new THREE.Color(c));

export type KartSeat =
  | { kind: "human" }
  | { kind: "ai"; profile: AiProfile }
  | { kind: "ghost"; ghost: GhostLap }
  | { kind: "remote" };

export interface KartGridEntry {
  racer: KartRacer;
  seat: KartSeat;
}

export type KartRaceEvent =
  | { type: "countdown"; n: number }
  | { type: "go" }
  | {
      type: "hud";
      lap: number;
      laps: number;
      position: number;
      total: number;
      lapMs: number;
      bestLapMs: number | null;
      offTrack: boolean;
      /** km/h-ish number for the speedo (the kart's speed scaled to read like a go-kart's) */
      speed: number;
      /** boosting right now */
      boost: boolean;
      /** pointing the wrong way round (the HUD shows a big turn-around sign) */
      wrongWay: boolean;
      /** every kart's place round the lap (0..1) for the little track map */
      dots: { id: string; u: number; me: boolean; colour: string }[];
    }
  /** little moments for sounds: a wall touched, a boost pad, put back on the road, the last lap */
  | { type: "fx"; kind: "wall" | "boost" | "rescue" | "finalLap" | "overtake" | "overtaken" }
  | { type: "lap"; lapMs: number; isBest: boolean; ghost?: GhostLap }
  | { type: "finish"; results: (RaceResult & { racer: KartRacer; kind: KartSeat["kind"] })[] }
  | { type: "peerLeft"; kidId: string };

export interface KartRaceControl {
  /** -1 (left) .. 1 (right), written every frame by the HUD's steer buttons/joystick */
  steer: number;
  /** holding the brake button */
  brake: boolean;
  /** 0..1: the steering helper for little hands (default 1 = on) */
  assist?: number;
  /** the HUD calls this to leave early (e.g. an "Exit" button) */
  requestExit?: () => void;
}

export interface KartRaceOptions {
  trackId: string;
  laps?: number;
  kid: KartRacer;
  /** the family's ghosts for this track (already excludes the kid's own) */
  ghosts: GhostLap[];
  /** a live link, if this is a race against a family peer (already agreed: grid/startAt known) */
  net?: KartNet | null;
  /** when racing live, the full agreed grid (kid + remote peers, in grid order) and the shared
   *  countdown target (epoch ms) — pass both together or neither */
  liveGrid?: { grid: KartGridEntry[]; startAt: number };
  fact?: string;
  /** how good the computer drivers are (default "medium") */
  difficulty?: "easy" | "medium" | "hard";
  /** smoke-test only: drives the human seat with ai.ts's own steering instead of `ctl`, so an
   *  automated screenshot/test run actually races round the circuit and reaches the finish
   *  (KartRace.tsx never sets this — a real kid always drives their own kart) */
  autopilot?: boolean;
}

function toonMat(color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp(), ...extra });
}

function ribbon(points: [number, number][], width: number, color: number, y: number): THREE.Mesh {
  const n = points.length;
  const pos: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = points[i % n];
    const b = points[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const px = (dz / l) * (width / 2);
    const pz = (-dx / l) * (width / 2);
    pos.push(a[0] - px, y, a[1] - pz, a[0] + px, y, a[1] + pz);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, toonMat(color, { side: THREE.DoubleSide }));
}

function buildKerbs(shape: KartTrack): THREE.Group {
  const g = new THREE.Group();
  const step = 3.2;
  const blockGeo = new THREE.BoxGeometry(0.9, 0.16, step * 0.92);
  const red = toonMat(0xe6483c);
  const white = toonMat(0xfbf6ea);
  let k = 0;
  for (let s = 0; s < shape.length; s += step, k++) {
    const at = trackAt(shape, s);
    for (const side of [-1, 1]) {
      const block = new THREE.Mesh(blockGeo, k % 2 === 0 ? red : white);
      block.position.set(at.x + at.dz * side * (shape.width / 2 + 0.5), 0.08, at.z - at.dx * side * (shape.width / 2 + 0.5));
      block.rotation.y = Math.atan2(at.dx, at.dz);
      g.add(block);
    }
  }
  return g;
}

function buildBoostArrows(shape: KartTrack): THREE.Group {
  const g = new THREE.Group();
  const shape2 = new THREE.Shape();
  shape2.moveTo(0, 3);
  shape2.lineTo(-1.5, 0.6);
  shape2.lineTo(-0.55, 0.6);
  shape2.lineTo(-0.55, -3);
  shape2.lineTo(0.55, -3);
  shape2.lineTo(0.55, 0.6);
  shape2.lineTo(1.5, 0.6);
  shape2.closePath();
  const geo = new THREE.ShapeGeometry(shape2);
  geo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xffb300, emissiveIntensity: 1.2, side: THREE.DoubleSide });
  for (const pad of shape.boostPads) {
    const at = trackAt(shape, pad.s);
    const m = new THREE.Mesh(geo, glowMat);
    m.position.set(at.x, 0.04, at.z);
    m.rotation.y = Math.atan2(at.dx, at.dz);
    g.add(m);
    const light = new THREE.PointLight(0xffd34d, 0.5, 8, 2);
    light.position.set(at.x, 1.2, at.z);
    g.add(light);
  }
  return g;
}

/** the gantry's three countdown lights (red/yellow/green), BIG and readable — `lamps[i].material`
 *  is a unique MeshStandardMaterial per lamp so the race loop can light them up one at a time as
 *  the countdown ticks down (all three flash green together on GO) */
function buildStartGantry(shape: KartTrack): { group: THREE.Group; lamps: THREE.Mesh[] } {
  const g = new THREE.Group();
  const at = trackAt(shape, 0);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = Math.atan2(at.dx, at.dz);
  const postMat = toonMat(0xffd84a);
  const half = shape.width / 2;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 6.2, 8), postMat);
    post.position.set(side * (half + 1), 3.1, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 3, 1, 0.6), postMat);
  beam.position.set(0, 5.9, 0);
  g.add(beam);
  // a chequered strip along the beam, on both faces
  const checkSize = 0.5;
  const cols = Math.round((half * 2 + 3) / checkSize);
  const darkSq = toonMat(0x201e24);
  const lightSq = toonMat(0xf6f3ea);
  const sqGeo = new THREE.BoxGeometry(checkSize, checkSize, 0.66);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cols; i++) {
      const sq = new THREE.Mesh(sqGeo, (i + row) % 2 ? darkSq : lightSq);
      sq.position.set(-((cols - 1) * checkSize) / 2 + i * checkSize, 5.65 + row * checkSize, 0);
      g.add(sq);
    }
  }
  // the countdown lights hang BELOW the beam on a dark board facing the grid (the karts wait on
  // the -z side and the chase camera looks slightly down, so anything above the beam is off-screen)
  const housingMat = toonMat(0x201e24);
  const board = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.7, 0.3), housingMat);
  board.position.set(0, 4.55, 0);
  g.add(board);
  const lightColors = [0xff5050, 0xffd24a, 0x58e06a];
  const lamps = lightColors.map((c, i) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.3), emissive: c, emissiveIntensity: 0.15 }));
    lamp.position.set(2.7 - i * 2.7, 4.55, -0.12);
    lamp.scale.z = 0.5;
    lamp.name = `gantry-light-${i}`;
    g.add(lamp);
    return lamp;
  });
  return { group: g, lamps };
}

// ── the world around the track: sky, hills, grass, trees and a hazy skyline, so the ride feels
// like racing through Cucaino Park and not a void. Cheap and mostly static (built once; the only
// per-frame cost is the particle pools and the gentle cloud drift) — a handful of draw calls on
// top of the track itself, nowhere near the park's own streamed-settlement budget. ──

const TRACK_RADIUS = 70; // the circuit's own local footprint (buildKartTrackShape's ~64 m radius) + a margin

/** a big inverted dome, vertex-coloured from a pale horizon up to a deeper blue overhead — reads
 *  as a gradient sky without a shader, and the park's existing fog does the rest of the depth work */
function buildSkyDome(): THREE.Mesh {
  const radius = 480;
  const geo = new THREE.SphereGeometry(radius, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x4fa8e8);
  const horizon = new THREE.Color(0xcdeeff);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = Math.max(0, Math.min(1, pos.getY(i) / radius + 0.08));
    c.copy(horizon).lerp(top, Math.pow(u, 0.7));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** a handful of puffy static clouds, drifting very slowly as a single group */
function buildClouds(): { group: THREE.Group; geos: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonRamp(), fog: true });
  const r = rngOf(4242);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const geo = buildCloud(i % 3);
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    const a = (i / n) * TAU + r() * 0.5;
    const rad = 150 + r() * 160;
    m.position.set(Math.sin(a) * rad, 58 + r() * 34, Math.cos(a) * rad);
    m.rotation.y = r() * TAU;
    const s = 0.8 + r() * 0.8;
    m.scale.setScalar(s);
    m.frustumCulled = false;
    group.add(m);
  }
  return { group, geos };
}

/** the ground: a flat inner disc (under the whole track + infield + grandstand/pit), then a ring
 *  of gentle rolling hills further out, both with a little grass-tone variation so it never reads
 *  as one flat green. Purely decorative height (the kart's own physics never samples this mesh). */
function buildGround(): THREE.Group {
  const group = new THREE.Group();
  const GREENS = [new THREE.Color(0x7fc26a), new THREE.Color(0x8fd179), new THREE.Color(0x6cae5c)];
  const tint = (x: number, z: number) => {
    const n = noise2(x * 0.035, z * 0.035, 5);
    const k = noise2(x * 0.09, z * 0.09, 91);
    return GREENS[0].clone().lerp(GREENS[n > 0.5 ? 1 : 2], Math.abs(n - 0.5) * 2 * (0.5 + k * 0.5));
  };
  // flat inner disc
  {
    const inner = TRACK_RADIUS + 25;
    const geo = new THREE.CircleGeometry(inner, 48);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = tint(pos.getX(i), pos.getY(i));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonRamp() }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.02;
    group.add(mesh);
  }
  // rolling hills beyond it, rising gently with distance (height is pure decoration — see above)
  {
    const inner = TRACK_RADIUS + 25;
    const outer = 280;
    const ringSegs = 10;
    const angSegs = 48;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let ri = 0; ri <= ringSegs; ri++) {
      const t = ri / ringSegs;
      const rad = inner + (outer - inner) * t;
      for (let a = 0; a <= angSegs; a++) {
        const ang = (a / angSegs) * TAU;
        const x = Math.sin(ang) * rad;
        const z = Math.cos(ang) * rad;
        const h = Math.max(0, t - 0.04) / 0.96;
        const y = h * (2.2 + noise2(x * 0.012, z * 0.012, 17) * 7 * h) + Math.max(0, noise2(x * 0.05, z * 0.05, 3) - 0.5) * 1.4 * h;
        pos.push(x, y, z);
        const c = tint(x, z);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let ri = 0; ri < ringSegs; ri++) {
      for (let a = 0; a < angSegs; a++) {
        const i0 = ri * (angSegs + 1) + a;
        const i1 = i0 + 1;
        const i2 = i0 + (angSegs + 1);
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonRamp() }));
    mesh.position.y = -0.02;
    group.add(mesh);
  }
  return group;
}

/** distant silhouettes beyond the hills — a couple of snow-capped mountains, a candy ferris
 *  wheel, a little castle and a pale glint of sea — so the horizon isn't empty. The scene's own
 *  fog (near 120 / far 420) softens them into haze, which reads as real distance for free. */
function buildHorizonProps(): THREE.Group {
  const g = new THREE.Group();
  const far = (ang: number, r: number) => ({ x: Math.sin(ang) * r, z: Math.cos(ang) * r });
  const mtnMat = toonMat(0x8ea3c4);
  const snowMat = toonMat(0xeef6ff);
  for (const [ang, r, h] of [
    [0.35, 340, 78],
    [0.85, 370, 58],
    [-0.55, 350, 66],
  ] as const) {
    const { x, z } = far(ang, r);
    const base = new THREE.Mesh(new THREE.ConeGeometry(58, h, 7), mtnMat);
    base.position.set(x, h / 2 - 6, z);
    g.add(base);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(17, h * 0.26, 7), snowMat);
    cap.position.set(x, h - h * 0.14 - 6, z);
    g.add(cap);
  }
  // a candy ferris wheel, facing back toward the track
  {
    const ang = 2.15;
    const r = 215;
    const { x, z } = far(ang, r);
    const yaw = Math.atan2(-x, -z);
    const wheel = new THREE.Group();
    wheel.position.set(x, 30, z);
    wheel.rotation.y = yaw;
    const rimMat = toonMat(0xff8fc6);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 1.5, 8, 24), rimMat);
    wheel.add(rim);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      // (a spoke runs hub to rim in the wheel's own plane)
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 24, 6), rimMat);
      spoke.position.set(Math.sin(a) * 12, Math.cos(a) * 12, 0);
      spoke.rotation.z = -a;
      wheel.add(spoke);
      const gx = Math.sin(a) * 24;
      const gy = Math.cos(a) * 24;
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2), toonMat(i % 2 ? 0xffe14d : 0x6cc6ff));
      gondola.position.set(gx, gy, 2.4);
      wheel.add(gondola);
    }
    const legMat = toonMat(0xf4f0e6);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 36, 6), legMat);
      leg.position.set(s * 12, 15, -4);
      leg.rotation.z = s * 0.22;
      wheel.add(leg);
    }
    g.add(wheel);
  }
  // a little candy-coloured castle
  {
    const ang = -2.3;
    const r = 320;
    const { x, z } = far(ang, r);
    const castle = new THREE.Group();
    castle.position.set(x, 0, z);
    const wallMat = toonMat(0xe8d8f0);
    const roofMat = toonMat(0xb66fd6);
    const keep = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 22), wallMat);
    keep.position.y = 15;
    castle.add(keep);
    for (const [tx, tz] of [
      [12, 12],
      [-12, 12],
      [12, -12],
      [-12, -12],
    ]) {
      const h = 40;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, h, 8), wallMat);
      tower.position.set(tx, h / 2, tz);
      castle.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 9, 8), roofMat);
      roof.position.set(tx, h + 4.5, tz);
      castle.add(roof);
    }
    const flag = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 6), roofMat);
    flag.position.set(0, 37, 0);
    castle.add(flag);
    g.add(castle);
  }
  // a pale glint of sea on the horizon
  {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 60), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.25, metalness: 0.15, fog: true }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(Math.sin(1.2) * 330, -3, Math.cos(1.2) * 330);
    sea.rotation.z = 1.2;
    g.add(sea);
  }
  return g;
}

/** strings of triangular bunting on poles along the home straight */
function buildBunting(shape: KartTrack): THREE.Group {
  const g = new THREE.Group();
  const poleMat = toonMat(0xf4f0e6);
  const flagColors = [0xff5fa8, 0xffd24a, 0x6cc6ff, 0x8bd96a].map((c) => toonMat(c, { side: THREE.DoubleSide }));
  const flagShape = new THREE.BufferGeometry();
  flagShape.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.55, 0, 0, 0.27, -0.42, 0], 3));
  flagShape.setIndex([0, 1, 2]);
  flagShape.computeVertexNormals();
  const half = shape.width / 2;
  const straight = shape.corners.length ? shape.corners[0] : null;
  const s0 = straight ? straight.s1 : 0;
  const run = 46;
  const step = 6;
  for (let s = 0; s < run; s += step) {
    const at = trackAt(shape, s0 + s);
    for (const side of [-1, 1]) {
      const lx = at.x + at.dz * side * (half + 3.2);
      const lz = at.z - at.dx * side * (half + 3.2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), poleMat);
      pole.position.set(lx, 1.3, lz);
      g.add(pole);
      for (let f = 0; f < 2; f++) {
        const flag = new THREE.Mesh(flagShape, flagColors[(Math.floor(s / step) * 2 + f) % flagColors.length]);
        flag.position.set(lx + (f === 0 ? -0.55 : 0), 2.5, lz);
        flag.rotation.y = Math.atan2(at.dx, at.dz) + (side > 0 ? 0 : Math.PI);
        g.add(flag);
      }
    }
  }
  return g;
}

/** tyre stacks AND a few hay bales outside the hairpin/chicane, in the race's own local space
 *  (the outdoor version — lib/park/world/karts/index.ts's buildTyreWalls — bakes in a toWorld
 *  offset, so it can't be reused directly here; this is the same look, undisplaced). */
function buildTyreAndHay(shape: KartTrack): THREE.Group {
  const g = new THREE.Group();
  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.42, 12);
  const tyreA = toonMat(0x2b2b32);
  const tyreB = toonMat(0xf4f0e6);
  const hayGeo = new THREE.BoxGeometry(1.7, 1.1, 1.1);
  const hayMat = toonMat(0xe8c86a);
  const half = shape.width / 2;
  let hayCount = 0;
  for (const c of shape.corners) {
    if (c.kind !== "hairpin" && c.kind !== "chicane") continue;
    const mid = c.s1 > c.s0 ? (c.s0 + c.s1) / 2 : c.s0;
    for (let off = -7; off <= 7; off += 3.2) {
      const s = mid + off;
      const at = trackAt(shape, s);
      for (let row = 0; row < 2; row++) {
        const lx = at.x + at.dz * (half + 1.6 + row * 0.85);
        const lz = at.z - at.dx * (half + 1.6 + row * 0.85);
        const tyre = new THREE.Mesh(tyreGeo, Math.round(off / 3.2 + row) % 2 === 0 ? tyreA : tyreB);
        tyre.position.set(lx, 0.21 + row * 0.42, lz);
        g.add(tyre);
      }
      if (hayCount++ % 3 === 0) {
        const hx = at.x + at.dz * (half + 3.15);
        const hz = at.z - at.dx * (half + 3.15);
        const hay = new THREE.Mesh(hayGeo, hayMat);
        hay.position.set(hx, 0.55, hz);
        hay.rotation.y = Math.atan2(at.dx, at.dz);
        g.add(hay);
      }
    }
  }
  return g;
}

/** candy-coloured low-poly trees scattered round the circuit (keeping well clear of the road, the
 *  grandstand, the pit garage and the gantry) — same models + colours the park's own storybook
 *  forest uses, just instanced lightly here (a few dozen trees, not a whole forest). */
/** red-and-white arrow boards on the OUTSIDE of every real bend, facing the karts as they arrive and
 *  pointing the way the road turns — the same boards real kart tracks use, and exactly what a small
 *  kid needs to see which way to steer next */
function buildArrowBoards(shape: KartTrack): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const tex = (left: boolean) => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#e8263a";
    for (let k = 0; k < 3; k++) {
      const x = 26 + k * 78;
      c.beginPath();
      if (left) {
        c.moveTo(x + 52, 14);
        c.lineTo(x + 22, 14);
        c.lineTo(x - 8, 64);
        c.lineTo(x + 22, 114);
        c.lineTo(x + 52, 114);
        c.lineTo(x + 22, 64);
      } else {
        c.moveTo(x, 14);
        c.lineTo(x + 30, 14);
        c.lineTo(x + 60, 64);
        c.lineTo(x + 30, 114);
        c.lineTo(x, 114);
        c.lineTo(x + 30, 64);
      }
      c.closePath();
      c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const texL = tex(true);
  const texR = tex(false);
  const matL = new THREE.MeshBasicMaterial({ map: texL });
  const matR = new THREE.MeshBasicMaterial({ map: texR });
  const boardGeo = new THREE.PlaneGeometry(3.4, 1.7);
  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6);
  const postMat = toonMat(0x4a4d5c);
  const half = shape.width / 2;
  const n = shape.points.length;
  const step = shape.length / n;
  let lastS = -99;
  for (let i = 0; i < n; i++) {
    if (shape.radius[i] > 30) continue;
    const s = shape.cum[i];
    if (s - lastS < 11) continue;
    lastS = s;
    const a = trackAt(shape, s);
    const b = trackAt(shape, s + Math.max(3, step * 2));
    // which way does the road turn here? (yaw = atan2(dx, dz); yaw falling = turning left)
    let dyaw = Math.atan2(b.dx, b.dz) - Math.atan2(a.dx, a.dz);
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const left = dyaw < 0;
    // the outside of the bend: the right-hand side for a left turn ((dz, -dx)), and vice versa
    const side = left ? 1 : -1;
    const off = half + 4.6;
    const x = a.x + a.dz * side * off;
    const z = a.z - a.dx * side * off;
    const board = new THREE.Mesh(boardGeo, left ? matL : matR);
    board.position.set(x, 2.15, z);
    board.rotation.y = Math.atan2(-a.dx, -a.dz); // faces the karts coming toward it
    group.add(board);
    for (const px of [-1.2, 1.2]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x + a.dz * px, 0.65, z - a.dx * px);
      group.add(post);
    }
  }
  return {
    group,
    dispose: () => {
      texL.dispose();
      texR.dispose();
      matL.dispose();
      matR.dispose();
      boardGeo.dispose();
      postGeo.dispose();
      postMat.dispose();
    },
  };
}

function scatterTrees(shape: KartTrack, exclude: { x: number; z: number; r: number }[]): { group: THREE.Group; geos: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonRamp() });
  const geos: THREE.BufferGeometry[] = [];
  const r = rngOf(909);
  const half = shape.width / 2;
  const perKind = 24;
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const S = new THREE.Vector3();
  const C = new THREE.Color();
  for (let k = 0; k < TREE_KINDS; k++) {
    const geo = buildForestTree(k, true);
    geos.push(geo);
    const im = new THREE.InstancedMesh(geo, mat, perKind);
    let placed = 0;
    let tries = 0;
    while (placed < perKind && tries < perKind * 40) {
      tries++;
      const ang = r() * TAU;
      const rad = Math.sqrt(r()) * (TRACK_RADIUS + 70);
      const x = Math.sin(ang) * rad;
      const z = Math.cos(ang) * rad;
      const near = nearestOnTrack(shape, x, z);
      if (Math.abs(near.lateral) < half + 7) continue;
      if (exclude.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
      E.set(0, r() * TAU, 0);
      Q.setFromEuler(E);
      const s = 0.85 + r() * 0.5;
      S.set(s, s, s);
      M.compose(new THREE.Vector3(x, 0, z), Q, S);
      im.setMatrixAt(placed, M);
      const palette = isPine(k) ? PINE_GREENS : LEAF_GREENS;
      C.set(palette[Math.floor(r() * palette.length)]);
      im.setColorAt(placed, C);
      placed++;
    }
    im.count = placed;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }
  return { group, geos };
}

/** a tiny, cheap particle pool: a single Points draw call per pool, alive particles compacted to
 *  the front of the buffers each frame (geometry.setDrawRange keeps the GPU side trivial). Used
 *  for dust/skid puffs, wall sparks, the boost flame and the finish confetti — nothing here
 *  allocates per frame. */
interface ParticlePool {
  points: THREE.Points;
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: THREE.Color): void;
  update(dt: number): void;
}
function makeParticlePool(max: number, size: number, gravity: number, drag: number, additive: boolean): ParticlePool {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  let n = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, map: particleSprite(), ...(additive ? { blending: THREE.AdditiveBlending } : {}) });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    spawn(x, y, z, vx, vy, vz, l, color) {
      if (n >= max) return;
      const i = n++;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      vel[i * 3] = vx;
      vel[i * 3 + 1] = vy;
      vel[i * 3 + 2] = vz;
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
      life[i] = l;
      maxLife[i] = l;
    },
    update(dt) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vel[i * 3 + 1] -= gravity * dt;
        const k = Math.max(0, 1 - drag * dt);
        vel[i * 3] *= k;
        vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (w !== i) {
          pos[w * 3] = pos[i * 3];
          pos[w * 3 + 1] = pos[i * 3 + 1];
          pos[w * 3 + 2] = pos[i * 3 + 2];
          vel[w * 3] = vel[i * 3];
          vel[w * 3 + 1] = vel[i * 3 + 1];
          vel[w * 3 + 2] = vel[i * 3 + 2];
          col[w * 3] = col[i * 3];
          col[w * 3 + 1] = col[i * 3 + 1];
          col[w * 3 + 2] = col[i * 3 + 2];
          life[w] = life[i];
          maxLife[w] = maxLife[i];
        }
        w++;
      }
      n = w;
      geo.setDrawRange(0, n);
      if (n > 0) {
        (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    },
  };
}
let _particleSprite: THREE.Texture | null = null;
/** one shared soft round dot, so every particle pool reads as a puff/spark instead of a square */
function particleSprite(): THREE.Texture {
  if (_particleSprite) return _particleSprite;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  _particleSprite = new THREE.CanvasTexture(c);
  return _particleSprite;
}

interface KartMesh {
  group: THREE.Group;
  chibi: ChibiRig;
  nameTag?: THREE.Sprite;
  /** steering pivots (rotate .rotation.y each frame to visibly steer) */
  frontL: THREE.Group;
  frontR: THREE.Group;
  /** all four wheel meshes, for the rolling spin */
  wheelMeshes: THREE.Mesh[];
  /** where the exhaust sits, in the kart's own local space (boost-flame particles spawn here) */
  exhaustLocal: THREE.Vector3;
  /** smoothed lean angle (radians), banking into turns */
  lean: number;
}

/** sets a flat vertex colour on a (possibly indexed) geometry, returning a new non-indexed copy —
 *  so several differently-coloured primitives can merge into one chunky toy-kart body mesh */
function paintPart(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute("uv");
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

let _numberBadge: Map<number, THREE.Texture> = new Map();
/** a round race-number badge, billboarded on the nose (always reads, whichever way the kart turns) */
function numberBadge(n: number): THREE.Sprite {
  let tex = _numberBadge.get(n);
  if (!tex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a22";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#1a1a22";
    ctx.font = "900 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 32, 35);
    tex = new THREE.CanvasTexture(c);
    _numberBadge.set(n, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}

/** a chunky toy go-kart: a tub the driver sits IN (not on), a rounded nose + bumper, side pods, a
 *  roll hoop, a little rear spoiler and a race number, in the racer's own colour with a white
 *  stripe. Rear tyres are fat, front tyres smaller and steer visibly (each on its own pivot);
 *  everything else is one merged, vertex-coloured body mesh — one extra draw call per kart. */
function buildKartMesh(colour: string, animal: string, number: number, ghost = false): KartMesh {
  const group = new THREE.Group();
  const body = new THREE.Color(colour);
  const white = new THREE.Color(0xfbf6ea);
  const dark = new THREE.Color(0x26262c);
  const op = ghost ? 0.42 : 1;

  const parts: THREE.BufferGeometry[] = [];
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz);
    g.rotateX(rx);
    g.rotateY(ry);
    g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  // the tub (the driver sits inside its walls, not on top of a box) — spans roughly z -0.9..0.8
  parts.push(paintPart(at(new THREE.BoxGeometry(1.15, 0.52, 1.7), 0, 0.3, -0.05), body));
  // a rounded nose cone (a squashed sphere reads friendlier than a hard cone) — sized to the tub,
  // not dwarfing it: a little narrower than the tub, flattened down and stretched forward a touch
  parts.push(paintPart(at(new THREE.SphereGeometry(0.33, 10, 8), 0, 0.3, 0.98, 0, 0, 0, 1, 0.8, 1.15), body));
  // the front bumper
  parts.push(paintPart(at(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 10), 0, 0.2, 1.32, 0, 0, Math.PI / 2), dark));
  // side pods flanking the tub
  for (const s of [-1, 1]) parts.push(paintPart(at(new THREE.BoxGeometry(0.32, 0.3, 1.05), s * 0.76, 0.28, 0.05), white));
  // a roll hoop behind the driver's head
  parts.push(paintPart(at(new THREE.TorusGeometry(0.34, 0.07, 6, 10, Math.PI), 0, 0.72, -0.62, Math.PI / 2, 0, Math.PI), dark));
  // a little rear spoiler on two struts
  parts.push(paintPart(at(new THREE.BoxGeometry(1.3, 0.08, 0.3), 0, 0.68, -0.98), dark));
  for (const s of [-1, 1]) parts.push(paintPart(at(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), s * 0.45, 0.5, -0.98), dark));
  // a white racing stripe down the middle
  parts.push(paintPart(at(new THREE.BoxGeometry(0.3, 0.03, 1.85), 0, 0.61, -0.05), white));
  // ── the back of the kart (what the driver's own camera looks at all race): a dark floor pan under
  //    everything, the little engine behind the seat with twin chrome exhausts, a rear bumper bar,
  //    tail lights and a white number plate ──
  const chrome = new THREE.Color(0xd9dde6);
  const red = new THREE.Color(0xff3b4a);
  const engine = new THREE.Color(0x4a4d5c);
  parts.push(paintPart(at(new THREE.BoxGeometry(1.5, 0.1, 2.3), 0, 0.09, 0.02), dark));
  parts.push(paintPart(at(new THREE.BoxGeometry(0.62, 0.3, 0.34), 0, 0.5, -1.02), engine));
  parts.push(paintPart(at(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10), 0, 0.68, -1.02, 0, 0, Math.PI / 2), engine));
  for (const sx of [-1, 1]) parts.push(paintPart(at(new THREE.CylinderGeometry(0.06, 0.085, 0.42, 8), sx * 0.2, 0.44, -1.3, Math.PI / 2.25), chrome));
  parts.push(paintPart(at(new THREE.CylinderGeometry(0.075, 0.075, 1.46, 8), 0, 0.2, -1.32, 0, 0, Math.PI / 2), dark));
  for (const sx of [-1, 1]) parts.push(paintPart(at(new THREE.BoxGeometry(0.2, 0.13, 0.05), sx * 0.44, 0.44, -0.915), red));
  parts.push(paintPart(at(new THREE.BoxGeometry(0.46, 0.24, 0.04), 0, 0.3, -0.915), white));
  // (boost flames come out of the exhausts)
  const exhaustLocal = new THREE.Vector3(0, 0.36, -1.5);

  const bodyGeo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const bodyMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonRamp(), transparent: ghost, opacity: op });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // the steering wheel, held up in front of the driver
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 10), new THREE.MeshToonMaterial({ color: 0x3a3a42, gradientMap: getToonRamp(), transparent: ghost, opacity: op }));
  wheel.position.set(0, 0.68, 0.32);
  wheel.rotation.x = Math.PI / 2.3;
  group.add(wheel);

  const badge = numberBadge(number);
  badge.position.set(0, 0.46, 1.42);
  group.add(badge);
  // …and the same number on the plate at the back
  const rearBadge = numberBadge(number);
  rearBadge.position.set(0, 0.3, -0.95);
  rearBadge.scale.multiplyScalar(0.62);
  group.add(rearBadge);

  const wheelMat = new THREE.MeshToonMaterial({ color: 0x201e24, gradientMap: getToonRamp(), transparent: ghost, opacity: op });
  const makeWheel = (radius: number, width: number) => {
    const pivot = new THREE.Group();
    // the axle orientation is baked into the GEOMETRY itself (not the mesh's own .rotation), so
    // the per-frame rolling spin below can drive rotation.x alone — setting both .rotation.x and
    // .rotation.z on the same object fights Three's fixed Euler order and makes the wheel tumble
    const geo = new THREE.CylinderGeometry(radius, radius, width, 10);
    geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, wheelMat);
    pivot.add(mesh);
    return { pivot, mesh };
  };
  // fat rear tyres, smaller fronts that visibly steer (each on its own yaw pivot)
  const rearL = makeWheel(0.38, 0.32);
  const rearR = makeWheel(0.38, 0.32);
  const frontL = makeWheel(0.3, 0.24);
  const frontR = makeWheel(0.3, 0.24);
  rearL.pivot.position.set(-0.78, 0.38, -0.78);
  rearR.pivot.position.set(0.78, 0.38, -0.78);
  frontL.pivot.position.set(-0.62, 0.3, 0.92);
  frontR.pivot.position.set(0.62, 0.3, 0.92);
  group.add(rearL.pivot, rearR.pivot, frontL.pivot, frontR.pivot);

  const chibi = buildChibi((animal as AnimalId) || "animal-fox", { height: 1.5, role: "kid", accent: colour });
  chibi.root.position.set(0, 0.56, -0.12);
  chibi.root.scale.setScalar(0.68);
  chibi.setStance("sit");
  if (ghost) {
    chibi.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as THREE.Mesh).material) {
        const m = mesh.material as THREE.Material | THREE.Material[];
        for (const one of Array.isArray(m) ? m : [m]) {
          one.transparent = true;
          one.opacity = 0.45;
        }
      }
    });
  }
  group.add(chibi.root);
  return { group, chibi, frontL: frontL.pivot, frontR: frontR.pivot, wheelMeshes: [rearL.mesh, rearR.mesh, frontL.mesh, frontR.mesh], exhaustLocal, lean: 0 };
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpAngleKart(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const round = (v: number, d: number) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};
function poseOf(kart: KartPhysState, track: KartTrack, t: number): KartPose {
  return { t: round(t, 0), x: round(kart.x, 2), z: round(kart.z, 2), yaw: round(kart.yaw, 3), speed: round(kart.speed, 2), lap: kart.lap, progress: round(kartProgress(track, kart), 3) };
}

interface Racer {
  id: string;
  meta: KartRacer;
  seat: KartSeat;
  mesh: KartMesh;
  kart: KartPhysState;
  recorder?: GhostRecorder;
  /** index into recorder.samples where the CURRENT lap's recording began (ghosts keep one lap, not
   *  the whole race — this is how we slice just the lap that just finished back out) */
  lapSampleStart: number;
  isKid: boolean;
  dropped: boolean;
}

export function buildKartRaceInterior(_accent: string, onEvent: (e: KartRaceEvent) => void, ctl: KartRaceControl, opts: KartRaceOptions): Interior & { camera?: (cam: THREE.PerspectiveCamera, dt: number) => void; hideKid?: boolean; actorScale?: number } {
  const laps = opts.laps ?? 3;
  const track = buildKartTrackShape();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcdeeff);
  scene.fog = new THREE.Fog(0xcdeeff, 130, 420);

  const disposeGeos: THREE.BufferGeometry[] = [];

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a8a55, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 90, 40);
  scene.add(sun);

  // ── the world around the circuit: sky, hills, grass, trees, a hazy skyline (see the helpers
  // above) — so the ride feels like racing through the park, not a void ──
  scene.add(buildSkyDome());
  const clouds = buildClouds();
  scene.add(clouds.group);
  disposeGeos.push(...clouds.geos);
  scene.add(buildGround());
  scene.add(buildHorizonProps());

  scene.add(ribbon(track.points, track.width, 0x4a4a55, 0.0));
  scene.add(ribbon(track.points, 0.3, 0xf4e8c8, 0.02));
  scene.add(buildKerbs(track));
  scene.add(buildBoostArrows(track));
  scene.add(buildTyreAndHay(track));
  scene.add(buildBunting(track));
  const arrowBoards = buildArrowBoards(track);
  scene.add(arrowBoards.group);
  const { group: gantry, lamps: gantryLamps } = buildStartGantry(track);
  scene.add(gantry);

  // the grandstand (facing the line from the first sweeper) and the pit garage (off the home
  // straight, opposite side) — the SAME placement maths as the outdoor view's buildKartTrack(),
  // just staying in local space (no toWorld here: the ride never leaves the track's own frame)
  const startAt0 = trackAt(track, 0);
  const sweeper = track.corners.find((c) => c.kind === "sweeper") ?? track.corners[0];
  const standAtS = trackAt(track, (sweeper.s0 + sweeper.s1) / 2);
  const standX = standAtS.x + standAtS.dz * (track.width / 2 + 14);
  const standZ = standAtS.z - standAtS.dx * (track.width / 2 + 14);
  const standYaw = Math.atan2(startAt0.x - standX, startAt0.z - standZ);
  scene.add(buildGrandstand(standX, standZ, standYaw));
  const pitX = startAt0.x - startAt0.dz * (track.width / 2 + 9);
  const pitZ = startAt0.z + startAt0.dx * (track.width / 2 + 9);
  const pitYaw = Math.atan2(startAt0.x - pitX, startAt0.z - pitZ);
  scene.add(buildPitGarage(pitX, pitZ, pitYaw));

  const trees = scatterTrees(track, [
    { x: standX, z: standZ, r: 13 },
    { x: pitX, z: pitZ, r: 10 },
    { x: startAt0.x, z: startAt0.z, r: 11 },
  ]);
  scene.add(trees.group);
  disposeGeos.push(...trees.geos);

  // ── particle pools: dust/skid puffs, wall sparks, the boost flame, and finish confetti ──
  const dustPool = makeParticlePool(90, 0.55, 2.2, 1.4, false);
  const sparkPool = makeParticlePool(80, 0.22, 7, 0.6, true);
  const flamePool = makeParticlePool(60, 0.3, 1, 2.2, true);
  const confettiPool = makeParticlePool(160, 0.4, 5, 0.3, false);
  scene.add(dustPool.points, sparkPool.points, flamePool.points, confettiPool.points);
  let confettiFired = false;
  /** 0..1, set the instant the kid's own kart starts boosting, decayed in camera() for the FOV kick */
  let kidBoostKick = 0;

  // a handful of streak quads that flash past at the screen's edges at speed/on a boost — built
  // once, repositioned off the camera's own basis vectors every frame in camera() below
  const speedLineGroup = new THREE.Group();
  speedLineGroup.renderOrder = 999;
  const speedLines = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    speedLineGroup.add(m);
    return m;
  });
  scene.add(speedLineGroup);

  // ── grid: the kid, then (if not a live race) ghosts, then AI to fill to 4 ──
  let grid: KartGridEntry[];
  if (opts.liveGrid) {
    grid = opts.liveGrid.grid;
  } else {
    grid = [{ racer: opts.kid, seat: { kind: "human" } }];
    for (const ghost of opts.ghosts) {
      if (grid.length >= 4) break;
      grid.push({ racer: { kidId: ghost.kidId, name: ghost.name, animal: ghost.animal, colour: ghost.colour }, seat: { kind: "ghost", ghost } });
    }
    let ai = 0;
    while (grid.length < 4) {
      const base = AI_PROFILES[ai % AI_PROFILES.length];
      const shift = opts.difficulty === "easy" ? -0.22 : opts.difficulty === "hard" ? 0.2 : 0;
      const profile = { ...base, skill: Math.max(0.05, Math.min(1, base.skill + shift)) };
      grid.push({ racer: { kidId: `ai-${ai}`, name: ["Buzz", "Cherry", "Max"][ai % 3], animal: ["animal-fox", "animal-bunny", "animal-panda"][ai % 3], colour: ["#ff7a59", "#6fc3ff", "#b07af0"][ai % 3] }, seat: { kind: "ai", profile } });
      ai++;
    }
  }

  const racers: Racer[] = grid.map((entry, i) => {
    const seat = entry.seat;
    const start = gridStartState(track, identity, i);
    const ghostFlag = seat.kind === "ghost" || seat.kind === "remote";
    const mesh = buildKartMesh(entry.racer.colour, entry.racer.animal, i + 1, ghostFlag);
    mesh.group.position.set(start.x, 0, start.z);
    mesh.group.rotation.y = start.yaw;
    scene.add(mesh.group);
    if (ghostFlag) {
      const tag = labelTag(entry.racer.name);
      tag.position.set(0, 2.2, 0);
      mesh.group.add(tag);
    }
    return {
      id: entry.racer.kidId,
      meta: entry.racer,
      seat,
      mesh,
      kart: start,
      recorder: seat.kind === "human" ? new GhostRecorder() : undefined,
      lapSampleStart: 0,
      isKid: seat.kind === "human" && entry.racer.kidId === opts.kid.kidId,
      dropped: false,
    };
  });
  const kidRacer = racers.find((r) => r.isKid)!;

  function labelTag(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,20,30,0.55)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 16);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.2, 0.55, 1);
    return sprite;
  }

  const raceState: RaceState = createRace(
    racers.map((r) => r.id),
    laps,
    track.length,
    0,
  );

  let phase: "countdown" | "racing" | "done" = "countdown";
  /** seconds since the kid crossed the finish line (-1 = still racing): the kart rolls on for a
   *  moment under the confetti before the results come up */
  let kidFinishT = -1;
  let lastKidPosition = 0;
  let finalLapSaid = false;
  let countdownT = opts.liveGrid ? Math.max(0, (opts.liveGrid.startAt - Date.now()) / 1000) : 3.3;
  let lastCountdownN = -1;
  let raceClockMs = 0;
  let lastHudMs = -1000;
  let lastSentPoseMs = -1000;
  let netOff: (() => void) | null = null;
  // a short buffer of each remote kart's recent poses, so it can be rendered ~120 ms behind the
  // network (smoothly interpolated between two real samples) instead of snapping to whatever the
  // last packet said — a kid's own kart never does this; only other people's
  const RENDER_DELAY_MS = 120;
  const remoteBuffer = new Map<string, KartPose[]>();

  if (opts.net) {
    netOff = opts.net.onMessage((m: KartNetMsg) => {
      if (m.type === "pose") {
        const buf = remoteBuffer.get(m.kidId) ?? [];
        buf.push(m.pose);
        if (buf.length > 12) buf.shift();
        remoteBuffer.set(m.kidId, buf);
      } else if (m.type === "leave" || m.type === "finish") {
        const r = racers.find((x) => x.id === (m as { kidId: string }).kidId);
        if (r && m.type === "leave") {
          r.dropped = true;
          dropKart(raceState, r.id);
          onEvent({ type: "peerLeft", kidId: r.id });
        }
      }
    });
  }

  const AUTOPILOT_PROFILE: AiProfile = { skill: 0.8, seed: 3 };
  function cornerAwareInput(r: Racer): KartInput {
    if (r.seat.kind === "human") {
      // (the smoke test's autopilot — and, once the kid has crossed the line, their victory lap)
      if (opts.autopilot || kidFinishT >= 0) return aiInput(r.kart, track, AUTOPILOT_PROFILE, { deltaToKid: 0 });
      return { steer: ctl.steer, brake: ctl.brake };
    }
    if (r.seat.kind === "ai") {
      // rubber-band to the kid's own distance
      const deltaToKid = r.kart.distTotal - kidRacer.kart.distTotal;
      const others = racers.filter((o) => o !== r && !o.dropped).map((o) => ({ x: o.kart.x, z: o.kart.z }));
      return aiInput(r.kart, track, r.seat.profile, { deltaToKid, others });
    }
    return { steer: 0, brake: false };
  }

  function dispose() {
    netOff?.();
    for (const r of racers) r.mesh.chibi.dispose();
    for (const g of disposeGeos) g.dispose();
    arrowBoards.dispose();
    dustPool.points.geometry.dispose();
    (dustPool.points.material as THREE.Material).dispose();
    sparkPool.points.geometry.dispose();
    (sparkPool.points.material as THREE.Material).dispose();
    flamePool.points.geometry.dispose();
    (flamePool.points.material as THREE.Material).dispose();
    confettiPool.points.geometry.dispose();
    (confettiPool.points.material as THREE.Material).dispose();
    for (const m of speedLines) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  const _fwd = new THREE.Vector3();
  const spawnAt = gridStartState(track, identity, 0);
  const camTarget = new THREE.Vector3(spawnAt.x, 1.2, spawnAt.z);
  let baseFov: number | null = null;
  /** the chase camera's OWN smoothed heading — lags the kart's instantaneous yaw at the same rate
   *  the camera's position itself lerps, so during a sharp turn (the hairpin especially) the
   *  "behind the kart" direction and the actual camera position never fall out of step (using the
   *  kart's raw yaw here let the camera swing to the new heading immediately while its position
   *  was still catching up, which could cross it briefly to a side-on view mid-corner) */
  let camYaw: number | null = null;
  let camPlaced = false;

  const interior: Interior & { camera?: (cam: THREE.PerspectiveCamera, dt: number) => void; hideKid?: boolean; actorScale?: number } = {
    scene,
    spawnPoint: new THREE.Vector3(spawnAt.x, 0, spawnAt.z),
    bounds: 9999,
    zones: [],
    hideKid: true,
    update(dt: number) {
      dt = Math.min(dt, 1 / 20);
      if (phase === "countdown") {
        countdownT -= dt;
        const n = Math.min(3, Math.max(0, Math.ceil(countdownT)));
        if (n !== lastCountdownN) {
          lastCountdownN = n;
          onEvent(n > 0 ? { type: "countdown", n } : { type: "go" });
          // the gantry's own lights fill left to right as the countdown ticks down (3 -> one lit,
          // 2 -> two lit, 1 -> all three lit), then every lamp flashes bright green on GO — big
          // and unmissable, not just the HTML HUD's own number
          const litCount = n > 0 ? 4 - n : 3;
          gantryLamps.forEach((lamp, i) => {
            const mat = lamp.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = n === 0 ? 2.4 : i < litCount ? 1.5 : 0.12;
            if (n === 0) mat.emissive.set(0x58e06a);
          });
        }
        for (const r of racers) {
          r.mesh.group.position.set(r.kart.x, 0, r.kart.z);
          r.mesh.group.rotation.y = r.kart.yaw;
        }
        if (countdownT <= 0) phase = "racing";
        return;
      }
      if (phase === "done") {
        // the finish confetti keeps falling and fading over the results screen, even though the
        // race itself has stopped — everything else (karts, HUD) just holds its last frame
        dustPool.update(dt);
        sparkPool.update(dt);
        flamePool.update(dt);
        confettiPool.update(dt);
        return;
      }

      raceClockMs += dt * 1000;
      // remote karts: render ~120 ms behind the network, interpolated smoothly between the two
      // real samples either side of that render time (never extrapolated past the newest sample)
      for (const r of racers) {
        if (r.seat.kind !== "remote" || r.dropped) continue;
        const buf = remoteBuffer.get(r.id);
        if (!buf || buf.length === 0) continue;
        const renderT = raceClockMs - RENDER_DELAY_MS;
        let a = buf[0];
        let b = buf[0];
        for (let i = 0; i < buf.length; i++) {
          if (buf[i].t <= renderT) a = buf[i];
          if (buf[i].t >= renderT) {
            b = buf[i];
            break;
          }
          b = buf[i];
        }
        const span = b.t - a.t || 1;
        const u = Math.max(0, Math.min(1, (renderT - a.t) / span));
        const yaw = lerpAngleKart(a.yaw, b.yaw, u);
        const pose = { x: lerpNum(a.x, b.x, u), z: lerpNum(a.z, b.z, u), yaw, speed: lerpNum(a.speed, b.speed, u), lap: u < 0.5 ? a.lap : b.lap, progress: lerpNum(a.progress, b.progress, u) };
        r.kart = { ...r.kart, x: pose.x, z: pose.z, yaw: pose.yaw, speed: pose.speed, lap: pose.lap, sLocal: pose.progress * track.length, distTotal: (pose.lap - 1) * track.length + pose.progress * track.length };
      }

      for (const r of racers) {
        if (r.dropped) continue;
        const prevLap = r.kart.lap;
        const prevBoostT = r.kart.boostT;
        let visSteer = 0;
        if (r.seat.kind === "human" || r.seat.kind === "ai") {
          const input = cornerAwareInput(r);
          const others = racers.filter((o) => o !== r && !o.dropped && o.seat.kind !== "ghost").map((o) => ({ x: o.kart.x, z: o.kart.z }));
          const tune =
            r.seat.kind === "ai"
              ? { power: aiPower(r.seat.profile, { deltaToKid: r.kart.distTotal - kidRacer.kart.distTotal }) }
              : { power: kidFinishT >= 0 ? 0.6 : 1, assist: opts.autopilot ? 0 : (ctl.assist ?? 1) };
          r.kart = stepKart(r.kart, input, track, dt, others, tune);
          visSteer = r.kart.steer;
          if (r.isKid) {
            if (r.kart.wallHit > 0.25) onEvent({ type: "fx", kind: "wall" });
            if (r.kart.rescued) onEvent({ type: "fx", kind: "rescue" });
          }
          if (r.seat.kind === "human" && r.recorder) {
            r.recorder.push(poseOf(r.kart, track, raceClockMs));
            if (opts.net && raceClockMs - lastSentPoseMs > 1000 / 15) {
              opts.net.send({ type: "pose", raceId: opts.trackId, kidId: r.id, pose: poseOf(r.kart, track, raceClockMs) });
              lastSentPoseMs = raceClockMs;
            }
          }
        } else if (r.seat.kind === "ghost") {
          const lapMs = ghostLapMs(r.seat.ghost) || 1;
          const loop = Math.floor(raceClockMs / lapMs);
          const t = raceClockMs - loop * lapMs;
          const pose = replayAt(r.seat.ghost, t);
          if (pose) {
            r.kart = { ...r.kart, x: pose.x, z: pose.z, yaw: pose.yaw, speed: pose.speed, lap: loop + 1, sLocal: pose.progress * track.length, distTotal: loop * track.length + pose.progress * track.length };
          }
        }
        // (remote karts were already updated above, interpolated from remoteBuffer)
        updateKartProgress(raceState, r.id, r.kart.distTotal, r.kart.lap, raceClockMs);
        if (r.kart.lap > prevLap && r.isKid) {
          const k = raceState.karts[r.id];
          const lapMs = k.lastLapMs ?? 0;
          const isBest = k.bestLapMs === lapMs;
          let ghost: GhostLap | undefined;
          if (r.recorder) {
            const lapSamples = r.recorder.samples.slice(r.lapSampleStart).map((s) => ({ ...s, t: s.t - (r.recorder!.samples[r.lapSampleStart]?.t ?? 0) }));
            r.lapSampleStart = r.recorder.samples.length;
            if (isBest) ghost = { kidId: r.meta.kidId, name: r.meta.name, animal: r.meta.animal, colour: r.meta.colour, trackId: opts.trackId, lapMs, samples: lapSamples };
          }
          onEvent({ type: "lap", lapMs, isBest, ghost });
        }
        r.mesh.group.position.set(r.kart.x, 0, r.kart.z);
        r.mesh.group.rotation.y = r.kart.yaw;
        r.mesh.chibi.update(dt, r.kart.speed);

        // ── the kart's own "feel": wheels that steer and roll, a driver that leans into turns,
        // dust off the road, sparks off a wall, and a flame while boosting ──
        const steerAngle = visSteer * 0.32;
        r.mesh.frontL.rotation.y = steerAngle;
        r.mesh.frontR.rotation.y = steerAngle;
        const spin = (r.kart.speed * dt) / 0.36;
        for (const w of r.mesh.wheelMeshes) w.rotation.x += spin;
        r.mesh.lean = lerpNum(r.mesh.lean, -visSteer * Math.min(1, r.kart.speed / 10) * 0.22, Math.min(1, dt * 6));
        r.mesh.chibi.root.rotation.z = r.mesh.lean;

        const fwd = _fwd.set(Math.sin(r.kart.yaw), 0, Math.cos(r.kart.yaw));
        if (r.kart.offTrack && r.kart.speed > 1.5) {
          // off the road: a puff of dust behind the kart
          dustPool.spawn(r.kart.x - fwd.x * 0.9, 0.15, r.kart.z - fwd.z * 0.9, (Math.random() - 0.5) * 2, 1.4 + Math.random(), (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.3, DUST_COLOR);
        } else if (r.kart.slide > 0.35 && Math.random() < r.kart.slide) {
          // sliding through a corner: tyre smoke off the back wheels
          dustPool.spawn(r.kart.x - fwd.x * 1.1, 0.12, r.kart.z - fwd.z * 1.1, (Math.random() - 0.5) * 1.2, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.2, SMOKE_COLOR);
        }
        if (r.kart.wallHit > 0.05) {
          // touching the tyre wall: sparks (more the harder the hit)
          const n = 1 + Math.round(r.kart.wallHit * 5);
          for (let i = 0; i < n; i++) sparkPool.spawn(r.kart.x, 0.3, r.kart.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6, 0.25 + Math.random() * 0.15, SPARK_COLOR);
        }
        if (r.kart.rescued) for (let i = 0; i < 14; i++) dustPool.spawn(r.kart.x, 0.4, r.kart.z, (Math.random() - 0.5) * 5, 1 + Math.random() * 2, (Math.random() - 0.5) * 5, 0.5, SMOKE_COLOR);
        if (r.kart.boostT > 0) {
          const exhaustWorld = r.mesh.group.localToWorld(r.mesh.exhaustLocal.clone());
          for (let i = 0; i < 2; i++) flamePool.spawn(exhaustWorld.x - fwd.x * 0.2, exhaustWorld.y, exhaustWorld.z - fwd.z * 0.2, -fwd.x * (2 + Math.random() * 2), 0.6 + Math.random(), -fwd.z * (2 + Math.random() * 2), 0.3 + Math.random() * 0.2, i % 2 ? FLAME_COLOR_A : FLAME_COLOR_B);
        }
        if (r.isKid && prevBoostT <= 0 && r.kart.boostT > 0) {
          kidBoostKick = 1;
          onEvent({ type: "fx", kind: "boost" });
        }
      }

      camTarget.set(kidRacer.kart.x, 0, kidRacer.kart.z);
      dustPool.update(dt);
      sparkPool.update(dt);
      flamePool.update(dt);
      confettiPool.update(dt);

      if (raceClockMs - lastHudMs > 90) {
        lastHudMs = raceClockMs;
        const k = raceState.karts[kidRacer.id];
        const position = positionOf(raceState, kidRacer.id);
        if (lastKidPosition && position !== lastKidPosition && kidFinishT < 0) onEvent({ type: "fx", kind: position < lastKidPosition ? "overtake" : "overtaken" });
        lastKidPosition = position;
        if (!finalLapSaid && k.lap === laps && laps > 1) {
          finalLapSaid = true;
          onEvent({ type: "fx", kind: "finalLap" });
        }
        onEvent({
          type: "hud",
          lap: Math.min(k.lap, laps),
          laps,
          position,
          total: racers.length,
          lapMs: raceClockMs - k.lapStartMs,
          bestLapMs: k.bestLapMs,
          offTrack: kidRacer.kart.offTrack,
          speed: Math.round(Math.max(0, kidRacer.kart.speed) * 2.4),
          boost: kidRacer.kart.boostT > 0,
          wrongWay: isWrongWay(kidRacer.kart),
          dots: racers.filter((r) => !r.dropped).map((r) => ({ id: r.id, u: kartProgress(track, r.kart), me: r.isKid, colour: r.meta.colour })),
        });
      }

      // the kid's over the line: confetti, a few seconds rolling on, then the results
      if (kidFinishT < 0 && (raceState.karts[kidRacer.id]?.finished || isRaceOver(raceState))) kidFinishT = 0;
      if (kidFinishT >= 0) kidFinishT += dt;
      if (kidFinishT >= 0 && !confettiFired) {
        confettiFired = true;
        const at = trackAt(track, 0);
        for (let i = 0; i < 140; i++) {
          const spread = (Math.random() - 0.5) * track.width * 0.8;
          confettiPool.spawn(at.x + at.dz * spread, 2.5 + Math.random() * 2, at.z - at.dx * spread, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4, 1.4 + Math.random() * 0.8, CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
        }
      }
      if (kidFinishT > 2.6) {
        phase = "done";
        if (!confettiFired) {
          confettiFired = true;
          const at = trackAt(track, 0);
          for (let i = 0; i < 140; i++) {
            const spread = (Math.random() - 0.5) * track.width * 0.8;
            confettiPool.spawn(
              at.x + at.dz * spread,
              2.5 + Math.random() * 2,
              at.z - at.dx * spread,
              (Math.random() - 0.5) * 4,
              3 + Math.random() * 4,
              (Math.random() - 0.5) * 4,
              1.4 + Math.random() * 0.8,
              CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            );
          }
        }
        const results = raceResults(raceState).map((res) => {
          const r = racers.find((x) => x.id === res.id)!;
          return { ...res, racer: r.meta, kind: r.seat.kind };
        });
        if (opts.net) {
          const k = raceState.karts[kidRacer.id];
          opts.net.send({ type: "finish", raceId: opts.trackId, kidId: kidRacer.id, totalMs: k.finishMs ?? raceClockMs, bestLapMs: k.bestLapMs ?? 0 });
        }
        onEvent({ type: "finish", results });
      }
    },
    camera(cam: THREE.PerspectiveCamera, dt: number) {
      if (baseFov === null) baseFov = cam.fov;
      if (camYaw === null) camYaw = kidRacer.kart.yaw;
      camYaw = lerpAngleKart(camYaw, kidRacer.kart.yaw, Math.min(1, dt * 4.2));
      const yaw = camYaw;
      // behind and a little above the kart: close enough to feel fast, high enough that a small
      // kid can see the bend coming
      const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(7.4);
      const desired = new THREE.Vector3(camTarget.x + back.x, 3.3, camTarget.z + back.z);
      if (!camPlaced) {
        // (the first frame: start right behind the kart, never swooping in from wherever the park's
        // own camera happened to be)
        camPlaced = true;
        cam.position.copy(desired);
      } else cam.position.lerp(desired, Math.min(1, dt * 6));
      const lookAt = new THREE.Vector3(camTarget.x + Math.sin(yaw) * 7, 0.7, camTarget.z + Math.cos(yaw) * 7);
      cam.lookAt(lookAt);
      // bank into the turn with the kart, and zoom in a touch with speed/on a boost
      cam.rotateZ(kidRacer.mesh.lean * 0.35);
      kidBoostKick = lerpNum(kidBoostKick, 0, Math.min(1, dt * 2.2));
      const speedFrac = Math.max(0, Math.min(1, kidRacer.kart.speed / MAX_SPEED));
      cam.fov = lerpNum(cam.fov, baseFov + speedFrac * 4 + kidBoostKick * 8, Math.min(1, dt * 5));
      cam.updateProjectionMatrix();

      // speed lines: a few streaks flashing past the screen's edges, off the camera's own basis
      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      cam.matrixWorld.extractBasis(xAxis, yAxis, zAxis);
      const forward = zAxis.clone().negate();
      const linesK = Math.max(speedFrac > 0.55 ? (speedFrac - 0.55) / 0.45 : 0, kidBoostKick);
      speedLines.forEach((m, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const ox = side * (0.62 + row * 0.16);
        const oy = -0.18 + row * 0.12;
        m.position.copy(cam.position).addScaledVector(forward, 1.1).addScaledVector(xAxis, ox).addScaledVector(yAxis, oy);
        m.quaternion.copy(cam.quaternion);
        (m.material as THREE.MeshBasicMaterial).opacity = linesK * (0.25 + 0.5 * ((i * 37) % 7) / 7);
      });
    },
    dispose,
  };
  return interior;
}
