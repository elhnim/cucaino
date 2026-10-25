"use client";

// A flat <img> of a park chibi character (rendered once offscreen, cached as a data URL), so 2D UI
// shows exactly the character the kid sees in Cucaino Park. three.js is loaded lazily on first use.
// While it renders an empty box of the same size holds the space; if WebGL isn't available the
// `fallback` is shown instead.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { AnimalId } from "@/lib/park/assets/loader";
import type { ChibiAction } from "@/lib/park/characters/animate";

type PortraitModule = typeof import("@/lib/park/characters/portrait");
let mod: PortraitModule | null = null;
let modLoad: Promise<PortraitModule> | null = null;
function loadModule() {
  modLoad ??= import("@/lib/park/characters/portrait").then((m) => (mod = m));
  return modLoad;
}

export interface ChibiPortraitProps {
  id: AnimalId;
  width: number;
  height?: number;
  pose?: ChibiAction;
  framing?: "full" | "head";
  role?: "kid" | "pet";
  accent?: string;
  glow?: number;
  /** shown if the portrait can't be rendered (no WebGL) */
  fallback?: ReactNode;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export function ChibiPortrait({ id, width, height = width, pose = "idle", framing = "full", role = "pet", accent, glow, fallback = null, alt = "", className, style }: ChibiPortraitProps) {
  const opts = { id, width, height, pose, framing, role, accent, glow };
  // undefined = still rendering, null = can't render (use the fallback)
  const [src, setSrc] = useState<string | null | undefined>(() => (mod ? mod.peekPortrait(opts) ?? undefined : undefined));

  useEffect(() => {
    let live = true;
    const o = { id, width, height, pose, framing, role, accent, glow };
    const now = mod?.peekPortrait(o);
    if (now) {
      setSrc(now);
      return;
    }
    loadModule()
      .then((m) => m.chibiPortrait(o))
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [id, width, height, pose, framing, role, accent, glow]);

  if (src === null) return <>{fallback}</>;
  const box: CSSProperties = { display: "inline-block", width, height, flexShrink: 0, ...style };
  if (!src) return <span aria-hidden className={className} style={box} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a static asset
    <img src={src} alt={alt} aria-hidden={alt ? undefined : true} width={width} height={height} draggable={false} className={className} style={{ ...box, objectFit: "contain", userSelect: "none" }} />
  );
}
