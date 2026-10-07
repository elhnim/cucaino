// Finger-post signs at the park's trail junctions, so a kid can see which way everything is:
//  - where every land's trail leaves the loop: a board pointing down it with the land's name,
//    and one pointing back to the Plaza;
//  - where each of the plaza's four trails meets the loop: boards pointing each way along the
//    loop to the next land that way, and one back to the Plaza;
//  - on the plaza itself, at the head of each of its four trails: the two lands that trail leads
//    to first.
// Each post is a painted pole with a ball on top; each board a pointed plank painted on both sides
// (its own little canvas picture, so the words read the right way from either side).
import * as THREE from "three";
import { TRAILS, TRAIL_POINTS, type Trail } from "../registry/island";
import { LANDS } from "../registry/places";
import { groundY } from "../registry/terrain";

export interface Signposts {
  group: THREE.Group;
  dispose(): void;
}

type P2 = [number, number];
interface Board {
  text: string;
  /** the way it points */
  dx: number;
  dz: number;
  colour: string;
}
interface Post {
  x: number;
  z: number;
  boards: Board[];
}

const LAND_COLOURS: Record<string, string> = { pets: "#ffd978", market: "#ffb38a", rides: "#ff9cc4", friends: "#9fe6c4", dream: "#b9f08a", forest: "#8fe0d8", books: "#f2d59a", golf: "#bdf0a0", arcade: "#cdb8ff", gate: "#ffd0e4", karts: "#ffc4a0" };

/** the posts and their boards, worked out from the trails (pure: tested without a renderer) */
export function planSignposts(): Post[] {
  const loopI = TRAILS.findIndex((t: Trail) => t.id === "loop");
  const loop = TRAIL_POINTS[loopI];
  const n = loop.length;
  const nearestLoop = (p: P2) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (loop[i][0] - p[0]) ** 2 + (loop[i][1] - p[1]) ** 2;
      if (d < bd) ((bd = d), (bi = i));
    }
    return bi;
  };
  const dir = (a: P2, b: P2): P2 => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  // where each land's trail leaves the loop
  const lands = LANDS.filter((l) => l.id !== "plaza" && TRAILS.some((t: Trail) => t.id === `land-${l.id}`)).map((l) => {
    const pts = TRAIL_POINTS[TRAILS.findIndex((t: Trail) => t.id === `land-${l.id}`)];
    return { land: l, at: pts[0] as P2, along: dir(pts[0] as P2, pts[Math.min(3, pts.length - 1)] as P2), li: nearestLoop(pts[0] as P2) };
  });
  const label = (l: { emoji: string; name: string }) => `${l.emoji} ${l.name}`;
  /** a post beside a junction, a couple of steps off the paving on the side away from `away` */
  const beside = (at: P2, d1: P2, d2: P2): P2 => {
    // (the corner between the two trails that meet here)
    let bx = -(d1[0] + d2[0]);
    let bz = -(d1[1] + d2[1]);
    const bl = Math.hypot(bx, bz);
    if (bl < 0.2) ((bx = -d1[1]), (bz = d1[0]));
    else ((bx /= bl), (bz /= bl));
    return [at[0] + bx * 3.1, at[1] + bz * 3.1];
  };
  const toPlaza = (at: P2): Board => {
    const d = dir(at, [0, 0]);
    return { text: "⭐ Plaza", dx: d[0], dz: d[1], colour: "#fff3c4" };
  };
  /** the next land whose trail leaves the loop going `step` (+1 / -1) round from loop point i */
  const nextLand = (i: number, step: number) => {
    let best: (typeof lands)[number] | null = null;
    let bd = Infinity;
    for (const L of lands) {
      const d = (((L.li - i) * step) % n + n) % n;
      if (d > 2 && d < bd) ((bd = d), (best = L));
    }
    return best;
  };
  const posts: Post[] = [];
  for (const L of lands) {
    const tan = dir(loop[(L.li - 1 + n) % n] as P2, loop[(L.li + 1) % n] as P2);
    const [x, z] = beside(L.at, L.along, tan);
    posts.push({ x, z, boards: [{ text: label(L.land), dx: L.along[0], dz: L.along[1], colour: LAND_COLOURS[L.land.id] ?? "#ffe9b8" }, toPlaza(L.at)] });
  }
  TRAILS.forEach((t: Trail, ti: number) => {
    if (!t.id.startsWith("plaza-")) return;
    const pts = TRAIL_POINTS[ti];
    const end = pts[pts.length - 1] as P2;
    const i = nearestLoop(end);
    const tan = dir(loop[(i - 1 + n) % n] as P2, loop[(i + 1) % n] as P2);
    const back = dir(end, pts[Math.max(0, pts.length - 4)] as P2);
    const a = nextLand(i, 1);
    const b = nextLand(i, -1);
    const boards: Board[] = [];
    if (a) boards.push({ text: label(a.land), dx: tan[0], dz: tan[1], colour: LAND_COLOURS[a.land.id] ?? "#ffe9b8" });
    if (b && b !== a) boards.push({ text: label(b.land), dx: -tan[0], dz: -tan[1], colour: LAND_COLOURS[b.land.id] ?? "#ffe9b8" });
    boards.push({ text: "⭐ Plaza", dx: back[0], dz: back[1], colour: "#fff3c4" });
    const [x, z] = beside(end, back, tan);
    posts.push({ x, z, boards });
    // …and at the plaza end of the same trail: the two lands it leads to first
    const start = pts[0] as P2;
    const out = dir(start, pts[Math.min(3, pts.length - 1)] as P2);
    const heads: Board[] = [];
    if (a) heads.push({ text: label(a.land), dx: out[0], dz: out[1], colour: LAND_COLOURS[a.land.id] ?? "#ffe9b8" });
    if (b && b !== a) heads.push({ text: label(b.land), dx: out[0], dz: out[1], colour: LAND_COLOURS[b.land.id] ?? "#ffe9b8" });
    posts.push({ x: start[0] + out[0] * 3.4 - out[1] * 2.6, z: start[1] + out[1] * 3.4 + out[0] * 2.6, boards: heads });
  });
  return posts;
}

