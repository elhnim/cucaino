// Builds the candy-world theme park: a central plaza, themed lands joined by winding paths,
// a sky-train looping over everything, and lots of instanced candy decor. Nothing casts real
// shadows (soft blob shadows instead) and every repeated prop is one draw call per part.
import * as THREE from "three";
import type { ParkAssets, KitName } from "../assets/loader";
import { PLACES, LANDS, type PlaceDef, type LandDef } from "../registry/places";
import { labelSprite } from "@/lib/game3d/buildingKit";
import { zoneBounds } from "../builder/rules";

export interface BuiltPark {
  /** meshes that can be tapped, tagged with userData.placeId */
  tappables: THREE.Object3D[];
  places: PlaceDef[];
  lands: LandDef[];
  /** sampled points along every path (NPCs stroll between these) */
  pathPoints: THREE.Vector3[];
  update(dt: number, t: number): void;
  dispose(): void;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D) => void, repeat = 1) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 4;
  return tex;
}

/** Minty candy meadow with a few sugar sprinkles. */
function meadowTexture() {
  return canvasTexture(
    256,
    (c) => {
      c.fillStyle = "#6fe8ab";
      c.fillRect(0, 0, 256, 256);
      const r = rng(7);
      for (let i = 0; i < 26; i++) {
        c.fillStyle = r() < 0.5 ? "rgba(88,214,150,0.6)" : "rgba(140,245,190,0.6)";
        c.beginPath();
        c.ellipse(r() * 256, r() * 256, 14 + r() * 20, 10 + r() * 14, r() * Math.PI, 0, Math.PI * 2);
        c.fill();
      }
      const sprinkles = ["#ff6fb5", "#ffd84a", "#5ec8ff", "#ffffff", "#b98bff"];
      for (let i = 0; i < 10; i++) {
        c.save();
        c.translate(r() * 256, r() * 256);
        c.rotate(r() * Math.PI);
        c.fillStyle = sprinkles[i % sprinkles.length];
        c.beginPath();
        c.roundRect(-6, -2.2, 12, 4.4, 2.2);
        c.fill();
        c.restore();
      }
    },
    40,
  );
}

function plazaTexture() {
  return canvasTexture(
    128,
    (c) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          c.fillStyle = (x + y) % 2 ? "#ffb0d5" : "#fff2f8";
          c.fillRect(x * 16, y * 16, 16, 16);
        }
    },
    5,
  );
}

