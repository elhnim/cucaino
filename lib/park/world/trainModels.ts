// The park's steam train, as a real heritage narrow-gauge set: a Brunswick-green tank engine with
// a brass-banded boiler, crested side tanks, a lined cab, crimson-spoked driving wheels that turn
// and coupling rods that go round with them; an open teak excursion car (where the kid and their
// pet sit); and cream-and-crimson panelled coaches with curved canvas roofs. The paintwork is real
// artwork (public/park-assets/train/, packed by scripts/art-pack.mjs) wrapped on simple shapes.
//
// Used by both railways (the Sky Coaster's loop, world/steamTrain.ts, and the Wildlands Railway,
// world/railway/). Every car is built about the same origin as the old block models: forward +z,
// rail top at y = 0, the floor at about y = 0.95.
import * as THREE from "three";

const ART = "/park-assets/train/";

export interface TrainKit {
  build(kind: "loco" | "open" | "coach"): THREE.Group;
  /** turn every wheel of `car` for `dist` units travelled (and its coupling rods with them) */
  roll(car: THREE.Object3D, dist: number): void;
  /** the paint glows a little after dark (lamps and windows more) */
  setGlow(glow: number): void;
  dispose(): void;
}

const WHEEL_R = 0.5; // the engine's driving wheels
const BOGIE_R = 0.34; // carriage wheels

