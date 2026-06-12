import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, panel, grid, relayoutOnResize } from "./chrome";

interface Reward { icon: string; name: string; price: number; locked?: boolean }

/** Shop = spend stars on rewards. Locked items show what you're saving toward. */
export class ShopScene extends Phaser.Scene {
  constructor() { super("Shop"); }

  create() {
    room(this, 0xf7dbe8, 0xc2945a, 0xffd0e0);
    backButton(this);
    const v = viewport(this);
    sign(this, v.cx, 54 * v.ui, "🏪 Reward Store", 36);

    const stars = 24;
    this.add.text(v.w - 24, 22, `⭐ ${stars}`, {
      fontFamily: "system-ui", fontStyle: "bold", fontSize: `${30 * v.ui}px`, color: "#c8860f",
      backgroundColor: "#ffffff", padding: { x: 14, y: 6 },
    }).setOrigin(1, 0).setDepth(80);

    const rewards: Reward[] = [
      { icon: "📺", name: "30 min TV", price: 10 },
      { icon: "🍦", name: "Ice cream", price: 15 },
      { icon: "🎮", name: "Game time", price: 20 },
      { icon: "🎁", name: "Mystery box", price: 25 },
      { icon: "🏊", name: "Pool trip", price: 30 },
      { icon: "🍕", name: "Pizza night", price: 40 },
      { icon: "🎡", name: "Theme park", price: 150, locked: true },
      { icon: "🚲", name: "New bike", price: 200, locked: true },
    ];

    const cw = Math.min(210, (v.w - 60) / 2) * (v.portrait ? 1 : 0.92);
    const ch = cw * 1.0;
    const pos = grid(v, rewards.length, cw, ch, 18 * v.ui, 120 * v.ui);

    rewards.forEach((r, i) => {
      const { x, y } = pos[i];
      const affordable = !r.locked && stars >= r.price;
      panel(this, x, y, cw, ch, r.locked ? 0xf0e6ee : 0xffffff, 0xd98fb6);
      this.add.text(x, y - ch * 0.16, r.icon, { fontSize: `${cw * 0.36}px` }).setOrigin(0.5).setDepth(11)
        .setAlpha(r.locked ? 0.5 : 1);
      this.add.text(x, y + ch * 0.12, r.name, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.1}px`, color: "#7a4a1e",
      }).setOrigin(0.5).setDepth(11);
      const buyBg = r.locked ? 0xcccccc : affordable ? 0xf4b223 : 0xe8c98a;
      const buy = this.add.text(x, y + ch * 0.34, r.locked ? `🔒 ${r.price}` : `⭐ ${r.price}`, {
        fontFamily: "system-ui", fontStyle: "900", fontSize: `${cw * 0.12}px`, color: r.locked ? "#888" : "#7a4a0f",
        backgroundColor: `#${buyBg.toString(16).padStart(6, "0")}`, padding: { x: 16, y: 7 },
      }).setOrigin(0.5).setDepth(12);
      if (affordable) {
        buy.setInteractive({ useHandCursor: true });
        buy.on("pointerdown", () => this.bought(x, y));
      }
    });

    relayoutOnResize(this);
  }

  private bought(x: number, y: number) {
    const t = this.add.text(x, y, "Bought! 🎉", {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "26px", color: "#fff",
      backgroundColor: "#46c43a", padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
}
