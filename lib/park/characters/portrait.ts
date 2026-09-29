// 2D portraits of the chibi characters: one small offscreen three.js render -> a PNG data URL, cached.
// Lets flat UI (pet sheets, the Star Pets page, the home widget) show the SAME character as the park
// instead of older emoji/SVG art.
//
//   const url = await chibiPortrait({ id: "animal-dragon", pose: "cheer", width: 120, height: 144 });
//
// One shared renderer (created on first use, released after a short idle so it doesn't hold a WebGL
// context). Returns null when WebGL isn't available; callers keep a fallback for that.
// Import this module lazily (dynamic import) from UI so three.js stays out of first-load JS.
import * as THREE from "three";
import type { AnimalId } from "@/lib/park/assets/loader";
import type { ChibiAction } from "./animate";
import { buildChibi } from "./chibi";

export interface PortraitOpts {
  id: AnimalId;
  /** css pixels (the image is rendered at up to 2x for sharp screens) */
  width: number;
  height?: number;
  role?: "kid" | "pet";
  /** collar / scarf colour (the park uses #ffb020 for pets) */
  accent?: string;
  /** pose to freeze: idle (smile), cheer (happy eyes, arms up), sad, sleep (eyes closed)... */
  pose?: ChibiAction;
  /** "full" = whole body standing (sprites), "head" = head & shoulders (round badges) */
  framing?: "full" | "head";
  /** turn towards the viewer's left (radians); a little 3/4 view reads best */
  yaw?: number;
  /** 0..1 twilight glow (eyes, horn, markings) */
  glow?: number;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function keyOf(o: PortraitOpts, dpr: number) {
  return [o.id, o.role ?? "pet", o.accent ?? "", o.pose ?? "idle", o.framing ?? "full", o.width, o.height ?? o.width, o.yaw ?? 0.42, o.glow ?? 0, dpr].join("|");
}
function pixelRatio() {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

/** A portrait that's already been rendered (sync), so remounts don't flicker. */
export function peekPortrait(o: PortraitOpts): string | null {
  return cache.get(keyOf(o, pixelRatio())) ?? null;
}

export function chibiPortrait(o: PortraitOpts): Promise<string | null> {
  const key = keyOf(o, pixelRatio());
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    // yield a frame so a sheet full of portraits paints first, then fills in
    p = new Promise<string | null>((resolve) => {
      const run = () => {
        let url: string | null = null;
        try {
          url = render(o);
        } catch {
          url = null;
        }
        pending.delete(key);
        if (url) cache.set(key, url);
        resolve(url);
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 0);
    });
    pending.set(key, p);
  }
  return p;
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (failed || typeof document === "undefined") return null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(release, 8000);
  if (renderer) return renderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    return renderer;
  } catch {
    failed = true;
    return null;
  }
}

function release() {
  idleTimer = null;
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
}

let lights: THREE.Object3D[] | null = null;
function makeLights(): THREE.Object3D[] {
  // same soft daylight the park characters are tuned for
  const hemi = new THREE.HemisphereLight("#ffffff", "#ffd9ec", 1.6);
  const sun = new THREE.DirectionalLight("#fff6e8", 1.9);
  sun.position.set(3, 8, 6);
  const rim = new THREE.DirectionalLight("#cfe4ff", 0.5);
  rim.position.set(-4, 3, -5);
  return [hemi, sun, rim];
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

function render(o: PortraitOpts): string | null {
  const r = getRenderer();
  if (!r) return null;
  const dpr = pixelRatio();
  const W = Math.max(8, Math.round(o.width));
  const H = Math.max(8, Math.round(o.height ?? o.width));
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  r.setPixelRatio(1);
  r.setSize(pw, ph, false);

  const scene = new THREE.Scene();
  lights ??= makeLights();
  for (const l of lights) scene.add(l);
  const height = 2;
  const rig = buildChibi(o.id, { height, role: o.role ?? "pet", accent: o.accent ?? "#ffb020", seed: 11 });
  scene.add(rig.root);
  rig.root.rotation.y = o.yaw ?? 0.42;
  const pose = o.pose ?? "idle";
  if (pose !== "idle") rig.play(pose, false);
  // 0.9s in: the pose has faded in and the idle blink/look/hop timers (all >= 1s) haven't fired
  for (let i = 0; i < 54; i++) rig.update(1 / 60, 0);
  rig.setGlow(o.glow ?? 0);
  rig.root.updateMatrixWorld(true);

  // frame the character with an orthographic camera looking slightly down
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  // droopy poses (sad, sleep) look at the ground: meet them lower so the face still shows
  const pitch = pose === "sad" || pose === "sleep" ? -0.05 : o.framing === "head" ? 0.1 : 0.16;
  cam.position.set(0, Math.sin(pitch) * 10, Math.cos(pitch) * 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  _box.makeEmpty();
  const inv = cam.matrixWorldInverse;
  const box = _box;
  rig.root.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
  });
  let minX = box.min.x, maxX = box.max.x, minY = box.min.y, maxY = box.max.y;
  if (o.framing === "head") minY = maxY - (maxY - minY) * 0.62; // head + a hint of shoulders
  const pad = o.framing === "head" ? 0.04 : 0.06;
  let w = (maxX - minX) * (1 + pad * 2), h = (maxY - minY) * (1 + pad * 2);
  const aspect = pw / ph;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (minX + maxX) / 2;
  // full body sits on the bottom edge (like a sprite); head shots are centred
  const cy = o.framing === "head" ? (minY + maxY) / 2 : minY - (maxY - minY) * pad + h / 2;
  cam.left = cx - w / 2;
  cam.right = cx + w / 2;
  cam.top = cy + h / 2;
  cam.bottom = cy - h / 2;
  cam.updateProjectionMatrix();

  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  rig.dispose();
  for (const l of lights) scene.remove(l);
  return url.length > 32 ? url : null;
}
