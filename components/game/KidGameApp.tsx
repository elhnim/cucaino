"use client";

import { useEffect, useRef } from "react";
import type { InitialGameData } from "@/lib/game/types";

/**
 * Mounts the single Phaser canvas full-viewport. Phaser is browser-only, so it
 * is imported dynamically inside the effect (never in the SSR/RSC bundle).
 */
export default function KidGameApp({ data }: { data: InitialGameData }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;

    import("@/lib/game/start").then(({ startGame }) => {
      if (cancelled || !hostRef.current) return;
      dispose = startGame(hostRef.current, data);
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
    // boot once; live updates flow through the data bridge + game events
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ position: "fixed", inset: 0, overflow: "hidden", touchAction: "none", background: "#fde7f3" }}
    />
  );
}
