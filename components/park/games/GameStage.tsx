"use client";

import { C, FONT, PARK_CSS, alpha, glass } from "../ui/theme";

// Full-screen stage that hosts a game inside Cucaino Park (no iframe, no old page): a dark
// glass title bar over the game. The game content itself keeps its own light skin
// (`candy-skin`, app/globals.css) so the existing game components stay readable.
// Any link inside the game that would leave for an old flat page (← Back, ← Games, ← Arcade)
// is caught and sends the kid back to where they came from in the park instead.
export function GameStage({
  title,
  color = C.cyan,
  onClose,
  onBack,
  children,
}: {
  title: string;
  color?: string;
  onClose: () => void;
  /** optional "back" inside the game (e.g. lesson -> course list); defaults to closing */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", background: "radial-gradient(120% 60% at 50% 0%, #2c2572, #120f33 60%)", fontFamily: FONT.body }}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href") ?? "";
        if (a && (href.startsWith("/kid/") || href.startsWith("/play") || href.startsWith("/select-kid"))) {
          e.preventDefault();
          e.stopPropagation();
          (onBack ?? onClose)();
        }
      }}
    >
      <style>{PARK_CSS}</style>
      <div style={{ ...bar, ...glass({ edge: color, fill: "rgba(16,14,42,0.92)", width: 0, blur: 0 }), borderBottom: `1px solid ${alpha(color, 0.55)}`, boxShadow: `0 4px 18px rgba(0,0,0,0.45), 0 1px 14px ${alpha(color, 0.3)}` }}>
        <button type="button" onClick={onClose} style={backBtn} className="gp-press">
          ← Park
        </button>
        <span style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 21, letterSpacing: 0.4, color: C.text, textShadow: `0 0 14px ${alpha(color, 0.6)}, 0 2px 0 rgba(0,0,0,0.4)`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </div>
      <div className="candy-skin" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", position: "relative", background: "linear-gradient(#f4f3ff, #e9e8fb)", color: "#241c4d" }}>
        {children}
      </div>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "max(10px, env(safe-area-inset-top)) 14px 10px",
  flexShrink: 0,
  borderRadius: 0,
};
const backBtn: React.CSSProperties = {
  minHeight: 44,
  border: "1.5px solid transparent",
  borderRadius: 12,
  padding: "0 14px",
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 16,
  letterSpacing: 0.4,
  color: C.ink,
  background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep}) padding-box, linear-gradient(#fff6d6, rgba(0,0,0,0.25)) border-box`,
  boxShadow: "0 3px 0 #9a5c00, 0 6px 12px rgba(0,0,0,0.35)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
