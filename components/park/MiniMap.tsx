"use client";

// A little round park map in the HUD: every land, the paths, your pet and a "you are here"
// arrow. It turns with the camera, so "up" on the map is always the way you're looking and
// the joystick matches it. Tap it for the big map; tap a land there and your animal walks
// there along the park paths.
import { useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { LANDS, PARK_RADIUS, type LandDef } from "@/lib/park/registry/places";
import { playSfx } from "@/lib/audio/sound-manager";

type Pose = NonNullable<ReturnType<ParkWorld["getPose"]>>;

const PLAZA_R = 8.3; // matches the plaza the paths start from (lib/park/world/buildPark.ts)
// the big map fits every land; the small one follows you up close
const WORLD_VIEW = Math.max(...LANDS.map((l) => Math.hypot(l.x, l.z) + l.radius + 6));
const NEAR_VIEW = 40;

function plazaPoint(land: LandDef): [number, number] {
  const [fx, fz] = land.via[0] ?? land.entrance;
  const d = Math.hypot(fx, fz) || 1;
  return [(fx / d) * PLAZA_R, (fz / d) * PLAZA_R];
}

function pathOf(land: LandDef): [number, number][] {
  return [plazaPoint(land), ...land.via, land.entrance];
}

function landAt(x: number, z: number): LandDef | undefined {
  return LANDS.find((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 3);
}

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

/** Route from where the kid stands to a spot on the plaza (e.g. the Quest Board). */
export function routeToSpot(pose: { x: number; z: number }, x: number, z: number): [number, number][] {
  const here = landAt(pose.x, pose.z);
  const out = here ? [...pathOf(here)].reverse() : [];
  return [...out, [x, z]];
}

/** Route from where the kid stands to a land, following the paths through the plaza. */
export function routeTo(pose: { x: number; z: number }, to: LandDef): [number, number][] {
  const here = landAt(pose.x, pose.z);
  if (here?.id === to.id) return [[to.x, to.z]];
  const out = here ? [...pathOf(here)].reverse() : [];
  return [...out, ...pathOf(to), [to.x, to.z]];
}

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
    // stop just in front of it (the door opens the place)
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
        <span style={hereTag}>{here ? `${here.emoji} ${here.name}` : "🍭 Park paths"}</span>
      </button>
      {big && (
        <div style={bigWrap} onClick={() => setBig(false)}>
          <div style={bigCard} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#5a2350" }}>🗺️ Park Map</div>
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
  const deg = (pose.yaw * 180) / Math.PI;
  const VIEW = labels ? WORLD_VIEW : NEAR_VIEW;
  // small map: centred on the kid; big map: centred on the park
  const follow = labels ? "" : ` translate(${-pose.x} ${-pose.z})`;
  // text and emoji stay upright while the map turns
  const upright = (x: number, z: number) => `rotate(${-deg} ${x} ${z})`;
  return (
    <svg
      viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      width={size || "100%"}
      height={size || undefined}
      style={{
        display: "block",
        aspectRatio: "1",
        fontFamily: "inherit",
        maxHeight: size ? undefined : "min(70vh, 520px)",
        margin: "0 auto",
      }}
      role="img"
      aria-label="Map of Cucaino Park"
    >
      <defs>
        <clipPath id={`mm-clip-${size}`}>
          <circle r={VIEW} />
        </clipPath>
      </defs>
      <g clipPath={`url(#mm-clip-${size})`}>
        <circle r={VIEW} fill="#bff0cf" />
        <g transform={`rotate(${deg})${follow}`}>
          <circle r={PARK_RADIUS} fill="#a6e8bd" stroke="#ffffff" strokeWidth={3} />
          {LANDS.map((l) => (
            <polyline
              key={`p-${l.id}`}
              points={pathOf(l)
                .map((p) => p.join(","))
                .join(" ")}
              fill="none"
              stroke="#ff9fcd"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <circle r={PLAZA_R + 1} fill="#ffd0e6" stroke="#ff9fcd" strokeWidth={2} />
          {LANDS.map((l) => (
            <circle
              key={l.id}
              cx={l.x}
              cy={l.z}
              r={l.radius + 3}
              fill={l.ground}
              stroke={l.id === hereId ? "#ff4f9e" : "#ffffff"}
              strokeWidth={l.id === hereId ? 3.5 : 2}
              onClick={onLand ? () => onLand(l) : undefined}
              style={{ cursor: onLand ? "pointer" : undefined }}
            />
          ))}
          {/* labels after every circle, so an overlapping land never hides a name */}
          {LANDS.map((l) => (
            <g key={`t-${l.id}`} transform={upright(l.x, l.z)} onClick={onLand ? () => onLand(l) : undefined} style={{ cursor: onLand ? "pointer" : undefined }}>
              <text x={l.x} y={l.z + (labels ? 2 : 4)} textAnchor="middle" fontSize={labels ? 15 : 12}>
                {l.emoji}
              </text>
              {labels && (
                <text x={l.x} y={l.z + 11} textAnchor="middle" fontSize={6.5} fontWeight={900} fill="#5a2350" stroke="#ffffff" strokeWidth={2.2} paintOrder="stroke">
                  {l.name}
                </text>
              )}
            </g>
          ))}
          {pose.pet && <circle pointerEvents="none" cx={pose.pet.x} cy={pose.pet.z} r={labels ? 2.6 : 2} fill="#ffb020" stroke="#fff" strokeWidth={1.2} />}
          {/* important places, e.g. the Quest Board and how many quests are left */}
          {pins.map((pin) => {
            // on the small map, a far-away pin sticks to the rim, pointing the way
            let p = pin;
            if (!labels) {
              const dx = pin.x - pose.x;
              const dz = pin.z - pose.z;
              const d = Math.hypot(dx, dz);
              const max = NEAR_VIEW - 9;
              if (d > max)
                p = {
                  ...pin,
                  x: pose.x + (dx / d) * max,
                  z: pose.z + (dz / d) * max,
                };
            }
            return (
              <g key={p.id} transform={upright(p.x, p.z)} onClick={onPin ? () => onPin(p) : undefined} style={{ cursor: onPin ? "pointer" : undefined }}>
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
          {/* you are here: an arrow pointing the way your animal faces */}
          <g transform={`translate(${pose.x} ${pose.z}) rotate(${(-pose.facing * 180) / Math.PI})`} pointerEvents="none">
            <circle r={labels ? 7 : 4.5} fill="#ff4f9e" opacity={0.25}>
              <animate attributeName="r" values={labels ? "6;10;6" : "4;7;4"} dur="1.6s" repeatCount="indefinite" />
            </circle>
            <path d={labels ? "M0 6 L-4.2 -4 L0 -1.6 L4.2 -4 Z" : "M0 4.2 L-3 -2.8 L0 -1.1 L3 -2.8 Z"} fill="#ff2f8a" stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}

const miniBtn: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 58px)",
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
  width: "min(560px, 100%)",
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
