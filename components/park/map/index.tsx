"use client";

// Cucaino Park's map: one little follow-HUD (always on screen) and one big, pinch-zoomable map
// (opened on tap) — replacing the old three-tab components/park/MiniMap.tsx. This file is the
// orchestrator: it polls the engine (pose, rides, traders, fishing boats), keeps the per-kid
// "found" set, drives the trip planner/guided trip, and hands pure-rendered props down to MiniHud
// and MapScreen. Everything that can be pure logic lives in lib/park/map/**, tested there.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import type { RidePin } from "@/lib/park/world/rideables";
import { LANDS, type LandDef } from "@/lib/park/registry/places";
import { routeBetween, type P2 } from "@/lib/park/registry/island";
import { playSfx } from "@/lib/audio/sound-manager";
import { STATIC_ENTITIES, type MapEntity } from "@/lib/park/map/entities";
import { loadFoundIds } from "@/lib/park/map/foundSet";
import { planTrip, type TripOption } from "@/lib/park/map/planner";
import { advanceTrip, startTrip, tripStatus as computeTripStatus, type TripSense, type TripState } from "@/lib/park/map/tripMachine";
import { TRADERS, allTraderStates } from "@/lib/park/world/trade/plan";
import { allFishingBoatStates } from "@/lib/park/world/sea/fishingBoatsPlan";
import { MiniHud } from "./MiniHud";
import { MapScreen, type LiveMarker } from "./MapScreen";
import type { MapMarkerDraw, MapMovers } from "./MapCanvas";

type Pose = NonNullable<ReturnType<ParkWorld["getPose"]>>;

/** A marker for an important place, e.g. the Quest Board with how many quests are left. Kept the
 *  same shape components/park/ParkApp.tsx already builds (`mapPins`), so that call site barely
 *  changes. */
export interface MapPin {
  id: string;
  x: number;
  z: number;
  emoji: string;
  label: string;
  badge?: number;
  pulse?: boolean;
  /** up on a floating mountain: tapping it can't walk you there (onSkyPin explains how to fly) */
  sky?: boolean;
  far?: boolean;
  how?: string;
}

