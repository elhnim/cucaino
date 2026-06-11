"use client";

import { useEffect, useState } from "react";
import {
  enterImmersive,
  exitImmersive,
  isImmersive,
  requestBrowserFullscreen,
  subscribe,
} from "@/lib/fullscreen/fullscreen-manager";

const DEFAULT_CLASS =
  "fixed top-[60px] right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur " +
  "shadow flex items-center justify-center text-lg active:scale-95 transition-transform";

/**
 * Drop into a game beside <GameAudio/>: hides the KidShell chrome on mount
 * (immersive), restores it on unmount (deferred 200ms so sibling-return
 * remounts don't flash the chrome), and renders the ⤡/⤢ toggle. Default
 * position sits directly below a speaker button at top-3; games whose speaker
 * is lower pass a className with the matching top from the spec table.
 */
export default function GameFullscreen({ className }: { className?: string }) {
  // Initial true matches mount behavior; synced from the manager after mount.
  const [immersive, setImmersiveState] = useState(true);

  useEffect(() => {
    enterImmersive();
    return () => exitImmersive({ deferMs: 200 });
  }, []);

  useEffect(() => {
    setImmersiveState(isImmersive());
    return subscribe(() => setImmersiveState(isImmersive()));
  }, []);

  const toggle = () => {
    if (isImmersive()) {
      exitImmersive();
    } else {
      enterImmersive();
      requestBrowserFullscreen(); // synchronously inside the tap gesture
    }
  };

  return (
    <button
      type="button"
      data-fullscreen-toggle
      onClick={toggle}
      aria-label={immersive ? "Exit full screen" : "Enter full screen"}
      className={className ?? DEFAULT_CLASS}
    >
      {immersive ? "⤡" : "⤢"}
    </button>
  );
}
