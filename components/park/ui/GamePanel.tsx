"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, FONT, PARK_CSS, alpha, glass } from "./theme";

/**
 * The one panel frame for every park screen (Quest Board, Pet House, Prize Shop...): a dark
 * glass bottom-sheet over the paused park — display-font title with an accent glow line, a
 * round glass close button, and a scrolling body. `color` tints the header accent.
 */
export function GamePanel({
  title,
  subtitle,
  color = C.cyan,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  color?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <style>{PARK_CSS}</style>
      <div style={{ ...card, maxWidth: wide ? 840 : 660 }} className="gp-sheet">
        {/* accent aura behind the header */}
        <div aria-hidden style={{ position: "absolute", inset: "0 0 auto 0", height: 120, pointerEvents: "none", background: `radial-gradient(120% 100% at 50% 0%, ${alpha(color, 0.3)}, transparent 70%)` }} />
        <div aria-hidden style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: 12, height: 12, background: C.gold, boxShadow: `0 0 12px ${C.gold}`, borderRadius: 2 }} />
        <div style={header}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={titleStyle}>{title}</div>
            {subtitle && <div style={subStyle}>{subtitle}</div>}
          </div>
          <PanelClose onClose={onClose} />
        </div>
        <div aria-hidden style={{ height: 1, margin: "0 16px", flexShrink: 0, background: `linear-gradient(90deg, transparent, ${alpha(color, 0.9)}, ${alpha(C.gold, 0.7)}, transparent)` }} />
        <div style={body} className="gp-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

/** round glass ✕ used by panels and dialogs */
export function PanelClose({ onClose, label = "Close", style }: { onClose: () => void; label?: string; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClose} style={{ ...closeBtn, ...style }} aria-label={label} className="gp-press">
      ✕
    </button>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: `linear-gradient(to top, ${C.scrim}, rgba(5,4,18,0.2))`,
  fontFamily: FONT.body,
};

const card: CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(18,16,44,0.84)", blur: 12 }),
  position: "relative",
  width: "100%",
  maxHeight: "86dvh",
  display: "flex",
  flexDirection: "column",
  borderRadius: "24px 24px 0 0",
  borderBottomWidth: 0,
  overflow: "visible",
};

const header: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 16px 12px 20px",
};

const titleStyle: CSSProperties = {
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 24,
  letterSpacing: 0.5,
  lineHeight: 1.1,
  color: C.text,
  textShadow: "0 2px 0 rgba(0,0,0,0.35), 0 0 18px rgba(94,242,255,0.25)",
};
const subStyle: CSSProperties = { fontWeight: 800, fontSize: 14, color: C.dim, marginTop: 4 };

const closeBtn: CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.4)",
  background: "radial-gradient(circle at 50% 30%, rgba(90,86,160,0.7), rgba(20,18,50,0.85))",
  color: C.text,
  fontWeight: 900,
  fontSize: 17,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.35)",
  cursor: "pointer",
  touchAction: "manipulation",
};

const body: CSSProperties = {
  position: "relative",
  minHeight: 0,
  overflowY: "auto",
  padding: "14px 16px calc(20px + env(safe-area-inset-bottom))",
  WebkitOverflowScrolling: "touch",
  borderRadius: "0 0 0 0",
};
