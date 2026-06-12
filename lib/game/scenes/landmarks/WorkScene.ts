import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, panel, grid, relayoutOnResize } from "./chrome";
import { REGISTRY_DATA } from "../../types";
import type { InitialGameData, WorldTask } from "../../types";
import { bridge } from "../../bridge/dataBridge";

/** Work = today's REAL tasks as cards; ticking saves to Supabase and earns stars. */
export class WorkScene extends Phaser.Scene {
  private tasks: WorldTask[] = [];
  private balance = 0;
  private busy = new Set<string>();

  constructor() { super("Work"); }

  create() {
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    this.tasks = (data?.tasks ?? []).map((t) => ({ ...t }));
    this.balance = data?.kid?.pointsBalance ?? 0;

    room(this, 0xf0e3c8, 0xb98b53, 0xffe0b0);
    backButton(this);
    const v = viewport(this);
    sign(this, v.cx, 54 * v.ui, "🏢 My Day", 38);

    if (this.tasks.length === 0) {
      this.add.text(v.cx, v.cy, "No tasks for today — go play! 🎉", {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${24 * v.ui}px`, color: "#7a4a1e",
        backgroundColor: "#ffffffcc", padding: { x: 18, y: 12 },
      }).setOrigin(0.5).setDepth(20);
      relayoutOnResize(this);
      return;
    }

    const progress = this.add.container(v.cx, 118 * v.ui).setDepth(60);
    const drawProgress = () => {
      progress.removeAll(true);
      const done = this.tasks.filter((t) => t.done).length;
      const barW = Math.min(v.w * 0.6, 420), barH = 26 * v.ui;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRoundedRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
      g.fillStyle(0x46c43a, 1).fillRoundedRect(-barW / 2 + 3, -barH / 2 + 3, (barW - 6) * (done / this.tasks.length), barH - 6, barH / 2);
      const label = this.add.text(0, -barH - 6, `${done} / ${this.tasks.length} done${done === this.tasks.length ? " — all done! 🎉" : ""}`, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${17 * v.ui}px`, color: "#7a4a1e",
      }).setOrigin(0.5);
      progress.add([g, label]);
    };
    drawProgress();

    const cw = Math.min(220, (v.w - 60) / 2) * (v.portrait ? 1 : 0.95);
    const ch = cw * 0.95;
    const pos = grid(v, this.tasks.length, cw, ch, 18 * v.ui, 160 * v.ui);

    this.tasks.forEach((t, i) => {
      const { x, y } = pos[i];
      const card = this.add.container(x, y).setDepth(10);
      const draw = () => {
        card.removeAll(true);
        const saving = this.busy.has(t.id);
        const g = panel(this, 0, 0, cw, ch, t.done ? 0xe7f9e0 : 0xffffff, t.done ? 0x9cd48a : 0xe0a655);
        const thumb = this.add.text(0, -ch * 0.16, t.icon || "✅", { fontSize: `${cw * 0.34}px` }).setOrigin(0.5);
        const name = this.add.text(0, ch * 0.16, t.name, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.1}px`, color: "#7a4a1e",
          align: "center", wordWrap: { width: cw * 0.86 },
        }).setOrigin(0.5);
        const reward = this.add.text(0, ch * 0.34, `⭐ +${t.points}`, {
          fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.1}px`, color: "#c8860f",
          backgroundColor: "#fff5d8", padding: { x: 10, y: 3 },
        }).setOrigin(0.5);
        const check = this.add.text(cw / 2 - 16, -ch / 2 + 16, saving ? "⏳" : t.done ? "✅" : "⬜", { fontSize: `${cw * 0.16}px` }).setOrigin(0.5);
        card.add([g, thumb, name, reward, check]);
      };
      draw();
      const hit = this.add.zone(x, y, cw, ch).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.toggle(t, () => draw(), drawProgress, x, y - ch * 0.16));
    });

    relayoutOnResize(this);
  }

  private async toggle(t: WorldTask, redraw: () => void, drawProgress: () => void, bx: number, by: number) {
    if (this.busy.has(t.id)) return;
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kidId = data?.kid?.id ?? "";
    const wasDone = t.done;

    this.busy.add(t.id);
    redraw();
    try {
      const res = wasDone ? await bridge.uncompleteTask(kidId, t) : await bridge.completeTask(kidId, t);
      if (res.ok) {
        t.done = !wasDone;
        this.balance += wasDone ? -t.points : t.points;
        this.game.events.emit("hud:coins", this.balance);
        this.game.events.emit("hud:stars", this.tasks.filter((x) => x.done).length);
        if (t.done) this.burst(bx, by);
      } else if (res.error) {
        this.toast(bx, by - 60, res.error);
      }
    } catch {
      this.toast(bx, by - 60, "Couldn't save — try again");
    } finally {
      this.busy.delete(t.id);
      redraw();
      drawProgress();
    }
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

  private toast(x: number, y: number, msg: string) {
    const t = this.add.text(x, y, msg, {
      fontFamily: "system-ui", fontStyle: "bold", fontSize: "18px", color: "#fff",
      backgroundColor: "#d4683a", padding: { x: 12, y: 7 }, align: "center", wordWrap: { width: 260 },
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1600, onComplete: () => t.destroy() });
  }
}
