// The Grand Carousel (plan: registry/carousel.ts). A real fairground galloper: a turning deck of
// varnished planks, a centre drum of gilt-framed painted panels, twisted brass poles, a striped
// canvas top with a decorated crown of mirrors and light bulbs — and sixteen carved, painted
// animals that rise and fall as it turns. Every painted surface is real artwork
// (public/park-assets/carousel/, made by scripts/carousel-art.mjs): each animal is its picture's
// own traced outline extruded into a solid, bevelled body with the picture wrapped round it, so it
// reads as a carved wooden figure from every side rather than a flat card.
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY } from "../registry/terrain";
import {
  CAROUSEL,
  CAROUSEL_BOARDS,
  CAROUSEL_DRUM_FACES,
  CAROUSEL_IDLE_TURN,
  CAROUSEL_RIDE_TURN,
  CAROUSEL_SEATS,
  carouselMountHeight,
  carouselMountPose,
  carouselRiderPose,
  nearestCarouselSeat,
  type CarouselPose,
} from "../registry/carousel";
import {
  CAROUSEL_MOUNT_ART,
  CAROUSEL_SURFACE_ART,
} from "../registry/carouselArt";

const ART_BASE = "/park-assets/carousel/";
const THICK = 0.46; // an animal's body, side to side (world units)

export interface Carousel {
  group: THREE.Group;
  /** how far the deck has turned (radians) */
  readonly spin: number;
  update(dt: number, t: number, glow: number): void;
  /** a rider's aboard: it runs at full speed (else it just ticks over) */
  setRiding(on: boolean): void;
  /** the outer animal nearest a point in the world */
  nearestSeat(x: number, z: number): number;
  /** where a rider on seat `i` is right now, in the world */
  riderPose(i: number, out: CarouselPose): CarouselPose;
  dispose(): void;
}

