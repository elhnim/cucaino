"use client";

// The park map, drawn like a storybook: a wobbly island in a wavy sea, sandy beach, grassy hills,
// the winding stream, the trails, little trees, and every land as a soft coloured blob with its
// buildings. Everything comes from lib/park/registry/island.ts, so it always matches the 3D park.
// The little map (top-left) follows you and turns with the camera — up is the way you're looking.
// Tap it for the big map (north-up): tap a land or a pin and your animal walks there along the trails.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { LANDS, PLACES, type LandDef } from "@/lib/park/registry/places";
import { HILLS, ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS, coastR, nearStream, nearTrail, routeBetween, type P2 } from "@/lib/park/registry/island";
import { playSfx } from "@/lib/audio/sound-manager";
import { TERRAIN_EXTENT, TERRAIN_N, terrainGrid } from "@/lib/park/registry/terrain";
import { WORLD_EDGE, WORLD_PLACES, type WorldPlace } from "@/lib/park/registry/worldMap";

type Pose = NonNullable<ReturnType<ParkWorld["getPose"]>>;

/** A marker for an important place, e.g. the Quest Board with how many quests are left. */
export interface MapPin {
  id: string;
  x: number;
  z: number;
  emoji: string;
  label: string;
  /** red count bubble (e.g. quests left); 0/undefined hides it */
  badge?: number;
  /** pulse to draw the eye */
  pulse?: boolean;
  /** up on a floating mountain: tapping it can't walk you there (onSkyPin explains how to fly) */
  sky?: boolean;
  /** far out at sea (shown on the map's edge, pointing the way; onSkyPin explains how to get there) */
  far?: boolean;
  /** what to tell a kid who taps it (how to get there) */
  how?: string;
}

const NEAR_VIEW = 44;
/** the little map zooms out when you're out at sea, so the islands round about show */
const SEA_VIEW = 150;
const WORLD_VIEW = ISLAND_R + 34;
/** the big map's World view: the whole ocean, out to the edge of the world */
const GLOBE_VIEW = WORLD_EDGE + 36;

function landAt(x: number, z: number): LandDef | undefined {
  return LANDS.find((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 3);
}

/** Walk route to a land, along the trails. */
export function routeTo(pose: { x: number; z: number }, to: LandDef): [number, number][] {
  if (landAt(pose.x, pose.z)?.id === to.id) return [[to.x, to.z]];
  return routeBetween(pose, { x: to.x, z: to.z });
}

/** Walk route to a spot (e.g. just in front of the Quest Board or a wizard), along the trails. */
export function routeToSpot(pose: { x: number; z: number }, x: number, z: number): [number, number][] {
  return routeBetween(pose, { x, z });
}

// ── map artwork, computed once ──
const d = (pts: P2[], close = false) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + (close ? " Z" : "");
const ring = (extra: number) =>
  d(
    Array.from({ length: 140 }, (_, i) => {
      const a = (i / 140) * Math.PI * 2;
      const r = coastR(a) + extra;
      return [Math.sin(a) * r, Math.cos(a) * r] as P2;
    }),
    true,
  );
const COAST = ring(0);
const BEACH = ring(13);
const blob = (l: LandDef) => {
  const seed = l.x * 0.13 + l.z * 0.07;
  return d(
    Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const r = l.radius + 3 + Math.sin(a * 3 + seed) * 1.8 + Math.sin(a * 5 + seed * 2) * 1.1;
      return [l.x + Math.sin(a) * r, l.z + Math.cos(a) * r] as P2;
    }),
    true,
  );
};
const LAND_SHAPES = LANDS.filter((l) => l.id !== "gate").map((l) => ({ l, path: blob(l) }));
const TRAIL_PATHS = TRAIL_POINTS.map((pts) => d(pts));
const STREAM_PATH = d(STREAM_POINTS);
/** little trees scattered in the open meadows (none on trails, the stream or in lands) */
const TREES: { x: number; z: number; s: number; c: string }[] = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number; c: string }[] = [];
  const cols = ["#5fcf8a", "#7fdc9c", "#4fbf9a", "#9ee07a"];
  for (let tries = 0; tries < 1400 && out.length < 110; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 14 + Math.sqrt(rnd()) * (ISLAND_R - 20);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (nearTrail(x, z, 3.5) || nearStream(x, z, 2) || LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 4)) continue;
    if (HILLS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 2)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
    out.push({ x, z, s: 2.4 + rnd() * 1.6, c: cols[out.length % cols.length] });
  }
  return out;
})();
/** a shaded-relief picture of the terrain (hills, valleys, mountains, snow), drawn once */
let reliefUrl: string | null = null;
function relief(): string | null {
  if (reliefUrl || typeof document === "undefined") return reliefUrl;
  const g = terrainGrid();
  const N = TERRAIN_N;
  const S = 200;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) return null;
  const img = c.createImageData(S, S);
  const at = (i: number, j: number) => g[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = Math.round((x / (S - 1)) * (N - 1));
      const j = Math.round((y / (S - 1)) * (N - 1));
      const h = at(i, j);
      // light from the north-west
      const shade = Math.max(-1, Math.min(1, (at(i - 1, j - 1) - at(i + 1, j + 1)) * 0.35));
      let r = 124, gr = 204, b = 132;
      if (h > 6) [r, gr, b] = [110, 178, 112];
      if (h > 12) [r, gr, b] = [150, 142, 124];
      if (h > 22) [r, gr, b] = [236, 238, 250];
      const k = 1 + shade * 0.35;
      const o = (y * S + x) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, gr * k);
      img.data[o + 2] = Math.min(255, b * k);
      img.data[o + 3] = h > 0.2 ? 200 : 0;
    }
  c.putImageData(img, 0, 0);
  reliefUrl = cv.toDataURL();
  return reliefUrl;
}

