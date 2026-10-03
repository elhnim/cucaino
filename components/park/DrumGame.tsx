"use client";

// Join the drums with the Canopy Folk: a fire-lit clearing deep under giant rainforest trees (2D
// overlay, same shape as FishingGame.tsx — the 3D park keeps running behind it). Call & response:
// the lead drummer plays a short pattern on the log drums, then it's the kid's turn to copy it in
// order (no time pressure at all). Patterns grow from 2 to ~8 hits across levels. Mistakes are
// gentle — just a "listen again" and the same pattern replays. A free-play Jam mode is always one
// tap away. All the drum sounds are synthesised live with the Web Audio API — no audio files.
import { useEffect, useMemo, useRef, useState } from "react";
import { DRUM_FACTS } from "@/lib/park/registry/drumFacts";
import {
  beginLevels,
  enterJam,
  exitJam,
  hitDrum,
  initialDrumState,
  jamTapDuringCelebration,
  nextLevel,
  resumeLevels,
  retryLevel,
  tickDemo,
  type DrumId,
  type DrumState,
} from "@/lib/park/drumming/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";

export interface DrumGameProps {
  /** render the overlay (it renders nothing when false) */
  open: boolean;
  onClose: () => void;
  kidId: string;
  /** the Canopy Folk drummer who leads the circle — shown as a host line and in demo callouts */
  villagerName?: string;
  /** force day/night art; defaults to the device clock (night 19:00-06:00) */
  night?: boolean;
}

interface DrumProgress {
  bestLevel: number;
  stars: number;
}

function progressKey(kidId: string): string {
  return `cucaino:drums:${kidId}`;
}

