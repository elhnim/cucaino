"use client";

// The park HUD pieces (presentational only — ParkApp owns all state and callbacks):
// player portrait + level/XP, the wallet bar, the quest banner, round glass action buttons,
// notification toasts and the walk-up prompt card.
import type { CSSProperties, ReactNode } from "react";
import { C, FONT, alpha, glass, display } from "./theme";
import { IconChip } from "./IconChip";
import { GameButton } from "./GameButton";

/** Circular gold-ringed portrait with a level badge and a thin XP bar under it. */
export function PlayerBadge({ emoji, level, xp, onClick, label = "Open my menu", open }: { emoji: string; level: number; xp: number; onClick: () => void; label?: string; open?: boolean }) {
  return (
    <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: 64 }}>
      <button type="button" onClick={onClick} aria-label={label} aria-expanded={open} className="gp-press" style={portraitBtn}>
        <span style={portraitInner}>
          <span style={{ fontSize: 30, lineHeight: 1, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.4))" }}>{emoji}</span>
        </span>
        <span style={levelBadge}>Lv {level}</span>
      </button>
      <span style={xpTrack} aria-hidden title={`${Math.round(xp * 100)}% to the next level`}>
        <span style={{ ...xpFill, width: `${Math.max(6, Math.min(1, xp) * 100)}%` }} />
      </span>
    </div>
  );
}

/** The sleek glass wallet: icon + display-font number per currency. */
export function WalletBar({ items }: { items: { icon: string; value: number | string; color: string; label: string }[] }) {
  return (
    <div style={walletBar}>
      {items.map((it, i) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }} aria-label={`${it.value} ${it.label}`}>
          {i > 0 && <span aria-hidden style={{ width: 1, height: 22, marginRight: 6, background: "linear-gradient(transparent, rgba(160,200,255,0.4), transparent)" }} />}
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1, filter: `drop-shadow(0 0 6px ${alpha(it.color, 0.7)})` }}>{it.icon}</span>
          <span style={{ ...display(19, C.text), fontVariantNumeric: "tabular-nums", textShadow: `0 0 10px ${alpha(it.color, 0.45)}, 0 1px 0 rgba(0,0,0,0.5)` }}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

export type QuestBannerState = "todo" | "chest" | "done" | "none";

/** The bold quest banner (bottom-left): glass + gold edge, counter badge, soft shimmer. */
export function QuestBanner({ state, left, sub, onClick, label }: { state: QuestBannerState; left: number; sub: string; onClick: () => void; label: string }) {
  const edge = state === "chest" ? "gold" : state === "todo" ? "gold" : state === "done" ? C.success : "soft";
  const icon = state === "chest" ? "🎁" : state === "todo" ? "📜" : state === "done" ? "🏆" : "📜";
  const title = state === "chest" ? "Open chest!" : state === "todo" ? "My Quests" : state === "done" ? "All done!" : "My Quests";
  const chipColor = state === "chest" ? "#ffc23d" : state === "done" ? C.success : C.gold;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`gp-press ${state === "chest" ? "gp-glow" : ""}`}
      style={{
        ...glass({ edge, fill: state === "chest" ? "rgba(60,38,10,0.82)" : "rgba(18,16,44,0.8)", width: 2 }),
        ...questBanner,
      }}
    >
      <span aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 16, pointerEvents: "none" }}>
        {(state === "todo" || state === "chest") && <span className="gp-shimmer" />}
      </span>
      <IconChip color={chipColor} size={46} style={{ fontSize: 26 }}>
        {icon}
      </IconChip>
      <span style={{ textAlign: "left", lineHeight: 1.1, minWidth: 0 }}>
        <span style={{ display: "block", ...display(18, state === "chest" ? C.goldHi : C.text), whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.8, textShadow: "0 2px 0 rgba(0,0,0,0.4)" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: C.dim, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      {state === "todo" && left > 0 && <span style={counter}>{left}</span>}
    </button>
  );
}

