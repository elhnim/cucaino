"use client";

// Runs one retro game: a pixel-perfect 256x224 screen, a fixed 60 fps loop, keyboard + touch
// D-pad / A / B controls, and the title -> play -> pause -> game over flow with best scores.
import { useEffect, useRef, useState } from "react";
import { H, W, emptyInput, type Button, type GameInstance, type IO, type Input, type RetroGameDef } from "@/lib/retro/engine";
import { canvasGfx, webAudioSfx } from "@/lib/retro/canvas";
import { getMuted } from "@/lib/audio/sound-manager";

type Phase = "title" | "play" | "paused" | "over" | "won";

const KEYS: Record<string, Button | "start"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  z: "a",
  j: "a",
  " ": "a",
  x: "b",
  k: "b",
  Enter: "start",
  p: "start",
  Escape: "start",
};

/** one ticket buys this many plays (like coins in a real arcade) */
export const CREDITS_PER_TICKET = 3;

export function bestKey(kidId: string, gameId: string) {
  return `cucaino-retro-best:${kidId}:${gameId}`;
}
export function readBest(kidId: string, gameId: string): number {
  try {
    return Number(window.localStorage.getItem(bestKey(kidId, gameId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function RetroPlayer({
  game,
  kidId,
  onExit,
  credits: startCredits = Infinity,
  onBuyCredits,
}: {
  game: RetroGameDef;
  kidId: string;
  onExit: () => void;
  /** plays left before another ticket is needed (Infinity = free play) */
  credits?: number;
  /** ask the park to spend a ticket; resolves true if it did */
  onBuyCredits?: () => Promise<boolean>;
}) {
  const [credits, setCredits] = useState(startCredits);
  const creditsRef = useRef(startCredits);
  const buying = useRef(false);
  const buyRef = useRef(onBuyCredits);
  buyRef.current = onBuyCredits;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const phaseRef = useRef<Phase>("title");
  phaseRef.current = phase;
  const held = useRef<Record<Button, boolean>>({ left: false, right: false, up: false, down: false, a: false, b: false });
  const startPressed = useRef(false);
  const latched = useRef<Record<Button, boolean>>({ left: false, right: false, up: false, down: false, a: false, b: false });
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number; down: boolean } | null>(null);
  const scoreRef = useRef(0);
  const sfx = useRef<ReturnType<typeof webAudioSfx> | null>(null);

  useEffect(() => setBest(readBest(kidId, game.id)), [kidId, game.id]);

  // ── the game loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gfx = canvasGfx(ctx);
    const audio = webAudioSfx(getMuted);
    sfx.current = audio;
    let inst: GameInstance | null = null;
    let time = 0;
    let prevHeld: Record<Button, boolean> = { ...held.current };
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let ended = false;

    const start = () => {
      // every round uses a credit; out of credits -> ask for a ticket
      if (creditsRef.current <= 0) {
        if (buying.current || !buyRef.current) return;
        buying.current = true;
        void buyRef.current().then((ok) => {
          buying.current = false;
          if (ok) {
            creditsRef.current += CREDITS_PER_TICKET;
            setCredits(creditsRef.current);
          }
        });
        return;
      }
      creditsRef.current -= 1;
      setCredits(creditsRef.current);
      inst = game.create((Math.random() * 1e9) | 0);
      time = 0;
      scoreRef.current = 0;
      setScore(0);
      setNewBest(false);
      ended = false;
      setPhase("play");
    };
    const finish = (won: boolean) => {
      if (ended) return;
      ended = true;
      audio.play(won ? "win" : "die");
      const b = readBest(kidId, game.id);
      if (scoreRef.current > b) {
        try {
          window.localStorage.setItem(bestKey(kidId, game.id), String(scoreRef.current));
        } catch {
          /* private mode: best just isn't saved */
        }
        setBest(scoreRef.current);
        setNewBest(true);
      }
      window.setTimeout(() => setPhase(won ? "won" : "over"), 700);
    };
    const io: IO = {
      input: emptyInput(),
      sfx: audio,
      time: 0,
      score(p) {
        scoreRef.current = Math.max(0, scoreRef.current + p);
        setScore(scoreRef.current);
      },
      gameOver: () => finish(false),
      win: () => finish(true),
    };

    const drawTitle = () => {
      gfx.clear("#0d0b1a");
      for (let i = 0; i < 40; i++) gfx.rect((i * 53) % W, (i * 97 + Math.floor(performance.now() / 60)) % H, 1, 1, i % 3 ? "#4a4e6a" : "#ffffff");
      gfx.text(game.title, W / 2, 70, game.color, { align: "center", size: 2 });
      gfx.text(game.genre, W / 2, 96, "#9aa0b8", { align: "center" });
      if (Math.floor(performance.now() / 450) % 2) gfx.text("PRESS A TO START", W / 2, 150, "#ffffff", { align: "center" });
      gfx.text("CUCAINO ARCADE", W / 2, 204, "#ff6fcf", { align: "center" });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      const aDown = (held.current.a && !prevHeld.a) || latched.current.a;
      if (ph === "title") {
        if (aDown || startPressed.current) {
          audio.resume();
          start();
        }
        startPressed.current = false;
        latched.current.a = false;
        prevHeld = { ...held.current };
        drawTitle();
        return;
      }
      if (ph === "over" || ph === "won") {
        if (aDown || startPressed.current) start();
        startPressed.current = false;
        latched.current.a = false;
        prevHeld = { ...held.current };
        return;
      }
      if (startPressed.current) {
        startPressed.current = false;
        setPhase(ph === "paused" ? "play" : "paused");
        prevHeld = { ...held.current };
        return;
      }
      if (ph === "paused" || !inst) return;
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 4) {
        acc -= 1 / 60;
        steps++;
        const h = held.current;
        const L = latched.current;
        const input: Input = {
          // a press that already came back up still counts as held for this one step
          held: { left: h.left || L.left, right: h.right || L.right, up: h.up || L.up, down: h.down || L.down, a: h.a || L.a, b: h.b || L.b },
          pressed: {
            left: (h.left && !prevHeld.left) || L.left,
            right: (h.right && !prevHeld.right) || L.right,
            up: (h.up && !prevHeld.up) || L.up,
            down: (h.down && !prevHeld.down) || L.down,
            a: (h.a && !prevHeld.a) || L.a,
            b: (h.b && !prevHeld.b) || L.b,
          },
          tap: steps === 1 ? tapRef.current : null,
          pointer: pointerRef.current,
        };
        if (steps === 1) tapRef.current = null;
        latched.current = { left: false, right: false, up: false, down: false, a: false, b: false };
        prevHeld = { ...h };
        io.input = input;
        time += 1 / 60;
        io.time = time;
        inst.update(io);
      }
      if (steps === 4) acc = 0;
      inst.draw(gfx);
      gfx.camera(0, 0);
      gfx.alpha(1);
    };
    raf = requestAnimationFrame(frame);

    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (k === "start") {
        if (down) startPressed.current = true;
      } else {
        if (down && !held.current[k]) latched.current[k] = true;
        held.current[k] = down;
      }
    };
    const kd = key(true);
    const ku = key(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const blur = () => {
      held.current = { left: false, right: false, up: false, down: false, a: false, b: false };
      if (phaseRef.current === "play") setPhase("paused");
    };
    window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      audio.close();
    };
  }, [game, kidId]);

  // ── pointer on the screen (tap-to-aim games) ──
  const toGame = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const press = (b: Button, on: boolean) => {
    if (on && !held.current[b]) latched.current[b] = true;
    held.current[b] = on;
    if (on) sfx.current?.resume();
  };

  return (
    <div style={wrap}>
      <div style={topBar}>
        <button type="button" onClick={onExit} style={topBtn}>
          ← Arcade
        </button>
        <div style={{ flex: 1, textAlign: "center", color: game.color, fontWeight: 900, letterSpacing: 1 }}>{game.title}</div>
        <div style={{ color: "#fff", fontWeight: 900, fontVariantNumeric: "tabular-nums", minWidth: 100, textAlign: "right" }}>
          {score} <span style={{ color: "#9aa0b8", fontSize: 12 }}>BEST {Math.max(best, score)}</span>
          {Number.isFinite(credits) && <div style={{ color: credits > 0 ? "#5ef2ff" : "#ff6fcf", fontSize: 11 }}>{credits > 0 ? `${credits} PLAY${credits === 1 ? "" : "S"} LEFT` : "NEED A 🎟️"}</div>}
        </div>
        <button type="button" onClick={() => (startPressed.current = true)} style={topBtn} aria-label="Pause">
          {phase === "paused" ? "▶" : "⏸"}
        </button>
      </div>

      <div className="retro-body" style={body}>
        <div className="retro-screen" style={screenWrap}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={screen}
            onPointerDown={(e) => {
              const p = toGame(e);
              tapRef.current = p;
              pointerRef.current = { ...p, down: true };
              sfx.current?.resume();
              if (phaseRef.current === "title" || phaseRef.current === "over" || phaseRef.current === "won") startPressed.current = true;
            }}
            onPointerMove={(e) => (pointerRef.current = { ...toGame(e), down: e.buttons > 0 })}
            onPointerUp={(e) => (pointerRef.current = { ...toGame(e), down: false })}
            onPointerLeave={() => (pointerRef.current = null)}
          />
          {(phase === "over" || phase === "won" || phase === "paused") && (
            <div style={overlay}>
              <div style={{ fontSize: 30, fontWeight: 900, color: phase === "won" ? "#ffe14d" : phase === "paused" ? "#5ef2ff" : "#ff4a4a", letterSpacing: 2 }}>
                {phase === "won" ? "YOU WIN!" : phase === "paused" ? "PAUSED" : "GAME OVER"}
              </div>
              {phase !== "paused" && (
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>
                  Score {score}
                  {newBest && <div style={{ color: "#ffe14d" }}>★ NEW BEST! ★</div>}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={bigBtn} onClick={() => (startPressed.current = true)}>
                  {phase === "paused" ? "▶ Keep playing" : credits > 0 ? "↻ Play again" : `🎟️ 1 = ${CREDITS_PER_TICKET} more plays`}
                </button>
                <button type="button" style={{ ...bigBtn, background: "#4a4e6a" }} onClick={onExit}>
                  🕹️ Other games
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="retro-hint" style={{ color: "#9aa0b8", fontSize: 12, fontWeight: 800, textAlign: "center", padding: "0 12px" }}>
          {game.controls}
        </div>
        <div className="retro-pad" style={padRow}>
          {game.pad.dpad !== "none" ? <DPad mode={game.pad.dpad} press={press} /> : <div />}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            {game.pad.b && <PadButton label="B" hint={game.pad.b} color="#ff6fcf" onChange={(on) => press("b", on)} />}
            {game.pad.a && <PadButton label="A" hint={game.pad.a} color="#ffe14d" onChange={(on) => press("a", on)} big />}
          </div>
        </div>
      </div>
      <style>{`
        @media (orientation: landscape) and (min-width: 700px) {
          .retro-screen { width: min(calc(100vw - 420px), calc((100dvh - 90px) * 256 / 224)) !important; }
          .retro-hint { display: none; }
          .retro-pad { position: absolute; inset: auto 0 max(18px, env(safe-area-inset-bottom)) 0; max-width: none !important; padding: 0 max(18px, env(safe-area-inset-right)) 0 max(18px, env(safe-area-inset-left)) !important; pointer-events: none; }
          .retro-pad > * { pointer-events: auto; }
        }
      `}</style>
    </div>
  );
}

function DPad({ mode, press }: { mode: "4" | "lr" | "ud"; press: (b: Button, on: boolean) => void }) {
  // one touch surface: the finger's angle from the centre picks the direction(s), so sliding works
  const ref = useRef<HTMLDivElement | null>(null);
  const [dir, setDir] = useState<Record<string, boolean>>({});
  const apply = (e: React.PointerEvent | null) => {
    const next = { left: false, right: false, up: false, down: false };
    if (e && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dead = r.width * 0.12;
      if (mode !== "ud") {
        if (dx < -dead) next.left = true;
        if (dx > dead) next.right = true;
      }
      if (mode !== "lr") {
        if (dy < -dead) next.up = true;
        if (dy > dead) next.down = true;
      }
      // mostly-horizontal drags shouldn't also trigger up/down
      if (mode === "4" && Math.abs(dx) > Math.abs(dy) * 2) next.up = next.down = false;
      if (mode === "4" && Math.abs(dy) > Math.abs(dx) * 2) next.left = next.right = false;
    }
    (Object.keys(next) as Button[]).forEach((k) => press(k, next[k as keyof typeof next]));
    setDir(next);
  };
  const arm = (d: string, style: React.CSSProperties, glyph: string) => (
    <div style={{ position: "absolute", ...style, width: 52, height: 52, borderRadius: 12, background: dir[d] ? "#5ef2ff" : "#2d2a4d", color: dir[d] ? "#0d0b1a" : "#9aa0b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, boxShadow: "0 4px 0 #120f24" }}>
      {glyph}
    </div>
  );
  return (
    <div
      ref={ref}
      style={{ position: "relative", width: 156, height: 156, touchAction: "none", flexShrink: 0 }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        apply(e);
      }}
      onPointerMove={(e) => e.buttons > 0 && apply(e)}
      onPointerUp={() => apply(null)}
      onPointerCancel={() => apply(null)}
      aria-label="Direction pad"
    >
      {mode !== "ud" && arm("left", { left: 0, top: 52 }, "◀")}
      {mode !== "ud" && arm("right", { right: 0, top: 52 }, "▶")}
      {mode !== "lr" && arm("up", { left: 52, top: 0 }, "▲")}
      {mode !== "lr" && arm("down", { left: 52, bottom: 0 }, "▼")}
      <div style={{ position: "absolute", left: 52, top: 52, width: 52, height: 52, background: "#2d2a4d", borderRadius: 8 }} />
    </div>
  );
}

function PadButton({ label, hint, color, big, onChange }: { label: string; hint: string; color: string; big?: boolean; onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  const size = big ? 82 : 66;
  const set = (v: boolean) => {
    setOn(v);
    onChange(v);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        role="button"
        aria-label={`${label}: ${hint}`}
        style={{ width: size, height: size, borderRadius: 999, background: color, opacity: on ? 1 : 0.88, transform: on ? "translateY(3px)" : undefined, boxShadow: on ? "0 1px 0 rgba(0,0,0,0.4)" : "0 5px 0 rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: big ? 30 : 24, color: "#0d0b1a", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onPointerLeave={() => on && set(false)}
      >
        {label}
      </div>
      <div style={{ color: "#9aa0b8", fontSize: 11, fontWeight: 800 }}>{hint}</div>
    </div>
  );
}

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: "radial-gradient(circle at 50% 20%, #2a1f55, #0d0b1a 70%)", userSelect: "none", WebkitUserSelect: "none" };
const topBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "max(8px, env(safe-area-inset-top)) 12px 8px", flexShrink: 0 };
const topBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "8px 12px", fontWeight: 900, color: "#fff", background: "#2d2a4d", cursor: "pointer" };
const body: React.CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, position: "relative", minHeight: 0, padding: "0 10px" };
const screenWrap: React.CSSProperties = { position: "relative", width: "min(100%, calc((100dvh - 280px) * 256 / 224), 960px)", aspectRatio: "256 / 224", flexShrink: 1, minWidth: 256 };
const screen: React.CSSProperties = { width: "100%", height: "100%", imageRendering: "pixelated", borderRadius: 10, boxShadow: "0 0 0 4px #2d2a4d, 0 0 40px rgba(154,92,255,0.45)", touchAction: "none", background: "#0d0b1a", display: "block" };
const overlay: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(13,11,26,0.78)", borderRadius: 10, textAlign: "center", padding: 12 };
const bigBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "12px 16px", fontWeight: 900, fontSize: 15, color: "#0d0b1a", background: "#ffe14d", cursor: "pointer" };
const padRow: React.CSSProperties = { width: "100%", maxWidth: 720, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 14px max(14px, env(safe-area-inset-bottom))", gap: 8 };
