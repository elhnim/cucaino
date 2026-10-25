"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, FONT, alpha, edgeGradient, shade } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "magic" | "ghost";

const LOOK: Record<ButtonVariant, { bg: string; color: string; edge: string; ring: string }> = {
  primary: { bg: `linear-gradient(180deg, ${C.goldHi}, ${C.gold} 45%, ${C.goldDeep})`, color: C.ink, edge: "#9a5c00", ring: alpha("#fff6d6", 0.9) },
  secondary: { bg: "linear-gradient(180deg, rgba(66,62,130,0.85), rgba(30,27,74,0.9))", color: C.text, edge: "rgba(6,5,20,0.8)", ring: alpha(C.cyan, 0.55) },
  danger: { bg: `linear-gradient(180deg, #ff8c9a, ${C.danger} 50%, ${C.dangerDeep})`, color: "#fff", edge: "#7d1022", ring: alpha("#ffd0d6", 0.8) },
  success: { bg: `linear-gradient(180deg, #9cf5c8, ${C.success} 50%, ${C.successDeep})`, color: "#062a19", edge: "#0a5a37", ring: alpha("#dcffee", 0.85) },
  magic: { bg: `linear-gradient(180deg, #d3a6ff, ${C.violet} 50%, ${C.violetDeep})`, color: "#fff", edge: "#3a1a8f", ring: alpha("#efdcff", 0.8) },
  ghost: { bg: "rgba(255,255,255,0.06)", color: C.text, edge: "transparent", ring: "rgba(255,255,255,0.18)" },
};

/**
 * The park's one button. primary = gold (rewards, "go"), secondary = glass, danger = red,
 * success = emerald, magic = violet. Always at least 44px tall for small fingers.
 */
export function GameButton({
  children,
  variant = "primary",
  tint,
  onClick,
  disabled,
  small,
  big,
  block,
  style,
  className,
  type = "button",
  ...aria
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  /** colour a secondary button's edge/glow (e.g. a category colour) */
  tint?: string;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  big?: boolean;
  block?: boolean;
  style?: CSSProperties;
  className?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
}) {
  const look = LOOK[variant];
  const tinted = tint && variant === "secondary";
  const bg = tinted ? `linear-gradient(180deg, ${alpha(tint!, 0.55)}, ${alpha(shade(tint!, 0.55), 0.85)})` : look.bg;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={aria["aria-label"]}
      className={`gp-press ${className ?? ""}`}
      style={{
        position: "relative",
        minHeight: small ? 44 : big ? 54 : 48,
        padding: small ? "0 14px" : big ? "0 26px" : "0 20px",
        width: block ? "100%" : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 14,
        border: "1.5px solid transparent",
        background: disabled
          ? "linear-gradient(rgba(70,70,100,0.6), rgba(50,50,76,0.6)) padding-box, linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0.06)) border-box"
          : `${bg} padding-box, ${tinted ? edgeGradient(tint!) : `linear-gradient(${look.ring}, ${alpha("#000000", 0.25)})`} border-box`,
        color: disabled ? "rgba(220,224,245,0.55)" : tinted ? "#fff" : look.color,
        fontFamily: FONT.display,
        fontWeight: 400,
        fontSize: small ? 15 : big ? 20 : 17,
        letterSpacing: 0.4,
        textShadow: variant === "primary" || variant === "success" ? "0 1px 0 rgba(255,255,255,0.45)" : "0 1px 2px rgba(0,0,0,0.45)",
        boxShadow: disabled
          ? "none"
          : `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -3px 0 ${alpha("#000000", 0.18)}, 0 3px 0 ${look.edge}, 0 6px 14px rgba(0,0,0,0.35)${tinted ? `, 0 0 14px ${alpha(tint!, 0.35)}` : ""}`,
        cursor: disabled ? "default" : "pointer",
        touchAction: "manipulation",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Map an old candy colour to the nearest new variant (so CandyButton callers keep working). */
export function variantForColor(color?: string): { variant: ButtonVariant; tint?: string } {
  if (!color) return { variant: "primary" };
  const c = color.toLowerCase();
  if (["#ff5fa8", "#ff7fbd", "#ff8a3d", "#f5b400", "#ffd36b", "#eab308"].includes(c)) return { variant: "primary" };
  if (["#ff4f6d", "#e11d48", "#ff5d73"].includes(c)) return { variant: "danger" };
  if (["#2fcf8f", "#22c55e", "#16a34a", "#4fe3a0"].includes(c)) return { variant: "success" };
  if (["#a96bff", "#7c5cff", "#b06bff", "#9a5cff"].includes(c)) return { variant: "magic" };
  if (["#9b7090"].includes(c)) return { variant: "secondary" };
  return { variant: "secondary", tint: color };
}
