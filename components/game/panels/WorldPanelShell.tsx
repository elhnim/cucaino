"use client";

/**
 * Shared chrome for the bigger in-world panels (Todo/Rewards/Friends/Play Hall) — same
 * visual language as PetPanel's bottom-sheet card, just roomier and scrollable so a full
 * task list / reward grid / friends list actually fits.
 */
export function WorldPanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>{title}</span>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: "rgba(30, 20, 40, 0.28)",
  zIndex: 40,
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  width: "min(560px, 94vw)",
  maxHeight: "82vh",
  margin: "0 0 max(16px, env(safe-area-inset-bottom))",
  background: "#fffaf0",
  borderRadius: 28,
  boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
  border: "3px solid #f0d9b0",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 18px 10px",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 20,
  color: "#7a4a8c",
};

const closeBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "none",
  background: "#f0d9b0",
  color: "#7a4a8c",
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: "0 18px 20px",
  overflowY: "auto",
};
