// Small shared low-poly building-block helpers, used by village.ts and by every
// interior room builder in lib/game3d/interiors/. Keeps the "flat-shaded primitive +
// hand-drawn canvas texture" look consistent everywhere instead of each file
// reinventing box/roof/label meshes.
import * as THREE from "three";
import { makeRoofTexture, makeWoodTexture } from "./textures";

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A small rounded pill-shaped label sprite, e.g. floating over a landmark or interior prop. */
export function labelSprite(text: string): THREE.Sprite {
  const w = 512, h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 64px system-ui, -apple-system, sans-serif";
  const metrics = ctx.measureText(text);
  const padX = 48;
  const boxW = Math.min(w, metrics.width + padX * 2);
  const boxX = (w - boxW) / 2;
  const boxH = 96, boxY = (h - boxH) / 2;
  const r = 32;
  ctx.fillStyle = "rgba(30, 20, 10, 0.28)";
  roundRect(ctx, boxX + 4, boxY + 8, boxW, boxH, r);
  ctx.fill();
  ctx.fillStyle = "#fffaf0";
  roundRect(ctx, boxX, boxY, boxW, boxH, r);
  ctx.fill();
  ctx.strokeStyle = "#e8c07a";
  ctx.lineWidth = 5;
  roundRect(ctx, boxX, boxY, boxW, boxH, r);
  ctx.stroke();
  ctx.fillStyle = "#5a3a18";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, boxY + boxH / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.4, 4.4 * (h / w), 1);
  return sprite;
}

export function pyramidRoof(radius: number, height: number, colorHex: string): THREE.Mesh {
  const tex = makeRoofTexture(colorHex);
  tex.repeat.set(2, 2);
  const geo = new THREE.ConeGeometry(radius, height, 4, 1);
  geo.rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, flatShading: true }));
  mesh.castShadow = true;
  return mesh;
}

export function woodBox(w: number, h: number, d: number, colorHex: string): THREE.Mesh {
  const tex = makeWoodTexture(colorHex);
  tex.repeat.set(Math.max(1, w / 2.4), Math.max(1, h / 2.4));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function flag(colorHex: string, height: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, height, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3c, flatShading: true }),
  );
  pole.position.y = height / 2;
  g.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.4, 4, 1),
    new THREE.MeshStandardMaterial({ color: colorHex, side: THREE.DoubleSide, flatShading: true }),
  );
  cloth.position.set(0.32, height - 0.28, 0);
  g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}

/** A round badge with a single emoji, e.g. a "❗" beacon over a landmark or a mood bubble over the pet. */
export function emojiSprite(emoji: string, size = 1.4): THREE.Sprite {
  const px = 128;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(30, 20, 10, 0.25)";
  ctx.beginPath();
  ctx.arc(px / 2 + 3, px / 2 + 5, px / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffaf0";
  ctx.beginPath();
  ctx.arc(px / 2, px / 2, px / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8c07a";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.font = "64px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, px / 2, px / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(size, size, 1);
  return sprite;
}