const forest = LANDS.find((l) => l.id === "forest")!;
const GLOW_TREES = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.39996;
  const r = Math.sqrt((i + 0.5) / 16) * (forest.radius - 3);
  return { x: forest.x + Math.sin(a) * r, z: forest.z + Math.cos(a) * r, c: ["#8f7bff", "#6fe0ff", "#ff8ae0", "#7fffc4"][i % 4] };
});
const SEA_LIFE = [
  { e: "🐋", a: 0.6 },
  { e: "🐬", a: 2.2 },
  { e: "🪼", a: 3.3 },
  { e: "🐢", a: 4.4 },
  { e: "🐬", a: 5.4 },
].map((s) => ({ ...s, x: Math.sin(s.a) * (ISLAND_R + 24), z: Math.cos(s.a) * (ISLAND_R + 24) }));

/** far islands as rim pins on the island map (they're beyond its edge) */
const FAR_PINS: MapPin[] = WORLD_PLACES.filter((w) => w.kind === "island").map((w) => ({ id: `far:${w.id}`, x: w.x, z: w.z, emoji: w.emoji, label: w.name, far: true, how: w.how }));
const islandBlob = (w: WorldPlace, extra: number) => {
  const seed = w.x * 0.011 + w.z * 0.017;
  return d(
    Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      const r = (w.r + extra) * (1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05);
      return [w.x + Math.sin(a) * r, w.z + Math.cos(a) * r] as P2;
    }),
    true,
  );
};
const WORLD_SHAPES = WORLD_PLACES.map((w) => ({ w, beach: w.kind === "island" ? islandBlob(w, 8) : "", land: islandBlob(w, 0), crack: w.path ? d(w.path.map((p) => [p.x, p.z] as P2)) : "" }));

