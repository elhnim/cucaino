import type { CSSProperties } from "react";
import { C, alpha } from "./theme";

/** A glowing progress bar (quests done, XP, saving up for a prize, pet needs). value 0..1 */
export function ProgressBar({
  value,
  color = C.gold,
  to,
  height = 10,
  label,
  shimmer,
  style,
}: {
  value: number;
  color?: string;
  /** end colour of the fill gradient (defaults to a lighter take on `color`) */
  to?: string;
  height?: number;
  label?: React.ReactNode;
  shimmer?: boolean;
  style?: CSSProperties;
}) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div style={style}>
      <div
        style={{
          position: "relative",
          height,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(4,4,16,0.55)",
          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6), 0 0 0 1px ${alpha("#a0beff", 0.16)}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            minWidth: pct > 0 ? height : 0,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${color}, ${to ?? "#fff3c4"})`,
            boxShadow: `0 0 10px ${alpha(color, 0.7)}, inset 0 1px 0 rgba(255,255,255,0.5)`,
            transition: "width 320ms ease",
            overflow: "hidden",
          }}
        >
          {shimmer && <span className="gp-shimmer" />}
        </div>
      </div>
      {label && <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, marginTop: 4 }}>{label}</div>}
    </div>
  );
}
