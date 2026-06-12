import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { OccupancyGrid } from "../systems/OccupancyGrid";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

// A finished, dense ancient-European village: cobblestone lanes (traced from the
// user's sketch) lined with houses, a central fountain square, market stalls,
// lanterns and gardens. Five labelled landmarks are the interactive places; the
// rest of the buildings are decorative so the town looks lived-in.
const W = 3200;
const H = 2400;
const GRASS = 0x6ea843;
const PATH_EDGE = 0x8a8275;
const PATH_FILL = 0xb7ad99;
const PATH_MID = 0xcfc6b2;
const FLOWER_COLORS = [0xe85b5b, 0xf2c14e, 0xef8fc0, 0xffffff, 0xb07be0];
const HOUSE_SET: { tex: string; bw: number }[] = [
  { tex: "sum-house", bw: 180 }, { tex: "sum-house", bw: 168 }, { tex: "sum-tower", bw: 150 },
  { tex: "sum-house", bw: 188 }, { tex: "sum-castle2", bw: 205 }, { tex: "sum-house", bw: 172 },
  { tex: "sum-magic", bw: 158 }, { tex: "sum-house", bw: 178 }, { tex: "sum-tower", bw: 146 },
];
// painted-house washes — varied roof/wall hues for an old-European street
const TINTS = [0xffffff, 0xfff0d0, 0xffc39a, 0xf2cf78, 0xcfe6a8, 0xb6d2ec, 0xf2bccb, 0xdcc8f0, 0xffffff, 0xe8c8a0];
const WALK_SPEED = 520;