function landAt(x: number, z: number): LandDef | undefined {
  return LANDS.find((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 3);
}

/** Walk route to a land, along the trails. */
export function routeTo(pose: { x: number; z: number }, to: LandDef): P2[] {
  if (landAt(pose.x, pose.z)?.id === to.id) return [[to.x, to.z]];
  return routeBetween(pose, { x: to.x, z: to.z });
}

/** Walk route to a spot (e.g. just in front of the Quest Board or a wizard), along the trails. */
export function routeToSpot(pose: { x: number; z: number }, x: number, z: number): P2[] {
  return routeBetween(pose, { x, z });
}

function ridePinCategory(kind: RidePin["kind"]): MapEntity["category"] {
  if (kind === "dragon") return "dragon";
  if (kind === "dock") return "dock";
  return "ride";
}

export function MiniMap({
  world,
  hidden,
  pins = [],
  onSkyPin,
  onToast,
  kidId,
}: {
  world: React.RefObject<ParkWorld | null>;
  hidden?: boolean;
  pins?: MapPin[];
  onSkyPin?: (p: MapPin) => void;
  onToast?: (text: string) => void;
  /** per-kid discovery memory (lib/park/map/foundSet.ts); omit it and fog/progress just stay off */
  kidId?: string;
}) {
  const [pose, setPose] = useState<Pose | null>(null);
  const [big, setBig] = useState(false);
  const [rides, setRides] = useState<RidePin[]>([]);
  const [tradeDots, setTradeDots] = useState<{ id: string; x: number; z: number; mode: "cart" | "boat" }[]>([]);
  const [fishDots, setFishDots] = useState<{ id: string; x: number; z: number }[]>([]);
  const [foundIds, setFoundIds] = useState<string[]>(() => (kidId ? loadFoundIds(kidId) : []));
  const [target, setTarget] = useState<MapEntity | null>(null);
  const [trip, setTrip] = useState<{ option: TripOption; state: TripState } | null>(null);
  const last = useRef("");

  // poll the engine ~8x a second; only re-render pose when something visibly moved
  useEffect(() => {
    if (hidden && !big) return;
    const id = window.setInterval(() => {
      const p = world.current?.getPose() ?? null;
      if (p && !rides.length) {
        const rp = world.current?.ridePins ?? [];
        if (rp.length) setRides(rp);
      }
      const key = p ? `${p.x.toFixed(1)},${p.z.toFixed(1)},${p.facing.toFixed(2)},${p.yaw.toFixed(2)},${p.pet?.x.toFixed(0)},${p.pet?.z.toFixed(0)}` : "";
      if (key !== last.current) {
        last.current = key;
        setPose(p);
      }
      const clockT = world.current?.getClockT();
      if (clockT !== undefined) {
        const dots = allTraderStates(clockT)
          .filter((s) => s.atPostId === null)
          .map((s) => ({ id: s.id, x: s.x, z: s.z, mode: TRADERS.find((t) => t.id === s.id)!.mode }));
        setTradeDots(dots);
        setFishDots(allFishingBoatStates(clockT).map((s) => ({ id: s.id, x: s.x, z: s.z })));
      }
      if (kidId) setFoundIds(loadFoundIds(kidId));
      // advance a trip under way, from the same tick (pose + the engine's own travel getters)
      setTrip((cur) => {
        if (!cur || !p) return cur;
        const sense: TripSense = { pose: p, onTrain: !!world.current?.onTrain, railStop: world.current?.railStop ?? null, flyingTo: world.current?.flyingTo ?? null };
        const nextState = advanceTrip(cur.option.legs, cur.state, sense);
        return nextState === cur.state ? cur : { ...cur, state: nextState };
      });
    }, 125);
    return () => window.clearInterval(id);
  }, [world, hidden, big, rides.length, kidId]);

  // when the trip machine moves to a new leg, drive the engine automatically (the whole point of a
  // *guided* trip: the kid doesn't have to re-tap the map after every step)
  const drovenLeg = useRef(-1);
  useEffect(() => {
    if (!trip || !pose) return;
    if (trip.state.legIndex === drovenLeg.current || trip.state.done) return;
    drovenLeg.current = trip.state.legIndex;
    const leg = trip.option.legs[trip.state.legIndex];
    if (!leg) return;
    if (leg.mode === "fly") world.current?.flyTo(leg.x, leg.z, leg.label);
    else if (leg.mode !== "train") world.current?.walkKidPath(routeToSpot(pose, leg.x, leg.z));
    onToast?.(leg.instruction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.state.legIndex, trip?.option]);
  useEffect(() => {
    if (trip?.state.done) {
      onToast?.(`🎉 You made it to ${target?.name ?? "your trip"}!`);
      playSfx("win");
      drovenLeg.current = -1;
    }
  }, [trip?.state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveMarkers: LiveMarker[] = [
    ...pins.map((p) => ({ id: p.id, x: p.x, z: p.z, emoji: p.emoji, label: p.label, category: (p.id === "quest-board" ? "quest" : "ride") as MapEntity["category"], priority: p.pulse ? 10 : 6, badge: p.badge, pulse: p.pulse })),
    ...rides.map((r) => ({ id: r.id, x: r.x, z: r.z, emoji: r.emoji, label: r.label, category: ridePinCategory(r.kind), priority: r.kind === "dragon" ? 8 : 6 })),
  ];
  const movers: MapMovers = { tradeDots, fishDots, petAt: pose?.pet ?? null };

  const openTripBar = useCallback(
    (entity: MapEntity) => {
      setTarget(entity);
      setTrip(null);
      drovenLeg.current = -1;
    },
    [],
  );

  const onMarkerTap = useCallback(
    (m: MapMarkerDraw) => {
      if (m.count > 1) return; // a cluster: MapScreen already re-centres on tap elsewhere if wanted
      playSfx("tap");
      if (m.id.startsWith("live:")) {
        const raw = m.id.replace(/^live:/, "");
        const pin = pins.find((p) => p.id === raw);
        if (pin) {
          if (pin.sky || pin.far || pin.how) {
            onSkyPin?.(pin);
            return;
          }
          if (pose) world.current?.walkKidPath(routeToSpot(pose, pin.x, pin.z + 4));
          return;
        }
        const ride = rides.find((r) => r.id === raw);
        if (ride) {
          if (ride.sky || ride.sea || ride.how) {
            onSkyPin?.({ id: ride.id, x: ride.x, z: ride.z, emoji: ride.emoji, label: ride.label, sky: ride.sky, how: ride.how });
            return;
          }
          if (pose) {
            const d = Math.hypot(ride.x, ride.z) || 1;
            const k = ride.kind === "dragon" ? 5 : 3;
            world.current?.walkKidPath(routeToSpot(pose, ride.x - (ride.x / d) * k, ride.z - (ride.z / d) * k));
          }
          return;
        }
        return;
      }
      const entity = STATIC_ENTITIES.find((e) => e.id === m.id);
      if (entity) openTripBar(entity);
    },
    [pins, rides, pose, onSkyPin, openTripBar],
  );

  const options = target && pose ? planTrip(pose, target, { canFly: !!world.current?.canFlyTo }) : [];
  const status = trip ? computeTripStatus(trip.option.legs, trip.state, { pose, onTrain: !!world.current?.onTrain, railStop: world.current?.railStop ?? null, flyingTo: world.current?.flyingTo ?? null }) : null;

  if (!pose || (hidden && !big)) return null;
  const here = landAt(pose.x, pose.z);

  return (
    <>
      <MiniHud
        pose={pose}
        liveMarkers={liveMarkers}
        movers={movers}
        foundIds={foundIds}
        tripStatus={status}
        night={world.current?.isNight ? 1 : 0}
        size={typeof window !== "undefined" && window.innerWidth < 520 ? 96 : 128}
        onOpen={() => {
          playSfx("tap");
          setBig(true);
        }}
        hereName={here ? `${here.emoji} ${here.name}` : "🍭 Park trails"}
      />
      {big && (
        <MapScreen
          pose={pose}
          liveMarkers={liveMarkers}
          movers={movers}
          foundIds={foundIds}
          canFly={!!world.current?.canFlyTo}
          night={world.current?.isNight ? 1 : 0}
          onClose={() => setBig(false)}
          onPlan={(e) => {
            if (!e) {
              setTarget(null);
              setTrip(null);
              return;
            }
            openTripBar(e);
          }}
          activeTarget={target}
          options={options}
          tripStatus={status}
          onStartTrip={(o) => {
            playSfx("tap");
            setTrip({ option: o, state: startTrip() });
            drovenLeg.current = -1;
            setBig(false);
          }}
          onCancelTrip={() => {
            setTrip(null);
            drovenLeg.current = -1;
          }}
          onMarkerTap={onMarkerTap}
        />
      )}
      {!big && trip && target && (
        <TripToast target={target} status={status} onCancel={() => setTrip(null)} />
      )}
    </>
  );
}

/** a small persistent strip while a trip is under way and the big map's closed (so the kid still
 *  sees the current step without having to reopen the map) */
function TripToast({ target, status, onCancel }: { target: MapEntity; status: ReturnType<typeof computeTripStatus> | null; onCancel: () => void }) {
  if (!status || status.done) return null;
  return (
    <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "max(14px, env(safe-area-inset-bottom))", zIndex: 30, display: "flex", alignItems: "center", gap: 8, background: "rgba(16,14,42,0.88)", border: "1.5px solid rgba(94,242,255,0.5)", borderRadius: 999, padding: "6px 8px 6px 14px", color: "#f5f3ff", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}>
      <span style={{ fontWeight: 900, fontSize: 12.5 }}>
        {target.emoji} {status.leg?.instruction ?? "On the way…"}
      </span>
      <button type="button" onClick={onCancel} aria-label="Cancel trip" style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}

export type { MapEntity };
