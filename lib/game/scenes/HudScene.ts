import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

/** Persistent overlay scene: avatar + coins + stars, above every world scene. */
export class HudScene extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Image;
  private nameTag!: Phaser.GameObjects.Text;
  private coinIco!: Phaser.GameObjects.Image;
  private coinTxt!: Phaser.GameObjects.Text;
  private starIco!: Phaser.GameObjects.Image;
  private starTxt!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "Hud", active: false });
  }

  create() {
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kid = data?.kid;

    this.avatar = this.add.image(0, 0, "avatar").setOrigin(0, 0);
    this.nameTag = this.add.text(0, 0, kid?.name ?? "Player", {
      fontFamily: "system-ui", fontStyle: "bold", fontSize: "20px",
      color: "#b5572a", backgroundColor: "#ffffff", padding: { x: 12, y: 4 },
    });
    this.coinIco = this.add.image(0, 0, "coin").setOrigin(0, 0.5);
    this.coinTxt = this.add.text(0, 0, `${kid?.pointsBalance ?? 0}`, {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "26px", color: "#6b4a1f",
    }).setOrigin(0, 0.5);
    this.starIco = this.add.image(0, 0, "star").setOrigin(0, 0.5);
    this.starTxt = this.add.text(0, 0, `${data?.tasksToday?.done ?? 0}`, {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "26px", color: "#6b4a1f",
    }).setOrigin(0, 0.5);

    // listen for live updates from other scenes
    this.game.events.on("hud:coins", (n: number) => this.coinTxt.setText(`${n}`));
    this.game.events.on("hud:stars", (n: number) => this.starTxt.setText(`${n}`));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("hud:coins");
      this.game.events.off("hud:stars");
    });

    this.layout();
    onResize(this, () => this.layout());
  }

  private layout() {
    const v = viewport(this);
    const pad = 16 * v.ui;
    const av = 72 * v.ui;
    this.avatar.setDisplaySize(av, av).setPosition(pad, pad);
    this.nameTag.setFontSize(20 * v.ui).setPosition(pad + av + 10, pad + av / 2 - 16);

    const ico = 42 * v.ui;
    // counters top-right (stacked in portrait, inline in landscape)
    const rx = v.w - pad;
    if (v.portrait) {
      this.coinIco.setDisplaySize(ico, ico).setPosition(rx - 110 * v.ui, pad + ico / 2);
      this.coinTxt.setFontSize(26 * v.ui).setPosition(rx - 60 * v.ui, pad + ico / 2);
      this.starIco.setDisplaySize(ico * 0.85, ico * 0.85).setPosition(rx - 110 * v.ui, pad + ico * 1.6);
      this.starTxt.setFontSize(26 * v.ui).setPosition(rx - 60 * v.ui, pad + ico * 1.6);
    } else {
      this.coinIco.setDisplaySize(ico, ico).setPosition(rx - 230 * v.ui, pad + ico / 2);
      this.coinTxt.setFontSize(26 * v.ui).setPosition(rx - 180 * v.ui, pad + ico / 2);
      this.starIco.setDisplaySize(ico * 0.85, ico * 0.85).setPosition(rx - 110 * v.ui, pad + ico / 2);
      this.starTxt.setFontSize(26 * v.ui).setPosition(rx - 64 * v.ui, pad + ico / 2);
    }
  }
}
