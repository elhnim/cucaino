"use client";

// Full-screen candy stage that hosts a game inside Cucaino Park (no iframe, no old page).
// Any link inside the game that would leave for an old flat page (← Back, ← Games, ← Arcade)
// is caught and sends the kid back to where they came from in the park instead.
export function GameStage({
  title,
  color = "#ff5fa8",
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
      style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", background: "linear-gradient(#fff4fa, #ffe6f2)" }}
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
      <div style={{ ...bar, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
        <button type="button" onClick={onClose} style={backBtn}>
          🎡 Back to the park
        </button>
        <span style={{ fontWeight: 900, fontSize: 18, color: "#fff", textShadow: "0 2px 0 rgba(0,0,0,0.15)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </div>
      <div className="candy-skin" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", position: "relative" }}>
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
  boxShadow: "0 4px 14px rgba(122,46,98,0.18)",
};
const backBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "9px 14px",
  fontWeight: 900,
  color: "#7a2e62",
  background: "#fff",
  boxShadow: "0 3px 0 rgba(0,0,0,0.12)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
