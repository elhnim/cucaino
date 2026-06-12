import Phaser from "phaser";
import { viewport, onResize, hiDpiCamera } from "../systems/layout";
import { REGISTRY_DATA } from "../types";
import type { InitialGameData } from "../types";

/** Persistent overlay: avatar + coins + stars, plus the drag-to-move joystick. */
export class HudScene extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Image;
  private nameTag!: Phaser.GameObjects.Text;
  private coinIco!: Phaser.GameObjects.Image;
  private coinTxt!: Phaser.GameObjects.Text;
  private starIco!: Phaser.GameObjects.Image;
  private starTxt!: Phaser.GameObjects.Text;

  private joyBase!: Phaser.GameObjects.Arc;
  private joyThumb!: Phaser.GameObjects.Arc;
  private joyZone!: Phaser.GameObjects.Zone;
  private joyParts: Phaser.GameObjects.GameObject[] = [];
  private joyCenter = { x: 0, y: 0 };
  private dragging = false;
  private readonly joyR = 64; // drag radius (CSS px)

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

    this.buildJoystick();
    // show immediately if we booted straight into the world (the world's "dpad"
    // event may fire before this scene's listener is attached)
    this.setJoyVisible(this.scene.isActive("World"));

    this.game.events.on("hud:coins", (n: number) => this.coinTxt.setText(`${n}`));
    this.game.events.on("hud:stars", (n: number) => this.starTxt.setText(`${n}`));
    // show the joystick only while the explorable world is active
    this.game.events.on("dpad", (on: boolean) => this.setJoyVisible(on));
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

  private setJoyVisible(on: boolean) {
    this.joyParts.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
    if (!on) { this.dragging = false; this.game.events.emit("movevec", { x: 0, y: 0 }); }
  }

  private buildJoystick() {
    // A fixed thumbstick bottom-left: press inside the ring and drag to steer;
    // speed scales with drag distance. A generous square zone catches the press.
    this.joyBase = this.add.circle(0, 0, this.joyR, 0xffffff, 0.26).setStrokeStyle(4, 0xffffff, 0.7).setDepth(50).setVisible(false);
    this.joyThumb = this.add.circle(0, 0, 34, 0xffffff, 0.9).setStrokeStyle(3, 0xb5572a).setDepth(52).setVisible(false);
    this.joyZone = this.add.zone(0, 0, this.joyR * 2.6, this.joyR * 2.6).setDepth(51).setVisible(false);
    this.joyZone.setInteractive();
    this.joyParts = [this.joyBase, this.joyZone, this.joyThumb];

    this.joyZone.on("pointerdown", (p: Phaser.Input.Pointer) => { this.dragging = true; this.steer(p); });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => { if (this.dragging) this.steer(p); });
    this.input.on("pointerup", () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.joyThumb.setPosition(this.joyCenter.x, this.joyCenter.y);
      this.game.events.emit("movevec", { x: 0, y: 0 });
    });
  }

  private steer(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    let dx = wp.x - this.joyCenter.x, dy = wp.y - this.joyCenter.y;
    const d = Math.hypot(dx, dy);
    if (d > this.joyR) { dx = (dx / d) * this.joyR; dy = (dy / d) * this.joyR; }
    this.joyThumb.setPosition(this.joyCenter.x + dx, this.joyCenter.y + dy);
    this.game.events.emit("movevec", { x: dx / this.joyR, y: dy / this.joyR });
  }

  private layout() {
    hiDpiCamera(this);
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

    // Joystick bottom-right, positioned directly in CSS units.
    const cx = v.w - 30 - this.joyR;
    const cy = v.h - 30 - this.joyR;
    this.joyCenter = { x: cx, y: cy };
    this.joyBase.setPosition(cx, cy);
    this.joyZone.setPosition(cx, cy);
    if (!this.dragging) this.joyThumb.setPosition(cx, cy);
  }
}
