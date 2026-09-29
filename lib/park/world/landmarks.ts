// Hand-built landmarks for the plaza: the Heart of the Island (a tiered stone fountain with a
// great floating crystal inside turning rune rings), the grand Quest Board (where chores live —
// it should look important) and the Daily Gift treasure chest. Standard materials so they take
// the filmic light and shadows; the magic parts are HDR-bright so they bloom.
import * as THREE from "three";

export interface Landmark {
  group: THREE.Group;
  update(dt: number, t: number, glow: number): void;
  dispose(): void;
}

function kit() {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const mats = new Map<string, THREE.Material>();
  const std = (c: string, rough = 0.85, metal = 0) => {
    const k = `${c}|${rough}|${metal}`;
    let m = mats.get(k);
    if (!m) {
      m = track(new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, flatShading: true }));
      mats.set(k, m);
    }
    return m;
  };
  const glowMat = (c: string, k = 2.2) => track(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const x = new THREE.Mesh(track(g), m);
    x.castShadow = cast;
    x.receiveShadow = true;
    return x;
  };
  const glowSprite = (c: string, s: number) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: track(new THREE.CanvasTexture(cv)), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    sp.scale.setScalar(s);
    return sp;
  };
  return { track, std, glowMat, mesh, glowSprite, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** the fountain + floating crystal at the centre of the plaza */
export function buildHeartOfIsland(): Landmark {
  const k = kit();
  const g = new THREE.Group();
  const stone = k.std("#d9cdb8");
  const stoneDark = k.std("#a89880");
  const gold = k.std("#e0b04a", 0.35, 0.8);
  // three tiers of basin
  const tiers: [number, number, number][] = [
    [5.2, 0.9, 0],
    [2.9, 0.7, 1.35],
    [1.3, 0.55, 2.55],
  ];
  const water: THREE.Mesh[] = [];
  const waterMat = k.track(new THREE.MeshStandardMaterial({ color: "#5fc8f0", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: new THREE.Color("#1f6fa0") }));
  for (const [r, h, y] of tiers) {
    const pts = [new THREE.Vector2(0.01, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r * 1.04, h * 0.5), new THREE.Vector2(r, h), new THREE.Vector2(r * 0.86, h), new THREE.Vector2(r * 0.86, h * 0.4), new THREE.Vector2(0.01, h * 0.4)];
    const basin = k.mesh(new THREE.LatheGeometry(pts, 28), y === 0 ? stone : stoneDark);
    basin.position.y = y;
    g.add(basin);
    const trim = k.mesh(new THREE.TorusGeometry(r, 0.07, 6, 40), gold, false);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = y + h;
    g.add(trim);
    const w = k.mesh(new THREE.CircleGeometry(r * 0.86, 28), waterMat, false);
    w.rotation.x = -Math.PI / 2;
    w.position.y = y + h * 0.82;
    g.add(w);
    water.push(w);
  }
  // pillar the tiers stand on
  const col = k.mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.6, 10), stone);
  col.position.y = 1.3;
  g.add(col);
  // the great crystal, floating, inside two rune rings
  // a real faceted gem: lit, flat-shaded facets + a modest inner glow (a pure HDR colour just
  // bloomed into a white blob at dusk)
  const crystalMat = k.track(new THREE.MeshStandardMaterial({ color: "#8fe8ff", roughness: 0.15, metalness: 0.2, flatShading: true, emissive: new THREE.Color("#2bb8e0"), emissiveIntensity: 0.55, transparent: true, opacity: 0.92 }));
  const heart = new THREE.Group();
  heart.position.y = 6.2;
  const core = k.mesh(new THREE.OctahedronGeometry(1.2, 0), crystalMat, false);
  core.scale.set(0.8, 1.7, 0.8);
  heart.add(core);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const shard = k.mesh(new THREE.OctahedronGeometry(0.35, 0), k.glowMat(i % 2 ? "#c69bff" : "#7ff0ff", 0.95), false);
    shard.position.set(Math.cos(a) * 1.9, Math.sin(a * 2) * 0.4, Math.sin(a) * 1.9);
    shard.scale.set(0.7, 1.4, 0.7);
    heart.add(shard);
  }
  // orbiting rune stones (carved blocks with a glowing glyph) instead of thin wire hoops
  const runeStone = k.std("#8a8094", 0.9);
  const glyph = k.glowMat("#ffd36b", 1.1);
  const orbit = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = k.mesh(new THREE.BoxGeometry(0.7, 1.1, 0.35), runeStone, false);
    b.position.set(Math.cos(a) * 3, Math.sin(a * 3) * 0.5, Math.sin(a) * 3);
    b.lookAt(0, b.position.y, 0);
    b.rotation.z = 0.25 * (i - 1);
    const gl = k.mesh(new THREE.PlaneGeometry(0.34, 0.6), glyph, false);
    gl.position.z = 0.18;
    b.add(gl);
    orbit.add(b);
  }
  g.add(orbit);
  orbit.position.y = 6.2;
  const heartHalo = k.glowSprite("#8ff4ff", 3.4);
  (heartHalo.material as THREE.SpriteMaterial).opacity = 0.22;
  heart.add(heartHalo);
  g.add(heart);
  // falling sparkles like water spray
  const N = 80;
  const pos = new Float32Array(N * 3);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = Math.random() * 10;
  const pg = k.track(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const spray = new THREE.Points(pg, k.track(new THREE.PointsMaterial({ color: new THREE.Color("#bff6ff").multiplyScalar(1.6), size: 0.18, transparent: true, opacity: 0.9, depthWrite: false })));
  spray.frustumCulled = false;
  g.add(spray);

  return {
    group: g,
    update(_dt, t, glow) {
      heart.position.y = 6.2 + Math.sin(t * 1.1) * 0.25;
      heart.rotation.y = t * 0.35;
      orbit.rotation.y = -t * 0.25;
      orbit.position.y = 6.2 + Math.sin(t * 0.8) * 0.2;
      water.forEach((w, i) => (w.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.01)));
      for (let i = 0; i < N; i++) {
        const u = (t * 0.6 + seeds[i]) % 1;
        const a = seeds[i] * 6.28;
        const r = 0.5 + u * 2.6;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 3.2 + Math.sin(u * Math.PI) * 1.6 - u * 1.8;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      pg.attributes.position.needsUpdate = true;
      crystalMat.emissiveIntensity = 0.45 + glow * 0.35 + Math.sin(t * 1.6) * 0.08;
      (heartHalo.material as THREE.SpriteMaterial).opacity = 0.16 + glow * 0.14;
    },
    dispose: k.dispose,
  };
}

