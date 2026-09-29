import type { CSSProperties, ReactNode } from "react";
import { C, FONT, alpha } from "./theme";

/** A small luminous chip: rewards (⭐ 5), timers, states ("Waiting for a grown-up"). */
export function Badge({ children, color = C.gold, solid, style }: { children: ReactNode; color?: string; solid?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        padding: "3px 9px",
        fontFamily: FONT.display,
        fontWeight: 400,
        fontSize: 13,
        letterSpacing: 0.3,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        color: solid ? C.ink : color,
        background: solid ? `linear-gradient(${alpha("#ffffff", 0.35)}, transparent), ${color}` : alpha(color, 0.14),
        border: `1px solid ${alpha(color, solid ? 0.9 : 0.5)}`,
        boxShadow: solid ? `0 0 10px ${alpha(color, 0.55)}` : `inset 0 0 8px ${alpha(color, 0.12)}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
