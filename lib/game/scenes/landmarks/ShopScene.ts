import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, relayoutOnResize } from "./chrome";

interface Reward { icon: string; name: string; price: number; locked?: boolean }

/** Shop = a real little store: goods on shelves, a checkout counter + POS. */
export class ShopScene extends Phaser.Scene {
  private stars = 24;

  constructor() { super("Shop"); }

  create() {
    // The store has its own shelves + counter, so skip the cosy-room furniture.
    room(this, 0xf6d9bf, 0xa9703a, 0xffd0a0, { furniture: false });
    const v = viewport(this);

    const rewards: Reward[] = [
      { icon: "📺", name: "30 min TV", price: 10 }, { icon: "🍦", name: "Ice cream", price: 15 },
      { icon: "🎮", name: "Game time", price: 20 }, { icon: "🎁", name: "Mystery box", price: 25 },
      { icon: "🏊", name: "Pool trip", price: 30 }, { icon: "🍕", name: "Pizza night", price: 40 },
      { icon: "🎡", name: "Theme park", price: 150, locked: true }, { icon: "🚲", name: "New bike", price: 200, locked: true },
    ];

    const top = 108 * v.ui;
    const counterTop = v.h * 0.8;
    const cols = v.portrait ? 2 : 4;
    const rows = Math.ceil(rewards.length / cols);
    const rowH = (counterTop - top - 16) / rows;
    const colW = (v.w - 48) / cols;
    const iconSize = Math.min(rowH * 0.3, 58);

    for (let r = 0; r < rows; r++) this.drawShelf(v.cx, top + r * rowH + rowH * 0.82, v.w - 56);

    rewards.forEach((rw, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = 24 + colW * c + colW / 2;
      const plankY = top + r * rowH + rowH * 0.82;
      const affordable = !rw.locked && this.stars >= rw.price;
      const tagY = plankY - 18;
      const iconY = tagY - 20;
      this.add.text(x, iconY, rw.icon, { fontSize: `${iconSize}px` }).setOrigin(0.5, 1).setAlpha(rw.locked ? 0.5 : 1).setDepth(10);
      this.add.text(x, iconY - iconSize - 6, rw.name, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${Math.min(colW * 0.12, 22)}px`, color: "#5a3a18",
      }).setOrigin(0.5, 1).setDepth(10);
      const tag = this.priceTag(x, tagY, rw.locked ? `🔒 ${rw.price}` : `⭐ ${rw.price}`, affordable, rw.locked);
      if (affordable) {
        tag.setInteractive({ useHandCursor: true });
        tag.on("pointerdown", () => this.buy(x, iconY, rw.price));
      }
    });

    this.drawCounter(v, counterTop);
    sign(this, v.cx, 48 * v.ui, "🏪 General Store", 32);
    backButton(this);
    relayoutOnResize(this);
  }

  private drawShelf(cx: number, y: number, w: number) {
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x7a4f24, 1).fillRoundedRect(cx - w / 2, y, w, 20, 6);
    g.fillStyle(0x9c6b34, 1).fillRoundedRect(cx - w / 2, y, w, 9, 5);
    g.fillStyle(0x6b4420, 1);
    for (const bx of [cx - w / 2 + 40, cx + w / 2 - 40]) g.fillTriangle(bx - 14, y + 20, bx + 14, y + 20, bx, y + 52);
  }

  private priceTag(x: number, y: number, text: string, affordable: boolean, locked?: boolean) {
    const fill = locked ? 0xcccccc : affordable ? 0xf4b223 : 0xe8c98a;
    const t = this.add.text(0, 0, text, {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "20px", color: locked ? "#777" : "#7a4a0f",
    }).setOrigin(0.5);
    const w = t.width + 30, h = t.height + 14;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.15).fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, 8);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillStyle(0xffffff, 0.8).fillCircle(-w / 2 + 10, 0, 4);
    return this.add.container(x, y, [g, t]).setDepth(12).setSize(w, h);
  }

  private drawCounter(v: { w: number; h: number; cx: number; ui: number }, top: number) {
    const rx = v.w * 0.22, ry = top;
    this.add.sprite(rx + 98, top + 12, "an-pig").play("an-pig").setOrigin(0.5, 1).setScale(v.ui * 0.7).setDepth(20);
    this.add.text(rx + 150, top - 54, "Welcome! 🛍️", {
      fontFamily: "system-ui", fontStyle: "bold", fontSize: `${15 * v.ui}px`, color: "#5a3a18",
      backgroundColor: "#ffffff", padding: { x: 9, y: 4 },
    }).setOrigin(0.5).setDepth(22);

    const g = this.add.graphics().setDepth(25);
    g.fillStyle(0x8a5a2b, 1).fillRect(0, top, v.w, v.h - top);
    g.fillStyle(0xa9703a, 1).fillRect(0, top, v.w, 22);
    g.fillStyle(0x6b4420, 1).fillRect(0, top + 22, v.w, 6);

    const reg = this.add.graphics().setDepth(26);
    reg.fillStyle(0x4a4f57, 1).fillRoundedRect(rx - 66, ry - 4, 132, 60, 10);
    reg.fillStyle(0x2a2e34, 1).fillRoundedRect(rx - 54, ry - 52, 108, 40, 8);
    reg.fillStyle(0x7fe0a0, 1).fillRoundedRect(rx - 46, ry - 46, 92, 28, 5);
    reg.fillStyle(0x3a4f57, 1);
    for (let bx = -50; bx < 56; bx += 26) reg.fillRoundedRect(rx + bx, ry + 12, 18, 14, 3);
    this.add.text(rx, ry - 32, `⭐ ${this.stars}`, {
      fontFamily: '"Courier New", monospace', fontStyle: "bold", fontSize: "20px", color: "#0a3a1a",
    }).setOrigin(0.5).setDepth(27);
    this.add.text(rx, ry + 40, "CHECKOUT", {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "15px", color: "#ffe9b0",
    }).setOrigin(0.5).setDepth(27);
  }

  private buy(x: number, y: number, price: number) {
    for (let i = 0; i < 5; i++) {
      const c = this.add.text(x, y, "🪙", { fontSize: "24px" }).setOrigin(0.5).setDepth(300);
      this.tweens.add({
        targets: c, x: this.scale.width * 0.22, y: this.scale.height * 0.8, alpha: 0,
        duration: 600 + i * 60, ease: "cubic.in", onComplete: () => c.destroy(),
      });
    }
    const t = this.add.text(x, y - 40, `Sold! −${price}⭐`, {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "22px", color: "#fff",
      backgroundColor: "#46c43a", padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(310);
    this.tweens.add({ targets: t, y: y - 100, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
  }
}
