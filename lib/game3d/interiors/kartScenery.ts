// Cucaino Karts: the race scene's look — the things that make it read as a real, lovingly-built
// kart circuit rather than a grey ribbon on a green disc. All of it is built once (a handful of
// draw calls: textures are small canvases, repeated things are instanced), lives in the track's own
// local space like the rest of the ride, and never touches the driving (physics reads none of it).
//
//   road        asphalt with a grain, painted white edge lines and a dashed centre line, a
//               chequered start/finish line and painted grid boxes
//   ground      mown stripes across the grass
//   barriers    a continuous low candy-coloured barrier exactly where the soft wall is (so the
//               thing that stops a kart is something a kid can SEE), gravel on the outside of bends
//   trackside   sponsor boards along the straights, two banner arches over the road, flag poles
//               by the line, hot-air balloons, a sun
//   shadows     a soft blob under every kart (it stays on the road when the kart jumps)
import * as THREE from "three";
import { getToonRamp } from "@/lib/park/assets/loader";
import { trackAt, WALL_MARGIN, type KartTrack } from "@/lib/park/karts/track";

const TAU = Math.PI * 2;
const toon = (color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp(), ...extra });

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** a tiny deterministic random (the scenery must look the same every race) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface KartScenery {
  group: THREE.Group;
  /** the grass texture (karts.ts's own ground meshes use it too) */
  grassTex: THREE.Texture;
  /** one soft shadow per kart: call with each kart's position and how high it is off the road */
  blob(i: number, x: number, z: number, air: number, visible: boolean): void;
  update(t: number): void;
  dispose(): void;
}

