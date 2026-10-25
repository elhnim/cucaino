"use client";

import { useEffect, useState } from "react";

// Pages opened from inside the 3D world (games, the full week, badges...) run in an in-world
// window (components/game/WorldPageWindow.tsx), which is an iframe. Those pages hide their
// own header/nav and the "back to park" button, because the window provides the way back.

export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent: definitely framed
  }
}

export function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(isEmbedded()), []);
  return embedded;
}

export const CLOSE_WINDOW_MESSAGE = "cucaino:close-world-window";

/** From inside an in-world window: ask the world to close it (e.g. a page tried to open the world). */
export function closeWorldWindow() {
  try {
    window.parent.postMessage({ type: CLOSE_WINDOW_MESSAGE }, window.location.origin);
  } catch {
    // not framed / parent gone — nothing to do
  }
}
