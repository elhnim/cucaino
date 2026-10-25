// Cucaino Park UI tokens: the "magical adventure" look for the kid-facing 2D layer (HUD, sheets,
// cards, dialogs). Dark translucent glass, thin luminous edges, gold for rewards + primary
// actions, cyan for info/magic, violet for epic. One place to tune the whole park's chrome.
import type { CSSProperties } from "react";

export const FONT = {
  /** chunky display face for headings + numbers (Lilita One via next/font in app/park layout) */
  display: "var(--font-park-display), 'Lilita One', 'Luckiest Guy', 'Arial Rounded MT Bold', system-ui, sans-serif",
  body: "var(--font-nunito), Nunito, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

export const C = {
  gold: "#ffd36b",
  goldHi: "#ffe9a8",
  goldDeep: "#e89a1c",
  goldEdge: "#8a5200",
  cyan: "#5ef2ff",
  cyanDeep: "#1fb5d6",
  violet: "#b06bff",
  violetDeep: "#6d3df0",
  success: "#4fe3a0",
  successDeep: "#159a63",
  danger: "#ff5d73",
  dangerDeep: "#c8243f",
  fire: "#ff9a3d",
  /** text */
  text: "#f5f3ff",
  dim: "rgba(226,230,255,0.74)",
  mute: "rgba(200,206,240,0.52)",
  ink: "#2a1a00", // text on gold
  /** surfaces */
  panel: "rgba(18,16,44,0.78)",
  panelDeep: "rgba(10,9,28,0.9)",
  card: "rgba(255,255,255,0.06)",
  cardHi: "rgba(255,255,255,0.1)",
  line: "rgba(160,190,255,0.22)",
  scrim: "rgba(5,4,18,0.55)",
} as const;

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITY: Record<Rarity, { color: string; label: string }> = {
  common: { color: "#b8c0d8", label: "Common" },
  rare: { color: "#4fa8ff", label: "Rare" },
  epic: { color: "#b06bff", label: "Epic" },
  legendary: { color: "#ffc23d", label: "Legendary" },
};

/** A quest's rarity from its star value (more stars = rarer, shinier card). */
export function rarityForStars(stars: number): Rarity {
  if (stars >= 10) return "legendary";
  if (stars >= 6) return "epic";
  if (stars >= 3) return "rare";
  return "common";
}

/** hex (#rgb / #rrggbb) + alpha -> rgba() */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** darker shade of a hex colour (for gradient bottoms / pressed edges) */
export function shade(hex: string, amt = 0.35): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const EDGES = {
  cyan: `linear-gradient(135deg, ${alpha("#5ef2ff", 0.75)}, ${alpha("#7d8cff", 0.35)} 45%, ${alpha("#ffd36b", 0.65)})`,
  gold: `linear-gradient(135deg, ${alpha("#ffe9a8", 0.95)}, ${alpha("#e89a1c", 0.7)} 50%, ${alpha("#ffd36b", 0.95)})`,
  violet: `linear-gradient(135deg, ${alpha("#d3a6ff", 0.85)}, ${alpha("#6d3df0", 0.5)} 50%, ${alpha("#5ef2ff", 0.6)})`,
  soft: `linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08))`,
} as const;
export type Edge = keyof typeof EDGES;

/** the edge gradient for a colour or a named edge */
export function edgeGradient(edge: Edge | string): string {
  if (edge in EDGES) return EDGES[edge as Edge];
  return `linear-gradient(135deg, ${alpha(edge, 0.95)}, ${alpha(edge, 0.35)} 55%, ${alpha(edge, 0.8)})`;
}

/**
 * Dark translucent glass with a thin luminous gradient border (padding-box/border-box trick,
 * so the edge can be a gradient while the fill stays see-through + blurred).
 */
export function glass({ edge = "cyan", fill = C.panel, width = 1.5, blur = 10, glow }: { edge?: Edge | string; fill?: string; width?: number; blur?: number; glow?: string } = {}): CSSProperties {
  return {
    border: `${width}px solid transparent`,
    background: `linear-gradient(${fill}, ${fill}) padding-box, ${edgeGradient(edge)} border-box`,
    backdropFilter: blur ? `blur(${blur}px) saturate(1.2)` : undefined,
    WebkitBackdropFilter: blur ? `blur(${blur}px) saturate(1.2)` : undefined,
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.14)",
      "inset 0 0 22px rgba(120,160,255,0.08)",
      "0 10px 28px rgba(0,0,0,0.42)",
      glow ? `0 0 18px ${glow}` : null,
    ]
      .filter(Boolean)
      .join(", "),
    color: C.text,
  };
}

/** a card inside a panel (no blur: the panel already blurs) */
export function cardStyle(edge: Edge | string = "soft", fill = "rgba(34,30,78,0.72)"): CSSProperties {
  return {
    border: "1px solid transparent",
    background: `linear-gradient(${fill}, ${fill}) padding-box, ${edgeGradient(edge)} border-box`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.28)",
    borderRadius: 16,
    color: C.text,
  };
}

export const display = (size: number, color: string = C.text): CSSProperties => ({
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: size,
  letterSpacing: 0.4,
  lineHeight: 1.1,
  color,
});

/** little uppercase section label with a luminous rule */
export const sectionLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 14,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: C.gold,
  margin: "0 2px 8px",
};

export const mutedText: CSSProperties = { textAlign: "center", color: C.dim, fontWeight: 800, padding: "18px 0" };

/** keyframes shared by every park screen (inject once per mounted root; duplicates are harmless) */
export const PARK_CSS = [
  "@keyframes gp-up { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }",
  "@keyframes gp-pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: none; opacity: 1; } }",
  "@keyframes gp-shimmer { 0% { transform: translateX(-130%) skewX(-18deg); } 55%,100% { transform: translateX(330%) skewX(-18deg); } }",
  "@keyframes gp-glow { 0%,100% { box-shadow: 0 0 10px rgba(255,194,61,0.45), 0 10px 26px rgba(0,0,0,0.45); } 50% { box-shadow: 0 0 26px rgba(255,194,61,0.9), 0 10px 26px rgba(0,0,0,0.45); } }",
  "@keyframes gp-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }",
  "@keyframes gp-spin { to { transform: rotate(360deg); } }",
  "@keyframes gp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }",
  ".gp-shimmer { position: absolute; top: 0; bottom: 0; left: 0; width: 38%; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent); animation: gp-shimmer 3.6s ease-in-out infinite; }",
  ".gp-glow { animation: gp-glow 2.2s ease-in-out infinite; }",
  ".gp-breathe { animation: gp-breathe 2.6s ease-in-out infinite; }",
  ".gp-press { transition: transform 120ms ease, filter 120ms ease; }",
  ".gp-press:active:not(:disabled) { transform: translateY(2px) scale(0.98); filter: brightness(1.08); }",
  ".gp-sheet { animation: gp-up 240ms cubic-bezier(.2,1.1,.4,1); }",
  ".gp-popin { animation: gp-pop 220ms ease-out; }",
  ".gp-scroll::-webkit-scrollbar { width: 8px; height: 8px; } .gp-scroll::-webkit-scrollbar-thumb { background: rgba(160,190,255,0.25); border-radius: 8px; }",
  "@media (prefers-reduced-motion: reduce) { .gp-shimmer, .gp-glow, .gp-breathe, .gp-sheet, .gp-popin { animation: none !important; } }",
].join("\n");