export function buildKartScenery(track: KartTrack, kartCount: number): KartScenery {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const half = track.width / 2;
  const n = track.points.length;
  const r = rng(977);

  // ── the road: asphalt, edge lines, a dashed centre line ──
  const tiles = Math.max(1, Math.round(track.length / 9));
  const roadTex = canvasTex(
    256,
    256,
    (c) => {
      c.fillStyle = "#666a86";
      c.fillRect(0, 0, 256, 256);
      // grain
      for (let i = 0; i < 2600; i++) {
        const v = 70 + Math.floor(r() * 70);
        c.fillStyle = `rgba(${v + 20},${v + 22},${v + 40},${0.25 + r() * 0.3})`;
        c.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.6);
      }
      // the rubbered-in racing groove: a touch darker down the middle
      const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, "rgba(20,20,40,0.2)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      // edge lines
      c.fillStyle = "#f6f1e4";
      c.fillRect(9, 0, 7, 256);
      c.fillRect(240, 0, 7, 256);
      // the dashed centre line
      c.fillStyle = "#f3e7b8";
      c.fillRect(125, 0, 6, 120);
    },
    true,
  );
  texs.push(roadTex);
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = track.points[i % n];
      const b = track.points[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const px = (dz / l) * half;
      const pz = (-dx / l) * half;
      const v = ((i === n ? track.length : track.cum[i]) / track.length) * tiles;
      pos.push(a[0] - px, 0, a[1] - pz, a[0] + px, 0, a[1] + pz);
      uv.push(0, v, 1, v);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geos.push(geo);
    const mat = toon(0xffffff, { map: roadTex, side: THREE.DoubleSide });
    mats.push(mat);
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    group.add(road);
  }

  // ── the start/finish line (chequered) and the painted grid boxes ──
  {
    const lineTex = canvasTex(256, 32, (c) => {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++) {
          c.fillStyle = (i + j) % 2 ? "#1c1c26" : "#f8f5ec";
          c.fillRect(i * 16, j * 16, 16, 16);
        }
    });
    texs.push(lineTex);
    const at = trackAt(track, 0);
    const geo = new THREE.PlaneGeometry(track.width, 1.5);
    geo.rotateX(-Math.PI / 2);
    geos.push(geo);
    const mat = new THREE.MeshBasicMaterial({ map: lineTex, polygonOffset: true, polygonOffsetFactor: -2 });
    mats.push(mat);
    const line = new THREE.Mesh(geo, mat);
    line.position.set(at.x, 0.012, at.z);
    line.rotation.y = Math.atan2(at.dx, at.dz);
    group.add(line);
    // grid boxes: an open-backed white bracket at every slot
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xf6f1e4, polygonOffset: true, polygonOffsetFactor: -2 });
    mats.push(boxMat);
    const front = new THREE.PlaneGeometry(2.6, 0.22);
    front.rotateX(-Math.PI / 2);
    const side = new THREE.PlaneGeometry(0.22, 1.5);
    side.rotateX(-Math.PI / 2);
    geos.push(front, side);
    for (const g of track.grid) {
      const a = trackAt(track, g.s + 1.7);
      const yaw = Math.atan2(a.dx, a.dz);
      const cx = a.x + a.dz * g.lateral;
      const cz = a.z - a.dx * g.lateral;
      const bracket = new THREE.Group();
      bracket.position.set(cx, 0.012, cz);
      bracket.rotation.y = yaw;
      bracket.add(new THREE.Mesh(front, boxMat));
      for (const sx of [-1.19, 1.19]) {
        const m = new THREE.Mesh(side, boxMat);
        m.position.set(sx, 0, -0.75);
        bracket.add(m);
      }
      group.add(bracket);
    }
  }

  // ── the grass: mown stripes ──
  const grassTex = canvasTex(
    128,
    128,
    (c) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = "#cfe6bf";
      c.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(120,160,100,0.18)";
        c.fillRect(r() * 128, r() * 128, 1.5, 3);
      }
    },
    true,
  );
  texs.push(grassTex);

  // ── which way the road bends at each point (+1 = left, -1 = right, 0 = straight enough) ──
  const bend = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const a = track.points[(i - 2 + n) % n];
    const b = track.points[i];
    const c = track.points[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    // (dx, dz) turning left means (dz, dx) cross > 0 in this x/z layout — see track.ts's lateral sign
    bend[i] = track.radius[i] < 42 ? (cross > 0 ? -1 : 1) : 0;
  }
  // (lateral > 0 = left = (-dz, dx)) a left-hand bend's OUTSIDE is its right-hand side
  const tangent = (i: number) => {
    const a = track.points[(i - 1 + n) % n];
    const b = track.points[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l };
  };
  const leftOf = (i: number, lat: number) => {
    const t = tangent(i);
    const p = track.points[i];
    return [p[0] - t.dz * lat, p[1] + t.dx * lat] as const;
  };
  // work out, from real geometry, which side is the outside of each bend
  const outside = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    if (!bend[i]) continue;
    const j = (i + 6) % n;
    const [lx, lz] = leftOf(i, 6);
    const [rx, rz] = leftOf(i, -6);
    const q = track.points[j];
    // the side that ends up FURTHER from where the road goes next is the outside
    outside[i] = Math.hypot(lx - q[0], lz - q[1]) > Math.hypot(rx - q[0], rz - q[1]) ? 1 : -1;
  }

  // ── gravel on the outside of the bends (between the kerb and the barrier) ──
  {
    const pos: number[] = [];
    const idx: number[] = [];
    let v = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!outside[i] || outside[j] !== outside[i]) continue;
      const sgn = outside[i];
      const a0 = leftOf(i, sgn * (half + 1.0));
      const a1 = leftOf(i, sgn * (half + WALL_MARGIN + 0.1));
      const b0 = leftOf(j, sgn * (half + 1.0));
      const b1 = leftOf(j, sgn * (half + WALL_MARGIN + 0.1));
      pos.push(a0[0], 0.006, a0[1], a1[0], 0.006, a1[1], b0[0], 0.006, b0[1], b1[0], 0.006, b1[1]);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
    if (v) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geos.push(geo);
      const mat = toon(0xe6d3a0, { side: THREE.DoubleSide });
      mats.push(mat);
      const gravel = new THREE.Mesh(geo, mat);
      gravel.receiveShadow = true;
      group.add(gravel);
    }
  }

  // ── the barrier: one instanced run of chunky blocks along both soft walls, coloured by corner ──
  {
    const step = 2.05;
    const count = Math.ceil(track.length / step) * 2;
    const geo = new THREE.BoxGeometry(0.55, 0.72, step * 0.94);
    geos.push(geo);
    const mat = toon(0xffffff);
    mats.push(mat);
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const white = new THREE.Color(0xfbf7ee);
    const zone: Record<string, THREE.Color> = { hairpin: new THREE.Color(0xffc93c), chicane: new THREE.Color(0x3fa9ff), esses: new THREE.Color(0x8b6cff), sweeper: new THREE.Color(0xff5fa8) };
    const straight = new THREE.Color(0xf0463c);
    let k = 0;
    let row = 0;
    for (let s = 0; s < track.length && k < count - 1; s += step, row++) {
      const at = trackAt(track, s);
      const corner = track.corners.find((c) => (c.s0 <= c.s1 ? s >= c.s0 && s <= c.s1 : s >= c.s0 || s <= c.s1));
      const col = row % 2 ? white : corner ? zone[corner.kind] : straight;
      q.setFromAxisAngle(up, Math.atan2(at.dx, at.dz));
      for (const side of [-1, 1]) {
        const lat = side * (half + WALL_MARGIN + 0.42);
        p.set(at.x - at.dz * lat, 0.36, at.z + at.dx * lat);
        inst.setMatrixAt(k, m.compose(p, q, one));
        inst.setColorAt(k, col);
        k++;
      }
    }
    inst.count = k;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }

  // ── sponsor boards along the outside of the straights ──
  {
    const names: [string, string, string][] = [
      ["CUCAINO KARTS", "#ff5fa8", "#ffffff"],
      ["CANDY FUEL", "#ffd23f", "#3a2a5c"],
      ["ZOOM JUICE", "#3fa9ff", "#ffffff"],
      ["DRAGON TYRES", "#5ee6a8", "#1d3b2f"],
      ["SUNNYBROOK MARKET", "#ff9a52", "#ffffff"],
      ["PUFFSWING AIR", "#c38bff", "#ffffff"],
    ];
    const boardMats = names.map(([text, bg, fg]) => {
      const t = canvasTex(512, 128, (c) => {
        c.fillStyle = bg;
        c.fillRect(0, 0, 512, 128);
        c.fillStyle = "rgba(255,255,255,0.22)";
        for (let i = -2; i < 12; i++) {
          c.beginPath();
          c.moveTo(i * 60, 128);
          c.lineTo(i * 60 + 24, 128);
          c.lineTo(i * 60 + 84, 0);
          c.lineTo(i * 60 + 60, 0);
          c.fill();
        }
        c.strokeStyle = "#ffffff";
        c.lineWidth = 8;
        c.strokeRect(4, 4, 504, 120);
        c.fillStyle = fg;
        c.font = `900 ${text.length > 13 ? 50 : 62}px system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, 256, 68);
      });
      texs.push(t);
      const mat = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
      mats.push(mat);
      return mat;
    });
    const boardGeo = new THREE.PlaneGeometry(6.4, 1.6);
    const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
    geos.push(boardGeo, legGeo);
    const legMat = toon(0x4a4d5c);
    mats.push(legMat);
    let k = 0;
    let lastS = -99;
    for (let i = 0; i < n; i++) {
      const s = track.cum[i];
      if (track.radius[i] < 140 || s - lastS < 13) continue;
      lastS = s;
      const at = trackAt(track, s);
      const side = k % 2 ? 1 : -1;
      const lat = side * (half + WALL_MARGIN + 2.1);
      const x = at.x - at.dz * lat;
      const z = at.z + at.dx * lat;
      const board = new THREE.Mesh(boardGeo, boardMats[k % boardMats.length]);
      board.position.set(x, 1.3, z);
      // faces across the road
      board.rotation.y = Math.atan2(at.dx, at.dz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      board.castShadow = true;
      group.add(board);
      for (const o of [-2.7, 2.7]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x + at.dx * o, 0.25, z + at.dz * o);
        group.add(leg);
      }
      k++;
    }
  }

  // ── two banner arches over the road ──
  {
    const bannerTex = canvasTex(1024, 128, (c) => {
      const g = c.createLinearGradient(0, 0, 1024, 0);
      ["#ff5fa8", "#ffb03f", "#ffe14d", "#5ee6a8", "#6cc6ff", "#c38bff"].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
      c.fillStyle = g;
      c.fillRect(0, 0, 1024, 128);
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          c.fillStyle = (i + j) % 2 ? "#1c1c26" : "#f8f5ec";
          c.fillRect(i * 16, j * 16, 16, 16);
          c.fillRect(896 + i * 16, j * 16, 16, 16);
        }
      c.fillStyle = "#ffffff";
      c.strokeStyle = "rgba(40,20,80,0.6)";
      c.lineWidth = 10;
      c.font = "900 84px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.strokeText("CUCAINO KARTS", 512, 68);
      c.fillText("CUCAINO KARTS", 512, 68);
    });
    texs.push(bannerTex);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide });
    const pillarMat = toon(0xf4f0e6);
    const capMat = toon(0xff5fa8);
    mats.push(bannerMat, pillarMat, capMat);
    const span = track.width + WALL_MARGIN * 2 + 3;
    const pillarGeo = new THREE.CylinderGeometry(0.42, 0.5, 7.6, 10);
    const capGeo = new THREE.SphereGeometry(0.62, 10, 8);
    const bannerGeo = new THREE.BoxGeometry(span, 1.7, 0.25);
    geos.push(pillarGeo, capGeo, bannerGeo);
    // on the two long straights that aren't the start straight
    const spots = track.boostPads.slice(1).map((p) => p.s + 26).filter((_, i) => i !== 1);
    for (const s of spots) {
      const at = trackAt(track, s);
      const arch = new THREE.Group();
      arch.position.set(at.x, 0, at.z);
      arch.rotation.y = Math.atan2(at.dx, at.dz);
      for (const sx of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set((sx * span) / 2, 3.8, 0);
        pillar.castShadow = true;
        arch.add(pillar);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set((sx * span) / 2, 7.9, 0);
        arch.add(cap);
      }
      const banner = new THREE.Mesh(bannerGeo, [pillarMat, pillarMat, pillarMat, pillarMat, bannerMat, bannerMat]);
      banner.position.set(0, 6.6, 0);
      banner.castShadow = true;
      arch.add(banner);
      group.add(arch);
    }
  }

  // ── flag poles by the line (the flags wave) ──
  const flags: THREE.Mesh[] = [];
  {
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 6.4, 6);
    const flagGeo = new THREE.PlaneGeometry(2.1, 1.2, 6, 1);
    flagGeo.translate(1.05, 0, 0);
    geos.push(poleGeo, flagGeo);
    const poleMat = toon(0xf4f0e6);
    mats.push(poleMat);
    const cols = [0xff5fa8, 0xffd23f, 0x3fa9ff, 0x5ee6a8, 0xc38bff, 0xff9a52];
    const flagMats = cols.map((c) => toon(c, { side: THREE.DoubleSide }));
    mats.push(...flagMats);
    let k = 0;
    for (let s = -34; s <= 34; s += 11.3) {
      const at = trackAt(track, s);
      for (const side of [-1, 1]) {
        const lat = side * (half + WALL_MARGIN + 4.4);
        const x = at.x - at.dz * lat;
        const z = at.z + at.dx * lat;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3.2, z);
        group.add(pole);
        const flag = new THREE.Mesh(flagGeo.clone(), flagMats[k % flagMats.length]);
        geos.push(flag.geometry);
        flag.position.set(x, 5.7, z);
        flag.rotation.y = Math.atan2(at.dx, at.dz) - Math.PI / 2;
        flag.userData.phase = k * 0.9;
        flags.push(flag);
        group.add(flag);
        k++;
      }
    }
  }

  // ── hot-air balloons drifting over the hills ──
  const balloons: { g: THREE.Group; y: number; phase: number }[] = [];
  {
    const stripe = (a: string, b: string) => {
      const t = canvasTex(128, 16, (c) => {
        for (let i = 0; i < 8; i++) {
          c.fillStyle = i % 2 ? a : b;
          c.fillRect(i * 16, 0, 16, 16);
        }
      });
      texs.push(t);
      const mat = new THREE.MeshToonMaterial({ map: t, gradientMap: getToonRamp(), fog: false });
      mats.push(mat);
      return mat;
    };
    const envGeo = new THREE.SphereGeometry(7, 16, 12);
    envGeo.scale(1, 1.18, 1);
    const neckGeo = new THREE.CylinderGeometry(2.6, 1.3, 4, 12, 1, true);
    const basketGeo = new THREE.BoxGeometry(2.2, 1.7, 2.2);
    geos.push(envGeo, neckGeo, basketGeo);
    const basketMat = toon(0x9a6a3a, { fog: false });
    mats.push(basketMat);
    const looks = [stripe("#ff5fa8", "#ffffff"), stripe("#ffd23f", "#ff7a3c"), stripe("#3fa9ff", "#ffffff"), stripe("#5ee6a8", "#ffe14d"), stripe("#c38bff", "#ffffff")];
    looks.forEach((mat, i) => {
      const a = (i / looks.length) * TAU + 0.5;
      const rad = 150 + (i % 3) * 38;
      const g = new THREE.Group();
      const env = new THREE.Mesh(envGeo, mat);
      const neck = new THREE.Mesh(neckGeo, mat);
      neck.position.y = -8.6;
      const basket = new THREE.Mesh(basketGeo, basketMat);
      basket.position.y = -12.4;
      g.add(env, neck, basket);
      const y = 42 + ((i * 17) % 30);
      g.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      g.scale.setScalar(0.9 + (i % 2) * 0.35);
      balloons.push({ g, y, phase: i * 1.7 });
      group.add(g);
    });
  }

  // ── the sun: a warm disc with a soft halo, low over the hills ──
  {
    const sunTex = canvasTex(256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,252,230,1)");
      g.addColorStop(0.16, "rgba(255,244,190,1)");
      g.addColorStop(0.22, "rgba(255,230,150,0.55)");
      g.addColorStop(0.5, "rgba(255,220,140,0.16)");
      g.addColorStop(1, "rgba(255,220,140,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    });
    texs.push(sunTex);
    const mat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    mats.push(mat);
    const sun = new THREE.Sprite(mat);
    sun.scale.setScalar(170);
    sun.position.set(230, 150, 150);
    sun.renderOrder = -5;
    group.add(sun);
  }

  // ── a soft shadow under every kart ──
  const blobTex = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.6, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  texs.push(blobTex);
  const blobGeo = new THREE.PlaneGeometry(3.4, 4.2);
  blobGeo.rotateX(-Math.PI / 2);
  geos.push(blobGeo);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  mats.push(blobMat);
  const blobs = Array.from({ length: kartCount }, () => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.position.y = 0.02;
    m.renderOrder = 2;
    group.add(m);
    return m;
  });

  return {
    group,
    grassTex,
    blob(i, x, z, air, visible) {
      const m = blobs[i];
      if (!m) return;
      m.visible = visible;
      m.position.set(x, 0.02, z);
      m.scale.setScalar(Math.max(0.45, 1 - air * 0.22));
    },
    update(t) {
      for (const f of flags) {
        const pos = f.geometry.attributes.position as THREE.BufferAttribute;
        const ph = f.userData.phase as number;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setZ(i, Math.sin(x * 2.4 - t * 6 + ph) * 0.16 * (x / 2.1));
        }
        pos.needsUpdate = true;
      }
      for (const b of balloons) {
        b.g.position.y = b.y + Math.sin(t * 0.35 + b.phase) * 2.2;
        b.g.rotation.y = t * 0.05 + b.phase;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
