"use client";

/**
 * Back-compat names for the park's panel + button. Every park screen used to be a pink "candy"
 * sheet; they now all render the magical-adventure glass look from ./GamePanel + ./GameButton.
 * Same props as before, so callers don't change.
 */
import { GamePanel } from "./GamePanel";
import { GameButton, variantForColor } from "./GameButton";

export const CandySheet = GamePanel;

/** Old candy button API -> GameButton (colour picks the nearest variant). */
export function CandyButton({
  children,
  color,
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
  const { variant, tint } = variantForColor(color);
  return (
    <GameButton variant={variant} tint={tint} onClick={onClick} disabled={disabled} small={small} style={style}>
      {children}
    </GameButton>
  );
}
