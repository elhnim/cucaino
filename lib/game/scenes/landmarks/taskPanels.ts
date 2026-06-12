import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { panel } from "./chrome";
import { Metronome } from "../../systems/metronome";
import type { WorldTask } from "../../types";

/**
 * In-canvas modal interactions for rich task types (checklist / reps / timer +
 * metronome), mirroring the web TodoTaskCard mechanics. Each panel gates
 * completion behind its interaction, then calls `onComplete()` (which saves) and
 * closes. `onComplete` returns the optimistic done-state so the card can refresh.
 */

const FONT = "system-ui";
const INK = "#7a4a1e";

interface Modal {
  layer: Phaser.GameObjects.Container;
  pw: number;
  ph: number;
  close: () => void;
  body: Phaser.GameObjects.Container;
}

/** dim backdrop + centred card with a title and a ✕; blocks taps behind it. */
function modalFrame(scene: Phaser.Scene, title: string, icon: string, hFrac = 0.74): Modal {
  const v = viewport(scene);
  const layer = scene.add.container(0, 0).setDepth(500);
  const dim = scene.add.rectangle(v.cx, v.cy, v.w, v.h, 0x2a1a06, 0.55).setInteractive();
  const pw = Math.min(v.w * (v.portrait ? 0.92 : 0.7), 560);
  const ph = Math.min(v.h * hFrac, 720);
  const g = panel(scene, v.cx, v.cy, pw, ph, 0xfff8ec, 0xe0a655);
  const head = scene.add.text(v.cx, v.cy - ph / 2 + 34, `${icon}  ${title}`, {
    fontFamily: FONT, fontStyle: "bold", fontSize: "22px", color: INK,
    align: "center", wordWrap: { width: pw - 80 },
  }).setOrigin(0.5);
  const x = scene.add.text(v.cx + pw / 2 - 26, v.cy - ph / 2 + 26, "✕", {
    fontFamily: FONT, fontStyle: "bold", fontSize: "24px", color: "#b5572a",
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const body = scene.add.container(v.cx, v.cy).setDepth(501);
  layer.add([dim, g, head, x, body]);

  const close = () => { layer.destroy(); };
  x.on("pointerdown", close);
  return { layer, pw, ph, close, body };
}

/** a rounded pill button; returns the container so callers can disable/restyle it. */
function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  fill: number, txtColor: string, onTap: () => void, fontSize = 20,
) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.12).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, h / 2);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const t = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontStyle: "bold", fontSize: `${fontSize}px`, color: txtColor,
  }).setOrigin(0.5);
  c.add([g, t]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on("pointerdown", onTap);
  return { c, g, t, redraw: (newFill: number) => { g.clear();
    g.fillStyle(0x000000, 0.12).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, h / 2);
    g.fillStyle(newFill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2); } };
}

/** Entry point: open the right panel for a task. `onComplete` saves + returns. */
export function openTaskPanel(scene: Phaser.Scene, task: WorldTask, onComplete: () => void) {
  if (task.mechanic === "checklist") checklistPanel(scene, task, onComplete);
  else if (task.mechanic === "reps") repsPanel(scene, task, onComplete);
  else if (task.mechanic === "timer") timerPanel(scene, task, onComplete);
  else onComplete();
}

function finish(m: Modal, scene: Phaser.Scene, onComplete: () => void) {
  // brief "saving…" beat then close
  const v = viewport(scene);
  const ok = scene.add.text(v.cx, v.cy + m.ph / 2 - 40, "Saved! ⭐", {
    fontFamily: FONT, fontStyle: "bold", fontSize: "20px", color: "#2e9b3e",
  }).setOrigin(0.5).setDepth(502);
  m.layer.add(ok);
  onComplete();
  scene.time.delayedCall(420, () => m.close());
}

function checklistPanel(scene: Phaser.Scene, task: WorldTask, onComplete: () => void) {
  const items = task.checklist ?? [];
  const m = modalFrame(scene, task.name, task.icon || "☑️");
  const v = viewport(scene);
  const done = new Array(items.length).fill(false);
  const rowH = Math.min(54, (m.ph - 150) / Math.max(items.length, 1));
  const top = -m.ph / 2 + 80;

  const progress = scene.add.text(0, -m.ph / 2 + 56, "", {
    fontFamily: FONT, fontStyle: "bold", fontSize: "16px", color: "#a9742f",
  }).setOrigin(0.5);
  m.body.add(progress);
  const refreshProgress = () =>
    progress.setText(`${done.filter(Boolean).length} / ${items.length} done`);

  items.forEach((label, i) => {
    const y = top + i * rowH + rowH / 2;
    const box = scene.add.text(-m.pw / 2 + 40, y, "⬜", { fontSize: "26px" }).setOrigin(0.5);
    const txt = scene.add.text(-m.pw / 2 + 66, y, label, {
      fontFamily: FONT, fontSize: "18px", color: INK, wordWrap: { width: m.pw - 110 },
    }).setOrigin(0, 0.5);
    const hit = scene.add.zone(0, y, m.pw - 60, rowH).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      done[i] = !done[i];
      box.setText(done[i] ? "✅" : "⬜");
      txt.setColor(done[i] ? "#9aa0a6" : INK);
      refreshProgress();
      if (done.every(Boolean)) finish(m, scene, onComplete);
    });
    m.body.add([box, txt, hit]);
  });
  refreshProgress();
}

