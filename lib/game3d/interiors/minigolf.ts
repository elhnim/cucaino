import * as THREE from "three";
import { getToonRamp } from "../../park/assets/loader";
import { makeSparkleTexture } from "../textures";
import { COURSE, type HoleDef, type Vec2, type Zone } from "../minigolf/courses";
import { BALL_R, CUP_R, maxStrokes, moverOffset, predictPath, scoreName, shoot, speed, stepBall, type BallState } from "../minigolf/physics";
import type { Interior } from "./types";

export type GolfEvent =
  | { type: "hole-start"; hole: number; of: number; name: string; par: number; tip: string | null }
  | { type: "stroke"; hole: number; strokes: number }
  | { type: "splash"; hole: number; strokes: number }
  | { type: "fx"; kind: "boost" | "portal" | "bounce" }
  | { type: "sunk"; hole: number; strokes: number; par: number; label: string }
  | { type: "picked-up"; hole: number; strokes: number }
  | { type: "course-done"; total: number; par: number; scores: number[] };

export interface GolfControls {
  restart?: () => void;
  /** pick the ball up and move to the next hole */
  skip?: () => void;
}

export interface GolfOptions {
  /** first hole index (0-based) and how many holes to play: front 9 = {from: 0, count: 9} */
  from?: number;
  count?: number;
}

const FLOOR_Y = 0;
const AIM_MAX_DRAG = 3.4;
/** the golfer is kid-sized next to the ball */
const ACTOR_SCALE = 0.52;

// candy palette
const FELT = ["#6fe29a", "#62d98f", "#7eeaa6"];
const CAKE = "#ffd6ea";

function tipFor(h: HoleDef): string | null {
  if (h.portals?.length) return "🌀 Roll into a portal and pop out somewhere else!";
  if (h.water?.length) return "💧 Splash in the water = +1 stroke, so steer clear!";
  if (h.boosts?.length) return "⚡ Zoom pads fire your ball forward!";
  if (h.slopes?.length) return "⛰️ Hills roll slow balls back, so hit harder uphill!";
  if (h.ice?.length) return "🧊 Ice is slippery: tap it gently!";
  if (h.movers?.length) return "🚪 Wait for a gap in the sliding doors!";
  if (h.blades?.length) return "🌬️ Time your putt between the windmill blades!";
  if (h.sand?.length) return "🏖️ Sand slows your ball right down!";
  if (h.walls?.length) return "↩️ Bounce off the walls to get round!";
  return null;
}

/**
 * Cucaino Candy Golf: 18 candy holes with windmills, bumpers, sand, ice, water, hills, zoom
 * pads, portals and sliding doors. Drag anywhere to pull back and aim (like a slingshot) —
 * the dotted guide shows where the ball will roll — and let go to putt. The kid's animal
 * stands side-on to the ball with a putter, like a real golfer, and their pet cheers.
 */
