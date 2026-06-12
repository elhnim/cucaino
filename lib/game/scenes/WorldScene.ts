import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

// Road network traced from the user's hand-drawn layout: a central village area
// with lanes winding out to every edge. Buildings line the lanes, a pond/square
// sits in the middle. (European building art swaps in once the tileset lands.)
const W = 3200;
const H = 2400;
const GRASS = 0x6ea843;
const PATH_EDGE = 0x8a8275;
const PATH_FILL = 0xbdb4a2;
const PATH_MID = 0xd7cebb;
const FLOWER_COLORS = [0xe85b5b, 0xf2c14e, 0xef8fc0, 0xffffff, 0xb07be0];
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

  // traced from Layout.png (scaled into the world)
  private roads: [number, number][][] = [
    [[848, 476], [941, 717], [922, 995], [922, 1152]],                                   // top-left lane → J1
    [[922, 1152], [700, 1235], [728, 1550], [728, 1782]],                                // left side → J3
    [[728, 1782], [533, 1856], [311, 1939]],                                             // bottom-left out
    [[728, 1782], [1033, 1902], [1283, 1911], [1469, 1911]],                             // bottom lane
    [[922, 1152], [1367, 1180], [2071, 1226], [2552, 1245]],                             // main street → J6
    [[1404, 513], [1608, 772], [1385, 995], [1367, 1180], [1422, 1550], [1469, 1911]],   // centre S-lane
    [[2422, 476], [2256, 809], [2228, 1217], [2163, 1643], [2126, 1949]],                // right vertical lane
    [[2941, 735], [2756, 995], [2552, 1245]],                                            // top-right curve → J6
    [[2552, 1245], [2960, 1235]],                                                        // right out
    [[2552, 1245], [2700, 1476], [2848, 1735]],                                          // down-right
  ];
  private buildingSpots: [number, number][] = [
    [1404, 480], [1820, 1180], [640, 1480], [2760, 1200], [1469, 2030],
  ];
  private plots: [number, number][] = [
    [1180, 820], [2180, 1480], [900, 1850], [2470, 1660], [560, 900],
  ];
  private fields: [number, number, number, number][] = [
    [2350, 1900, 340, 220], [1900, 1850, 300, 200],
  ];
  private pond = { x: 1060, y: 1520, rx: 280, ry: 180 };

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
    for (const s of this.roads) this.roadLayer(s, 112, PATH_EDGE);
    for (const s of this.roads) this.roadLayer(s, 84, PATH_FILL);
    for (const s of this.roads) this.roadLayer(s, 24, PATH_MID);
    this.drawFields();
    this.drawPlots();

    const ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    this.buildScenery();
    this.drawFlowers();
    this.addAnimals();

    const defs: Place[] = [
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 300, x: 1404, y: 480,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", tex: "sum-magic", bw: 240, x: 1820, y: 1180,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 230, x: 640, y: 1480,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 270, x: 2760, y: 1200,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 280, x: 1469, y: 2030,
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

    this.player = this.add.sprite(1469, 2120, "cat-idle").play("cat-idle").setScale(0.9).setDepth(2120);

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
    spline.draw(g, Math.max(64, points.length * 24));
    g.fillStyle(color, 1);
    for (const [x, y] of points) g.fillCircle(x, y, width / 2);
  }

  private drawPond() {
    const { x, y, rx, ry } = this.pond;
    const g = this.add.graphics().setDepth(y);
    g.fillStyle(0xd9c089, 1).fillEllipse(x, y, rx * 2 + 44, ry * 2 + 32);
    g.fillStyle(0x4fa9e0, 1).fillEllipse(x, y, rx * 2, ry * 2);
    g.fillStyle(0x86cdf0, 1).fillEllipse(x - rx * 0.25, y - ry * 0.3, rx, ry * 0.7);
  }

  private drawFields() {
    for (const [x, y, w, h] of this.fields) {
      const g = this.add.graphics().setDepth(y - h / 2);
      g.fillStyle(0x8caf57, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 22);
      g.lineStyle(10, 0x4f7a35, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);
      let i = 0;
      for (let fy = -h / 2 + 36; fy < h / 2 - 16; fy += 40)
        for (let fx = -w / 2 + 42; fx < w / 2 - 26; fx += 44) {
          g.fillStyle(0x3f6b2a, 1).fillCircle(x + fx, y + fy + 5, 4);
          g.fillStyle(FLOWER_COLORS[i++ % FLOWER_COLORS.length], 1).fillCircle(x + fx, y + fy, 9);
        }
    }
  }

  private drawFlowers() {
    const spots: [number, number][] = [
      [1180, 1300], [1500, 1700], [820, 1700], [2050, 1000], [2250, 1550],
      [600, 1150], [1700, 700], [2500, 900], [1000, 1100], [1300, 2050],
    ];
    for (const [x, y] of spots) {
      if (this.nearRoad(x, y, 90)) continue;
      const g = this.add.graphics().setDepth(y);
      for (let i = 0; i < 6; i++) {
        const ax = x + (((i * 53) % 70) - 35);
        const ay = y + (((i * 37) % 44) - 22);
        g.fillStyle(0x3f6b2a, 1).fillCircle(ax, ay + 4, 3);
        g.fillStyle(FLOWER_COLORS[(i + x) % FLOWER_COLORS.length], 1).fillCircle(ax, ay, 8);
      }
    }
  }

  private drawPlots() {
    for (const [x, y] of this.plots) {
      const g = this.add.graphics().setDepth(y);
      g.fillStyle(0xc9a877, 0.5).fillRoundedRect(x - 120, y - 95, 240, 175, 18);
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
      { a: "an-duck", x: 940, y: 1600, s: 0.85 }, { a: "an-duck", x: 1200, y: 1650, s: 0.85, flip: true },
      { a: "an-duck", x: 1060, y: 1740, s: 0.8 },
      { a: "an-chick", x: 2280, y: 1880, s: 0.7 }, { a: "an-chick", x: 2430, y: 1930, s: 0.7, flip: true },
      { a: "an-pig", x: 1880, y: 1990, s: 1.0 }, { a: "an-chick", x: 1360, y: 2100, s: 0.7 },
    ];
    for (const o of list) {
      this.add.sprite(o.x, o.y, o.a).play(o.a).setScale(o.s).setFlipX(!!o.flip).setDepth(o.y);
    }
  }

  private buildScenery() {
    const items: Decor[] = [];
    const pushSafe = (tex: string, x: number, y: number, w: number) => {
      if (!this.nearRoad(x, y, 86)) items.push({ tex, x, y, w });
    };

    for (let x = 60, i = 0; x <= W - 60; x += 132, i++) {
      pushSafe(i % 2 ? "sum-tree-l" : "sum-tree-m", x, 80 + (i % 2 ? 28 : 0), i % 2 ? 190 : 150);
      pushSafe(i % 3 === 0 ? "sum-bush-m" : "sum-tree-s", x + 64, 168, 100);
      pushSafe(i % 2 ? "sum-tree-m" : "sum-tree-l", x, H - 64 - (i % 2 ? 18 : 0), i % 2 ? 150 : 190);
      pushSafe(i % 3 === 1 ? "sum-bush-l" : "sum-tree-s", x + 64, H - 168, 110);
    }
    for (let y = 220, i = 0; y <= H - 220; y += 134, i++) {
      pushSafe(i % 2 ? "sum-tree-l" : "sum-tree-m", 76, y, i % 2 ? 190 : 150);
      pushSafe(i % 2 ? "sum-tree-m" : "sum-tree-l", W - 76, y, i % 2 ? 150 : 190);
      if (i % 2) { pushSafe("sum-bush-m", 172, y + 64, 95); pushSafe("sum-bush-m", W - 172, y + 64, 95); }
    }
    pushSafe("sum-rock1", 150, 190, 95); pushSafe("sum-rock3", W - 160, 200, 85);
    pushSafe("sum-stump", 170, H - 170, 95); pushSafe("sum-rock4", W - 180, H - 170, 100);

    const fills = ["sum-tree-l", "sum-tree-m", "sum-tree-s", "sum-bush-l", "sum-bush-m", "sum-bush-s", "sum-rock1", "sum-stump2"];
    for (let gx = 360; gx <= W - 360; gx += 184) {
      for (let gy = 320; gy <= H - 320; gy += 184) {
        const k = (gx * 13 + gy * 29) % 100;
        if (k < 48) continue;
        if (this.nearAny(gx, gy, this.buildingSpots, 290)) continue;
        if (this.nearAny(gx, gy, this.plots, 200)) continue;
        if (this.fields.some(([fx, fy, fw, fh]) => Math.abs(gx - fx) < fw / 2 + 110 && Math.abs(gy - fy) < fh / 2 + 110)) continue;
        if (Phaser.Math.Distance.Between(gx, gy, this.pond.x, this.pond.y) < 440) continue;
        if (this.nearRoad(gx, gy, 110)) continue;
        const tex = fills[k % fills.length];
        const w = tex.includes("tree-l") ? 180 : tex.includes("bush") ? 95 : tex.includes("rock") || tex.includes("stump") ? 80 : 140;
        items.push({ tex, x: gx + (k % 40) - 20, y: gy + ((k * 7) % 30) - 15, w });
      }
    }

    items.push({ tex: "sum-campfire", x: 2900, y: 1230, w: 95 });
    items.push({ tex: "sum-chest", x: 1660, y: 1180, w: 90 });
    items.push({ tex: "sum-flag", x: 1280, y: 462, w: 90 });
    items.push({ tex: "sum-flag", x: 1530, y: 462, w: 90 });

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
