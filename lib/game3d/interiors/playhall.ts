import * as THREE from "three";
import { createRoomShell } from "./shell";
import { labelSprite, emojiSprite } from "../buildingKit";
import type { Interior, InteractiveZone } from "./types";

const WIDTH = 18;
const DEPTH = 14;
const WALL_HEIGHT = 5;
const CABINET_TRIGGER_RADIUS = 1.6;

interface CabinetDef {
  key: string;
  label: string;
  emoji: string;
  color: string;
  /** route this cabinet leads to, kidId is interpolated by the caller */
  route: (kidId: string) => string;
}

// Every standalone mini-game gets its own glowing arcade cabinet. To add a game to the
// arcade, append one entry here — the cabinet, its animated screen and its trigger zone
// are all generated from it.
const CABINETS: CabinetDef[] = [
  { key: "game:trading", label: "Nugget Market", emoji: "📈", color: "#22c55e", route: (id) => `/play/trading?kid=${id}` },
  { key: "game:invest", label: "Invest", emoji: "📊", color: "#4f46e5", route: (id) => `/play/invest?kid=${id}` },
  { key: "game:arcade", label: "AI Arcade", emoji: "🕹️", color: "#06b6d4", route: (id) => `/play/arcade?kid=${id}` },
  { key: "game:dream-life", label: "Dream Life", emoji: "🌟", color: "#8b5cf6", route: (id) => `/play/dream-life?kid=${id}` },
  { key: "game:money-town", label: "Money Town", emoji: "💰", color: "#eab308", route: (id) => `/play/money-town?kid=${id}` },
  { key: "game:family-talking-point", label: "Family Chat", emoji: "💬", color: "#14b8a6", route: (id) => `/play/family-talking-point?kid=${id}` },
  { key: "game:village-pillage", label: "Village Pillage", emoji: "🏰", color: "#10b981", route: (id) => `/play/village-pillage?kid=${id}` },
  { key: "game:library", label: "Story Library", emoji: "📖", color: "#0ea5e9", route: (id) => `/play/library?kid=${id}` },
  { key: "game:learn", label: "Learn", emoji: "📚", color: "#f43f5e", route: (id) => `/play/learn?kid=${id}` },
];

/** Resolves a "game:*" onZone key from this room into the route KidGameApp should navigate to. */
export function resolveDoorwayRoute(key: string, kidId: string): string | null {
  const def = CABINETS.find((d) => d.key === key);
  return def ? def.route(kidId) : null;
}

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Classic arcade carpet: dark navy with neon squiggles, stars and dots. */
function makeArcadeCarpet(): THREE.CanvasTexture {
  return canvasTex(
    256,
    (ctx) => {
      ctx.fillStyle = "#15123a";
      ctx.fillRect(0, 0, 256, 256);
      const neon = ["#ff4fd8", "#39e1ff", "#ffe14f", "#6bff8a"];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let i = 0; i < 22; i++) {
        ctx.strokeStyle = neon[i % neon.length];
        const x = rnd() * 256, y = rnd() * 256;
        const kind = i % 3;
        ctx.beginPath();
        if (kind === 0) {
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 14, y - 16, x + 28, y);
          ctx.quadraticCurveTo(x + 42, y + 16, x + 56, y);
        } else if (kind === 1) {
          ctx.arc(x, y, 8, 0, Math.PI * 2);
        } else {
          ctx.moveTo(x - 9, y);
          ctx.lineTo(x + 9, y);
          ctx.moveTo(x, y - 9);
          ctx.lineTo(x, y + 9);
        }
        ctx.stroke();
      }
    },
    true,
  );
}

/** A little "attract mode" screen per cabinet: stripes + the game's emoji; UV-scrolled each frame. */
function makeScreenTexture(def: CabinetDef): THREE.CanvasTexture {
  return canvasTex(
    128,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, def.color);
      g.addColorStop(1, "#0b0b1e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#ffffff";
      for (let y = 0; y < 128; y += 8) ctx.fillRect(0, y, 128, 2); // scanlines
      ctx.globalAlpha = 1;
      ctx.font = "54px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.emoji, 64, 64);
    },
    true,
  );
}

