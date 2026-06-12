import Phaser from "phaser";
import { viewport, hiDpiCamera } from "../../systems/layout";
import { REGISTRY_DATA } from "../../types";
import type { InitialGameData } from "../../types";

/** Shared chrome for the landmark interior scenes (backdrop, sign, back button). */

export function kidId(scene: Phaser.Scene): string {
  return (scene.registry.get(REGISTRY_DATA) as InitialGameData)?.kid?.id ?? "";
}

export function backdrop(scene: Phaser.Scene, tint = 0xfff4e2) {
  hiDpiCamera(scene);
  const v = viewport(scene);
  const bg = scene.add.image(v.cx, v.cy, "bg").setDepth(-10);
  bg.setScale(Math.max(v.w / bg.width, v.h / bg.height));
  scene.add.rectangle(v.cx, v.cy, v.w, v.h, tint, 0.42).setDepth(-9);
}

/** the inside of a cosy house: wallpapered wall, (optional) window, floor + rug. */
export function room(scene: Phaser.Scene, wall = 0xefe1c6, floor = 0xb98b53, accent = 0xffe0b0, opts: { window?: boolean; furniture?: boolean } = {}) {
  hiDpiCamera(scene);
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
  // round rug — kept fully on the floor (no bleed onto the wall) with a soft
  // shadow, a lighter centre and two trim rings so it reads as a rug, not a blob.
  const rcx = v.cx, rcy = fy + (v.h - fy) * 0.56;
  const rw = Math.min(v.w * 0.46, 480), rh = (v.h - fy) * 0.78;
  const rug = scene.add.graphics().setDepth(-24);
  rug.fillStyle(0x000000, 0.08).fillEllipse(rcx, rcy + 7, rw + 18, rh + 12);
  rug.fillStyle(accent, 0.92).fillEllipse(rcx, rcy, rw, rh);
  rug.fillStyle(0xffffff, 0.16).fillEllipse(rcx, rcy, rw * 0.66, rh * 0.66);
  rug.lineStyle(5, 0xffffff, 0.55).strokeEllipse(rcx, rcy, rw * 0.88, rh * 0.88);
  rug.lineStyle(3, 0xffffff, 0.32).strokeEllipse(rcx, rcy, rw * 0.46, rh * 0.46);
  scene.add.text(58, fy + 8, "🪴", { fontSize: "62px" }).setOrigin(0.5, 1).setDepth(-23);

  // Furnished by default so every landmark shares the same cosy room; a scene
  // with its own dense props (e.g. the Shop) can opt out with furniture:false.
  if (opts.furniture !== false) furnishRoom(scene, v, fy);
}

/** Cosy background furniture — desk, bookshelf, wall clock, framed pictures.
 *  Drawn behind content (negative depth) so cards/items always sit on top. */
