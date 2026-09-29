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
}

const NEAR_VIEW = 44;
const WORLD_VIEW = ISLAND_R + 34;

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

export function MiniMap({ world, hidden, pins = [] }: { world: React.RefObject<ParkWorld | null>; hidden?: boolean; pins?: MapPin[] }) {
  const [pose, setPose] = useState<Pose | null>(null);
  const [big, setBig] = useState(false);
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
        <MapSvg pose={pose} size={128} pins={pins} />
        <span style={hereTag}>{here ? `${here.emoji} ${here.name}` : "🍭 Park trails"}</span>
      </button>
      {big && (
        <div style={bigWrap} onClick={() => setBig(false)}>
          <div style={bigCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#5a2350" }}>🗺️ Map of Cucaino Island</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#9b7090" }}>Tap a place and I&apos;ll walk you there!</div>
              </div>
              <button type="button" style={closeBtn} onClick={() => setBig(false)} aria-label="Close map">
                ✕
              </button>
            </div>
            <MapSvg pose={pose} size={0} labels onLand={goTo} onPin={goToPin} hereId={here?.id} pins={pins} />
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
}: {
  pose: Pose;
  size: number;
  labels?: boolean;
  onLand?: (l: LandDef) => void;
  onPin?: (p: MapPin) => void;
  hereId?: string;
  pins?: MapPin[];
}) {
  // big map: north-up and centred on the island; small map: follows you and turns with the camera
  const deg = labels ? 0 : (pose.yaw * 180) / Math.PI;
  const VIEW = labels ? WORLD_VIEW : NEAR_VIEW;
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
        <pattern id={`waves-${size}`} width="18" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 6 q4.5 -5 9 0 t9 0" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
        </pattern>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={-VIEW * 3} y={-VIEW * 3} width={VIEW * 6} height={VIEW * 6} fill="#8fd8f5" />
        <g transform={`rotate(${deg})${follow}`}>
          <rect x={-WORLD_VIEW * 2} y={-WORLD_VIEW * 2} width={WORLD_VIEW * 4} height={WORLD_VIEW * 4} fill={`url(#waves-${size})`} />
          {/* beach + island */}
          <path d={BEACH} fill="#ffe7bf" stroke="#ffffff" strokeWidth={2 * k} />
          <path d={COAST} fill="#a6e8bd" />
          {/* hills */}
          {HILLS.map((h, i) => (
            <ellipse key={i} cx={h.x} cy={h.z} rx={h.r} ry={h.r * 0.85} fill="#8fdcaa" stroke="#7acc98" strokeWidth={0.8} />
          ))}
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
          {pins.map((pin) => {
            // on the small map, a far-away pin sticks to the rim, pointing the way
            let p = pin;
            if (!labels) {
              const dx = pin.x - pose.x;
              const dz = pin.z - pose.z;
              const dd = Math.hypot(dx, dz);
              const max = NEAR_VIEW - 9;
              if (dd > max) p = { ...pin, x: pose.x + (dx / dd) * max, z: pose.z + (dz / dd) * max };
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
          <g transform={`translate(${pose.x} ${pose.z}) rotate(${(-pose.facing * 180) / Math.PI})`} pointerEvents="none">
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

const miniBtn: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 70px)",
  left: "max(14px, env(safe-area-inset-left))",
  zIndex: 20,
  padding: 4,
  border: "none",
  borderRadius: 999,
  background: "#ffffff",
  boxShadow: "0 4px 0 #f3b6d6, 0 8px 18px rgba(122,46,98,0.18)",
  cursor: "pointer",
};
const hereTag: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: -12,
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "3px 9px",
  borderRadius: 999,
  background: "#ffffff",
  boxShadow: "0 2px 0 #f3b6d6",
  fontWeight: 900,
  fontSize: 11.5,
  color: "#7a2e62",
};
const bigWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 45,
  background: "rgba(90,35,80,0.28)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const bigCard: React.CSSProperties = {
  width: "min(620px, 100%)",
  borderRadius: 32,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "linear-gradient(#fff8fc, #ffeaf5)",
  boxShadow: "0 8px 0 #f3b6d6, 0 20px 40px rgba(122,46,98,0.25)",
};
const closeBtn: React.CSSProperties = {
  width: 42,
  height: 42,
  flexShrink: 0,
  border: "none",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 18,
  color: "#7a2e62",
  background: "#ffffff",
  boxShadow: "0 3px 0 #f3b6d6",
  cursor: "pointer",
};