const BW = 3.0;
const BH = 0.62;

/** a board's picture: a pointed plank in its colour with a dark outline and its words */
function boardTexture(b: Board, tipRight: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 66;
  const g = c.getContext("2d")!;
  const W = c.width;
  const H = c.height;
  const tip = 30;
  g.beginPath();
  if (tipRight) {
    g.moveTo(4, 4);
    g.lineTo(W - tip, 4);
    g.lineTo(W - 4, H / 2);
    g.lineTo(W - tip, H - 4);
    g.lineTo(4, H - 4);
  } else {
    g.moveTo(W - 4, 4);
    g.lineTo(tip, 4);
    g.lineTo(4, H / 2);
    g.lineTo(tip, H - 4);
    g.lineTo(W - 4, H - 4);
  }
  g.closePath();
  g.fillStyle = b.colour;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "#5a3d2a";
  g.stroke();
  g.fillStyle = "#3a2a1e";
  let size = 34;
  g.font = `800 ${size}px system-ui, "Segoe UI", sans-serif`;
  while (g.measureText(b.text).width > W - tip - 34 && size > 18) g.font = `800 ${(size -= 2)}px system-ui, "Segoe UI", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(b.text, tipRight ? (W - tip) / 2 + 4 : (W + tip) / 2 - 4, H / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildSignposts(scene: THREE.Scene): Signposts {
  const group = new THREE.Group();
  group.name = "signposts";
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const poleGeo = keep(new THREE.CylinderGeometry(0.11, 0.14, 4.3, 8));
  const ballGeo = keep(new THREE.SphereGeometry(0.24, 10, 8));
  const boardGeo = keep(new THREE.PlaneGeometry(BW, BH));
  const poleMat = keep(new THREE.MeshStandardMaterial({ color: "#f4ead8", roughness: 0.7 }));
  const ballMat = keep(new THREE.MeshStandardMaterial({ color: "#e8475e", roughness: 0.5 }));
  if (typeof document !== "undefined")
    for (const p of planSignposts()) {
      const y = groundY(p.x, p.z);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p.x, y + 2.15, p.z);
      pole.castShadow = true;
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.position.set(p.x, y + 4.45, p.z);
      group.add(pole, ball);
      p.boards.forEach((b, i) => {
        const by = y + 3.85 - i * (BH + 0.1);
        // (the board hangs off the pole towards where it points)
        const cx = p.x + b.dx * (BW / 2 + 0.05);
        const cz = p.z + b.dz * (BW / 2 + 0.05);
        const yaw = Math.atan2(-b.dz, b.dx);
        for (const front of [true, false]) {
          const mat = keep(new THREE.MeshBasicMaterial({ map: keep(boardTexture(b, front)), transparent: true, alphaTest: 0.5 }));
          const m = new THREE.Mesh(boardGeo, mat);
          m.position.set(cx, by, cz);
          m.rotation.y = front ? yaw : yaw + Math.PI;
          group.add(m);
        }
      });
    }
  scene.add(group);
  return {
    group,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