function furnishRoom(scene: Phaser.Scene, v: { w: number; h: number }, fy: number) {
  // —— wall clock, upper-right ——
  const cr = Math.min(34, v.w * 0.05 + 18);
  const cx = v.w * 0.88, cy = v.h * 0.2;
  const clk = scene.add.graphics().setDepth(-27);
  clk.fillStyle(0x000000, 0.12).fillCircle(cx + 3, cy + 5, cr + 6);
  clk.fillStyle(0x6b4a26, 1).fillCircle(cx, cy, cr + 6);
  clk.fillStyle(0xfff8ec, 1).fillCircle(cx, cy, cr);
  clk.lineStyle(3, 0x7a4a1e, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    clk.lineBetween(cx + Math.cos(a) * (cr - 6), cy + Math.sin(a) * (cr - 6), cx + Math.cos(a) * (cr - 2), cy + Math.sin(a) * (cr - 2));
  }
  clk.lineStyle(4, 0x3a2a14, 1).lineBetween(cx, cy, cx + Math.cos(-2.6) * cr * 0.5, cy + Math.sin(-2.6) * cr * 0.5);
  clk.lineStyle(3, 0x3a2a14, 1).lineBetween(cx, cy, cx + Math.cos(-0.5) * cr * 0.72, cy + Math.sin(-0.5) * cr * 0.72);
  clk.fillStyle(0x3a2a14, 1).fillCircle(cx, cy, 3.5);

  // —— framed pictures on the wall (left + centre-left) ——
  const frame = (x: number, y: number, w: number, h: number, emoji: string) => {
    const fg = scene.add.graphics().setDepth(-27);
    fg.fillStyle(0x000000, 0.12).fillRoundedRect(x - w / 2 - 4, y - h / 2 - 2, w + 12, h + 12, 6);
    fg.fillStyle(0x6b4a26, 1).fillRoundedRect(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 6);
    fg.fillStyle(0xfdf6e3, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    scene.add.text(x, y, emoji, { fontSize: `${h * 0.66}px` }).setOrigin(0.5).setDepth(-26);
  };
  frame(v.w * 0.1, v.h * 0.2, 56, 50, "🌳");
  frame(v.w * 0.1, v.h * 0.2 + 78, 56, 50, "🌈");

  // —— desk with a lamp + books, on the floor (right) ——
  const dx = v.w * 0.82, dw = Math.min(190, v.w * 0.22), dh = 70, dtop = fy - dh;
  const desk = scene.add.graphics().setDepth(-24);
  desk.fillStyle(0x000000, 0.1).fillEllipse(dx, fy + 4, dw * 1.05, 16);
  desk.fillStyle(0x9c6b34, 1).fillRoundedRect(dx - dw / 2, dtop, dw, 14, 4);
  desk.fillStyle(0x8a5a2b, 1).fillRect(dx - dw / 2 + 12, dtop + 14, 12, dh - 14);
  desk.fillStyle(0x8a5a2b, 1).fillRect(dx + dw / 2 - 24, dtop + 14, 12, dh - 14);
  scene.add.text(dx - dw * 0.28, dtop + 2, "📚", { fontSize: "34px" }).setOrigin(0.5, 1).setDepth(-23);
  scene.add.text(dx + dw * 0.26, dtop + 2, "💡", { fontSize: "40px" }).setOrigin(0.5, 1).setDepth(-23);

  // —— bookshelf on the floor (left), books as colourful spines ——
  const bx = v.w * 0.14, bw = Math.min(120, v.w * 0.13), bh = 150, btop = fy - bh;
  const sh = scene.add.graphics().setDepth(-24);
  sh.fillStyle(0x000000, 0.1).fillEllipse(bx, fy + 4, bw * 1.1, 16);
  sh.fillStyle(0x7a4e25, 1).fillRoundedRect(bx - bw / 2, btop, bw, bh, 6);
  sh.fillStyle(0x5a3a1c, 1).fillRect(bx - bw / 2 + 6, btop + 6, bw - 12, bh - 12);
  const spines = [0xe06b5a, 0x5aa9e0, 0xf4b223, 0x7bc86c, 0xb07be0];
  for (let row = 0; row < 3; row++) {
    const ry = btop + 10 + row * ((bh - 20) / 3);
    let sx = bx - bw / 2 + 10;
    for (let i = 0; sx < bx + bw / 2 - 14; i++) {
      const bwid = 8 + (i % 3) * 4;
      sh.fillStyle(spines[(row * 2 + i) % spines.length], 1).fillRect(sx, ry, bwid, (bh - 20) / 3 - 8);
      sx += bwid + 3;
    }
  }
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

/** centred grid positions for n cards; `maxCols` caps columns for a balanced grid */
export function grid(v: { w: number }, n: number, cw: number, ch: number, gap: number, top: number, maxCols = Infinity) {
  const cols = Math.max(1, Math.min(n, maxCols, Math.floor((v.w - 36) / (cw + gap))));
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
  const m = scene.make.graphics();
  m.fillStyle(0xffffff, 1).fillRect(x, y, w, h);
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
