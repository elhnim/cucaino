"use client";

import { useEffect, useRef } from "react";
import type { PickerScene, PickerCharacter } from "@/lib/park/world/pickerScene";

/**
 * Full-bleed interactive candy meadow for login and the kid picker (lib/park/world/pickerScene).
 * Dynamically imported so nothing WebGL-only runs during SSR. Pass `characters` + `onPick`
 * to show one tappable animal per kid.
 */
export function AmbientBackdrop({
  characters,
  onPick,
}: {
  accent?: string;
  characters?: PickerCharacter[];
  onPick?: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // rebuild only when the set of characters actually changes (not on every parent render)
  const charKey = characters?.map((c) => `${c.id}:${c.animal}`).join("|") ?? "";

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let scene: PickerScene | undefined;
    import("@/lib/park/world/pickerScene").then(({ createPickerScene }) => {
      if (disposed || !hostRef.current) return;
      scene = createPickerScene(hostRef.current, { characters, onPick: (id) => onPickRef.current?.(id) });
    });
    return () => {
      disposed = true;
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  // pointerEvents auto: pages can set pointer-events:none on their overlay chrome and taps
  // on empty space fall through to the 3D animals.
  return <div ref={hostRef} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "auto", background: "linear-gradient(#b9a6ff, #ffc2e2 55%, #ffe8d2)" }} />;
}
