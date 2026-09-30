"use client";

// Shared bits for the AI Arcade games: the dark "magical game" stage, glass panels, chunky
// game buttons, loading, errors, sparks, celebrations. Same look as Cucaino Park's own UI
// (components/park/ui/theme.ts): night-indigo glass, gold/cyan edges, Lilita One display
// face. Everything is thumb-sized (min 48px tall) and single-column so it works at 390px.
//
// NOTE: games also render inside the park's GameStage, whose content area is a light
// `.candy-skin` box with a few !important overrides on Tailwind classes (bg-white,
// rounded-*, shadow-*, text-gray-*). The arcade therefore styles with its own `arc-*`
// classes + inline styles and never relies on those Tailwind names.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ArcadeResult } from "@/lib/actions/arcade";
import { C, FONT, PARK_CSS, alpha } from "@/components/park/ui/theme";

/**
 * Server actions REJECT (not return ok:false) when the network drops or a new deploy
 * invalidates the action id. Turn that into a normal error so no game gets stuck on its
 * "thinking" screen.
 */
export async function safeAction<T>(call: () => Promise<ArcadeResult<T>>): Promise<ArcadeResult<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, error: "Can't reach the Arcade right now — check the internet and try again. No sparks were used." };
  }
}

/** The kid's sparks, kept locally so the counter drops the moment a game is paid for. */
export function useSparks(initial: number): [number, (next: number | undefined) => void] {
  const [sparks, setSparks] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    // parent re-fetched the balance (e.g. after a star swap)
    setPrevInitial(initial);
    setSparks(initial);
  }
  return [sparks, (next) => { if (typeof next === "number") setSparks(next); }];
}

/** A re-entrancy guard for async taps (double taps must never double-charge or double-submit). */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return [busy, run];
}

// ─────────────────────────────── theme ───────────────────────────────

export type ArcTone = "rose" | "amber" | "green" | "cyan" | "violet";

/** accent (glows, selected edges), deep (pressed/gradient bottoms), glow2 (second nebula) */
export const TONES: Record<ArcTone, { accent: string; deep: string; glow2: string }> = {
  rose: { accent: "#ff86bd", deep: "#e0407f", glow2: "#b06bff" },
  amber: { accent: "#ffc15e", deep: "#e8891c", glow2: "#ff7a3d" },
  green: { accent: "#4fe3a0", deep: "#159a63", glow2: "#5ef2ff" },
  cyan: { accent: "#5ef2ff", deep: "#1fb5d6", glow2: "#7d8cff" },
  violet: { accent: "#c29bff", deep: "#7c4dea", glow2: "#ff86bd" },
};

export const ARC_FONT = FONT;
export const ARC = C;

/** paper + ink for in-world props (sketchbooks, notes, storybook pages) */
export const PAPER = { cream: "#fff8e8", note: "#fffbea", sticky: "#ffe97f", ink: "#2b2140", inkSoft: "#5b4a6b", inkBrown: "#6a3512" } as const;

