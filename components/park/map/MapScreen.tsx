"use client";

// The big map: one continuous, pinch-zoomable, pannable picture from the whole ocean down to a
// single park land — no more Park/Island/World tabs. Owns the camera (pan/zoom gestures), the
// Where-to panel, and the trip bar; MapCanvas.tsx does the actual drawing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Camera } from "@/lib/park/map/camera";
import { bandFor, lerpCamera, minPriorityForBand, pan as panCamera, setViewMax, worldToScreen, zoomAt } from "@/lib/park/map/camera";
import { clusterMarkers, visibleItems, type ClusterInput } from "@/lib/park/map/cluster";
import { MARKER_HIDDEN_CATEGORIES, PROGRESS_GROUPS, STATIC_ENTITIES, type MapEntity } from "@/lib/park/map/entities";
import { countFound } from "@/lib/park/map/foundSet";
import { planTrip, type TripOption } from "@/lib/park/map/planner";
import type { TripStatus } from "@/lib/park/map/tripMachine";
import { MapCanvas, WORLD_VIEW, type MapMarkerDraw, type MapMovers, type TripDraw } from "./MapCanvas";
import { WhereToPanel } from "./WhereToPanel";
import { TripBar } from "./TripBar";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { MYSTERY_SILHOUETTE } from "./icons";
import { ISLAND_VIEW } from "@/lib/park/registry/worldMap";

// the camera's ceiling has to actually reach the real edge of the world (plus a little slack for
// the "World" quick-zoom below) — the module default is a placeholder until this runs once
setViewMax(WORLD_VIEW * 1.25);

export interface LiveMarker {
  id: string;
  x: number;
  z: number;
  emoji: string;
  label: string;
  category: MapEntity["category"];
  priority: number;
  badge?: number;
  pulse?: boolean;
}

