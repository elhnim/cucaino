"use client";

import { useEffect, useRef } from "react";
import type { AmbientScene, AmbientCharacter } from "@/lib/game3d/ambient";

/**
 * Full-bleed interactive 3D meadow for pre-game screens (login, kid-picker).
 * Dynamically imported so nothing WebGL-only runs during SSR — same pattern as KidGameApp.
 * Pass `characters` + `onPick` to turn it into a tap-to-choose scene (one critter per kid).
 */
export function AmbientBackdrop({
  accent = "#f97316",
  characters,
  onPick,
}: {
  accent?: string;
  characters?: AmbientCharacter[];
  onPick?: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // rebuild only when the set of characters actually changes (not on every parent render)
  const charKey = characters?.map((c) => `${c.id}:${c.animal.id}`).join("|") ?? "";

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let scene: AmbientScene | undefined;

    import("@/lib/game3d/ambient").then(({ createAmbientScene }) => {
      if (disposed || !hostRef.current) return;
      scene = createAmbientScene(hostRef.current, accent, {
        characters,
        onPick: (id) => onPickRef.current?.(id),
      });
    });

    return () => {
      disposed = true;
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  // pointerEvents auto: pages can set pointer-events:none on their overlay chrome and taps
  // on empty space fall through to the 3D critters.
  return <div ref={hostRef} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "auto" }} />;
}
