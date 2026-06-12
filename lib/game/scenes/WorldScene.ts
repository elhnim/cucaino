import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

// The town is authored in fixed "design" coordinates; the camera zoom fits this
// width to the screen and scrolls vertically, so all object coords stay simple.
const W = 1080;
const H = 2600;
const GRASS = 0x6ea843;
const PATH_EDGE = 0xc79a55;
const PATH_FILL = 0xe8b973;
const WALK_SPEED = 360;

interface Place {
  key: string;
  label: string;
  tex: string;
  bw: number; // building display width
  x: number;
  y: number;
  enter: () => void;
}

interface Decor { tex: string; x: number; y: number; w: number }

export class WorldScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Zone;
  private places: { cfg: Place; building: Phaser.GameObjects.Image }[] = [];
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

    // grass base
    this.add.rectangle(0, 0, W, H, GRASS).setOrigin(0, 0);

    // winding path (bottom start → up past each place)
    const way = [
      [540, 2560], [540, 2200], [320, 1750], [760, 1300], [320, 820], [600, 380], [600, 120],
    ] as [number, number][];
    this.drawPath(way, 120, PATH_EDGE);
    this.drawPath(way, 92, PATH_FILL);

    // tap the grass/path to walk there
    this.ground = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    this.ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    // scattered decoration (deterministic)
    const decor: Decor[] = [
      { tex: "sum-tree-l", x: 140, y: 2400, w: 200 }, { tex: "sum-tree-m", x: 920, y: 2480, w: 150 },
      { tex: "sum-bush-l", x: 780, y: 2300, w: 120 }, { tex: "sum-rock1", x: 250, y: 2280, w: 90 },
      { tex: "sum-tree-l", x: 880, y: 1950, w: 200 }, { tex: "sum-tree-s", x: 150, y: 1980, w: 100 },
      { tex: "sum-bush-m", x: 560, y: 1900, w: 100 }, { tex: "sum-rock2", x: 720, y: 1700, w: 80 },
      { tex: "sum-tree-m", x: 200, y: 1450, w: 150 }, { tex: "sum-tree-l", x: 950, y: 1500, w: 200 },
      { tex: "sum-bush-l", x: 520, y: 1250, w: 120 }, { tex: "sum-tree-s", x: 880, y: 1080, w: 100 },
      { tex: "sum-tree-m", x: 700, y: 900, w: 150 }, { tex: "sum-rock1", x: 160, y: 1050, w: 90 },
      { tex: "sum-tree-l", x: 200, y: 560, w: 200 }, { tex: "sum-bush-m", x: 880, y: 620, w: 100 },
      { tex: "sum-tree-m", x: 320, y: 240, w: 150 }, { tex: "sum-tree-s", x: 860, y: 320, w: 100 },
    ];
    for (const d of decor) {
      const img = this.add.image(d.x, d.y, d.tex).setOrigin(0.5, 1);
      img.setDisplaySize(d.w, d.w * (img.height / img.width)).setDepth(d.y);
    }

    // the five places, each a real building
    const defs: Place[] = [
      { key: "pet", label: "🏠 Pet Home", tex: "sum-house", bw: 230, x: 540, y: 2180,
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
      { key: "friends", label: "💌 Friends", tex: "sum-tower", bw: 200, x: 320, y: 1730,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", tex: "sum-tent", bw: 220, x: 760, y: 1280,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", tex: "sum-magic", bw: 200, x: 320, y: 800,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "work", label: "🏢 Work", tex: "sum-castle", bw: 260, x: 600, y: 360,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
    ];
    for (const cfg of defs) {
      const b = this.add.image(cfg.x, cfg.y, cfg.tex).setOrigin(0.5, 1);
      b.setDisplaySize(cfg.bw, cfg.bw * (b.height / b.width)).setDepth(cfg.y).setInteractive({ useHandCursor: true });
      const label = this.add
        .text(cfg.x, cfg.y - b.displayHeight - 8, cfg.label, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: "30px",
          color: "#3a6b1e", backgroundColor: "#ffffff", padding: { x: 16, y: 7 },
        })
        .setOrigin(0.5, 1).setDepth(100000);
      b.on("pointerover", () => b.setTint(0xfff2c4));
      b.on("pointerout", () => b.clearTint());
      b.on("pointerdown", () => this.walkTo(cfg.x, cfg.y + 30, () => cfg.enter()));
      this.places.push({ cfg, building: b });
    }

    // character
    this.player = this.add.sprite(540, 2520, "cat-idle").play("cat-idle").setScale(0.62);
    this.player.setDepth(2520);

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(GRASS);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.layout();
    onResize(this, () => this.layout());
  }

  private drawPath(points: [number, number][], width: number, color: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.strokePath();
    // round the joints
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
      duration: Math.max(220, (dist / WALK_SPEED) * 1000),
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
    // fit the design width to the screen, scroll vertically; a touch more
    // zoomed-out on wide landscape. Grass-green fills any side margin.
    const fit = v.w / W;
    this.cameras.main.setZoom(fit * (v.portrait ? 1 : 0.92));
  }
}
