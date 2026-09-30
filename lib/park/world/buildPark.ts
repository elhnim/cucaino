// Builds the candy-world theme park: a central plaza, themed lands joined by winding paths,
// a sky-train looping over everything, and lots of instanced candy decor. Nothing casts real
// shadows (soft blob shadows instead) and every repeated prop is one draw call per part.
import * as THREE from "three";
import type { ParkAssets, KitName } from "../assets/loader";
import { PLACES, LANDS, SKY_LOOP_N, SKY_STATION_I, skyLoopXZ, type PlaceDef, type LandDef } from "../registry/places";
import { labelSprite } from "@/lib/game3d/buildingKit";
import { zoneBounds } from "../builder/rules";
import { buildAtmosphere, type Atmosphere } from "./atmosphere";
import { buildGlowFlora } from "./glowFlora";
import { buildOcean, BEACH_IN, wobbleToCoast } from "./ocean";
import { buildNature } from "./nature";
import { TRAILS, ISLAND_R, nearStream, coastR } from "../registry/island";
import { groundY, slopeAt } from "../registry/terrain";
import { buildFantasyWorld, buildTerrainMesh, type FantasyWorld } from "./fantasy";
import { SKY_PADS, skyTopY } from "../registry/skyIslands";
import { buildQuests3D, type Quests3D } from "./quests3d";
import { buildUnderwater, type Underwater } from "./underwater";
import { FOOTPRINTS as SEA_FOOTPRINTS } from "./underwater/plan";
import { buildBirds } from "./birds";
import { buildSteamTrain, CAR_GAP } from "./steamTrain";
import { buildStorybook, type Storybook } from "./storybook";
import { buildVillage } from "./village";
import { VILLAGE_OBSTACLES } from "../registry/villageIsland";
import { buildHeartOfIsland, buildQuestBoard, buildGiftChest, plateSprite, type Landmark } from "./landmarks";
import { buildSkyLife } from "./skyLife";

export interface BuiltPark {
  /** meshes that can be tapped, tagged with userData.placeId */
  tappables: THREE.Object3D[];
  places: PlaceDef[];
  lands: LandDef[];
  /** sampled points along every path (NPCs stroll between these) */
  pathPoints: THREE.Vector3[];
  /** the terrain mesh (taps are raycast against it) */
  ground: THREE.Mesh;
  /** Star Shards + Sky Rings (the engine drives them with the kid's position) */
  quests3d: Quests3D;
  /** the storybook dressing (dense forest, sheep, windmills, balloons, boats, clouds, misty
   *  horizon) — only in the diorama look */
  storybook: Storybook | null;
  /** a Coralcove villager with something to say to the kid right now (null when nobody's near) */
  villageTalk: { id: string; name: string; line: string } | null;
  /** the floating mountains' chests, discoveries and rune-stone puzzles */
  skyChests: FantasyWorld["sky"];
  /** the Sky Coaster: its track and where its train is (the engine drives it while you ride) */
  skyTrain: { loop: THREE.CatmullRomCurve3; len: number; u: number; held: boolean; stationU: number };
  /** the reef, fish, orcas, mantas, jellies, wreck and pearls under (and on) the sea */
  underwater: Underwater;
  /** round things to walk around (hills) */
  obstacles: { x: number; z: number; r: number }[];
  /** the dreamy day <-> twilight sky; atmosphere.glow lights up the whole world */
  atmosphere: Atmosphere;
  /** focus = where the kid is (walking into the Glow Forest pulls the light to twilight) */
  update(dt: number, t: number, focus?: THREE.Vector3): void;
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

/** Old radial flagstones: rings of irregular stones, a gold star inlay, moss creeping in at the edge. */
function plazaTexture() {
  const tex = canvasTexture(1024, (c) => {
    const R = 512;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = "#6f6456";
    c.fillRect(0, 0, 1024, 1024);
    const rings = [0, 70, 150, 225, 300, 370, 435, 490, 512];
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k] + 3;
      const r1 = rings[k + 1] - 3;
      const n = Math.max(6, Math.round(((r0 + r1) * Math.PI) / 70));
      const off = rnd() * 6.28;
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2 + 0.012;
        const a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.012;
        const l = 62 + rnd() * 18;
        const moss = Math.max(0, (k - 5) / 2.5) * rnd();
        c.fillStyle = `hsl(${36 - moss * 40 + rnd() * 10}, ${14 + moss * 30}%, ${l - moss * 18}%)`;
        c.beginPath();
        c.arc(R, R, r1, a0, a1);
        c.arc(R, R, Math.max(1, r0), a1, a0, true);
        c.closePath();
        c.fill();
        // wear: a lighter top edge and a few cracks
        c.strokeStyle = "rgba(255,248,230,0.18)";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(R, R, r1 - 2, a0 + 0.01, a1 - 0.01);
        c.stroke();
      }
    }
    // gold star inlay round the fountain
    c.save();
    c.translate(R, R);
    c.strokeStyle = "#caa24a";
    c.lineWidth = 6;
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 265 : 330;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 440, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    // moss and grass tufts creeping over the outer ring
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.28;
      const r = 440 + Math.pow(rnd(), 0.5) * 72;
      c.fillStyle = `rgba(${70 + rnd() * 40},${110 + rnd() * 50},${50 + rnd() * 30},${0.35 + rnd() * 0.4})`;
      c.beginPath();
      c.arc(R + Math.cos(a) * r, R + Math.sin(a) * r, 2 + rnd() * 7, 0, 6.28);
      c.fill();
    }
  });
  return tex;
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
      c.fillStyle = i % 2 ? "#a8763f" : "#8a5c2e";
      c.fillRect(0, i * 8, 64, 8);
    }
  });
}

