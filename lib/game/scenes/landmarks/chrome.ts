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
