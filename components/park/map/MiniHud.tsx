"use client";

// The little follow-map, top-left: rotates with the camera (up = the way you're looking), zooms
// out smartly at sea / in the Wildlands so it's never an empty disc, and carries the active trip's
// arrow + distance + next-step chip when a trip is under way.
import { useMemo } from "react";
import { clusterMarkers, type ClusterInput } from "@/lib/park/map/cluster";
import { MARKER_HIDDEN_CATEGORIES, STATIC_ENTITIES } from "@/lib/park/map/entities";
import type { TripStatus } from "@/lib/park/map/tripMachine";
import { MapCanvas, type MapMarkerDraw, type MapMovers, type TripDraw } from "./MapCanvas";
import type { LiveMarker } from "./MapScreen";
import { ISLAND_R } from "@/lib/park/registry/island";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { MYSTERY_SILHOUETTE } from "./icons";

const NEAR_VIEW = 44;
const SEA_VIEW = 150;
const WILD_VIEW = 160;

export function MiniHud({
  pose,
  liveMarkers,
  movers,
  foundIds,
  tripStatus,
  night,
  size,
  onOpen,
  hereName,
}: {
  pose: { x: number; z: number; facing: number; yaw: number } | null;
  liveMarkers: LiveMarker[];
  movers: MapMovers;
  foundIds: string[];
  tripStatus: TripStatus | null;
  night: number;
  size: number;
  onOpen: () => void;
  hereName: string;
}) {
  const atSea = pose ? Math.hypot(pose.x, pose.z) > ISLAND_R + 28 : false;
  const wild = pose ? Math.hypot(pose.x, pose.z) > ISLAND_R + 40 : false;
  const view = wild ? WILD_VIEW : atSea ? SEA_VIEW : NEAR_VIEW;
  const cam = { cx: pose?.x ?? 0, cz: pose?.z ?? 0, view };
  const reducedMotion = usePrefersReducedMotion();

  const minPriority = wild || atSea ? 6 : 0;
  const clusterInput: ClusterInput[] = useMemo(() => {
    const live: ClusterInput[] = minPriority === 0 ? liveMarkers.map((m) => ({ id: `live:${m.id}`, x: m.x, z: m.z, emoji: m.emoji, priority: m.priority })) : [];
    const statics = STATIC_ENTITIES.filter((e) => !MARKER_HIDDEN_CATEGORIES.includes(e.category) && e.priority >= minPriority && Math.hypot(e.x - cam.cx, e.z - cam.cz) < view * 1.4).map((e) => {
      const hidden = e.discoverable && !foundIds.includes(e.id);
      return { id: e.id, x: e.x, z: e.z, emoji: hidden ? MYSTERY_SILHOUETTE[e.category] : e.emoji, groupKey: hidden ? `mystery:${e.category}` : undefined, priority: e.priority };
    });
    return [...live, ...statics];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMarkers, foundIds, cam.cx, cam.cz, view, minPriority]);

  // mystery pins cluster separately, at a wider radius — same reasoning as the big map
  const mysteryInput = clusterInput.filter((c) => c.groupKey?.startsWith("mystery:"));
  const normalInput = clusterInput.filter((c) => !c.groupKey?.startsWith("mystery:"));
  const clustered = [...clusterMarkers(normalInput, cam, size, size, 22), ...clusterMarkers(mysteryInput, cam, size, size, 30)];
  const markers: MapMarkerDraw[] = clustered.map((c) => {
    const liveHit = c.count === 1 ? liveMarkers.find((m) => `live:${m.id}` === c.id) : undefined;
    const mystery = clusterInput.find((ci) => ci.id === c.memberIds[0])?.groupKey?.startsWith("mystery:") ?? false;
    return { ...c, badge: liveHit?.badge, pulse: liveHit?.pulse, mystery };
  });

  const tripDraw: TripDraw | null = tripStatus?.leg && pose ? { points: [[pose.x, pose.z], [tripStatus.leg.x, tripStatus.leg.z]], next: { x: tripStatus.leg.x, z: tripStatus.leg.z } } : null;

  if (!pose) return null;
  return (
    <button type="button" onClick={onOpen} style={miniBtn} aria-label="Open the park map">
      <MapCanvas mode="mini" width={size} height={size} camera={cam} yaw={pose.yaw} pose={pose} markers={markers} movers={movers} trip={tripDraw} night={night} reducedMotion={reducedMotion} />
      <span style={hereTag}>{tripStatus?.leg ? `${Math.round(tripStatus.remaining ?? 0)} m · ${tripStatus.leg.label}` : hereName}</span>
    </button>
  );
}

const miniBtn: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 88px)",
  left: "max(14px, env(safe-area-inset-left))",
  zIndex: 20,
  padding: 3,
  border: "none",
  borderRadius: 999,
  background: "conic-gradient(from 200deg, #ffe9a8, #e89a1c, #ffd36b, #fff2c2, #e89a1c, #ffe9a8)",
  boxShadow: "0 0 14px rgba(255,211,107,0.35), 0 8px 18px rgba(0,0,0,0.45)",
  cursor: "pointer",
};
const hereTag: React.CSSProperties = {
  position: "absolute",
  // anchored to the HUD button's own left edge (not centred on it): a trip's "145 m · Walk to
  // Great Lake Jetty" can be wider than the little HUD circle itself, and centring it let the
  // left half run straight off a narrow phone screen. Capped to the viewport width (minus the
  // same margin the button keeps from the edge) and ellipsized, never wrapped — a second line
  // would creep down over the map below it.
  left: 0,
  maxWidth: "calc(100vw - 28px)",
  bottom: -12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  padding: "3px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,211,107,0.7)",
  background: "rgba(16,14,42,0.9)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
  fontWeight: 900,
  fontSize: 11.5,
  color: "#f5f3ff",
};