const m4 = (x: number, y: number, z: number, s: number, rotY = 0, sy = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, sy, s));
/** like m4, but standing on the terrain (y is a lift above the ground) */
const m4g = (x: number, lift: number, z: number, s: number, rotY = 0, sy = s) => m4(x, groundY(x, z) + lift, z, s, rotY, sy);

export async function buildPark(scene: THREE.Scene, assets: ParkAssets, opts: { hour?: () => number; lowQuality?: boolean; look?: "diorama" | "smooth" } = {}): Promise<BuiltPark> {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const toon = (color: string) => track(new THREE.MeshToonMaterial({ color }));
  const r = rng(20260927);

  // ── the dreamy sky: day -> golden hour -> glowing twilight, following the real clock ──
  const forestLand = LANDS.find((l) => l.id === "forest")!;
  const storyLook = opts.look === "diorama";
  const atmosphere = buildAtmosphere(scene, { forest: { x: forestLand.x, z: forestLand.z, radius: forestLand.radius + 8 }, hour: opts.hour, lowQuality: opts.lowQuality, storybook: storyLook });
  disposables.push(atmosphere);

  // ── ground (the meadow island) + plaza; the beach and ocean ring it ──
  // (the ground itself is built further down, once the trails and places are known)
  // top face only (a CircleGeometry): the cylinder's side and a torus rim made a hard, plastic edge
  const plazaGeo = track(new THREE.CircleGeometry(9.2, 64));
  plazaGeo.rotateX(-Math.PI / 2);
  const plaza = new THREE.Mesh(plazaGeo, track(new THREE.MeshStandardMaterial({ map: track(plazaTexture()), roughness: 0.95 })));
  plaza.position.y = 0.1;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // each land gets its own softly-tinted ground
  const discGeo = track(new THREE.CircleGeometry(1, 40));
  // (lands no longer paint coloured ground discs: the terrain, grass and props define them now)


  // ── natural trails: a loop round the island, four trails from the plaza, one into each land ──
  const pathMats: THREE.Matrix4[] = [];
  const pathPoints: THREE.Vector3[] = [];
  const pathSamples: THREE.Vector3[] = [];
  const addCurve = (pts: THREE.Vector3[], closed = false) => {
    const curve = new THREE.CatmullRomCurve3(pts, closed, "centripetal");
    const len = curve.getLength();
    const n = Math.max(2, Math.ceil(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      pathMats.push(m4g(p.x, 0.04, p.z, 3, Math.atan2(tg.x, tg.z), 1));
      pathSamples.push(p);
      if (i % 3 === 0) pathPoints.push(p.clone());
    }
  };
  for (const tr of TRAILS) addCurve(tr.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!tr.closed);
  void pathMats; // trails are painted into the terrain (buildTerrainMesh paths: true)

  const nearPath = (x: number, z: number, pad: number) => pathSamples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < pad * pad);
  const zb = zoneBounds();
  const inDreamZone = (x: number, z: number, pad: number) => x > zb.minX - pad && x < zb.maxX + pad && z > zb.minZ - pad && z < zb.maxZ + pad;
  const nearPlace = (x: number, z: number, pad: number) =>
    inDreamZone(x, z, pad) || Math.hypot(x, z) < 10 + pad || PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad);
  const inLand = (x: number, z: number, id: string) => {
    const l = LANDS.find((q) => q.id === id)!;
    return Math.hypot(x - l.x, z - l.z) < l.radius;
  };

  // ── the stream, its bridges and the grassy hills ──
  const nature = buildNature(scene);
  disposables.push(nature);
  const nearHill = (x: number, z: number, pad: number) => nature.obstacles.some((h) => Math.hypot(x - h.x, z - h.z) < h.r * 1.2 + pad);

  // ── places ──
  const tappables: THREE.Object3D[] = [];
  const blobMat = track(new THREE.MeshBasicMaterial({ map: track(blobTexture()), transparent: true, depthWrite: false }));
  const blobGeo = track(new THREE.PlaneGeometry(1, 1));
  const bobbers: { obj: THREE.Object3D; base: number; phase: number }[] = [];
  const landmarks: Landmark[] = [];
  // places standing on floating mountains bob along with them
  const skyPlaces: { group: THREE.Group; x: number; z: number }[] = [];
  const skyStone = track(new THREE.MeshStandardMaterial({ color: "#d9d0c0", roughness: 0.9, flatShading: true }));
  const skyGold = track(new THREE.MeshStandardMaterial({ color: "#e8b64a", roughness: 0.35, metalness: 0.6, flatShading: true }));
  const skyRuneMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color("#7ff0ff").multiplyScalar(1.1), transparent: true, opacity: 0.55, depthWrite: false }));
  const skyFlagA = track(new THREE.MeshStandardMaterial({ color: "#c8352b", roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
  const skyFlagB = track(new THREE.MeshStandardMaterial({ color: "#3a6ad8", roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
  const skyPlinthGeo = track(new THREE.CylinderGeometry(1, 1.06, 0.18, 16).translate(0, 0.02, 0)); // (low: you walk on the pad height)
  const skyRimGeo = track(new THREE.TorusGeometry(1, 0.06, 5, 32));
  const skyRuneGeo = track(new THREE.RingGeometry(0.9, 0.95, 40));
  const skyPoleGeo = track(new THREE.CylinderGeometry(0.07, 0.09, 6.8, 6));
  const skyFlagGeo = (() => {
    const g = new THREE.BufferGeometry();
    // a swallow-tailed pennant
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.55, 0, 1.4, 0.35, 0, 1.0, 0, 0, 0, 0.55, 0, 1.0, 0, 0, 1.4, -0.35, 0, 0, 0.55, 0, 1.4, -0.35, 0, 0, -0.55, 0], 3));
    g.computeVertexNormals();
    return track(g);
  })();
  for (const p of PLACES) {
    const group = new THREE.Group();
    group.position.set(p.x, p.sky ? (skyTopY(p.x, p.z, 0)?.y ?? groundY(p.x, p.z)) : groundY(p.x, p.z), p.z);
    if (p.sky) skyPlaces.push({ group, x: p.x, z: p.z });
    group.rotation.y = p.face ?? Math.atan2(-p.x, -p.z);
    // up on a floating mountain: a grand setting — a round stone plinth with a gold rim and a
    // glowing rune ring, and tall pennant poles either side of the door
    if (p.sky) {
      const pad = SKY_PADS.find((q) => q.placeId === p.id);
      const pr = Math.max(3.5, (pad?.r ?? 5) - 0.4);
      const plinth = new THREE.Mesh(skyPlinthGeo, skyStone);
      plinth.scale.set(pr, 1, pr);
      plinth.receiveShadow = true;
      const rim = new THREE.Mesh(skyRimGeo, skyGold);
      rim.scale.set(pr, pr, 1);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.12;
      const runes = new THREE.Mesh(skyRuneGeo, skyRuneMat);
      runes.scale.set(pr * 0.86, pr * 0.86, 1);
      runes.rotation.x = -Math.PI / 2;
      runes.position.y = 0.125;
      group.add(plinth, rim, runes);
      for (const sx of [-1, 1]) {
        const pole = new THREE.Mesh(skyPoleGeo, skyGold);
        pole.position.set(sx * (pr - 0.6), 3.4, pr - 0.9);
        const flag = new THREE.Mesh(skyFlagGeo, sx < 0 ? skyFlagA : skyFlagB);
        flag.position.set(sx * (pr - 0.6) + sx * 0.75, 5.6, pr - 0.9);
        flag.rotation.y = sx < 0 ? Math.PI : 0;
        pole.castShadow = flag.castShadow = true;
        group.add(pole, flag);
      }
    }
    // hand-built landmarks for the most important places
    const special = p.id === "quest-board" ? buildQuestBoard() : p.id === "daily-gift" ? buildGiftChest() : null;
    if (special) {
      landmarks.push(special);
      disposables.push(special);
      special.group.traverse((o) => (o.userData.placeId = p.id));
      group.add(special.group);
      tappables.push(special.group);
    }
    for (const m of p.models) {
      const obj = await assets.spawn(m.kit as KitName, m.id);
      obj.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
      obj.scale.setScalar(m.scale * (p.sky ? 1.3 : 1));
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
    const sign = plateSprite(`${p.emoji} ${p.label}`, "#ffd36b", p.id === "gate" ? 1.5 : 1.05);
    sign.position.set(p.x, groundY(p.x, p.z) + p.signY, p.z);
    track(sign.material);
    if ((sign.material as THREE.SpriteMaterial).map) track((sign.material as THREE.SpriteMaterial).map!);
    scene.add(sign);
    bobbers.push({ obj: sign, base: groundY(p.x, p.z) + p.signY, phase: p.x * 0.3 });
    scene.add(group);
  }
  // land name banners floating over each land
  for (const land of LANDS) {
    if (land.id === "gate") continue;
    const s = plateSprite(`${land.emoji} ${land.name}`, "#5ef2ff", 1.6);
    s.position.set(land.x, groundY(land.x, land.z) + 11, land.z);
    track(s.material);
    if ((s.material as THREE.SpriteMaterial).map) track((s.material as THREE.SpriteMaterial).map!);
    scene.add(s);
    bobbers.push({ obj: s, base: groundY(land.x, land.z) + 11, phase: land.z });
  }

  // centrepiece fountain with a giant swirl lollipop
  // the Heart of the Island: a tiered fountain with a great floating crystal
  const heart = buildHeartOfIsland();
  heart.group.position.y = 0.25;
  scene.add(heart.group);
  landmarks.push(heart);
  disposables.push(heart);
  const lolly = new THREE.Object3D(); // (the candy centrepiece is gone; the fountain stands alone)

  // ── themed land decor ──
  const pets = LANDS.find((l) => l.id === "pets")!;
  const hedgeMats: THREE.Matrix4[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.075) {
    const x = pets.x + Math.sin(a) * pets.radius;
    const z = pets.z + Math.cos(a) * pets.radius;
    if (nearPath(x, z, 4)) continue; // gap where the path comes in
    hedgeMats.push(m4g(x, 0, z, 3.2, a + Math.PI / 2));
  }
  scene.add(await assets.instanced("town", "hedge", hedgeMats));
  // fetch field: a white chalk ring
  const fetchRing = new THREE.Mesh(track(new THREE.TorusGeometry(5.5, 0.12, 6, 48)), toon("#ffffff"));
  fetchRing.rotation.x = Math.PI / 2;
  fetchRing.position.set(pets.x + 1, groundY(pets.x + 1, pets.z) + 0.08, pets.z);
  scene.add(fetchRing);

  // Market Street: a row of stalls either side of the street
  const stallKinds: [KitName, string][] = [["coaster", "stall-food"], ["coaster", "stall-drinks"], ["town", "stall-red"], ["town", "stall-green"], ["coaster", "stall-information"], ["town", "cart"]];
  const stallMats = new Map<string, THREE.Matrix4[]>();
  const market = LANDS.find((l) => l.id === "market")!;
  for (let i = 0; i < 8; i++) {
    const k = stallKinds[i % stallKinds.length];
    const key = `${k[0]}/${k[1]}`;
    const t = i / 7;
    const x = market.x + t * 16 - 2;
    const z = market.z + 9 - t * 14 + (i % 2 ? 5 : -5);
    if (!stallMats.has(key)) stallMats.set(key, []);
    stallMats.get(key)!.push(m4g(x, 0, z, 2.6, i % 2 ? Math.PI * 0.8 : -Math.PI * 0.2));
  }
  for (const [key, mats] of stallMats) {
    const [kit, id] = key.split("/") as [KitName, string];
    scene.add(await assets.instanced(kit, id, mats));
  }

  // Friends Café terrace + plaza benches
  const benchMats: THREE.Matrix4[] = [];
  const friends = LANDS.find((l) => l.id === "friends")!;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    benchMats.push(m4g(friends.x + Math.sin(a) * 7, 0, friends.z - 2 + Math.cos(a) * 6, 2.6, a + Math.PI));
  }
  // (no plastic benches ringing the plaza any more: the Heart of the Island stands in the open)
  scene.add(await assets.instanced("coaster", "bench", benchMats));

  // Ride Land: a giant windmill
  const bigMill = await assets.spawn("town", "windmill");
  bigMill.scale.setScalar(3.4);
  const rides = LANDS.find((l) => l.id === "rides")!;
  bigMill.position.set(rides.x - 8, groundY(rides.x - 8, rides.z - 6), rides.z - 6);
  bigMill.rotation.y = 0.6;
  scene.add(bigMill);

  // ── scattered candy decor: lighter everywhere, dense in the Sweet Forest ──
  type Kind = { kit: KitName; id: string; count: number; s: [number, number]; minR: number; maxR: number; pad: number; land?: string };
  const KINDS: Kind[] = [
    { kit: "nature", id: "tree_default", count: 51, s: [2.6, 3.6], minR: 18, maxR: 146, pad: 2.5 },
    { kit: "nature", id: "tree_oak", count: 44, s: [2.8, 3.8], minR: 18, maxR: 146, pad: 2.5 },
    { kit: "nature", id: "tree_fat", count: 41, s: [2.8, 3.6], minR: 20, maxR: 146, pad: 2.5 },
    { kit: "nature", id: "tree_cone", count: 34, s: [2.6, 3.4], minR: 24, maxR: 146, pad: 2.5 },
    { kit: "nature", id: "mushroom_redGroup", count: 46, s: [3.5, 5], minR: 11, maxR: 131, pad: 1.4 },
    { kit: "nature", id: "plant_bush", count: 70, s: [3.5, 5], minR: 11, maxR: 139, pad: 1.4 },
    { kit: "nature", id: "flower_purpleA", count: 90, s: [2.8, 3.8], minR: 10, maxR: 124, pad: 1 },
    { kit: "nature", id: "flower_redA", count: 90, s: [2.8, 3.8], minR: 10, maxR: 124, pad: 1 },
    { kit: "nature", id: "flower_yellowA", count: 90, s: [2.8, 3.8], minR: 10, maxR: 124, pad: 1 },
    // Sweet Forest: thick with candy trees, mushrooms and lollipops
    { kit: "nature", id: "tree_default", count: 20, s: [2.8, 3.8], minR: 0, maxR: 1, pad: 3.2, land: "forest" },
    { kit: "nature", id: "tree_fat", count: 14, s: [2.8, 3.6], minR: 0, maxR: 1, pad: 3.2, land: "forest" },
    { kit: "nature", id: "mushroom_redGroup", count: 30, s: [4.5, 6.5], minR: 0, maxR: 1, pad: 1.2, land: "forest" },
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
    { kit: "town", id: "lantern", count: 6, s: [2.2, 2.6], minR: 0, maxR: 1, pad: 2, land: "arcade" },
  ];
  for (const k of KINDS.filter((kk) => kk.land && kk.land !== "forest")) {
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
        if (land.id === "pets" && Math.hypot(x - pets.x - 1, z - pets.z) < 6.5) continue; // keep the fetch field clear
      } else {
        const a = r() * Math.PI * 2;
        const rad = k.minR + r() * (k.maxR - k.minR);
        x = Math.sin(a) * rad;
        z = Math.cos(a) * rad;
        if (LANDS.some((l) => l.id !== "forest" && Math.hypot(x - l.x, z - l.z) < l.radius + 1)) continue;
      }
      if (nearPath(x, z, k.pad + 1.6) || nearPlace(x, z, k.pad + 1.5) || nearStream(x, z, k.pad) || nearHill(x, z, k.pad)) continue;
      if (!land && inLand(x, z, "forest")) continue;
      if (slopeAt(x, z) > 0.45 || groundY(x, z) > 18) continue; // not on cliffs or peaks
      if (Math.hypot(x - 0, z - 30) < 16) continue; // keep the view from the start point open
      mats.push(m4g(x, 0, z, k.s[0] + r() * (k.s[1] - k.s[0]), r() * Math.PI * 2));
    }
    const inst = await assets.instanced(k.kit, k.id, mats);
    inst.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
    scene.add(inst);
  }

  // ── the fantasy world: wind-swept grass, trees, rocks, crystals, ruins, floating islands,
  //    the giant Glow Forest — and the ground with natural earth trails painted in ──
  // keep the Sky Coaster's corridor clear (trees were growing through the track)
  const skyXZ = new THREE.CatmullRomCurve3(
    Array.from({ length: SKY_LOOP_N }, (_, i) => {
      const [x, z] = skyLoopXZ(i);
      return new THREE.Vector3(x, 0, z);
    }),
    true,
    "centripetal",
  ).getSpacedPoints(360);
  const nearSky = (x: number, z: number, pad: number) => {
    if (Math.abs(Math.hypot(x, z) - 100) > 18 + pad) return false;
    const rr = (5.5 + pad) ** 2;
    return skyXZ.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < rr);
  };
  const fantasy = buildFantasyWorld(scene, {
    free: (x, z, pad) => Math.hypot(x, z) < ISLAND_R - 2 && Math.hypot(x, z) > 12 + pad && !nearPath(x, z, pad + 1.6) && !nearPlace(x, z, pad + 1.2) && !inDreamZone(x, z, pad) && !nearStream(x, z, pad) && !nearSky(x, z, pad),
    lowQuality: opts.lowQuality,
    // the diorama look wants clean, flat meadows (blades turn into pixel noise when chunky)
    blades: opts.look !== "diorama",
  });
  disposables.push(fantasy);
  const quests3d = buildQuests3D(scene, fantasy.plan);
  disposables.push(quests3d);
  const underwater = buildUnderwater(scene, { lowQuality: opts.lowQuality });
  disposables.push(underwater);
  const birds = buildBirds(scene, { lowQuality: opts.lowQuality });
  disposables.push(birds);
  // ── the storybook valley: dense chunky forest, sheep, windmills, balloons, boats, clouds, misty hills ──
  const storybook = storyLook
    ? buildStorybook(scene, {
        lowQuality: opts.lowQuality,
        free: (x, z, pad) =>
          Math.hypot(x, z) < ISLAND_R - 2 &&
          Math.hypot(x, z) > 12 + pad &&
          !nearPath(x, z, pad + 1.6) &&
          !nearPlace(x, z, pad + 1.2) &&
          !inDreamZone(x, z, pad) &&
          !nearStream(x, z, pad) &&
          !nearSky(x, z, pad) &&
          // (and clear of the fantasy kit's ruins, rocks and giant trees)
          !fantasy.plan.ruins.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + pad) &&
          !fantasy.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad + 1),
      })
    : null;
  if (storybook) disposables.push(storybook);
  // ── Coralcove Isle, far out at sea: the Tidewing Folk's villages ──
  const village = buildVillage(scene, { lowQuality: opts.lowQuality });
  disposables.push(village);
  const ground = buildTerrainMesh({ lowQuality: opts.lowQuality, mask: fantasy.mask, paths: true });
  ground.name = "terrain";
  ground.receiveShadow = true;
  track(ground.geometry);
  track(ground.material as THREE.Material);
  scene.add(ground);

  // ── the sea: beach, glowing ocean, jellyfish (some float over the Glow Forest), whales, mantas, dolphins ──
  const ocean = buildOcean(scene, { skyJellies: { x: forestLand.x, z: forestLand.z, radius: forestLand.radius + 4 }, lowQuality: opts.lowQuality });
  disposables.push(ocean);
  const skyLife = buildSkyLife(scene, { radius: BEACH_IN - 4, lowQuality: opts.lowQuality });
  disposables.push(skyLife);

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
    if (i % 6 === 3) lanternMats.push(m4g(x, 0, z, 2.2));
    else caneMats.push(m4g(x, 0, z, 5.5, Math.atan2(nx, nz)));
  }
  void caneMats;
  scene.add(await assets.instanced("town", "lantern", lanternMats));

  // ── magical glowing plants: a dense Glow Forest of giant dream trees, and glowing flowers everywhere ──
  const glowFlora = buildGlowFlora(scene, {
    forest: { x: forestLand.x + 4, z: forestLand.z + 6, radius: forestLand.radius + 12, count: opts.lowQuality ? 40 : 70 },
    park: { x: 0, z: 0, radius: ISLAND_R - 6, count: opts.lowQuality ? 80 : 140 },
    free: (x, z, pad) => Math.hypot(x, z) < ISLAND_R - 3 && Math.hypot(x, z) > 24 + pad && !nearPath(x, z, pad + 1.4) && !nearPlace(x, z, pad + 1.2) && !inDreamZone(x, z, pad) && !nearStream(x, z, pad) && !nearHill(x, z, pad),
    lowQuality: opts.lowQuality,
    lights: lanternMats.map((mx) => {
      const p = new THREE.Vector3().setFromMatrixPosition(mx);
      return { x: p.x, y: p.y + 2.6, z: p.z, color: "#ffd68a", size: 1.8 };
    }),
  });
  disposables.push(glowFlora);


  // ── the Sky Train: a candy rail looping the whole park overhead, with a train on it ──
  // a proper coaster: low at the station, a long climb, big drops and camel-back hills
  const loopPts: THREE.Vector3[] = [];
  for (let i = 0; i < SKY_LOOP_N; i++) {
    const a = (i / SKY_LOOP_N) * Math.PI * 2;
    const [lx, lz] = skyLoopXZ(i);
    const gy = groundY(lx, lz);
    const k = (i - SKY_STATION_I + SKY_LOOP_N) % SKY_LOOP_N; // 0 at the station
    const station = k === 0 || k === SKY_LOOP_N - 1;
    const lift = k <= 5 ? (k / 5) * 20 : 0; // the chain lift up out of the station
    const hills = 12 + Math.sin(a * 3 + 0.6) * 7 + Math.sin(a * 5) * 3;
    const y = station ? gy + 3.2 : Math.max(gy + 6, k <= 5 ? gy + 3.2 + lift : hills);
    loopPts.push(new THREE.Vector3(lx, y, lz));
  }
  const loop = new THREE.CatmullRomCurve3(loopPts, true, "centripetal");
  // the Sky Railway: rails on sleepers, red trestles, a puffing steam engine and open carriages
  const train = buildSteamTrain(scene, loop, opts.lowQuality);
  disposables.push(train);
  const cars = train.cars;
  const loopLen = loop.getLength();
  // where along the track (0..1) the station is
  const stationPt = loopPts[SKY_STATION_I];
  let stationU = 0;
  for (let k = 0, best = Infinity; k < 600; k++) {
    const d = loop.getPointAt(k / 600).distanceToSquared(stationPt);
    if (d < best) {
      best = d;
      stationU = k / 600;
    }
  }
  const skyTrain = { loop, len: loopLen, u: stationU, held: false, stationU };
  const up = new THREE.Vector3(0, 1, 0);

  // ── cotton-candy clouds ── (the old ring of gumdrop "horizon hills" is gone: the ocean runs to
  // the real horizon now and you can sail out there, where they were giant blobs in the sea.
  // Their random draws are kept so every other decoration stays exactly where it was.)
  for (let i = 0; i < 40; i++) {
    r();
    r();
    r();
    r();
  }

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
      clouds.setColorAt(i, new THREE.Color(p % 2 ? "#ffffff" : "#eef2fb"));
    }
  }
  // (the storybook look brings its own low puffy clouds)
  if (!storyLook) scene.add(clouds);

  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const cloudPos = new THREE.Vector3();
  const cloudScale = new THREE.Vector3();
  const built: BuiltPark = {
    tappables,
    places: PLACES,
    lands: LANDS,
    pathPoints,
    ground,
    // (the shipwreck and sunken temple too: swim round them, and the camera slides in past them)
    obstacles: [...nature.obstacles, ...fantasy.obstacles, ...SEA_FOOTPRINTS, ...(storybook?.obstacles ?? []), ...VILLAGE_OBSTACLES],
    quests3d,
    underwater,
    skyTrain,
    skyChests: fantasy.sky,
    storybook,
    villageTalk: null,
    atmosphere,
    update(dt, t, focus) {
      atmosphere.update(dt, t, focus ?? new THREE.Vector3());
      glowFlora.update(dt, t, atmosphere.glow);
      ocean.update(dt, t, atmosphere.glow, scene.fog as THREE.Fog, focus);
      skyLife.update(dt, t, atmosphere.glow);
      birds.update(dt, t, focus ?? new THREE.Vector3(), atmosphere.glow);
      storybook?.update(dt, t, focus ?? new THREE.Vector3(), atmosphere.glow);
      built.villageTalk = village.update(dt, t, { kid: focus ?? new THREE.Vector3(), glow: atmosphere.glow, hour: atmosphere.hour }).talk;
      for (const sp of skyPlaces) {
        const top = skyTopY(sp.x, sp.z, t);
        if (top) sp.group.position.y = top.y;
      }
      nature.update(dt, t, atmosphere.glow);
      fantasy.update(dt, t, focus ?? new THREE.Vector3(), atmosphere.glow);
      for (const l of landmarks) l.update(dt, t, atmosphere.glow);
      lolly.rotation.y += dt * 0.5;
      for (const b of bobbers) b.obj.position.y = b.base + Math.sin(t * 2 + b.phase) * 0.18;
      cloudBase.forEach((c, i) => {
        const x = ((c.x + t * c.speed + 200) % 400) - 200;
        clouds.setMatrixAt(i, tmp.compose(cloudPos.set(x, c.y, c.z), q.identity(), cloudScale.set(c.s * 1.2, c.s * 0.8, c.s)));
      });
      clouds.instanceMatrix.needsUpdate = true;
      // sky train glides round the loop, each car a little behind the one in front
      if (!skyTrain.held) skyTrain.u = (skyTrain.u + (dt * 11) / loopLen) % 1;
      const head = skyTrain.u;
      train.update(dt, t, skyTrain.held ? 18 : 11);
      cars.forEach((car, i) => {
        const u = (head - (i * CAR_GAP) / loopLen + 1) % 1;
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
  return built;
}
