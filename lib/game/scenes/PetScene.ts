import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";
import { bridge } from "../bridge/dataBridge";
import { room } from "./landmarks/chrome";

/** Phase-0 pet: animated sprite + feed/play actions wired to the real server actions. */
export class PetScene extends Phaser.Scene {
  private pet!: Phaser.GameObjects.Sprite;
  private back!: Phaser.GameObjects.Image;
  private buttons: Phaser.GameObjects.Container[] = [];
  private speech!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super("Pet");
  }

  create() {
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kidId = data?.kid?.id ?? "";

    room(this, 0xffe6d0, 0xc89a5e, 0xffd0b0, { window: true });
    this.pet = this.add.sprite(0, 0, "cat-idle").play("cat-idle");
    this.speech = this.add
      .text(0, 0, data?.pet ? `${data.pet.name} is happy!` : "Tap to play with me!", {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: "18px",
        color: "#7a4a8c", backgroundColor: "#ffffff", padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5);

    this.back = this.add.image(0, 0, "btn-back").setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.back.on("pointerdown", () => {
      window.history.pushState({}, "", `/kid/${kidId}/world`);
      this.scene.start("World");
    });

    this.makeButton("🍎 Feed", () => this.act(() => bridge.feed(kidId, "apple"), "Yum! 🍎"));
    this.makeButton("🎾 Play", () => {
      this.pet.play("cat-jump").once("animationcomplete", () => this.pet.play("cat-idle"));
      this.act(() => bridge.play(kidId, 20), "Wheee! 🎾");
    });
    this.makeButton("🛁 Wash", () => this.act(() => bridge.wash(kidId), "So fresh! ✨"));

    this.layout();
    onResize(this, () => this.layout());
  }

  private makeButton(label: string, onTap: () => void) {
    const t = this.add
      .text(0, 0, label, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: "22px", color: "#fff",
        backgroundColor: "#46c43a", padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on("pointerdown", onTap);
    const c = this.add.container(0, 0, [t]);
    this.buttons.push(c);
  }

  private async act(fn: () => Promise<{ ok: boolean; pointsBalance?: number; error?: string }>, happy: string) {
    if (this.busy) return;
    this.busy = true;
    this.speech.setText(happy);
    try {
      const res = await fn();
      if (res.ok && typeof res.pointsBalance === "number") {
        this.game.events.emit("hud:coins", res.pointsBalance);
      } else if (!res.ok && res.error) {
        this.speech.setText(res.error);
      }
    } catch {
      this.speech.setText("Oops, try again!");
    } finally {
      this.busy = false;
    }
  }

  private layout() {
    const v = viewport(this);
    this.pet.setScale(v.ui * (v.portrait ? 1.0 : 1.2)).setPosition(v.cx, v.h * 0.66);
    this.speech.setPosition(v.cx, this.pet.y - this.pet.displayHeight / 2 - 20).setFontSize(18 * v.ui);
    this.back.setScale(v.ui * 0.8).setPosition(60 * v.ui, 60 * v.ui);

    // action buttons along the bottom, wrapping if narrow
    const n = this.buttons.length;
    const gap = (v.portrait ? 120 : 170) * v.ui;
    const startX = v.cx - ((n - 1) * gap) / 2;
    this.buttons.forEach((b, i) => {
      b.setScale(v.ui).setPosition(startX + i * gap, v.h - 60 * v.ui);
    });
  }
}