/** Circular glass button with a gold ring (ride / fly controls). */
export function RoundButton({ children, size = 60, active, style, ...rest }: { children: ReactNode; size?: number; active?: boolean; style?: CSSProperties } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="gp-press"
      {...rest}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "2px solid transparent",
        background: `radial-gradient(circle at 50% 30%, ${active ? "rgba(120,86,20,0.92)" : "rgba(72,66,150,0.88)"}, ${active ? "rgba(46,30,6,0.92)" : "rgba(16,14,42,0.9)"}) padding-box, linear-gradient(160deg, ${C.goldHi}, ${C.goldDeep} 55%, ${C.gold}) border-box`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 ${active ? 18 : 10}px ${alpha(C.gold, active ? 0.6 : 0.3)}, 0 6px 16px rgba(0,0,0,0.45)`,
        color: C.text,
        fontFamily: FONT.display,
        fontWeight: 400,
        fontSize: Math.round(size * 0.45),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        // held down to fly up/down: no text selection, callout or double-tap zoom on iOS
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "none",
        ...style,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

const EMOJI_LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

/** A sleek notification banner. A leading emoji becomes the banner's icon. */
export function Toast({ text, ms }: { text: string; ms: number }) {
  const m = text.match(EMOJI_LEAD);
  const icon = m?.[1] ?? "✨";
  const body = m ? text.slice(m[0].length) : text;
  return (
    <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.86)" }), ...toast, animation: `park-pop ${ms}ms ease forwards` }} role="status">
      <IconChip color={C.gold} size={36} round style={{ fontSize: 19 }}>
        {icon}
      </IconChip>
      <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3, color: C.text, textAlign: "left" }}>{body}</span>
    </div>
  );
}

/** Walk-up prompt ("Visit the Prize Shop?") and the quest nudge: icon, question, two buttons. */
export function PromptCard({ icon, title, hint, no, yes, onNo, onYes }: { icon: string; title: ReactNode; hint?: ReactNode; no: string; yes: string; onNo: () => void; onYes: () => void }) {
  return (
    <div style={promptWrap}>
    <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.86)", width: 1.5 }), ...promptCard }} className="gp-popin">
      <IconChip color={C.gold} size={54} style={{ fontSize: 30 }}>
        {icon}
      </IconChip>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ ...display(20, C.text), textShadow: "0 2px 0 rgba(0,0,0,0.35)" }}>{title}</div>
        {hint && <div style={{ fontWeight: 800, fontSize: 13.5, color: C.dim, marginTop: 3 }}>{hint}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
        <GameButton variant="secondary" small onClick={onNo}>
          {no}
        </GameButton>
        <GameButton variant="primary" small onClick={onYes}>
          {yes}
        </GameButton>
      </div>
    </div>
    </div>
  );
}

/** A Natural Wonder's fact card: icon + place name, the true fact, one "Got it!" dismiss button.
 *  Used both for a wonder's first-discovery fact and for its wooden info signs (keeps the two
 *  consistent — see lib/park/registry/wonders.ts). */
export function FactCard({ icon, title, subtitle, fact, onClose }: { icon: string; title: string; subtitle?: string; fact: string; onClose: () => void }) {
  return (
    <div style={promptWrap}>
      <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.9)", width: 1.5 }), ...factCard }} className="gp-popin">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconChip color={C.gold} size={54} style={{ fontSize: 30 }}>
            {icon}
          </IconChip>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ ...display(19, C.text), textShadow: "0 2px 0 rgba(0,0,0,0.35)" }}>{title}</div>
            {subtitle && <div style={{ fontWeight: 800, fontSize: 12, color: C.dim, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.4, color: C.text, marginTop: 10 }}>{fact}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <GameButton variant="primary" small onClick={onClose}>
            Got it!
          </GameButton>
        </div>
      </div>
    </div>
  );
}

const portraitBtn: CSSProperties = {
  position: "relative",
  width: 60,
  height: 60,
  padding: 3,
  borderRadius: 999,
  border: "none",
  background: `conic-gradient(from 200deg, ${C.goldHi}, ${C.goldDeep}, ${C.gold}, #fff2c2, ${C.goldDeep}, ${C.goldHi})`,
  boxShadow: `0 0 14px ${alpha(C.gold, 0.45)}, 0 6px 14px rgba(0,0,0,0.45)`,
  cursor: "pointer",
  touchAction: "manipulation",
};
const portraitInner: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(circle at 50% 30%, #4b3fb0, #1a1650 70%)",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.4)",
};
const levelBadge: CSSProperties = {
  position: "absolute",
  right: -8,
  bottom: -4,
  padding: "2px 7px",
  borderRadius: 8,
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 12.5,
  letterSpacing: 0.3,
  color: C.ink,
  background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`,
  border: "1.5px solid #6b3d00",
  boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
  whiteSpace: "nowrap",
};
const xpTrack: CSSProperties = {
  position: "relative",
  display: "block",
  width: 56,
  height: 6,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(6,6,20,0.7)",
  boxShadow: `0 0 0 1px ${alpha(C.cyan, 0.35)}, 0 2px 4px rgba(0,0,0,0.4)`,
};
const xpFill: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 999,
  background: `linear-gradient(90deg, ${C.cyanDeep}, ${C.cyan})`,
  boxShadow: `0 0 8px ${C.cyan}`,
  transition: "width 400ms ease",
};
const walletBar: CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(14,12,38,0.72)", width: 1.5 }),
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 14,
  padding: "8px 14px",
  whiteSpace: "nowrap",
};
const questBanner: CSSProperties = {
  position: "fixed",
  left: "max(16px, env(safe-area-inset-left))",
  bottom: "max(22px, env(safe-area-inset-bottom))",
  zIndex: 21,
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 64,
  padding: "8px 18px 8px 9px",
  borderRadius: 18,
  cursor: "pointer",
  maxWidth: "calc(100vw - 165px)",
  touchAction: "manipulation",
};
const counter: CSSProperties = {
  position: "absolute",
  top: -9,
  right: -9,
  minWidth: 26,
  height: 26,
  padding: "0 6px",
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 15,
  color: "#fff",
  background: `linear-gradient(#ff8a9a, ${C.danger} 50%, ${C.dangerDeep})`,
  border: "2px solid #ffe3a0",
  boxShadow: `0 0 10px ${alpha(C.danger, 0.7)}, 0 2px 6px rgba(0,0,0,0.5)`,
};
const toast: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  maxWidth: "min(440px, 90vw)",
  borderRadius: 16,
  padding: "8px 16px 8px 8px",
};
const promptWrap: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 150px)",
  zIndex: 33,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};
const promptCard: CSSProperties = {
  pointerEvents: "auto",
  width: "min(580px, calc(100vw - 24px))",
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  borderRadius: 20,
  padding: "12px 14px",
};
const factCard: CSSProperties = {
  pointerEvents: "auto",
  width: "min(420px, calc(100vw - 24px))",
  borderRadius: 20,
  padding: "14px 16px",
};
