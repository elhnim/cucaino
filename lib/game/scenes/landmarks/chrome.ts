import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { REGISTRY_DATA } from "../../types";
import type { InitialGameData } from "../../types";

/** Shared chrome for the landmark interior scenes (backdrop, sign, back button). */

export function kidId(scene: Phaser.Scene): string {
  return (scene.registry.get(REGISTRY_DATA) as InitialGameData)?.kid?.id ?? "";
}

export function backdrop(scene: Phaser.Scene, tint = 0xfff4e2) {
  const v = viewport(scene);
  const bg = scene.add.image(v.cx, v.cy, "bg").setDepth(-10);
  bg.setScale(Math.max(v.w / bg.width, v.h / bg.height));
  scene.add.rectangle(v.cx, v.cy, v.w, v.h, tint, 0.42).setDepth(-9);
}

/** the inside of a cosy house: wallpapered wall, (optional) window, floor + rug. */
export function room(scene: Phaser.Scene, wall = 0xefe1c6, floor = 0xb98b53, accent = 0xffe0b0, opts: { window?: boolean } = {}) {
  const v = viewport(scene);
  // wall + subtle wallpaper stripes
  scene.add.rectangle(v.cx, v.cy, v.w, v.h, wall).setDepth(-30);
  const wp = scene.add.graphics().setDepth(-29);
  wp.fillStyle(0xffffff, 0.05);
  for (let x = 0; x < v.w; x += 56) wp.fillRect(x, 0, 26, v.h);

  // window — only when content won't cover it
  if (opts.window) {
    const ww = Math.min(v.w * 0.24, 250), wh = ww * 0.82;
    const wx = Math.max(ww * 0.7 + 24, v.w * 0.2), wy = wh * 0.62 + 96;
    const wg = scene.add.graphics().setDepth(-28);
    wg.fillStyle(0x8a5a2b, 1).fillRoundedRect(wx - ww / 2 - 12, wy - wh / 2 - 12, ww + 24, wh + 24, 14);
    wg.fillStyle(0xaed7ff, 1).fillRoundedRect(wx - ww / 2, wy - wh / 2, ww, wh, 6);
    wg.fillStyle(0xcdeeff, 1).fillRect(wx - ww / 2, wy, ww, wh / 2);
    wg.fillStyle(0xfff3bf, 1).fillCircle(wx + ww * 0.24, wy - wh * 0.18, ww * 0.13);
    wg.lineStyle(7, 0x8a5a2b, 1);
    wg.beginPath();
    wg.moveTo(wx, wy - wh / 2); wg.lineTo(wx, wy + wh / 2);
    wg.moveTo(wx - ww / 2, wy); wg.lineTo(wx + ww / 2, wy);
    wg.strokePath();
  }

  // floor strip + baseboard + planks
  const fy = v.h * 0.84;
  scene.add.rectangle(v.cx, (fy + v.h) / 2, v.w, v.h - fy, floor).setDepth(-26);
  scene.add.rectangle(v.cx, fy, v.w, 14, 0x8a5a2b).setDepth(-25);
  const fg = scene.add.graphics().setDepth(-25);
  fg.lineStyle(3, 0x000000, 0.08);
  for (let yy = fy + 22; yy < v.h; yy += 40) fg.lineBetween(0, yy, v.w, yy);
  // rug + potted plant
  scene.add.graphics().setDepth(-24).fillStyle(accent, 0.5)
    .fillEllipse(v.cx, (fy + v.h) / 2 + 4, v.w * 0.5, (v.h - fy) * 1.5);
  scene.add.text(58, fy + 8, "🪴", { fontSize: "62px" }).setOrigin(0.5, 1).setDepth(-23);
}

/** carved wooden signboard (matches the town landmarks) */
export function sign(scene: Phaser.Scene, x: number, y: number, label: string, size = 40) {
  const txt = scene.add.text(0, 0, label, {
    fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: "bold",
    fontSize: `${size}px`, color: "#5a3a18",
  }).setOrigin(0.5);
  const w = txt.width + 64, h = txt.height + 32;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 6, -h / 2 + 9, w, h, 18);
  g.fillStyle(0x9c6b34, 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 18);
  g.fillStyle(0xf6e7c6, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
  g.lineStyle(6, 0x8a5a2b, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
  return scene.add.container(x, y, [g, txt]).setDepth(100);
}

export function backButton(scene: Phaser.Scene) {
  const v = viewport(scene);
  const r = 34 * v.ui;
  const c = scene.add.circle(0, 0, r, 0xffffff, 0.96).setStrokeStyle(4, 0xb5572a);
  const a = scene.add.text(0, 0, "←", {
    fontFamily: "system-ui", fontStyle: "bold", fontSize: `${36 * v.ui}px`, color: "#b5572a",
  }).setOrigin(0.5);
  const btn = scene.add.container(28 + r, 26 + r, [c, a]).setDepth(100)
    .setSize(r * 2, r * 2).setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
  btn.on("pointerdown", () => {
    window.history.pushState({}, "", `/kid/${kidId(scene)}/world`);
    scene.scene.start("World");
  });
}

/** a juicy rounded card panel; returns the graphics (add children on top) */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = 0xffffff, shadow = 0xe0a655) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.12).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 9, w, h, 24);
  g.fillStyle(shadow, 1).fillRoundedRect(x - w / 2, y - h / 2 + 7, w, h, 24);
  g.fillStyle(fill, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 24);
  return g;
}

/** centred grid positions for n cards */
export function grid(v: { w: number }, n: number, cw: number, ch: number, gap: number, top: number) {
  const cols = Math.max(1, Math.min(n, Math.floor((v.w - 36) / (cw + gap))));
  const totalW = cols * cw + (cols - 1) * gap;
  const startX = (v.w - totalW) / 2 + cw / 2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    out.push({ x: startX + c * (cw + gap), y: top + ch / 2 + r * (ch + gap) });
  }
  return out;
}

export function relayoutOnResize(scene: Phaser.Scene) {
  const fn = () => scene.scene.restart();
  scene.scale.on(Phaser.Scale.Events.RESIZE, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, fn));
}

/** make `container` drag-scroll vertically within a viewport rect; masks overflow */
export function scrollArea(
  scene: Phaser.Scene, container: Phaser.GameObjects.Container,
  x: number, y: number, w: number, h: number, contentBottom: number,
) {
  const m = scene.make.graphics({});
  m.fillStyle(0xffffff).fillRect(x, y, w, h);
  container.setMask(m.createGeometryMask());

  const maxScroll = Math.max(0, contentBottom - (y + h));
  if (maxScroll <= 0) return;

  const zone = scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive().setDepth(-1);
  let dragging = false, startY = 0, startC = 0;
  zone.on("pointerdown", (p: Phaser.Input.Pointer) => { dragging = true; startY = p.y; startC = container.y; });
  const onMove = (p: Phaser.Input.Pointer) => {
    if (dragging && p.isDown) container.y = Phaser.Math.Clamp(startC + (p.y - startY), -maxScroll, 0);
  };
  const onUp = () => { dragging = false; };
  scene.input.on("pointermove", onMove);
  scene.input.on("pointerup", onUp);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off("pointermove", onMove);
    scene.input.off("pointerup", onUp);
  });

  // "scroll for more" hint
  const hint = scene.add.text(x + w - 26, y + h - 22, "⌄ more", {
    fontFamily: "system-ui", fontStyle: "bold", fontSize: "18px", color: "#8a5a2b",
    backgroundColor: "#ffffffcc", padding: { x: 8, y: 3 },
  }).setOrigin(1).setDepth(60);
  container.on("destroy", () => hint.destroy());
}
