import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

// A proper little town in a 3200x2400 world: a road grid, five buildings,
// reserved empty plots for future buildings, a pond, farm animals, and a
// scenery frame on every edge. The camera fits the whole town on screen.
const W = 3200;
const H = 2400;
const GRASS = 0x6ea843;
const PATH_EDGE = 0xc79a55;
const PATH_FILL = 0xe8b973;
const PATH_MID = 0xf3d49a;
const WALK_SPEED = 520;

interface Place { key: string; label: string; tex: string; bw: number; x: number; y: number; enter: () => void }
interface Decor { tex: string; x: number; y: number; w: number }

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private moveTween?: Phaser.Tweens.Tween;
  private pendingArrival?: () => void;
  private held = { up: false, down: false, left: false, right: false };
  private dpadMoving = false;
  private nodes: { x: number; y: number; enter: () => void }[] = [];
  private nearGuard = false;

  private roads: [number, number][][] = [
    [[1600, 420], [1600, 1980]],   // main avenue (vertical)
    [[420, 1200], [2780, 1200]],   // main street (horizontal)
    [[980, 820], [2220, 820]],     // upper cross street
    [[980, 1580], [2220, 1580]],   // lower cross street
    [[1120, 820], [1120, 1580]],   // left street
    [[2080, 820], [2080, 1580]],   // right street
  ];
  private buildingSpots: [number, number][] = [
    [1600, 760], [1360, 1010], [1840, 1010], [1360, 1390], [1600, 1740],
  ];
  private plots: [number, number][] = [
    [1840, 1390], [820, 1010], [2380, 1010], [820, 1390], [2380, 1390],
  ];
  private pond = { x: 760, y: 1820, rx: 300, ry: 190 };

  constructor() {
    super("World");
  }

  create() {
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kidId = data?.kid?.id ?? "";
    const go = (scene: string, path: string) => {
      window.history.pushState({}, "", path);
      this.scene.start(scene);
    };

    this.add.rectangle(0, 0, W, H, GRASS).setOrigin(0, 0);

    this.drawPond();
    for (const s of this.roads) this.roadLayer(s, 118, PATH_EDGE);
    for (const s of this.roads) this.roadLayer(s, 90, PATH_FILL);
    for (const s of this.roads) this.roadLayer(s, 28, PATH_MID);
    this.drawPlots();

    const ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    this.buildScenery();
    this.addAnimals();

    const defs: Place[] = [
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 300, x: 1600, y: 760,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", tex: "sum-magic", bw: 240, x: 1360, y: 1010,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 270, x: 1840, y: 1010,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 230, x: 1360, y: 1390,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 280, x: 1600, y: 1740,
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];
    for (const cfg of defs) {
      const b = this.add.image(cfg.x, cfg.y, cfg.tex).setOrigin(0.5, 1);
      b.setDisplaySize(cfg.bw, cfg.bw * (b.height / b.width)).setDepth(cfg.y).setInteractive({ useHandCursor: true });
      this.add
        .text(cfg.x, cfg.y - b.displayHeight - 8, cfg.label, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: "34px",
          color: "#3a6b1e", backgroundColor: "#ffffff", padding: { x: 18, y: 8 },
        })
        .setOrigin(0.5, 1).setDepth(1e6);
      b.on("pointerover", () => b.setTint(0xfff2c4));
      b.on("pointerout", () => b.clearTint());
      b.on("pointerdown", () => this.walkTo(cfg.x, cfg.y + 28, () => cfg.enter()));
      this.nodes.push({ x: cfg.x, y: cfg.y, enter: cfg.enter });
    }

    this.player = this.add.sprite(1600, 1900, "cat-idle").play("cat-idle").setScale(0.9).setDepth(1900);

    this.cameras.main.setBackgroundColor(GRASS);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    const onMove = (e: { dir: "up" | "down" | "left" | "right"; down: boolean }) => { this.held[e.dir] = e.down; };
    this.game.events.emit("dpad", true);
    this.game.events.on("move", onMove);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.emit("dpad", false);
      this.game.events.off("move", onMove);
    });

    this.layout();
    onResize(this, () => this.layout());
  }

  update(_t: number, dms: number) {
    const dx = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    const dy = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    if (dx === 0 && dy === 0) {
      if (this.dpadMoving) { this.player.play("cat-idle", true); this.dpadMoving = false; }
      return;
    }
    this.moveTween?.stop();
    this.moveTween = undefined;
    this.pendingArrival = undefined;

    const len = Math.hypot(dx, dy) || 1;
    const step = (WALK_SPEED * dms) / 1000;
    const nx = Phaser.Math.Clamp(this.player.x + (dx / len) * step, 40, W - 40);
    const ny = Phaser.Math.Clamp(this.player.y + (dy / len) * step, 40, H - 30);
    this.player.setPosition(nx, ny).setDepth(ny);
    if (dx !== 0) this.player.setFlipX(dx < 0);
    if (this.player.anims.currentAnim?.key !== "cat-walk") this.player.play("cat-walk", true);
    this.dpadMoving = true;

    let near = false;
    for (const n of this.nodes) {
      if (Phaser.Math.Distance.Between(nx, ny, n.x, n.y + 24) < 90) {
        near = true;
        if (!this.nearGuard) {
          this.nearGuard = true;
          this.held = { up: false, down: false, left: false, right: false };
          n.enter();
        }
        break;
      }
    }
    if (!near) this.nearGuard = false;
  }

  private roadLayer(points: [number, number][], width: number, color: number) {
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(width, color, 1);
    const spline = new Phaser.Curves.Spline(points.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
    spline.draw(g, Math.max(48, points.length * 24));
    g.fillStyle(color, 1);
    for (const [x, y] of points) g.fillCircle(x, y, width / 2);
  }

  private drawPond() {
    const { x, y, rx, ry } = this.pond;
    const g = this.add.graphics().setDepth(y);
    g.fillStyle(0xd9c089, 1).fillEllipse(x, y, rx * 2 + 40, ry * 2 + 30);       // sandy shore
    g.fillStyle(0x4fa9e0, 1).fillEllipse(x, y, rx * 2, ry * 2);                  // water
    g.fillStyle(0x86cdf0, 1).fillEllipse(x - rx * 0.25, y - ry * 0.3, rx, ry * 0.7); // highlight
  }

  private drawPlots() {
    for (const [x, y] of this.plots) {
      const g = this.add.graphics().setDepth(y);
      g.fillStyle(0xc9a877, 0.55).fillRoundedRect(x - 120, y - 95, 240, 175, 18);
      g.lineStyle(5, 0x9a7a45, 0.8).strokeRoundedRect(x - 120, y - 95, 240, 175, 18);
      this.add.text(x, y - 6, "🏗️", { fontSize: "52px" }).setOrigin(0.5).setDepth(y);
      this.add.text(x, y + 54, "Coming soon", {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: "22px",
        color: "#7a5a25", backgroundColor: "#ffffffcc", padding: { x: 8, y: 3 },
      }).setOrigin(0.5).setDepth(y);
    }
  }

  private addAnimals() {
    const list: { a: string; x: number; y: number; s: number; flip?: boolean }[] = [
      { a: "an-duck", x: 700, y: 1700, s: 0.42 }, { a: "an-duck", x: 880, y: 1760, s: 0.42, flip: true },
      { a: "an-duck", x: 640, y: 1880, s: 0.4 },
      { a: "an-chick", x: 1500, y: 1180, s: 0.34 }, { a: "an-chick", x: 1720, y: 1240, s: 0.34, flip: true },
      { a: "an-chick", x: 2360, y: 1640, s: 0.34 },
      { a: "an-pig", x: 1980, y: 1700, s: 0.5 }, { a: "an-pig", x: 980, y: 1080, s: 0.5, flip: true },
    ];
    for (const o of list) {
      this.add.sprite(o.x, o.y, o.a).play(o.a).setScale(o.s).setFlipX(!!o.flip).setDepth(o.y);
    }
  }

  private buildScenery() {
    const items: Decor[] = [];
    const push = (tex: string, x: number, y: number, w: number) => items.push({ tex, x, y, w });
    const spineExit = (x: number) => x > 1520 && x < 1680;

    for (let x = 60, i = 0; x <= W - 60; x += 132, i++) {
      push(i % 2 ? "sum-tree-l" : "sum-tree-m", x, 80 + (i % 2 ? 28 : 0), i % 2 ? 190 : 150);
      push(i % 3 === 0 ? "sum-bush-m" : "sum-tree-s", x + 64, 168, 100);
      if (!spineExit(x)) push(i % 2 ? "sum-tree-m" : "sum-tree-l", x, H - 64 - (i % 2 ? 18 : 0), i % 2 ? 150 : 190);
      if (!spineExit(x + 64)) push(i % 3 === 1 ? "sum-bush-l" : "sum-tree-s", x + 64, H - 168, 110);
    }
    for (let y = 220, i = 0; y <= H - 220; y += 134, i++) {
      push(i % 2 ? "sum-tree-l" : "sum-tree-m", 76, y, i % 2 ? 190 : 150);
      push(i % 2 ? "sum-tree-m" : "sum-tree-l", W - 76, y, i % 2 ? 150 : 190);
      if (i % 2) { push("sum-bush-m", 172, y + 64, 95); push("sum-bush-m", W - 172, y + 64, 95); }
    }
    push("sum-rock1", 150, 190, 95); push("sum-rock3", W - 160, 200, 85);
    push("sum-stump", 170, H - 170, 95); push("sum-rock4", W - 180, H - 170, 100);

    const fills = ["sum-tree-l", "sum-tree-m", "sum-tree-s", "sum-bush-l", "sum-bush-m", "sum-bush-s", "sum-rock1", "sum-stump2"];
    for (let gx = 360; gx <= W - 360; gx += 190) {
      for (let gy = 320; gy <= H - 320; gy += 190) {
        const k = (gx * 13 + gy * 29) % 100;
        if (k < 44) continue;
        if (this.nearAny(gx, gy, this.buildingSpots, 300)) continue;
        if (this.nearAny(gx, gy, this.plots, 200)) continue;
        if (Phaser.Math.Distance.Between(gx, gy, this.pond.x, this.pond.y) < 420) continue;
        if (this.nearRoad(gx, gy, 130)) continue;
        const tex = fills[k % fills.length];
        const w = tex.includes("tree-l") ? 180 : tex.includes("bush") ? 95 : tex.includes("rock") || tex.includes("stump") ? 80 : 140;
        push(tex, gx + (k % 40) - 20, gy + ((k * 7) % 30) - 15, w);
      }
    }

    push("sum-campfire", 2010, 1010, 95);
    push("sum-chest", 1200, 1010, 90);
    push("sum-flag", 1470, 790, 90); push("sum-flag", 1730, 790, 90);

    for (const d of items) {
      const img = this.add.image(d.x, d.y, d.tex).setOrigin(0.5, 1);
      img.setDisplaySize(d.w, d.w * (img.height / img.width)).setDepth(d.y);
    }
  }

  private nearAny(x: number, y: number, spots: [number, number][], r: number) {
    return spots.some(([sx, sy]) => Phaser.Math.Distance.Between(x, y, sx, sy) < r);
  }

  private nearRoad(x: number, y: number, r: number) {
    for (const seg of this.roads) {
      for (let i = 1; i < seg.length; i++) {
        if (this.distToSeg(x, y, seg[i - 1][0], seg[i - 1][1], seg[i][0], seg[i][1]) < r) return true;
      }
    }
    return false;
  }

  private distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  private walkTo(x: number, y: number, onArrive?: () => void) {
    const tx = Phaser.Math.Clamp(x, 40, W - 40);
    const ty = Phaser.Math.Clamp(y, 40, H - 30);
    this.moveTween?.stop();
    this.pendingArrival = onArrive;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
    if (dist < 4) { this.player.play("cat-idle", true); onArrive?.(); return; }
    this.player.setFlipX(tx < this.player.x);
    this.player.play("cat-walk", true);
    this.moveTween = this.tweens.add({
      targets: this.player,
      x: tx, y: ty,
      duration: Math.max(200, (dist / WALK_SPEED) * 1000),
      ease: "sine.inout",
      onUpdate: () => this.player.setDepth(this.player.y),
      onComplete: () => {
        this.player.play("cat-idle", true);
        const cb = this.pendingArrival;
        this.pendingArrival = undefined;
        cb?.();
      },
    });
  }

  private enterFlash(then: () => void) {
    this.cameras.main.flash(220, 255, 255, 255);
    this.time.delayedCall(150, then);
  }

  private layout() {
    const v = viewport(this);
    this.cameras.main.setZoom((v.h / H) * 0.96);
  }
}