const ARC_CSS = `
.candy-skin:has(.arc-root){background:radial-gradient(120% 60% at 50% 0%, #2c2572, #120f33 60%) !important;color:${C.text};}
.arc-root{position:relative;isolation:isolate;border-radius:26px;padding:16px 12px 24px;color:${C.text};font-family:${FONT.body};overflow:hidden;
  box-shadow:inset 0 0 0 1.5px rgba(160,190,255,0.2), inset 0 1px 0 rgba(255,255,255,0.12), 0 14px 40px rgba(0,0,0,0.45);}
@media (min-width:640px){.arc-root{padding:22px 20px 28px;}}
.arc-root *{box-sizing:border-box;}
.arc-stars,.arc-stars::after{position:absolute;inset:0;pointer-events:none;z-index:0;content:"";}
.arc-stars{opacity:.75;background-image:
  radial-gradient(circle at 22px 34px, rgba(255,255,255,.95) 0 1.1px, transparent 1.9px),
  radial-gradient(circle at 150px 86px, rgba(255,255,255,.7) 0 .9px, transparent 1.6px),
  radial-gradient(circle at 96px 170px, rgba(190,225,255,.85) 0 1.3px, transparent 2px),
  radial-gradient(circle at 210px 214px, rgba(255,233,168,.85) 0 1px, transparent 1.7px),
  radial-gradient(circle at 60px 226px, rgba(255,255,255,.6) 0 .8px, transparent 1.4px),
  radial-gradient(circle at 190px 20px, rgba(255,210,240,.7) 0 .9px, transparent 1.6px);
  background-size:240px 240px;}
.arc-stars::after{opacity:.8;background-image:
  radial-gradient(circle at 40px 60px, rgba(255,255,255,.9) 0 1.4px, transparent 2.2px),
  radial-gradient(circle at 120px 20px, rgba(170,240,255,.9) 0 1.2px, transparent 2px),
  radial-gradient(circle at 150px 140px, rgba(255,255,255,.8) 0 1px, transparent 1.8px);
  background-size:173px 173px;background-position:37px 11px;animation:arc-twinkle 3.8s ease-in-out infinite alternate;}
.arc-body{position:relative;z-index:1;max-width:560px;margin:0 auto;}
.arc-body.wide{max-width:640px;}
.arc-display{font-family:${FONT.display};font-weight:400 !important;letter-spacing:.4px;line-height:1.12;}
.arc-root button{-webkit-tap-highlight-color:transparent;}
.arc-root button:focus-visible,.arc-root summary:focus-visible,.arc-root input:focus-visible,.arc-root textarea:focus-visible{outline:3px solid ${C.cyan};outline-offset:3px;}

/* chunky 3D game button */
.arc-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:56px;padding:0 20px;border-radius:18px;border:0;
  font-family:${FONT.display};font-weight:400 !important;font-size:20px;letter-spacing:.5px;line-height:1.1;text-align:center;
  background:var(--b-bg);color:var(--b-fg);text-shadow:var(--b-ts);cursor:pointer;touch-action:manipulation;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.45), inset 0 -4px 0 rgba(0,0,0,.2), inset 0 0 0 1.5px var(--b-ring), 0 5px 0 var(--b-edge), 0 10px 20px rgba(0,0,0,.4);
  transition:transform 110ms ease, box-shadow 110ms ease, filter 140ms ease;}
.arc-btn::after{content:"";position:absolute;left:10px;right:10px;top:4px;height:38%;border-radius:12px 12px 20px 20px;background:linear-gradient(rgba(255,255,255,.32),rgba(255,255,255,0));pointer-events:none;}
.arc-btn.block{display:flex;width:100%;}
.arc-btn.big{min-height:64px;font-size:22px;border-radius:20px;}
.arc-btn.small{min-height:46px;font-size:16px;padding:0 14px;border-radius:14px;}
.arc-btn.wrap{white-space:normal;}
.arc-btn:hover:not(:disabled){filter:brightness(1.08) saturate(1.05);}
.arc-btn:active:not(:disabled){transform:translateY(4px) scale(.99);box-shadow:inset 0 2px 0 rgba(255,255,255,.35), inset 0 -2px 0 rgba(0,0,0,.2), inset 0 0 0 1.5px var(--b-ring), 0 1px 0 var(--b-edge), 0 4px 10px rgba(0,0,0,.4);}
.arc-btn:disabled{cursor:not-allowed;background:linear-gradient(rgba(74,72,112,.75),rgba(52,50,84,.8));color:rgba(222,226,248,.62);text-shadow:none;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.1), 0 3px 0 rgba(10,9,28,.7);}
.arc-btn:disabled::after{opacity:.3;}

/* glass selection tile */
.arc-tile{position:relative;border-radius:18px;border:2px solid rgba(160,190,255,.22);background:linear-gradient(180deg, rgba(48,44,108,.72), rgba(26,23,64,.82));color:${C.text};
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1), 0 4px 0 rgba(8,6,24,.7), 0 8px 16px rgba(0,0,0,.25);cursor:pointer;touch-action:manipulation;
  transition:transform 120ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;}
.arc-tile:hover:not(:disabled){border-color:rgba(160,190,255,.45);}
.arc-tile:active:not(:disabled){transform:translateY(3px);box-shadow:inset 0 1px 0 rgba(255,255,255,.1), 0 1px 0 rgba(8,6,24,.7);}
.arc-tile.on{border-color:var(--arc-accent);background:linear-gradient(180deg, color-mix(in srgb, var(--arc-accent) 34%, #2a2470), color-mix(in srgb, var(--arc-accent) 16%, #17143f));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.2), 0 4px 0 color-mix(in srgb, var(--arc-accent) 40%, #0a0820), 0 0 18px color-mix(in srgb, var(--arc-accent) 50%, transparent);}
.arc-tile.on .arc-tick{opacity:1;transform:scale(1);}
.arc-tick{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;
  background:var(--arc-accent);color:#120f33;box-shadow:0 0 10px var(--arc-accent);opacity:0;transform:scale(.4);transition:all 160ms cubic-bezier(.3,1.6,.5,1);}

/* inputs */
.arc-input{width:100%;min-height:54px;padding:0 16px;border-radius:16px;border:2px solid rgba(160,190,255,.3);background:rgba(8,7,28,.62);color:${C.text};
  font-family:${FONT.body};font-weight:800;font-size:18px;box-shadow:inset 0 2px 8px rgba(0,0,0,.4);transition:border-color 150ms, box-shadow 150ms;}
textarea.arc-input{padding:12px 14px;min-height:0;resize:vertical;line-height:1.45;font-size:16px;}
.arc-input::placeholder{color:rgba(206,212,245,.6);font-weight:700;}
.arc-input:focus{outline:none;border-color:var(--arc-accent);box-shadow:inset 0 2px 8px rgba(0,0,0,.4), 0 0 0 3px color-mix(in srgb, var(--arc-accent) 30%, transparent), 0 0 16px color-mix(in srgb, var(--arc-accent) 40%, transparent);}

/* glass chip */
.arc-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-weight:900;font-size:14px;line-height:1.2;
  background:rgba(255,255,255,.08);border:1.5px solid rgba(160,190,255,.26);color:${C.text};}

/* details */
.arc-details>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;min-height:32px;}
.arc-details>summary::-webkit-details-marker{display:none;}
.arc-details>summary::after{content:"▾";margin-left:auto;font-size:18px;opacity:.8;transition:transform 180ms;}
.arc-details[open]>summary::after{transform:rotate(180deg);}

/* motion */
@keyframes arc-twinkle{from{opacity:.25}to{opacity:.9}}
@keyframes arc-pop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}
@keyframes arc-rise{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
@keyframes arc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes arc-wobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-4deg)}40%{transform:rotate(4deg)}60%{transform:rotate(-2deg)}80%{transform:rotate(2deg)}}
@keyframes arc-spin{to{transform:rotate(360deg)}}
@keyframes arc-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes arc-dot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
@keyframes arc-fall{0%{transform:translate3d(0,-30px,0) rotate(0);opacity:1}85%{opacity:1}100%{transform:translate3d(var(--dx),520px,0) rotate(var(--rot));opacity:0}}
@keyframes arc-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-12px) rotate(10deg)}}
@keyframes arc-chase{to{background-position:18px 0,0 0}}
@keyframes arc-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.arc-pop{animation:arc-pop 420ms cubic-bezier(.3,1.4,.5,1) both;}
.arc-rise{animation:arc-rise 320ms ease-out both;}
.arc-bob{animation:arc-bob 2.6s ease-in-out infinite;}
.arc-wobble{animation:arc-wobble 2.8s ease-in-out infinite;}
.arc-pulse{animation:arc-pulse 1s ease-in-out infinite;}
.arc-shake{animation:arc-shake 320ms ease-in-out;}
@media (prefers-reduced-motion: reduce){
  .arc-root *, .arc-root *::before, .arc-root *::after, .arc-stars::after{animation:none !important;}
  .arc-confetti{display:none;}
}
`;

