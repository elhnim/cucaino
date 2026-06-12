import Phaser from "phaser";
import { viewport } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

const PET_FRAME = { frameWidth: 394, frameHeight: 252 };

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload() {
    const { cx, cy, w } = viewport(this);

    // candy progress bar
    const barW = Math.min(w * 0.6, 420);
    const back = this.add.rectangle(cx, cy, barW, 30, 0xffffff, 0.6).setStrokeStyle(4, 0xf4b223);
    const fill = this.add.rectangle(cx - barW / 2 + 4, cy, 1, 20, 0xf4b223).setOrigin(0, 0.5);
    this.add
      .text(cx, cy - 44, "Loading your world…", { fontFamily: "system-ui", fontSize: "22px", color: "#b5572a" })
      .setOrigin(0.5);
    this.load.on("progress", (p: number) => {
      fill.width = (barW - 8) * p;
    });
    back.setDepth(1);
    fill.setDepth(2);

    // world art
    this.load.image("bg", "/game/world/bg.png");
    // summer top-down tileset props (build the town from these)
    const sum = "/game/world/sum";
    for (const k of ["house", "castle", "tent", "tower", "magic", "tree-l", "tree-m",
      "tree-s", "bush-l", "bush-m", "rock1", "rock2", "chest"]) {
      this.load.image(`sum-${k}`, `${sum}/${k}.png`);
    }
    this.load.image("cloud1", "/game/world/cloud1.png");
    this.load.image("cloud2", "/game/world/cloud2.png");
    this.load.image("dest-schedule", "/game/world/dest-schedule.png");
    this.load.image("dest-store", "/game/world/dest-store.png");
    this.load.image("dest-play", "/game/world/dest-play.png");
    this.load.image("tree", "/game/world/tree.png");
    this.load.image("coin", "/game/world/coin.png");
    this.load.image("star", "/game/world/star.png");
    this.load.image("avatar", "/game/world/avatar.png");
    this.load.image("btn-back", "/game/world/btn-back.png");

    // pet spritesheets
    this.load.spritesheet("cat-idle", "/game/pet/cat-idle.png", PET_FRAME);
    this.load.spritesheet("cat-walk", "/game/pet/cat-walk.png", PET_FRAME);
    this.load.spritesheet("cat-jump", "/game/pet/cat-jump.png", PET_FRAME);
  }

  create() {
    // pet animations (shared across scenes)
    this.anims.create({
      key: "cat-idle",
      frames: this.anims.generateFrameNumbers("cat-idle", { start: 0, end: 19 }),
      frameRate: 14,
      repeat: -1,
    });
    this.anims.create({
      key: "cat-walk",
      frames: this.anims.generateFrameNumbers("cat-walk", { start: 0, end: 19 }),
      frameRate: 18,
      repeat: -1,
    });
    this.anims.create({
      key: "cat-jump",
      frames: this.anims.generateFrameNumbers("cat-jump", { start: 0, end: 19 }),
      frameRate: 18,
      repeat: 0,
    });

    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const start = data?.startScene === "pet" ? "Pet" : "World";
    this.scene.start(start);
    this.scene.launch("Hud");
  }
}
