"use client";

// Cucaino Karts: the HUD + race orchestration. Mounted by ParkApp.tsx when the kid taps "🏎️ Race!"
// at the go-karts door (panel.kind === "karts"); enters the dedicated ride scene
// (lib/game3d/interiors/karts.ts) via ParkWorld.enterRide, same pattern as mini golf/quiz coaster.
// Everything here is a plain absolutely-positioned overlay over the 3D canvas — the ride keeps
// rendering behind it (same pattern FishingGame/MarketGame use for their own overlays).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { buildKartRaceInterior, type KartGridEntry, type KartRaceControl, type KartRaceEvent } from "@/lib/game3d/interiors/karts";
import { createKartStore } from "@/lib/park/karts/store";
import { useKartNet } from "@/lib/park/karts/net";
import type { GhostLap, KartNetMsg, KartRacer } from "@/lib/park/karts/types";

type Peer = KartRacer & { atTrack: boolean };
/** how long the lobby waits to see who else is at the track before racing solo anyway — a kid
 *  tapping "Race alone" (or a peer accepting) skips this immediately */
const LOBBY_GRACE_MS = 2200;

const TRACK_ID = "cucaino-karts";

const FACTS = [
  "Real racing tyres get hot and sticky to grip the road better.",
  "A go-kart's engine is tiny but spins round super fast!",
  "Racers cut corners along a smooth “racing line” to keep more speed.",
  "The red and white stripes on a kerb help drivers spot the edge of the track.",
  "A rolling start lines karts up and lets them go all at once — just like ours!",
];

function fmtMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${rest}`;
}
function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}
function medal(p: number): string {
  return p === 1 ? "\u{1F947}" : p === 2 ? "\u{1F948}" : p === 3 ? "\u{1F949}" : `${p}.`;
}

export interface KartRaceProps {
  world: ParkWorld | null;
  familyId: string | null;
  kid: KartRacer;
  onClose: () => void;
  onToast?: (text: string) => void;
}

interface HudState {
  lap: number;
  laps: number;
  position: number;
  total: number;
  lapMs: number;
  bestLapMs: number | null;
}
type ResultEntry = Extract<KartRaceEvent, { type: "finish" }>["results"][number];

export default function KartRace({ world, familyId, kid, onClose, onToast }: KartRaceProps) {
  const [stage, setStage] = useState<"lobby" | "race">("lobby");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [waitingFor, setWaitingFor] = useState<KartRacer | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<{ raceId: string; host: KartRacer } | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [lapToast, setLapToast] = useState<string | null>(null);
  const [results, setResults] = useState<ResultEntry[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ kidId: string; name: string; animal: string; lapMs: number }[]>([]);
  const [fact] = useState(() => FACTS[Math.floor(Math.random() * FACTS.length)]);

  const ctlRef = useRef<KartRaceControl>({ steer: 0, brake: false });
  const storeRef = useRef(createKartStore());
  const net = useKartNet({ familyId, kidId: kid.kidId, racer: kid });
  const raceKey = useRef(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  // every racer we've ever heard of (peers at the track, or named in an invite) — so when a
  // "start" message arrives we can build the grid's KartRacer info for everyone in it, not just
  // whoever happens to still be in `peers` right that instant
  const knownRacers = useRef(new Map<string, KartRacer>()).current;
  knownRacers.set(kid.kidId, kid);
  const pendingRaceId = useRef<string | null>(null);

  const handleEvent = useCallback(
    (e: KartRaceEvent) => {
      if (e.type === "countdown") {
        setCountdown(e.n);
        setGo(false);
      } else if (e.type === "go") {
        setCountdown(null);
        setGo(true);
        window.setTimeout(() => setGo(false), 900);
      } else if (e.type === "hud") {
        setHud(e);
      } else if (e.type === "lap") {
        if (e.isBest) {
          setLapToast("✨ New best lap!");
          if (e.ghost) void storeRef.current.saveLap(e.ghost as GhostLap);
        } else {
          setLapToast(`Lap time: ${fmtMs(e.lapMs)}`);
        }
        window.setTimeout(() => setLapToast(null), 1800);
      } else if (e.type === "finish") {
        setResults(e.results);
        void storeRef.current
          .leaderboard(TRACK_ID)
          .then(setLeaderboard)
          .catch(() => setLeaderboard([]));
      } else if (e.type === "peerLeft") {
        onToast?.("A racer dropped out — the race goes on!");
      }
    },
    [onToast],
  );

  /** starts the ride — solo (ghosts + computer karts fill the grid) unless `live` is given, in
   *  which case the grid and shared countdown came from an agreed "start" message */
  const start = useCallback(
    async (live?: { grid: KartGridEntry[]; startAt: number }) => {
      if (!world) return;
      setStage("race");
      setWaitingFor(null);
      setIncomingInvite(null);
      setCountdown(3);
      setGo(false);
      setHud(null);
      setResults(null);
      setLapToast(null);
      raceKey.current++;
      net?.setAtTrack(true);
      const ghosts = live ? [] : await storeRef.current.ghosts(TRACK_ID).catch(() => []);
      const familyGhosts = ghosts.filter((g) => g.kidId !== kid.kidId);
      world.enterRide((accent: string) =>
        buildKartRaceInterior(accent, handleEvent, ctlRef.current, {
          trackId: TRACK_ID,
          kid,
          ghosts: familyGhosts,
          net: net ?? null,
          liveGrid: live,
          fact,
        }),
      );
    },
    [world, kid, net, handleEvent, fact],
  );

  /** build this kidId's KartRacer (from a "start" message's grid) out of whoever we already know
   *  about — a peer we've seen in the lobby, or named in the invite/accept exchange itself */
  const racerFor = useCallback(
    (id: string): KartRacer => knownRacers.get(id) ?? { kidId: id, name: "Racer", animal: "animal-fox", colour: "#ff7a59" },
    [knownRacers],
  );

  const beginLiveRace = useCallback(
    (grid: string[], startAt: number) => {
      if (stageRef.current !== "lobby") return; // already racing — a late "start" can't join
      const live: KartGridEntry[] = grid.map((id) => ({ racer: racerFor(id), seat: id === kid.kidId ? { kind: "human" as const } : { kind: "remote" as const } }));
      void start({ grid: live, startAt });
    },
    [kid.kidId, racerFor, start],
  );

  // the lobby: who else is at the track right now, and the invite/accept handshake
  useEffect(() => {
    if (!net) return;
    net.setAtTrack(true);
    const offPeers = net.onPeers((p) => {
      setPeers(p);
      for (const peer of p) knownRacers.set(peer.kidId, peer);
    });
    const offMsg = net.onMessage((m: KartNetMsg) => {
      if (stageRef.current !== "lobby") return; // the ride itself (lib/game3d/interiors/karts.ts) handles messages once racing
      if (m.type === "invite") {
        if (!m.racers.some((r) => r.kidId === kid.kidId) || m.host === kid.kidId) return;
        for (const r of m.racers) knownRacers.set(r.kidId, r);
        setIncomingInvite({ raceId: m.raceId, host: racerFor(m.host) });
      } else if (m.type === "accept") {
        if (pendingRaceId.current !== m.raceId) return;
        // the first acceptance starts the race: everyone invited races, in invite order
        const startAt = Date.now() + 4000;
        const grid = [kid.kidId, m.kidId];
        net.send({ type: "start", raceId: m.raceId, startAt, grid, laps: 3 });
        beginLiveRace(grid, startAt);
      } else if (m.type === "start") {
        if (!m.grid.includes(kid.kidId)) return;
        beginLiveRace(m.grid, m.startAt);
      }
    });
    return () => {
      offPeers();
      offMsg();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  // nobody else turns up: race solo (ghosts + computer karts) after a short grace period
  useEffect(() => {
    if (stage !== "lobby" || waitingFor || incomingInvite) return;
    if (!net) {
      void start();
      return;
    }
    const t = window.setTimeout(() => {
      if (stageRef.current === "lobby") void start();
    }, LOBBY_GRACE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, waitingFor, incomingInvite, net]);

  useEffect(() => {
    return () => {
      net?.setAtTrack(false);
      world?.exitRide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invitePeer = (peer: Peer) => {
    if (!net) return;
    const raceId = `${kid.kidId}-${Date.now()}`;
    pendingRaceId.current = raceId;
    knownRacers.set(peer.kidId, peer);
    setWaitingFor(peer);
    net.send({ type: "invite", raceId, host: kid.kidId, racers: [kid, peer] });
  };
  const acceptInvite = () => {
    if (!net || !incomingInvite) return;
    net.send({ type: "accept", raceId: incomingInvite.raceId, kidId: kid.kidId });
    // the host sends "start" once it sees our accept — we just wait for it (stay in the lobby)
  };
  const declineInvite = () => setIncomingInvite(null);
  const cancelInvite = () => {
    pendingRaceId.current = null;
    setWaitingFor(null);
  };

  const setSteer = (v: number) => {
    ctlRef.current.steer = v;
  };
  const setBrake = (v: boolean) => {
    ctlRef.current.brake = v;
  };

  const atTrackPeers = peers.filter((p) => p.atTrack);

  return (
    <div className="fixed inset-0 z-40" style={{ pointerEvents: "none" }}>
      {stage === "lobby" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-6" style={{ pointerEvents: "auto" }}>
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-white/95 p-6 text-center shadow-xl">
            <div className="text-4xl">🏎️</div>
            {incomingInvite ? (
              <>
                <div className="text-lg font-black text-slate-800">{incomingInvite.host.name} wants to race! Accept?</div>
                <div className="mt-1 flex gap-3">
                  <button onClick={acceptInvite} className="rounded-full bg-emerald-400 px-5 py-3 font-black text-white shadow active:scale-95">
                    Accept!
                  </button>
                  <button onClick={declineInvite} className="rounded-full bg-slate-200 px-5 py-3 font-black text-slate-700 shadow active:scale-95">
                    Not now
                  </button>
                </div>
              </>
            ) : waitingFor ? (
              <>
                <div className="text-lg font-black text-slate-800">Waiting for {waitingFor.name} to accept…</div>
                <div className="text-3xl">⏳</div>
                <button onClick={cancelInvite} className="rounded-full bg-slate-200 px-5 py-3 font-black text-slate-700 shadow active:scale-95">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="text-lg font-black text-slate-800">Cucaino Karts</div>
                {atTrackPeers.length > 0 ? (
                  <>
                    <div className="text-sm font-semibold text-slate-600">
                      {atTrackPeers.map((p) => p.name).join(" and ")} {atTrackPeers.length === 1 ? "is" : "are"} at the track!
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      {atTrackPeers.map((p) => (
                        <button key={p.kidId} onClick={() => invitePeer(p)} className="rounded-full bg-yellow-300 px-5 py-3 font-black text-black shadow active:scale-95">
                          🏁 Race {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-semibold text-slate-500">Nobody else is here right now — ghosts and computer karts will race you.</div>
                )}
                <button onClick={() => void start()} className="mt-1 rounded-full bg-slate-200 px-5 py-3 font-black text-slate-700 shadow active:scale-95">
                  Race alone
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {countdown !== null && countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={countdown} className="text-9xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.4)]" style={{ animation: "kart-pop 0.5s ease-out" }}>
            {countdown}
          </div>
        </div>
      )}
      {go && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-8xl font-black text-emerald-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.4)]">GO!</div>
        </div>
      )}

      {hud && !results && (
        <div className="absolute top-3 left-3 right-3 flex justify-between gap-2 text-white font-black drop-shadow">
          <div className="rounded-2xl bg-black/45 px-3 py-1.5 text-sm">
            Lap {Math.min(hud.lap, hud.laps)}/{hud.laps}
          </div>
          <div className="rounded-2xl bg-black/45 px-3 py-1.5 text-sm">
            {ordinal(hud.position)} / {hud.total}
          </div>
          <div className="rounded-2xl bg-black/45 px-3 py-1.5 text-sm">
            {fmtMs(hud.lapMs)}
            {hud.bestLapMs != null && <span className="opacity-80"> • best {fmtMs(hud.bestLapMs)}</span>}
          </div>
        </div>
      )}

      {lapToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-yellow-300 px-4 py-1.5 text-sm font-black text-black shadow-lg">{lapToast}</div>
      )}

      {!results && (
        <div className="absolute bottom-6 left-0 right-0 flex items-end justify-between px-6" style={{ pointerEvents: "auto" }}>
          <div className="flex gap-3">
            <button
              aria-label="Steer left"
              onPointerDown={() => setSteer(-1)}
              onPointerUp={() => setSteer(0)}
              onPointerLeave={() => setSteer(0)}
              onPointerCancel={() => setSteer(0)}
              className="h-20 w-20 select-none rounded-full bg-white/90 text-4xl font-black text-slate-800 shadow-lg active:scale-95"
            >
              ◀
            </button>
            <button
              aria-label="Steer right"
              onPointerDown={() => setSteer(1)}
              onPointerUp={() => setSteer(0)}
              onPointerLeave={() => setSteer(0)}
              onPointerCancel={() => setSteer(0)}
              className="h-20 w-20 select-none rounded-full bg-white/90 text-4xl font-black text-slate-800 shadow-lg active:scale-95"
            >
              ▶
            </button>
          </div>
          <button
            aria-label="Brake"
            onPointerDown={() => setBrake(true)}
            onPointerUp={() => setBrake(false)}
            onPointerLeave={() => setBrake(false)}
            onPointerCancel={() => setBrake(false)}
            className="h-24 w-24 select-none rounded-full bg-rose-500/90 text-base font-black text-white shadow-lg active:scale-95"
          >
            BRAKE
          </button>
        </div>
      )}

      {!results && !hud && (
        <div className="absolute bottom-32 left-1/2 w-[min(86vw,380px)] -translate-x-1/2 rounded-2xl bg-black/45 px-4 py-2 text-center text-xs font-semibold text-white" style={{ pointerEvents: "none" }}>
          🏁 {fact}
        </div>
      )}

      {results && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/75 p-6" style={{ pointerEvents: "auto" }}>
          <div className="text-4xl">🏆</div>
          <div className="text-2xl font-black text-white">Results</div>
          <div className="flex w-full max-w-sm flex-col gap-2">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2 text-white">
                <span className="font-black">
                  {medal(r.position)} {r.racer.name}
                </span>
                <span className="text-sm opacity-80">{r.totalMs != null ? fmtMs(r.totalMs) : "DNF"}</span>
              </div>
            ))}
          </div>
          {leaderboard.length > 0 && (
            <div className="w-full max-w-sm">
              <div className="mb-1 text-sm font-bold text-white/80">🏆 Family Best Laps</div>
              {leaderboard.slice(0, 5).map((l) => (
                <div key={l.kidId} className="flex justify-between py-0.5 text-sm text-white/90">
                  <span>{l.name}</span>
                  <span>{fmtMs(l.lapMs)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-3">
            <button onClick={() => void start()} className="rounded-full bg-yellow-300 px-5 py-3 font-black text-black shadow">
              Race again
            </button>
            <button onClick={onClose} className="rounded-full bg-white/20 px-5 py-3 font-black text-white shadow">
              Exit
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes kart-pop { from { transform: scale(1.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
