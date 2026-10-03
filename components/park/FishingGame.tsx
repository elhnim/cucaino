"use client";

// Fishing at the lakeside pier: a big, bright, touch-first 2D mini-game (no three.js — the 3D
// park keeps running behind it, this is a flat overlay like HomeScreen/MysteryChest). Cast by
// tapping-and-holding, wait for the bobber to dip, tap the "Tap now!" cue, then tap/hold to reel
// it in. Every catch shows a card with a kid-level fact; the Fish Book remembers what's been
// caught so far, saved on-device per kid.
//
// The scene itself is a cheap candy-world painting of the Great Lake from the village pier: a
// snow-hinted ridge and soft green hills on the far shore, a couple of reed-thatched huts on
// stilts along the left bank, a few round trees, reeds + lily pads in the near water, lazy
// ripples/sparkles, a sun (or moon + stars at night) and an occasional heron gliding by. All of
// it is flat SVG/CSS behind the bobber, which (with the "Tap now!" cue) stays the visual focus.
import { useEffect, useMemo, useRef, useState } from "react";
import { FISH_FACTS, getFish, type FishDef } from "@/lib/park/registry/fishFacts";
import {
  backToIdle,
  initialFishingState,
  releaseCast,
  reelTap,
  startCast,
  tapEarly,
  tapNibble,
  tickNibble,
  tickReeling,
  tickWaiting,
  type FishingState,
} from "@/lib/park/fishing/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";

export interface FishingGameProps {
  /** render the overlay (it renders nothing when false) */
  open: boolean;
  onClose: () => void;
  kidId: string;
  /** the villager who runs the pier, if any — shown as a little host line */
  villagerName?: string;
  /** force day/night art; defaults to the device clock (night 19:00-06:00) */
  night?: boolean;
}

interface FishBookEntry {
  count: number;
  bestSizeCm: number;
}
type FishBook = Record<string, FishBookEntry>;

function bookKey(kidId: string): string {
  return `cucaino:fishbook:${kidId}`;
}

function readBook(kidId: string): FishBook {
  try {
    const raw = window.localStorage.getItem(bookKey(kidId));
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" ? (v as FishBook) : {};
  } catch {
    return {};
  }
}

function writeBook(kidId: string, book: FishBook) {
  try {
    window.localStorage.setItem(bookKey(kidId), JSON.stringify(book));
  } catch {
    /* private mode: this session's catches just won't be remembered next time */
  }
}

function defaultNight(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

const rng = () => Math.random();

/** A simple flat-colour fish shape, good enough for any "fish" kind at any size. */
function FishSVG({ colors, size = 64, mirrored = false }: { colors: FishDef["colors"]; size?: number; mirrored?: boolean }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 100 60" style={mirrored ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path d="M8 30 L30 16 Q0 30 30 44 Z" fill={colors.fin} />
      <ellipse cx="55" cy="30" rx="38" ry="20" fill={colors.body} />
      <path d="M32 30 Q55 14 78 30 Q55 46 32 30 Z" fill={colors.belly} opacity={0.85} />
      {colors.spot && <circle cx="68" cy="24" r="6" fill={colors.spot} opacity={0.8} />}
      <path d="M62 16 Q72 8 86 14 Q76 22 66 24 Z" fill={colors.fin} opacity={0.9} />
      <circle cx="82" cy="27" r="4.5" fill="#1c1430" />
      <circle cx="83.3" cy="25.6" r="1.4" fill="#fff" />
    </svg>
  );
}

function CatchArt({ fish, size = 72, silhouette = false }: { fish: FishDef; size?: number; silhouette?: boolean }) {
  if (silhouette) {
    return <div style={{ fontSize: size * 0.6, filter: "grayscale(1) brightness(0.55)", opacity: 0.55 }}>{fish.kind === "fish" ? "❔" : fish.emoji}</div>;
  }
  if (fish.kind === "fish") return <FishSVG colors={fish.colors} size={size} />;
  return <div style={{ fontSize: size * 0.72, lineHeight: 1 }}>{fish.emoji}</div>;
}

/** Classic red-and-white round bobber, small stem on top. */
function Bobber({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <defs>
        <linearGradient id="fg-bobber-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5d6e" />
          <stop offset="49%" stopColor="#ff5d6e" />
          <stop offset="51%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect x="13" y="1" width="2" height="5" fill="#8a2230" />
      <circle cx="14" cy="15" r="10" fill="url(#fg-bobber-grad)" stroke="#8a2230" strokeWidth="0.8" />
    </svg>
  );
}