export function buildMiniGolfInterior(accent: string, onEvent: (e: GolfEvent) => void, controls: GolfControls = {}, opts: GolfOptions = {}): Interior & {
  camera: (cam: THREE.PerspectiveCamera, dt: number) => void;
  actorScale: number;
} {
  const first = Math.max(0, Math.min(COURSE.length - 1, opts.from ?? 0));
  const count = Math.max(1, Math.min(COURSE.length - first, opts.count ?? COURSE.length));
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(r: T) => (disposables.push(r), r);
  const matCache = new Map<string, THREE.Material>();
  const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) => {
    const key = color + JSON.stringify(extra);
    let m = matCache.get(key);
    if (!m) {
      m = track(new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp(), ...extra }));
      matCache.set(key, m);
    }
    return m;
  };

  // ── candy sky + meadow ──
  scene.background = new THREE.Color("#ffe3f1");
  scene.fog = new THREE.Fog("#ffe3f1", 30, 70);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffc4e1, 1.25));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.4);
  sun.position.set(6, 14, 8);
  scene.add(sun, sun.target);
  track(sun);
  const meadow = new THREE.Mesh(track(new THREE.CircleGeometry(60, 40)), toon("#a6e8bd"));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = FLOOR_Y - 0.3;
  scene.add(meadow);

  // soft round lollipop trees + gumdrops around the green (repositioned each hole)
  const decor = new THREE.Group();
  scene.add(decor);
  const stickGeo = track(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6));
  const popGeo = track(new THREE.SphereGeometry(0.7, 14, 10));
  const dropGeo = track(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const popColors = ["#ff7fbd", "#8fd3ff", "#ffd36b", "#b99bff", "#7ee8a8"];
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    if (i % 2) {
      const stick = new THREE.Mesh(stickGeo, toon("#ffffff"));
      stick.position.y = 0.5;
      const pop = new THREE.Mesh(popGeo, toon(popColors[i % popColors.length]));
      pop.position.y = 1.5;
      g.add(stick, pop);
    } else {
      const drop = new THREE.Mesh(dropGeo, toon(popColors[(i + 2) % popColors.length]));
      g.add(drop);
    }
    decor.add(g);
  }

  // ── shared props ──
  const sparkTex = track(makeSparkleTexture());
  const chevronTex = track(makeChevronTexture());
  const swirlTex = track(makeSwirlTexture());

  // ball, putter, aim guide
  const ballMesh = new THREE.Mesh(track(new THREE.SphereGeometry(BALL_R, 18, 14)), toon("#ffffff"));
  scene.add(ballMesh);
  const ballShadow = new THREE.Mesh(track(new THREE.CircleGeometry(BALL_R * 1.1, 16)), track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })));
  ballShadow.rotation.x = -Math.PI / 2;
  scene.add(ballShadow);

  const putter = new THREE.Group(); // pivots at the golfer's hands
  const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1, 6)), toon("#fff6fb"));
  shaft.position.y = -0.5;
  const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.12, 0.1)), toon(accent));
  head.position.y = -1;
  putter.add(shaft, head);
  scene.add(putter);

  const aim = new THREE.Group();
  const dotGeo = track(new THREE.SphereGeometry(0.06, 8, 6));
  const dotMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 40; i++) {
    const d = new THREE.Mesh(dotGeo, dotMat);
    aim.add(d);
    dots.push(d);
  }
  const arrow = new THREE.Mesh(track(new THREE.ConeGeometry(0.15, 0.34, 10)), track(new THREE.MeshBasicMaterial({ color: 0xffd447 })));
  aim.add(arrow);
  aim.visible = false;
  scene.add(aim);

  const sparkMat = track(new THREE.SpriteMaterial({ map: sparkTex, color: 0xfff1b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const splashMat = track(new THREE.SpriteMaterial({ map: sparkTex, color: 0x8fd3ff, transparent: true, depthWrite: false }));
  const sparks: THREE.Sprite[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(sparkMat);
    s.visible = false;
    scene.add(s);
    sparks.push(s);
  }
  let sparkT = -1;
  let sparkAt = new THREE.Vector3();
  const burst = (at: THREE.Vector3, water = false) => {
    sparkT = 0;
    sparkAt = at.clone();
    sparks.forEach((s) => (s.material = water ? splashMat : sparkMat));
  };

  // ── the current hole (built when it starts, thrown away when you move on) ──
  interface HoleView {
    def: HoleDef;
    group: THREE.Group;
    geos: THREE.BufferGeometry[];
    blades: THREE.Group[];
    movers: THREE.Mesh[];
    bumpers: THREE.Mesh[];
    portals: THREE.Group[];
    boosts: THREE.Mesh[];
    water: THREE.Mesh[];
    flag: THREE.Mesh;
    sprites: THREE.Sprite[];
  }
  let view: HoleView | null = null;

  function zoneMesh(z: Zone, y: number, mat: THREE.Material, geos: THREE.BufferGeometry[]) {
    let geo: THREE.BufferGeometry;
    let m: THREE.Mesh;
    if ("r" in z) {
      geo = new THREE.CircleGeometry(z.r, 28);
      m = new THREE.Mesh(geo, mat);
      m.position.set(z.at.x, y, z.at.z);
    } else {
      geo = new THREE.PlaneGeometry(z.max.x - z.min.x, z.max.z - z.min.z);
      m = new THREE.Mesh(geo, mat);
      m.position.set((z.min.x + z.max.x) / 2, y, (z.min.z + z.max.z) / 2);
    }
    geos.push(geo);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function wallRun(g: THREE.Group, a: Vec2, b: Vec2, color: string, geos: THREE.BufferGeometry[]) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = -Math.atan2(b.z - a.z, b.x - a.x);
    const bodyGeo = new THREE.BoxGeometry(len + 0.2, 0.3, 0.2);
    const capGeo = new THREE.BoxGeometry(len + 0.26, 0.08, 0.26);
    geos.push(bodyGeo, capGeo);
    const body = new THREE.Mesh(bodyGeo, toon("#ffffff"));
    body.position.set((a.x + b.x) / 2, 0.15, (a.z + b.z) / 2);
    body.rotation.y = ang;
    const cap = new THREE.Mesh(capGeo, toon(color));
    cap.position.copy(body.position).setY(0.33);
    cap.rotation.y = ang;
    g.add(body, cap);
  }

  // the greens: real putting-green felt (public/park-assets/golf/felt.webp), tinted a shade
  // lighter or deeper from hole to hole; one tile is two and a half units of green
  const feltTex = typeof document === "undefined" ? null : track(new THREE.TextureLoader().load("/park-assets/golf/felt.webp"));
  if (feltTex) {
    feltTex.colorSpace = THREE.SRGBColorSpace;
    feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
    feltTex.repeat.set(0.4, 0.4);
    feltTex.anisotropy = 4;
  }
  const feltMats = ["#ffffff", "#eaffe6", "#f4fff0"].map((tint, i) => track(new THREE.MeshToonMaterial({ color: feltTex ? tint : FELT[i], map: feltTex ?? undefined, gradientMap: getToonRamp() })));
  const feltMat = (n: number) => feltMats[n % feltMats.length];

  function buildHole(def: HoleDef, n: number): HoleView {
    const g = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    const sprites: THREE.Sprite[] = [];
    scene.add(g);

    // green on a slab of pink sponge cake
    const shape = new THREE.Shape(def.outline.map((p) => new THREE.Vector2(p.x, -p.z)));
    const greenGeo = new THREE.ShapeGeometry(shape);
    const cakeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geos.push(greenGeo, cakeGeo);
    const green = new THREE.Mesh(greenGeo, feltMat(n));
    green.rotation.x = -Math.PI / 2;
    green.position.y = 0.005;
    const cake = new THREE.Mesh(cakeGeo, toon(CAKE));
    cake.rotation.x = -Math.PI / 2;
    cake.position.y = -0.3;
    g.add(cake, green);

    for (const [a, b] of def.outline.map((p, k) => [p, def.outline[(k + 1) % def.outline.length]] as const)) wallRun(g, a, b, def.color, geos);
    for (const line of def.walls ?? []) for (let k = 0; k + 1 < line.length; k++) wallRun(g, line[k], line[k + 1], def.color, geos);

    for (const z of def.sand ?? []) g.add(zoneMesh(z, 0.012, toon("#ffe29a"), geos));
    for (const z of def.ice ?? []) g.add(zoneMesh(z, 0.012, toon("#dff6ff", { transparent: true, opacity: 0.9 }), geos));
    const water: THREE.Mesh[] = [];
    for (const z of def.water ?? []) {
      const m = zoneMesh(z, 0.014, toon("#5cc8ff", { transparent: true, opacity: 0.92 }), geos);
      g.add(m);
      water.push(m);
    }
    for (const sl of def.slopes ?? []) {
      const tex = chevronTex.clone();
      track(tex);
      const m = zoneMesh(sl.zone, 0.016, track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false })), geos);
      // chevrons point downhill (the way the hill pushes)
      m.rotation.z = Math.atan2(sl.push.x, -sl.push.z);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.5, 1.5);
      g.add(m);
    }

    const bumpers: THREE.Mesh[] = [];
    for (const bp of def.bumpers ?? []) {
      const geo = new THREE.CylinderGeometry(bp.r, bp.r * 1.08, 0.42, 18);
      geos.push(geo);
      const m = new THREE.Mesh(geo, toon(bumpers.length % 2 ? "#ff7fbd" : "#ffb347"));
      m.position.set(bp.at.x, 0.21, bp.at.z);
      g.add(m);
      bumpers.push(m);
    }

    const blades: THREE.Group[] = [];
    for (const bl of def.blades ?? []) {
      const hubGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 12);
      geos.push(hubGeo);
      const hub = new THREE.Mesh(hubGeo, toon("#ffffff"));
      hub.position.set(bl.at.x, 0.25, bl.at.z);
      g.add(hub);
      const rotor = new THREE.Group();
      rotor.position.set(bl.at.x, 0.18, bl.at.z);
      for (const [k, off] of [0, Math.PI / 2].entries()) {
        const geo = new THREE.BoxGeometry(bl.length, 0.22, 0.14);
        geos.push(geo);
        const blade = new THREE.Mesh(geo, toon(k ? "#ff5fa8" : "#ffffff"));
        blade.rotation.y = -off;
        rotor.add(blade);
      }
      g.add(rotor);
      blades.push(rotor);
    }

    const movers: THREE.Mesh[] = [];
    for (const mv of def.movers ?? []) {
      const geo = new THREE.BoxGeometry(mv.size.x, 0.4, mv.size.z);
      geos.push(geo);
      const m = new THREE.Mesh(geo, toon("#b99bff"));
      m.position.set(mv.at.x, 0.2, mv.at.z);
      g.add(m);
      movers.push(m);
    }

    const boosts: THREE.Mesh[] = [];
    for (const bp of def.boosts ?? []) {
      const geo = new THREE.CircleGeometry(bp.r, 24);
      geos.push(geo);
      const glow = new THREE.Mesh(geo, toon("#ffb347"));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(bp.at.x, 0.015, bp.at.z);
      g.add(glow);
      const tex = chevronTex.clone();
      track(tex);
      const m = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false })));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.atan2(bp.dir.x, -bp.dir.z);
      m.position.set(bp.at.x, 0.018, bp.at.z);
      g.add(m);
      boosts.push(m);
    }

    const portals: THREE.Group[] = [];
    const portalColors = ["#a96bff", "#36b8ff", "#ff5fa8"];
    (def.portals ?? []).forEach((pt, i) => {
      for (const [end, at] of [
        ["from", pt.from],
        ["to", pt.to],
      ] as const) {
        const pg = new THREE.Group();
        pg.position.set(at.x, 0, at.z);
        const ringGeo = new THREE.TorusGeometry(pt.r, 0.07, 8, 28);
        const discGeo = new THREE.CircleGeometry(pt.r * 0.96, 28);
        geos.push(ringGeo, discGeo);
        const ring = new THREE.Mesh(ringGeo, toon(portalColors[i % portalColors.length]));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        const disc = new THREE.Mesh(discGeo, track(new THREE.MeshBasicMaterial({ map: swirlTex, color: portalColors[i % portalColors.length], transparent: true, opacity: end === "from" ? 0.95 : 0.45, depthWrite: false })));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.02;
        pg.add(ring, disc);
        g.add(pg);
        portals.push(pg);
      }
    });

    // cup + flag with the hole number
    const cupGeo = new THREE.CircleGeometry(CUP_R, 24);
    const rimGeo = new THREE.RingGeometry(CUP_R, CUP_R + 0.05, 24);
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
    const flagGeo = new THREE.PlaneGeometry(0.62, 0.42, 4, 1);
    geos.push(cupGeo, rimGeo, poleGeo, flagGeo);
    const cup = new THREE.Mesh(cupGeo, track(new THREE.MeshBasicMaterial({ color: 0x3a2233 })));
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(def.cup.x, 0.02, def.cup.z);
    const rim = new THREE.Mesh(rimGeo, toon("#ffffff"));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(def.cup.x, 0.021, def.cup.z);
    const pole = new THREE.Mesh(poleGeo, toon("#ffffff"));
    pole.position.set(def.cup.x, 0.75, def.cup.z);
    const flagTex = track(makeFlagTexture(String(n + 1), def.color));
    const flag = new THREE.Mesh(flagGeo, track(new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })));
    flag.position.set(def.cup.x + 0.32, 1.28, def.cup.z);
    g.add(cup, rim, pole, flag);

    // name board behind the far end of the green
    const farZ = Math.min(...def.outline.map((p) => p.z));
    const sign = makeLabel(`⛳ Hole ${n + 1} · ${def.name} · Par ${def.par}`, def.color);
    track(sign.material);
    if (sign.material.map) track(sign.material.map);
    sign.position.set((Math.min(...def.outline.map((p) => p.x)) + Math.max(...def.outline.map((p) => p.x))) / 2, 1.6, farZ - 1.2);
    g.add(sign);
    sprites.push(sign);

    // scatter the candy decor around this green
    const xs = def.outline.map((p) => p.x);
    const zs = def.outline.map((p) => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 2.4;
    const rz = (Math.max(...zs) - Math.min(...zs)) / 2 + 2.4;
    decor.children.forEach((d, i) => {
      const a = (i / decor.children.length) * Math.PI * 2 + n;
      const wob = 1 + ((i * 37 + n * 11) % 10) / 14;
      d.position.set(cx + Math.cos(a) * rx * wob, FLOOR_Y - 0.3, cz + Math.sin(a) * rz * wob);
      d.scale.setScalar(0.8 + ((i * 13) % 5) / 8);
    });
    meadow.position.x = cx;
    meadow.position.z = cz;

    return { def, group: g, geos, blades, movers, bumpers, portals, boosts, water, flag, sprites };
  }

  function dropHole(v: HoleView) {
    scene.remove(v.group);
    for (const geo of v.geos) geo.dispose();
  }

  // ── game state ──
  let holeIdx = first;
  let strokes = 0;
  const scores: number[] = [];
  const ball: BallState = { x: 0, z: 0, vx: 0, vz: 0 };
  let lastRest: Vec2 = { x: 0, z: 0 };
  let courseT = 0;
  let aiming = false;
  let aimStart: THREE.Vector3 | null = null;
  const aimVec = new THREE.Vector2();
  let swingT = -1; // >= 0 while the putter swings through
  let swingPower = 0;
  let sinkT = -1;
  let splashT = -1;
  let doneT = -1;
  let lastAimKey = "";
  let bumpFlash = 0;
  const golferPos = new THREE.Vector3();
  const petSpot = new THREE.Vector3();
  const address = new THREE.Vector2(); // where the ball sat when the golfer lined up
  let golferFacing = Math.PI;
  const shotDir = new THREE.Vector2(0, -1);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);

  const def = () => COURSE[holeIdx];
  const ballWorld = () => new THREE.Vector3(ball.x, FLOOR_Y + BALL_R, ball.z);

  function placeGolfer() {
    // stand side-on to the line of the putt (a right-handed golfer: target on their left)
    const d = def();
    let dx = d.cup.x - ball.x;
    let dz = d.cup.z - ball.z;
    if (aiming && aimVec.lengthSq() > 0.01) {
      dx = aimVec.x;
      dz = aimVec.y;
    } else if (strokes > 0 && shotDir.lengthSq() > 0) {
      dx = shotDir.x;
      dz = shotDir.y;
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // facing the ball: forward = (-dz, dx), so the target (dx, dz) is to the golfer's left
    const reach = 0.62;
    address.set(ball.x, ball.z);
    golferPos.set(ball.x + dz * reach, FLOOR_Y, ball.z - dx * reach);
    golferFacing = Math.atan2(-dz, dx);
    shotDir.set(dx, dz);
  }

  function updatePutter(dt: number) {
    // hands just in front of the golfer's belly; the head rests behind the ball
    const fx = -shotDir.y;
    const fz = shotDir.x;
    const hands = new THREE.Vector3(golferPos.x + fx * 0.26, FLOOR_Y + 0.62, golferPos.z + fz * 0.26);
    putter.position.copy(hands);
    const toBall = new THREE.Vector3(address.x - shotDir.x * 0.16, FLOOR_Y + 0.06, address.y - shotDir.y * 0.16).sub(hands);
    const len = toBall.length();
    shaft.scale.y = len;
    shaft.position.y = -len / 2;
    head.position.y = -len;
    // point the club at the ball, then swing it back/through along the putt line
    let swing = 0;
    if (aiming) swing = -Math.min(1, aimVec.length() / AIM_MAX_DRAG) * 0.9;
    else if (swingT >= 0) {
      swingT += dt;
      const t = swingT / 0.18;
      swing = t < 1 ? -swingPower * 0.9 * (1 - t) + t * 0.5 * swingPower : Math.max(0, 0.5 * swingPower * (1 - (t - 1) * 0.5));
      if (t > 3) swingT = -1;
    }
    const down = toBall.clone().normalize();
    putter.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
    const axis = new THREE.Vector3(fx, 0, fz); // swinging about the golfer's forward axis moves the head along the line
    putter.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, -swing));
    head.rotation.y = -Math.atan2(shotDir.y, shotDir.x);
    putter.visible = sinkT < 0 && doneT < 0;
  }

  function startHole(i: number) {
    if (view) dropHole(view);
    holeIdx = i;
    strokes = 0;
    const d = def();
    view = buildHole(d, i);
    ball.x = d.tee.x;
    ball.z = d.tee.z;
    ball.vx = ball.vz = 0;
    ball.inPortal = undefined;
    lastRest = { ...d.tee };
    sinkT = -1;
    splashT = -1;
    shotDir.set(0, 0);
    placeGolfer();
    onEvent({ type: "hole-start", hole: i + 1, of: first + count, name: d.name, par: d.par, tip: tipFor(d) });
  }

  function nextHole() {
    if (holeIdx + 1 < first + count) startHole(holeIdx + 1);
    else {
      sinkT = -1;
      doneT = 0;
      onEvent({
        type: "course-done",
        total: scores.reduce((a, c) => a + c, 0),
        par: COURSE.slice(first, first + count).reduce((a, h) => a + h.par, 0),
        scores: [...scores],
      });
    }
  }

  function pickUp() {
    const s = maxStrokes(def().par);
    scores.push(s);
    onEvent({ type: "picked-up", hole: holeIdx + 1, strokes: s });
    nextHole();
  }

  controls.restart = () => {
    scores.length = 0;
    doneT = -1;
    startHole(first);
  };
  controls.skip = () => {
    if (doneT >= 0 || sinkT >= 0) return;
    aiming = false;
    pickUp();
  };
  startHole(first);

  // ── camera: behind the tee end, high enough to see the whole hole on a phone ──
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;
  function camera(cam: THREE.PerspectiveCamera, dt: number) {
    const d = def();
    const xs = d.outline.map((p) => p.x);
    const zs = d.outline.map((p) => p.z);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const portrait = cam.aspect < 0.85;
    // look between the ball and the cup (more towards the ball when it's far from the cup)
    const b = ballWorld();
    const c = new THREE.Vector3(d.cup.x, 0, d.cup.z);
    const look = b.clone().lerp(c, 0.3);
    const fitW = portrait ? spanX / Math.max(0.45, cam.aspect) : spanX;
    const dist = Math.max(9.5, Math.min(24, Math.max(spanZ * 0.95, fitW * 1.15)));
    const want = new THREE.Vector3(look.x, dist * 0.95, look.z + dist * 0.62);
    if (!camInit) {
      camPos.copy(want);
      camLook.copy(look);
      camInit = true;
    }
    const k = Math.min(1, dt * 2.5);
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    cam.position.copy(camPos);
    cam.lookAt(camLook);
  }

  return {
    scene,
    spawnPoint: new THREE.Vector3(COURSE[first].tee.x + 0.6, 0, COURSE[first].tee.z),
    bounds: 1000,
    zones: [],
    actorScale: ACTOR_SCALE,
    camera,
    playerAnchor() {
      return { position: golferPos, facing: golferFacing };
    },
    petAnchor() {
      // behind the golfer, well off the line of the putt
      const fx = -shotDir.y;
      const fz = shotDir.x;
      return petSpot.set(golferPos.x - fx * 0.7 - shotDir.x * 0.5, FLOOR_Y, golferPos.z - fz * 0.7 - shotDir.y * 0.5);
    },
    pointer(kind, ray) {
      const hit = new THREE.Vector3();
      if (!ray.intersectPlane(plane, hit)) return;
      const ready = speed(ball) === 0 && sinkT < 0 && splashT < 0 && doneT < 0 && swingT < 0;
      if (kind === "down" && ready) {
        aiming = true;
        aimStart = hit.clone();
        aimVec.set(0, 0);
      } else if (kind === "move" && aiming && aimStart) {
        // slingshot: drag back, the ball goes the opposite way
        aimVec.set(aimStart.x - hit.x, aimStart.z - hit.z);
        if (aimVec.length() > AIM_MAX_DRAG) aimVec.setLength(AIM_MAX_DRAG);
        placeGolfer();
      } else if (kind === "up" && aiming) {
        aiming = false;
        const power = aimVec.length() / AIM_MAX_DRAG;
        if (power > 0.05) {
          lastRest = { x: ball.x, z: ball.z };
          shotDir.set(aimVec.x, aimVec.y).normalize();
          shoot(ball, aimVec.x, aimVec.y, power);
          strokes++;
          swingT = 0;
          swingPower = power;
          onEvent({ type: "stroke", hole: holeIdx + 1, strokes });
        } else placeGolfer();
        aimVec.set(0, 0);
      }
    },
    update(dt) {
      courseT += dt;
      const v = view!;
      const d = v.def;
      (d.blades ?? []).forEach((bl, bi) => (v.blades[bi].rotation.y = -(courseT * bl.speed)));
      (d.movers ?? []).forEach((mv, mi) => {
        const at = moverOffset(mv, courseT);
        v.movers[mi].position.set(at.x, 0.2, at.z);
      });
      v.portals.forEach((p, i) => (p.children[1].rotation.z = courseT * (i % 2 ? -2.2 : 2.2)));
      v.boosts.forEach((b) => {
        const m = b.material as THREE.MeshBasicMaterial;
        m.opacity = 0.65 + Math.sin(courseT * 6) * 0.3;
        if (m.map) m.map.offset.y = -courseT * 1.2;
      });
      v.water.forEach((w, i) => ((w.material as THREE.MeshToonMaterial).opacity = 0.85 + Math.sin(courseT * 2 + i) * 0.07));
      v.flag.rotation.y = Math.sin(courseT * 3) * 0.3;
      bumpFlash = Math.max(0, bumpFlash - dt * 4);
      v.bumpers.forEach((b, i) => b.scale.set(1 + bumpFlash * 0.15, 1 - bumpFlash * 0.12, 1 + bumpFlash * 0.15).multiplyScalar(1 + Math.max(0, Math.sin(courseT * 4 + i)) * 0.03));

      if (sinkT < 0 && splashT < 0 && doneT < 0) {
        const wasMoving = speed(ball) > 0;
        const r = stepBall(ball, d, dt, courseT);
        if (r.hit) {
          bumpFlash = 1;
          onEvent({ type: "fx", kind: "bounce" });
        }
        if (r.boosted) onEvent({ type: "fx", kind: "boost" });
        if (r.teleported) {
          burst(ballWorld());
          onEvent({ type: "fx", kind: "portal" });
        }
        if (r.sunk) {
          sinkT = 0;
          scores.push(strokes);
          burst(new THREE.Vector3(d.cup.x, 0, d.cup.z));
          onEvent({ type: "sunk", hole: holeIdx + 1, strokes, par: d.par, label: scoreName(strokes, d.par) });
        } else if (r.splash) {
          splashT = 0;
          strokes++; // penalty stroke
          burst(ballWorld(), true);
          onEvent({ type: "splash", hole: holeIdx + 1, strokes });
        } else if (wasMoving && !r.moving) {
          if (strokes >= maxStrokes(d.par)) pickUp();
          else placeGolfer();
        } else if (!r.moving && !aiming && swingT < 0) placeGolfer();
      }

      const b = ballWorld();
      ballMesh.position.copy(b);
      ballShadow.position.set(b.x + 0.05, FLOOR_Y + 0.02, b.z + 0.05);
      ballShadow.visible = sinkT < 0;
      if (sinkT >= 0) {
        sinkT += dt;
        ballMesh.position.y = FLOOR_Y + BALL_R - Math.min(1, sinkT * 3) * 0.45;
        if (sinkT > 1.7) {
          sinkT = -1;
          nextHole();
        }
      } else if (splashT >= 0) {
        splashT += dt;
        ballMesh.position.y = FLOOR_Y + BALL_R - Math.min(1, splashT * 4) * 0.4;
        if (splashT > 1.1) {
          // back to where it was hit from
          splashT = -1;
          ball.x = lastRest.x;
          ball.z = lastRest.z;
          ball.vx = ball.vz = 0;
          if (strokes >= maxStrokes(d.par)) pickUp();
          else placeGolfer();
        }
      } else {
        const sp = speed(ball);
        if (sp > 0) {
          const axis = new THREE.Vector3(ball.vz, 0, -ball.vx).normalize();
          ballMesh.rotateOnWorldAxis(axis, (sp * dt) / BALL_R);
        }
      }

      if (sparkT >= 0) {
        sparkT += dt;
        sparks.forEach((s, i) => {
          const a = (i / sparks.length) * Math.PI * 2;
          const r = sparkT * 2;
          s.visible = sparkT < 1;
          s.position.set(sparkAt.x + Math.cos(a) * r, FLOOR_Y + 0.3 + sparkT * 2 - sparkT * sparkT * 1.8, sparkAt.z + Math.sin(a) * r);
          s.scale.setScalar(0.45 * (1 - sparkT));
        });
        if (sparkT > 1) sparkT = -1;
      }

      updatePutter(dt);

      // aim guide: where this putt will roll (first bounce and a little beyond)
      aim.visible = aiming && aimVec.length() > 0.1;
      if (aim.visible) {
        const power = Math.min(1, aimVec.length() / AIM_MAX_DRAG);
        const key = `${aimVec.x.toFixed(2)},${aimVec.y.toFixed(2)}`;
        if (key !== lastAimKey) {
          lastAimKey = key;
          const pred = predictPath(ball, d, aimVec.x, aimVec.y, power, courseT);
          // the whole path up to the first bounce, then a short tail (the rest is up to you!)
          const end = pred.firstBounce >= 0 ? Math.min(pred.points.length, pred.firstBounce + 3) : pred.points.length;
          const pts = pred.points.slice(1, end).slice(0, dots.length);
          dots.forEach((dot, i) => {
            dot.visible = i < pts.length;
            if (!dot.visible) return;
            dot.position.set(pts[i].x, FLOOR_Y + 0.08, pts[i].z);
            dot.scale.setScalar(1 - (i / dots.length) * 0.5);
          });
          arrow.visible = pts.length > 0;
          if (pts.length) {
            const tip = pts[pts.length - 1];
            const prev = pts.length > 1 ? pts[pts.length - 2] : ball;
            const dir = new THREE.Vector3(tip.x - prev.x, 0, tip.z - prev.z);
            arrow.position.set(tip.x, FLOOR_Y + 0.12, tip.z);
            if (dir.lengthSq() > 1e-6) arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          }
          dotMat.color.setHSL(0.33 - power * 0.33, 0.9, 0.62); // green -> red with power
        }
      } else lastAimKey = "";
    },
    dispose() {
      if (view) dropHole(view);
      for (const d of disposables) d.dispose();
    },
  };
}

