"use client";

import { useEffect, useState } from "react";

/** "reduced motion respected" (the spec's accessibility bullet): the camera's fly-to jumps
 *  straight there instead of easing, and MapCanvas skips its one looping animation (the quest
 *  badge's pulse ring) instead of running it forever. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