/** A handful of round, candy-style trees along the hill line (cheap: divs, no per-tree SVG). */
const TREES: { x: number; y: number; s: number; c: string }[] = [
  { x: 7, y: 33.5, s: 16, c: "#6fbf6a" },
  { x: 29, y: 30, s: 13, c: "#7fcf72" },
  { x: 58, y: 31, s: 14, c: "#6fbf6a" },
  { x: 77, y: 29, s: 12, c: "#8fd57f" },
  { x: 93, y: 32, s: 15, c: "#6fbf6a" },
];

/** reed-thatched huts on stilts, left shore, drawn inline inside the horizon SVG (see below) */
const HUTS: { x: number }[] = [{ x: 13 }, { x: 20.5 }];

const STARS: { x: number; y: number; r: number; d: number }[] = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 37.3) % 96,
  y: (i * 13.7) % 32,
  r: 0.5 + ((i * 7) % 5) / 10,
  d: (i % 6) * 0.35,
}));

type CastHold = { downAt: number } | null;

export function FishingGame({ open, onClose, kidId, villagerName, night: nightProp }: FishingGameProps) {
  const [state, setState] = useState<FishingState>(() => initialFishingState());
  const [book, setBook] = useState<FishBook>({});
  const [showBook, setShowBook] = useState(false);
  const [autoNight] = useState(defaultNight);
  const night = nightProp ?? autoNight;
  const castHold = useRef<CastHold>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const reelHoldTimer = useRef<number | null>(null);
  const missTimer = useRef<number | undefined>(undefined);

  // fresh state + fish book every time the pier is opened
  useEffect(() => {
    if (!open) return;
    setState(initialFishingState());
    setBook(readBook(kidId));
    setShowBook(false);
  }, [open, kidId]);

  // drive the waiting / nibble / reeling clocks with real frames
  useEffect(() => {
    if (!open) return;
    if (state.phase !== "waiting" && state.phase !== "nibble" && state.phase !== "reeling") {
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = ts - last;
      lastTsRef.current = ts;
      setState((s) => {
        if (s.phase === "waiting") return tickWaiting(s, dt, rng);
        if (s.phase === "nibble") return tickNibble(s, dt);
        if (s.phase === "reeling") return tickReeling(s, dt);
        return s;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, state.phase]);

  // a catch lands in the fish book, once per catch
  useEffect(() => {
    if (state.phase !== "caught" || !state.result) return;
    const { fishId, sizeCm, isNew } = state.result;
    setBook((prev) => {
      const entry = prev[fishId];
      const next: FishBook = { ...prev, [fishId]: { count: (entry?.count ?? 0) + 1, bestSizeCm: Math.max(entry?.bestSizeCm ?? 0, sizeCm) } };
      writeBook(kidId, next);
      return next;
    });
    playSfx(isNew ? "win" : "sparkle");
  }, [state.phase, state.result, kidId]);

  // a gentle miss message, then back to idle on its own
  useEffect(() => {
    window.clearTimeout(missTimer.current);
    if (state.phase === "missed") {
      playSfx("wrong");
      missTimer.current = window.setTimeout(() => setState((s) => backToIdle(s)), 1700);
    }
    return () => window.clearTimeout(missTimer.current);
  }, [state.phase]);

  // clean up the hold-to-reel ticker on unmount / close
  useEffect(
    () => () => {
      if (reelHoldTimer.current != null) window.clearInterval(reelHoldTimer.current);
    },
    [],
  );

  const stopReelHold = () => {
    if (reelHoldTimer.current != null) {
      window.clearInterval(reelHoldTimer.current);
      reelHoldTimer.current = null;
    }
  };

  const onWaterDown = () => {
    if (showBook) return;
    if (state.phase === "idle") {
      castHold.current = { downAt: performance.now() };
      setState((s) => startCast(s));
      playSfx("tap");
      return;
    }
    if (state.phase === "waiting") {
      setState((s) => tapEarly(s));
      return;
    }
    if (state.phase === "nibble") {
      setState((s) => tapNibble(s));
      playSfx("tap");
      return;
    }
    if (state.phase === "reeling") {
      setState((s) => reelTap(s, rng));
      playSfx("tap");
      stopReelHold();
      reelHoldTimer.current = window.setInterval(() => setState((s) => reelTap(s, rng)), 180);
    }
  };

  const onWaterUp = () => {
    stopReelHold();
    if (state.phase === "casting" && castHold.current) {
      const holdMs = performance.now() - castHold.current.downAt;
      castHold.current = null;
      setState((s) => releaseCast(s, holdMs, rng));
      playSfx("tap");
    }
  };

  const caughtFish = state.result ? getFish(state.result.fishId) : undefined;
  const caughtCount = useMemo(() => Object.keys(book).length, [book]);

  const prompt = usePromptText(state);
  const bobberDip = state.phase === "nibble" || state.phase === "reeling";
  const bx = bobberX(state);
  const by = bobberY(state);
  const sag = state.phase === "reeling" ? 1.5 : state.phase === "idle" || state.phase === "casting" ? 1 : 5;
  const cpx = (ROD_TIP.x + bx) / 2;
  const cpy = (ROD_TIP.y + by) / 2 + sag;

  if (!open) return null;

  return (
    <div style={wrap} className="fg-root">
      <style>{PARK_CSS + CSS}</style>

      {/* the lake scene */}
      <div
        style={scene}
        onPointerDown={onWaterDown}
        onPointerUp={onWaterUp}
        onPointerLeave={state.phase === "reeling" ? onWaterUp : undefined}
        role="button"
        aria-label="The lake"
      >
        <div style={night ? skyNight : sky} />

        {/* sun / moon + stars */}
        {night ? (
          <>
            {STARS.map((s, i) => (
              <div key={i} aria-hidden className="fg-twinkle" style={{ ...star, left: `${s.x}%`, top: `${s.y}%`, width: 6 * s.r + 2, height: 6 * s.r + 2, animationDelay: `${s.d}s` }} />
            ))}
            <div aria-hidden style={moonHalo} />
            <div aria-hidden style={moon}>
              <div style={{ ...crater, left: 6, top: 10, width: 6, height: 6 }} />
              <div style={{ ...crater, left: 16, top: 18, width: 4, height: 4 }} />
              <div style={{ ...crater, left: 10, top: 20, width: 3, height: 3 }} />
            </div>
          </>
        ) : (
          <>
            <div aria-hidden className="fg-glow" style={sunHalo} />
            <div aria-hidden style={sun} />
          </>
        )}

        {/* a heron gliding by, now and then */}
        <div aria-hidden className="fg-bird" style={bird}>
          <svg width="40" height="22" viewBox="0 0 40 22">
            <path
              d="M2 18 Q8 8 14 13 Q17 6 24 4 Q20 9 22 12 Q28 10 36 13 Q29 13 24 16 Q18 20 11 17 Q6 20 2 18 Z"
              fill={night ? "#0c1626" : "#3c4a5c"}
              opacity={0.75}
            />
          </svg>
        </div>

        {/* far shore: snow-hinted ridge, soft hills, round trees, reed huts on stilts */}
        <svg style={horizonLayer} viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden>
          <path
            d="M-5 42 L4 19 L13 32 L23 11 L33 29 L45 7 L57 27 L67 15 L77 31 L87 13 L97 29 L105 23 L105 42 Z"
            fill={night ? "#273a55" : "#aecbdd"}
            opacity={0.6}
          />
          <path d={snowCap(23, 11)} fill={night ? "#3a4d6b" : "#f4f9ff"} opacity={0.9} />
          <path d={snowCap(45, 7)} fill={night ? "#3a4d6b" : "#f4f9ff"} opacity={0.9} />
          <path d={snowCap(87, 13)} fill={night ? "#3a4d6b" : "#f4f9ff"} opacity={0.9} />
          <path
            d="M-5 42 Q10 23 24 34 Q40 19 56 32 Q72 17 86 32 Q96 23 105 30 L105 42 Z"
            fill={night ? "#1d3a2c" : "#6fbf6a"}
          />
          <path
            d="M-5 42 Q16 29 34 38 Q52 25 70 36 Q86 27 105 36 L105 42 Z"
            fill={night ? "#173224" : "#5aa852"}
            opacity={0.95}
          />
          {HUTS.map((h, i) => (
            <g key={i}>
              <line x1={h.x - 1.5} y1="37.5" x2={h.x - 2.2} y2="41.5" stroke={night ? "#3a2a1a" : "#6b4a2f"} strokeWidth={0.5} />
              <line x1={h.x + 2.5} y1="37.5" x2={h.x + 3.2} y2="41.5" stroke={night ? "#3a2a1a" : "#6b4a2f"} strokeWidth={0.5} />
              <rect x={h.x - 3} y="33.5" width="7" height="4" fill={night ? "#2b2118" : "#8a6236"} />
              <polygon points={`${h.x - 4},33.5 ${h.x + 0.5},29 ${h.x + 5},33.5`} fill={night ? "#473826" : "#c99a5b"} />
              <rect x={h.x - 0.6} y="34.8" width="1.6" height="1.6" fill={night ? "#ffd36b" : "#5c3d1e"} opacity={night ? 0.95 : 0.5} />
            </g>
          ))}
        </svg>

        {TREES.map((t, i) => (
          <div key={i} aria-hidden style={{ position: "absolute", left: `${t.x}%`, top: `${t.y}%`, pointerEvents: "none" }}>
            <div style={{ width: Math.round(t.s * 0.22), height: Math.round(t.s * 0.4), background: night ? "#2a1d12" : "#6b4a2f", margin: "0 auto", borderRadius: 1 }} />
            <div
              style={{
                width: t.s,
                height: t.s,
                borderRadius: "50%",
                background: night ? "#1d3a2c" : t.c,
                marginTop: -Math.round(t.s * 0.62),
                boxShadow: "0 2px 5px rgba(0,0,0,0.25)",
              }}
            />
          </div>
        ))}

        <div style={night ? waterNight : water} />
        <div aria-hidden className="fg-ripple" style={{ ...ripple, left: "28%" }} />
        <div aria-hidden className="fg-ripple fg-ripple-b" style={{ ...ripple, left: "62%" }} />
        {SPARKLES.map((p, i) => (
          <div key={i} aria-hidden className="fg-twinkle" style={{ ...sparkle, left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s`, background: night ? "#bcd9ff" : "#fff6cf" }} />
        ))}

        {/* reeds + lily pads, near water */}
        <svg style={foregroundLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {REEDS.map((r, i) => (
            <path
              key={i}
              className="fg-reed"
              style={{ animationDelay: `${(i % 4) * 0.4}s` }}
              d={`M${r.x} 96 Q${r.x + r.lean} ${86 - r.h * 0.5} ${r.x + r.lean * 1.6} ${86 - r.h}`}
              stroke={night ? "#1f3d2c" : "#3f8f4a"}
              strokeWidth={1.1}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          {LILIES.map((p, i) => (
            <g key={i}>
              <ellipse cx={p.x} cy={p.y} rx={p.r} ry={p.r * 0.42} fill={night ? "#1d3a2c" : "#4fa255"} opacity={0.92} />
              <circle cx={p.x + p.r * 0.15} cy={p.y - p.r * 0.08} r={p.r * 0.22} fill={night ? "#3a2a4a" : "#ffb3d6"} opacity={0.85} />
            </g>
          ))}
        </svg>

        <div style={pier} />

        {/* rod + line + bobber */}
        <svg style={lineLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <line x1={ROD_BASE.x} y1={ROD_BASE.y} x2={ROD_TIP.x} y2={ROD_TIP.y} stroke="#5c3d1e" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={ROD_BASE.x - 1.6} cy={ROD_BASE.y - 1.6} r={1.6} fill="#5c3d1e" />
          <path d={`M ${ROD_TIP.x} ${ROD_TIP.y} Q ${cpx} ${cpy} ${bx} ${by}`} stroke="#6b4a33" strokeWidth={0.45} fill="none" opacity={0.85} />
        </svg>
        <div
          className={bobberDip ? "fg-bob fg-bob-dip" : state.phase === "waiting" ? "fg-bob" : undefined}
          style={{ position: "absolute", left: `${bx}%`, top: `${by}%`, transform: "translate(-50%,-50%)", pointerEvents: "none" }}
        >
          <Bobber />
        </div>
      </div>

      {/* top bar */}
      <div style={topBar}>
        <div style={{ ...glass({ edge: "cyan", fill: "rgba(14,12,38,0.82)" }), ...chip }}>
          <span style={display(18)}>🎣 Fishing{villagerName ? ` with ${villagerName}` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="gp-press" style={bookBtn} onClick={() => setShowBook(true)} aria-label="Fish Book">
            📖 {caughtCount}/{FISH_FACTS.length}
          </button>
          <PanelClose onClose={onClose} label="Leave the pier" />
        </div>
      </div>

      {/* prompt / action dock */}
      {!showBook && state.phase !== "caught" && (
        <div style={dock}>
          {prompt && (
            <div style={{ ...glass({ edge: state.phase === "nibble" ? "gold" : "cyan", fill: "rgba(16,14,40,0.85)" }), ...promptChip }} className={state.phase === "nibble" ? "fg-pulse" : undefined}>
              <span style={display(state.phase === "nibble" ? 22 : 16, state.phase === "nibble" ? C.gold : C.text)}>{prompt}</span>
            </div>
          )}
          {state.phase === "reeling" && (
            <div style={reelBarWrap}>
              <div style={{ ...reelBarFill, width: `${state.reelProgress}%` }} />
            </div>
          )}
          {state.phase === "idle" && (
            <GameButton big variant="primary" onClick={onWaterDown}>
              🎣 Cast!
            </GameButton>
          )}
          {state.phase === "missed" && state.missMessage && <div style={missToast}>{state.missMessage}</div>}
        </div>
      )}

      {/* catch card */}
      {state.phase === "caught" && caughtFish && state.result && (
        <div style={catchWrap}>
          <div style={{ ...glass({ edge: state.result.isNew ? "gold" : "cyan", fill: "rgba(18,16,44,0.92)", blur: 12 }), ...catchCard }} className="gp-popin">
            {state.result.isNew && <div style={newRibbon}>✨ New species!</div>}
            <CatchArt fish={caughtFish} size={96} />
            <div style={display(24)}>{caughtFish.name}</div>
            <div style={sizeText}>{state.result.sizeCm} cm</div>
            <div style={factBox}>{caughtFish.fact}</div>
            {state.result.releaseOnly && <div style={releaseNote}>🐢 Let's pop it back in gently — see you later, friend!</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <GameButton
                variant="primary"
                onClick={() => {
                  playSfx("tap");
                  setState((s) => backToIdle(s));
                }}
              >
                🎣 Keep fishing
              </GameButton>
              <GameButton variant="secondary" onClick={onClose}>
                Done
              </GameButton>
            </div>
          </div>
        </div>
      )}

      {/* fish book */}
      {showBook && (
        <div style={bookWrap} onPointerDown={(e) => e.target === e.currentTarget && setShowBook(false)}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.92)", blur: 12 }), ...bookCard }} className="gp-sheet">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={display(20)}>📖 Fish Book</div>
              <PanelClose onClose={() => setShowBook(false)} />
            </div>
            <div style={bookGrid} className="gp-scroll">
              {FISH_FACTS.map((f) => {
                const entry = book[f.id];
                const caught = !!entry;
                return (
                  <div key={f.id} style={bookTile}>
                    <CatchArt fish={f} size={56} silhouette={!caught} />
                    <div style={{ ...display(14, caught ? C.text : C.mute), textAlign: "center" }}>{caught ? f.name : "???"}</div>
                    {caught ? (
                      <>
                        <div style={bookCountText}>
                          Caught {entry.count}× · best {entry.bestSizeCm}cm
                        </div>
                        <div style={bookFactText}>{f.fact}</div>
                      </>
                    ) : (
                      <div style={bookFactText}>Catch one to find out!</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function usePromptText(state: FishingState): string | null {
  switch (state.phase) {
    case "idle":
      return "Tap the water to cast your line!";
    case "casting":
      return "Hold… let go to cast!";
    case "waiting":
      return "Shh... waiting for a bite.";
    case "nibble":
      return "Tap now!";
    case "reeling":
      return "Reel it in — tap or hold!";
    default:
      return null;
  }
}

/** bobber position (percent) — flies out from the pier as castPower grows, dips when nibbling/reeling */
function bobberX(s: FishingState): number {
  const base = 78 - s.castPower * 48;
  return Math.max(18, Math.min(74, base));
}
function bobberY(s: FishingState): number {
  if (s.phase === "idle" || s.phase === "casting") return 82;
  return 46;
}

/** the kid's own rod: a fixed diagonal from just off the bottom-right corner up to a tip above the pier */
const ROD_BASE = { x: 102, y: 104 };
const ROD_TIP = { x: 71, y: 61 };

function snowCap(peakX: number, peakY: number): string {
  return `M${peakX - 3} ${peakY + 7} L${peakX} ${peakY} L${peakX + 3} ${peakY + 7} Z`;
}

const SPARKLES: { x: number; y: number; d: number }[] = [
  { x: 14, y: 52, d: 0 },
  { x: 40, y: 58, d: 0.6 },
  { x: 54, y: 50, d: 1.2 },
  { x: 33, y: 66, d: 1.8 },
  { x: 60, y: 62, d: 0.3 },
];

const REEDS: { x: number; h: number; lean: number }[] = [
  { x: 3, h: 16, lean: 2 },
  { x: 6, h: 22, lean: -1.5 },
  { x: 9, h: 14, lean: 3 },
  { x: 90, h: 15, lean: -2.5 },
  { x: 95, h: 19, lean: 2 },
];

const LILIES: { x: number; y: number; r: number }[] = [
  { x: 10, y: 74, r: 5.5 },
  { x: 19, y: 82, r: 4.2 },
  { x: 88, y: 58, r: 4.8 },
];

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, overflow: "hidden", fontFamily: FONT.body, touchAction: "none" };
const scene: React.CSSProperties = { position: "absolute", inset: 0 };
const sky: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #bfe6ff 0%, #8fd0f5 38%, #6ec0e8 46%)" };
const skyNight: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #0a1428 0%, #132646 38%, #1c3657 46%)" };
const water: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: "40%", bottom: 0, background: "linear-gradient(180deg, #3f9fd6 0%, #2a7cb0 45%, #1c5c86 100%)" };
const waterNight: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: "40%", bottom: 0, background: "linear-gradient(180deg, #1c3657 0%, #142742 45%, #0c1a2c 100%)" };
const horizonLayer: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: 0, height: "42%", width: "100%", pointerEvents: "none" };
const foregroundLayer: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
const sun: React.CSSProperties = { position: "absolute", left: "13%", top: "9%", width: 64, height: 64, borderRadius: "50%", background: "radial-gradient(circle at 35% 32%, #fff6cf, #ffd36b 55%, #f5b400 100%)", boxShadow: "0 0 24px rgba(255,211,107,0.7)" };
const sunHalo: React.CSSProperties = { position: "absolute", left: "13%", top: "9%", width: 64, height: 64, borderRadius: "50%", transform: "translate(-18%,-18%) scale(2.2)", background: "radial-gradient(circle, rgba(255,230,160,0.5), transparent 70%)", pointerEvents: "none" };
const moon: React.CSSProperties = { position: "absolute", left: "13%", top: "9%", width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle at 35% 32%, #f3f6ff, #cfd9ef 60%, #aab6d6 100%)", boxShadow: "0 0 18px rgba(200,215,255,0.5)", overflow: "hidden" };
const moonHalo: React.CSSProperties = { position: "absolute", left: "13%", top: "9%", width: 46, height: 46, borderRadius: "50%", transform: "translate(-28%,-28%) scale(2.6)", background: "radial-gradient(circle, rgba(190,210,255,0.3), transparent 70%)", pointerEvents: "none" };
const crater: React.CSSProperties = { position: "absolute", borderRadius: "50%", background: "rgba(140,155,190,0.45)" };
const star: React.CSSProperties = { position: "absolute", borderRadius: "50%", background: "#fff", pointerEvents: "none" };
const sparkle: React.CSSProperties = { position: "absolute", width: 5, height: 5, borderRadius: "50%", pointerEvents: "none" };
const bird: React.CSSProperties = { position: "absolute", top: "20%", left: "-10%", pointerEvents: "none" };
const pier: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: "34%",
  height: "30%",
  background: "repeating-linear-gradient(90deg, #8a6236 0 14px, #724e29 14px 18px)",
  borderTop: "4px solid #5c3d1e",
  borderTopLeftRadius: 10,
};
const lineLayer: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
const ripple: React.CSSProperties = { position: "absolute", top: "48%", width: 46, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.35)", pointerEvents: "none" };
const topBar: React.CSSProperties = { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 8 };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "8px 14px", fontWeight: 900 };
const bookBtn: React.CSSProperties = {
  ...glass({ edge: "gold", fill: "rgba(16,14,40,0.82)" }),
  borderRadius: 14,
  padding: "8px 14px",
  fontWeight: 900,
  fontSize: 14.5,
  fontFamily: FONT.display,
  cursor: "pointer",
};
const dock: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(18px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, zIndex: 3, padding: "0 16px" };
const promptChip: React.CSSProperties = { borderRadius: 16, padding: "10px 22px", fontWeight: 900, textAlign: "center" };
const reelBarWrap: React.CSSProperties = { width: "min(320px, 80vw)", height: 18, borderRadius: 999, background: "rgba(10,9,28,0.55)", border: `1.5px solid ${alpha(C.gold, 0.5)}`, overflow: "hidden" };
const reelBarFill: React.CSSProperties = { height: "100%", background: `linear-gradient(90deg, ${C.gold}, ${C.goldHi})`, transition: "width 90ms linear" };
const missToast: React.CSSProperties = { ...glass({ edge: "soft", fill: "rgba(16,14,40,0.85)" }), borderRadius: 14, padding: "8px 16px", fontWeight: 800, fontFamily: FONT.body, color: C.text, textAlign: "center", maxWidth: "88vw" };
const catchWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const catchCard: React.CSSProperties = { width: "min(380px, 100%)", borderRadius: 24, padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", position: "relative" };
const newRibbon: React.CSSProperties = { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`, color: C.ink, fontWeight: 900, fontFamily: FONT.display, fontSize: 13, padding: "4px 14px", borderRadius: 999, boxShadow: "0 4px 10px rgba(0,0,0,0.35)" };
const sizeText: React.CSSProperties = { fontWeight: 800, fontFamily: FONT.body, color: C.dim, fontSize: 14.5 };
const factBox: React.CSSProperties = { fontWeight: 700, fontFamily: FONT.body, fontSize: 14.5, color: C.text, lineHeight: 1.35, padding: "2px 4px" };
const releaseNote: React.CSSProperties = { fontWeight: 800, fontFamily: FONT.body, fontSize: 13, color: C.success, background: "rgba(79,227,160,0.12)", borderRadius: 12, padding: "8px 12px" };
const bookWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const bookCard: React.CSSProperties = { width: "min(680px, 100%)", maxHeight: "82dvh", borderRadius: 24, padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const bookGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, overflowY: "auto", paddingRight: 4 };
const bookTile: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "12px 8px",
  borderRadius: 14,
  background: "rgba(34,30,78,0.55)",
  border: `1px solid ${C.line}`,
  minHeight: 150,
};
const bookCountText: React.CSSProperties = { fontSize: 11, fontWeight: 800, fontFamily: FONT.body, color: C.dim, textAlign: "center" };
const bookFactText: React.CSSProperties = { fontSize: 11, fontFamily: FONT.body, color: C.mute, textAlign: "center" };

const CSS =
  "@keyframes fg-bob { 0%,100% { transform: translate(-50%,-50%) translateY(0); } 50% { transform: translate(-50%,-50%) translateY(-5px); } }" +
  "@keyframes fg-dip { 0%,100% { transform: translate(-50%,-50%) translateY(0) scale(1); } 40% { transform: translate(-50%,-50%) translateY(10px) scale(0.92); } }" +
  "@keyframes fg-ripple { 0% { transform: scale(0.5); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }" +
  "@keyframes fg-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }" +
  "@keyframes fg-twinkle { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }" +
  "@keyframes fg-sway { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(3deg); } }" +
  "@keyframes fg-bird-fly { 0% { left: -10%; opacity: 0; } 4% { opacity: 0.85; } 38% { left: 112%; opacity: 0.85; } 42%,100% { left: 112%; opacity: 0; } }" +
  "@keyframes fg-sun-glow { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }" +
  ".fg-bob { animation: fg-bob 1.8s ease-in-out infinite; }" +
  ".fg-bob-dip { animation: fg-dip 0.5s ease-in-out infinite; }" +
  ".fg-ripple { animation: fg-ripple 2.6s ease-out infinite; }" +
  ".fg-ripple-b { animation-delay: 1.1s; }" +
  ".fg-pulse { animation: fg-pulse 0.55s ease-in-out infinite; }" +
  ".fg-twinkle { animation: fg-twinkle 2.4s ease-in-out infinite; }" +
  ".fg-reed { transform-origin: bottom center; animation: fg-sway 3.2s ease-in-out infinite; }" +
  ".fg-bird { animation: fg-bird-fly 26s linear infinite; }" +
  ".fg-glow { animation: fg-sun-glow 4s ease-in-out infinite; }" +
  "@media (prefers-reduced-motion: reduce) { .fg-bob, .fg-bob-dip, .fg-ripple, .fg-pulse, .fg-twinkle, .fg-reed, .fg-bird, .fg-glow { animation: none !important; opacity: 1; } .fg-bird { opacity: 0 !important; } }";

export default FishingGame;