function readProgress(kidId: string): DrumProgress {
  try {
    const raw = window.localStorage.getItem(progressKey(kidId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === "object") {
      const p = v as Partial<DrumProgress>;
      return { bestLevel: typeof p.bestLevel === "number" ? p.bestLevel : 0, stars: typeof p.stars === "number" ? p.stars : 0 };
    }
  } catch {
    /* ignore */
  }
  return { bestLevel: 0, stars: 0 };
}

function writeProgress(kidId: string, p: DrumProgress) {
  try {
    window.localStorage.setItem(progressKey(kidId), JSON.stringify(p));
  } catch {
    /* private mode: progress just won't be remembered next time */
  }
}

function defaultNight(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

const rng = () => Math.random();

// Each drum's own identity + its spot in the arc round the fire (percent of the scene, "lower
// half"). `scale` multiplies the shared responsive size (see `drumSizeFor`) so the low drum reads
// biggest and the shaker smallest, while every drum still clears the touch-target minimums.
const DRUMS: {
  id: DrumId;
  label: string;
  base: string;
  hi: string;
  skin: string;
  pattern: string;
  scale: number;
  left: number;
  bottom: number;
}[] = [
  { id: "low", label: "Low drum", base: "#8a4a2a", hi: "#c97a44", skin: "#e8c285", pattern: "#4a2a16", scale: 1, left: 12, bottom: 8 },
  { id: "mid", label: "Mid drum", base: "#9a3a3f", hi: "#d16066", skin: "#f0b9a0", pattern: "#5a1f24", scale: 0.92, left: 37, bottom: 5 },
  { id: "high", label: "High drum", base: "#2f7a5e", hi: "#49b185", skin: "#d8f0c8", pattern: "#1a4a38", scale: 0.86, left: 62, bottom: 5 },
  { id: "shaker", label: "Shaker", base: "#c98a1f", hi: "#ffd36b", skin: "#fff3cf", pattern: "#7a5410", scale: 0.8, left: 75, bottom: 9 },
];

/** the shared responsive drum size: ~100-150px on tablet widths, clamped down to ~80px on phones */
const DRUM_BASE_SIZE = "clamp(100px, 16vw, 150px)";

/** One BIG, carved rainforest log drum with a simple carved face + tribal band. Glows when "active". */
function DrumArt({ def, active }: { def: (typeof DRUMS)[number]; active: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}>
      {active && <ellipse cx="50" cy="46" rx="50" ry="46" fill={def.hi} opacity={0.4} className="dg-glowpulse" />}
      <ellipse cx="50" cy="92" rx="37" ry="8" fill="rgba(0,0,0,0.3)" />
      <path d="M11 40 L11 78 Q11 89 50 89 Q89 89 89 78 L89 40 Z" fill={def.base} />
      {/* tribal carved triangle band */}
      <g opacity={0.9}>
        {Array.from({ length: 7 }).map((_, i) => (
          <polygon key={i} points={`${16 + i * 10},72 ${22 + i * 10},72 ${19 + i * 10},63`} fill={def.pattern} />
        ))}
      </g>
      <path d="M11 40 Q50 53 89 40 L89 51 Q50 64 11 51 Z" fill="rgba(0,0,0,0.18)" />
      {/* carved cute face */}
      <circle cx="36" cy="57" r="3.4" fill="#2a1a12" />
      <circle cx="64" cy="57" r="3.4" fill="#2a1a12" />
      <circle cx="37" cy="56" r="1.1" fill="#fff" opacity={0.8} />
      <circle cx="65" cy="56" r="1.1" fill="#fff" opacity={0.8} />
      <path d="M37 68 Q50 75 63 68" stroke="#2a1a12" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="38" rx="39" ry="16" fill={active ? def.hi : def.skin} stroke={def.base} strokeWidth="3.4" />
      <ellipse cx="50" cy="36" rx="29" ry="10" fill="rgba(255,255,255,0.2)" />
    </svg>
  );
}

/** A Canopy Folk drummer: round head, flower crown, own little drum up front — bobs/dances with the beat. */
function DrummerArt({
  skin,
  shirt,
  crown,
  drum,
  size = 112,
  delay = 0,
  dancing = false,
  lead = false,
  leadLabel,
}: {
  skin: string;
  shirt: string;
  crown: string;
  drum: string;
  size?: number;
  delay?: number;
  dancing?: boolean;
  lead?: boolean;
  leadLabel?: string;
}) {
  return (
    <div aria-hidden style={{ width: size, position: "relative" }}>
      {lead && <div className="dg-leadglow" style={{ position: "absolute", inset: -size * 0.22, borderRadius: "50%", pointerEvents: "none" }} />}
      {lead && leadLabel && (
        <div style={{ ...leadBubble }} className="dg-popin">
          {leadLabel}
        </div>
      )}
      <div className={dancing ? "dg-dance" : "dg-bob"} style={{ animationDelay: `${delay}s` }}>
        <svg width={size} height={size * 1.3} viewBox="0 0 60 78">
          <ellipse cx="30" cy="63" rx="15" ry="5" fill="rgba(0,0,0,0.25)" />
          <path d="M14 66 Q14 42 30 42 Q46 42 46 66 Z" fill={shirt} />
          <circle cx="30" cy="27" r="17" fill={skin} />
          {[-24, -12, 0, 12, 24].map((deg, i) => (
            <ellipse
              key={i}
              cx={30 + 15 * Math.sin((deg * Math.PI) / 180)}
              cy={14 - 5 * Math.cos((deg * Math.PI) / 180)}
              rx="5.5"
              ry="4"
              fill={i % 2 === 0 ? crown : C.gold}
              transform={`rotate(${deg} ${30 + 15 * Math.sin((deg * Math.PI) / 180)} ${14 - 5 * Math.cos((deg * Math.PI) / 180)})`}
            />
          ))}
          <circle cx="30" cy="12" r="4" fill={crown} />
          <circle cx="24" cy="28" r="2.4" fill="#2a1a12" />
          <circle cx="36" cy="28" r="2.4" fill="#2a1a12" />
          <path d="M24 35 Q30 39 36 35" stroke="#2a1a12" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* their own little drum, held out front */}
          <ellipse cx="30" cy="73" rx="14" ry="3.6" fill="rgba(0,0,0,0.2)" />
          <path d="M19 59 L19 69 Q19 73 30 73 Q41 73 41 69 L41 59 Z" fill={drum} />
          <ellipse cx="30" cy="59" rx="11" ry="4.6" fill="rgba(255,255,255,0.3)" stroke={drum} strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

/** a simple broad jungle leaf, used in clusters to frame the scene's corners */
function Leaf({ color, width = 90, rotate = 0 }: { color: string; width?: number; rotate?: number }) {
  return (
    <svg width={width} height={width * 1.5} viewBox="0 0 60 90" aria-hidden style={{ transform: `rotate(${rotate}deg)`, transformOrigin: "bottom center" }}>
      <path d="M30 90 Q2 60 8 24 Q16 2 30 0 Q44 2 52 24 Q58 60 30 90 Z" fill={color} />
      <path d="M30 86 L30 8" stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
    </svg>
  );
}

/** a hanging vine from the canopy, a few leaf clusters along it, gently swaying */
function Vine({ left, length = 160, delay = 0, leafColor }: { left: string; length?: number; delay?: number; leafColor: string }) {
  return (
    <div aria-hidden className="dg-vine" style={{ position: "absolute", left, top: 0, animationDelay: `${delay}s`, transformOrigin: "top center" }}>
      <svg width="28" height={length} viewBox={`0 0 28 ${length}`}>
        <path d={`M14 0 Q22 ${length * 0.3} 10 ${length * 0.6} Q4 ${length * 0.8} 14 ${length}`} stroke="#2f5a34" strokeWidth="3" fill="none" strokeLinecap="round" />
        {[0.25, 0.5, 0.75].map((t, i) => (
          <ellipse key={i} cx={t < 0.6 ? 14 + 8 * t : 8} cy={length * t} rx="9" ry="5.5" fill={leafColor} transform={`rotate(${i % 2 === 0 ? 20 : -20} ${14} ${length * t})`} />
        ))}
      </svg>
    </div>
  );
}

/** a cosy treehouse tucked into the big tree, its window glowing warm against the sky */
function Treehouse({ night }: { night: boolean }) {
  return (
    <svg width="190" height="150" viewBox="0 0 190 150" aria-hidden style={{ overflow: "visible" }}>
      {/* supporting branch */}
      <path d="M0 108 Q50 118 95 112 Q140 106 190 96" stroke="#3a2715" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M14 100 L26 60 L95 24 L164 60 L176 100 Z" fill="#a9754a" />
      <path d="M14 100 L26 60 L95 24 L164 60 L176 100 L164 108 L95 36 L26 72 Z" fill="rgba(0,0,0,0.14)" />
      <polygon points="2,64 95,16 188,64 95,38" fill="#5a3a24" />
      <polygon points="2,64 95,16 95,38 2,64" fill="rgba(255,255,255,0.1)" />
      <rect x="26" y="100" width="138" height="12" fill="#4a3320" />
      <rect x="78" y="56" width="34" height="32" rx="4" fill={night ? "#ffe9a8" : "#d8b27a"} className={night ? "dg-winglow" : undefined} />
      <rect x="78" y="56" width="34" height="32" rx="4" fill="none" stroke="#3a2715" strokeWidth="3" />
      <line x1="95" y1="56" x2="95" y2="88" stroke="#3a2715" strokeWidth="2.4" />
      <line x1="78" y1="72" x2="112" y2="72" stroke="#3a2715" strokeWidth="2.4" />
      <path d="M8 118 L26 104 L26 114 L12 128 Z" fill="#4a3320" />
      <path d="M2 130 L22 116 L22 126 L6 140 Z" fill="#4a3320" />
    </svg>
  );
}

/** a pale waterfall glimpsed far behind the trees, with a soft shimmer and mist */
function Waterfall() {
  return (
    <div aria-hidden style={{ position: "relative", width: 34, height: 170 }}>
      <div className="dg-waterfall" style={{ position: "absolute", inset: 0, borderRadius: "0 0 50% 50% / 0 0 20% 20%", background: "linear-gradient(180deg, rgba(220,240,255,0.0), rgba(220,240,255,0.55) 20%, rgba(200,230,255,0.75) 70%, rgba(200,230,255,0.3))" }} />
      <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 60, height: 18, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(230,245,255,0.6), transparent 70%)" }} />
    </div>
  );
}

/** a toucan perched quietly, watching the drum circle */
function Toucan() {
  return (
    <svg width="76" height="70" viewBox="0 0 76 70" aria-hidden>
      {/* the branch it's perched on */}
      <path d="M0 58 Q38 66 76 56" stroke="#2f5a34" strokeWidth="6" fill="none" strokeLinecap="round" />
      <ellipse cx="34" cy="60" rx="16" ry="3.4" fill="rgba(0,0,0,0.2)" />
      <path d="M20 54 Q14 36 22 24 Q26 14 36 16 Q46 18 44 28 Q52 30 48 38 Q44 46 34 48 Q36 54 28 57 Z" fill="#171717" />
      <path d="M22 24 Q36 14 50 22 Q54 28 46 32 Q32 30 22 24 Z" fill="#ff9a3d" />
      <path d="M22 24 Q36 16 50 22" stroke="#e8822f" strokeWidth="1.4" fill="none" />
      <path d="M46 24 L58 26 L46 29 Z" fill="#ff9a3d" />
      <circle cx="37" cy="23" r="2.6" fill="#fff" />
      <circle cx="38" cy="23" r="1.3" fill="#101010" />
      <circle cx="29" cy="47" r="4.2" fill="#ff5d6e" />
      <path d="M22 50 Q28 56 20 58" stroke="#171717" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** a small glowing jungle flower — soft by day, luminous at night */
function GlowFlower({ x, y, color, night }: { x: number; y: number; color: string; night: boolean }) {
  return (
    <div aria-hidden className={night ? "dg-flowerglow" : undefined} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 14, height: 14 }}>
      <svg width="14" height="14" viewBox="0 0 14 14">
        {[0, 72, 144, 216, 288].map((deg) => (
          <ellipse key={deg} cx="7" cy="4" rx="2.6" ry="3.6" fill={color} opacity={night ? 0.95 : 0.55} transform={`rotate(${deg} 7 7)`} />
        ))}
        <circle cx="7" cy="7" r="1.8" fill={night ? C.gold : "#fff6d6"} opacity={night ? 1 : 0.7} />
      </svg>
    </div>
  );
}

const FIREFLIES: { x: number; y: number; d: number }[] = Array.from({ length: 10 }, (_, i) => ({
  x: 10 + ((i * 29) % 80),
  y: 20 + ((i * 17) % 50),
  d: (i % 5) * 0.5,
}));

const FLOWERS: { x: number; y: number; color: string }[] = [
  { x: 4, y: 6, color: "#ff7fbd" },
  { x: 18, y: 2, color: "#5ef2ff" },
  { x: 94, y: 8, color: "#ffd36b" },
  { x: 82, y: 2, color: "#b06bff" },
  { x: 50, y: 1, color: "#ff9a3d" },
];

type WebAudioCtx = AudioContext;

function getAudioCtx(ref: React.MutableRefObject<WebAudioCtx | null>): WebAudioCtx | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ref.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ref.current = new Ctor();
    }
    if (ref.current.state === "suspended") ref.current.resume().catch(() => {});
    return ref.current;
  } catch {
    return null;
  }
}

