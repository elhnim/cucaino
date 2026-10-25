// Frostpeak Isle's painted words, in ONE mesh: little quads laid on the sign boards and banners of
// the props (./props.ts), all drawn from one canvas atlas — "⬆ Slide Top" on the ramp's signposts,
// each slide's name on its start arch, "PENGUIN SKI RUN" over the start hut's door, "START" on the
// ski run's start arch, "Warm-Up Lodge" on the lodge, and the pond's and the lookout's names.
import * as THREE from "three";
import { FROST_ISLAND, FROST_PROPS, FROST_SLIDES, type FrostProp } from "../../registry/frostIsland";

const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;

interface Sign {
  p: FrostProp;
  /** the board's face centre, in the prop's frame, and which way it faces (+1 front / -1 back) */
  x: number;
  y: number;
  z: number;
  face: number;
  w: number;
  h: number;
  text: string;
  bg: string;
  fg: string;
}

export function frostSigns(): Sign[] {
  const out: Sign[] = [];
  for (const p of FROST_PROPS) {
    switch (p.kind) {
      case "sign": {
        const text = p.v === 0 || p.v === 1 ? "⬆ Slide Top" : p.v === 2 ? "Frozen Pond" : "Aurora Lookout";
        const bg = ["#4fc3f7", "#ffcf4a", "#b3e5fc", "#b07ce8"][p.v % 4];
        out.push({ p, x: 0.14, y: 1.4, z: 0.135, face: 1, w: 0.95, h: 0.55, text, bg, fg: "#ffffff" });
        break;
      }
      case "slidegate":
        for (const face of [1, -1]) out.push({ p, x: 0, y: 2.3, z: 0.16 * face, face, w: 3.6, h: 0.5, text: FROST_SLIDES[p.v]?.name ?? "", bg: ["#ff5a7a", "#ffcf4a", "#4fc3a1"][p.v % 3], fg: "#ffffff" });
        break;
      case "skihut":
        out.push({ p, x: 0, y: 2.38, z: 1.43, face: 1, w: 2.8, h: 0.55, text: "PENGUIN SKI RUN", bg: "#20406e", fg: "#ffe27a" });
        break;
      case "lodge":
        out.push({ p, x: 0, y: 3.55, z: 3.49, face: 1, w: 3.5, h: 0.62, text: "☕ Warm-Up Lodge", bg: "#2f5d3a", fg: "#fff4d0" });
        break;
      case "skigate":
        if (p.v === 2) for (const face of [1, -1]) out.push({ p, x: 0, y: 3.0, z: 0.11 * face, face, w: 3.4, h: 0.7, text: "🐧 START 🐧", bg: "#20406e", fg: "#ffffff" });
        break;
    }
  }
  return out;
}

const SLOT_W = 512;
const SLOT_H = 96;

function drawAtlas(signs: Sign[]): THREE.Texture {
  const rows = signs.length;
  if (typeof document === "undefined") {
    // (no DOM: tests) a plain texture
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const cv = document.createElement("canvas");
  cv.width = SLOT_W;
  cv.height = SLOT_H * rows;
  const c = cv.getContext("2d")!;
  signs.forEach((s, i) => {
    const y = i * SLOT_H;
    c.fillStyle = s.bg;
    c.fillRect(0, y, SLOT_W, SLOT_H);
    // (a lighter inner rim)
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 6;
    c.strokeRect(5, y + 5, SLOT_W - 10, SLOT_H - 10);
    // fit the words to the board's shape
    const aspect = s.w / s.h;
    const px = Math.min(64, Math.floor((SLOT_W / Math.max(4, s.text.length)) * 1.55), Math.floor((SLOT_H * 0.7 * aspect * SLOT_H) / SLOT_W));
    c.font = `900 ${Math.max(28, px)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 8;
    c.strokeStyle = "rgba(20,24,40,0.55)";
    c.strokeText(s.text, SLOT_W / 2, y + SLOT_H / 2 + 3);
    c.fillStyle = s.fg;
    c.fillText(s.text, SLOT_W / 2, y + SLOT_H / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** the words, one mesh (island-local) */
export function buildSigns(): THREE.Mesh {
  const signs = frostSigns();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  signs.forEach((s, i) => {
    const p = s.p;
    m.compose(new THREE.Vector3(p.x - X0, p.y, p.z - Z0), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(p.s, p.s, p.s));
    const v0 = 1 - (i + 1) / signs.length;
    const v1 = 1 - i / signs.length;
    const base = pos.length / 3;
    for (const [cx, cy, u, vv] of [
      [-0.5, -0.5, 0, v0],
      [0.5, -0.5, 1, v0],
      [0.5, 0.5, 1, v1],
      [-0.5, 0.5, 0, v1],
    ] as const) {
      // (a back face reads mirrored unless x flips)
      v.set(s.x + cx * s.w * s.face, s.y + cy * s.h, s.z).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      uv.push(u, vv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: drawAtlas(signs), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "frost-signs";
  return mesh;
}
