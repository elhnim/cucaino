// The 24 Cucaino Park chibi designs. Each one = shared chibi base + 2–3 signature details.
// Coordinates are in design units (≈1 = full height); head-group space for face parts
// (head centre ≈ (0, 0.29, 0.01)), body-group space for body parts (body centre (0, 0.11, 0)).
import * as THREE from "three";
import type { AnimalId } from "@/lib/park/assets/loader";
import { EYE, arms, bandY, bandZ, belly, bodyShell, earPair, eyes, face, headShell, legs, mouth, blush, tailJoint, type ArmOpts, type LegOpts } from "./base";
import { Ell, STD_LAYOUT, capsule, cone, cyl, ell, box, orient, taperTube, torus, type Kit, type Layout, type Place, type V3 } from "./parts";

export interface DesignCtx {
  role: "kid" | "pet" | "visitor";
}
export interface Design {
  layout?: Partial<Layout>;
  build(k: Kit, c: DesignCtx): void;
}

const PI = Math.PI;

function stdBody(k: Kit, fur: string, o: { belly?: string; bellyR?: V3; arm?: Partial<ArmOpts>; leg?: Partial<LegOpts> } = {}) {
  bodyShell(k, fur);
  if (o.belly) belly(k, o.belly, o.bellyR);
  arms(k, { color: fur, ...o.arm });
  legs(k, { color: fur, ...o.leg });
}

/** rings wrapped round a tube curve at fractions `us` (tiger tail stripes) */
function curveRings(points: V3[], us: number[], R: number, tube: number): THREE.BufferGeometry[] {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return us.map((u) => {
    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg);
    return torus(R, tube, { p: [p.x, p.y, p.z], q }, PI * 2, [4, 8]);
  });
}

/** curly corkscrew tail points (pig) */
function curl(n: number, r: number, back: number, rise: number): V3[] {
  const pts: V3[] = [[0, 0, 0]];
  for (let i = 1; i <= n; i++) {
    const a = i * 1.35;
    pts.push([r * Math.sin(a), r * (1 - Math.cos(a)) + i * rise, -i * back]);
  }
  return pts;
}

/** a place pinned at p facing +Z (for eyes on stalks) */
function faceForward(p: THREE.Vector3): Place {
  return { p, n: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion(), pv: [p.x, p.y, p.z] };
}

const at = (pl: Place, dx = 0, dy = 0, dz = 0): V3 => [pl.p.x + dx, pl.p.y + dy, pl.p.z + dz];

