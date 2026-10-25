// Role outfits: kid = knitted scarf + tiny backpack, pet = collar + gold tag,
// visitor = one small seeded accessory (bow, flower, party hat, glasses, glowing sprout) or none.
import * as THREE from "three";
import { cone, cyl, ell, orient, torus, type Kit, type V3 } from "./parts";

export function tint(hex: string, toward: string, amt: number): string {
  const a = new THREE.Color(hex), b = new THREE.Color(toward);
  return `#${a.lerp(b, amt).getHexString()}`;
}

function neckRing(k: Kit, tube: number, grow: number): THREE.BufferGeometry {
  const n = k.neck;
  const R = n.r[0] + grow;
  const g = torus(R, tube, {}, Math.PI * 2, [5, 16]);
  // lie flat (or stay upright for "vertical" collars, e.g. round a fish) and fit the ellipse
  g.scale(1, (n.r[1] + grow) / R, 1);
  if (!n.vertical) g.rotateX(Math.PI / 2 - n.tilt);
  g.translate(...n.at);
  return g;
}

function bowTie(k: Kit, color: string, knot: string, s = 1) {
  const [x, y, z] = k.neck.at;
  k.add(k.body, color,
    ell([0.05 * s, 0.034 * s, 0.022 * s], { p: [x + 0.045 * s, y, z], r: [0, 0, 0.3] }, [8, 6]),
    ell([0.05 * s, 0.034 * s, 0.022 * s], { p: [x - 0.045 * s, y, z], r: [0, 0, -0.3] }, [8, 6]));
  k.add(k.body, knot, ell([0.022 * s, 0.022 * s, 0.02 * s], { p: [x, y, z + 0.01 * s] }, [8, 6]));
}

export function kidOutfit(k: Kit, accent: string) {
  const light = tint(accent, "#ffffff", 0.45);
  const n = k.neck;
  if (n.bow) bowTie(k, accent, light, 1.2);
  else k.add(k.body, accent, neckRing(k, n.tube, 0.012));
  if (!n.vertical && !n.bow) {
    // knot + two hanging ends on the kid's left, the lower one striped
    const fz = n.at[2] + n.r[1] + 0.01;
    const x = n.r[0] * 0.45;
    k.add(k.body, accent, ell([0.034, 0.03, 0.026], { p: [x, n.at[1] - 0.02, fz - 0.012] }, [8, 6]));
    k.add(k.body, accent, ell([0.03, 0.062, 0.014], { p: [x + 0.012, n.at[1] - 0.07, fz - 0.004], r: [0.15, 0, 0.18] }, [8, 6]));
    k.add(k.body, light, ell([0.028, 0.02, 0.016], { p: [x + 0.024, n.at[1] - 0.122, fz - 0.002], r: [0.15, 0, 0.18] }, [8, 5]));
  }
  // backpack
  const b = k.back.at;
  const r: V3 = k.back.r ?? [0.1, 0.105, 0.055];
  k.add(k.body, accent, ell(r, { p: [b[0], b[1], b[2] - r[2] * 0.35] }, [10, 7]));
  k.add(k.body, light, ell([r[0] * 0.72, r[1] * 0.5, r[2] * 0.55], { p: [b[0], b[1] - r[1] * 0.35, b[2] - r[2] * 1.05] }, [10, 6]));
  k.add(k.body, "#ffd24a", ell([0.014, 0.014, 0.01], { p: [b[0], b[1] + r[1] * 0.05, b[2] - r[2] * 1.28] }, [6, 4]));
}

export function petOutfit(k: Kit, accent: string) {
  const n = k.neck;
  if (!n.bow) k.add(k.body, accent, neckRing(k, n.tube * 0.62, 0.004));
  const gold = k.glow("#ffd24a", "#ffcf4a", 0.8);
  // round tag hanging at the front (a bow-tie holds it when there's no neck to collar)
  const fz = n.at[2] + n.r[1] + 0.012;
  let y = n.at[1] - (n.vertical ? n.r[1] : 0.045);
  let z = n.vertical ? n.at[2] + 0.02 : fz;
  if (n.bow) {
    bowTie(k, accent, accent, 0.85);
    y = n.at[1] - 0.05;
    z = n.at[2];
  }
  k.add(k.body, gold, cyl(0.034, 0.034, 0.012, { p: [0, y, z], r: [Math.PI / 2 - 0.25, 0, 0] }, 12));
  k.add(k.body, gold, torus(0.012, 0.004, { p: [0, y + 0.038, z - 0.004] }, Math.PI * 2, [4, 8]));
  k.add(k.body, "#e8a93a", ell([0.012, 0.012, 0.004], { p: [0, y, z + 0.008] }, [6, 4]));
}