// ── little canvas textures ──
function makeChevronTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0)";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 9;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const y of [18, 46]) {
    g.beginPath();
    g.moveTo(14, y + 10);
    g.lineTo(32, y - 6);
    g.lineTo(50, y + 10);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeSwirlTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0.35)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(90,35,80,0.55)";
  g.lineWidth = 7;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let a = 0; a < Math.PI * 2.2; a += 0.1) {
      const r = 6 + a * 8.5;
      const x = 64 + Math.cos(a + (k * Math.PI * 2) / 3) * r;
      const y = 64 + Math.sin(a + (k * Math.PI * 2) / 3) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function makeFlagTexture(num: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 88;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 88);
  g.fillStyle = "#ffffff";
  g.font = "900 60px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(num, 64, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "900 44px system-ui, -apple-system, 'Segoe UI Emoji', sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 60;
  c.width = w;
  c.height = 84;
  g.font = font;
  g.fillStyle = "rgba(122,46,98,0.22)";
  roundRect(g, 4, 10, w - 8, 70, 34);
  g.fill();
  g.fillStyle = "#ffffff";
  roundRect(g, 2, 2, w - 8, 70, 34);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  roundRect(g, 2, 2, w - 8, 70, 34);
  g.stroke();
  g.fillStyle = "#5a2350";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2 - 2, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const h = 0.62;
  s.scale.set((h * w) / 84, h, 1);
  return s;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
