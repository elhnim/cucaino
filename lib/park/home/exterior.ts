// My Home from the outside: a little candy cottage for the island (the "My Home" place). Built
// from primitives with the park's toon look; the front door faces +Z (turn the group to face
// the path). Every mesh carries userData.placeId so a tap walks the kid to the door.
//
//   const home = buildHomeExterior(theme.accent, "my-home");
//   home.group.position.set(place.x, groundY(place.x, place.z), place.z);
//   (or, in buildPark: `p.id === "my-home" ? buildHomeExterior() : null` next to buildQuestBoard())
import * as THREE from "three";
import { getToonRamp } from "../assets/loader";
import { lighten } from "./furniture";

/** Same shape as lib/park/world/landmarks.ts `Landmark`, so buildPark can treat it like one. */
export function buildHomeExterior(accent = "#ff5fa8", placeId = "my-home"): { group: THREE.Group; update: (dt: number, t: number) => void; dispose: () => void } {
  const group = new THREE.Group();
  group.name = "my-home-cottage";
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.Material>();
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshToonMaterial({ color: c, gradientMap: getToonRamp() })));
    return m;
  };
  const add = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; s?: [number, number, number] } = {}) => {
    geos.push(g);
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x, y, z);
    m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    if (o.s) m.scale.set(...o.s);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const W = 5.2;
  const D = 4.2;
  const H = 3.1;
  // base + walls
  add(new THREE.BoxGeometry(W + 0.6, 0.35, D + 0.6), "#e8cfa6", 0, 0.17, 0);
  add(new THREE.BoxGeometry(W, H, D), "#fff1d6", 0, 0.35 + H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.28, H, 0.28), "#e3ab6c", (sx * W) / 2, 0.35 + H / 2, (sz * D) / 2);
  // candy roof (two slabs + a scalloped ridge)
  const roofY = 0.35 + H;
  const slope = 0.62;
  const slabW = D / 2 / Math.cos(slope) + 0.5;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(W + 0.9, 0.28, slabW), s < 0 ? "#ff8f8f" : "#ff7a86", 0, roofY + Math.sin(slope) * (slabW / 2) - 0.1, (s * D) / 4, { rx: s * slope });
  // gable ends
  const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, Math.tan(slope) * (D / 2))]);
  for (const s of [-1, 1]) add(new THREE.ShapeGeometry(tri), "#fff1d6", (s * W) / 2 * 0.999, roofY, 0, { ry: s * (Math.PI / 2) });
  add(new THREE.CylinderGeometry(0.16, 0.16, W + 0.9, 10), "#ffd36b", 0, roofY + Math.tan(slope) * (D / 2) + 0.05, 0, { rz: Math.PI / 2 });
  // chimney with a puff
  add(new THREE.BoxGeometry(0.7, 1.5, 0.7), "#e8b48a", -1.4, roofY + 1.2, -0.7);
  add(new THREE.BoxGeometry(0.85, 0.18, 0.85), "#c98d52", -1.4, roofY + 2.0, -0.7);
  const puffs = [0, 1, 2].map((i) => add(new THREE.SphereGeometry(0.28 + i * 0.08, 10, 8), "#ffffff", -1.4, roofY + 2.4 + i * 0.5, -0.7));
  // front door (+Z), windows, flower boxes
  const fz = D / 2 + 0.02;
  add(new THREE.BoxGeometry(1.2, 2.0, 0.12), "#7fd6b8", 0, 0.35 + 1.0, fz);
  add(new THREE.CircleGeometry(0.6, 20, 0, Math.PI), "#7fd6b8", 0, 0.35 + 2.0, fz + 0.06);
  add(new THREE.SphereGeometry(0.08, 8, 6), "#ffc53d", 0.38, 1.3, fz + 0.08);
  add(new THREE.BoxGeometry(1.6, 0.08, 0.7), "#ff9a7a", 0, 0.38, fz + 0.45);
  const glow = new THREE.MeshBasicMaterial({ color: "#fff2b8" });
  mats.set("__glow", glow);
  for (const sx of [-1, 1]) {
    const wx = sx * 1.65;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), glow);
    geos.push(pane.geometry);
    pane.position.set(wx, 1.9, fz + 0.01);
    group.add(pane);
    add(new THREE.BoxGeometry(1.2, 0.12, 0.14), "#ffffff", wx, 2.4, fz + 0.03);
    add(new THREE.BoxGeometry(1.25, 0.14, 0.3), "#ffffff", wx, 1.4, fz + 0.1);
    add(new THREE.BoxGeometry(0.08, 0.9, 0.08), "#ffffff", wx, 1.9, fz + 0.05);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.3, 1.1, 0.06), lighten(accent, 0.2), wx + s * 0.68, 1.9, fz + 0.05);
    add(new THREE.BoxGeometry(1.0, 0.22, 0.24), "#ff9a7a", wx, 1.25, fz + 0.2);
    for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.11, 8, 6), ["#ff8fc4", "#ffd36b", "#b99bff"][i], wx + (i - 1) * 0.3, 1.45, fz + 0.2);
  }
  // heart sign over the door
  add(new THREE.SphereGeometry(0.22, 10, 8), accent, -0.13, 3.0, fz + 0.06, { s: [1, 1, 0.4] });
  add(new THREE.SphereGeometry(0.22, 10, 8), accent, 0.13, 3.0, fz + 0.06, { s: [1, 1, 0.4] });
  add(new THREE.ConeGeometry(0.3, 0.4, 4), accent, 0, 2.78, fz + 0.06, { rx: Math.PI, s: [1.05, 1, 0.3] });
  // little fence + mailbox + bushes round the front garden
  for (let i = 0; i < 9; i++) {
    const x = -3.4 + i * 0.85;
    if (Math.abs(x) < 0.9) continue;
    add(new THREE.BoxGeometry(0.16, 0.8, 0.12), "#ffffff", x, 0.4, D / 2 + 1.8);
    add(new THREE.ConeGeometry(0.12, 0.2, 4), "#ffffff", x, 0.9, D / 2 + 1.8, { ry: Math.PI / 4 });
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(2.7, 0.1, 0.08), "#ffffff", s * 2.25, 0.55, D / 2 + 1.8);
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), "#c98d52", 2.9, 0.55, D / 2 + 2.3);
  add(new THREE.BoxGeometry(0.55, 0.4, 0.4), accent, 2.9, 1.25, D / 2 + 2.3);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.2), "#ffd36b", 3.2, 1.45, D / 2 + 2.3);
  for (const [x, z, s] of [
    [-3.3, 1.6, 0.7],
    [3.3, 1.2, 0.6],
    [-3.1, -1.4, 0.8],
    [3.2, -1.6, 0.7],
  ] as const)
    add(new THREE.SphereGeometry(1, 12, 9), "#7fd08f", x, s * 0.6, z, { s: [s, s * 0.8, s] });

  group.traverse((o) => (o.userData.placeId = placeId));
  return {
    group,
    update(_dt, t) {
      puffs.forEach((p, i) => {
        const k = (t * 0.35 + i / 3) % 1;
        p.position.y = roofY + 2.3 + k * 1.6;
        p.scale.setScalar(0.6 + k * 0.9);
      });
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
