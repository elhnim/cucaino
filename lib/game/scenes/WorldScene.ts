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
  onTap: () => void;
}

export class WorldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;
  private clouds: Phaser.GameObjects.Image[] = [];
  private landmarks: { cfg: Landmark; root: Phaser.GameObjects.Container }[] = [];
  private pet!: Phaser.GameObjects.Sprite;
  private petTween?: Phaser.Tweens.Tween;
  private tree!: Phaser.GameObjects.Image;

  constructor() {
    super("World");
  }

  create() {
    this.bg = this.add.image(0, 0, "bg").setOrigin(0.5);
    this.clouds = [
      this.add.image(0, 0, "cloud1").setAlpha(0.9),
      this.add.image(0, 0, "cloud2").setAlpha(0.85),
    ];
    this.tree = this.add.image(0, 0, "tree").setOrigin(0.5, 1);

    const goto = (scene: string, path: string) => {
      window.history.pushState({}, "", path);
      this.scene.start(scene);
    };
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kidId = data?.kid?.id ?? "";

    const defs: Landmark[] = [
      { key: "schedule", label: "📋 My Day", texture: "dest-schedule",
        land: { x: 0.15, y: 0.42 }, port: { x: 0.26, y: 0.30 },
        onTap: () => this.flash(() => goto("World", `/kid/${kidId}/world`)) },
      { key: "store", label: "🎁 Store", texture: "dest-store",
        land: { x: 0.5, y: 0.34 }, port: { x: 0.72, y: 0.40 },
        onTap: () => this.flash(() => goto("World", `/kid/${kidId}/world`)) },
      { key: "play", label: "🎮 Play", texture: "dest-play",
        land: { x: 0.85, y: 0.42 }, port: { x: 0.28, y: 0.56 },
        onTap: () => this.flash(() => goto("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", texture: "dest-store",
        land: { x: 0.7, y: 0.66 }, port: { x: 0.7, y: 0.66 },
        onTap: () => goto("Pet", `/kid/${kidId}/world?scene=pet`) },
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
      img.on("pointerover", () => root.setScale(root.scale * 1.06));
      img.on("pointerout", () => this.layout());
      img.on("pointerdown", () => cfg.onTap());
      this.tweens.add({ targets: root, y: "+=8", duration: 1600, yoyo: true, repeat: -1, ease: "sine.inout" });
      this.landmarks.push({ cfg, root });
    }

    // wandering pet
    this.pet = this.add.sprite(0, 0, "cat-idle").play("cat-idle");
    this.wander();

    this.layout();
    onResize(this, () => this.layout());
  }

  private flash(then: () => void) {
    this.cameras.main.flash(180, 255, 255, 255);
    this.time.delayedCall(120, then);
  }

  private layout() {
    const v = viewport(this);
    // cover-fit background
    const scale = Math.max(v.w / this.bg.width, v.h / this.bg.height);
    this.bg.setScale(scale).setPosition(v.cx, v.cy);

    this.clouds[0].setPosition(v.w * 0.25, v.h * 0.12).setScale(v.ui);
    this.clouds[1].setPosition(v.w * 0.7, v.h * 0.2).setScale(v.ui * 0.8);

    this.tree.setPosition(v.w * (v.portrait ? 0.88 : 0.95), v.h * 0.99).setScale(v.ui * (v.portrait ? 0.7 : 1));

    for (const { cfg, root } of this.landmarks) {
      const a = v.portrait ? cfg.port : cfg.land;
      root.setScale(v.ui * (v.portrait ? 0.78 : 1)).setPosition(v.w * a.x, v.h * a.y);
      const img = root.list[0] as Phaser.GameObjects.Image;
      const label = root.list[1] as Phaser.GameObjects.Text;
      label.setPosition(0, img.displayHeight / 2 - 6);
    }

    this.pet.setScale(v.ui * 0.5);
    this.pet.y = v.h * (v.portrait ? 0.82 : 0.86);
    this.wander();
  }

  private wander() {
    const v = viewport(this);
    this.petTween?.stop();
    const left = v.w * 0.28, right = v.w * 0.62;
    if (this.pet.x < left || this.pet.x > right) this.pet.x = left;
    this.pet.play("cat-walk", true);
    const target = this.pet.x < (left + right) / 2 ? right : left;
    this.pet.setFlipX(target < this.pet.x);
    this.petTween = this.tweens.add({
      targets: this.pet,
      x: target,
      duration: 4000 + Math.abs(target - this.pet.x) * 6,
      ease: "sine.inout",
      onComplete: () => {
        this.pet.play("cat-idle", true);
        this.time.delayedCall(1200, () => this.scene.isActive() && this.wander());
      },
    });
  }
}