/** the Quest Board: a carved notice board under a little roof, with glowing quest scrolls */
export function buildQuestBoard(): Landmark {
  const k = kit();
  const g = new THREE.Group();
  const stone = k.std("#b8ab94");
  const wood = k.std("#7a4f2e", 0.9);
  const woodLight = k.std("#a8744a", 0.9);
  const gold = k.std("#e0b04a", 0.35, 0.8);
  const plinth = k.mesh(new THREE.BoxGeometry(6.4, 0.6, 2.2), stone);
  plinth.position.y = 0.3;
  g.add(plinth);
  for (const x of [-2.8, 2.8]) {
    const post = k.mesh(new THREE.BoxGeometry(0.45, 5.2, 0.45), wood);
    post.position.set(x, 3.2, 0);
    g.add(post);
    const cap = k.mesh(new THREE.OctahedronGeometry(0.35, 0), gold);
    cap.position.set(x, 5.95, 0);
    g.add(cap);
  }
  const board = k.mesh(new THREE.BoxGeometry(5.2, 3.2, 0.25), woodLight);
  board.position.set(0, 3.4, 0);
  g.add(board);
  const frame = k.mesh(new THREE.BoxGeometry(5.5, 0.22, 0.35), wood);
  frame.position.set(0, 5.05, 0);
  g.add(frame);
  const frame2 = frame.clone();
  frame2.position.y = 1.75;
  g.add(frame2);
  // roof
  const roof = k.mesh(new THREE.CylinderGeometry(0.01, 1.3, 6.6, 3, 1, false), k.std("#4a3a6a", 0.8));
  roof.rotation.z = Math.PI / 2;
  roof.rotation.x = Math.PI / 2;
  roof.scale.set(1, 1, 0.55);
  roof.position.set(0, 6.3, 0);
  g.add(roof);
  // parchment scrolls pinned to the board (glow softly — quests waiting!)
  const scrollMat = k.track(new THREE.MeshStandardMaterial({ color: "#f3e6c4", roughness: 0.9, emissive: new THREE.Color("#ffd36b"), emissiveIntensity: 0.15 }));
  const scrolls: THREE.Mesh[] = [];
  const spots: [number, number, number][] = [
    [-1.6, 4.1, 0.1],
    [0, 4.25, -0.08],
    [1.6, 4.05, 0.12],
    [-0.9, 2.6, -0.1],
    [0.9, 2.7, 0.1],
  ];
  for (const [x, y, r] of spots) {
    const s = k.mesh(new THREE.PlaneGeometry(1.1, 1.3), scrollMat, false);
    s.position.set(x, y, 0.14);
    s.rotation.z = r;
    g.add(s);
    scrolls.push(s);
    const pin = k.mesh(new THREE.SphereGeometry(0.07, 6, 4), k.glowMat("#ff6b6b", 1.4), false);
    pin.position.set(x, y + 0.55, 0.16);
    g.add(pin);
  }
  // banners
  for (const x of [-3.5, 3.5]) {
    const b = k.mesh(new THREE.PlaneGeometry(0.9, 2.4), k.std("#6a3fb8", 0.9), false);
    b.position.set(x, 4.2, 0.3);
    (b.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(b);
    const emblem = k.mesh(new THREE.CircleGeometry(0.25, 12), gold, false);
    emblem.position.set(x, 4.6, 0.32);
    g.add(emblem);
  }
  // rune crystal on top
  const rune = k.mesh(new THREE.OctahedronGeometry(0.55, 0), k.glowMat("#ffd36b", 2.2), false);
  rune.scale.set(0.8, 1.4, 0.8);
  rune.position.set(0, 7.5, 0);
  g.add(rune);
  const halo = k.glowSprite("#ffd36b", 3.2);
  halo.position.copy(rune.position);
  g.add(halo);
  // lanterns either side
  for (const x of [-4.4, 4.4]) {
    const pole = k.mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), wood);
    pole.position.set(x, 1.5, 0.8);
    g.add(pole);
    const lamp = k.mesh(new THREE.OctahedronGeometry(0.28, 0), k.glowMat("#ffc46b", 2), false);
    lamp.position.set(x, 3.1, 0.8);
    g.add(lamp);
    const lh = k.glowSprite("#ffc46b", 2.2);
    lh.position.copy(lamp.position);
    g.add(lh);
  }
  return {
    group: g,
    update(_dt, t, glow) {
      rune.rotation.y = t * 1.2;
      rune.position.y = 7.5 + Math.sin(t * 2) * 0.12;
      scrollMat.emissiveIntensity = 0.12 + glow * 0.35 + Math.sin(t * 2.4) * 0.05;
      scrolls.forEach((s, i) => (s.rotation.y = Math.sin(t * 1.3 + i) * 0.05));
    },
    dispose: k.dispose,
  };
}

