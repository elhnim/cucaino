import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, scrollArea, relayoutOnResize } from "./chrome";

interface Reward { icon: string; name: string; price: number; locked?: boolean }

/** Shop = a real little store: goods on shelves (scrollable), checkout POS counter. */
export class ShopScene extends Phaser.Scene {
  private stars = 24;

  constructor() { super("Shop"); }

  create() {
    room(this, 0xf6d9bf, 0xa9703a, 0xffd0a0);
    const v = viewport(this);

    // many rewards — the shelves scroll to fit them all
    const rewards: Reward[] = [
      { icon: "📺", name: "30 min TV", price: 10 }, { icon: "🍦", name: "Ice cream", price: 15 },
      { icon: "🎮", name: "Game time", price: 20 }, { icon: "🎁", name: "Mystery box", price: 25 },
      { icon: "🍪", name: "Cookie", price: 8 }, { icon: "🎨", name: "Art set", price: 35 },
      { icon: "🏊", name: "Pool trip", price: 30 }, { icon: "🍕", name: "Pizza night", price: 40 },
      { icon: "📚", name: "New book", price: 22 }, { icon: "🧸", name: "Plushie", price: 45 },
      { icon: "🎬", name: "Movie night", price: 50 }, { icon: "🛹", name: "Skateboard", price: 90, locked: true },
      { icon: "🎡", name: "Theme park", price: 150, locked: true }, { icon: "🚲", name: "New bike", price: 200, locked: true },
    ];

    const viewTop = 92 * v.ui;
    const viewBottom = v.h * 0.78;       // counter sits below this
    const cols = v.portrait ? 2 : 4;
    const rowH = 186 * v.ui;
    const colW = (v.w - 48) / cols;
    const rows = Math.ceil(rewards.length / cols);

    const shelves = this.add.container(0, 0).setDepth(5);

    for (let r = 0; r < rows; r++) {
      const plankY = viewTop + 36 + r * rowH + rowH * 0.78;
      this.drawShelf(shelves, v.cx, plankY, v.w - 56);
    }
    rewards.forEach((rw, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = 24 + colW * c + colW / 2;
      const plankY = viewTop + 36 + r * rowH + rowH * 0.78;
      const iconY = plankY - rowH * 0.28;
      const affordable = !rw.locked && this.stars >= rw.price;

      const icon = this.add.text(x, iconY, rw.icon, { fontSize: `${rowH * 0.34}px` })
        .setOrigin(0.5, 1).setAlpha(rw.locked ? 0.5 : 1);
      const name = this.add.text(x, iconY - rowH * 0.34, rw.name, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${Math.min(colW * 0.12, 22)}px`, color: "#5a3a18",
      }).setOrigin(0.5, 1);
      const tag = this.priceTag(x, plankY + 8, rw.locked ? `🔒 ${rw.price}` : `⭐ ${rw.price}`, affordable, rw.locked);
      if (affordable) {
        tag.setInteractive({ useHandCursor: true });
        tag.on("pointerdown", () => this.buy(x + (shelves.x), iconY + shelves.y, rw.price));
      }
      shelves.add([icon, name, tag]);
    });

    const contentBottom = viewTop + 36 + rows * rowH + 20;
    scrollArea(this, shelves, 0, viewTop, v.w, viewBottom - viewTop, contentBottom);

    // fixed chrome on top
    this.drawCounter(v);
    sign(this, v.cx, 50 * v.ui, "🏪 General Store", 32);
    backButton(this);

    relayoutOnResize(this);
  }

  private drawShelf(parent: Phaser.GameObjects.Container, cx: number, y: number, w: number) {
    const g = this.add.graphics();
    g.fillStyle(0x7a4f24, 1).fillRoundedRect(cx - w / 2, y, w, 20, 6);
    g.fillStyle(0x9c6b34, 1).fillRoundedRect(cx - w / 2, y, w, 9, 5);
    g.fillStyle(0x6b4420, 1);
    for (const bx of [cx - w / 2 + 40, cx + w / 2 - 40]) g.fillTriangle(bx - 14, y + 20, bx + 14, y + 20, bx, y + 52);
    parent.add(g);
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
    return this.add.container(x, y, [g, t]).setSize(w, h);
  }

  private drawCounter(v: { w: number; h: number; cx: number; ui: number }) {
    const top = v.h * 0.78;
    const rx = v.w * 0.2, ry = top + 8;
    // shopkeeper stands BEHIND the counter + register (drawn first → lowest depth)
    this.add.sprite(rx, top + 18, "an-pig").play("an-pig")
      .setOrigin(0.5, 1).setScale(v.ui * 1.35).setDepth(20);
    this.add.text(rx, top - 150 * v.ui, "Welcome! 🛍️", {
      fontFamily: "system-ui", fontStyle: "bold", fontSize: `${17 * v.ui}px`, color: "#5a3a18",
      backgroundColor: "#ffffff", padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(22);

    const g = this.add.graphics().setDepth(25);
    g.fillStyle(0x8a5a2b, 1).fillRect(0, top, v.w, v.h - top);
    g.fillStyle(0xa9703a, 1).fillRect(0, top, v.w, 22);
    g.fillStyle(0x6b4420, 1).fillRect(0, top + 22, v.w, 6);
    const reg = this.add.graphics().setDepth(26);
    reg.fillStyle(0x4a4f57, 1).fillRoundedRect(rx - 70, ry - 70, 140, 78, 10);
    reg.fillStyle(0x2a2e34, 1).fillRoundedRect(rx - 58, ry - 86, 116, 40, 8);
    reg.fillStyle(0x7fe0a0, 1).fillRoundedRect(rx - 50, ry - 80, 100, 28, 5);
    reg.fillStyle(0x3a4f57, 1);
    for (let bx = -52; bx < 60; bx += 26) for (let by = -38; by < 0; by += 22) reg.fillRoundedRect(rx + bx, ry + by, 18, 14, 3);
    this.add.text(rx, ry - 66, `⭐ ${this.stars}`, {
      fontFamily: '"Courier New", monospace', fontStyle: "bold", fontSize: "20px", color: "#0a3a1a",
    }).setOrigin(0.5).setDepth(27);
    this.add.text(rx, ry + 24, "CHECKOUT", {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "16px", color: "#ffe9b0",
    }).setOrigin(0.5).setDepth(27);
  }

  private buy(x: number, y: number, price: number) {
    for (let i = 0; i < 5; i++) {
      const c = this.add.text(x, y, "🪙", { fontSize: "24px" }).setOrigin(0.5).setDepth(300);
      this.tweens.add({
        targets: c, x: this.scale.width * 0.2, y: this.scale.height * 0.78, alpha: 0,
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