export function MapScreen({
  pose,
  liveMarkers,
  movers,
  foundIds,
  canFly,
  night,
  onClose,
  onPlan,
  activeTarget,
  options,
  tripStatus,
  onStartTrip,
  onCancelTrip,
  onMarkerTap,
}: {
  pose: { x: number; z: number; facing: number } | null;
  liveMarkers: LiveMarker[];
  movers: MapMovers;
  foundIds: string[];
  canFly: boolean;
  night: number;
  onClose: () => void;
  onPlan: (e: MapEntity | null) => void;
  activeTarget: MapEntity | null;
  options: TripOption[];
  tripStatus: TripStatus | null;
  onStartTrip: (o: TripOption) => void;
  onCancelTrip: () => void;
  /** a marker (or a cluster's representative) was tapped on the canvas itself, not the Where-to list */
  onMarkerTap: (marker: MapMarkerDraw) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 500 });
  const [showWhereTo, setShowWhereTo] = useState(false);
  // the big map's canvas is much larger than the little HUD, so the same `view` reads far more
  // zoomed-in on it — the park's default view is wider than the HUD's NEAR_VIEW to compensate (the
  // old fixed-tab map used ~186 for its big "Park" tab for the same reason)
  const [cam, setCam] = useState<Camera>(() => ({ cx: pose?.x ?? 0, cz: pose?.z ?? 0, view: 160 }));
  const animRef = useRef<{ from: Camera; to: Camera; t0: number; dur: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const reducedMotion = usePrefersReducedMotion();
  const flyCameraTo = useCallback((to: Camera, dur = 650) => {
    if (reducedMotion) {
      setCam(to);
      return;
    }
    animRef.current = { from: cam, to, t0: performance.now(), dur };
    const step = (t: number) => {
      const a = animRef.current;
      if (!a) return;
      const k = Math.min(1, (t - a.t0) / a.dur);
      setCam(lerpCamera(a.from, a.to, k));
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else animRef.current = null;
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, reducedMotion]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── gestures: drag to pan, wheel/pinch to zoom ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragLast = useRef<{ x: number; y: number } | null>(null);
  const pinchD0 = useRef<number | null>(null);
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragLast.current = { x: e.clientX, y: e.clientY };
      tapStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    } else {
      tapStart.current = null;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchD0.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      tapStart.current = null;
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD0.current && d > 4) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const rect = hostRef.current!.getBoundingClientRect();
        setCam((c) => zoomAt(c, size.w, size.h, d / pinchD0.current!, mx - rect.left, my - rect.top));
        pinchD0.current = d;
      }
      return;
    }
    if (tapStart.current && Math.hypot(e.clientX - tapStart.current.x, e.clientY - tapStart.current.y) > 9) tapStart.current = null;
    if (dragLast.current) {
      const dx = e.clientX - dragLast.current.x;
      const dy = e.clientY - dragLast.current.y;
      dragLast.current = { x: e.clientX, y: e.clientY };
      setCam((c) => panCamera(c, size.w, size.h, dx, dy));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchD0.current = null;
    if (pointers.current.size === 0) dragLast.current = null;
    const tap = tapStart.current;
    tapStart.current = null;
    if (!tap || performance.now() - tap.t > 500) return;
    const rect = hostRef.current!.getBoundingClientRect();
    const sx = tap.x - rect.left;
    const sy = tap.y - rect.top;
    let best: MapMarkerDraw | null = null;
    let bestD = 30; // px hit radius — generous for small fingers
    for (const m of markerDraws) {
      const [mx, my] = worldToScreen(cam, size.w, size.h, m.x, m.z);
      const d = Math.hypot(mx - sx, my - sy);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) onMarkerTap(best);
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = hostRef.current!.getBoundingClientRect();
    const factor = Math.pow(1.0015, -e.deltaY);
    setCam((c) => zoomAt(c, size.w, size.h, factor, e.clientX - rect.left, e.clientY - rect.top));
  };

  // ── markers: live (quest badge, dragons, docks…) + every static registry entity except the
  // quest board itself (its live badge/pulse already comes through liveMarkers) ──
  const allEntities = useMemo(() => STATIC_ENTITIES, []);
  const band = bandFor(cam.view, ISLAND_VIEW, WORLD_VIEW);
  const clusterInput: ClusterInput[] = useMemo(() => {
    const minPriority = minPriorityForBand(band);
    // the live layer (quest badge, dragons, docks…) is small and already right by the kid — only
    // the registry-wide static layer needs the zoomed-out priority cutoff
    const live: ClusterInput[] = band === "close" || band === "park" ? liveMarkers.map((m) => ({ id: `live:${m.id}`, x: m.x, z: m.z, emoji: m.emoji, priority: m.priority })) : [];
    const statics = allEntities
      .filter((e) => !MARKER_HIDDEN_CATEGORIES.includes(e.category) && e.priority >= minPriority)
      .map((e) => {
        const hidden = e.discoverable && !foundIds.includes(e.id);
        return { id: e.id, x: e.x, z: e.z, emoji: hidden ? MYSTERY_SILHOUETTE[e.category] : e.emoji, groupKey: hidden ? `mystery:${e.category}` : undefined, priority: hidden ? e.priority - 2 : e.priority };
      });
    return [...live, ...visibleItems(statics, cam, 1.3)];
  }, [liveMarkers, allEntities, foundIds, cam, band]);

  // mystery pins cluster separately, at a wider radius than everything else: at the Park zoom a
  // dozen undiscovered floating islands otherwise scatter as a dozen meaningless "?" — grouped more
  // aggressively they read as one "☁️ x12" instead
  const clustered = useMemo(() => {
    const mysteryInput = clusterInput.filter((c) => c.groupKey?.startsWith("mystery:"));
    const normalInput = clusterInput.filter((c) => !c.groupKey?.startsWith("mystery:"));
    const mysteryRadius = band === "close" || band === "park" ? 64 : 40;
    // (on a phone the pins gather into fewer, bigger groups — more so the further out you look —
    //  so each one stays a clear thing to tap instead of a pile)
    const phone = size.w < 520;
    const gap = phone ? (band === "world" ? 64 : band === "island" ? 50 : 42) : 34;
    return [...clusterMarkers(normalInput, cam, size.w, size.h, gap), ...clusterMarkers(mysteryInput, cam, size.w, size.h, Math.max(gap, mysteryRadius))];
  }, [clusterInput, cam, size.w, size.h, band]);
  const markerDraws: MapMarkerDraw[] = useMemo(
    () =>
      clustered.map((c) => {
        const liveHit = c.count === 1 ? liveMarkers.find((m) => `live:${m.id}` === c.id) : undefined;
        const mystery = clusterInput.find((ci) => ci.id === c.memberIds[0])?.groupKey?.startsWith("mystery:") ?? false;
        return { ...c, badge: liveHit?.badge, pulse: liveHit?.pulse, mystery };
      }),
    [clustered, liveMarkers, clusterInput],
  );

  const tripDraw: TripDraw | null = useMemo(() => {
    if (!tripStatus?.leg || !pose) return null;
    return { points: [[pose.x, pose.z], [tripStatus.leg.x, tripStatus.leg.z]], next: { x: tripStatus.leg.x, z: tripStatus.leg.z } };
  }, [tripStatus, pose]);

  const progress = PROGRESS_GROUPS.map((g) => ({ ...g, have: countFound(foundIds, g.ids) }));

  const pickEntity = (e: MapEntity) => {
    onPlan(e);
    setShowWhereTo(false);
    flyCameraTo({ cx: e.x, cz: e.z, view: Math.max(90, cam.view * 0.6) });
  };

  const quickZoom = (which: "park" | "island" | "world") => {
    if (which === "park") flyCameraTo({ cx: 0, cz: 0, view: 160 });
    else if (which === "island") flyCameraTo({ cx: 0, cz: -400, view: ISLAND_VIEW * 0.72 });
    else flyCameraTo({ cx: 0, cz: 0, view: WORLD_VIEW * 1.18 }); // a little slack so the far islands never sit right on the frame edge
  };
  const recenter = () => pose && flyCameraTo({ cx: pose.x, cz: pose.z, view: Math.min(cam.view, 160) });

  return (
    <div style={bigWrap} onClick={onClose}>
      <div style={bigCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={mapTitle}>🗺️ Map of Cucaino Island</div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close map">
            ✕
          </button>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(226,230,255,0.7)" }}>
          {progress.map((g) => `${g.emoji} ${g.label} ${g.have}/${g.ids.length}`).join(" · ")}
        </div>
        <div
          ref={hostRef}
          style={canvasHost}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {size.w > 0 && (
            <MapCanvas mode="big" width={size.w} height={size.h} camera={cam} yaw={0} pose={pose} markers={markerDraws} movers={movers} trip={tripDraw} night={night} reducedMotion={reducedMotion} />
          )}
          <div style={chipsRow}>
            <button type="button" style={quickChip} onClick={() => quickZoom("park")}>
              🏠 Park
            </button>
            <button type="button" style={quickChip} onClick={() => quickZoom("island")}>
              🏝️ Island
            </button>
            <button type="button" style={quickChip} onClick={() => quickZoom("world")}>
              🌍 World
            </button>
            <button type="button" style={{ ...quickChip, marginLeft: "auto" }} onClick={recenter} aria-label="Recenter on me">
              📍 Me
            </button>
            <button type="button" style={{ ...quickChip, ...(showWhereTo ? quickChipOn : null) }} onClick={() => setShowWhereTo((v) => !v)}>
              🔎 Where to?
            </button>
          </div>
          {showWhereTo && (
            <div style={whereToSheet}>
              <WhereToPanel entities={allEntities} pose={pose} foundIds={foundIds} canFly={canFly} onPick={pickEntity} />
            </div>
          )}
        </div>
      </div>
      {activeTarget && (
        // a sibling of bigCard, not a child of it — it needs its own stopPropagation, or any tap
        // inside it (picking "Train", dismissing it) bubbles up to bigWrap's backdrop-click and
        // closes the whole map out from under the kid
        <div onClick={(e) => e.stopPropagation()}>
          <TripBar target={activeTarget} options={options} status={tripStatus} onStart={onStartTrip} onCancel={onCancelTrip} onClose={() => onPlan(null)} />
        </div>
      )}
    </div>
  );
}

const bigWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 45,
  background: "rgba(5,4,18,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const bigCard: React.CSSProperties = {
  width: "min(760px, 100%)",
  height: "min(88vh, 860px)",
  borderRadius: 22,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  border: "1.5px solid transparent",
  background: "linear-gradient(rgba(18,16,44,0.88), rgba(18,16,44,0.88)) padding-box, linear-gradient(135deg, rgba(255,233,168,0.95), rgba(232,154,28,0.6) 50%, rgba(94,242,255,0.7)) border-box",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 40px rgba(0,0,0,0.5)",
  color: "#f5f3ff",
};
const mapTitle: React.CSSProperties = {
  fontFamily: "var(--font-park-display), 'Lilita One', system-ui, sans-serif",
  fontWeight: 400,
  fontSize: 22,
  letterSpacing: 0.4,
  color: "#f5f3ff",
  textShadow: "0 2px 0 rgba(0,0,0,0.35), 0 0 16px rgba(94,242,255,0.3)",
};
const closeBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  border: "1.5px solid rgba(160,200,255,0.4)",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 17,
  color: "#f5f3ff",
  background: "radial-gradient(circle at 50% 30%, rgba(90,86,160,0.7), rgba(20,18,50,0.85))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.35)",
  cursor: "pointer",
};
const canvasHost: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 220,
  borderRadius: 18,
  overflow: "hidden",
  touchAction: "none",
  border: "1px solid rgba(160,200,255,0.25)",
};
const chipsRow: React.CSSProperties = {
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 10,
  display: "flex",
  // (on a narrow screen the five buttons wrap onto two rows instead of running off the edge)
  flexWrap: "wrap-reverse",
  gap: 6,
  pointerEvents: "none",
};
const quickChip: React.CSSProperties = {
  pointerEvents: "auto",
  minHeight: 44,
  padding: "0 10px",
  whiteSpace: "nowrap",
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.4)",
  background: "rgba(16,14,42,0.82)",
  color: "#f5f3ff",
  fontWeight: 900,
  fontSize: 12.5,
  cursor: "pointer",
  boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
};
const quickChipOn: React.CSSProperties = { border: "1.5px solid rgba(255,211,107,0.9)", background: "rgba(120,86,20,0.85)" };
const whereToSheet: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 62, // leaves the quick-zoom/Where-to chip row reachable, to collapse it again
  maxHeight: "64%",
  padding: "12px 10px 10px",
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  background: "linear-gradient(rgba(14,12,36,0.97), rgba(14,12,36,0.97))",
  borderTop: "1.5px solid rgba(160,200,255,0.3)",
  boxShadow: "0 -10px 24px rgba(0,0,0,0.45)",
  overflow: "hidden",
};