/** the Daily Gift: a golden treasure chest on a little pedestal */
export function buildGiftChest(): Landmark {
  const k = kit();
  const g = new THREE.Group();
  const stone = k.std("#b8ab94");
  const wood = k.track(new THREE.MeshStandardMaterial({ color: "#c0703a", roughness: 0.7, emissive: new THREE.Color("#3a1a08"), emissiveIntensity: 0.5 }));
  const gold = k.track(new THREE.MeshStandardMaterial({ color: "#ffd05a", roughness: 0.3, metalness: 0.6, emissive: new THREE.Color("#8a5a10"), emissiveIntensity: 0.6 }));
  const ped = k.mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.7, 8), stone);
  ped.position.y = 0.35;
  g.add(ped);
  const box = k.mesh(new THREE.BoxGeometry(1.8, 1, 1.2), wood);
  box.position.y = 1.2;
  g.add(box);
  const lidG = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 10, 1, false, 0, Math.PI);
  lidG.rotateZ(Math.PI / 2);
  const lid = k.mesh(lidG, wood);
  lid.position.y = 1.7;
  g.add(lid);
  for (const x of [-0.7, 0, 0.7]) {
    const band = k.mesh(new THREE.BoxGeometry(0.14, 1.05, 1.26), gold);
    band.position.set(x, 1.2, 0);
    g.add(band);
  }
  const lock = k.mesh(new THREE.BoxGeometry(0.3, 0.36, 0.1), gold);
  lock.position.set(0, 1.45, 0.64);
  g.add(lock);
  const glow = k.glowSprite("#ffd36b", 4);
  glow.position.y = 1.6;
  (glow.material as THREE.SpriteMaterial).opacity = 0.5;
  g.add(glow);
  // golden light leaking from under the lid
  const seam = k.mesh(new THREE.BoxGeometry(1.7, 0.06, 1.14), k.glowMat("#ffd36b", 1.6), false);
  seam.position.y = 1.72;
  g.add(seam);
  return {
    group: g,
    update(_dt, t) {
      glow.scale.setScalar(3.6 + Math.sin(t * 2.5) * 0.5);
      lid.rotation.x = Math.max(0, Math.sin(t * 0.8)) * -0.08;
    },
    dispose: k.dispose,
  };
}

/** a dark-glass nameplate (place and land names in the world), sized to its text */
export function plateSprite(text: string, accent = "#ffd36b", height = 1): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "900 44px 'Lilita One', system-ui, -apple-system, 'Segoe UI Emoji', sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 64;
  c.width = w;
  c.height = 84;
  g.font = font;
  const r = 30;
  const box = (x: number, y: number, bw: number, bh: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + bw, y, x + bw, y + bh, r);
    g.arcTo(x + bw, y + bh, x, y + bh, r);
    g.arcTo(x, y + bh, x, y, r);
    g.arcTo(x, y, x + bw, y, r);
    g.closePath();
  };
  const fill = g.createLinearGradient(0, 6, 0, 76);
  fill.addColorStop(0, "rgba(44,39,102,0.92)");
  fill.addColorStop(1, "rgba(18,16,44,0.92)");
  box(4, 6, w - 8, 70);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = accent;
  g.stroke();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, 43);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set((height * w) / 84, height, 1);
  return s;
}