/**
 * The stage every arcade game sits on: deep night-indigo with a twinkling starfield and a
 * tinted nebula. Also darkens the park's game window around it (see ARC_CSS `:has`).
 */
export function ArcadeStage({ tone, children, wide, backdrop, style }: { tone: ArcTone; children: ReactNode; wide?: boolean; backdrop?: string; style?: CSSProperties }) {
  const t = TONES[tone];
  return (
    <div
      className="arc-root"
      style={{
        ["--arc-accent" as string]: t.accent,
        ["--arc-deep" as string]: t.deep,
        ["--arc-glow2" as string]: t.glow2,
        background: [
          backdrop,
          `radial-gradient(90% 40% at 12% 0%, ${alpha(t.accent, 0.26)}, transparent 70%)`,
          `radial-gradient(70% 38% at 100% 18%, ${alpha(t.glow2, 0.18)}, transparent 70%)`,
          "radial-gradient(120% 60% at 50% 115%, rgba(70,40,150,0.55), transparent 60%)",
          "linear-gradient(180deg, #1d1856 0%, #130f38 55%, #0b0a26 100%)",
        ]
          .filter(Boolean)
          .join(", "),
        ...style,
      }}
    >
      <style>{PARK_CSS + ARC_CSS}</style>
      <div className="arc-stars" aria-hidden />
      <div className={`arc-body${wide ? " wide" : ""}`}>{children}</div>
    </div>
  );
}

