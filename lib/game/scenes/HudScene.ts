import Phaser from "phaser";
import { viewport, onResize } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

type Dir = "up" | "down" | "left" | "right";

/** Persistent overlay: avatar + coins + stars, plus the movement D-pad. */
export class HudScene extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Image;
  private nameTag!: Phaser.GameObjects.Text;
  private coinIco!: Phaser.GameObjects.Image;
  private coinTxt!: Phaser.GameObjects.Text;
  private starIco!: Phaser.GameObjects.Image;
  private starTxt!: Phaser.GameObjects.Text;

  private dpad!: Phaser.GameObjects.Container;
  private buttons: Partial<Record<Dir, Phaser.GameObjects.Container>> = {};

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

    this.buildDpad();
    // show immediately if we booted straight into the world (the world's "dpad"
    // event may fire before this scene's listener is attached)
    this.dpad.setVisible(this.scene.isActive("World"));

    this.game.events.on("hud:coins", (n: number) => this.coinTxt.setText(`${n}`));
    this.game.events.on("hud:stars", (n: number) => this.starTxt.setText(`${n}`));
    // show the D-pad only while the explorable world is active
    this.game.events.on("dpad", (on: boolean) => this.dpad.setVisible(on));
    // animated game-moment banner (e.g. "Let's Go!")
    this.game.events.on("banner", (key: string) => this.playBanner(key));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("hud:coins");
      this.game.events.off("hud:stars");
      this.game.events.off("dpad");
      this.game.events.off("banner");
    });

    this.layout();
    onResize(this, () => this.layout());
  }

  private playBanner(key: string) {
    const v = viewport(this);
    const s = this.add.sprite(v.cx, v.h * 0.34, key).setDepth(200).setScale(Math.min(v.ui, 1.2) * 1.4);
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.tweens.add({ targets: s, alpha: 0, y: s.y - 40, duration: 360, onComplete: () => s.destroy() });
    });
  }

  private buildDpad() {
    this.dpad = this.add.container(0, 0).setVisible(false).setDepth(50);
    const R = 28;
    const arrows: Record<Dir, string> = { up: "▲", down: "▼", left: "◀", right: "▶" };
    (Object.keys(arrows) as Dir[]).forEach((dir) => {
      const circle = this.add.circle(0, 0, R, 0xffffff, 0.7).setStrokeStyle(3, 0xb5572a);
      const glyph = this.add.text(0, 0, arrows[dir], {
        fontFamily: "system-ui", fontSize: "20px", color: "#b5572a",
      }).setOrigin(0.5);
      const btn = this.add.container(0, 0, [circle, glyph]);
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, R), Phaser.Geom.Circle.Contains);
      const press = (down: boolean) => {
        circle.setFillStyle(0xffffff, down ? 1 : 0.82);
        this.game.events.emit("move", { dir, down });
      };
      circle.on("pointerdown", () => press(true));
      circle.on("pointerup", () => press(false));
      circle.on("pointerout", () => press(false));
      this.dpad.add(btn);
      this.buttons[dir] = btn;
    });
    // releasing anywhere stops all movement (finger may slide off a button)
    this.input.on("pointerup", () => (Object.keys(arrows) as Dir[]).forEach((d) =>
      this.game.events.emit("move", { dir: d, down: false })));
  }

  private layout() {
    const v = viewport(this);
    const pad = 16 * v.ui;
    const av = 72 * v.ui;
    this.avatar.setDisplaySize(av, av).setPosition(pad, pad);
    this.nameTag.setFontSize(20 * v.ui).setPosition(pad + av + 10, pad + av / 2 - 16);

    const ico = 42 * v.ui;
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

    // D-pad bottom-left, smaller + scaled for the device
    const s = Math.min(v.ui, 1) * 0.82;
    const gap = 52 * s;
    const cx = 18 * s + gap + 28 * s;
    const cy = v.h - 18 * s - gap - 28 * s;
    this.dpad.setScale(s).setPosition(0, 0);
    const place = (dir: Dir, dx: number, dy: number) =>
      this.buttons[dir]!.setPosition((cx + dx * gap) / s, (cy + dy * gap) / s);
    place("up", 0, -1);
    place("down", 0, 1);
    place("left", -1, 0);
    place("right", 1, 0);
  }
}