export function MiniMap({ world, hidden, pins = [], onSkyPin }: { world: React.RefObject<ParkWorld | null>; hidden?: boolean; pins?: MapPin[]; onSkyPin?: (p: MapPin) => void }) {
  const [pose, setPose] = useState<Pose | null>(null);
  const [big, setBig] = useState(false);
  const [globe, setGlobe] = useState(false);
  const last = useRef("");

  // poll the engine ~8x a second; only re-render when something visibly moved
  useEffect(() => {
    if (hidden && !big) return;
    const id = window.setInterval(() => {
      const p = world.current?.getPose() ?? null;
      const key = p ? `${p.x.toFixed(1)},${p.z.toFixed(1)},${p.facing.toFixed(2)},${p.yaw.toFixed(2)},${p.pet?.x.toFixed(0)},${p.pet?.z.toFixed(0)}` : "";
      if (key !== last.current) {
        last.current = key;
        setPose(p);
      }
    }, 125);
    return () => window.clearInterval(id);
  }, [world, hidden, big]);

  if (!pose || (hidden && !big)) return null;
  const here = landAt(pose.x, pose.z);

  const goTo = (land: LandDef) => {
    playSfx("tap");
    world.current?.walkKidPath(routeTo(pose, land));
    setBig(false);
  };
  const goToPin = (pin: MapPin) => {
    playSfx("tap");
    if (pin.sky || pin.far || pin.how) {
      onSkyPin?.(pin);
      setBig(false);
      return;
    }
    world.current?.walkKidPath(routeToSpot(pose, pin.x, pin.z + 4));
    setBig(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSfx("tap");
          setBig(true);
        }}
        style={miniBtn}
        aria-label="Open the park map"
      >
        <MapSvg pose={pose} size={typeof window !== "undefined" && window.innerWidth < 520 ? 96 : 128} pins={pins} />
        <span style={hereTag}>{here ? `${here.emoji} ${here.name}` : "🍭 Park trails"}</span>
      </button>
      {big && (
        <div style={bigWrap} onClick={() => setBig(false)}>
          <div style={bigCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={mapTitle}>{globe ? "🌍 Map of the World" : "🗺️ Map of Cucaino Island"}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(226,230,255,0.74)", marginTop: 2 }}>{globe ? "Tap an island to find out how to get there" : "Tap a place and I'll walk you there!"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["island", "world"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setGlobe(v === "world")} style={{ ...tabBtn, ...((v === "world") === globe ? tabOn : null) }}>
                    {v === "island" ? "🏝️ Island" : "🌍 World"}
                  </button>
                ))}
              </div>
              <button type="button" style={closeBtn} onClick={() => setBig(false)} aria-label="Close map">
                ✕
              </button>
            </div>
            <MapSvg pose={pose} size={0} labels globe={globe} onLand={goTo} onPin={goToPin} hereId={here?.id} pins={pins} />
          </div>
        </div>
      )}
    </>
  );
}