export const DESIGNS: Record<AnimalId, Design> = {
  // ─────────────────────────────── FOX: huge white-tipped tail, dark-tipped pointy ears, white muzzle
  "animal-fox": {
    build(k) {
      const fur = "#ff9447", cream = "#fff4e6", dark = "#5a3a4e", inner = "#ffd0bd";
      headShell(k, fur);
      // white cheek fluff framing the lower face
      for (const s of [1, -1]) k.add(k.head, cream, ell([0.12, 0.09, 0.09], { p: at(k.headE.front(s * 0.15, -0.11, -0.065)) }, [12, 8]));
      face(k, {
        eyes: { y: -0.01 },
        blush: { x: 0.2, y: -0.095, lift: 0.03 },
        muzzle: { color: cream, y: -0.115, r: [0.1, 0.07, 0.075] },
        nose: { color: dark },
        mouth: { style: "smile" },
      });
      earPair(k, [0.52, 0.82, -0.05], [0, 0, -0.32], (j) => {
        k.add(j, fur, cone(0.095, 0.24, { p: [0, 0.11, 0], s: [1, 1, 0.55] }, 10));
        k.add(j, inner, cone(0.058, 0.15, { p: [0, 0.085, 0.03], s: [1, 1, 0.35] }, 8));
        k.add(j, dark, cone(0.054, 0.11, { p: [0, 0.175, 0], s: [1, 1, 0.62] }, 10));
      });
      stdBody(k, fur, { belly: cream, arm: { paw: dark }, leg: { foot: dark } });
      const t = tailJoint(k, [0, 0.05, -0.12], [-0.25, 0, 0]);
      k.add(t, fur,
        ell([0.06, 0.06, 0.07], { p: [0, 0.02, -0.05] }, [10, 7]),
        ell([0.1, 0.105, 0.115], { p: [0, 0.1, -0.14] }, [12, 9]),
        ell([0.105, 0.11, 0.1], { p: [0, 0.2, -0.185] }, [12, 9]));
      k.add(t, cream, ell([0.08, 0.085, 0.078], { p: [0, 0.3, -0.18] }, [10, 8]));
      k.fit = 1.0;
    },
  },

  // ─────────────────────────────── PANDA: black eye patches, round black ears, black arms & legs
  "animal-panda": {
    build(k) {
      const white = "#fbf7f4", black = "#3b3346";
      headShell(k, white);
      for (const s of [1, -1]) k.decal(k.head, black, k.headE.front(s * 0.128, -0.04, -0.004), [0.078, 0.098, 0.024], s * 0.55);
      face(k, {
        eyes: { lift: 0.014, size: 0.92, y: -0.03 },
        blush: { x: 0.215, y: -0.12 },
        muzzle: { color: white, y: -0.12, r: [0.095, 0.065, 0.065] },
        nose: { color: black, r: [0.034, 0.022, 0.02] },
        mouth: { style: "smile" },
      });
      earPair(k, [0.62, 0.74, -0.03], [0, 0, -0.25], (j) => {
        k.add(j, black, ell([0.095, 0.09, 0.06], { p: [0, 0.035, 0] }, [10, 8]));
      });
      bodyShell(k, white);
      k.add(k.body, black, bandY(k.bodyE, 0.07, 0.05, 0.004));
      arms(k, { color: black });
      legs(k, { color: black });
      const t = tailJoint(k);
      k.add(t, white, ell([0.045, 0.045, 0.04], { p: [0, 0, -0.02] }, [8, 6]));
    },
  },

  // ─────────────────────────────── TIGER: black stripes on head/body/tail, white muzzle & cheeks
  "animal-tiger": {
    build(k) {
      const fur = "#ffa04a", white = "#fff5ea", stripe = "#4a3040", nose = "#ff8a9a";
      headShell(k, fur);
      for (const s of [1, -1]) k.add(k.head, white, ell([0.11, 0.085, 0.08], { p: at(k.headE.front(s * 0.15, -0.115, -0.055)) }, [10, 7]));
      face(k, {
        eyes: { y: -0.015 },
        blush: { x: 0.2, y: -0.1, lift: 0.024 },
        muzzle: { color: white, y: -0.115, r: [0.1, 0.07, 0.072] },
        nose: { color: nose, r: [0.032, 0.022, 0.02] },
        mouth: { style: "w" },
      });
      // forehead "王"-free stripes: one centre + two angled
      k.decal(k.head, stripe, k.headE.front(0, 0.19), [0.018, 0.058, 0.012]);
      for (const s of [1, -1]) {
        k.decal(k.head, stripe, k.headE.front(s * 0.08, 0.17), [0.014, 0.045, 0.012], s * 0.35);
        k.decal(k.head, stripe, k.headE.dir(s, 0.12, 0.35), [0.06, 0.014, 0.012], -s * 0.25);
        k.decal(k.head, stripe, k.headE.dir(s, -0.02, 0.4), [0.05, 0.013, 0.012], -s * 0.1);
      }
      earPair(k, [0.6, 0.75, -0.02], [0, 0, -0.25], (j) => {
        k.add(j, fur, ell([0.085, 0.08, 0.05], { p: [0, 0.035, 0] }, [10, 8]));
        k.add(j, white, ell([0.05, 0.048, 0.02], { p: [0, 0.03, 0.035] }, [8, 6]));
        k.add(j, stripe, ell([0.03, 0.02, 0.02], { p: [0, 0.09, -0.02] }, [6, 4]));
      });
      stdBody(k, fur, { belly: white, arm: { paw: white }, leg: { foot: white } });
      for (const s of [1, -1]) {
        k.decal(k.body, stripe, k.bodyE.dir(s, 0.05, -0.25), [0.013, 0.055, 0.01]);
        k.decal(k.body, stripe, k.bodyE.dir(s, 0.02, -0.9), [0.012, 0.05, 0.01]);
      }
      for (const y of [0.06, -0.02]) k.decal(k.body, stripe, k.bodyE.back(0, y), [0.07, 0.013, 0.01]);
      const pts: V3[] = [[0, 0, 0], [0, 0.04, -0.08], [0, 0.12, -0.13], [0, 0.21, -0.12], [0.01, 0.26, -0.07]];
      const t = tailJoint(k, [0, 0.05, -0.12]);
      k.add(t, fur, taperTube(pts, 0.032, 0.03, {}, 10, 6));
      k.add(t, stripe, ...curveRings(pts, [0.3, 0.55, 0.78], 0.032, 0.012), ell([0.034, 0.034, 0.034], { p: pts[4] }, [8, 6]));
    },
  },

  // ─────────────────────────────── LION: fluffy mane ring of puffs, tufted tail
  "animal-lion": {
    build(k) {
      const fur = "#ffc862", mane = "#f0853f", cream = "#fff0d6", nose = "#b8605a";
      headShell(k, fur);
      const c = k.headE.c;
      const puffs: THREE.BufferGeometry[] = [ell([0.33, 0.31, 0.2], { p: [c.x, c.y + 0.01, c.z - 0.1] }, [14, 10])];
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2 + PI / 2;
        const rr = i % 2 ? 0.088 : 0.1;
        puffs.push(ell([rr, rr, rr * 0.85], { p: [c.x + Math.cos(a) * 0.3, c.y + Math.sin(a) * 0.285, c.z - 0.045] }, [8, 6]));
      }
      k.add(k.head, mane, ...puffs);
      face(k, {
        eyes: { y: -0.02 },
        blush: { x: 0.19, y: -0.1, lift: 0.004 },
        muzzle: { color: cream, y: -0.115, r: [0.115, 0.075, 0.075] },
        nose: { color: nose, r: [0.036, 0.024, 0.02] },
        mouth: { style: "w" },
      });
      earPair(k, [0.5, 0.8, 0.28], [-0.2, 0, -0.3], (j) => {
        k.add(j, fur, ell([0.068, 0.064, 0.042], { p: [0, 0.03, 0] }, [8, 6]));
        k.add(j, cream, ell([0.04, 0.038, 0.016], { p: [0, 0.028, 0.03] }, [8, 5]));
      }, 0.02);
      stdBody(k, fur, { belly: cream, arm: { paw: cream }, leg: { foot: cream } });
      const t = tailJoint(k, [0, 0.05, -0.12]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, 0.02, -0.09], [0, 0.1, -0.14], [0, 0.18, -0.13]], 0.022, 0.018, {}, 10, 5));
      k.add(t, mane, ell([0.05, 0.058, 0.05], { p: [0, 0.2, -0.12] }, [8, 6]), ell([0.035, 0.04, 0.035], { p: [0, 0.245, -0.11] }, [6, 5]));
    },
  },

  // ─────────────────────────────── BUNNY: long ears (one floppy), cotton tail, buck teeth, "w" mouth
  "animal-bunny": {
    build(k) {
      const fur = "#fff2f6", inner = "#ffb0c6", nose = "#ff86ab";
      headShell(k, fur);
      face(k, {
        eyes: { y: -0.02 },
        blush: { x: 0.2, y: -0.095, r: [0.058, 0.035] },
        nose: { color: nose, y: -0.07, r: [0.026, 0.018, 0.016] },
        mouth: { style: "w", y: -0.1 },
      });
      for (const s of [1, -1]) k.add(k.head, "#ffffff", box(0.021, 0.03, 0.01, { p: at(k.headE.front(s * 0.0115, -0.132, -0.002)), q: k.headE.front(s * 0.0115, -0.132).q }));
      earPair(k, [0.28, 1, -0.08], [-0.12, 0, -0.14], (j, s) => {
        if (s > 0) {
          k.add(j, fur, capsule(0.055, 0.22, { p: [0, 0.15, 0], s: [1, 1, 0.6] }, 10, 3));
          k.add(j, inner, capsule(0.03, 0.19, { p: [0, 0.15, 0.024], s: [1, 1, 0.35] }, 8, 2));
        } else {
          k.add(j, fur, capsule(0.055, 0.07, { p: [0, 0.07, 0], s: [1, 1, 0.6] }, 10, 3));
          k.add(j, inner, capsule(0.03, 0.06, { p: [0, 0.07, 0.024], s: [1, 1, 0.35] }, 8, 2));
          const tip = k.joint("earTip", j, [0, 0.13, 0], [0.25, 0, 1.75]);
          k.add(tip, fur, capsule(0.053, 0.12, { p: [0, 0.085, 0], s: [1, 1, 0.6] }, 10, 3));
          k.add(tip, inner, capsule(0.028, 0.1, { p: [0, 0.085, 0.022], s: [1, 1, 0.35] }, 8, 2));
          k.extra.earTip = tip;
        }
      }, -0.03);
      stdBody(k, fur, { belly: "#ffffff", arm: {}, leg: { r: [0.062, 0.05, 0.098], foot: fur } });
      const t = tailJoint(k, [0, 0.04, -0.14]);
      k.add(t, "#ffffff", ell([0.068, 0.065, 0.06], { p: [0, 0, -0.02] }, [10, 8]), ell([0.04, 0.04, 0.04], { p: [0.03, 0.04, -0.04] }, [6, 5]));
      k.fit = 1.04;
      k.animate = (a) => {
        const tip = k.extra.earTip;
        tip.g.rotation.z = tip.r0.z + 0.12 * Math.sin(a.t * 3.1) + 0.2 * Math.sin(a.phase * 2) * a.move;
      };
    },
  },

  // ─────────────────────────────── BEE: striped round body, fluttering wings, antennae with glowing tips
  "animal-bee": {
    layout: { hover: 0.08, bodyR: [0.17, 0.15, 0.16] },
    build(k) {
      const yellow = "#ffd84a", dark = "#4a3848", wing = "#bfe4ff";
      headShell(k, yellow);
      face(k, { eyes: { y: -0.02, size: 1.04 }, blush: { x: 0.2, y: -0.1 }, mouth: { style: "smile", y: -0.1 } });
      const tipM = k.glow("#ff9ed0", "#ff7ac0", 1.2);
      earPair(k, [0.32, 0.95, 0.12], [0.15, 0, -0.35], (j) => {
        k.add(j, dark, taperTube([[0, 0, 0], [0, 0.07, 0.01], [0.02, 0.13, 0.04]], 0.012, 0.01, {}, 6, 5, false));
        k.add(j, tipM, ell([0.032, 0.032, 0.032], { p: [0.022, 0.145, 0.045] }, [8, 6]));
      }, -0.01);
      bodyShell(k, yellow);
      k.add(k.body, dark, bandY(k.bodyE, 0.015, 0.04, 0.005), bandY(k.bodyE, -0.075, 0.034, 0.005));
      k.add(k.body, dark, cone(0.028, 0.06, { p: at(k.bodyE.back(0, -0.04), 0, 0, -0.02), r: [-PI / 2 - 0.3, 0, 0] }, 6));
      arms(k, { color: dark, r: 0.03, len: 0.035, x: 0.15 });
      legs(k, { color: dark, r: [0.042, 0.036, 0.05], x: 0.07 });
      const wm = k.glow(wing, "#9fdcff", 0.8, 0.82);
      for (const s of [1, -1]) {
        const w = k.joint(s > 0 ? "wingL" : "wingR", k.body, [s * 0.05, 0.2, -0.1], [0.2, s * 0.55, s * 0.5]);
        k.add(w, wm, ell([0.15, 0.09, 0.012], { p: [s * 0.14, 0.05, 0] }, [10, 6]), ell([0.1, 0.06, 0.012], { p: [s * 0.1, -0.05, 0.01], r: [0, 0, -s * 0.5] }, [8, 5]));
        k.extra[s > 0 ? "wingL" : "wingR"] = w;
      }
      k.gait = "hover";
      k.neck.r = [0.12, 0.105];
      k.animate = (a) => {
        const f = Math.sin(a.t * 52) * (0.35 + 0.15 * a.move);
        const L = k.extra.wingL, R = k.extra.wingR;
        L.g.rotation.y = L.r0.y + f;
        R.g.rotation.y = R.r0.y - f;
      };
    },
  },

  // ─────────────────────────────── PENGUIN: white face mask & belly, orange beak and feet, flippers
  "animal-penguin": {
    build(k) {
      const dark = "#3e4c7c", white = "#fbfbff", orange = "#ffa94d";
      headShell(k, dark);
      for (const s of [1, -1]) k.add(k.head, white, ell([0.13, 0.15, 0.09], { p: at(k.headE.front(s * 0.085, -0.035, -0.063)) }, [12, 9]));
      k.add(k.head, white, ell([0.17, 0.1, 0.09], { p: at(k.headE.front(0, -0.13, -0.07)) }, [12, 8]));
      face(k, {
        eyes: { lift: 0.022, x: 0.1, y: -0.02 },
        blush: { x: 0.18, y: -0.11, lift: 0.024 },
        mouth: { style: "none", y: -0.15, lift: 0.02 },
      });
      k.add(k.head, orange, cone(0.042, 0.08, { p: at(k.headE.front(0, -0.095, 0.045)), r: [PI / 2, 0, 0], s: [1.15, 1, 0.75] }, 8));
      bodyShell(k, dark);
      belly(k, white, [0.13, 0.12, 0.06], -0.005);
      arms(k, { color: dark, shape: "wing", x: 0.15, rest: 0.35 });
      legs(k, { color: orange, bird: true });
      const t = tailJoint(k, [0, 0.02, -0.13]);
      k.add(t, dark, cone(0.04, 0.07, { p: [0, 0, -0.03], r: [-PI / 2 - 0.4, 0, 0], s: [1.3, 1, 0.6] }, 6));
    },
  },

  // ─────────────────────────────── ELEPHANT: curled trunk, big ear discs, tiny tusks, hair tuft
  "animal-elephant": {
    build(k) {
      const fur = "#a9b6ec", inner = "#ffc2d6", tusk = "#fff6e0";
      headShell(k, fur);
      face(k, {
        eyes: { x: 0.135, y: 0.0 },
        blush: { x: 0.2, y: -0.085 },
        mouth: { style: "none", y: -0.19 },
      });
      const base = k.headE.front(0, -0.075, -0.03);
      const trunk = k.joint("trunk", k.head, base.pv);
      k.extra.trunk = trunk;
      k.add(trunk, fur, taperTube([[0, 0.02, -0.02], [0, -0.03, 0.06], [0, -0.1, 0.1], [0, -0.16, 0.12], [0, -0.19, 0.17], [0, -0.16, 0.21]], 0.058, 0.032, {}, 14, 8));
      k.add(trunk, inner, ell([0.028, 0.028, 0.01], { p: [0, -0.155, 0.225], r: [-0.5, 0, 0] }, [8, 5]));
      for (const s of [1, -1]) k.add(k.head, tusk, cone(0.018, 0.06, { p: at(k.headE.front(s * 0.085, -0.15, -0.005)), r: [PI / 2 + 0.5, 0, -s * 0.3] }, 6));
      earPair(k, [1, 0.12, -0.2], [0, 0.55, 0], (j, s) => {
        k.add(j, fur, ell([0.18, 0.2, 0.03], { p: [s * 0.13, -0.01, 0] }, [14, 10]));
        k.add(j, inner, ell([0.125, 0.145, 0.012], { p: [s * 0.135, -0.01, 0.022] }, [12, 8]));
      }, -0.03);
      for (const [x, z] of [[0, 0.1], [0.05, 0.02], [-0.05, 0.03]] as const) k.add(k.head, fur, ell([0.03, 0.045, 0.03], { p: at(k.headE.dir(x, 1, z), 0, 0.01), r: [0, 0, -x * 6] }, [6, 5]));
      stdBody(k, fur, { leg: { foot: "#c9d0f5" }, arm: { paw: "#c9d0f5" } });
      const t = tailJoint(k, [0, 0.05, -0.13]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, -0.03, -0.06], [0, -0.07, -0.08]], 0.014, 0.01, {}, 6, 5));
      k.add(t, "#7d86b8", ell([0.022, 0.03, 0.022], { p: [0, -0.09, -0.085] }, [6, 5]));
      k.fit = 0.98;
      k.animate = (a) => {
        const flap = 0.12 * Math.sin(a.t * 2.2) + 0.25 * (a.w.cheer ?? 0) * Math.sin(a.t * 14);
        if (k.earL) k.earL.g.rotation.y = k.earL.r0.y + flap;
        if (k.earR) k.earR.g.rotation.y = k.earR.r0.y - flap;
        trunk.g.rotation.x = 0.08 * Math.sin(a.t * 1.7) - 0.35 * (a.w.cheer ?? 0) - 0.2 * (a.w.wave ?? 0);
        trunk.g.rotation.z = 0.1 * Math.sin(a.t * 1.3 + 1);
      };
    },
  },

  // ─────────────────────────────── GIRAFFE: long neck, ossicones, orange spots
  "animal-giraffe": {
    layout: { neckY: 0.4, headC: [0, 0.25, 0.03], headR: [0.3, 0.265, 0.26] },
    build(k) {
      const fur = "#ffd67e", spot = "#e89048", horn = "#c98a4b", muzzleC = "#fff0c9", hoof = "#9a6a4f";
      headShell(k, fur);
      face(k, {
        eyes: { x: 0.11, y: 0.0, size: 0.94 },
        blush: { x: 0.185, y: -0.075 },
        muzzle: { color: muzzleC, y: -0.105, r: [0.13, 0.085, 0.09] },
        nose: false,
        mouth: { style: "smile" },
      });
      // nostrils sit on the muzzle
      const mz = new Ell(at(k.headE.front(0, -0.105), 0, 0, -0.045), [0.13, 0.085, 0.09]);
      for (const s of [1, -1]) k.decal(k.head, "#c07a55", mz.front(s * 0.045, 0.028), [0.014, 0.01, 0.006]);
      for (const s of [1, -1]) {
        const pl = k.headE.dir(s * 0.32, 1, -0.12);
        k.add(k.head, horn, cyl(0.02, 0.017, 0.11, { p: at(pl, 0, 0.045), r: [0, 0, -s * 0.15] }, 6));
        k.add(k.head, "#b8743f", ell([0.032, 0.03, 0.032], { p: at(pl, s * 0.015, 0.105) }, [8, 6]));
      }
      earPair(k, [1, 0.45, -0.15], [0, 0, -1.15], (j) => {
        k.add(j, fur, ell([0.042, 0.085, 0.028], { p: [0, 0.07, 0] }, [8, 6]));
        k.add(j, "#ffc2c2", ell([0.024, 0.06, 0.01], { p: [0, 0.07, 0.022] }, [6, 5]));
      });
      for (const [x, y, s] of [[0.19, 0.12, 0.034], [-0.22, 0.06, 0.03], [0.09, 0.22, 0.026], [-0.12, 0.2, 0.024]] as const)
        k.decal(k.head, spot, k.headE.front(x, y), [s, s * 0.85, 0.01], x * 3);
      // neck
      const neck = new Ell([0, 0.33, 0.005], [0.07, 0.17, 0.07]);
      k.add(k.body, fur, capsule(0.07, 0.2, { p: [0, 0.33, 0.005] }, 10, 3));
      for (const [dx, dy, dz, s] of [[1, 0.3, 0.4, 0.028], [-1, -0.1, 0.5, 0.026], [0.3, 0.5, 1, 0.024], [-0.4, -0.6, 1, 0.022], [0.2, -0.2, -1, 0.026]] as const)
        k.decal(k.body, spot, neck.dir(dx, dy, dz), [s, s * 1.1, 0.008]);
      stdBody(k, fur, { belly: muzzleC, arm: { paw: hoof }, leg: { foot: hoof } });
      for (const [dx, dy, dz, s] of [[1, 0.2, -0.3, 0.04], [-1, 0.0, 0.1, 0.036], [0.4, 0.3, -1, 0.034], [-0.5, -0.2, -1, 0.03]] as const)
        k.decal(k.body, spot, k.bodyE.dir(dx, dy, dz), [s, s * 0.85, 0.01]);
      const t = tailJoint(k, [0, 0.07, -0.13]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, -0.03, -0.06], [0, -0.08, -0.08]], 0.013, 0.01, {}, 6, 5));
      k.add(t, "#8a5a44", ell([0.024, 0.035, 0.024], { p: [0, -0.1, -0.085] }, [6, 5]));
      k.neck = { at: [0, 0.225, 0.005], r: [0.1, 0.09], tilt: 0.1, tube: 0.03 };
      k.fit = 1.1;
    },
  },

  // ─────────────────────────────── COW: black patches, little horns, big pink snout, bell
  "animal-cow": {
    build(k, c) {
      const fur = "#fffaf4", spot = "#4a3a4a", snout = "#ffc2cd", horn = "#fff0c4";
      headShell(k, fur);
      k.decal(k.head, spot, k.headE.front(0.16, 0.1), [0.1, 0.085, 0.02], 0.4);
      k.decal(k.head, spot, k.headE.dir(-0.45, 0.8, -0.45), [0.09, 0.07, 0.02], -0.3);
      face(k, {
        eyes: { y: -0.005, lift: 0.006 },
        blush: { x: 0.21, y: -0.085 },
        muzzle: { color: snout, y: -0.125, r: [0.15, 0.09, 0.085], sink: 0.45 },
        nose: false,
        mouth: { style: "smile", y: -0.045 },
      });
      const mz = new Ell(at(k.headE.front(0, -0.125), 0, 0, -0.038), [0.15, 0.09, 0.085]);
      for (const s of [1, -1]) k.decal(k.head, "#e0859a", mz.front(s * 0.05, 0.02), [0.018, 0.024, 0.008], s * 0.3);
      for (const s of [1, -1]) {
        const pl = k.headE.dir(s * 0.5, 0.85, -0.05, -0.01);
        k.add(k.head, horn, taperTube([at(pl), at(pl, s * 0.045, 0.05), at(pl, s * 0.06, 0.1, 0.01)], 0.028, 0.012, {}, 6, 6));
      }
      earPair(k, [1, 0.3, -0.05], [0, 0, -1.3], (j) => {
        k.add(j, fur, ell([0.045, 0.09, 0.03], { p: [0, 0.075, 0] }, [8, 6]));
        k.add(j, snout, ell([0.026, 0.06, 0.012], { p: [0, 0.075, 0.022] }, [6, 5]));
      });
      k.add(k.head, spot, ell([0.03, 0.04, 0.025], { p: at(k.headE.dir(0.05, 1, 0.3), 0, 0.005), r: [0.3, 0, -0.4] }, [6, 5]), ell([0.026, 0.034, 0.022], { p: at(k.headE.dir(-0.05, 1, 0.25), 0, 0.005), r: [0.3, 0, 0.4] }, [6, 5]));
      stdBody(k, fur, { arm: { paw: "#8a6a6a" }, leg: { foot: "#8a6a6a" } });
      k.decal(k.body, spot, k.bodyE.dir(1, 0.2, -0.3), [0.07, 0.06, 0.012], 0.4);
      k.decal(k.body, spot, k.bodyE.dir(-0.8, -0.1, -0.6), [0.06, 0.07, 0.012], -0.2);
      k.decal(k.body, spot, k.bodyE.back(0.03, 0.04), [0.06, 0.05, 0.012]);
      if (c.role !== "pet") {
        const gold = k.glow("#ffd24a", "#ffcf4a", 0.7);
        const y = 0.175;
        const fz = k.bodyE.front(0, y - k.bodyE.c.y).p.z;
        if (c.role === "visitor") k.add(k.body, "#e5484d", torus(0.1, 0.014, { p: [0, 0.215, 0], r: [PI / 2 - 0.12, 0, 0], s: [1, 0.9, 1] }, PI * 2, [4, 14]));
        k.add(k.body, gold, cyl(0.03, 0.022, 0.045, { p: [0, y, fz + 0.012], r: [0.25, 0, 0] }, 8));
        k.add(k.body, "#b8862a", ell([0.012, 0.012, 0.012], { p: [0, y - 0.03, fz + 0.022] }, [6, 4]));
      }
      const t = tailJoint(k, [0, 0.06, -0.13]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, -0.03, -0.06], [0, -0.08, -0.08]], 0.013, 0.01, {}, 6, 5));
      k.add(t, spot, ell([0.024, 0.035, 0.024], { p: [0, -0.1, -0.085] }, [6, 5]));
    },
  },

  // ─────────────────────────────── PIG: round pink snout with nostrils, curly tail, flop ears
  "animal-pig": {
    build(k) {
      const fur = "#ffb8ca", snout = "#ff94b1", nostril = "#d2597f";
      headShell(k, fur);
      face(k, { eyes: { y: 0.0 }, blush: { x: 0.215, y: -0.08 }, mouth: { style: "smile", y: -0.165 } });
      const pl = k.headE.front(0, -0.085, -0.005);
      k.add(k.head, snout, cyl(0.075, 0.075, 0.06, { p: pl.pv, r: [PI / 2, 0, 0], s: [1, 1, 0.76] }, 14));
      for (const s of [1, -1]) k.add(k.head, nostril, ell([0.014, 0.022, 0.006], { p: at(pl, s * 0.027, 0, 0.031) }, [6, 5]));
      earPair(k, [0.6, 0.75, 0], [0.55, 0, -0.4], (j) => {
        k.add(j, fur, cone(0.075, 0.15, { p: [0, 0.065, 0], s: [1, 1, 0.45] }, 8));
        k.add(j, snout, cone(0.045, 0.1, { p: [0, 0.05, 0.02], s: [1, 1, 0.3] }, 6));
      });
      stdBody(k, fur, { arm: { paw: snout }, leg: { foot: snout } });
      const t = tailJoint(k, [0, 0.07, -0.135]);
      k.add(t, snout, taperTube(curl(6, 0.028, 0.009, 0.004), 0.013, 0.011, {}, 16, 5));
    },
  },

  // ─────────────────────────────── HOG: darker boar with tusks, spiky mohawk, curly tuft tail
  "animal-hog": {
    build(k) {
      const fur = "#b87e66", snout = "#eaa28d", tusk = "#fff4dc", mane = "#6b4538", nostril = "#7a3f3f";
      headShell(k, fur);
      face(k, { eyes: { y: 0.0 }, blush: { x: 0.215, y: -0.08 }, mouth: { style: "smile", y: -0.165 } });
      const pl = k.headE.front(0, -0.085, -0.005);
      k.add(k.head, snout, cyl(0.078, 0.07, 0.065, { p: pl.pv, r: [PI / 2, 0, 0], s: [1, 1, 0.74] }, 14));
      for (const s of [1, -1]) {
        k.add(k.head, nostril, ell([0.014, 0.02, 0.006], { p: at(pl, s * 0.028, 0, 0.033) }, [6, 5]));
        k.add(k.head, tusk, cone(0.016, 0.06, { p: at(pl, s * 0.07, -0.03, 0.01), r: [0.3, 0, -s * 0.35] }, 6));
      }
      // brows make him look wild-but-sweet
      for (const s of [1, -1]) k.decal(k.head, mane, k.headE.front(s * 0.12, 0.075), [0.045, 0.012, 0.01], s * 0.25);
      for (let i = 0; i < 5; i++) {
        const z = 0.35 - i * 0.22;
        k.add(k.head, mane, cone(0.035, 0.09, { p: at(k.headE.dir(0, 1, z), 0, 0.02), r: [-0.5 - i * 0.18, 0, 0], s: [0.7, 1, 1] }, 6));
      }
      earPair(k, [0.62, 0.72, 0], [0.1, 0, -0.35], (j) => {
        k.add(j, fur, cone(0.07, 0.15, { p: [0, 0.07, 0], s: [1, 1, 0.45] }, 8));
        k.add(j, snout, cone(0.04, 0.1, { p: [0, 0.055, 0.02], s: [1, 1, 0.3] }, 6));
      });
      stdBody(k, fur, { belly: "#d9a58f", arm: { paw: mane }, leg: { foot: mane } });
      const t = tailJoint(k, [0, 0.07, -0.135]);
      const pts = curl(5, 0.024, 0.009, 0.004);
      k.add(t, fur, taperTube(pts, 0.011, 0.009, {}, 14, 5));
      k.add(t, mane, ell([0.022, 0.03, 0.022], { p: pts[pts.length - 1] }, [6, 5]));
    },
  },

  // ─────────────────────────────── KOALA: huge fluffy ears, big dark nose, white tummy
  "animal-koala": {
    build(k) {
      const fur = "#b6bbcf", fluff = "#f6f2f8", nose = "#3a3346";
      headShell(k, fur);
      face(k, { eyes: { x: 0.13, y: 0.0, size: 0.92 }, blush: { x: 0.21, y: -0.085 }, mouth: { style: "smile", y: -0.155 } });
      k.add(k.head, nose, ell([0.052, 0.07, 0.042], { p: at(k.headE.front(0, -0.07, -0.01)) }, [10, 8]));
      k.add(k.head, k.basic("#ffffff"), ell([0.014, 0.02, 0.006], { p: at(k.headE.front(-0.015, -0.045, 0.03)) }, [6, 4]));
      earPair(k, [0.95, 0.5, -0.05], [0, 0, -0.2], (j, s) => {
        k.add(j, fur, ell([0.145, 0.14, 0.07], { p: [s * 0.06, 0.035, 0] }, [12, 9]));
        k.add(j, fluff, ell([0.1, 0.1, 0.035], { p: [s * 0.065, 0.03, 0.045] }, [10, 7]));
        for (const a of [0.2, 0.9, 1.6]) k.add(j, fluff, ell([0.035, 0.035, 0.03], { p: [s * (0.06 + Math.cos(a) * 0.12), 0.035 + Math.sin(a) * 0.115, 0.03] }, [6, 5]));
      }, -0.05);
      stdBody(k, fur, { belly: fluff, arm: { paw: "#9ea3b8" }, leg: { foot: "#9ea3b8" } });
      k.fit = 1.0;
    },
  },

  // ─────────────────────────────── POLAR BEAR: snowy white, round ears, big dark nose, chubby
  "animal-polar": {
    layout: { bodyR: [0.18, 0.15, 0.16] },
    build(k) {
      const fur = "#f3f8ff", muzzleC = "#ffffff", nose = "#3a3346", inner = "#ffcad8";
      headShell(k, fur);
      face(k, {
        eyes: { y: -0.01, size: 0.95 },
        blush: { x: 0.2, y: -0.1 },
        muzzle: { color: muzzleC, y: -0.105, r: [0.115, 0.08, 0.085], sink: 0.4 },
        nose: { color: nose, r: [0.04, 0.028, 0.024] },
        mouth: { style: "smile" },
      });
      // soft icy freckles that glow at night
      const ice = k.glow("#bfe6ff", "#8fd8ff", 1.2);
      for (const s of [1, -1]) for (const [x, y] of [[0.25, -0.03], [0.27, -0.075]]) k.decal(k.head, ice, k.headE.front(s * x, y), [0.009, 0.009, 0.005]);
      earPair(k, [0.6, 0.76, -0.03], [0, 0, -0.25], (j) => {
        k.add(j, fur, ell([0.075, 0.07, 0.05], { p: [0, 0.03, 0] }, [10, 8]));
        k.add(j, inner, ell([0.042, 0.04, 0.018], { p: [0, 0.028, 0.035] }, [8, 5]));
      });
      stdBody(k, fur, { arm: { paw: "#dfe8f7", x: 0.155 }, leg: { foot: "#dfe8f7" } });
      const t = tailJoint(k, [0, 0.05, -0.15]);
      k.add(t, fur, ell([0.04, 0.04, 0.035], { p: [0, 0, -0.015] }, [8, 6]));
      k.neck.r = [0.125, 0.11];
    },
  },

  // ─────────────────────────────── MONKEY: heart-shaped face patch, side ears, long curly tail
  "animal-monkey": {
    build(k) {
      const fur = "#b8774e", faceC = "#ffd8b5", inner = "#ffc09c";
      headShell(k, fur);
      const lobes = [1, -1].map((s) => ell([0.12, 0.13, 0.08], { p: at(k.headE.front(s * 0.08, 0.005, -0.056)) }, [12, 9]));
      k.add(k.head, faceC, ...lobes);
      face(k, {
        eyes: { lift: 0.022, x: 0.085, y: -0.0, size: 0.95 },
        blush: { x: 0.2, y: -0.1, lift: 0.012 },
        muzzle: { color: faceC, y: -0.115, r: [0.14, 0.09, 0.085], sink: 0.42 },
        nose: { color: "#7a4a3a", r: [0.028, 0.014, 0.012] },
        mouth: { style: "smile", size: 1.3 },
      });
      earPair(k, [1, 0.02, -0.05], [0, 0.35, 0], (j, s) => {
        k.add(j, fur, ell([0.085, 0.085, 0.04], { p: [s * 0.05, 0, 0] }, [10, 8]));
        k.add(j, inner, ell([0.055, 0.055, 0.018], { p: [s * 0.055, 0, 0.03] }, [8, 6]));
      }, -0.03);
      for (const [x, r] of [[0, 0], [0.04, -0.4], [-0.04, 0.4]] as const) k.add(k.head, fur, cone(0.028, 0.075, { p: at(k.headE.dir(x, 1, 0.22), 0, 0.02), r: [0.3, 0, r] }, 6));
      stdBody(k, fur, { belly: faceC, arm: { paw: faceC, len: 0.07 }, leg: { foot: faceC } });
      const t = tailJoint(k, [0, 0.05, -0.13]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, 0.0, -0.1], [0, 0.08, -0.18], [0, 0.2, -0.18], [0, 0.26, -0.11], [0, 0.23, -0.05], [0, 0.18, -0.08]], 0.022, 0.018, {}, 20, 6));
      k.fit = 1.0;
    },
  },

  // ─────────────────────────────── PARROT: bright feathers, hooked beak, tricolour crest, long tail
  "animal-parrot": {
    build(k) {
      const green = "#4dd39b", cheek = "#ffae5c", beak = "#ffe2a0", beakDark = "#6a5a6a", blue = "#4fa8ff", red = "#ff5e6f", yellow = "#ffd84a";
      headShell(k, green);
      for (const s of [1, -1]) k.decal(k.head, "#fff6e6", k.headE.front(s * 0.12, -0.02, 0.0), [0.08, 0.09, 0.022]);
      for (const s of [1, -1]) k.decal(k.head, cheek, k.headE.front(s * 0.2, -0.12), [0.06, 0.045, 0.014]);
      face(k, {
        eyes: { y: -0.02, lift: 0.014, size: 0.95 },
        blush: { x: 0.2, y: -0.12, lift: 0.012 },
        mouth: { style: "none", y: -0.17 },
      });
      const b = k.headE.front(0, -0.075, -0.03);
      k.add(k.head, beak, taperTube([at(b, 0, 0.02), at(b, 0, 0.03, 0.06), at(b, 0, 0.0, 0.1), at(b, 0, -0.05, 0.105), at(b, 0, -0.08, 0.08)], 0.062, 0.014, {}, 12, 8));
      k.add(k.head, beakDark, ell([0.042, 0.03, 0.035], { p: at(b, 0, -0.045, 0.04) }, [8, 6]));
      const crest = [[red, -0.35, 0.03], [cheek, 0, 0], [yellow, 0.35, -0.03]] as const;
      for (const [col, r, x] of crest) k.add(k.head, col, ell([0.026, 0.085, 0.036], { p: at(k.headE.dir(x, 1, 0.2), x, 0.06), r: [-0.45, 0, r] }, [8, 6]));
      bodyShell(k, green);
      belly(k, "#a6ecc9", [0.11, 0.1, 0.05]);
      arms(k, { color: green, shape: "wing", tip: blue, x: 0.15 });
      legs(k, { color: "#b9a3b0", bird: true });
      const t = tailJoint(k, [0, 0.03, -0.12], [0.5, 0, 0]);
      for (const [col, x, rz] of [[blue, 0, 0], [yellow, 0.04, 0.3], [red, -0.04, -0.3]] as const)
        k.add(t, col, ell([0.032, 0.018, 0.14], { p: [x, -0.02, -0.12], r: [0, rz * 0.6, rz] }, [8, 5]));
    },
  },

  // ─────────────────────────────── CHICK: yellow fluff tuft, tiny beak, stubby wings
  "animal-chick": {
    layout: { bodyR: [0.17, 0.15, 0.15] },
    build(k) {
      const yellow = "#ffe36b", orange = "#ffa240", fluff = "#fff09a";
      headShell(k, yellow);
      face(k, { eyes: { y: -0.02, size: 1.05 }, blush: { x: 0.2, y: -0.1, r: [0.06, 0.038] }, mouth: { style: "none", y: -0.14 } });
      const b = k.headE.front(0, -0.085, 0.005);
      k.add(k.head, orange, cone(0.04, 0.055, { p: at(b, 0, 0.008, 0.02), r: [PI / 2, 0, 0], s: [1.2, 1, 0.6] }, 8), cone(0.03, 0.04, { p: at(b, 0, -0.018, 0.012), r: [PI / 2 + 0.3, 0, 0], s: [1.1, 1, 0.55] }, 8));
      for (const [x, r, h] of [[0, 0, 0.15], [0.05, -0.6, 0.12], [-0.05, 0.6, 0.11]] as const)
        k.add(k.head, x === 0 ? yellow : fluff, ell([0.032, h * 0.6, 0.028], { p: at(k.headE.dir(x, 1, 0.1), x * 0.9, h * 0.4), r: [0, 0, r] }, [8, 6]));
      stdBody(k, yellow, { arm: { shape: "wing", x: 0.16, tip: fluff }, leg: { bird: true, color: orange, foot: orange } });
      const t = tailJoint(k, [0, 0.07, -0.14]);
      k.add(t, fluff, cone(0.035, 0.06, { p: [0, 0.01, -0.02], r: [-PI / 2 - 0.6, 0, 0] }, 6));
    },
  },

  // ─────────────────────────────── CRAB: red shell, big pinching claws, eyes on stalks, side legs
  "animal-crab": {
    layout: { bodyY: 0.1, bodyC: [0, 0.08, 0], bodyR: [0.12, 0.08, 0.1], neckY: 0.02, headC: [0, 0.2, 0], headR: [0.36, 0.22, 0.27] },
    build(k) {
      const shell = "#ff715e", light = "#ffc3a8", spot = "#ffa08f";
      headShell(k, shell);
      k.add(k.head, light, ell([0.3, 0.09, 0.1], { p: at(k.headE.front(0, -0.15, -0.08)) }, [12, 7]));
      for (const [x, z] of [[0.12, 0.1], [-0.15, 0.05], [0, -0.3]] as const) k.decal(k.head, spot, k.headE.dir(x, 1, z), [0.04, 0.03, 0.008]);
      const places = [1, -1].map((s) => {
        const pl = k.headE.dir(s * 0.38, 1, 0.45, -0.02);
        k.add(k.head, shell, cyl(0.022, 0.018, 0.14, { p: at(pl, 0, 0.065) }, 6));
        return faceForward(pl.p.clone().add(new THREE.Vector3(0, 0.155, 0.01)));
      }) as [Place, Place];
      eyes(k, { places, ball: "#ffffff", size: 0.82, down: 0.05 });
      blush(k, { x: 0.22, y: -0.02, r: [0.06, 0.035] });
      mouth(k, k.headE, "smile", { y: -0.035, size: 1.25 });
      // claws
      for (const s of [1, -1]) {
        const arm = k.joint(s > 0 ? "armL" : "armR", k.body, [s * 0.3, 0.2, 0.08], [-0.5, 0, s * 0.95]);
        k.add(arm, shell, capsule(0.028, 0.06, { p: [0, -0.05, 0] }, 6, 2), ell([0.07, 0.065, 0.06], { p: [0, -0.12, 0] }, [10, 8]));
        k.add(arm, shell, ell([0.042, 0.08, 0.042], { p: [s * 0.022, -0.2, 0], r: [0, 0, -s * 0.28] }, [10, 7]));
        const pinch = k.joint(s > 0 ? "pinchL" : "pinchR", arm, [-s * 0.035, -0.15, 0], [0, 0, 0]);
        k.add(pinch, light, ell([0.03, 0.06, 0.032], { p: [-s * 0.012, -0.045, 0], r: [0, 0, s * 0.35] }, [8, 6]));
        k.extra[s > 0 ? "pinchL" : "pinchR"] = pinch;
        if (s > 0) k.armL = arm;
        else k.armR = arm;
      }
      // three little legs per side
      for (const s of [1, -1]) {
        const j = k.joint(s > 0 ? "legL" : "legR", k.rig, [s * 0.2, 0.13, -0.02]);
        const segs: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 3; i++) {
          const z = (i - 1) * 0.085;
          segs.push(taperTube([[0, 0, z], [s * 0.09, 0.02, z * 1.2], [s * 0.15, -0.12, z * 1.4]], 0.022, 0.016, {}, 6, 5));
        }
        k.add(j, shell, ...segs);
        if (s > 0) k.legL = j;
        else k.legR = j;
      }
      k.gait = "scuttle";
      k.neck = { at: [0, 0.1, 0.25], r: [0.1, 0.1], tilt: 0, tube: 0.03, bow: true };
      k.back = { at: [0, 0.3, -0.25], r: [0.1, 0.09, 0.05] };
      k.top = { at: [0, 0.42, -0.05] };
      k.fit = 0.8;
      k.animate = (a) => {
        const p = 0.35 * Math.max(0, Math.sin(a.t * 3.2)) ** 2 + 0.3 * (a.w.cheer ?? 0) * Math.abs(Math.sin(a.t * 12));
        const L = k.extra.pinchL, R = k.extra.pinchR;
        L.g.rotation.z = L.r0.z + p;
        R.g.rotation.z = R.r0.z - p;
        if (k.legL && k.legR) {
          const sc = Math.sin(a.phase * 2) * 0.3 * a.move;
          k.legL.g.rotation.z = sc;
          k.legR.g.rotation.z = sc;
        }
      };
    },
  },

  // ─────────────────────────────── FISH: round fish body, swishing tail fin, dorsal fin, hops/floats
  "animal-fish": {
    layout: { bodyY: 0.0, bodyC: [0, 0.1, 0], bodyR: [0.1, 0.08, 0.1], neckY: 0.14, headC: [0, 0.17, -0.04], headR: [0.28, 0.26, 0.35], hover: 0.12 },
    build(k) {
      const body = "#79c6ff", fin = "#ff9ecb", bellyC = "#e8f7ff", stripe = "#ffffff";
      headShell(k, body);
      k.add(k.head, bellyC, ell([0.17, 0.08, 0.24], { p: [0, k.headE.c.y - 0.19, k.headE.c.z + 0.02] }, [12, 8]));
      k.add(k.head, stripe, bandZ(k.headE, -0.1, 0.028, 0.006), bandZ(k.headE, -0.24, 0.022, 0.006));
      face(k, { eyes: { y: 0.03, x: 0.12, size: 1.05 }, blush: { x: 0.19, y: -0.06 }, mouth: { style: "none", y: -0.085 } });
      // pouty little fish lips
      const lp = k.headE.front(0, -0.085, 0.004);
      k.add(k.head, "#ff7fb0", torus(0.022, 0.011, { p: lp.pv, q: lp.q }, PI * 2, [5, 12]));
      k.add(k.head, fin, ell([0.018, 0.1, 0.13], { p: at(k.headE.dir(0, 1, -0.3), 0, 0.05), r: [-0.4, 0, 0] }, [8, 7]));
      const glow = k.glow("#c9f3ff", "#7fe9ff", 1.2);
      for (const [x, y, z] of [[0.12, 0.8, -0.3], [-0.14, 0.75, -0.2], [0.02, 0.9, 0.1], [0.2, 0.5, -0.6], [-0.2, 0.45, -0.65]] as const)
        k.decal(k.head, glow, k.headE.dir(x, y, z), [0.018, 0.018, 0.006]);
      arms(k, { color: fin, shape: "fin", x: 0.27, y: 0.26, z: 0.0, rest: 1.0 });
      const t = tailJoint(k, [0, 0.31, -0.37]);
      k.add(t, fin, ell([0.05, 0.05, 0.045], { p: [0, 0, -0.02] }, [8, 6]),
        ell([0.024, 0.15, 0.095], { p: [0, 0.08, -0.11], r: [-0.7, 0, 0] }, [8, 7]),
        ell([0.024, 0.15, 0.095], { p: [0, -0.08, -0.11], r: [0.7, 0, 0] }, [8, 7]));
      k.gait = "hop";
      k.neck = { at: [0, 0.31, -0.22], r: [0.235, 0.215], tilt: 0, tube: 0.026, vertical: true };
      k.back = { at: [0, 0.5, -0.2], r: [0.08, 0.07, 0.05] };
      k.lookScale = 0.35;
      k.fit = 0.82;
      k.animate = (a) => {
        const sw = Math.sin(a.t * (5 + 5 * a.move)) * (0.3 + 0.2 * a.move);
        t.g.rotation.y = t.r0.y + sw;
        k.head.g.rotation.y += -sw * 0.15;
        if (k.armL && k.armR) {
          const f = 0.3 * Math.sin(a.t * 6);
          k.armL.g.rotation.x = f;
          k.armR.g.rotation.x = -f;
        }
      };
    },
  },

  // ─────────────────────────────── CATERPILLAR: chain of segment balls with spots, antennae, tiny feet, wave
  "animal-caterpillar": {
    layout: { bodyR: [0.15, 0.13, 0.15], headR: [0.29, 0.265, 0.26] },
    build(k) {
      const green = "#9fe06a", alt = "#84d25a", spot = k.glow("#ffe066", "#ffe066", 1), feet = "#5aa84a";
      headShell(k, green);
      face(k, { eyes: { y: -0.02 }, blush: { x: 0.19, y: -0.1 }, mouth: { style: "smile", y: -0.105 } });
      const tipM = k.glow("#ff8fd0", "#ff7ac0", 1.2);
      earPair(k, [0.3, 0.95, 0.1], [0.1, 0, -0.35], (j) => {
        k.add(j, "#6a9a4a", taperTube([[0, 0, 0], [0, 0.07, 0], [0.025, 0.12, 0.03]], 0.012, 0.01, {}, 6, 5, false));
        k.add(j, tipM, ell([0.03, 0.03, 0.03], { p: [0.028, 0.135, 0.035] }, [8, 6]));
      }, -0.01);
      bodyShell(k, alt);
      k.decal(k.body, spot, k.bodyE.dir(0, 1, -0.4), [0.03, 0.03, 0.01]);
      arms(k, { color: green, r: 0.03, len: 0.02, x: 0.14 });
      legs(k, { color: feet, r: [0.04, 0.035, 0.05], x: 0.07 });
      const segs: THREE.Group[] = [];
      const radii = [0.13, 0.12, 0.105, 0.09];
      let z = -0.1;
      radii.forEach((r, i) => {
        z -= r * 1.35;
        const seg = k.joint(`seg${i}`, k.rig, [0, r + 0.01, z]);
        k.add(seg, i % 2 ? alt : green, ell([r, r, r], {}, [12, 8]));
        k.decal(seg, spot, new Ell([0, 0, 0], [r, r, r]).dir(0, 1, 0), [r * 0.3, r * 0.3, 0.01]);
        k.add(seg, feet, ell([0.03, 0.025, 0.035], { p: [r * 0.55, -r + 0.012, 0] }, [6, 4]), ell([0.03, 0.025, 0.035], { p: [-r * 0.55, -r + 0.012, 0] }, [6, 4]));
        k.extra[`seg${i}`] = seg;
        segs.push(seg.g);
      });
      k.tail = null;
      k.gait = "crawl";
      k.animate = (a) => {
        for (let i = 0; i < 4; i++) {
          const s = k.extra[`seg${i}`];
          const wv = Math.sin(a.phase * 1.0 - (i + 1) * 1.1);
          const idle = Math.sin(a.t * 2.3 - i * 0.7);
          s.g.position.y = s.p0.y + (0.045 * Math.max(0, wv) * a.move + 0.008 * idle) * (1 + (a.w.dance ?? 0) * 2);
          s.g.position.x = s.p0.x + (0.03 * Math.sin(a.t * 5.5 - i * 0.8)) * (a.w.dance ?? 0) + 0.015 * Math.sin(a.phase * 0.5 - i * 0.9) * a.move;
          s.g.scale.setScalar(1 + 0.03 * idle);
        }
      };
    },
  },

  // ─────────────────────────────── BEAVER: big buck teeth, flat paddle tail, cheeky muzzle
  "animal-beaver": {
    build(k) {
      const fur = "#b98359", muzzleC = "#f4dcc0", tailC = "#7a5642", nose = "#4a2f2f";
      headShell(k, fur);
      const mz = face(k, {
        eyes: { y: -0.005 },
        blush: { x: 0.205, y: -0.09 },
        muzzle: { color: muzzleC, y: -0.105, r: [0.125, 0.078, 0.078] },
        nose: { color: nose, r: [0.034, 0.024, 0.02] },
        mouth: { style: "smile" },
      })!;
      for (const s of [1, -1]) {
        const pl = mz.front(s * 0.0125, -0.058, -0.004);
        k.add(k.head, "#ffffff", box(0.023, 0.038, 0.012, { p: pl.pv, q: pl.q }));
      }
      earPair(k, [0.68, 0.66, -0.02], [0, 0, -0.4], (j) => {
        k.add(j, fur, ell([0.05, 0.045, 0.035], { p: [0, 0.02, 0] }, [8, 6]));
        k.add(j, tailC, ell([0.028, 0.025, 0.012], { p: [0, 0.018, 0.028] }, [6, 4]));
      });
      stdBody(k, fur, { belly: muzzleC, arm: { paw: tailC }, leg: { foot: tailC } });
      const t = tailJoint(k, [0, 0.02, -0.12], [0.45, 0, 0]);
      k.add(t, tailC, ell([0.1, 0.028, 0.15], { p: [0, 0, -0.13] }, [12, 6]));
      for (const dz of [-0.07, -0.13, -0.19]) k.add(t, "#5e4032", box(0.13 - Math.abs(dz + 0.13) * 0.6, 0.006, 0.008, { p: [0, 0.027, dz] }));
    },
  },

  // ─────────────────────────────── DEER: little antlers, big ears, white spots on the back, lashes
  "animal-deer": {
    build(k) {
      const fur = "#d99f63", white = "#fff5e6", antler = "#f3dcb0", nose = "#4a2f2f", inner = "#ffc8b8";
      headShell(k, fur);
      face(k, {
        eyes: { y: -0.015 },
        blush: { x: 0.2, y: -0.1 },
        muzzle: { color: white, y: -0.115, r: [0.1, 0.07, 0.072] },
        nose: { color: nose },
        mouth: { style: "smile" },
      });
      // eyelashes (outer corners)
      for (const [i, s] of [[0, 1], [1, -1]] as const) {
        const eye = i === 0 ? k.eyeL : k.eyeR;
        k.add(eye, "#2b1d2e", cone(0.01, 0.035, { p: [s * 0.05, 0.055, 0.01], r: [0, 0, -s * 0.8] }, 4), cone(0.009, 0.03, { p: [s * 0.062, 0.035, 0.008], r: [0, 0, -s * 1.3] }, 4));
      }
      earPair(k, [0.85, 0.42, -0.1], [0, 0, -1.1], (j) => {
        k.add(j, fur, ell([0.05, 0.11, 0.03], { p: [0, 0.09, 0] }, [8, 7]));
        k.add(j, inner, ell([0.03, 0.08, 0.012], { p: [0, 0.09, 0.022] }, [6, 5]));
      });
      for (const s of [1, -1]) {
        const pl = k.headE.dir(s * 0.3, 1, -0.05, -0.01);
        k.add(k.head, antler,
          taperTube([at(pl), at(pl, s * 0.02, 0.07), at(pl, s * 0.055, 0.13, -0.01)], 0.018, 0.013, {}, 6, 5),
          taperTube([at(pl, s * 0.017, 0.06), at(pl, -s * 0.01, 0.1, 0.01)], 0.013, 0.011, {}, 3, 5));
      }
      for (const [x, y, z] of [[0.08, 1, -0.4], [-0.1, 1, -0.3]] as const) k.decal(k.head, white, k.headE.dir(x, y, z), [0.02, 0.02, 0.006]);
      stdBody(k, fur, { belly: white, arm: { paw: "#8a5a44" }, leg: { foot: "#8a5a44" } });
      for (const [x, y, z] of [[0.5, 0.7, -0.6], [-0.5, 0.7, -0.6], [0.85, 0.2, -0.5], [-0.85, 0.2, -0.5], [0, 0.4, -1], [0.3, 0.0, -1], [-0.3, 0.0, -1]] as const)
        k.decal(k.body, white, k.bodyE.dir(x, y, z), [0.02, 0.02, 0.006]);
      const t = tailJoint(k, [0, 0.08, -0.13], [-0.4, 0, 0]);
      k.add(t, white, ell([0.04, 0.05, 0.03], { p: [0, 0.02, -0.02] }, [8, 6]));
      k.fit = 1.02;
    },
  },

  // ─────────────────────────────── CAT: triangle ears with pink insides, whiskers, curled tail, "w" mouth
  "animal-cat": {
    build(k) {
      const fur = "#cdc4f0", white = "#fffafc", stripe = "#a497dc", inner = "#ffb2c9", nose = "#ff86ab", whisker = "#7d6fb3";
      headShell(k, fur);
      for (const s of [1, -1]) k.add(k.head, white, ell([0.068, 0.055, 0.05], { p: at(k.headE.front(s * 0.045, -0.105, -0.028)) }, [10, 7]));
      face(k, {
        eyes: { y: -0.015, shape: [1.05, 1] },
        blush: { x: 0.2, y: -0.095 },
        nose: { color: nose, y: -0.068, r: [0.022, 0.015, 0.014], lift: 0.012 },
        mouth: { style: "w", y: -0.098, lift: 0.028 },
      });
      for (const s of [1, -1]) for (const [dy, r] of [[0.012, 0.12], [-0.012, -0.08]] as const) {
        const pl = k.headE.front(s * 0.15, -0.095 + dy, 0.004);
        k.add(k.head, whisker, cyl(0.0035, 0.0035, 0.11, { p: at(pl, s * 0.04, 0, 0.0), r: [0, -s * 0.35, PI / 2 + s * r] }, 4));
      }
      k.decal(k.head, stripe, k.headE.front(0, 0.2), [0.015, 0.05, 0.01]);
      for (const s of [1, -1]) k.decal(k.head, stripe, k.headE.front(s * 0.06, 0.19), [0.012, 0.038, 0.01], s * 0.3);
      earPair(k, [0.55, 0.8, -0.03], [0, 0, -0.3], (j) => {
        k.add(j, fur, cone(0.09, 0.18, { p: [0, 0.08, 0], s: [1, 1, 0.55] }, 8));
        k.add(j, inner, cone(0.055, 0.12, { p: [0, 0.065, 0.028], s: [1, 1, 0.3] }, 6));
      });
      stdBody(k, fur, { belly: white, arm: { paw: white }, leg: { foot: white } });
      const pts: V3[] = [[0, 0, 0], [0, 0.03, -0.08], [0, 0.13, -0.12], [0, 0.22, -0.1], [0, 0.26, -0.04], [0, 0.23, 0.0]];
      const t = tailJoint(k, [0, 0.05, -0.12]);
      k.add(t, fur, taperTube(pts, 0.03, 0.026, {}, 14, 6));
      k.add(t, stripe, ...curveRings(pts, [0.45, 0.7], 0.03, 0.01));
    },
  },

  // ─────────────────────────────── DOG: floppy ears, tongue out, eye patch, wagging tail
  "animal-dog": {
    build(k) {
      const fur = "#f7dcae", earC = "#b8825a", white = "#fff6e8", nose = "#3a2a33";
      headShell(k, fur);
      k.decal(k.head, earC, k.headE.front(0.125, -0.01, -0.004), [0.085, 0.092, 0.022], 0.3);
      face(k, {
        eyes: { y: -0.02, lift: 0.01 },
        blush: { x: 0.2, y: -0.105 },
        muzzle: { color: white, y: -0.11, r: [0.115, 0.078, 0.08], sink: 0.45 },
        nose: { color: nose, r: [0.042, 0.03, 0.026] },
        mouth: { style: "smile", tongue: true },
      });
      earPair(k, [0.72, 0.62, -0.02], [0, 0, 0.1], (j, s) => {
        k.add(j, earC, ell([0.045, 0.14, 0.085], { p: [s * 0.04, -0.09, 0], r: [0, 0, s * 0.28] }, [10, 8]));
      }, -0.01);
      stdBody(k, fur, { belly: white, arm: { paw: white }, leg: { foot: white } });
      k.decal(k.body, earC, k.bodyE.back(0.05, 0.05), [0.07, 0.055, 0.012]);
      const t = tailJoint(k, [0, 0.07, -0.13]);
      k.add(t, fur, taperTube([[0, 0, 0], [0, 0.06, -0.06], [0, 0.13, -0.07]], 0.03, 0.02, {}, 8, 6));
      k.add(t, white, ell([0.024, 0.03, 0.024], { p: [0, 0.14, -0.068] }, [6, 5]));
      k.animate = (a) => {
        const wag = Math.sin(a.t * 15) * (0.45 + 0.3 * ((a.w.cheer ?? 0) + (a.w.fetch ?? 0))) * (1 - 0.8 * (a.w.sad ?? 0) - 0.9 * (a.w.sleep ?? 0));
        t.g.rotation.z = wag;
      };
    },
  },
  // ═══════════════════ Star Pets-only designs (not kid-selectable: they're not in PARK_ANIMALS)

  // ─────────────────────────────── DRAGON: swept-back horns, bat wings that flap, spiked tail with a
  // spade tip, banded belly scales, amber slit eyes that glow at twilight
  "animal-dragon": {
    layout: { headR: [0.315, 0.275, 0.27] },
    build(k) {
      const skin = "#3fbf9c", light = "#86e3c6", bellyC = "#ffe3a3", band = "#f2b85a", horn = "#fff0c8", dark = "#23705f";
      const spike = k.glow("#9b7dff", "#b89cff", 0.9);
      const membrane = k.glow("#b9a2ff", "#c9b4ff", 0.35);
      headShell(k, skin);
      const mz = face(k, {
        eyes: { y: 0.0, x: 0.125, size: 1.02, iris: "#ffb43d", irisGlow: "#ffc24a", irisGlowStrength: 1.3, pupil: "#2b1630", shape: [1.02, 1] },
        blush: { x: 0.215, y: -0.095, r: [0.048, 0.028] },
        muzzle: { color: light, y: -0.12, r: [0.155, 0.09, 0.1], sink: 0.32 },
        nose: false,
        mouth: { style: "smile", size: 1.15 },
      })!;
      // nostrils + a tiny fang peeking out of the smile
      for (const s of [1, -1]) k.decal(k.head, dark, mz.dir(s * 0.36, 0.5, 1), [0.02, 0.012, 0.007], s * 0.5);
      k.add(k.mouth, "#ffffff", cone(0.011, 0.024, { p: [0.019, -0.004, 0.004], r: [PI, 0, 0] }, 5));
      // swept-back horns
      for (const s of [1, -1]) {
        const pl = k.headE.dir(s * 0.42, 0.9, -0.2, -0.015);
        k.add(k.head, horn, taperTube([at(pl), at(pl, s * 0.03, 0.08, -0.03), at(pl, s * 0.05, 0.14, -0.1), at(pl, s * 0.05, 0.16, -0.17)], 0.04, 0.009, {}, 10, 6));
      }
      // crest spikes down the middle of the head
      for (const [z, h] of [[0.15, 0.075], [-0.2, 0.1], [-0.6, 0.095], [-1.05, 0.075], [-1.6, 0.06]] as const) {
        const pl = k.headE.dir(0, 1, z, -0.01);
        k.add(k.head, spike, cone(h * 0.45, h, { p: at(pl), q: orient(pl, 0, [-PI / 2 - 0.35, 0, 0]), s: [0.55, 1, 1] }, 6));
      }
      // finned ears
      earPair(k, [1, 0.28, -0.3], [0, -0.5, -1.25], (j) => {
        k.add(j, membrane, cone(0.055, 0.15, { p: [0, 0.07, 0], s: [1, 1, 0.3] }, 6));
      }, -0.03);
      stdBody(k, skin, { leg: { foot: bellyC } });
      // banded belly plates
      const br: V3 = [0.115, 0.108, 0.05];
      belly(k, bellyC, br, -0.005);
      const bpl = k.bodyE.front(0, -0.005, -br[2] * 0.62);
      const be = new Ell(bpl.pv, br);
      for (const y of [0.05, 0.0, -0.05]) k.decal(k.body, band, be.front(0, y, -0.002), [Math.sqrt(1 - (y / br[1]) ** 2) * br[0] * 0.85, 0.006, 0.012]);
      // back spikes
      for (const [y, h] of [[0.12, 0.06], [0.05, 0.065], [-0.02, 0.055]] as const) {
        const pl = k.bodyE.back(0, y);
        k.add(k.body, spike, cone(h * 0.45, h, { p: pl.pv, q: orient(pl, 0, [PI / 2 - 0.5, 0, 0]), s: [0.55, 1, 1] }, 6));
      }
      // claws on the toes
      for (const leg of [k.legL, k.legR]) if (leg) for (const x of [-0.028, 0, 0.028]) k.add(leg, bellyC, cone(0.012, 0.03, { p: [x, -0.07, 0.09], r: [PI / 2, 0, 0] }, 5));
      // wings: a bone along the leading edge + a scalloped membrane
      for (const s of [1, -1] as const) {
        const w = k.joint(s > 0 ? "wingL" : "wingR", k.body, [s * 0.07, 0.19, -0.1], [0.1, s * 0.45, s * 0.38]);
        const W = 1.42;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(0.1 * W, 0.17 * W, 0.28 * W, 0.2 * W);
        shape.quadraticCurveTo(0.24 * W, 0.12 * W, 0.26 * W, 0.04 * W);
        shape.quadraticCurveTo(0.2 * W, 0.08 * W, 0.16 * W, 0.0);
        shape.quadraticCurveTo(0.12 * W, 0.04 * W, 0.07 * W, -0.04 * W);
        shape.quadraticCurveTo(0.05 * W, 0.0, 0, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 5 });
        g.translate(0, 0, -0.006);
        if (s < 0) g.scale(-1, 1, 1);
        k.add(w, membrane, g);
        // arm bone along the leading edge, finger struts to the scallop points, a claw on top
        k.add(w, skin,
          taperTube([[0, 0, 0.004], [s * 0.1 * W, 0.16 * W, 0.004], [s * 0.28 * W, 0.2 * W, 0.004]], 0.024, 0.01, {}, 8, 5),
          taperTube([[s * 0.1 * W, 0.15 * W, 0.006], [s * 0.26 * W, 0.04 * W, 0.006]], 0.009, 0.006, {}, 3, 4),
          taperTube([[s * 0.09 * W, 0.14 * W, 0.006], [s * 0.16 * W, 0.0, 0.006]], 0.009, 0.006, {}, 3, 4),
          cone(0.014, 0.05, { p: [s * 0.3 * W, 0.215 * W, 0.004], r: [0, 0, -s * 1.1] }, 5));
        k.extra[s > 0 ? "wingL" : "wingR"] = w;
      }
      // tail: thick, curling up and to one side, spiked, spade tip
      const pts: V3[] = [[0, 0, 0], [0, -0.03, -0.09], [0.02, -0.02, -0.19], [0.06, 0.03, -0.27], [0.1, 0.1, -0.3]];
      const t = tailJoint(k, [0, 0.03, -0.12]);
      k.add(t, skin, taperTube(pts, 0.055, 0.016, {}, 14, 7));
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const Y = new THREE.Vector3(0, 1, 0);
      for (const [u, h] of [[0.25, 0.05], [0.47, 0.045], [0.67, 0.038]] as const) {
        const p = curve.getPointAt(u);
        const tg = curve.getTangentAt(u);
        const up = Y.clone().addScaledVector(tg, -tg.y).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(Y, up.clone().addScaledVector(tg, -0.5).normalize());
        const r = 0.055 + (0.016 - 0.055) * u;
        k.add(t, spike, cone(h * 0.45, h, { p: [p.x + up.x * r * 0.8, p.y + up.y * r * 0.8, p.z + up.z * r * 0.8], q, s: [0.55, 1, 1] }, 6));
      }
      const end = curve.getPointAt(1), etg = curve.getTangentAt(1);
      const eq = new THREE.Quaternion().setFromUnitVectors(Y, etg);
      k.add(t, spike, cone(0.05, 0.085, { p: [end.x + etg.x * 0.035, end.y + etg.y * 0.035, end.z + etg.z * 0.035], q: eq, s: [1, 1, 0.3] }, 8));
      k.back = { at: [0, 0.12, -0.14], r: [0.085, 0.09, 0.05] };
      k.fit = 1.02;
      k.animate = (a) => {
        const L = k.extra.wingL, R = k.extra.wingR;
        const busy = Math.min(1, (a.w.cheer ?? 0) + (a.w.dance ?? 0) + (a.w.fetch ?? 0) + a.run * a.move);
        const rest = Math.min(1, (a.w.sleep ?? 0) + 0.8 * (a.w.sad ?? 0));
        const f = Math.sin(a.t * (5 + 9 * busy)) * (0.22 + 0.35 * busy) * (1 - 0.85 * rest);
        L.g.rotation.z = L.r0.z + f - 0.3 * rest;
        R.g.rotation.z = R.r0.z - f + 0.3 * rest;
        L.g.rotation.y = L.r0.y + 0.25 * f;
        R.g.rotation.y = R.r0.y - 0.25 * f;
      };
    },
  },

  // ─────────────────────────────── UNICORN: spiral golden horn (glows), flowing pastel mane & tail,
  // lashes, golden hooves, a star mark and a few sparkles
  "animal-unicorn": {
    build(k) {
      const coat = "#fdf8ff", maneA = "#ff9fd2", maneB = "#a996ff", hoof = "#f4c95d", nostril = "#f4a7c5", inner = "#ffd2e6";
      const hornM = k.glow("#ffe08a", "#ffe38a", 1.1);
      const sparkle = k.glow("#fff2a8", "#fff08a", 1.4);
      headShell(k, coat);
      const mz = face(k, {
        eyes: { y: -0.005, iris: "#4a2c6e", irisGlow: "#b48cff", irisGlowStrength: 0.8 },
        blush: { x: 0.205, y: -0.09 },
        muzzle: { color: "#f6ecff", y: -0.12, r: [0.125, 0.08, 0.085], sink: 0.45 },
        nose: false,
        mouth: { style: "smile" },
      })!;
      for (const s of [1, -1]) k.decal(k.head, nostril, mz.dir(s * 0.4, 0.45, 1), [0.014, 0.01, 0.006], s * 0.5);
      for (const [i, s] of [[0, 1], [1, -1]] as const) {
        const eye = i === 0 ? k.eyeL : k.eyeR;
        k.add(eye, EYE, cone(0.01, 0.035, { p: [s * 0.05, 0.055, 0.01], r: [0, 0, -s * 0.8] }, 4), cone(0.009, 0.03, { p: [s * 0.062, 0.035, 0.008], r: [0, 0, -s * 1.3] }, 4));
      }
      // horn: a cone with a spiral ridge wrapped round it
      const hp = k.headE.dir(0, 0.85, 0.5, -0.03);
      const hq = orient(hp, 0, [PI / 2 - 0.2, 0, 0]);
      const hornUp = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
      const HH = 0.31, R0 = 0.058;
      const horn = cone(R0, HH, { p: [0, HH / 2, 0] }, 12);
      const helix: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, a = u * PI * 2 * 2.6;
        const r = R0 * (1 - u) + 0.002;
        helix.push([Math.cos(a) * r, u * HH * 0.92, Math.sin(a) * r]);
      }
      const ridge = taperTube(helix, 0.012, 0.004, {}, 30, 4);
      for (const g of [horn, ridge]) {
        g.applyQuaternion(hq);
        g.translate(hp.p.x, hp.p.y, hp.p.z);
      }
      k.add(k.head, hornM, horn);
      k.add(k.head, hoof, ridge);
      const tip = hp.p.clone().addScaledVector(hornUp, HH + 0.03);
      // four-point sparkles round the horn tip
      const star = (c: THREE.Vector3, r: number) => [
        ell([r * 0.28, r, r * 0.28], { p: [c.x, c.y, c.z] }, [6, 4]),
        ell([r, r * 0.28, r * 0.28], { p: [c.x, c.y, c.z] }, [6, 4]),
      ];
      k.add(k.head, sparkle, ...star(tip.clone().add(new THREE.Vector3(0.07, -0.02, 0)), 0.03), ...star(tip.clone().add(new THREE.Vector3(-0.08, -0.08, 0.02)), 0.022));
      // flowing mane: a forelock + locks falling down the back of the head
      const H = k.headE;
      k.add(k.head, maneA,
        taperTube([at(H.dir(0.04, 1, 0.3), 0, 0.01), at(H.front(-0.1, 0.2, 0.015)), at(H.front(-0.2, 0.13, 0.012)), at(H.front(-0.26, 0.04, 0.008))], 0.05, 0.022, {}, 10, 6),
        taperTube([at(H.dir(0.1, 1, 0.05)), at(H.dir(0.2, 0.9, -0.3), 0.02, 0.03), at(H.dir(0.25, 0.5, -0.8), 0.04), at(H.dir(0.2, -0.1, -1), 0.03, 0, -0.02)], 0.075, 0.04, {}, 12, 6),
        taperTube([at(H.dir(-0.15, 1, -0.3)), at(H.dir(-0.2, 0.6, -0.9), -0.02, 0, -0.03), at(H.dir(-0.15, -0.2, -1), -0.01, -0.02, -0.03)], 0.07, 0.036, {}, 10, 6));
      k.add(k.head, maneB,
        taperTube([at(H.dir(0, 1, -0.1)), at(H.dir(0, 0.8, -0.6), 0, 0.03, 0.01), at(H.dir(0, 0.2, -1), 0, 0, -0.04), at(H.dir(0.05, -0.35, -1), 0.02, 0, -0.03)], 0.08, 0.042, {}, 12, 6),
        taperTube([at(H.dir(0.28, 0.85, -0.15)), at(H.dir(0.5, 0.4, -0.55), 0.03), at(H.dir(0.45, -0.2, -0.7), 0.02, 0, -0.02)], 0.06, 0.032, {}, 10, 6));
      // pointy horse ears
      earPair(k, [0.66, 0.72, -0.15], [0, 0.2, -0.5], (j) => {
        k.add(j, coat, cone(0.052, 0.13, { p: [0, 0.06, 0], s: [1, 1, 0.6] }, 8));
        k.add(j, inner, cone(0.03, 0.085, { p: [0, 0.05, 0.022], s: [1, 1, 0.3] }, 6));
      });
      stdBody(k, coat, { arm: {}, leg: { foot: hoof } });
      // star mark on each hip
      for (const s of [1, -1]) {
        const pl = k.bodyE.dir(s, 0.05, -0.4, 0.004);
        const g: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          g.push(ell([0.009, 0.026, 0.006], { p: [Math.sin(a) * 0.016, Math.cos(a) * 0.016, 0], r: [0, 0, -a] }, [5, 4]));
        }
        g.push(ell([0.014, 0.014, 0.007], {}, [6, 4]));
        const q = orient(pl);
        for (const x of g) {
          x.applyQuaternion(q);
          x.translate(pl.p.x, pl.p.y, pl.p.z);
        }
        k.add(k.body, sparkle, ...g);
      }
      // flowing two-tone tail
      const t = tailJoint(k, [0, 0.06, -0.13], [-0.2, 0, 0]);
      k.add(t, maneA, taperTube([[0, 0, 0], [0.01, 0.02, -0.08], [0.03, -0.04, -0.16], [0.02, -0.12, -0.2]], 0.045, 0.028, {}, 10, 6));
      k.add(t, maneB, taperTube([[0, 0.01, -0.01], [-0.02, 0.05, -0.09], [-0.04, 0.0, -0.18], [-0.03, -0.08, -0.23]], 0.04, 0.024, {}, 10, 6));
      k.fit = 1.06;
    },
  },

  // ─────────────────────────────── HIPPO: huge round snout with big nostrils, tiny high ears & eyes,
  // two little teeth, chubby tummy, stubby legs, tufted tail
  "animal-hippo": {
    layout: { bodyR: [0.185, 0.15, 0.165], headR: [0.32, 0.27, 0.27] },
    build(k) {
      const skin = "#b4a0dc", snout = "#dccbf3", inner = "#ff9fc0", nostril = "#6e4f94", tummy = "#e6dbf7";
      headShell(k, skin);
      const mz = face(k, {
        eyes: { y: 0.075, x: 0.125, size: 0.9, lift: 0.004 },
        blush: { x: 0.225, y: -0.035, r: [0.048, 0.03] },
        muzzle: { color: snout, y: -0.105, r: [0.23, 0.135, 0.13], sink: 0.55 },
        nose: false,
        mouth: { style: "smile", size: 1.9, y: -0.05 },
      })!;
      for (const s of [1, -1]) {
        const c = mz.dir(s * 0.45, 0.8, 0.55);
        k.add(k.head, snout, ell([0.048, 0.034, 0.04], { p: c.pv }, [8, 6]));
        k.decal(k.head, nostril, new Ell(c.pv, [0.048, 0.034, 0.04]).dir(0, 0.6, 1), [0.024, 0.017, 0.008], s * 0.5);
        // the eye bumps that make a hippo's silhouette
        k.add(k.head, skin, ell([0.085, 0.065, 0.06], { p: at(k.headE.front(s * 0.14, 0.19, -0.03)) }, [10, 7]));
      }
      for (const s of [1, -1]) k.add(k.mouth, "#ffffff", box(0.026, 0.028, 0.012, { p: [s * 0.03, -0.018, 0.0] }));
      earPair(k, [0.55, 0.85, -0.1], [0, 0, -0.35], (j) => {
        k.add(j, skin, ell([0.045, 0.04, 0.03], { p: [0, 0.02, 0] }, [8, 6]));
        k.add(j, inner, ell([0.026, 0.024, 0.01], { p: [0, 0.02, 0.024] }, [6, 4]));
      });
      stdBody(k, skin, { belly: tummy, bellyR: [0.13, 0.115, 0.05], arm: { paw: snout, x: 0.165 }, leg: { foot: snout, x: 0.09, r: [0.07, 0.055, 0.075] } });
      const t = tailJoint(k, [0, 0.05, -0.155]);
      k.add(t, skin, taperTube([[0, 0, 0], [0, -0.02, -0.04], [0, -0.05, -0.06]], 0.016, 0.012, {}, 6, 5));
      k.add(t, nostril, ell([0.018, 0.024, 0.018], { p: [0, -0.07, -0.065] }, [6, 5]));
      k.neck.r = [0.13, 0.115];
      k.fit = 0.98;
    },
  },
};