function repsPanel(scene: Phaser.Scene, task: WorldTask, onComplete: () => void) {
  const target = task.reps ?? 1;
  const m = modalFrame(scene, task.name, task.icon || "🎯", 0.64);
  let count = 0;

  const big = scene.add.text(0, -28, "", {
    fontFamily: FONT, fontStyle: "bold", fontSize: "64px", color: INK,
  }).setOrigin(0.5);
  const label = scene.add.text(0, 24, `${task.repLabel ?? "reps"}`, {
    fontFamily: FONT, fontStyle: "bold", fontSize: "18px", color: "#a9742f",
  }).setOrigin(0.5);
  m.body.add([big, label]);
  const refresh = () => big.setText(`${count} / ${target}`);
  refresh();

  const minus = button(scene, -90, 96, 70, 64, "−1", 0xf0e3c8, INK, () => {
    count = Math.max(0, count - 1); refresh();
  }, 26);
  const plus = button(scene, 70, 96, 150, 64, "+1", 0xf4b223, "#5a3a10", () => {
    count = Math.min(target, count + 1); refresh();
    if (count >= target) { plus.c.disableInteractive(); finish(m, scene, onComplete); }
  }, 26);
  m.body.add([minus.c, plus.c]);
}

function timerPanel(scene: Phaser.Scene, task: WorldTask, onComplete: () => void) {
  const mins = task.timerMinutes ?? 5;
  const totalMs = Math.max(1, mins) * 60_000;
  const m = modalFrame(scene, task.name, task.icon || "⏱️", task.music ? 0.84 : 0.66);
  const v = viewport(scene);

  let remaining = totalMs;
  let running = false;
  let lastTick = 0;
  let completed = false;

  const R = 78;
  const ringY = task.music ? -m.ph / 2 + 150 : -10;
  const ring = scene.add.graphics();
  const time = scene.add.text(0, ringY, "", {
    fontFamily: FONT, fontStyle: "bold", fontSize: "34px", color: INK,
  }).setOrigin(0.5);
  m.body.add([ring, time]);

  const fmt = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, "0")}`;
  };
  const drawRing = () => {
    ring.clear();
    ring.lineStyle(12, 0xeaddc2, 1).strokeCircle(0, ringY, R);
    const frac = 1 - remaining / totalMs;
    ring.lineStyle(12, 0x46c43a, 1);
    ring.beginPath();
    ring.arc(0, ringY, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
    ring.strokePath();
    time.setText(fmt(remaining));
  };
  drawRing();

  // optional metronome for music practice
  let metro: Metronome | null = null;
  let dots: Phaser.GameObjects.Arc[] = [];
  if (task.music) {
    const beats = parseInt((task.timeSignature ?? "4/4").split("/")[0], 10) || 4;
    metro = new Metronome(task.bpm ?? 80, beats);
    const dotY = -10;
    const bpmTxt = scene.add.text(0, -34, `♩ = ${metro.bpm}`, {
      fontFamily: FONT, fontStyle: "bold", fontSize: "22px", color: INK,
    }).setOrigin(0.5);
    const gap = 34;
    for (let i = 0; i < beats; i++) {
      const d = scene.add.circle((i - (beats - 1) / 2) * gap, dotY + 16, 9, i === 0 ? 0xf4b223 : 0xd9c7a6);
      dots.push(d);
      m.body.add(d);
    }
    metro.onBeat = (b) => dots.forEach((d, i) =>
      d.setScale(i === b ? 1.5 : 1).setFillStyle(i === 0 ? 0xf4b223 : 0xd9c7a6));
    const bMinus = button(scene, -120, 44, 56, 48, "−", 0xf0e3c8, INK, () => {
      metro!.setBpm(metro!.bpm - 5); bpmTxt.setText(`♩ = ${metro!.bpm}`);
    }, 24);
    const bPlus = button(scene, 120, 44, 56, 48, "+", 0xf0e3c8, INK, () => {
      metro!.setBpm(metro!.bpm + 5); bpmTxt.setText(`♩ = ${metro!.bpm}`);
    }, 24);
    const beatBtn = button(scene, 0, 92, 200, 48, "🎵 Start beat", 0xb9e3ff, "#1c4e74", () => {
      if (metro!.playing) { metro!.stop(); beatBtn.t.setText("🎵 Start beat"); }
      else { void metro!.start(); beatBtn.t.setText("🔇 Stop beat"); }
    }, 18);
    m.body.add([bpmTxt, bMinus.c, bPlus.c, beatBtn.c]);
  }

  const beep = () => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      o.start(); o.stop(ctx.currentTime + 1);
    } catch { /* ignore */ }
  };

  const complete = () => {
    if (completed) return;
    completed = true;
    running = false;
    metro?.destroy();
    beep();
    finish(m, scene, onComplete);
  };

  const startBtnY = task.music ? m.ph / 2 - 88 : 96;
  const startBtn = button(scene, 0, startBtnY, 220, 60, "▶ Start", 0x46c43a, "#0f3d10", () => {
    if (completed) return;
    running = !running;
    lastTick = scene.time.now;
    startBtn.t.setText(running ? "⏸ Pause" : "▶ Resume");
    startBtn.redraw(running ? 0xe0a655 : 0x46c43a);
  }, 22);
  m.body.add(startBtn.c);

  // a quiet "skip" so a stuck timer is never a dead end
  const skip = scene.add.text(0, startBtnY + 50, "mark done without timer", {
    fontFamily: FONT, fontSize: "13px", color: "#b89a6e",
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  skip.on("pointerdown", complete);
  m.body.add(skip);

  const ev = scene.time.addEvent({
    delay: 100, loop: true, callback: () => {
      if (!running || completed) { lastTick = scene.time.now; return; }
      const now = scene.time.now;
      remaining = Math.max(0, remaining - (now - lastTick));
      lastTick = now;
      drawRing();
      if (remaining <= 0) complete();
    },
  });
  m.layer.once(Phaser.GameObjects.Events.DESTROY, () => { ev.remove(); metro?.destroy(); });
}