function synthDrum(ctx: WebAudioCtx, drum: DrumId) {
  try {
    const t0 = ctx.currentTime;
    if (drum === "shaker") {
      const dur = 0.16;
      const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 3200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      return;
    }
    const [f0, f1, dur]: [number, number, number] = drum === "low" ? [150, 62, 0.46] : drum === "mid" ? [260, 108, 0.32] : [430, 200, 0.2];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.82);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* audio is best-effort; never break the game over it */
  }
}

const EMPTY_HITS: Record<DrumId, number> = { low: 0, mid: 0, high: 0, shaker: 0 };

export function DrumGame({ open, onClose, kidId, villagerName, night: nightProp }: DrumGameProps) {
  const [state, setState] = useState<DrumState>(() => initialDrumState());
  const [hits, setHits] = useState<Record<DrumId, number>>(EMPTY_HITS);
  const [autoNight] = useState(defaultNight);
  const night = nightProp ?? autoNight;
  const leadName = villagerName ?? "Tamu";
  const ctxRef = useRef<WebAudioCtx | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const mistakeTimer = useRef<number | undefined>(undefined);
  const factIndexRef = useRef(0);

  const bump = (id: DrumId) => setHits((h) => ({ ...h, [id]: h[id] + 1 }));

  // fresh state (with this kid's saved best level / stars) every time the clearing opens
  useEffect(() => {
    if (!open) return;
    const p = readProgress(kidId);
    setState({ ...initialDrumState(), bestLevel: p.bestLevel, stars: p.stars, level: p.bestLevel });
    setHits(EMPTY_HITS);
  }, [open, kidId]);

  // close (and free) the audio context when we leave
  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );

  // drive the demo clock with real frames
  useEffect(() => {
    if (!open || state.phase !== "demo") {
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = ts - last;
      lastTsRef.current = ts;
      setState((s) => tickDemo(s, dt));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, state.phase]);

  // every demo "hit" that lights up also makes a sound and bounces that drum
  const prevActiveRef = useRef<DrumId | null>(null);
  useEffect(() => {
    if (state.phase === "demo" && state.activeDrum && state.activeDrum !== prevActiveRef.current) {
      const ctx = getAudioCtx(ctxRef);
      if (ctx) synthDrum(ctx, state.activeDrum);
      bump(state.activeDrum);
    }
    prevActiveRef.current = state.activeDrum;
  }, [state.phase, state.activeDrum]);

  // a level completed: save progress, celebrate, remember a fresh fact
  useEffect(() => {
    if (state.phase !== "correct") return;
    writeProgress(kidId, { bestLevel: state.bestLevel, stars: state.stars });
    factIndexRef.current = (factIndexRef.current + 1) % DRUM_FACTS.length;
    playSfx("win");
  }, [state.phase, state.bestLevel, state.stars, kidId]);

  // a gentle mistake: toast, then listen again on its own
  useEffect(() => {
    window.clearTimeout(mistakeTimer.current);
    if (state.phase === "mistake") {
      playSfx("wrong");
      mistakeTimer.current = window.setTimeout(() => setState((s) => retryLevel(s)), 1600);
    }
    return () => window.clearTimeout(mistakeTimer.current);
  }, [state.phase]);

  const fact = useMemo(() => DRUM_FACTS[factIndexRef.current] ?? DRUM_FACTS[0], [state.phase]);

  const tapDrum = (id: DrumId) => {
    if (state.phase === "demo") return; // watch first
    const ctx = getAudioCtx(ctxRef);
    if (ctx) synthDrum(ctx, id);
    bump(id);
    if (state.phase === "jam") {
      setState((s) => ({ ...s, activeDrum: id }));
      return;
    }
    if (state.phase === "correct") {
      setState((s) => jamTapDuringCelebration(s, id));
      return;
    }
    if (state.phase !== "input") return;
    playSfx("tap");
    setState((s) => hitDrum(s, id));
  };

  if (!open) return null;

  const prompt = usePromptText(state, leadName);

  return (
    <div style={wrap} className="dg-root">
      <style>{PARK_CSS + CSS}</style>

      <div style={scene}>
        <div style={night ? skyNight : sky} />
        {night &&
          FIREFLIES.map((f, i) => <div key={i} aria-hidden className="dg-firefly" style={{ ...firefly, left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}s` }} />)}

        {/* a waterfall glimpsed far behind the trees */}
        <div aria-hidden style={{ position: "absolute", left: "47%", top: "6%" }}>
          <Waterfall />
        </div>

        {/* giant rainforest canopy arching overhead, tall trunks framing either side */}
        <svg style={canopyLayer} viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
          <path
            d="M0 0 L0 12 Q8 18 16 11 Q24 20 33 10 Q42 19 50 9 Q58 19 67 10 Q76 20 84 11 Q92 18 100 12 L100 0 Z"
            fill={night ? "#0e1f14" : "#16331e"}
          />
          <path
            d="M0 0 L0 7 Q10 12 20 6 Q30 13 40 5 Q50 13 60 5 Q70 13 80 6 Q90 12 100 7 L100 0 Z"
            fill={night ? "#15321f" : "#224a2a"}
            opacity={0.9}
          />
        </svg>

        {/* big leaf clusters framing the corners */}
        <div aria-hidden style={{ position: "absolute", left: "-6%", top: "10%", display: "flex", gap: -20 }}>
          <Leaf color={night ? "#123c22" : "#1d5a30"} width={110} rotate={-18} />
          <Leaf color={night ? "#0e3019" : "#174826"} width={90} rotate={10} />
        </div>
        <div aria-hidden style={{ position: "absolute", right: "-8%", top: "8%", display: "flex", gap: -20 }}>
          <Leaf color={night ? "#0e3019" : "#174826"} width={90} rotate={-8} />
          <Leaf color={night ? "#123c22" : "#1d5a30"} width={120} rotate={22} />
        </div>

        {/* hanging vines, a toucan perched watching the circle */}
        <Vine left="20%" length={150} delay={0} leafColor={night ? "#123c22" : "#2f7a3e"} />
        <Vine left="63%" length={120} delay={0.6} leafColor={night ? "#123c22" : "#2f7a3e"} />
        <Vine left="78%" length={180} delay={1.1} leafColor={night ? "#123c22" : "#2f7a3e"} />
        <div aria-hidden style={{ position: "absolute", left: "68%", top: "19%" }}>
          <Toucan />
        </div>

        {/* a treehouse tucked into the big tree, left side — sits below the canopy silhouette
            so its lit window reads clearly against the open sky, not lost in the dark leaves */}
        <div aria-hidden style={{ position: "absolute", left: "1%", top: "15%" }}>
          <Treehouse night={night} />
        </div>

        <div aria-hidden style={{ ...trunk, left: "2%" }} />
        <div aria-hidden style={{ ...trunk, left: "88%", width: 46 }} />

        <div style={ground} />
        {FLOWERS.map((f, i) => (
          <GlowFlower key={i} x={f.x} y={100 - f.y - 4} color={f.color} night={night} />
        ))}

        {/* the Canopy Folk band, gathered further back round the fire — bigger, with drums of their own */}
        <div style={{ position: "absolute", left: "12%", bottom: "46%" }}>
          <DrummerArt skin="#c98a4a" shirt="#4a8f5a" crown="#ff7fbd" drum="#6a8f4a" delay={0} dancing={state.phase !== "ready" && state.phase !== "mistake"} />
        </div>
        <div style={{ position: "absolute", left: "48%", bottom: "55%", transform: "translateX(-50%)" }}>
          <DrummerArt
            skin="#8a5a32"
            shirt="#c95a3f"
            crown="#5ef2ff"
            drum="#8a4a2a"
            size={128}
            delay={0.3}
            dancing={state.phase !== "ready" && state.phase !== "mistake"}
            lead
            leadLabel={state.phase === "demo" ? `👀 Watch ${leadName}!` : undefined}
          />
        </div>
        <div style={{ position: "absolute", left: "78%", bottom: "46%" }}>
          <DrummerArt skin="#d6a35c" shirt="#8a5ac9" crown="#ffd36b" drum="#9a3a3f" delay={0.6} dancing={state.phase !== "ready" && state.phase !== "mistake"} />
        </div>

        {/* fire pit */}
        <div style={firePitGlow} aria-hidden />
        <div style={firePit} aria-hidden>
          <div style={fireRing} />
          <div className="dg-flicker" style={flame} />
          <div className="dg-flicker" style={{ ...flame, left: 10, animationDelay: "0.25s", transform: "scale(0.72)" }} />
          <div className="dg-flicker" style={{ ...flame, left: -10, animationDelay: "0.45s", transform: "scale(0.6)" }} />
        </div>

        {/* celebration sparkles */}
        {state.phase === "correct" && (
          <>
            {[10, 30, 55, 70, 85].map((x, i) => (
              <div key={i} aria-hidden className="dg-twinkle" style={{ ...sparkle, left: `${x}%`, top: `${20 + (i % 3) * 10}%`, animationDelay: `${i * 0.2}s` }}>
                ✨
              </div>
            ))}
          </>
        )}

        {/* the kid's own BIG drums, in an arc round the fire, closest to the viewer */}
        {DRUMS.map((d) => {
          const active = state.activeDrum === d.id;
          return (
            <button
              key={d.id}
              type="button"
              className="gp-press"
              onClick={() => tapDrum(d.id)}
              disabled={state.phase === "demo" || state.phase === "ready"}
              aria-label={d.label}
              style={{
                ...drumBtn,
                left: `${d.left}%`,
                bottom: `${d.bottom}%`,
                width: `calc(${DRUM_BASE_SIZE} * ${d.scale})`,
                height: `calc(${DRUM_BASE_SIZE} * ${d.scale})`,
              }}
            >
              <div key={hits[d.id]} className="dg-hitwrap" style={{ width: "100%", height: "100%", position: "relative" }}>
                {active && <div className="dg-ripple" aria-hidden />}
                <DrumArt def={d} active={active} />
              </div>
            </button>
          );
        })}
      </div>

      {/* top bar */}
      <div style={topBar}>
        <div style={{ ...glass({ edge: "gold", fill: "rgba(14,12,38,0.82)" }), ...chip }}>
          <span style={display(17)}>🥁 Drums with {leadName}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ ...glass({ edge: "cyan", fill: "rgba(16,14,40,0.82)" }), ...statChip }}>⭐ {state.stars}</div>
          <PanelClose onClose={onClose} label="Leave the clearing" />
        </div>
      </div>

      {/* prompt / action dock — kept well above the drum arc below */}
      <div style={dock}>
        {prompt && (
          <div
            style={{ ...glass({ edge: state.phase === "input" ? "gold" : "cyan", fill: "rgba(16,14,40,0.85)" }), ...promptChip, ...dockItem }}
            className={state.phase === "input" ? "dg-pulse" : undefined}
          >
            <span style={display(state.phase === "input" ? 19 : 15, state.phase === "input" ? C.gold : C.text)}>{prompt}</span>
          </div>
        )}

        {state.phase === "ready" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", ...dockItem }}>
            <GameButton
              big
              variant="primary"
              onClick={() => {
                playSfx("tap");
                setState((s) => (s.level > 0 ? resumeLevels(s, rng) : beginLevels(s, rng)));
              }}
            >
              🥁 {state.level > 0 ? `Keep drumming (Lvl ${state.level})` : "Start!"}
            </GameButton>
            <GameButton
              variant="secondary"
              onClick={() => {
                playSfx("tap");
                setState((s) => enterJam(s));
              }}
            >
              🎵 Free Jam
            </GameButton>
          </div>
        )}

        {state.phase === "jam" && (
          <GameButton
            style={dockItem}
            variant="secondary"
            onClick={() => {
              playSfx("tap");
              setState((s) => exitJam(s));
            }}
          >
            ◀ Back to levels
          </GameButton>
        )}

        {state.phase === "correct" && (
          <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.92)", blur: 12 }), ...factCard, ...dockItem }} className="gp-popin">
            <div style={display(16, C.gold)}>Level {state.level} done! 🎉</div>
            <div style={factText}>{fact.text}</div>
            <GameButton
              variant="primary"
              onClick={() => {
                playSfx("tap");
                setState((s) => nextLevel(s, rng));
              }}
            >
              Next pattern ▶
            </GameButton>
          </div>
        )}
      </div>
    </div>
  );
}

function usePromptText(state: DrumState, leadName: string): string | null {
  switch (state.phase) {
    case "ready":
      return "Tap Start, then watch the drummers!";
    case "demo":
      return `👀 Watch ${leadName}…`;
    case "input":
      return "Now you try! Copy the beat.";
    case "mistake":
      return "Nearly! Listen again 👂";
    case "jam":
      return "Tap any drum — just for fun! 🎶";
    case "correct":
      return null;
    default:
      return null;
  }
}

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, overflow: "hidden", fontFamily: FONT.body, touchAction: "none" };
const scene: React.CSSProperties = { position: "absolute", inset: 0, overflow: "hidden" };
const sky: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #2a2440 0%, #5a3a4a 45%, #8a4a3f 100%)" };
const skyNight: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #060712 0%, #0d1322 55%, #15131f 100%)" };
const ground: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, height: "64%", background: "linear-gradient(180deg, #2a3a1e 0%, #1c2814 100%)" };
const trunk: React.CSSProperties = { position: "absolute", top: "6%", bottom: "28%", width: 54, background: "linear-gradient(90deg, #2a1810, #4a2f1c 55%, #2a1810)", borderRadius: 6 };
const canopyLayer: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: 0, height: "16%", width: "100%" };
const firePit: React.CSSProperties = { position: "absolute", left: "50%", bottom: "40%", transform: "translateX(-50%)", width: 10, height: 44, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const firePitGlow: React.CSSProperties = { position: "absolute", left: "50%", bottom: "34%", transform: "translateX(-50%)", width: 280, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,160,60,0.4), transparent 70%)", pointerEvents: "none" };
const fireRing: React.CSSProperties = { position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 56, height: 16, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(60,40,20,0.9), rgba(30,20,10,0.7) 70%, transparent 100%)", boxShadow: "0 0 0 3px rgba(90,60,30,0.5)" };
const flame: React.CSSProperties = { position: "absolute", bottom: 4, width: 20, height: 38, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%", background: "linear-gradient(0deg, #ff7a1c, #ffd36b 70%, #fff3b0)", transformOrigin: "bottom center" };
// each drum is absolutely positioned (its own left/bottom/size from DRUMS) so they read as a loose
// arc round the fire rather than a flat row; kept well clear of the dock above (see `dock`).
const drumBtn: React.CSSProperties = { position: "absolute", background: "none", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" };
const firefly: React.CSSProperties = { position: "absolute", width: 5, height: 5, borderRadius: "50%", background: "#c9ffb0", boxShadow: "0 0 6px 2px rgba(201,255,176,0.8)", pointerEvents: "none" };
const topBar: React.CSSProperties = { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 8 };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "8px 14px", fontWeight: 900 };
const statChip: React.CSSProperties = { borderRadius: 14, padding: "8px 14px", fontWeight: 900, fontFamily: FONT.display, fontSize: 15 };
// pointerEvents "none" so the empty sides of this full-width strip never steal taps from the
// drum arc underneath — each child below opts back in with pointerEvents "auto".
const dock: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(27%, 185px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 3, padding: "0 16px", pointerEvents: "none" };
const dockItem: React.CSSProperties = { pointerEvents: "auto" };
const promptChip: React.CSSProperties = { borderRadius: 16, padding: "10px 22px", fontWeight: 900, textAlign: "center" };
const sparkle: React.CSSProperties = { position: "absolute", fontSize: 20, pointerEvents: "none" };
const factCard: React.CSSProperties = { width: "min(360px, 92vw)", borderRadius: 20, padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const factText: React.CSSProperties = { fontWeight: 700, fontFamily: FONT.body, fontSize: 14, color: C.text, lineHeight: 1.35 };
const leadBubble: React.CSSProperties = {
  position: "absolute",
  top: -34,
  left: "50%",
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  background: `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`,
  color: C.ink,
  fontWeight: 900,
  fontFamily: FONT.display,
  fontSize: 13,
  padding: "5px 12px",
  borderRadius: 999,
  boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
  zIndex: 1,
};

const CSS =
  "@keyframes dg-bob-kf { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }" +
  "@keyframes dg-dance-kf { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-11px) rotate(3deg); } }" +
  "@keyframes dg-flicker-kf { 0%,100% { transform: scaleY(1) scaleX(1); opacity: 1; } 50% { transform: scaleY(1.15) scaleX(0.9); opacity: 0.85; } }" +
  "@keyframes dg-twinkle-kf { 0%,100% { opacity: 0.2; transform: translateY(0) scale(0.9); } 50% { opacity: 1; transform: translateY(-6px) scale(1.1); } }" +
  "@keyframes dg-firefly-kf { 0%,100% { opacity: 0.25; transform: translate(0,0); } 50% { opacity: 1; transform: translate(6px,-8px); } }" +
  "@keyframes dg-pulse-kf { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }" +
  "@keyframes dg-glowpulse-kf { 0%,100% { opacity: 0.25; } 50% { opacity: 0.6; } }" +
  "@keyframes dg-leadglow-kf { 0%,100% { box-shadow: 0 0 0 0 rgba(255,211,107,0); background: radial-gradient(circle, rgba(255,211,107,0.0), transparent 70%); } 50% { background: radial-gradient(circle, rgba(255,211,107,0.45), transparent 70%); } }" +
  "@keyframes dg-hitpop-kf { 0% { transform: scale(0.82); } 35% { transform: scale(1.24); } 62% { transform: scale(0.93); } 100% { transform: scale(1); } }" +
  "@keyframes dg-ripple-kf { 0% { transform: translate(-50%,-50%) scale(0.3); opacity: 0.75; } 100% { transform: translate(-50%,-50%) scale(1.9); opacity: 0; } }" +
  "@keyframes dg-vine-kf { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }" +
  "@keyframes dg-waterfall-kf { 0%,100% { opacity: 0.75; } 50% { opacity: 1; } }" +
  "@keyframes dg-winglow-kf { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }" +
  "@keyframes dg-flowerglow-kf { 0%,100% { filter: drop-shadow(0 0 2px currentColor); opacity: 0.85; } 50% { filter: drop-shadow(0 0 6px currentColor); opacity: 1; } }" +
  ".dg-bob { animation: dg-bob-kf 2.2s ease-in-out infinite; }" +
  ".dg-dance { animation: dg-dance-kf 0.55s ease-in-out infinite; }" +
  ".dg-flicker { animation: dg-flicker-kf 0.4s ease-in-out infinite; }" +
  ".dg-twinkle { animation: dg-twinkle-kf 1.4s ease-in-out infinite; }" +
  ".dg-firefly { animation: dg-firefly-kf 3.2s ease-in-out infinite; }" +
  ".dg-pulse { animation: dg-pulse-kf 0.6s ease-in-out infinite; }" +
  ".dg-glowpulse { animation: dg-glowpulse-kf 0.5s ease-in-out infinite; }" +
  ".dg-leadglow { animation: dg-leadglow-kf 1.6s ease-in-out infinite; }" +
  ".dg-hitwrap { animation: dg-hitpop-kf 420ms cubic-bezier(.2,1.6,.4,1); transform-origin: center bottom; }" +
  ".dg-ripple { position: absolute; left: 50%; top: 50%; width: 60%; height: 60%; border-radius: 50%; border: 3px solid rgba(255,255,255,0.65); animation: dg-ripple-kf 500ms ease-out forwards; pointer-events: none; }" +
  ".dg-vine { animation: dg-vine-kf 4s ease-in-out infinite; }" +
  ".dg-waterfall { animation: dg-waterfall-kf 2.4s ease-in-out infinite; }" +
  ".dg-winglow { animation: dg-winglow-kf 2.6s ease-in-out infinite; }" +
  ".dg-flowerglow { color: #caffb0; animation: dg-flowerglow-kf 2.2s ease-in-out infinite; }" +
  "@media (prefers-reduced-motion: reduce) { .dg-bob, .dg-dance, .dg-flicker, .dg-twinkle, .dg-firefly, .dg-pulse, .dg-glowpulse, .dg-leadglow, .dg-hitwrap, .dg-ripple, .dg-vine, .dg-waterfall, .dg-winglow, .dg-flowerglow { animation: none !important; opacity: 1; } }";

export default DrumGame;
