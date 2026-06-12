import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

// The whole town is authored in this design area and the camera always FITS the
// entire area on screen (no scrolling) — so every building is visible at once.
// Landscape iPad fills it; portrait iPhone shows it smaller with grass margins.
const W = 1600;
const H = 1200;
const GRASS = 0x6ea843;
const PATH_EDGE = 0xc79a55;
const PATH_FILL = 0xe8b973;
const WALK_SPEED = 420;

interface Place {
  key: string;
  label: string;
  tex: string;
  bw: number;
  x: number;
  y: number;
  enter: () => void;
}
interface Decor { tex: string; x: number; y: number; w: number }

export class WorldScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Zone;
  private player!: Phaser.GameObjects.Sprite;
  private moveTween?: Phaser.Tweens.Tween;
  private pendingArrival?: () => void;

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

    // road network touching every building
    const segs: [number, number][][] = [
      [[810, 1140], [810, 1000], [810, 250]],
      [[810, 900], [360, 880]],
      [[810, 360], [330, 360]],
      [[810, 560], [1300, 560]],
    ];
    for (const s of segs) this.drawPath(s, 110, PATH_EDGE);
    for (const s of segs) this.drawPath(s, 84, PATH_FILL);

    this.ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    this.ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    const decor: Decor[] = [
      { tex: "sum-tree-l", x: 150, y: 260, w: 190 }, { tex: "sum-tree-m", x: 1460, y: 230, w: 150 },
      { tex: "sum-tree-l", x: 1500, y: 980, w: 190 }, { tex: "sum-tree-m", x: 170, y: 1120, w: 150 },
      { tex: "sum-tree-l", x: 1180, y: 1080, w: 190 }, { tex: "sum-tree-s", x: 560, y: 200, w: 95 },
      { tex: "sum-tree-s", x: 1120, y: 840, w: 95 }, { tex: "sum-tree-m", x: 250, y: 660, w: 150 },
      { tex: "sum-bush-l", x: 640, y: 720, w: 110 }, { tex: "sum-bush-m", x: 1330, y: 820, w: 95 },
      { tex: "sum-bush-m", x: 980, y: 320, w: 95 }, { tex: "sum-rock1", x: 470, y: 1050, w: 80 },
      { tex: "sum-rock2", x: 1050, y: 240, w: 70 }, { tex: "sum-bush-l", x: 1470, y: 560, w: 110 },
      { tex: "sum-tree-s", x: 620, y: 1080, w: 95 }, { tex: "sum-rock1", x: 220, y: 430, w: 80 },
    ];
    for (const d of decor) {
      const img = this.add.image(d.x, d.y, d.tex).setOrigin(0.5, 1);
      img.setDisplaySize(d.w, d.w * (img.height / img.width)).setDepth(d.y);
    }

    const defs: Place[] = [
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 250, x: 820, y: 250,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", tex: "sum-magic", bw: 200, x: 330, y: 360,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 220, x: 1300, y: 560,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 190, x: 360, y: 880,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 230, x: 810, y: 1000,
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];
    for (const cfg of defs) {
      const b = this.add.image(cfg.x, cfg.y, cfg.tex).setOrigin(0.5, 1);
      b.setDisplaySize(cfg.bw, cfg.bw * (b.height / b.width)).setDepth(cfg.y).setInteractive({ useHandCursor: true });
      this.add
        .text(cfg.x, cfg.y - b.displayHeight - 8, cfg.label, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: "30px",
          color: "#3a6b1e", backgroundColor: "#ffffff", padding: { x: 16, y: 7 },
        })
        .setOrigin(0.5, 1).setDepth(1e6);
      b.on("pointerover", () => b.setTint(0xfff2c4));
      b.on("pointerout", () => b.clearTint());
      b.on("pointerdown", () => this.walkTo(cfg.x, cfg.y + 24, () => cfg.enter()));
    }

    this.player = this.add.sprite(810, 1110, "cat-idle").play("cat-idle").setScale(0.6).setDepth(1110);

    this.cameras.main.setBackgroundColor(GRASS);

    this.layout();
    onResize(this, () => this.layout());
  }

  private drawPath(points: [number, number][], width: number, color: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(width, color, 1).beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.strokePath();
    g.fillStyle(color, 1);
    for (const [x, y] of points) g.fillCircle(x, y, width / 2);
  }

  private walkTo(x: number, y: number, onArrive?: () => void) {
    const tx = Phaser.Math.Clamp(x, 30, W - 30);
    const ty = Phaser.Math.Clamp(y, 30, H - 20);
    this.moveTween?.stop();
    this.pendingArrival = onArrive;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
    if (dist < 4) {
      this.player.play("cat-idle", true);
      onArrive?.();
      return;
    }
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
    // FIT the whole town on screen (contain). Margins are grass-green.
    const zoom = Math.min(v.w / W, v.h / H) * 0.98;
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(W / 2, H / 2);
  }
}
