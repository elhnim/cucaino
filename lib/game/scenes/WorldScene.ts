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
  { tex: "sum-house", bw: 182 }, { tex: "sum-house", bw: 164 }, { tex: "sum-tower", bw: 150 },
  { tex: "sum-house", bw: 196 }, { tex: "sum-castle2", bw: 208 }, { tex: "sum-house", bw: 172 },
  { tex: "sum-magic", bw: 158 }, { tex: "sum-house", bw: 188 }, { tex: "sum-tower", bw: 144 },
  { tex: "sum-castle", bw: 220 }, { tex: "sum-house", bw: 176 }, { tex: "sum-tent", bw: 168 },
];
// painted-house washes — distinct roof/wall hues for a varied old-European street
const TINTS = [
  0xffffff, 0xffe0b0, 0xe9a880, 0xf2cf78, 0xb9d690, 0x9fc4e8, 0xeaa9bf, 0xc8b0e6,
  0xffffff, 0xd8b48a, 0xa9d6c4, 0xf0b48a,
];
const WALK_SPEED = 520;

interface Place {
  key: string; label: string; tex: string; bw: number; x: number; y: number;
  tint?: number; props?: { tex: string; dx: number; dy: number; w: number }[];
  enter: () => void;
}
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
  private lamps: [number, number][] = [];
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

    this.bakeGround();
    this.drawPlaza();

    const ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    this.buildGrid();
    this.placePlots();
    this.lineStreetsWithHouses();
    this.dressStreets();
    this.dressPlaza();
    this.buildScenery();
    this.drawFlowers();
    this.addAnimals();
    this.cloudShadows();
    this.pollen();
    this.addLampGlows();
    this.dusk();

    // one-time "Let's Go!" flourish when the village first opens this session
    if (!this.registry.get("intro-shown")) {
      this.registry.set("intro-shown", true);
      this.time.delayedCall(250, () => this.game.events.emit("banner", "txt-letsgo"));
    }

    const defs: Place[] = [
      // Work — the grand civic building
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 320, x: 1404, y: 480,
        props: [{ tex: "sum-flag", dx: -150, dy: -10, w: 90 }, { tex: "sum-flag", dx: 150, dy: -10, w: 90 }],
        enter: () => this.enterFlash(() => go("Work", `/kid/${kidId}/world?scene=work`)) },
      // Shop — a cottage with a real shopfront (market stall + cart)
      { key: "shop", label: "🏪 Shop", tex: "sum-house", bw: 260, x: 1900, y: 1140, tint: 0xffdca6,
        props: [{ tex: "md-stall", dx: -150, dy: 24, w: 150 }, { tex: "md-cart", dx: 156, dy: 30, w: 150 },
                { tex: "md-barrel", dx: -190, dy: 60, w: 66 }],
        enter: () => this.enterFlash(() => go("Shop", `/kid/${kidId}/world?scene=shop`)) },
      // Friends — the lookout tower with a notice board
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 240, x: 560, y: 1470,
        props: [{ tex: "md-sign", dx: 130, dy: 16, w: 100 }, { tex: "md-bench", dx: -120, dy: 20, w: 110 }],
        enter: () => this.enterFlash(() => go("Friends", `/kid/${kidId}/world?scene=friends`)) },
      // Playground — the fun-fair tent
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 290, x: 2780, y: 1180,
        props: [{ tex: "sum-flag", dx: 150, dy: -6, w: 84 }],
        enter: () => this.enterFlash(() => go("Play", `/kid/${kidId}/world?scene=play`)) },
      // Pet Home — a cosy cottage (cool tint to read apart from the shop)
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 300, x: 1469, y: 2050, tint: 0xd6e6ff,
        props: [{ tex: "sum-bush-l", dx: -150, dy: 20, w: 110 }, { tex: "md-gardenbed", dx: 150, dy: 22, w: 130 }],
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];
    for (const cfg of defs) {
      for (const p of cfg.props ?? []) {
        const pi = this.add.image(cfg.x + p.dx, cfg.y + p.dy, p.tex).setOrigin(0.5, 1);
        pi.setDisplaySize(p.w, p.w * (pi.height / pi.width)).setDepth(cfg.y + p.dy);
      }
      const b = this.add.image(cfg.x, cfg.y, cfg.tex).setOrigin(0.5, 1);
      b.setDisplaySize(cfg.bw, cfg.bw * (b.height / b.width)).setDepth(cfg.y).setInteractive({ useHandCursor: true });
      if (cfg.tint) b.setTint(cfg.tint);
      this.makeSign(cfg.x, cfg.y - b.displayHeight - 28, cfg.label);
      b.on("pointerover", () => b.setTint(0xfff2c4));
      b.on("pointerout", () => b.setTint(cfg.tint ?? 0xffffff));
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
      this.grid.markPath(pts, 96);   // keep buildings/props clear of the full cobble width
    }
    this.grid.markCircle(this.plaza.x, this.plaza.y, this.plazaR + 96);
    for (const [x, y] of this.buildingSpots) this.grid.markRect(x, y - 80, 330, 250);
    // forest-frame border kept clear of buildings/props
    this.grid.markRect(W / 2, 110, W, 230);
    this.grid.markRect(W / 2, H - 110, W, 230);
    this.grid.markRect(110, H / 2, 230, H);
    this.grid.markRect(W - 110, H / 2, 230, H);
  }

  /** line every lane with decorative houses on whichever side has free ground */
  private lineStreetsWithHouses() {
    this.ensureGlowTex();
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
        const off = 162;
        for (const side of i % 2 === 0 ? [1, -1] : [-1, 1]) {
          const bx = pts[i].x + perpx * side * off;
          const by = pts[i].y + perpy * side * off;
          const fy = by - fh * 0.15;
          if (!this.grid.isFree(bx, fy, fw, fh)) continue;
          const b = this.add.image(bx, by, h.tex).setOrigin(0.5, 1);
          // face the road: a house to the right of the lane faces left, and vice-versa
          b.setDisplaySize(h.bw, h.bw * (b.height / b.width)).setDepth(by)
            .setTint(TINTS[(idx * 3) % TINTS.length]).setFlipX(perpx * side > 0);
          this.grid.markRect(bx, fy, fw, fh);
          // warm lit window
          if (idx % 2 === 0)
            this.add.image(bx, by - b.displayHeight * 0.42, "glow").setBlendMode(Phaser.BlendModes.ADD)
              .setDepth(3840).setScale(0.42).setAlpha(0.55).setTint(0xffd27a);
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
    const g = this.add.graphics().setDepth(3);   // cobble fill comes from the tiled texture; just a rim
    g.lineStyle(8, 0x5a4a30, 0.9).strokeCircle(x, y, r);
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
      if (d.tex === "md-lantern") this.lamps.push([d.x, d.y - d.w * 0.78]);
    }
  }

  /** soft glow texture used for lamps + lit windows (warm radial) */
  private ensureGlowTex() {
    if (this.textures.exists("glow")) return;
    const g = this.make.graphics({});
    for (let r = 64; r > 0; r--) g.fillStyle(0xffe6a0, 0.025).fillCircle(64, 64, r);
    g.generateTexture("glow", 128, 128);
    g.destroy();
  }

  /** warm pulsing glow at every street lamp (reads as lit at dusk) */
  private addLampGlows() {
    this.ensureGlowTex();
    for (const [x, y] of this.lamps) {
      const glow = this.add.image(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(3850).setScale(1.15).setAlpha(0.75);
      this.tweens.add({ targets: glow, alpha: 0.5, scale: 0.98, duration: 1500 + (x % 600),
        yoyo: true, repeat: -1, ease: "sine.inout" });
    }
  }

  /** gentle evening wash so the lamp glows read */
  private dusk() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x2a2752, 0.16).setDepth(3800);
    this.add.rectangle(W / 2, H / 2, W, H, 0xff9a4a, 0.05).setDepth(3801);
  }

  /** scatter charming street furniture + market stalls along the lanes */
  private dressStreets() {
    const props = [
      { tex: "md-lantern", w: 82 }, { tex: "md-stall", w: 128 }, { tex: "md-bench", w: 118 },
      { tex: "md-barrel", w: 74 }, { tex: "md-cart", w: 132 }, { tex: "md-gardenbed", w: 145 },
      { tex: "md-lantern", w: 82 }, { tex: "md-sign", w: 92 }, { tex: "sum-bush-s", w: 96 },
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
          const px = pts[i].x + perpx * side * 124, py = pts[i].y + perpy * side * 124;
          if (!this.grid.isFree(px, py - fh * 0.15, fw, fh)) continue;
          const img = this.add.image(px, py, p.tex).setOrigin(0.5, 1);
          img.setDisplaySize(p.w, p.w * (img.height / img.width)).setDepth(py);
          this.grid.markRect(px, py - fh * 0.15, fw, fh);
          if (p.tex === "md-lantern") this.lamps.push([px, py - p.w * 0.78]);
          idx++;
          break;
        }
      }
    }
  }

  /** bake the ground once: real grass tiles everywhere + a cobblestone brush
   *  stamped along the roads (no runtime masks — composited into one texture). */
  private bakeGround() {
    this.add.tileSprite(0, 0, W, H, "grass-tex").setOrigin(0, 0).setDepth(-100);

    // road bed: dark edge + warm dirt fill following the lanes + plaza
    const bed = this.add.graphics().setDepth(0);
    bed.fillStyle(0x5a4326, 1);
    this.eachRoadPoint(14, (x, y) => bed.fillCircle(x, y, 62));
    bed.fillCircle(this.plaza.x, this.plaza.y, this.plazaR + 10);
    bed.fillStyle(0x9c7a44, 1);
    this.eachRoadPoint(14, (x, y) => bed.fillCircle(x, y, 52));
    bed.fillCircle(this.plaza.x, this.plaza.y, this.plazaR);

    // cobblestones scattered over the bed (graphics — always renders)
    const stones = this.add.graphics().setDepth(1);
    const pal = [0xc6bca4, 0xb2a888, 0xd2c9b2, 0xa89a7c];
    const hash = (a: number, b: number) => ((a * 73856 + b * 19349) >>> 0);
    const stone = (x: number, y: number) => {
      for (let k = 0; k < 3; k++) {
        const h = hash(Math.round(x) + k * 911, Math.round(y) + k * 277);
        const ox = (h % 76) - 38, oy = ((h >> 8) % 60) - 30;
        stones.fillStyle(0x6b5630, 1).fillEllipse(x + ox, y + oy + 2, 24, 17);
        stones.fillStyle(pal[h % pal.length], 1).fillEllipse(x + ox, y + oy, 22, 15);
      }
    };
    this.eachRoadPoint(20, stone);
    for (let a = 0; a < this.plazaR; a += 26)
      for (let t = 0; t < Math.PI * 2; t += 0.5 + a / this.plazaR)
        stone(this.plaza.x + Math.cos(t) * a, this.plaza.y + Math.sin(t) * a);
  }

  private eachRoadPoint(spacing: number, fn: (x: number, y: number) => void) {
    for (const seg of this.roads) {
      const spline = new Phaser.Curves.Spline(seg.map((p) => new Phaser.Math.Vector2(p[0], p[1])));
      const n = Math.max(8, Math.floor(spline.getLength() / spacing));
      for (let i = 0; i <= n; i++) {
        const p = spline.getPoint(i / n);
        fn(p.x, p.y);
      }
    }
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

  /** place reserved "Coming Soon" lots on free ground (never on a road) */
  private placePlots() {
    const w = 360, h = 250;
    let placed = 0, attempts = 0;
    while (placed < 2 && attempts < 800) {
      attempts++;
      const hsh = (attempts * 2246822519) >>> 0;
      const x = 460 + (hsh % (W - 920));
      const y = 460 + ((hsh >> 11) % (H - 920));
      if (!this.grid.isFree(x, y, w + 90, h + 90)) continue;
      this.drawPlot(x, y, w, h);
      this.grid.markRect(x, y, w + 60, h + 60);
      placed++;
    }
  }

  private drawPlot(x: number, y: number, w: number, h: number) {
    {
      const left = x - w / 2, top = y - h / 2;
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

  /** townsfolk: varied animals dotted around open grass, a few gently strolling */
  private addAnimals() {
    const kinds = ["an-chick", "an-duck", "an-pig", "an-bunny", "an-panda"];
    const sizeOf: Record<string, number> = { "an-chick": 1.2, "an-duck": 1.4, "an-pig": 1.7, "an-bunny": 1.5, "an-panda": 1.7 };
    // a couple of farmyard ducks by the fountain
    for (const [x, y] of [[940, 1600], [1140, 1640], [1040, 1720]] as [number, number][]) {
      this.add.sprite(x, y, "an-duck").play("an-duck").setScale(1.3).setDepth(y);
    }
    // scatter townsfolk on free grass
    let n = 0, attempts = 0;
    while (n < 14 && attempts < 400) {
      attempts++;
      const h = (attempts * 2654435761) >>> 0;
      const x = 300 + (h % (W - 600));
      const y = 320 + ((h >> 9) % (H - 640));
      if (!this.grid.isFree(x, y, 150, 90)) continue;
      const a = kinds[h % kinds.length];
      const s = sizeOf[a];
      const spr = this.add.sprite(x, y, a).play(a).setScale(s).setFlipX((h & 1) === 0).setDepth(y);
      this.grid.markRect(x, y - 30, 130, 90);
      // some stroll a little
      if (h % 3 === 0) {
        const dir = (h & 2) ? 90 : -90;
        this.tweens.add({
          targets: spr, x: x + dir, duration: 4200 + (h % 1500), yoyo: true, repeat: -1,
          ease: "sine.inout", onYoyo: () => spr.setFlipX(!spr.flipX), onRepeat: () => spr.setFlipX(!spr.flipX),
        });
      }
      n++;
    }
  }

  /** drifting cloud shadows for living daylight */
  private cloudShadows() {
    for (let i = 0; i < 5; i++) {
      const c = this.add.graphics().setDepth(4000);
      c.fillStyle(0x21330f, 0.07).fillEllipse(0, 0, 560 + i * 90, 330 + i * 50);
      const y = 300 + i * 430;
      const startX = -500 + i * 760;
      c.setPosition(startX, y);
      this.tweens.add({ targets: c, x: startX + W + 1000, duration: 46000 + i * 9000, repeat: -1, ease: "linear" });
    }
  }

  /** soft floating pollen motes drifting through the air */
  private pollen() {
    if (!this.textures.exists("mote")) {
      const g = this.make.graphics({});
      g.fillStyle(0xffffff, 1).fillCircle(8, 8, 7);
      g.generateTexture("mote", 16, 16);
      g.destroy();
    }
    this.add.particles(0, 0, "mote", {
      x: { min: 0, max: W }, y: { min: 0, max: H },
      lifespan: 9000, speedX: { min: -16, max: 16 }, speedY: { min: -24, max: -6 },
      scale: { min: 0.2, max: 0.55 }, alpha: { start: 0.55, end: 0 },
      tint: [0xfff6c8, 0xffffff, 0xeaffd0], frequency: 220, quantity: 1, blendMode: "ADD",
    }).setDepth(3500);
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