interface Place { key: string; label: string; tex: string; bw: number; x: number; y: number; enter: () => void }
interface Decor { tex: string; x: number; y: number; w: number; tint?: number; flip?: boolean }

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private moveTween?: Phaser.Tweens.Tween;
  private pendingArrival?: () => void;
  private held = { up: false, down: false, left: false, right: false };
  private dpadMoving = false;
  private nodes: { x: number; y: number; enter: () => void }[] = [];
  private nearGuard = false;
  private grid!: OccupancyGrid;

  private roads: [number, number][][] = [
    [[848, 476], [941, 717], [922, 995], [922, 1152]],
    [[922, 1152], [700, 1235], [728, 1550], [728, 1782]],
    [[728, 1782], [533, 1856], [311, 1939]],
    [[728, 1782], [1033, 1902], [1283, 1911], [1469, 1911]],
    [[922, 1152], [1367, 1180], [2071, 1226], [2552, 1245]],
    [[1404, 513], [1608, 772], [1385, 995], [1367, 1180], [1422, 1550], [1469, 1911]],
    [[2422, 476], [2256, 809], [2228, 1217], [2163, 1643], [2126, 1949]],
    [[2941, 735], [2756, 995], [2552, 1245]],
    [[2552, 1245], [2960, 1235]],
    [[2552, 1245], [2700, 1476], [2848, 1735]],
  ];
  private buildingSpots: [number, number][] = [
    [1404, 480], [1900, 1140], [560, 1470], [2780, 1180], [1469, 2050],
  ];
  private plots: [number, number][] = [[1180, 760], [2360, 1640]];
  // tucked into an open pocket off the lanes (not on a junction)
  private plaza = { x: 1040, y: 1450 };
  private plazaR = 165;

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

    this.drawPlaza();
    for (const s of this.roads) this.roadLayer(s, 112, PATH_EDGE);
    for (const s of this.roads) this.roadLayer(s, 84, PATH_FILL);
    for (const s of this.roads) this.roadLayer(s, 24, PATH_MID);
    this.drawPlots();

    const ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    this.buildGrid();
    this.lineStreetsWithHouses();
    this.dressStreets();
    this.dressPlaza();
    this.buildScenery();
    this.drawFlowers();
    this.addAnimals();

    // one-time "Let's Go!" flourish when the village first opens this session
    if (!this.registry.get("intro-shown")) {
      this.registry.set("intro-shown", true);
      this.time.delayedCall(250, () => this.game.events.emit("banner", "txt-letsgo"));
    }

    const defs: Place[] = [
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 310, x: 1404, y: 480,
        enter: () => this.enterFlash(() => go("Work", `/kid/${kidId}/world?scene=work`)) },
      { key: "shop", label: "🏪 Shop", tex: "sum-magic", bw: 250, x: 1900, y: 1140,
        enter: () => this.enterFlash(() => go("Shop", `/kid/${kidId}/world?scene=shop`)) },
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 240, x: 560, y: 1470,
        enter: () => this.enterFlash(() => go("Friends", `/kid/${kidId}/world?scene=friends`)) },
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 280, x: 2780, y: 1180,
        enter: () => this.enterFlash(() => go("Play", `/kid/${kidId}/world?scene=play`)) },
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 300, x: 1469, y: 2050,
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];
    for (const cfg of defs) {
      const b = this.add.image(cfg.x, cfg.y, cfg.tex).setOrigin(0.5, 1);
      b.setDisplaySize(cfg.bw, cfg.bw * (b.height / b.width)).setDepth(cfg.y).setInteractive({ useHandCursor: true });
      this.makeSign(cfg.x, cfg.y - b.displayHeight - 28, cfg.label);
      b.on("pointerover", () => b.setTint(0xfff2c4));
      b.on("pointerout", () => b.clearTint());
      b.on("pointerdown", () => this.walkTo(cfg.x, cfg.y + 28, () => cfg.enter()));
      this.nodes.push({ x: cfg.x, y: cfg.y, enter: cfg.enter });
    }

    this.player = this.add.sprite(1469, 2140, "cat-idle").play("cat-idle").setScale(1.35).setDepth(2140);

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

  /** build the collision grid from roads + plaza + plots + landmarks + map edge */
  private buildGrid() {
    this.grid = new OccupancyGrid(W, H, 64);
    for (const seg of this.roads) {
      const spline = new Phaser.Curves.Spline(seg.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
      const pts = spline.getPoints(Math.max(8, Math.floor(spline.getLength() / 44)))
        .map((p) => [p.x, p.y] as [number, number]);
      this.grid.markPath(pts, 72);
    }
    this.grid.markCircle(this.plaza.x, this.plaza.y, this.plazaR + 70);
    for (const [x, y] of this.plots) this.grid.markRect(x, y, 430, 320);
    for (const [x, y] of this.buildingSpots) this.grid.markRect(x, y - 80, 330, 250);
    // forest-frame border kept clear of buildings/props
    this.grid.markRect(W / 2, 110, W, 230);
    this.grid.markRect(W / 2, H - 110, W, 230);
    this.grid.markRect(110, H / 2, 230, H);
    this.grid.markRect(W - 110, H / 2, 230, H);
  }

  /** line every lane with decorative houses on whichever side has free ground */
  private lineStreetsWithHouses() {
    let idx = 7;
    for (const seg of this.roads) {
      const spline = new Phaser.Curves.Spline(seg.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
      const n = Math.max(2, Math.floor(spline.getLength() / 215));
      const pts = spline.getSpacedPoints(n);
      for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1], next = pts[i + 1];
        const dlx = next.x - prev.x, dly = next.y - prev.y;
        const dl = Math.hypot(dlx, dly) || 1;
        const perpx = -dly / dl, perpy = dlx / dl;
        const h = HOUSE_SET[idx % HOUSE_SET.length];
        const fw = h.bw * 0.82, fh = h.bw * 0.46;
        const off = 128;
        for (const side of i % 2 === 0 ? [1, -1] : [-1, 1]) {
          const bx = pts[i].x + perpx * side * off;
          const by = pts[i].y + perpy * side * off;
          const fy = by - fh * 0.15;
          if (!this.grid.isFree(bx, fy, fw, fh)) continue;
          const b = this.add.image(bx, by, h.tex).setOrigin(0.5, 1);
          b.setDisplaySize(h.bw, h.bw * (b.height / b.width)).setDepth(by)
            .setTint(TINTS[(idx * 3) % TINTS.length]).setFlipX(side < 0);
          this.grid.markRect(bx, fy, fw, fh);
          idx++;
          break;
        }
      }
    }
  }

  /** a carved old-world wooden signboard for a landmark name */
  private makeSign(x: number, y: number, label: string) {
    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: "bold",
      fontSize: "40px", color: "#5a3a18",
    }).setOrigin(0.5);
    const w = txt.width + 64, h = txt.height + 34;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 7, -h / 2 + 9, w, h, 18);   // drop shadow
    g.fillStyle(0x9c6b34, 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 18);           // 3D under-edge
    g.fillStyle(0xf6e7c6, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);               // parchment face
    g.lineStyle(6, 0x8a5a2b, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);          // carved border
    g.lineStyle(3, 0xfff6e2, 0.7).strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h * 0.42, 12); // highlight
    g.fillStyle(0x6b4a24, 1);                                                          // corner nails
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.fillCircle((sx * (w / 2 - 14)), (sy * (h / 2 - 12)), 4);
    this.add.container(x, y, [g, txt]).setDepth(1e6);
  }

  private drawPlaza() {
    const { x, y } = this.plaza;
    const r = this.plazaR;
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(PATH_FILL, 1).fillCircle(x, y, r);
    g.lineStyle(9, PATH_EDGE, 1).strokeCircle(x, y, r);
    g.lineStyle(4, PATH_MID, 0.6).strokeCircle(x, y, r * 0.62);
  }

  private dressPlaza() {
    const { x, y } = this.plaza;
    const r = this.plazaR;
    const items: Decor[] = [
      { tex: "md-fountain", x, y: y + 26, w: 190 },
      { tex: "md-lantern", x: x - r - 8, y: y - 6, w: 64 },
      { tex: "md-lantern", x: x + r + 8, y: y + 6, w: 64 },
      { tex: "md-bench", x: x - 30, y: y + r + 50, w: 110 },
      { tex: "md-barrel", x: x + r - 6, y: y + 70, w: 64 },
    ];
    // a small market just outside the plaza
    const market: Decor[] = [
      { tex: "md-stall", x: x - 250, y: y - 70, w: 130 },
      { tex: "md-cart", x: x - 270, y: y + 70, w: 135 },
      { tex: "md-well", x: x + 250, y: y + 40, w: 105 },
    ];
    for (const d of [...items, ...market]) {
      const img = this.add.image(d.x, d.y, d.tex).setOrigin(0.5, 1);
      img.setDisplaySize(d.w, d.w * (img.height / img.width)).setDepth(d.y);
    }
  }

  /** scatter charming street furniture (lanterns, benches, barrels, beds) along the lanes */
  private dressStreets() {
    const props = [
      { tex: "md-lantern", w: 82 }, { tex: "md-bench", w: 118 }, { tex: "md-barrel", w: 74 },
      { tex: "md-gardenbed", w: 145 }, { tex: "md-sign", w: 92 }, { tex: "sum-bush-s", w: 96 },
    ];
    let idx = 1;
    for (const seg of this.roads) {
      const spline = new Phaser.Curves.Spline(seg.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
      const n = Math.max(2, Math.floor(spline.getLength() / 230));
      const pts = spline.getSpacedPoints(n);
      for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1], next = pts[i + 1];
        const dlx = next.x - prev.x, dly = next.y - prev.y;
        const dl = Math.hypot(dlx, dly) || 1;
        const perpx = -dly / dl, perpy = dlx / dl;
        const p = props[idx % props.length];
        const fw = p.w * 0.8, fh = p.w * 0.5;
        for (const side of [1, -1]) {
          const px = pts[i].x + perpx * side * 96, py = pts[i].y + perpy * side * 96;
          if (!this.grid.isFree(px, py - fh * 0.15, fw, fh)) continue;
          const img = this.add.image(px, py, p.tex).setOrigin(0.5, 1);
          img.setDisplaySize(p.w, p.w * (img.height / img.width)).setDepth(py);
          this.grid.markRect(px, py - fh * 0.15, fw, fh);
          idx++;
          break;
        }
      }
    }
  }

  private roadLayer(points: [number, number][], width: number, color: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(width, color, 1);
    const spline = new Phaser.Curves.Spline(points.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
    spline.draw(g, Math.max(64, points.length * 24));
    g.fillStyle(color, 1);
    for (const [px, py] of points) g.fillCircle(px, py, width / 2);
  }

  private drawFlowers() {
    const spots: [number, number][] = [
      [1500, 1700], [2050, 1000], [600, 1150], [1700, 700], [1000, 1100],
      [1300, 2050], [2250, 1550], [820, 1700],
    ];
    for (const [x, y] of spots) {
      if (!this.grid.isFree(x, y, 150, 100)) continue;
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
      const w = 360, h = 250, left = x - w / 2, top = y - h / 2;
      const g = this.add.graphics().setDepth(y - h / 2);
      g.fillStyle(0xc7a86f, 1).fillRoundedRect(left, top, w, h, 16);                 // dirt pad
      g.fillStyle(0xb6924f, 1);
      for (let fx = left + 24; fx < left + w; fx += 60) g.fillRect(fx, top + 16, 26, h - 32); // tilled rows
      // wooden fence: corner/edge posts + top rail
      g.fillStyle(0x9c6b34, 1);
      const post = (px: number, py: number) => g.fillRoundedRect(px - 9, py - 30, 18, 62, 5);
      for (let px = left; px <= left + w; px += 72) { post(px, top); post(px, top + h); }
      for (let py = top; py <= top + h; py += 78) { post(left, py); post(left + w, py); }
      g.lineStyle(9, 0x8a5a2b, 1).strokeRoundedRect(left, top, w, h, 16);
      const bar = this.add.image(x - 95, y + 50, "md-barrel").setOrigin(0.5, 1);
      bar.setDisplaySize(72, 72 * (bar.height / bar.width)).setDepth(y + 50);
      this.add.text(x + 30, y + 14, "🏗️", { fontSize: "92px" }).setOrigin(0.5).setDepth(y);
      this.makeSign(x, top - 26, "Coming Soon");
    }
  }

  private addAnimals() {
    const list: { a: string; x: number; y: number; s: number; flip?: boolean }[] = [
      { a: "an-chick", x: 1000, y: 1500, s: 1.2 }, { a: "an-chick", x: 1280, y: 1540, s: 1.2, flip: true },
      { a: "an-chick", x: 1380, y: 2120, s: 1.2 }, { a: "an-pig", x: 1030, y: 1720, s: 1.7 },
      { a: "an-duck", x: 1140, y: 1640, s: 1.4 }, { a: "an-chick", x: 2300, y: 1880, s: 1.2, flip: true },
    ];
    for (const o of list) {
      this.add.sprite(o.x, o.y, o.a).play(o.a).setScale(o.s).setFlipX(!!o.flip).setDepth(o.y);
    }
  }

  private buildScenery() {
    // forest frame sits in the reserved border band (drawn directly, not grid-gated)
    for (let x = 60, i = 0; x <= W - 60; x += 150, i++) {
      this.placeDecor(i % 2 ? "sum-tree-l" : "sum-tree-m", x, 92 + (i % 2 ? 24 : 0), i % 2 ? 185 : 150);
      this.placeDecor(i % 2 ? "sum-tree-m" : "sum-tree-l", x + 70, H - 70 - (i % 2 ? 16 : 0), i % 2 ? 150 : 185);
    }
    for (let y = 240, i = 0; y <= H - 240; y += 156, i++) {
      this.placeDecor(i % 2 ? "sum-tree-l" : "sum-tree-m", 84, y, i % 2 ? 185 : 150);
      this.placeDecor(i % 2 ? "sum-tree-m" : "sum-tree-l", W - 84, y, i % 2 ? 150 : 185);
    }

    // scatter remaining greenery only on free grass
    const fills = ["sum-tree-l", "sum-tree-m", "sum-bush-l", "sum-bush-m", "sum-rock1"];
    for (let gx = 360; gx <= W - 360; gx += 188) {
      for (let gy = 320; gy <= H - 320; gy += 188) {
        const k = (gx * 13 + gy * 29) % 100;
        if (k < 55) continue;
        const tex = fills[k % fills.length];
        const w = tex.includes("tree-l") ? 175 : tex.includes("bush") ? 95 : 80;
        const x = gx + (k % 36) - 18, y = gy + ((k * 7) % 28) - 14;
        if (!this.grid.isFree(x, y - w * 0.18, w * 0.7, w * 0.5)) continue;
        const img = this.add.image(x, y, tex).setOrigin(0.5, 1);
        img.setDisplaySize(w, w * (img.height / img.width)).setDepth(y);
        this.grid.markRect(x, y - w * 0.18, w * 0.7, w * 0.5);
      }
    }
    // flags flanking the castle landmark
    this.placeDecor("sum-flag", 1280, 462, 90);
    this.placeDecor("sum-flag", 1530, 462, 90);
  }

  private placeDecor(tex: string, x: number, y: number, w: number) {
    const img = this.add.image(x, y, tex).setOrigin(0.5, 1);
    img.setDisplaySize(w, w * (img.height / img.width)).setDepth(y);
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