/** dark glass card with a luminous gradient edge */
export function Panel({ children, edge, className = "", style, pad = 16, as = "div", ...rest }: { children: ReactNode; edge?: string; className?: string; style?: CSSProperties; pad?: number; as?: "div" | "section"; role?: string; "aria-live"?: "polite"; "aria-label"?: string }) {
  const Tag = as;
  return (
    <Tag className={className} style={{ ...panelStyle(edge), padding: pad, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export function panelStyle(edge?: string, fill = "rgba(24,21,62,0.86)"): CSSProperties {
  const e = edge
    ? `linear-gradient(135deg, ${alpha(edge, 0.9)}, ${alpha(edge, 0.3)} 50%, ${alpha(edge, 0.75)})`
    : `linear-gradient(135deg, ${alpha(C.cyan, 0.6)}, ${alpha("#7d8cff", 0.25)} 45%, ${alpha(C.gold, 0.55)})`;
  return {
    position: "relative",
    borderRadius: 22,
    border: "1.5px solid transparent",
    background: `linear-gradient(${fill}, ${fill}) padding-box, ${e} border-box`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 22px rgba(0,0,0,0.35)${edge ? `, 0 0 16px ${alpha(edge, 0.18)}` : ""}`,
    color: C.text,
  };
}

/** big glowing screen title */
export function GameTitle({ emoji, title, sub }: { emoji?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="arc-rise" style={{ textAlign: "center", marginBottom: 16 }}>
      {emoji && <div
        aria-hidden
        className="arc-bob"
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 8px",
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          background: "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--arc-accent) 70%, white), var(--arc-deep) 70%)",
          boxShadow: "0 0 0 3px rgba(255,255,255,0.14), 0 0 26px color-mix(in srgb, var(--arc-accent) 70%, transparent), inset 0 -6px 12px rgba(0,0,0,0.3)",
        }}
      >
        {emoji}
      </div>}
      <h1 className="arc-display" style={{ fontSize: 32, margin: 0, color: "#fff", textShadow: "0 3px 0 rgba(0,0,0,0.4), 0 0 22px color-mix(in srgb, var(--arc-accent) 65%, transparent)" }}>
        {title}
      </h1>
      {sub && <p style={{ margin: "8px auto 0", maxWidth: 440, fontWeight: 800, fontSize: 15, color: C.dim, lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );
}

/** uppercase gold label with a luminous rule */
export function SectionLabel({ children, center, htmlFor }: { children: ReactNode; center?: boolean; htmlFor?: string }) {
  const s: CSSProperties = { display: "flex", alignItems: "center", gap: 8, justifyContent: center ? "center" : undefined, fontFamily: FONT.display, fontWeight: 400, fontSize: 15, letterSpacing: 1.2, textTransform: "uppercase", color: C.gold, margin: "0 2px 10px" };
  const rule = <span aria-hidden style={{ flex: center ? "0 1 40px" : 1, height: 1, background: `linear-gradient(90deg, ${alpha(C.gold, 0.6)}, transparent)` }} />;
  const content = (
    <>
      {center && <span aria-hidden style={{ flex: "0 1 40px", height: 1, background: `linear-gradient(270deg, ${alpha(C.gold, 0.6)}, transparent)` }} />}
      <span>{children}</span>
      {rule}
    </>
  );
  return htmlFor ? <label htmlFor={htmlFor} style={s}>{content}</label> : <p style={s}>{content}</p>;
}

/** "how to play" list: each rule gets a glowing emoji chip */
export function HowTo({ rules, footer, style }: { rules: [string, ReactNode][]; footer?: ReactNode; style?: CSSProperties }) {
  return (
    <Panel style={{ marginBottom: 18, ...style }} className="arc-rise">
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {rules.map(([e, text], i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 800, fontSize: 15.5, lineHeight: 1.35 }}>
            <span aria-hidden style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "color-mix(in srgb, var(--arc-accent) 18%, rgba(255,255,255,0.06))", border: "1.5px solid color-mix(in srgb, var(--arc-accent) 45%, transparent)" }}>
              {e}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {footer && <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(160,190,255,0.18)", fontWeight: 800, fontSize: 14, color: C.dim }}>{footer}</div>}
    </Panel>
  );
}

/** selectable glass tile (levels, categories, styles) */
export function Tile({ selected, onClick, children, style, className = "", disabled, label }: { selected?: boolean; onClick: () => void; children: ReactNode; style?: CSSProperties; className?: string; disabled?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={label} className={`arc-tile ${selected ? "on" : ""} ${className}`} style={style}>
      {children}
      <span className="arc-tick" aria-hidden>✓</span>
    </button>
  );
}

export type ArcVariant = "gold" | "glass" | "success" | "danger" | "magic" | "cyan" | "rose" | "amber" | "slate";

const DARK_TS = "0 1px 0 rgba(255,255,255,0.45)";
const LIGHT_TS = "0 2px 0 rgba(0,0,0,0.35)";
const BTN: Record<ArcVariant, { bg: string; fg: string; edge: string; ring: string; ts: string }> = {
  gold: { bg: `linear-gradient(180deg, ${C.goldHi}, ${C.gold} 45%, ${C.goldDeep})`, fg: C.ink, edge: "#9a5c00", ring: "rgba(255,246,214,0.7)", ts: DARK_TS },
  glass: { bg: "linear-gradient(180deg, rgba(80,76,156,0.92), rgba(36,32,88,0.95))", fg: C.text, edge: "rgba(6,5,20,0.9)", ring: alpha(C.cyan, 0.4), ts: LIGHT_TS },
  success: { bg: `linear-gradient(180deg, #9cf5c8, ${C.success} 50%, ${C.successDeep})`, fg: "#04261a", edge: "#0a5a37", ring: "rgba(220,255,238,0.7)", ts: DARK_TS },
  danger: { bg: "linear-gradient(180deg, #f5758b, #d42c48 55%, #a11a33)", fg: "#fff", edge: "#6b0a1c", ring: "rgba(255,208,214,0.6)", ts: LIGHT_TS },
  magic: { bg: "linear-gradient(180deg, #b88cff, #7c4dea 55%, #5a2fc8)", fg: "#fff", edge: "#2e1480", ring: "rgba(239,220,255,0.6)", ts: LIGHT_TS },
  cyan: { bg: `linear-gradient(180deg, #b5f9ff, ${C.cyan} 45%, ${C.cyanDeep})`, fg: "#032a33", edge: "#0b6b82", ring: "rgba(230,255,255,0.7)", ts: DARK_TS },
  rose: { bg: "linear-gradient(180deg, #ffc0db, #ff86bd 45%, #e0407f)", fg: "#3a0620", edge: "#8e1c4d", ring: "rgba(255,230,242,0.7)", ts: DARK_TS },
  amber: { bg: "linear-gradient(180deg, #ffe0a3, #ffb445 45%, #e0800c)", fg: "#2a1400", edge: "#8a4700", ring: "rgba(255,240,210,0.7)", ts: DARK_TS },
  slate: { bg: "linear-gradient(180deg, #a2abd6, #646ea0 55%, #474f7c)", fg: "#fff", edge: "#23284a", ring: "rgba(230,234,255,0.5)", ts: LIGHT_TS },
};

/** the chunky 3D arcade button (press sinks it into its base) */
export function ArcButton({
  children,
  onClick,
  disabled,
  variant = "gold",
  size,
  block,
  wrap,
  type = "button",
  style,
  className = "",
  ...aria
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ArcVariant;
  size?: "small" | "big";
  block?: boolean;
  wrap?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
}) {
  const v = BTN[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={aria["aria-label"]}
      aria-pressed={aria["aria-pressed"]}
      className={`arc-btn ${size ?? ""} ${block ? "block" : ""} ${wrap ? "wrap" : ""} ${className}`}
      style={{ ["--b-bg" as string]: v.bg, ["--b-fg" as string]: v.fg, ["--b-edge" as string]: v.edge, ["--b-ring" as string]: v.ring, ["--b-ts" as string]: v.ts, ...style }}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, variant = "gold" }: { children: ReactNode; onClick: () => void; disabled?: boolean; variant?: ArcVariant }) {
  return (
    <ArcButton block size="big" variant={variant} onClick={onClick} disabled={disabled} wrap>
      {children}
    </ArcButton>
  );
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <ArcButton block variant="glass" onClick={onClick} disabled={disabled} wrap>
      {children}
    </ArcButton>
  );
}

// ─────────────────────────────── states ───────────────────────────────

export function Thinking({ emoji, lines }: { emoji: string; lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1800);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "48px 12px" }}>
      <div style={{ position: "relative", width: 132, height: 132 }}>
        <div
          aria-hidden
          style={{ position: "absolute", inset: 0, borderRadius: 999, background: "conic-gradient(from 0deg, transparent, var(--arc-accent), transparent 40%, var(--arc-glow2), transparent 80%)", animation: "arc-spin 1.6s linear infinite", WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%)", mask: "radial-gradient(circle, transparent 58%, #000 60%)" }}
        />
        <div
          className="arc-pulse"
          style={{ position: "absolute", inset: 14, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), color-mix(in srgb, var(--arc-accent) 45%, #1d1856) 55%, #110e34)", boxShadow: "0 0 34px color-mix(in srgb, var(--arc-accent) 60%, transparent), inset 0 -8px 16px rgba(0,0,0,0.35)" }}
        >
          <span aria-hidden>{emoji}</span>
        </div>
      </div>
      <p key={i} className="arc-display arc-rise" style={{ fontSize: 22, textAlign: "center", margin: 0, color: "#fff", textShadow: "0 0 16px color-mix(in srgb, var(--arc-accent) 60%, transparent)" }}>
        {lines[i % lines.length]}
      </p>
      <div style={{ display: "flex", gap: 8 }} aria-hidden>
        {[0, 1, 2].map((d) => (
          <span key={d} style={{ width: 11, height: 11, borderRadius: 999, background: "var(--arc-accent)", boxShadow: "0 0 10px var(--arc-accent)", animation: `arc-dot 1s ease-in-out ${d * 0.18}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="arc-shake" style={{ ...panelStyle(C.danger, "rgba(70,12,34,0.9)"), padding: 14, marginBottom: 14, textAlign: "center" }}>
      <p style={{ margin: onRetry ? "0 0 12px" : 0, fontWeight: 800, color: "#ffe1e6", lineHeight: 1.4 }}>
        <span aria-hidden>⚠️ </span>
        {message}
      </p>
      {onRetry && (
        <ArcButton variant="danger" size="small" onClick={onRetry}>
          🔁 {retryLabel}
        </ArcButton>
      )}
    </div>
  );
}

export function SparkNote({ cost, sparks }: { cost: number; sparks: number }) {
  if (sparks >= cost) {
    return (
      <p style={{ textAlign: "center", fontSize: 13.5, fontWeight: 800, color: C.dim, margin: "12px 0 0" }}>
        You have <span style={{ color: C.cyan }}>⚡ {sparks}</span> sparks · this costs <span style={{ color: C.gold }}>⚡ {cost}</span> (only if the AI answers)
      </p>
    );
  }
  return (
    <div style={{ ...panelStyle(C.gold, "rgba(60,40,10,0.85)"), padding: 12, margin: "12px 0", fontSize: 14, fontWeight: 800, color: "#ffe9b8", textAlign: "center" }}>
      You need ⚡ {cost} sparks (you have {sparks}). Swap some ⭐ stars for sparks on the Arcade screen!
    </div>
  );
}

const CONFETTI = ["🎉", "🎊", "✨", "🌟", "🎈", "🥳", "🏆", "💫", "⭐", "🎯", "🌈", "🎆"];
const CONFETTI_COLORS = [C.gold, C.cyan, "#ff86bd", C.success, C.violet, "#ffffff", C.fire];

/** A burst of falling confetti (absolute; place inside a relative box). */
export function Confetti({ count = 34 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.4,
      dx: `${Math.round((Math.random() - 0.5) * 120)}px`,
      rot: `${Math.round(360 + Math.random() * 720)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 6 + Math.random() * 6,
      round: i % 3 === 0,
    })),
  );
  return (
    <div className="arc-confetti" aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 0, overflow: "visible", pointerEvents: "none", zIndex: 5 }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.w * 1.6,
            borderRadius: p.round ? 999 : 2,
            background: p.color,
            boxShadow: `0 0 6px ${alpha(p.color, 0.7)}`,
            ["--dx" as string]: p.dx,
            ["--rot" as string]: p.rot,
            animation: `arc-fall ${p.dur}s cubic-bezier(.25,.6,.5,1) ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}

/** Inline win banner with a confetti burst (no portal — it must stay inside the park's game window). */
export function Celebrate({ title, children, accent }: { title: string; children?: ReactNode; accent?: string }) {
  const [bits] = useState(() => Array.from({ length: 8 }, (_, i) => CONFETTI[(i * 7 + Math.floor(Math.random() * 12)) % CONFETTI.length]));
  const a = accent ?? C.gold;
  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <Confetti />
      <div
        className="arc-pop"
        style={{
          ...panelStyle(C.gold, "rgba(30,24,74,0.9)"),
          padding: "22px 16px",
          textAlign: "center",
          overflow: "hidden",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 30px rgba(0,0,0,0.45), 0 0 34px ${alpha(a, 0.45)}`,
        }}
      >
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(80% 70% at 50% 0%, ${alpha(a, 0.4)}, transparent 70%)` }} />
        <div aria-hidden style={{ position: "absolute", inset: "-40%", pointerEvents: "none", background: `repeating-conic-gradient(from 0deg, ${alpha("#ffffff", 0.06)} 0 10deg, transparent 10deg 20deg)`, animation: "arc-spin 24s linear infinite" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, fontSize: 28, marginBottom: 8 }} aria-hidden>
            {bits.map((e, i) => (
              <span key={i} style={{ display: "inline-block", animation: `arc-float ${1.4 + (i % 4) * 0.3}s ease-in-out ${i * 0.08}s infinite` }}>
                {e}
              </span>
            ))}
          </div>
          <h2 className="arc-display" style={{ fontSize: 34, margin: "0 0 8px", color: C.goldHi, textShadow: `0 3px 0 rgba(0,0,0,0.45), 0 0 22px ${alpha(a, 0.8)}` }}>
            {title}
          </h2>
          <div style={{ fontWeight: 800, color: C.text }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** a "better luck next time" card in the same family as Celebrate */
export function MissCard({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="arc-pop" style={{ ...panelStyle("#9aa6ff"), padding: "22px 16px", textAlign: "center", marginBottom: 16 }}>
      <div aria-hidden className="arc-wobble" style={{ fontSize: 56, lineHeight: 1, marginBottom: 6 }}>
        {emoji}
      </div>
      <h2 className="arc-display" style={{ fontSize: 30, margin: "0 0 6px", color: "#fff", textShadow: "0 3px 0 rgba(0,0,0,0.4)" }}>
        {title}
      </h2>
      <div style={{ fontWeight: 800, color: C.dim, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

/** Small persistent "best score / streak" memory per game (localStorage, client only). */
export function readStat(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(`arcade:stat:${key}`)) || 0;
  } catch {
    return 0;
  }
}
export function writeStat(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`arcade:stat:${key}`, String(value));
  } catch {
    // ignore
  }
}
