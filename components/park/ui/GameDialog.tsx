"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, FONT, PARK_CSS, glass, type Edge } from "./theme";

/**
 * A centred glass modal (pay-with-ticket, mount picker, mystery chest...). Clicking the scrim
 * calls `onDismiss` when given; clicks inside never bubble out.
 */
export function GameDialog({
  children,
  onDismiss,
  edge = "gold",
  zIndex = 90,
  width = 420,
  style,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  edge?: Edge | string;
  zIndex?: number;
  width?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...wrap, zIndex }} onClick={onDismiss}>
      <style>{PARK_CSS}</style>
      <div style={{ ...glass({ edge, fill: "rgba(20,17,50,0.88)", blur: 12 }), ...card, width: `min(${width}px, 100%)`, ...style }} className="gp-popin" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 16px max(16px, env(safe-area-inset-bottom))",
  background: C.scrim,
  fontFamily: FONT.body,
};
const card: CSSProperties = {
  position: "relative",
  borderRadius: 22,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
  maxHeight: "90dvh",
  overflowY: "auto",
};
