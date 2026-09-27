"use client";

/**
 * The one panel frame for every Cucaino Park screen (Quest Board, Pet House, Prize Shop...):
 * a candy bottom-sheet over the paused park — bubblegum header, chunky close button,
 * soft cream body that scrolls. Keeps every building feeling like the same candy world.
 */
export function CandySheet({
  title,
  subtitle,
  color = "#ff5fa8",
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  color?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...card, maxWidth: wide ? 820 : 640 }} className="candy-sheet">
        <div style={{ ...header, background: `linear-gradient(135deg, ${color}, ${shade(color)})` }}>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>{title}</div>
            {subtitle && <div style={subStyle}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={body}>{children}</div>
      </div>
      <style>{"@keyframes candy-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } } .candy-sheet { animation: candy-up 260ms cubic-bezier(.2,1.4,.4,1); }"}</style>
    </div>
  );
}

/** A slightly deeper shade of a hex colour for the header gradient. */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 10);
  return `rgb(${r},${g},${b})`;
}

/** Chunky candy button used across park screens. */
export function CandyButton({
  children,
  color = "#ff5fa8",
  onClick,
  disabled,
  small,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        borderRadius: 999,
        padding: small ? "8px 14px" : "12px 20px",
        fontWeight: 900,
        fontSize: small ? 14 : 17,
        color: "#fff",
        background: disabled ? "#d9c7d3" : `linear-gradient(${color}, ${shade(color)})`,
        boxShadow: disabled ? "none" : `0 5px 0 ${shade(shade(color))}, 0 8px 14px rgba(122,46,98,0.18)`,
        cursor: disabled ? "default" : "pointer",
        touchAction: "manipulation",
        whiteSpace: "nowrap",
        ...style,
      }}
      className={disabled ? "" : "active:translate-y-[3px] transition-transform"}
    >
      {children}
    </button>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: "rgba(90, 30, 80, 0.22)",
};

const card: React.CSSProperties = {
  width: "100%",
  maxHeight: "86dvh",
  display: "flex",
  flexDirection: "column",
  borderRadius: "30px 30px 0 0",
  overflow: "hidden",
  background: "#fff8fc",
  boxShadow: "0 -10px 40px rgba(122,46,98,0.25)",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 18px 14px",
  color: "#fff",
};

const titleStyle: React.CSSProperties = { fontWeight: 900, fontSize: 22, textShadow: "0 2px 0 rgba(0,0,0,0.12)" };
const subStyle: React.CSSProperties = { fontWeight: 800, fontSize: 14, opacity: 0.95, marginTop: 2 };

const closeBtn: React.CSSProperties = {
  flexShrink: 0,
  width: 42,
  height: 42,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.92)",
  color: "#7a2e62",
  fontWeight: 900,
  fontSize: 18,
  boxShadow: "0 3px 0 rgba(0,0,0,0.12)",
  cursor: "pointer",
};

const body: React.CSSProperties = {
  overflowY: "auto",
  padding: "16px 16px calc(20px + env(safe-area-inset-bottom))",
  WebkitOverflowScrolling: "touch",
};