export function buildCarousel(
  scene: THREE.Scene,
  opts: { lowQuality?: boolean } = {},
): Carousel {
  const C = CAROUSEL;
  const group = new THREE.Group();
  group.name = "grand-carousel";
  const baseY = groundY(C.x, C.z);
  group.position.set(C.x, baseY, C.z);
  scene.add(group);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const loader = new THREE.TextureLoader();
  const tex = (
    file: string | undefined,
    repeatX = 1,
    repeatY = 1,
  ): THREE.Texture | null => {
    if (!file || typeof document === "undefined") return null;
    const t = keep(loader.load(ART_BASE + file));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.lowQuality ? 2 : 8;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    return t;
  };
  // paint that keeps its colour in the shade and after dark (a showground is lit from within):
  // the picture also glows a little, more as night falls
  const painted: THREE.MeshStandardMaterial[] = [];
  const paint = (
    map: THREE.Texture | null,
    fallback: string,
    o: Partial<THREE.MeshStandardMaterialParameters> = {},
  ) => {
    const m = keep(
      new THREE.MeshStandardMaterial({
        map: map ?? undefined,
        color: map ? "#ffffff" : fallback,
        roughness: 0.42,
        metalness: 0.05,
        emissive: "#ffffff",
        emissiveMap: map ?? undefined,
        emissiveIntensity: map ? 0.28 : 0,
        ...o,
      }),
    );
    if (map) painted.push(m);
    return m;
  };
  const gold = keep(
    new THREE.MeshStandardMaterial({
      color: "#e8b93c",
      roughness: 0.28,
      metalness: 0.55,
      emissive: "#7a5200",
      emissiveIntensity: 0.55,
    }),
  );
  const brass = keep(
    new THREE.MeshStandardMaterial({
      color: "#f0c654",
      roughness: 0.22,
      metalness: 0.6,
      emissive: "#8a5f08",
      emissiveIntensity: 0.6,
    }),
  );
  const crimson = keep(
    new THREE.MeshStandardMaterial({ color: "#a3182a", roughness: 0.5 }),
  );
  const cream = keep(
    new THREE.MeshStandardMaterial({ color: "#f6ead0", roughness: 0.55 }),
  );
  const dark = keep(
    new THREE.MeshStandardMaterial({
      color: "#5a1320",
      roughness: 0.7,
      side: THREE.DoubleSide,
    }),
  );
  const geo = <T extends THREE.BufferGeometry>(g: T): T => keep(g);
  const mesh = (
    g: THREE.BufferGeometry,
    m: THREE.Material | THREE.Material[],
    parent: THREE.Object3D,
    shadow = true,
  ) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = shadow;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const SEG = opts.lowQuality ? 32 : 64;

  const TAU = Math.PI * 2;
  const BOARDS = CAROUSEL_BOARDS; // flat painted boards round the crown (and facets of the canvas top)
  const FACES = CAROUSEL_DRUM_FACES; // flat painted panels round the centre drum
  const topY = C.deckY + C.canopyY; // the canopy's rim
  /** a ring of n flat faces: a cylinder with n sides, turned so a face (not a corner) looks along +z */
  const prism = (rTop: number, rBot: number, h: number, n: number) => {
    const g = geo(new THREE.CylinderGeometry(rTop, rBot, h, n, 1, true));
    g.rotateY(Math.PI / n);
    return g;
  };

  // ── the fixed base: a plinth with a painted skirt, and steps up to the deck ──
  const boardFile = CAROUSEL_SURFACE_ART["rounding-board"]?.file;
  mesh(
    geo(new THREE.CylinderGeometry(C.deckR + 0.95, C.deckR + 1.15, 0.2, SEG)),
    cream,
    group,
    false,
  ).position.y = 0.1;
  const skirt = mesh(
    geo(
      new THREE.CylinderGeometry(
        C.deckR + 0.45,
        C.deckR + 0.6,
        C.deckY - 0.26,
        SEG,
        1,
        true,
      ),
    ),
    paint(tex(boardFile, 36, 1), "#a3182a"),
    group,
    false,
  );
  skirt.position.y = 0.2 + (C.deckY - 0.26) / 2;
  {
    // (steps on the side facing the plaza, where the kid walks up)
    const a = Math.atan2(-C.x, -C.z);
    for (let k = 0; k < 2; k++) {
      const step = mesh(
        geo(new THREE.BoxGeometry(3.2, 0.2, 0.7)),
        k ? crimson : cream,
        group,
      );
      const r = C.deckR + 1.55 - k * 0.6;
      step.position.set(Math.sin(a) * r, 0.1 + k * 0.2, Math.cos(a) * r);
      step.rotation.y = a;
    }
  }

  // ── everything that turns ──
  const turn = new THREE.Group();
  group.add(turn);
  const ringAt = (
    r: number,
    y: number,
    tube: number,
    mat: THREE.Material,
    seg = SEG,
  ) => {
    const o = mesh(
      geo(new THREE.TorusGeometry(r, tube, 8, seg)),
      mat,
      turn,
      false,
    );
    o.rotation.x = Math.PI / 2;
    o.position.y = y;
    return o;
  };

  // the deck: varnished planks with a gold-edged rim
  const floorTex = tex(CAROUSEL_SURFACE_ART.floor?.file, 5, 5);
  const deck = mesh(
    geo(new THREE.CylinderGeometry(C.deckR, C.deckR, 0.18, SEG)),
    [crimson, paint(floorTex, "#c58a3c", { roughness: 0.3 }), cream],
    turn,
    false,
  );
  deck.position.y = C.deckY - 0.09;
  ringAt(C.deckR, C.deckY, 0.07, gold);

  // the centre drum, six flat sides: a crimson plinth, a tall painted scenery panel on every side,
  // a frieze of mirrored boards above, a gilded pillar on every corner
  const PLINTH = 0.4;
  const side = C.drumR; // a hexagon's side is its corner radius
  const panelH = side * 1.5; // (the scenery picture is 2:3)
  const friezeH = C.canopyY - PLINTH - panelH;
  mesh(
    prism(C.drumR + 0.12, C.drumR + 0.2, PLINTH, FACES),
    crimson,
    turn,
    false,
  ).position.y = C.deckY + PLINTH / 2;
  mesh(
    prism(C.drumR, C.drumR, panelH, FACES),
    paint(
      tex(CAROUSEL_SURFACE_ART["scenery-panel"]?.file, FACES, 1),
      "#e9d9b0",
    ),
    turn,
  ).position.y = C.deckY + PLINTH + panelH / 2;
  mesh(
    prism(C.drumR + 0.06, C.drumR + 0.06, friezeH, FACES),
    paint(tex(boardFile, FACES, 1), "#f1e2bf"),
    turn,
  ).position.y = C.deckY + PLINTH + panelH + friezeH / 2;
  const pillarGeo = geo(new THREE.CylinderGeometry(0.13, 0.15, C.canopyY, 10));
  for (let i = 0; i < FACES; i++) {
    const a = (i / FACES) * TAU; // (the corners: the faces were turned half a step)
    const pillar = mesh(pillarGeo, gold, turn, false);
    pillar.position.set(
      Math.sin(a) * (C.drumR + 0.04),
      C.deckY + C.canopyY / 2,
      Math.cos(a) * (C.drumR + 0.04),
    );
  }
  for (const y of [C.deckY + PLINTH, C.deckY + PLINTH + panelH])
    mesh(
      prism(C.drumR + 0.1, C.drumR + 0.1, 0.12, FACES),
      gold,
      turn,
      false,
    ).position.y = y;

  // the top: a faceted canvas of crimson and cream stripes with a gilt rib down every seam, then a
  // little lantern tier with its own boards and cap, a gold ball and a flag
  const canopyFile = CAROUSEL_SURFACE_ART.canopy?.file;
  const LANTERN_R = 2.5;
  const canopyMat = paint(tex(canopyFile, BOARDS / 2, 1), "#c2283a", {
    side: THREE.DoubleSide,
    roughness: 0.78,
    emissiveIntensity: 0.2,
  });
  mesh(
    prism(LANTERN_R, C.canopyR, C.canopyRise, BOARDS),
    canopyMat,
    turn,
  ).position.y = topY + C.canopyRise / 2;
  const ribLen = Math.hypot(C.canopyR - LANTERN_R, C.canopyRise);
  const ribGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, ribLen, 6));
  const ribTilt = Math.atan2(C.canopyR - LANTERN_R, C.canopyRise);
  for (let i = 0; i < BOARDS; i++) {
    const a = (i / BOARDS) * TAU;
    const holder = new THREE.Group();
    holder.rotation.y = a;
    turn.add(holder);
    const rib = mesh(ribGeo, gold, holder, false);
    rib.position.set(0, topY + C.canopyRise / 2, (C.canopyR + LANTERN_R) / 2);
    rib.rotation.x = -ribTilt; // (leaning in, up the canvas to the lantern)
  }
  const lanternY = topY + C.canopyRise;
  const LANTERN_H = (2 * LANTERN_R * Math.sin(Math.PI / 6)) / 1.5;
  mesh(
    prism(LANTERN_R, LANTERN_R, LANTERN_H, 6),
    paint(tex(boardFile, 6, 1), "#f1e2bf"),
    turn,
  ).position.y = lanternY + LANTERN_H / 2;
  mesh(
    prism(LANTERN_R + 0.08, LANTERN_R + 0.08, 0.1, 6),
    gold,
    turn,
    false,
  ).position.y = lanternY;
  mesh(
    prism(LANTERN_R + 0.08, LANTERN_R + 0.08, 0.1, 6),
    gold,
    turn,
    false,
  ).position.y = lanternY + LANTERN_H;
  const CAP_H = 1.7;
  mesh(
    prism(0.05, LANTERN_R + 0.5, CAP_H, BOARDS),
    paint(tex(canopyFile, BOARDS / 2, 1), "#c2283a", {
      side: THREE.DoubleSide,
      roughness: 0.78,
      emissiveIntensity: 0.2,
    }),
    turn,
  ).position.y = lanternY + LANTERN_H + CAP_H / 2;
  const peakY = lanternY + LANTERN_H + CAP_H;
  mesh(geo(new THREE.SphereGeometry(0.34, 16, 12)), gold, turn).position.y =
    peakY + 0.25;
  mesh(
    geo(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8)),
    gold,
    turn,
  ).position.y = peakY + 1.2;
  const flag = mesh(
    geo(new THREE.PlaneGeometry(1.2, 0.6, 6, 1)),
    keep(
      new THREE.MeshStandardMaterial({
        color: "#d8232f",
        side: THREE.DoubleSide,
        roughness: 0.7,
      }),
    ),
    turn,
  );
  flag.position.set(0.65, peakY + 1.65, 0);
  // under the canvas: a dark ceiling with gilt sweeps out to every seam
  const ceiling = mesh(
    geo(new THREE.CircleGeometry(C.canopyR - 0.1, BOARDS)),
    dark,
    turn,
    false,
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = topY - 0.02;
  const sweepGeo = geo(new THREE.BoxGeometry(0.09, 0.09, C.canopyR - C.drumR));
  for (let i = 0; i < BOARDS; i++) {
    const a = (i / BOARDS) * TAU;
    const sweep = mesh(sweepGeo, gold, turn, false);
    const r = (C.canopyR + C.drumR) / 2;
    sweep.position.set(Math.sin(a) * r, topY - 0.1, Math.cos(a) * r);
    sweep.rotation.y = a;
  }

  // the crown: eighteen flat rounding boards (each one the painted panel with its mirror), gold
  // mouldings above and below, and a gold finial standing on every joint
  const boardTop = topY + 0.32;
  mesh(
    prism(C.canopyR + 0.03, C.canopyR + 0.03, C.boardH, BOARDS),
    paint(tex(boardFile, BOARDS, 1), "#f1e2bf", { side: THREE.DoubleSide }),
    turn,
  ).position.y = boardTop - C.boardH / 2;
  mesh(
    prism(C.canopyR + 0.1, C.canopyR + 0.1, 0.1, BOARDS),
    gold,
    turn,
    false,
  ).position.y = boardTop;
  mesh(
    prism(C.canopyR + 0.1, C.canopyR + 0.1, 0.1, BOARDS),
    gold,
    turn,
    false,
  ).position.y = boardTop - C.boardH;
  const finialGeo = geo(new THREE.SphereGeometry(0.15, 10, 8));
  const spikeGeo = geo(new THREE.ConeGeometry(0.07, 0.36, 8));
  for (let i = 0; i < BOARDS; i++) {
    const a = (i / BOARDS) * TAU;
    const x = Math.sin(a) * (C.canopyR + 0.08);
    const z = Math.cos(a) * (C.canopyR + 0.08);
    mesh(finialGeo, gold, turn, false).position.set(x, boardTop + 0.18, z);
    mesh(spikeGeo, gold, turn, false).position.set(x, boardTop + 0.48, z);
  }

  // real light bulbs: up every rib to the lantern, round the lantern, and down the drum's corners —
  // chasing after dark (the painted boards carry their own rows of bulbs)
  const bulbGeo = geo(new THREE.SphereGeometry(0.085, 8, 6));
  const bulbMats = [0, 1].map(() =>
    keep(new THREE.MeshBasicMaterial({ color: "#fff3c4" })),
  );
  const bulbSpots: [number, number, number][] = [];
  const RIB_BULBS = opts.lowQuality ? 4 : 7;
  for (let i = 0; i < BOARDS; i++) {
    const a = (i / BOARDS) * TAU;
    for (let k = 1; k <= RIB_BULBS; k++) {
      const u = k / (RIB_BULBS + 1);
      const r = C.canopyR + (LANTERN_R - C.canopyR) * u;
      bulbSpots.push([
        Math.sin(a) * r,
        topY + C.canopyRise * u + 0.1,
        Math.cos(a) * r,
      ]);
    }
    bulbSpots.push([
      Math.sin(a) * (LANTERN_R + 0.12),
      lanternY + LANTERN_H + 0.12,
      Math.cos(a) * (LANTERN_R + 0.12),
    ]);
  }
  for (let i = 0; i < FACES; i++) {
    const a = (i / FACES) * TAU;
    for (let k = 0; k < 9; k++)
      bulbSpots.push([
        Math.sin(a) * (C.drumR + 0.2),
        C.deckY + PLINTH + 0.3 + k * ((panelH - 0.6) / 8),
        Math.cos(a) * (C.drumR + 0.2),
      ]);
  }
  const bulbs = [0, 1].map((k) => {
    const spots = bulbSpots.filter((_, i) => i % 2 === k);
    const im = new THREE.InstancedMesh(bulbGeo, bulbMats[k], spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, i) =>
      im.setMatrixAt(i, m4.makeTranslation(s[0], s[1], s[2])),
    );
    im.instanceMatrix.needsUpdate = true;
    turn.add(im);
    return im;
  });

  // ── the animals: each picture's own outline, extruded and bevelled, the picture wrapped round it ──
  // (geometry is built in picture space — x = u, y = v, both 0..1 — so the default "use x,y as the
  // UV" holds for the faces AND the carved edge, then scaled up to the animal's real size)
  const flatUV = {
    generateTopUV: (
      _g: THREE.ExtrudeGeometry,
      v: number[],
      a: number,
      b: number,
      c: number,
    ) => [a, b, c].map((i) => new THREE.Vector2(v[i * 3], v[i * 3 + 1])),
    generateSideWallUV: (
      _g: THREE.ExtrudeGeometry,
      v: number[],
      a: number,
      b: number,
      c: number,
      d: number,
    ) => [a, b, c, d].map((i) => new THREE.Vector2(v[i * 3], v[i * 3 + 1])),
  };
  const artKit = CAROUSEL_MOUNT_ART.map((art) => {
    const map = tex(art.file);
    if (map) map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    // the faces show the picture, cut out wherever it is clear (between the legs, under the tail);
    // the carved edge shows the paint at the picture's rim, never cut away
    const face = paint(map, art.edge, { alphaTest: 0.5 });
    const edgeMap = tex(art.edgeFile);
    if (edgeMap) edgeMap.wrapS = edgeMap.wrapT = THREE.ClampToEdgeWrapping;
    const edge = paint(edgeMap, art.edge, { roughness: 0.5 });
    return { art, face, edge, geos: new Map<number, THREE.ExtrudeGeometry>() };
  });
  const mountGeo = (kit: (typeof artKit)[number], len: number) => {
    let g = kit.geos.get(len);
    if (g) return g;
    const shape = new THREE.Shape(
      kit.art.outline.map(([u, v]) => new THREE.Vector2(u, v)),
    );
    const bevel = 0.07 / len;
    g = new THREE.ExtrudeGeometry(shape, {
      depth: (THICK - 0.2) / len,
      bevelEnabled: true,
      bevelThickness: 0.13 / len,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: opts.lowQuality ? 3 : 5,
      curveSegments: 1,
      UVGenerator: flatUV,
    });
    // welded and smooth-shaded: the faces roll into the edge like carved, sanded wood (as built,
    // every little facet of the outline caught the light on its own and read as a stack of slabs)
    {
      const groups = g.groups.slice();
      g.deleteAttribute("normal"); // (else no two corners ever match)
      const welded = mergeVertices(g, 1e-5);
      welded.clearGroups();
      for (const gr of groups)
        welded.addGroup(gr.start, gr.count, gr.materialIndex);
      welded.computeVertexNormals();
      g.dispose();
      g = geo(welded as THREE.ExtrudeGeometry);
    }
    // centred side to side and nose to tail; feet at y = 0
    g.translate(-0.5, 0, -(THICK - 0.2) / len / 2);
    kit.geos.set(len, g);
    return g;
  };
  const poleGeo = geo(
    new THREE.CylinderGeometry(0.055, 0.055, C.canopyY - 0.1, 10),
  );
  // (a barley-twist: a thin ribbon wound round each pole)
  const twistGeo = (() => {
    const pts: THREE.Vector3[] = [];
    const H = C.canopyY - 0.1;
    for (let i = 0; i <= 90; i++) {
      const u = i / 90;
      pts.push(
        new THREE.Vector3(
          Math.cos(u * 34) * 0.062,
          (u - 0.5) * H,
          Math.sin(u * 34) * 0.062,
        ),
      );
    }
    return geo(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        opts.lowQuality ? 90 : 180,
        0.022,
        5,
      ),
    );
  })();
  const pose: CarouselPose = { x: 0, y: 0, z: 0, yaw: 0 };
  const mounts = CAROUSEL_SEATS.map((seat, i) => {
    carouselMountPose(i, 0, pose);
    const pole = mesh(poleGeo, brass, turn, false);
    pole.position.set(pose.x, C.deckY + (C.canopyY - 0.1) / 2, pose.z);
    mesh(twistGeo, gold, pole, false);
    const kit = artKit[seat.art];
    if (!kit) return null;
    const h = carouselMountHeight(seat);
    const body = mesh(mountGeo(kit, seat.len), [kit.face, kit.edge], turn);
    body.scale.set(seat.len, h, seat.len);
    // the picture faces right (+x): turn that to the way the deck travels
    body.rotation.y = pose.yaw - Math.PI / 2;
    body.position.set(pose.x, pose.y, pose.z);
    return body;
  });

  // ── the band organ: a little kiosk beside the ride, where the music comes from ──
  {
    const a = Math.atan2(-C.x, -C.z) + 2.2; // off to one side of the way in
    const r = C.deckR + 4.2;
    const kiosk = new THREE.Group();
    kiosk.position.set(
      Math.sin(a) * r,
      groundY(C.x + Math.sin(a) * r, C.z + Math.cos(a) * r) - baseY,
      Math.cos(a) * r,
    );
    kiosk.rotation.y = a + Math.PI;
    group.add(kiosk);
    const organTex = tex(CAROUSEL_SURFACE_ART["organ-front"]?.file);
    if (organTex) organTex.wrapS = organTex.wrapT = THREE.ClampToEdgeWrapping;
    const w = 4.2;
    const h = w / (CAROUSEL_SURFACE_ART["organ-front"]?.aspect ?? 1.5);
    const box = mesh(
      geo(new THREE.BoxGeometry(w + 0.3, h + 0.3, 1.5)),
      crimson,
      kiosk,
    );
    box.position.y = (h + 0.3) / 2 + 0.25;
    const front = mesh(
      geo(new THREE.PlaneGeometry(w, h)),
      paint(organTex, "#e9d9b0"),
      kiosk,
      false,
    );
    front.position.set(0, (h + 0.3) / 2 + 0.25, 0.76);
    mesh(
      geo(new THREE.BoxGeometry(w + 0.7, 0.25, 1.9)),
      gold,
      kiosk,
    ).position.y = 0.125;
    mesh(
      geo(new THREE.BoxGeometry(w + 0.7, 0.22, 1.9)),
      gold,
      kiosk,
    ).position.y = h + 0.66;
  }

  let spin = 0;
  let speed = CAROUSEL_IDLE_TURN;
  let riding = false;
  const flagPos = flag.geometry.attributes.position as THREE.BufferAttribute;
  const flagBase = Float32Array.from(flagPos.array as Float32Array);
  return {
    group,
    get spin() {
      return spin;
    },
    update(dt, t, glow) {
      speed +=
        ((riding ? CAROUSEL_RIDE_TURN : CAROUSEL_IDLE_TURN) - speed) *
        Math.min(1, dt * 0.9);
      spin += speed * dt;
      turn.rotation.y = spin;
      // (the animals are children of the turning deck: only their rise and fall changes)
      for (let i = 0; i < mounts.length; i++) {
        const m = mounts[i];
        if (m) m.position.y = carouselMountPose(i, spin, pose).y;
      }
      // the bulbs chase round, brighter after dark; the paint glows a little more at night too
      const beat = Math.floor(t * 2.4) % 2;
      bulbMats[0].color.set(
        beat ? "#fff8dc" : glow > 0.4 ? "#ff9a3c" : "#e8d59a",
      );
      bulbMats[1].color.set(
        beat ? (glow > 0.4 ? "#ff9a3c" : "#e8d59a") : "#fff8dc",
      );
      for (const b of bulbs) b.scale.setScalar(1);
      for (const m of painted) m.emissiveIntensity = 0.26 + glow * 0.34;
      for (let i = 0; i < flagPos.count; i++)
        flagPos.setZ(
          i,
          Math.sin(t * 6 + flagBase[i * 3] * 5) *
            0.09 *
            (flagBase[i * 3] + 0.55),
        );
      flagPos.needsUpdate = true;
    },
    setRiding(on) {
      riding = on;
    },
    nearestSeat(x, z) {
      return nearestCarouselSeat(x - C.x, z - C.z, spin);
    },
    riderPose(i, out) {
      carouselRiderPose(i, spin, out);
      out.x += C.x;
      out.y += baseY;
      out.z += C.z;
      return out;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      for (const b of bulbs) b.dispose();
    },
  };
}