export function buildPlayHallInterior(accent: string): Interior {
  const room = createRoomShell({
    width: WIDTH,
    depth: DEPTH,
    wallHeight: WALL_HEIGHT,
    wallColor: "#2b1d5c",
    floorTexture: makeArcadeCarpet(),
    backgroundColor: "#0d0820",
  });
  const { scene, track, floorY } = room;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra }));
  const trackSprite = (s: THREE.Sprite) => {
    const m = s.material as THREE.SpriteMaterial;
    track(m);
    if (m.map) track(m.map);
    return s;
  };
  // arcades are dark and glowy: dim the shell's warm hemisphere light
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) o.intensity = 0.55;
  });

  const zones: InteractiveZone[] = [];
  const screens: THREE.CanvasTexture[] = [];
  const marquees: THREE.MeshStandardMaterial[] = [];

  // neon strips running along the top of every wall, cycling colour
  const neonColors = ["#ff4fd8", "#39e1ff", "#ffe14f", "#6bff8a"];
  const neonMats = neonColors.map((c) => std(c, { emissive: c, emissiveIntensity: 1.2 }));
  const stripGeoX = track(new THREE.BoxGeometry(WIDTH / 8, 0.12, 0.12));
  const stripGeoZ = track(new THREE.BoxGeometry(0.12, 0.12, DEPTH / 6));
  const strips: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(stripGeoX, neonMats[i % 4]);
    s.position.set(-WIDTH / 2 + WIDTH / 16 + (i * WIDTH) / 8, floorY + WALL_HEIGHT - 0.3, -DEPTH / 2 + 0.2);
    scene.add(s);
    strips.push(s);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(stripGeoZ, neonMats[(i + (side > 0 ? 2 : 0)) % 4]);
      s.position.set(side * (WIDTH / 2 - 0.2), floorY + WALL_HEIGHT - 0.3, -DEPTH / 2 + DEPTH / 12 + (i * DEPTH) / 6);
      scene.add(s);
      strips.push(s);
    }
  }

  const cabBodyGeo = track(new THREE.BoxGeometry(1.3, 2.3, 1));
  const cabTopGeo = track(new THREE.BoxGeometry(1.4, 0.45, 1.1));
  const cabPanelGeo = track(new THREE.BoxGeometry(1.3, 0.12, 0.55));
  const screenGeo = track(new THREE.PlaneGeometry(0.95, 0.75));
  const stickGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6));
  const ballGeo = track(new THREE.SphereGeometry(0.07, 8, 6));
  const buttonGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10));
  const buttonMats = ["#ff4f6d", "#ffe14f", "#39e1ff"].map((c) => std(c, { emissive: c, emissiveIntensity: 0.6 }));

  function buildCabinet(def: CabinetDef, x: number, z: number, facingAngle: number) {
    const group = new THREE.Group();
    const bodyMat = std(def.color);
    const body = new THREE.Mesh(cabBodyGeo, bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    group.add(body);
    const marqueeMat = std(def.color, { emissive: def.color, emissiveIntensity: 0.9 });
    marquees.push(marqueeMat);
    const top = new THREE.Mesh(cabTopGeo, marqueeMat);
    top.position.y = 2.5;
    group.add(top);
    const tex = track(makeScreenTexture(def));
    screens.push(tex);
    const screen = new THREE.Mesh(screenGeo, track(new THREE.MeshBasicMaterial({ map: tex })));
    screen.position.set(0, 1.65, 0.51);
    screen.rotation.x = -0.12;
    group.add(screen);
    const panel = new THREE.Mesh(cabPanelGeo, std("#1f1b3a"));
    panel.position.set(0, 1.05, 0.6);
    panel.rotation.x = 0.35;
    group.add(panel);
    const stick = new THREE.Mesh(stickGeo, std("#222"));
    stick.position.set(-0.3, 1.2, 0.62);
    const ball = new THREE.Mesh(ballGeo, buttonMats[0]);
    ball.position.set(-0.3, 1.32, 0.62);
    group.add(stick, ball);
    buttonMats.forEach((m, i) => {
      const b = new THREE.Mesh(buttonGeo, m);
      b.position.set(0.05 + i * 0.18, 1.14, 0.64);
      b.rotation.x = 0.35;
      group.add(b);
    });
    const label = trackSprite(labelSprite(`${def.emoji} ${def.label}`));
    label.position.set(0, 3.25, 0.1);
    label.scale.multiplyScalar(0.62);
    group.add(label);
    group.position.set(x, floorY, z);
    group.rotation.y = facingAngle;
    scene.add(group);

    const inward = new THREE.Vector3(Math.sin(facingAngle), 0, Math.cos(facingAngle)).multiplyScalar(1.5);
    zones.push({ key: def.key, position: new THREE.Vector3(x + inward.x, 0, z + inward.z), radius: CABINET_TRIGGER_RADIUS });
  }

  // 5 cabinets along the back wall, 2 along each side wall — 9 total
  const back = CABINETS.slice(0, 5);
  const left = CABINETS.slice(5, 7);
  const right = CABINETS.slice(7, 9);
  const backSpacing = WIDTH / (back.length + 1);
  back.forEach((def, i) => buildCabinet(def, -WIDTH / 2 + backSpacing * (i + 1), -DEPTH / 2 + 0.8, 0));
  const sideSpacing = DEPTH / (left.length + 1.5);
  left.forEach((def, i) => buildCabinet(def, -WIDTH / 2 + 0.8, -DEPTH / 2 + sideSpacing * (i + 1), Math.PI / 2));
  right.forEach((def, i) => buildCabinet(def, WIDTH / 2 - 0.8, -DEPTH / 2 + sideSpacing * (i + 1), -Math.PI / 2));

  // ── Quiz Show stage (the priority destination): podium, lit steps, spinning spotlights ──
  const stage = new THREE.Group();
  const step = new THREE.Mesh(track(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 24)), std("#3b2a7a"));
  step.position.y = 0.15;
  step.receiveShadow = true;
  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.3, 0.06, 6, 40)), std("#ffe14f", { emissive: "#ffe14f", emissiveIntensity: 1 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.31;
  stage.add(step, ring);
  const podiumMat = std("#fbbf24");
  for (const dx of [-1, 1]) {
    const podium = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 1.3, 0.7)), podiumMat);
    podium.position.set(dx, 0.95, 0);
    podium.castShadow = true;
    stage.add(podium);
    const buzzer = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), buttonMats[0]);
    buzzer.position.set(dx, 1.6, 0);
    stage.add(buzzer);
  }
  const quizSign = trackSprite(labelSprite("🎯 Quiz Show"));
  quizSign.position.set(0, 3.2, 0);
  stage.add(quizSign);
  const lights: THREE.Mesh[] = [];
  const beamGeo = track(new THREE.ConeGeometry(0.7, 3.2, 12, 1, true));
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(
      beamGeo,
      track(new THREE.MeshBasicMaterial({ color: neonColors[i], transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })),
    );
    beam.position.y = 1.8;
    stage.add(beam);
    lights.push(beam);
  }
  stage.position.set(0, floorY, -2.2);
  scene.add(stage);
  zones.push({ key: "quiz-corner", position: new THREE.Vector3(0, 0, -0.6), radius: 2.2 });

  // ── Claw machine: glass box of prizes and a claw that roams, dips and grabs ──
  const claw = new THREE.Group();
  const clawBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.8, 1, 1.8)), std(accent));
  clawBase.position.y = 0.5;
  clawBase.castShadow = true;
  const glass = new THREE.Mesh(track(new THREE.BoxGeometry(1.7, 1.6, 1.7)), track(new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.18, roughness: 0.05 })));
  glass.position.y = 1.8;
  const clawRoof = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.3, 1.9)), std(accent, { emissive: accent, emissiveIntensity: 0.5 }));
  clawRoof.position.y = 2.75;
  claw.add(clawBase, glass, clawRoof);
  const prizes = ["🧸", "🐰", "🦄", "🐻", "🐸", "🐼"];
  prizes.forEach((p, i) => {
    const s = trackSprite(emojiSprite(p, 0.5));
    s.position.set(((i % 3) - 1) * 0.45, 1.25 + Math.floor(i / 3) * 0.2, (Math.floor(i / 3) - 0.5) * 0.5);
    claw.add(s);
  });
  const hook = new THREE.Group();
  const cable = new THREE.Mesh(track(new THREE.CylinderGeometry(0.015, 0.015, 1, 4)), std("#dddddd"));
  cable.position.y = 0.5;
  const hookHead = new THREE.Mesh(track(new THREE.ConeGeometry(0.13, 0.22, 3)), std("#c0c7d1", { metalness: 0.6, roughness: 0.3 }));
  hookHead.rotation.x = Math.PI;
  hook.add(cable, hookHead);
  hook.position.y = 2.1;
  claw.add(hook);
  const clawSign = trackSprite(labelSprite("🧸 Claw Machine"));
  clawSign.scale.multiplyScalar(0.55);
  clawSign.position.y = 3.35;
  claw.add(clawSign);
  claw.position.set(-5, floorY, 2.3);
  scene.add(claw);

  // ── Prize counter with a glowing trophy on top ──
  const prizeCounter = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 1.1, 0.9)), std("#fff4e0"));
  prizeCounter.position.set(5, floorY + 0.55, 2.3);
  prizeCounter.castShadow = true;
  scene.add(prizeCounter);
  const trophy = new THREE.Mesh(track(new THREE.ConeGeometry(0.35, 0.8, 12)), std("#ffd447", { emissive: "#b8860b", emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
  trophy.position.set(5, floorY + 1.55, 2.3);
  trophy.rotation.x = Math.PI;
  scene.add(trophy);
  const prizeSign = trackSprite(labelSprite("🏆 Prizes"));
  prizeSign.scale.multiplyScalar(0.55);
  prizeSign.position.set(5, floorY + 2.6, 2.3);
  scene.add(prizeSign);
  const shelfPrizes = ["🎈", "🪀", "🎁", "⭐"].map((e, i) => {
    const s = trackSprite(emojiSprite(e, 0.45));
    s.position.set(4 + i * 0.66, floorY + 1.3, 2.75);
    scene.add(s);
    return s;
  });

  let t = 0;
  return {
    scene,
    spawnPoint: room.spawnPoint,
    bounds: room.bounds, rect: room.rect,
    zones,
    cameraOffset: new THREE.Vector3(0, 9.5, 10),
    update(dt) {
      room.update(dt);
      t += dt;
      for (const tex of screens) tex.offset.y = (t * 0.12) % 1;
      marquees.forEach((m, i) => (m.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 4 + i * 0.9)) * 0.8));
      // neon chase: each strip pulses a beat after its neighbour
      strips.forEach((s, i) => s.scale.set(1, 1 + Math.max(0, Math.sin(t * 6 - i * 0.6)) * 0.8, 1));
      buttonMats.forEach((m, i) => (m.emissiveIntensity = 0.4 + (Math.sin(t * 7 + i * 2) > 0.3 ? 0.9 : 0)));
      lights.forEach((b, i) => {
        const a = t * 0.8 + (i * Math.PI * 2) / 3;
        b.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
      });
      ring.rotation.z = t * 0.6;
      // claw loop: roam (0-3s), dip (3-4s), rise (4-5s)
      const cycle = t % 5;
      if (cycle < 3) {
        hook.position.x = Math.sin(t * 1.3) * 0.5;
        hook.position.z = Math.cos(t * 0.9) * 0.5;
        hook.position.y = 2.1;
      } else if (cycle < 4) {
        hook.position.y = 2.1 - (cycle - 3) * 0.6;
      } else {
        hook.position.y = 1.5 + (cycle - 4) * 0.6;
      }
      trophy.rotation.y = t * 1.2;
      shelfPrizes.forEach((s, i) => (s.position.y = floorY + 1.3 + Math.abs(Math.sin(t * 3 + i)) * 0.1));
    },
    dispose: room.dispose,
  };
}