const CANDY = ["#ff6fa8", "#7fb8ff", "#ffcf4a", "#a98bff", "#4fd1a5", "#ff8a5c", "#5ad0ff"];

export function visitorOutfit(k: Kit, rand: () => number) {
  const pick = Math.floor(rand() * 6);
  const col = CANDY[Math.floor(rand() * CANDY.length)];
  const col2 = CANDY[Math.floor(rand() * CANDY.length)];
  const H = k.headE;
  switch (pick) {
    case 1: {
      // bow on one side of the head
      const pl = H.dir(0.5, 0.8, 0.28, 0.01);
      const q = orient(pl, -0.35);
      const put = (g: THREE.BufferGeometry) => {
        g.applyQuaternion(q);
        g.translate(pl.p.x, pl.p.y, pl.p.z);
        return g;
      };
      k.add(k.head, col,
        put(ell([0.055, 0.036, 0.022], { p: [0.048, 0, 0.012], r: [0, 0, 0.35] }, [8, 6])),
        put(ell([0.055, 0.036, 0.022], { p: [-0.048, 0, 0.012], r: [0, 0, -0.35] }, [8, 6])),
        put(ell([0.024, 0.024, 0.024], { p: [0, 0, 0.02] }, [8, 6])));
      break;
    }
    case 2: {
      // flower tucked behind an ear
      const pl = H.dir(-0.55, 0.72, 0.35, 0.005);
      const q = orient(pl);
      const petals: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const g = ell([0.03, 0.03, 0.012], { p: [Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0.005] }, [8, 5]);
        g.applyQuaternion(q);
        g.translate(pl.p.x, pl.p.y, pl.p.z);
        petals.push(g);
      }
      k.add(k.head, col, ...petals);
      const c = ell([0.022, 0.022, 0.016], { p: [0, 0, 0.014] }, [8, 5]);
      c.applyQuaternion(q);
      c.translate(pl.p.x, pl.p.y, pl.p.z);
      k.add(k.head, k.glow("#ffe066", "#ffd84a", 0.7), c);
      break;
    }
    case 3: {
      // party hat
      const [x, y, z] = k.top.at;
      k.add(k.head, col, cone(0.075, 0.17, { p: [x + 0.02, y + 0.07, z], r: [0, 0, -0.25] }, 12));
      k.add(k.head, col2, torus(0.062, 0.012, { p: [x + 0.004, y + 0.012, z], r: [Math.PI / 2, 0.25, 0] }, Math.PI * 2, [4, 14]));
      k.add(k.head, "#ffffff", ell([0.028, 0.028, 0.028], { p: [x + 0.061, y + 0.155, z] }, [8, 6]));
      break;
    }
    case 4: {
      // round glasses
      if (!k.eyePlaces) break;
      const frame = "#5a3a6e";
      for (const pl of k.eyePlaces) {
        const g = torus(0.072, 0.009, {}, Math.PI * 2, [4, 16]);
        g.applyQuaternion(pl.q);
        g.translate(pl.p.x + pl.n.x * 0.04, pl.p.y + pl.n.y * 0.04, pl.p.z + pl.n.z * 0.04);
        k.add(k.head, frame, g);
      }
      const [a, b] = k.eyePlaces;
      const mid: V3 = [(a.p.x + b.p.x) / 2, (a.p.y + b.p.y) / 2 + 0.01, (a.p.z + b.p.z) / 2 + 0.045];
      const span = Math.abs(a.p.x - b.p.x) - 0.14;
      if (span > 0.01) k.add(k.head, frame, cyl(0.008, 0.008, span, { p: mid, r: [0, 0, Math.PI / 2] }, 5));
      break;
    }
    case 5: {
      // glowing sprout (Pandora-ish)
      const [x, y, z] = k.top.at;
      const leaf = k.glow("#7be08f", "#7dffb0", 0.9);
      k.add(k.head, "#5fbf6f", cyl(0.008, 0.007, 0.07, { p: [x, y + 0.03, z] }, 5));
      k.add(k.head, leaf,
        ell([0.045, 0.016, 0.024], { p: [x + 0.04, y + 0.07, z], r: [0, 0, 0.45] }, [8, 5]),
        ell([0.045, 0.016, 0.024], { p: [x - 0.04, y + 0.075, z], r: [0, 0, -0.45] }, [8, 5]));
      break;
    }
    default:
      break;
  }
}
