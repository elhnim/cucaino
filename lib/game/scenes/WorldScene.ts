import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

interface Place {
  key: string;
  label: string;
  /** position as fractions of the (scaled) map, following the path */
  fx: number;
  fy: number;
  enter: () => void;
}

const MAP_W = 1440;
const MAP_H = 5660;
const WALK_SPEED = 320; // px/s in screen space

export class WorldScene extends Phaser.Scene {
  private map!: Phaser.GameObjects.Image;
  private mapScale = 1;
  private ground!: Phaser.GameObjects.Zone;
  private places: { cfg: Place; root: Phaser.GameObjects.Container }[] = [];
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

    this.map = this.add.image(0, 0, "map").setOrigin(0, 0);

    // tap anywhere on the map to walk there
    this.ground = this.add.zone(0, 0, MAP_W, MAP_H).setOrigin(0, 0).setInteractive();
    this.ground.on("pointerdown", (p: Phaser.Input.Pointer) => this.walkTo(p.worldX, p.worldY));

    // places along the winding path (Pet Home nearest the start at the bottom)
    const defs: Place[] = [
      { key: "work", label: "🏢 Work", fx: 0.60, fy: 0.12,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "shop", label: "🏪 Shop", fx: 0.16, fy: 0.30,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "playground", label: "🛝 Playground", fx: 0.58, fy: 0.49,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "friends", label: "💌 Friends", fx: 0.30, fy: 0.69,
        enter: () => this.enterFlash(() => go("World", `/kid/${kidId}/world`)) },
      { key: "pet", label: "🏠 Pet Home", fx: 0.52, fy: 0.87,
        enter: () => this.enterFlash(() => go("Pet", `/kid/${kidId}/world?scene=pet`)) },
    ];

    for (const cfg of defs) {
      const pin = this.add.image(0, 0, "pin").setOrigin(0.5, 1);
      const label = this.add
        .text(0, 0, cfg.label, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: "26px",
          color: "#3a6b1e", backgroundColor: "#ffffff", padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5, 1);
      const root = this.add.container(0, 0, [pin, label]);
      pin.setInteractive({ useHandCursor: true });
      pin.on("pointerover", () => root.setScale(root.scale * 1.06));
      pin.on("pointerout", () => this.layout());
      pin.on("pointerdown", () => this.walkToPlace(cfg, root));
      this.tweens.add({ targets: root, y: "-=8", duration: 1400, yoyo: true, repeat: -1, ease: "sine.inout" });
      this.places.push({ cfg, root });
    }

    this.player = this.add.sprite(0, 0, "cat-idle").play("cat-idle").setDepth(50);

    this.layout();
    // start at the bottom of the map (Pet Home end) looking up the path
    this.cameras.main.scrollY = MAP_H; // clamped to bounds in layout/below

    onResize(this, () => this.layout());
  }

  private walkToPlace(cfg: Place, root: Phaser.GameObjects.Container) {
    this.walkTo(root.x, root.y + this.player.displayHeight * 0.1, () => cfg.enter());
  }

  private walkTo(x: number, y: number, onArrive?: () => void) {
    const worldH = MAP_H * this.mapScale;
    const tx = Phaser.Math.Clamp(x, 40, MAP_W * this.mapScale - 40);
    const ty = Phaser.Math.Clamp(y, 40, worldH - 20);

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
    this.cameras.main.flash(220, 255, 255, 255);
    this.time.delayedCall(150, then);
  }

  private layout() {
    const v = viewport(this);
    // fit the map to the screen width; it scrolls vertically
    this.mapScale = v.w / MAP_W;
    this.map.setScale(this.mapScale).setPosition(0, 0);

    const worldW = MAP_W * this.mapScale;
    const worldH = MAP_H * this.mapScale;
    this.ground.setSize(MAP_W, MAP_H).setScale(this.mapScale);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    // pull the camera back so more of the town is visible (more on wide iPad).
    // margins beyond the fixed-width map are filled with grass-green to blend.
    this.cameras.main.setZoom(v.portrait ? 0.9 : 0.78);
    this.cameras.main.setBackgroundColor(0x7cc34a);

    for (const { cfg, root } of this.places) {
      root.setScale(v.ui * 0.9).setPosition(worldW * cfg.fx, worldH * cfg.fy);
      const pin = root.list[0] as Phaser.GameObjects.Image;
      const label = root.list[1] as Phaser.GameObjects.Text;
      label.setPosition(0, -pin.displayHeight - 4);
    }

    this.player.setScale(this.mapScale * 1.1);
    if (!this.player.x) {
      this.player.setPosition(worldW * 0.5, worldH * 0.92);
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    } else {
      this.player.x = Phaser.Math.Clamp(this.player.x, 40, worldW - 40);
      this.player.y = Phaser.Math.Clamp(this.player.y, 40, worldH - 20);
    }
  }
}
