import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

interface Landmark {
  key: string;
  label: string;
  texture: string;
  /** anchor as fractions of the viewport, per orientation */
  land: { x: number; y: number };
  port: { x: number; y: number };
  /** which scene to enter once the character arrives */
  enter: () => void;
}

const WALK_SPEED = 280; // px per second

export class WorldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;
  private clouds: Phaser.GameObjects.Image[] = [];
  private ground!: Phaser.GameObjects.Zone;
  private landmarks: { cfg: Landmark; root: Phaser.GameObjects.Container; img: Phaser.GameObjects.Image }[] = [];
  private tree!: Phaser.GameObjects.Image;

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

    this.bg = this.add.image(0, 0, "bg").setOrigin(0.5);
    this.clouds = [
      this.add.image(0, 0, "cloud1").setAlpha(0.9),
      this.add.image(0, 0, "cloud2").setAlpha(0.85),
    ];

    // ground catches taps that aren't on a building → free walk
    this.ground = this.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    this.ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    this.tree = this.add.image(0, 0, "tree").setOrigin(0.5, 1);

    // The town metaphor: Work = do today's tasks, Shop = spend rewards,
    // Playground = games, Friends = message friends, Pet Home = the pet.
    const defs: Landmark[] = [
      { key: "work", label: "🏢 Work", texture: "dest-schedule",
        land: { x: 0.15, y: 0.38 }, port: { x: 0.26, y: 0.22 },
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", texture: "dest-store",
        land: { x: 0.42, y: 0.30 }, port: { x: 0.72, y: 0.32 },
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", texture: "dest-play",
        land: { x: 0.80, y: 0.34 }, port: { x: 0.26, y: 0.46 },
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "friends", label: "💌 Friends", texture: "dest-play",
        land: { x: 0.60, y: 0.54 }, port: { x: 0.72, y: 0.56 },
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", texture: "dest-store",
        land: { x: 0.30, y: 0.60 }, port: { x: 0.40, y: 0.70 },
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];

    for (const cfg of defs) {
      const img = this.add.image(0, 0, cfg.texture).setOrigin(0.5);
      const label = this.add
        .text(0, 0, cfg.label, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: "22px",
          color: "#b5572a", backgroundColor: "#ffffff", padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5, 0);
      const root = this.add.container(0, 0, [img, label]);
      img.setInteractive({ useHandCursor: true });
      img.on("pointerover", () => root.setScale(root.scale * 1.05));
      img.on("pointerout", () => this.layout());
      // tap a building → walk to its doorstep, then enter
      img.on("pointerdown", () => this.walkToLandmark(cfg, root));
      this.tweens.add({ targets: root, y: "+=8", duration: 1600, yoyo: true, repeat: -1, ease: "sine.inout" });
      this.landmarks.push({ cfg, root, img });
    }

    // the kid's character (placeholder body — real per-kid character later)
    this.player = this.add.sprite(0, 0, "cat-idle").play("cat-idle");

    this.layout();
    onResize(this, () => this.layout());
  }

  /** doorstep point just below a building, in screen space */
  private doorstep(root: Phaser.GameObjects.Container, img: Phaser.GameObjects.Image) {
    return { x: root.x, y: root.y + (img.displayHeight * root.scale) / 2 + this.player.displayHeight * 0.35 };
  }

  private walkToLandmark(cfg: Landmark, root: Phaser.GameObjects.Container) {
    const img = root.list[0] as Phaser.GameObjects.Image;
    const d = this.doorstep(root, img);
    this.walkTo(d.x, d.y, () => cfg.enter());
  }

  private walkTo(x: number, y: number, onArrive?: () => void) {
    const v = viewport(this);
    // keep the character on the candy ground band, not up in the sky
    const minY = v.h * (v.portrait ? 0.5 : 0.5);
    const ty = Phaser.Math.Clamp(y, minY, v.h * 0.95);
    const tx = Phaser.Math.Clamp(x, v.w * 0.05, v.w * 0.95);

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
      onComplete: () => {
        this.player.play("cat-idle", true);
        const cb = this.pendingArrival;
        this.pendingArrival = undefined;
        cb?.();
      },
    });
  }

  private enterFlash(then: () => void) {
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(140, then);
  }

  private layout() {
    const v = viewport(this);
    const scale = Math.max(v.w / this.bg.width, v.h / this.bg.height);
    this.bg.setScale(scale).setPosition(v.cx, v.cy);
    this.ground.setSize(v.w, v.h);

    this.clouds[0].setPosition(v.w * 0.25, v.h * 0.12).setScale(v.ui);
    this.clouds[1].setPosition(v.w * 0.7, v.h * 0.2).setScale(v.ui * 0.8);
    this.tree.setPosition(v.w * (v.portrait ? 0.9 : 0.95), v.h * 0.99).setScale(v.ui * (v.portrait ? 0.7 : 1));

    for (const { cfg, root } of this.landmarks) {
      const a = v.portrait ? cfg.port : cfg.land;
      root.setScale(v.ui * (v.portrait ? 0.72 : 0.92)).setPosition(v.w * a.x, v.h * a.y);
      const img = root.list[0] as Phaser.GameObjects.Image;
      const label = root.list[1] as Phaser.GameObjects.Text;
      label.setPosition(0, (img.displayHeight * root.scale) / 2 / root.scale - 6);
    }

    this.player.setScale(v.ui * 0.5);
    if (!this.player.x) this.player.setPosition(v.cx, v.h * (v.portrait ? 0.8 : 0.85));
    else this.player.y = Phaser.Math.Clamp(this.player.y, v.h * 0.5, v.h * 0.95);
  }
}
