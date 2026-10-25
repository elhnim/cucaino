import type { CSSProperties, ReactNode } from "react";
import { alpha, C } from "./theme";

/** An emoji/icon in a glowing gem-like frame (quest icons, menu rows, prize art). */
export function IconChip({ children, color = C.cyan, size = 48, round, style }: { children: ReactNode; color?: string; size?: number; round?: boolean; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.56),
        lineHeight: 1,
        borderRadius: round ? 999 : Math.round(size * 0.3),
        border: `1.5px solid ${alpha(color, 0.75)}`,
        background: `radial-gradient(circle at 50% 35%, ${alpha(color, 0.42)}, ${alpha(color, 0.12)} 60%, rgba(8,8,26,0.6))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 12px ${alpha(color, 0.3)}, 0 0 12px ${alpha(color, 0.3)}`,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