function skyTexture() {
  return canvasTexture(256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#b9a6ff");
    g.addColorStop(0.45, "#ffc2e2");
    g.addColorStop(0.75, "#ffe3cc");
    g.addColorStop(1, "#fff1d9");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function blobTexture() {
  return canvasTexture(64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(120,40,110,0.35)");
    g.addColorStop(1, "rgba(120,40,110,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

/** soft-edged land disc so each land reads as its own coloured area */
function landTexture(color: string) {
  return canvasTexture(128, (c) => {
    const g = c.createRadialGradient(64, 64, 20, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.82, color);
    g.addColorStop(1, color + "00");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

function stripeTexture() {
  return canvasTexture(64, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? "#ffffff" : "#ff5fa8";
      c.fillRect(0, i * 8, 64, 8);
    }
  });
}

const m4 = (x: number, y: number, z: number, s: number, rotY = 0, sy = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, sy, s));

export async function buildPark(scene: THREE.Scene, assets: ParkAssets): Promise<BuiltPark> {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const toon = (color: string) => track(new THREE.MeshToonMaterial({ color }));
  const r = rng(20260927);

  // ── sky, fog, light ──
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(450, 24, 16)), track(new THREE.MeshBasicMaterial({ map: track(skyTexture()), side: THREE.BackSide, fog: false, depthWrite: false })));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffd0e6, 150, 420);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c8ff, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(-30, 50, 25);
  scene.add(sun);

  // ── ground + plaza ──
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(400, 64)), track(new THREE.MeshToonMaterial({ map: track(meadowTexture()) })));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const plaza = new THREE.Mesh(track(new THREE.CylinderGeometry(8.5, 8.8, 0.25, 48)), track(new THREE.MeshToonMaterial({ map: track(plazaTexture()) })));
  plaza.position.y = 0.12;
  scene.add(plaza);
  const rim = new THREE.Mesh(track(new THREE.TorusGeometry(8.7, 0.28, 8, 64)), toon("#ff9ccf"));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.26;
  scene.add(rim);

  // each land gets its own softly-tinted ground
  const discGeo = track(new THREE.CircleGeometry(1, 40));
  for (const land of LANDS) {
    if (land.id === "dream") continue; // the Dream Park draws its own checker lawn
    const disc = new THREE.Mesh(discGeo, track(new THREE.MeshToonMaterial({ map: track(landTexture(land.ground)), transparent: true, depthWrite: false })));
    disc.rotation.x = -Math.PI / 2;
    disc.scale.setScalar(land.radius + 3);
    disc.position.set(land.x, 0.015, land.z);
    scene.add(disc);
  }

  // ── winding paths: plaza -> each land entrance ──
  const pathMats: THREE.Matrix4[] = [];
  const pathPoints: THREE.Vector3[] = [];
  const pathSamples: THREE.Vector3[] = [];
  const addCurve = (pts: THREE.Vector3[]) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength();
    const n = Math.max(2, Math.ceil(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      pathMats.push(m4(p.x, 0.02, p.z, 3, Math.atan2(tg.x, tg.z), 1));
      pathSamples.push(p);
      if (i % 3 === 0) pathPoints.push(p.clone());
    }
  };
  for (const land of LANDS) {
    const first = land.via[0] ?? land.entrance;
    const dir = new THREE.Vector3(first[0], 0, first[1]).normalize();
    const pts = [dir.clone().multiplyScalar(8.3), ...land.via.map(([x, z]) => new THREE.Vector3(x, 0, z)), new THREE.Vector3(land.entrance[0], 0, land.entrance[1])];
    addCurve(pts);
  }
  addCurve([new THREE.Vector3(0, 0, -8.3), new THREE.Vector3(0, 0, -13.5)]); // plaza -> Quest Board
  const paths = await assets.instanced("coaster", "path-straight", pathMats);
  const pathMat = toon("#ff9fcd");
  paths.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = pathMat;
  });
  scene.add(paths);

  const nearPath = (x: number, z: number, pad: number) => pathSamples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < pad * pad);
  const zb = zoneBounds();
  const inDreamZone = (x: number, z: number, pad: number) => x > zb.minX - pad && x < zb.maxX + pad && z > zb.minZ - pad && z < zb.maxZ + pad;
  const nearPlace = (x: number, z: number, pad: number) =>
    inDreamZone(x, z, pad) || Math.hypot(x, z) < 10 + pad || PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad);
  const inLand = (x: number, z: number, id: string) => {
    const l = LANDS.find((q) => q.id === id)!;
    return Math.hypot(x - l.x, z - l.z) < l.radius;
  };

  // ── places ──
  const tappables: THREE.Object3D[] = [];
  const blobMat = track(new THREE.MeshBasicMaterial({ map: track(blobTexture()), transparent: true, depthWrite: false }));
  const blobGeo = track(new THREE.PlaneGeometry(1, 1));
  const bobbers: { obj: THREE.Object3D; base: number; phase: number }[] = [];
  for (const p of PLACES) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.rotation.y = p.face ?? Math.atan2(-p.x, -p.z);
    for (const m of p.models) {
      const obj = await assets.spawn(m.kit as KitName, m.id);
      obj.scale.setScalar(m.scale);
      if (m.offset) obj.position.set(m.offset[0], 0, m.offset[1]);
      if (m.rotY) obj.rotation.y = m.rotY;
      obj.traverse((o) => (o.userData.placeId = p.id));
      group.add(obj);
      if (p.action !== "none") tappables.push(obj);
    }
    if (p.radius > 0) {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.setScalar(p.radius * 3);
      blob.position.y = 0.03;
      group.add(blob);
    }
    const sign = labelSprite(`${p.emoji} ${p.label}`);
    sign.scale.multiplyScalar(p.id === "gate" ? 1.3 : 0.9);
    sign.position.set(p.x, p.signY, p.z);
    track(sign.material);
    if ((sign.material as THREE.SpriteMaterial).map) track((sign.material as THREE.SpriteMaterial).map!);
    scene.add(sign);
    bobbers.push({ obj: sign, base: p.signY, phase: p.x * 0.3 });
    scene.add(group);
  }
  // land name banners floating over each land
  for (const land of LANDS) {
    if (land.id === "gate") continue;
    const s = labelSprite(`${land.emoji} ${land.name}`);
    s.scale.multiplyScalar(1.25);
    s.position.set(land.x, 11, land.z);
    track(s.material);
    if ((s.material as THREE.SpriteMaterial).map) track((s.material as THREE.SpriteMaterial).map!);
    scene.add(s);
    bobbers.push({ obj: s, base: 11, phase: land.z });
  }

  // centrepiece fountain with a giant swirl lollipop
  const fountain = await assets.spawn("town", "fountain-round-detail");
  fountain.scale.setScalar(3.2);
  fountain.position.y = 0.25;
  scene.add(fountain);
  const lolly = await assets.spawn("food", "lollypop");
  lolly.scale.setScalar(9);
  lolly.position.y = 1.2;
  scene.add(lolly);

  // ── themed land decor ──
  const pets = LANDS.find((l) => l.id === "pets")!;
  const hedgeMats: THREE.Matrix4[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.075) {
    const x = pets.x + Math.sin(a) * pets.radius;
    const z = pets.z + Math.cos(a) * pets.radius;
    if (nearPath(x, z, 4)) continue; // gap where the path comes in
    hedgeMats.push(m4(x, 0, z, 3.2, a + Math.PI / 2));
  }
  scene.add(await assets.instanced("town", "hedge", hedgeMats));
  // fetch field: a white chalk ring
  const fetchRing = new THREE.Mesh(track(new THREE.TorusGeometry(5.5, 0.12, 6, 48)), toon("#ffffff"));
  fetchRing.rotation.x = Math.PI / 2;
  fetchRing.position.set(-46, 0.06, 6);
  scene.add(fetchRing);

  // Market Street: a row of stalls either side of the street
  const stallKinds: [KitName, string][] = [["coaster", "stall-food"], ["coaster", "stall-drinks"], ["town", "stall-red"], ["town", "stall-green"], ["coaster", "stall-information"], ["town", "cart"]];
  const stallMats = new Map<string, THREE.Matrix4[]>();
  for (let i = 0; i < 8; i++) {
    const k = stallKinds[i % stallKinds.length];
    const key = `${k[0]}/${k[1]}`;
    const t = i / 7;
    const x = 30 + t * 16;
    const z = -33 - t * 14 + (i % 2 ? 5 : -5);
    if (!stallMats.has(key)) stallMats.set(key, []);
    stallMats.get(key)!.push(m4(x, 0, z, 2.6, i % 2 ? Math.PI * 0.8 : -Math.PI * 0.2));
  }
  for (const [key, mats] of stallMats) {
    const [kit, id] = key.split("/") as [KitName, string];
    scene.add(await assets.instanced(kit, id, mats));
  }

  // Friends Café terrace + plaza benches
  const benchMats: THREE.Matrix4[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    benchMats.push(m4(-30 + Math.sin(a) * 7, 0, 38 + Math.cos(a) * 6, 2.6, a + Math.PI));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (nearPath(Math.sin(a) * 10.5, Math.cos(a) * 10.5, 2)) continue;
    benchMats.push(m4(Math.sin(a) * 10.5, 0, Math.cos(a) * 10.5, 2.6, a + Math.PI));
  }
  scene.add(await assets.instanced("coaster", "bench", benchMats));

  // Ride Land: a giant windmill
  const bigMill = await assets.spawn("town", "windmill");
  bigMill.scale.setScalar(3.4);
  bigMill.position.set(-42, 0, -46);
  bigMill.rotation.y = 0.6;
  scene.add(bigMill);

  // ── scattered candy decor: lighter everywhere, dense in the Sweet Forest ──
  type Kind = { kit: KitName; id: string; count: number; s: [number, number]; minR: number; maxR: number; pad: number; land?: string };
  const KINDS: Kind[] = [
    { kit: "food", id: "lollypop", count: 30, s: [9, 13], minR: 14, maxR: 95, pad: 2.5 },
    { kit: "nature", id: "tree_default", count: 30, s: [2.6, 3.6], minR: 16, maxR: 110, pad: 2.5 },
    { kit: "nature", id: "tree_oak", count: 26, s: [2.8, 3.8], minR: 16, maxR: 110, pad: 2.5 },
    { kit: "nature", id: "tree_fat", count: 24, s: [2.8, 3.6], minR: 18, maxR: 110, pad: 2.5 },
    { kit: "nature", id: "tree_cone", count: 20, s: [2.6, 3.4], minR: 22, maxR: 110, pad: 2.5 },
    { kit: "food", id: "cupcake", count: 10, s: [4, 6], minR: 12, maxR: 70, pad: 3 },
    { kit: "food", id: "donut-sprinkles", count: 12, s: [8, 11], minR: 12, maxR: 80, pad: 3 },
    { kit: "food", id: "ice-cream", count: 9, s: [5, 7], minR: 14, maxR: 80, pad: 2.5 },
    { kit: "food", id: "popsicle", count: 10, s: [6, 8], minR: 14, maxR: 80, pad: 2 },
    { kit: "food", id: "sundae", count: 6, s: [5, 6], minR: 16, maxR: 70, pad: 2 },
    { kit: "nature", id: "mushroom_redGroup", count: 34, s: [3.5, 5], minR: 10, maxR: 90, pad: 1.4 },
    { kit: "nature", id: "plant_bush", count: 50, s: [3.5, 5], minR: 10, maxR: 95, pad: 1.4 },
    { kit: "nature", id: "flower_purpleA", count: 70, s: [2.8, 3.8], minR: 9, maxR: 85, pad: 1 },
    { kit: "nature", id: "flower_redA", count: 70, s: [2.8, 3.8], minR: 9, maxR: 85, pad: 1 },
    { kit: "nature", id: "flower_yellowA", count: 70, s: [2.8, 3.8], minR: 9, maxR: 85, pad: 1 },
    { kit: "holiday", id: "present-a-cube", count: 12, s: [1.6, 2.4], minR: 10, maxR: 60, pad: 1.4 },
    // Sweet Forest: thick with candy trees, mushrooms and lollipops
    { kit: "nature", id: "tree_default", count: 20, s: [2.8, 3.8], minR: 0, maxR: 1, pad: 3.2, land: "forest" },
    { kit: "nature", id: "tree_fat", count: 14, s: [2.8, 3.6], minR: 0, maxR: 1, pad: 3.2, land: "forest" },
    { kit: "nature", id: "mushroom_redGroup", count: 30, s: [4.5, 6.5], minR: 0, maxR: 1, pad: 1.2, land: "forest" },
    { kit: "food", id: "lollypop", count: 14, s: [10, 14], minR: 0, maxR: 1, pad: 2.2, land: "forest" },
    // Pet Meadow: flower beds
    { kit: "coaster", id: "flowers", count: 18, s: [2.2, 3], minR: 0, maxR: 1, pad: 1.2, land: "pets" },
    // Book Nook: a quiet reading garden
    { kit: "coaster", id: "bench", count: 5, s: [2.4, 2.4], minR: 0, maxR: 1, pad: 2, land: "books" },
    { kit: "nature", id: "flower_yellowA", count: 16, s: [2.8, 3.6], minR: 0, maxR: 1, pad: 1, land: "books" },
    { kit: "nature", id: "tree_default", count: 5, s: [2.8, 3.4], minR: 0, maxR: 1, pad: 3, land: "books" },
    // Golf Green: tidy hedges and flowers
    { kit: "nature", id: "plant_bush", count: 12, s: [3.5, 4.5], minR: 0, maxR: 1, pad: 1.6, land: "golf" },
    { kit: "nature", id: "flower_redA", count: 14, s: [2.8, 3.6], minR: 0, maxR: 1, pad: 1, land: "golf" },
    // Arcade Alley: giant lollipops and lanterns
    { kit: "food", id: "lollypop", count: 6, s: [10, 13], minR: 0, maxR: 1, pad: 2.4, land: "arcade" },
    { kit: "town", id: "lantern", count: 6, s: [2.2, 2.6], minR: 0, maxR: 1, pad: 2, land: "arcade" },
  ];
  for (const k of KINDS) {
    const mats: THREE.Matrix4[] = [];
    let tries = 0;
    const land = k.land ? LANDS.find((l) => l.id === k.land)! : null;
    while (mats.length < k.count && tries++ < k.count * 40) {
      let x: number;
      let z: number;
      if (land) {
        const a = r() * Math.PI * 2;
        const rad = Math.sqrt(r()) * land.radius;
        x = land.x + Math.sin(a) * rad;
        z = land.z + Math.cos(a) * rad;
        if (land.id === "pets" && Math.hypot(x + 46, z - 6) < 6.5) continue; // keep the fetch field clear
      } else {
        const a = r() * Math.PI * 2;
        const rad = k.minR + r() * (k.maxR - k.minR);
        x = Math.sin(a) * rad;
        z = Math.cos(a) * rad;
        if (LANDS.some((l) => l.id !== "forest" && Math.hypot(x - l.x, z - l.z) < l.radius + 1)) continue;
      }
      if (nearPath(x, z, k.pad + 1.6) || nearPlace(x, z, k.pad + 1.5)) continue;
      if (!land && inLand(x, z, "forest")) continue;
      mats.push(m4(x, 0, z, k.s[0] + r() * (k.s[1] - k.s[0]), r() * Math.PI * 2));
    }
    scene.add(await assets.instanced(k.kit, k.id, mats));
  }

  // candy canes + lanterns lining the paths
  const caneMats: THREE.Matrix4[] = [];
  const lanternMats: THREE.Matrix4[] = [];
  for (let i = 3; i < pathSamples.length - 1; i += 2) {
    const p = pathSamples[i];
    const nxt = pathSamples[i + 1];
    const dx = nxt.x - p.x;
    const dz = nxt.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const side = i % 4 < 2 ? 1 : -1;
    const x = p.x + nx * 2.1 * side;
    const z = p.z + nz * 2.1 * side;
    if (Math.hypot(x, z) < 9.5 || nearPlace(x, z, 0.5)) continue;
    if (i % 6 === 3) lanternMats.push(m4(x, 0, z, 2.2));
    else caneMats.push(m4(x, 0, z, 5.5, Math.atan2(nx, nz)));
  }
  scene.add(await assets.instanced("holiday", "candy-cane-red", caneMats));
  scene.add(await assets.instanced("town", "lantern", lanternMats));

  // ── the Sky Train: a candy rail looping the whole park overhead, with a train on it ──
  const loopPts: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rad = 70 + Math.sin(a * 3) * 8;
    loopPts.push(new THREE.Vector3(Math.sin(a) * rad, 8 + Math.sin(a * 2) * 2.5, Math.cos(a) * rad));
  }
  const loop = new THREE.CatmullRomCurve3(loopPts, true, "centripetal");
  scene.add(new THREE.Mesh(track(new THREE.TubeGeometry(loop, 320, 0.35, 8, true)), toon("#ff7fbd")));
  const stripeMat = track(new THREE.MeshToonMaterial({ map: track(stripeTexture()) }));
  const pillars = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.35, 0.45, 1, 10)), stripeMat, 40);
  for (let i = 0; i < 40; i++) {
    const p = loop.getPointAt(i / 40);
    pillars.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y, 1)));
  }
  scene.add(pillars);
  const cars: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const car = await assets.spawn("coaster", i === 0 ? "coaster-train-front" : "coaster-train");
    car.scale.setScalar(2.4);
    scene.add(car);
    cars.push(car);
  }
  const loopLen = loop.getLength();
  const up = new THREE.Vector3(0, 1, 0);

  // ── gumdrop hills + cotton-candy clouds on the horizon ──
  const hillGeo = track(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const hillColors = ["#ffb3d6", "#b3f0d4", "#fff0a3", "#d6c2ff", "#a8dcff", "#ffcfa8"];
  const hills = new THREE.InstancedMesh(hillGeo, track(new THREE.MeshToonMaterial({ color: "#ffffff" })), 40);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + r() * 0.12;
    const rad = 150 + r() * 70;
    const s = 22 + r() * 30;
    hills.setMatrixAt(i, m4(Math.sin(a) * rad, -1, Math.cos(a) * rad, s, 0, s * (0.55 + r() * 0.35)));
    hills.setColorAt(i, new THREE.Color(hillColors[i % hillColors.length]));
  }
  scene.add(hills);

  const clouds = new THREE.InstancedMesh(track(new THREE.SphereGeometry(1, 12, 8)), track(new THREE.MeshToonMaterial({ color: "#ffffff" })), 90);
  const cloudBase: { x: number; y: number; z: number; s: number; speed: number }[] = [];
  for (let c = 0, i = 0; c < 18; c++) {
    const a = r() * Math.PI * 2;
    const rad = 30 + r() * 130;
    const cx = Math.sin(a) * rad;
    const cz = Math.cos(a) * rad;
    const cy = 26 + r() * 16;
    for (let p = 0; p < 5; p++, i++) {
      cloudBase.push({ x: cx + (p - 2) * 2.6, y: cy + r() * 1.2, z: cz + r() * 1.5, s: 2.8 + r() * 2.4, speed: 0.6 + r() * 0.4 });
      clouds.setColorAt(i, new THREE.Color(p % 2 ? "#ffffff" : "#ffe3f1"));
    }
  }
  scene.add(clouds);

  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const cloudPos = new THREE.Vector3();
  const cloudScale = new THREE.Vector3();
  return {
    tappables,
    places: PLACES,
    lands: LANDS,
    pathPoints,
    update(dt, t) {
      lolly.rotation.y += dt * 0.5;
      for (const b of bobbers) b.obj.position.y = b.base + Math.sin(t * 2 + b.phase) * 0.18;
      cloudBase.forEach((c, i) => {
        const x = ((c.x + t * c.speed + 200) % 400) - 200;
        clouds.setMatrixAt(i, tmp.compose(cloudPos.set(x, c.y, c.z), q.identity(), cloudScale.set(c.s * 1.2, c.s * 0.8, c.s)));
      });
      clouds.instanceMatrix.needsUpdate = true;
      // sky train glides round the loop, each car a little behind the one in front
      const head = ((t * 11) % loopLen) / loopLen;
      cars.forEach((car, i) => {
        const u = (head - (i * 3.4) / loopLen + 1) % 1;
        const p = loop.getPointAt(u);
        const ahead = loop.getPointAt((u + 0.002) % 1);
        car.position.set(p.x, p.y + 0.35, p.z);
        look.lookAt(ahead, p, up);
        car.quaternion.setFromRotationMatrix(look);
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
