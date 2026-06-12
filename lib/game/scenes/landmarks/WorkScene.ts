import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { backdrop, sign, backButton, panel, grid, relayoutOnResize } from "./chrome";

interface Task { icon: string; name: string; stars: number; done: boolean }

/** Work = today's tasks as collectible cards; tick them to earn stars. */
export class WorkScene extends Phaser.Scene {
  constructor() { super("Work"); }

  create() {
    backdrop(this, 0xffe9c8);
    backButton(this);
    const v = viewport(this);
    sign(this, v.cx, 54 * v.ui, "🏢 My Day", 38);

    // sample tasks (wired to real data later)
    const tasks: Task[] = [
      { icon: "🦷", name: "Brush teeth", stars: 2, done: true },
      { icon: "🛏️", name: "Make bed", stars: 2, done: true },
      { icon: "📚", name: "Reading", stars: 3, done: false },
      { icon: "🎹", name: "Piano", stars: 5, done: false },
      { icon: "🧺", name: "Tidy toys", stars: 2, done: false },
      { icon: "🥗", name: "Eat veggies", stars: 3, done: false },
    ];

    const progress = this.add.container(v.cx, 118 * v.ui).setDepth(60);
    const drawProgress = () => {
      progress.removeAll(true);
      const done = tasks.filter((t) => t.done).length;
      const barW = Math.min(v.w * 0.6, 420), barH = 26 * v.ui;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRoundedRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
      g.fillStyle(0x46c43a, 1).fillRoundedRect(-barW / 2 + 3, -barH / 2 + 3, (barW - 6) * (done / tasks.length), barH - 6, barH / 2);
      const label = this.add.text(0, -barH - 6, `${done} / ${tasks.length} done — fill the bar for a daily chest! 🎁`, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${17 * v.ui}px`, color: "#7a4a1e",
      }).setOrigin(0.5);
      progress.add([g, label]);
    };
    drawProgress();

    const cw = Math.min(220, (v.w - 60) / 2) * (v.portrait ? 1 : 0.95);
    const ch = cw * 0.95;
    const pos = grid(v, tasks.length, cw, ch, 18 * v.ui, 160 * v.ui);

    tasks.forEach((t, i) => {
      const { x, y } = pos[i];
      const card = this.add.container(x, y).setDepth(10);
      const draw = () => {
        card.removeAll(true);
        const g = panel(this, 0, 0, cw, ch, t.done ? 0xe7f9e0 : 0xffffff, t.done ? 0x9cd48a : 0xe0a655);
        const thumb = this.add.text(0, -ch * 0.16, t.icon, { fontSize: `${cw * 0.34}px` }).setOrigin(0.5);
        const name = this.add.text(0, ch * 0.16, t.name, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.11}px`, color: "#7a4a1e",
        }).setOrigin(0.5);
        const reward = this.add.text(0, ch * 0.33, `⭐ +${t.stars}`, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.1}px`, color: "#c8860f",
          backgroundColor: "#fff5d8", padding: { x: 10, y: 3 },
        }).setOrigin(0.5);
        const check = this.add.text(cw / 2 - 16, -ch / 2 + 16, t.done ? "✅" : "⬜", { fontSize: `${cw * 0.16}px` }).setOrigin(0.5);
        card.add([g, thumb, name, reward, check]);
      };
      draw();
      const hit = this.add.zone(x, y, cw, ch).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        t.done = !t.done;
        draw();
        drawProgress();
        if (t.done) this.burst(x, y - ch * 0.16);
      });
    });

    relayoutOnResize(this);
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const s = this.add.text(x, y, "⭐", { fontSize: "26px" }).setOrigin(0.5).setDepth(200);
      const a = (i / 8) * Math.PI * 2;
      this.tweens.add({
        targets: s, x: x + Math.cos(a) * 90, y: y + Math.sin(a) * 90, alpha: 0, scale: 0.4,
        duration: 520, ease: "cubic.out", onComplete: () => s.destroy(),
      });
    }
  }
}