export function createTrainKit(opts: { lowQuality?: boolean } = {}): TrainKit {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const loader = new THREE.TextureLoader();
  const tex = (file: string, rx = 1, ry = 1, turn = false) => {
    if (typeof document === "undefined") return null;
    const t = keep(loader.load(ART + file));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.lowQuality ? 2 : 8;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if (turn) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
    return t;
  };
  const painted: THREE.MeshStandardMaterial[] = [];
  const paint = (map: THREE.Texture | null, fallback: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = keep(new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? "#ffffff" : fallback, roughness: 0.38, metalness: 0.08, emissive: "#ffffff", emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.22 : 0, ...o }));
    if (map) painted.push(m);
    return m;
  };
  const solid = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }));
  const black = solid("#17181c", { roughness: 0.6 });
  const blackBoth = solid("#17181c", { roughness: 0.6, side: THREE.DoubleSide });
  const green = solid("#0f3a22", { roughness: 0.35 });
  const red = solid("#b3202a", { roughness: 0.4 });
  const brass = solid("#e9bd4a", { roughness: 0.25, metalness: 0.6, emissive: "#7a5200", emissiveIntensity: 0.5 });
  const steel = solid("#b9bec6", { roughness: 0.3, metalness: 0.6 });
  const cushion = solid("#8f1a26", { roughness: 0.8 });
  const lamp = keep(new THREE.MeshBasicMaterial({ color: "#fff0b8" }));
  const mBoiler = paint(tex("loco-boiler.webp", 2, 1, true), "#0f3a22");
  const mCab = paint(tex("loco-cab-side.webp"), "#0f3a22");
  const mTank = paint(tex("tender-side.webp"), "#0f3a22");
  const mSmokebox = paint(tex("smokebox-front.webp"), "#17181c", { alphaTest: 0.5 });
  const mWheel = paint(tex("wheel.webp"), "#b3202a", { alphaTest: 0.5, side: THREE.DoubleSide });
  const mCoach = paint(tex("coach-side.webp", 2, 1), "#f1e2bf");
  const mCoachEnd = paint(tex("coach-end.webp"), "#f1e2bf");
  const mRoof = paint(tex("coach-roof.webp", 1, 3), "#d9d9d6", { roughness: 0.8, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const mOpen = paint(tex("open-car-side.webp", 3, 1), "#8a5a2b");
  const mOpenEnd = paint(tex("open-car-side.webp", 1.2, 1), "#8a5a2b");
  const mDeck = paint(tex("varnished-wood.webp", 1, 3), "#8a5a2b", { roughness: 0.45 });

  const geos = new Map<string, THREE.BufferGeometry>();
  const G = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
    let g = geos.get(key) as T | undefined;
    if (!g) {
      g = keep(make());
      geos.set(key, g);
    }
    return g;
  };
  const box = (w: number, h: number, l: number) => G(`b${w},${h},${l}`, () => new THREE.BoxGeometry(w, h, l));
  const cyl = (rt: number, rb: number, h: number, seg = 16) => G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const put = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = !opts.lowQuality;
    parent.add(o);
    return o;
  };
  const HALF_PI = Math.PI / 2;

  /** a wheel on one side: its painted face outside, a steel tyre and a dark back; spins about x */
  const wheel = (car: THREE.Group, side: number, z: number, r: number, gauge: number) => {
    const w = new THREE.Group();
    w.position.set(side * gauge, r, z);
    put(w, cyl(r, r, 0.14, opts.lowQuality ? 14 : 24), steel, 0, 0, 0, 0, 0, HALF_PI);
    const face = put(w, G(`w${r}`, () => new THREE.CircleGeometry(r * 0.96, opts.lowQuality ? 14 : 24)), mWheel, side * 0.075, 0, 0, 0, side * HALF_PI, 0);
    face.castShadow = false;
    car.add(w);
    (car.userData.wheels as { g: THREE.Group; r: number }[]).push({ g: w, r });
    return w;
  };
  const buffers = (car: THREE.Group, zEnd: number, y: number) => {
    for (const sz of [-1, 1]) {
      put(car, box(1.74, 0.34, 0.14), red, 0, y, sz * zEnd);
      for (const sx of [-0.55, 0.55]) put(car, cyl(0.13, 0.13, 0.26, 10), steel, sx, y, sz * (zEnd + 0.17), HALF_PI);
    }
  };

  function buildLoco(): THREE.Group {
    const car = new THREE.Group();
    car.userData.wheels = [];
    car.userData.rods = [];
    // frames, running plate, buffer beams
    put(car, box(1.5, 0.34, 5.0), black, 0, 0.72, 0);
    put(car, box(1.86, 0.08, 5.0), black, 0, 0.93, 0);
    buffers(car, 2.55, 0.72);
    // the boiler (brass bands and rivets), the smokebox with its door, the chimney and the dome
    const boilerY = 1.72;
    put(car, G("boiler", () => new THREE.CylinderGeometry(0.74, 0.74, 2.6, opts.lowQuality ? 18 : 28, 1, true)), mBoiler, 0, boilerY, 0.45, HALF_PI);
    put(car, cyl(0.78, 0.78, 0.62, opts.lowQuality ? 18 : 28), black, 0, boilerY, 2.05, HALF_PI);
    put(car, G("smokedoor", () => new THREE.CircleGeometry(0.76, 28)), mSmokebox, 0, boilerY, 2.365).castShadow = false;
    put(car, cyl(0.2, 0.26, 0.75, 14), black, 0, boilerY + 1.0, 2.05);
    put(car, cyl(0.3, 0.2, 0.2, 14), brass, 0, boilerY + 1.45, 2.05);
    put(car, G("dome", () => new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, HALF_PI)), brass, 0, boilerY + 0.68, 0.75);
    put(car, cyl(0.34, 0.34, 0.16, 16), brass, 0, boilerY + 0.62, 0.75);
    put(car, cyl(0.07, 0.09, 0.3, 8), brass, 0, boilerY + 0.85, -0.2);
    // handrails along the boiler, a lamp on the smokebox
    for (const sx of [-1, 1]) put(car, cyl(0.025, 0.025, 2.9, 6), steel, sx * 0.8, boilerY + 0.28, 0.75, HALF_PI);
    put(car, box(0.22, 0.26, 0.2), black, 0, boilerY + 0.9, 2.3);
    put(car, G("lamp", () => new THREE.CircleGeometry(0.09, 12)), lamp, 0, boilerY + 0.9, 2.41).castShadow = false;
    // side tanks: lined green panels with the crest
    for (const sx of [-1, 1]) {
      const tank = put(car, box(0.3, 1.0, 2.3), [sx > 0 ? mTank : green, sx < 0 ? mTank : green, green, green, green, green], sx * 0.78, 1.47, 0.3);
      tank.castShadow = !opts.lowQuality;
    }
    // the cab: lined sides with a brass-framed window and the crest, a curved black roof
    put(car, box(1.82, 1.85, 1.5), [mCab, mCab, black, black, green, green], 0, 1.9, -1.72);
    const roof = put(car, G("cabroof", () => new THREE.CylinderGeometry(1.05, 1.05, 1.8, 14, 1, false, Math.PI - 1.05, 2.1)), blackBoth, 0, 2.3, -1.72, HALF_PI);
    roof.scale.set(1, 1, 1);
    // coal bunker behind the cab
    put(car, box(1.7, 0.9, 0.5), green, 0, 1.42, -2.3);
    put(car, box(1.5, 0.12, 0.4), black, 0, 1.9, -2.3);
    // six driving wheels with coupling rods, and a small trailing pair under the cab
    for (const sx of [-1, 1]) {
      const zs = [1.75, 0.6, -0.55];
      for (const z of zs) wheel(car, sx, z, WHEEL_R, 0.78);
      wheel(car, sx, -1.85, BOGIE_R, 0.78);
      const rod = put(car, box(0.05, 0.09, zs[0] - zs[2] + 0.25), red, sx * 0.9, WHEEL_R, (zs[0] + zs[2]) / 2);
      rod.castShadow = false;
      (car.userData.rods as { o: THREE.Mesh; r: number; z0: number; phase: number }[]).push({ o: rod, r: 0.2, z0: (zs[0] + zs[2]) / 2, phase: sx > 0 ? 0 : HALF_PI });
      // cylinders at the front
      put(car, cyl(0.2, 0.2, 0.6, 12), black, sx * 0.88, 0.62, 2.2, HALF_PI);
    }
    return car;
  }

  function underframe(car: THREE.Group, len: number) {
    put(car, box(1.6, 0.26, len), black, 0, 0.72, 0);
    buffers(car, len / 2 + 0.05, 0.72);
    for (const sx of [-1, 1]) for (const z of [-len / 2 + 0.85, len / 2 - 0.85]) wheel(car, sx, z, BOGIE_R, 0.74);
  }

  function buildCoach(): THREE.Group {
    const car = new THREE.Group();
    car.userData.wheels = [];
    const len = 4.5;
    underframe(car, len);
    // the body: panelled sides with their windows, a door at each end, a curved canvas roof
    const h = 1.6;
    put(car, box(1.84, h, len), [mCoach, mCoach, black, black, mCoachEnd, mCoachEnd], 0, 0.86 + h / 2, 0);
    const roof = put(car, G("coachroof", () => new THREE.CylinderGeometry(1.18, 1.18, len + 0.3, 14, 1, false, Math.PI - 0.92, 1.84)), mRoof, 0, 0.86 + h - 0.715, 0, HALF_PI);
    roof.scale.set(1, 1, 1);
    // gold beading along the cantrail, a lamp at each end
    for (const sx of [-1, 1]) put(car, box(0.05, 0.05, len + 0.1), brass, sx * 0.93, 0.86 + h, 0);
    for (const sz of [-1, 1]) put(car, G("lamp", () => new THREE.CircleGeometry(0.09, 12)), lamp, 0.6, 0.86 + h - 0.25, sz * (len / 2 + 0.01), 0, sz > 0 ? 0 : Math.PI).castShadow = false;
    return car;
  }

  function buildOpen(): THREE.Group {
    const car = new THREE.Group();
    car.userData.wheels = [];
    const len = 4.5;
    underframe(car, len);
    // a varnished deck, low teak sides with a brass handrail, cushioned benches facing each other
    put(car, box(1.84, 0.12, len), [black, black, mDeck, black, black, black], 0, 0.92, 0);
    const sideH = 0.72;
    for (const sx of [-1, 1]) put(car, box(0.1, sideH, len), [mOpen, mOpen, brass, black, mOpen, mOpen], sx * 0.87, 0.98 + sideH / 2, 0);
    for (const sz of [-1, 1]) put(car, box(1.84, sideH, 0.1), [mOpenEnd, mOpenEnd, brass, black, mOpenEnd, mOpenEnd], 0, 0.98 + sideH / 2, sz * (len / 2 - 0.05));
    for (const z of [-1.5, 1.5]) {
      put(car, box(1.5, 0.16, 0.5), cushion, 0, 1.22, z);
      put(car, box(1.5, 0.5, 0.1), cushion, 0, 1.5, z + Math.sign(z) * 0.3);
    }
    // brass corner posts with ball tops
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        put(car, cyl(0.045, 0.045, 0.5, 8), brass, sx * 0.87, 0.98 + sideH + 0.2, sz * (len / 2 - 0.05));
        put(car, G("ball", () => new THREE.SphereGeometry(0.08, 10, 8)), brass, sx * 0.87, 0.98 + sideH + 0.48, sz * (len / 2 - 0.05));
      }
    return car;
  }

  return {
    build(kind) {
      const g = kind === "loco" ? buildLoco() : kind === "coach" ? buildCoach() : buildOpen();
      g.userData.rolled = 0;
      return g;
    },
    roll(car, dist) {
      car.userData.rolled = ((car.userData.rolled as number) ?? 0) + dist;
      const d = car.userData.rolled as number;
      for (const w of (car.userData.wheels as { g: THREE.Group; r: number }[] | undefined) ?? []) w.g.rotation.x = d / w.r;
      // each coupling rod rides a crank pin on its wheels: round in a small circle, staying level
      for (const rod of (car.userData.rods as { o: THREE.Mesh; r: number; z0: number; phase: number }[] | undefined) ?? []) {
        const a = d / WHEEL_R + rod.phase;
        rod.o.position.y = WHEEL_R - Math.cos(a) * rod.r;
        rod.o.position.z = rod.z0 + Math.sin(a) * rod.r;
      }
    },
    setGlow(glow) {
      for (const m of painted) m.emissiveIntensity = (m === mRoof ? 0.1 : 0.2) + glow * 0.3;
      lamp.color.set(glow > 0.4 ? "#fff3c4" : "#d8cfa8");
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
