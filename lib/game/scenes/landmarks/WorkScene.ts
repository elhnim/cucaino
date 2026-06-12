import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, panel, grid, relayoutOnResize } from "./chrome";
import { openTaskPanel } from "./taskPanels";
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

    room(this, 0xf0e3c8, 0xb98b53, 0xffe0b0, { furniture: true });
    backButton(this);
    const v = viewport(this);
    // On phones the sign sits a row below the back button so they never collide.
    // Use absolute Y on portrait: the sign's font is a fixed px size, so scaling
    // its position by v.ui would let it drift into the progress bar below it.
    const signY = v.portrait ? 90 : 54 * v.ui;
    sign(this, v.cx, signY, "🏢 My Day", v.portrait ? 30 : 38);

    if (this.tasks.length === 0) {
      this.add.text(v.cx, v.cy, "No tasks for today — go play! 🎉", {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${24 * v.ui}px`, color: "#7a4a1e",
        backgroundColor: "#ffffffcc", padding: { x: 18, y: 12 },
      }).setOrigin(0.5).setDepth(20);
      relayoutOnResize(this);
      return;
    }

    const progress = this.add.container(v.cx, v.portrait ? 146 : 118 * v.ui).setDepth(60);
    const drawProgress = () => {
      progress.removeAll(true);
      const done = this.tasks.filter((t) => t.done).length;
      const barW = Math.min(v.w * 0.6, 420), barH = 26 * v.ui;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRoundedRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
      g.fillStyle(0x46c43a, 1).fillRoundedRect(-barW / 2 + 3, -barH / 2 + 3, (barW - 6) * (done / this.tasks.length), barH - 6, barH / 2);
      // Label sits BELOW the bar so the "My Day" sign above never covers it.
      const label = this.add.text(0, barH / 2 + 14, `${done} / ${this.tasks.length} done${done === this.tasks.length ? " — all done! 🎉" : ""}`, {
        fontFamily: "system-ui", fontStyle: "bold", fontSize: `${17 * v.ui}px`, color: "#7a4a1e",
      }).setOrigin(0.5);
      progress.add([g, label]);
    };
    drawProgress();

    // Smaller, tidier cards in a balanced grid: 2 cols on phones, up to 3 (≤6
    // tasks) or 4 on tablets so the last row isn't a lonely single card.
    const gap = 18 * v.ui;
    const n = this.tasks.length;
    const maxCols = v.portrait ? 2 : n <= 6 ? 3 : 4;
    const cw = v.portrait
      ? Math.min(150, (v.w - 3 * gap) / 2)
      : Math.min(190, (v.w - (maxCols + 1) * gap) / maxCols);
    const ch = cw * 0.96;
    const pos = grid(v, n, cw, ch, gap, v.portrait ? 188 : 158 * v.ui, maxCols);

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
        const freq = t.frequencyPerDay > 1;
        const checkLabel = saving ? "⏳" : freq ? `${t.doneCount}/${t.frequencyPerDay}` : t.done ? "✅" : "⬜";
        const check = freq
          ? this.add.text(cw / 2 - 8, -ch / 2 + 14, checkLabel, {
              fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.12}px`, color: t.done ? "#2e9b3e" : "#c8860f",
              backgroundColor: "#fff5d8", padding: { x: 6, y: 2 },
            }).setOrigin(1, 0)
          : this.add.text(cw / 2 - 16, -ch / 2 + 16, checkLabel, { fontSize: `${cw * 0.16}px` }).setOrigin(0.5);
        const hintTxt = this.mechanicHint(t);
        card.add([g, thumb, name, reward, check]);
        if (hintTxt) {
          const hint = this.add.text(-cw / 2 + 12, -ch / 2 + 12, hintTxt, {
            fontFamily: "system-ui", fontStyle: "bold", fontSize: `${cw * 0.085}px`, color: "#7a4a1e",
            backgroundColor: "#ffe9c2", padding: { x: 7, y: 3 },
          }).setOrigin(0, 0);
          card.add(hint);
        }
      };
      draw();
      const hit = this.add.zone(x, y, cw, ch).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.handleTap(t, () => draw(), drawProgress, x, y - ch * 0.16));
    });

    relayoutOnResize(this);
  }

  private mechanicHint(t: WorldTask): string | null {
    if (t.frequencyPerDay > 1) return null; // shown in the corner badge instead
    if (t.mechanic === "timer") return `⏱ ${t.timerMinutes ?? "?"}m${t.music ? " 🎵" : ""}`;
    if (t.mechanic === "reps") return `🎯 ${t.reps ?? ""}`;
    if (t.mechanic === "checklist") return `☑ ${t.checklist?.length ?? 0} steps`;
    return null;
  }

  /** Route a card tap: frequency +1, instant toggle, or open a mechanic panel. */
  private handleTap(t: WorldTask, redraw: () => void, drawProgress: () => void, bx: number, by: number) {
    if (this.busy.has(t.id)) return;

    if (t.frequencyPerDay > 1) {
      // tap to add one; once full, a tap removes the most recent one
      if (t.doneCount >= t.frequencyPerDay) this.save(t, true, redraw, drawProgress, bx, by);
      else this.save(t, false, redraw, drawProgress, bx, by);
      return;
    }
    if (t.done) { this.save(t, true, redraw, drawProgress, bx, by); return; }
    if (t.mechanic === "tap") { this.save(t, false, redraw, drawProgress, bx, by); return; }
    // checklist / reps / timer: gate completion behind the interaction
    openTaskPanel(this, t, () => this.save(t, false, redraw, drawProgress, bx, by));
  }

  /** Persist a completion (`undo=false`) or removal (`undo=true`) + optimistic HUD. */
  private async save(t: WorldTask, undo: boolean, redraw: () => void, drawProgress: () => void, bx: number, by: number) {
    if (this.busy.has(t.id)) return;
    const data = this.registry.get(REGISTRY_DATA) as InitialGameData;
    const kidId = data?.kid?.id ?? "";
    const freq = t.frequencyPerDay > 1;

    this.busy.add(t.id);
    redraw();
    try {
      const res = undo ? await bridge.uncompleteTask(kidId, t) : await bridge.completeTask(kidId, t);
      if (res.ok) {
        if (freq) {
          t.doneCount = Math.max(0, t.doneCount + (undo ? -1 : 1));
          t.done = t.doneCount >= t.frequencyPerDay;
        } else {
          t.done = !undo;
          t.doneCount = t.done ? 1 : 0;
        }
        this.balance += undo ? -t.points : t.points;
        this.game.events.emit("hud:coins", this.balance);
        this.game.events.emit("hud:stars", this.tasks.filter((x) => x.done).length);
        if (!undo) this.burst(bx, by);
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