function MapSvg({
  pose,
  size,
  labels,
  onLand,
  onPin,
  hereId,
  pins = [],
  globe = false,
}: {
  pose: Pose;
  size: number;
  labels?: boolean;
  /** the World view: the whole ocean and every island (big map only) */
  globe?: boolean;
  onLand?: (l: LandDef) => void;
  onPin?: (p: MapPin) => void;
  hereId?: string;
  pins?: MapPin[];
}) {
  // big map: north-up and centred on the island; small map: follows you and turns with the camera
  const deg = labels ? 0 : (pose.yaw * 180) / Math.PI;
  const atSea = Math.hypot(pose.x, pose.z) > ISLAND_R + 28;
  const VIEW = labels ? (globe ? GLOBE_VIEW : WORLD_VIEW) : atSea ? SEA_VIEW : NEAR_VIEW;
  /** icons and labels grow with the view so they stay the same size on screen */
  const u = VIEW / (labels ? WORLD_VIEW : NEAR_VIEW);
  const follow = labels ? "" : ` translate(${-pose.x} ${-pose.z})`;
  const upright = (x: number, z: number) => (labels ? "" : `rotate(${-deg} ${x} ${z})`);
  const clipId = `mm-clip-${size}`;
  const k = labels ? 1 : 0.8; // line weights on the small map
  const placeIcons = useMemo(() => PLACES.filter((p) => p.land !== "plaza" && p.land !== "gate"), []);

  return (
    <svg
      viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      width={size || "100%"}
      height={size || undefined}
      style={{ display: "block", aspectRatio: "1", fontFamily: "inherit", maxHeight: size ? undefined : "min(72vh, 560px)", margin: "0 auto" }}
      role="img"
      aria-label="Map of Cucaino Island"
    >
      <defs>
        <clipPath id={clipId}>{labels ? <rect x={-VIEW} y={-VIEW} width={VIEW * 2} height={VIEW * 2} rx={VIEW * 0.12} /> : <circle r={VIEW} />}</clipPath>
        <clipPath id={`coast-${size}`}>
          <path d={COAST} />
        </clipPath>
        <pattern id={`waves-${size}`} width="18" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 6 q4.5 -5 9 0 t9 0" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
        </pattern>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={-VIEW * 3} y={-VIEW * 3} width={VIEW * 6} height={VIEW * 6} fill="#8fd8f5" />
        <g transform={`rotate(${deg})${follow}`}>
          <rect x={-GLOBE_VIEW * 2} y={-GLOBE_VIEW * 2} width={GLOBE_VIEW * 4} height={GLOBE_VIEW * 4} fill={`url(#waves-${size})`} />
          {/* the edge of the world (sail on past it and you come back round) */}
          {globe && (
            <g pointerEvents="none">
              <circle r={WORLD_EDGE} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={3} strokeDasharray="14 10" />
              <text x={0} y={-WORLD_EDGE - 12} textAnchor="middle" fontSize={30} fontWeight={900} fill="#1f5f8a" stroke="#ffffff" strokeWidth={6} paintOrder="stroke">
                ✨ the edge of the world — sail on and you come back round ✨
              </text>
            </g>
          )}
          {/* the far islands, the floating mountains and the Abyss */}
          {WORLD_SHAPES.map(({ w, beach, land, crack }) => (
            <g key={`w-${w.id}`} pointerEvents="none">
              {w.kind === "island" && (
                <>
                  <path d={beach} fill="#ffe7bf" stroke="#ffffff" strokeWidth={2 * k} />
                  <path d={land} fill={w.land ?? "#a6e8bd"} />
                </>
              )}
              {w.kind === "sky" && <path d={land} fill="#ffffff" fillOpacity={0.55} stroke="#b9a6ff" strokeWidth={1.4 * k} strokeDasharray="4 3" />}
              {w.kind === "abyss" && crack && (
                <>
                  <path d={crack} fill="none" stroke="#12305a" strokeOpacity={0.75} strokeWidth={w.r * 2} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={crack} fill="none" stroke="#050a1a" strokeOpacity={0.8} strokeWidth={w.r * 0.8} strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </g>
          ))}
          {(globe || (!labels && atSea)) &&
            WORLD_SHAPES.map(({ w }) => {
              const ax = w.path ? w.path[Math.floor(w.path.length / 2)].x : w.x;
              const az = w.path ? w.path[Math.floor(w.path.length / 2)].z : w.z;
              return (
                <g key={`wl-${w.id}`} transform={upright(ax, az)} onClick={onPin ? () => onPin({ id: w.id, x: w.x, z: w.z, emoji: w.emoji, label: w.name, how: w.how }) : undefined} style={{ cursor: onPin ? "pointer" : undefined }}>
                  <text x={ax} y={az + 4 * u} textAnchor="middle" fontSize={(w.kind === "sky" ? 7 : 15) * u}>
                    {w.emoji}
                  </text>
                  {labels && w.kind !== "sky" && (
                    <text x={ax} y={az + 16 * u} textAnchor="middle" fontSize={7.4 * u} fontWeight={900} fill="#5a2350" stroke="#ffffff" strokeWidth={2.4 * u} paintOrder="stroke">
                      {w.name}
                    </text>
                  )}
                </g>
              );
            })}
          {/* beach + island */}
          <path d={BEACH} fill="#ffe7bf" stroke="#ffffff" strokeWidth={2 * k} />
          <path d={COAST} fill="#a6e8bd" />
          {/* the terrain: hills, valleys and the snowy northern mountains */}
          {relief() && <image href={relief()!} x={-TERRAIN_EXTENT} y={-TERRAIN_EXTENT} width={TERRAIN_EXTENT * 2} height={TERRAIN_EXTENT * 2} preserveAspectRatio="none" clipPath={`url(#coast-${size})`} pointerEvents="none" />}
          {/* the stream */}
          <path d={STREAM_PATH} fill="none" stroke="#f5dcae" strokeWidth={STREAM_WIDTH + 2.2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={STREAM_PATH} fill="none" stroke="#6cc6f5" strokeWidth={STREAM_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={POND.x} cy={POND.z} r={POND.r + 1.4} fill="#f5dcae" />
          <circle cx={POND.x} cy={POND.z} r={POND.r} fill="#6cc6f5" />
          <circle cx={POND.x - 2} cy={POND.z + 1} r={1.1} fill="#5fcf7a" />
          <circle cx={POND.x + 2.2} cy={POND.z - 1.5} r={0.9} fill="#5fcf7a" />
          {/* lands as soft blobs */}
          {LAND_SHAPES.map(({ l, path }) => (
            <path
              key={l.id}
              d={path}
              fill={l.ground}
              fillOpacity={0.92}
              stroke={l.id === hereId ? "#ff4f9e" : "#ffffff"}
              strokeWidth={(l.id === hereId ? 3 : 1.8) * k}
              strokeDasharray={l.id === hereId ? undefined : "4 3"}
              onClick={onLand ? () => onLand(l) : undefined}
              style={{ cursor: onLand ? "pointer" : undefined }}
            />
          ))}
          {/* trails: a darker edge with a light centre, like a drawn footpath */}
          {TRAIL_PATHS.map((p, i) => (
            <path key={`e${i}`} d={p} fill="none" stroke="#e98fbf" strokeWidth={4.2 * k} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          ))}
          {TRAIL_PATHS.map((p, i) => (
            <path key={`c${i}`} d={p} fill="none" stroke="#ffd3ea" strokeWidth={2.4 * k} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          ))}
          <circle r={9.5} fill="#ffe0ef" stroke="#e98fbf" strokeWidth={2 * k} pointerEvents="none" />
          {/* meadow trees */}
          {TREES.map((t, i) => (
            <g key={i} pointerEvents="none">
              <circle cx={t.x + 0.6} cy={t.z + 0.8} r={t.s} fill="#000" opacity={0.08} />
              <circle cx={t.x} cy={t.z} r={t.s} fill={t.c} stroke="#3faa70" strokeWidth={0.6} />
            </g>
          ))}
          {GLOW_TREES.map((t, i) => (
            <circle key={`g${i}`} cx={t.x} cy={t.z} r={3.6} fill={t.c} fillOpacity={0.85} stroke="#ffffff" strokeWidth={0.6} pointerEvents="none" />
          ))}
          {/* buildings (big map) */}
          {labels &&
            placeIcons.map((p) => (
              <text key={p.id} x={p.x} y={p.z + 2.5} textAnchor="middle" fontSize={7} pointerEvents="none">
                {p.emoji}
              </text>
            ))}
          {/* sea life (big map) */}
          {labels &&
            SEA_LIFE.map((s, i) => (
              <text key={i} x={s.x} y={s.z} textAnchor="middle" fontSize={11} opacity={0.85} pointerEvents="none">
                {s.e}
              </text>
            ))}
          {/* land icons + names */}
          {LAND_SHAPES.map(({ l }) => (
            <g key={`t-${l.id}`} transform={upright(l.x, l.z)} onClick={onLand ? () => onLand(l) : undefined} style={{ cursor: onLand ? "pointer" : undefined }}>
              <text x={l.x} y={l.z + (labels ? -1 : 4)} textAnchor="middle" fontSize={labels ? 15 : 11}>
                {l.emoji}
              </text>
              {labels && (
                <g>
                  <rect x={l.x - l.name.length * 2.35 - 4} y={l.z + 5} width={l.name.length * 4.7 + 8} height={11} rx={5.5} fill="#ffffff" stroke="#f0c2dc" strokeWidth={0.8} />
                  <text x={l.x} y={l.z + 13.2} textAnchor="middle" fontSize={7.4} fontWeight={900} fill="#5a2350">
                    {l.name}
                  </text>
                </g>
              )}
            </g>
          ))}
          {/* important places, e.g. the Quest Board and how many quests are left */}
          {(globe ? [] : labels ? [...pins, ...FAR_PINS] : [...pins, ...(atSea ? [] : FAR_PINS)]).map((pin) => {
            // on the small map, a far-away pin sticks to the rim, pointing the way
            let p = pin;
            if (!labels) {
              const dx = pin.x - pose.x;
              const dz = pin.z - pose.z;
              const dd = Math.hypot(dx, dz);
              const max = VIEW - 9 * u;
              if (dd > max) p = { ...pin, x: pose.x + (dx / dd) * max, z: pose.z + (dz / dd) * max };
            } else {
              // the big map too: somewhere far out at sea (Coralcove Isle) sits on the edge, pointing the way
              const dd = Math.hypot(pin.x, pin.z);
              const max = WORLD_VIEW - 10;
              if (dd > max) p = { ...pin, x: (pin.x / dd) * max, z: (pin.z / dd) * max };
            }
            return (
              <g key={p.id} transform={upright(p.x, p.z)} onClick={onPin ? () => onPin(pin) : undefined} style={{ cursor: onPin ? "pointer" : undefined }}>
                {p.pulse && (
                  <circle cx={p.x} cy={p.z} r={labels ? 8 : 6} fill="none" stroke="#ff2f6d" strokeWidth={labels ? 2 : 1.6}>
                    <animate attributeName="r" values={labels ? "7;13;7" : "5;10;5"} dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.z} r={labels ? 7.5 : 6} fill="#ffffff" stroke="#ff9fcd" strokeWidth={1.5} />
                <text x={p.x} y={p.z + (labels ? 3.6 : 3)} textAnchor="middle" fontSize={labels ? 10 : 8.5}>
                  {p.emoji}
                </text>
                {!!p.badge && (
                  <g>
                    <circle cx={p.x + (labels ? 6.5 : 5)} cy={p.z - (labels ? 6.5 : 5)} r={labels ? 4.6 : 4} fill="#ff2f6d" stroke="#fff" strokeWidth={1} />
                    <text x={p.x + (labels ? 6.5 : 5)} y={p.z - (labels ? 4.6 : 3.3)} textAnchor="middle" fontSize={labels ? 6 : 5.2} fontWeight={900} fill="#fff">
                      {p.badge}
                    </text>
                  </g>
                )}
                {labels && (
                  <text x={p.x} y={p.z + 15} textAnchor="middle" fontSize={6} fontWeight={900} fill="#c2185b" stroke="#ffffff" strokeWidth={2.2} paintOrder="stroke">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          {pose.pet && <circle pointerEvents="none" cx={pose.pet.x} cy={pose.pet.z} r={labels ? 3 : 2} fill="#ffb020" stroke="#fff" strokeWidth={1.2} />}
          {/* you are here: an arrow pointing the way your animal faces */}
          <g transform={`translate(${pose.x} ${pose.z}) rotate(${(-pose.facing * 180) / Math.PI}) scale(${globe ? u * 0.8 : !labels && atSea ? u * 0.7 : 1})`} pointerEvents="none">
            <circle r={labels ? 8 : 4.5} fill="#ff4f9e" opacity={0.25}>
              <animate attributeName="r" values={labels ? "7;12;7" : "4;7;4"} dur="1.6s" repeatCount="indefinite" />
            </circle>
            <path d={labels ? "M0 7 L-5 -4.6 L0 -1.8 L5 -4.6 Z" : "M0 4.2 L-3 -2.8 L0 -1.1 L3 -2.8 Z"} fill="#ff2f8a" stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        </g>
        {/* compass (big map) */}
        {labels && (
          <g transform={`translate(${VIEW - 22} ${-VIEW + 22})`} pointerEvents="none">
            <circle r={13} fill="#ffffff" stroke="#f0c2dc" strokeWidth={1.5} />
            <path d="M0 -10 L3 0 L0 3 L-3 0 Z" fill="#ff4f9e" />
            <path d="M0 10 L3 0 L0 -3 L-3 0 Z" fill="#c9b8d8" />
            <text y={-15} textAnchor="middle" fontSize={7} fontWeight={900} fill="#5a2350">
              N
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

// map chrome: a gold-rimmed compass frame + dark glass, matching the park HUD (components/park/ui)
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
  left: "50%",
  bottom: -12,
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "3px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,211,107,0.7)",
  background: "rgba(16,14,42,0.9)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
  fontWeight: 900,
  fontSize: 11.5,
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
  width: "min(620px, 100%)",
  borderRadius: 22,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  border: "1.5px solid transparent",
  background: "linear-gradient(rgba(18,16,44,0.88), rgba(18,16,44,0.88)) padding-box, linear-gradient(135deg, rgba(255,233,168,0.95), rgba(232,154,28,0.6) 50%, rgba(94,242,255,0.7)) border-box",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 40px rgba(0,0,0,0.5)",
  color: "#f5f3ff",
};
const tabBtn: React.CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.35)",
  background: "rgba(20,18,50,0.7)",
  color: "#f5f3ff",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
};
const tabOn: React.CSSProperties = { border: "1.5px solid rgba(255,211,107,0.9)", background: "rgba(120,86,20,0.75)" };
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
