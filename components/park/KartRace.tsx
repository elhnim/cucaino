"use client";

// Cucaino Karts: the race screen — the start screen (pick how fast the others are, invite a sibling
// who's at the track, or just Race!), the driving HUD (big steer buttons, brake, place, laps, a
// little track map, "wrong way!") and the podium. Mounted by ParkApp.tsx when the kid taps
// "🏎️ Race!" at the go-karts door; the race itself runs as a ride (lib/game3d/interiors/karts.ts)
// through ParkWorld.enterRide, like mini golf. Styled with the park's own UI tokens (ui/theme.ts).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { buildKartRaceInterior, type KartGridEntry, type KartRaceControl, type KartRaceEvent } from "@/lib/game3d/interiors/karts";
import { createKartStore } from "@/lib/park/karts/store";
import { useKartNet } from "@/lib/park/karts/net";
import { buildKartTrackShape } from "@/lib/park/karts/track";
import type { GhostLap, KartNetMsg, KartRacer } from "@/lib/park/karts/types";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";

type Peer = KartRacer & { atTrack: boolean };
type Difficulty = "easy" | "medium" | "hard";

/** (a new id whenever the circuit's shape changes: old best laps and ghosts belong to the old road) */
const TRACK_ID = "cucaino-karts-2";
const LAPS = 3;

const FACTS = [
  "Real racing tyres get hot and sticky to grip the road better.",
  "A go-kart's engine is tiny but spins round super fast!",
  "Racers cut corners along a smooth “racing line” to keep more speed.",
  "The red and white stripes on a kerb help drivers spot the edge of the track.",
  "Slowing down BEFORE a bend lets you go faster out of it.",
];

function fmtMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${rest}`;
}
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const PLACE_COLOUR = ["#ffd36b", "#dfe6f5", "#f0a56b", "#b9c0dc"];
const medal = (p: number) => (p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : `${p}.`);

export interface KartRaceProps {
  world: ParkWorld | null;
  familyId: string | null;
  kid: KartRacer;
  onClose: () => void;
  onToast?: (text: string) => void;
}

type HudState = Extract<KartRaceEvent, { type: "hud" }>;
type ResultEntry = Extract<KartRaceEvent, { type: "finish" }>["results"][number];

const prefKey = (kidId: string) => `cucaino:karts:${kidId}`;
function loadPrefs(kidId: string): { difficulty: Difficulty; assist: boolean } {
  try {
    const raw = window.localStorage.getItem(prefKey(kidId));
    if (raw) {
      const p = JSON.parse(raw) as { difficulty?: Difficulty; assist?: boolean };
      return { difficulty: p.difficulty === "easy" || p.difficulty === "hard" ? p.difficulty : "medium", assist: p.assist !== false };
    }
  } catch {}
  return { difficulty: "medium", assist: true };
}

/** the circuit's outline for the little map (track-local metres -> a 100 x 62 box) */
function useTrackMap() {
  return useMemo(() => {
    const t = buildKartTrackShape();
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of t.points) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const W = 100;
    const H = 62;
    const k = Math.min((W - 10) / (x1 - x0), (H - 10) / (z1 - z0));
    const px = (x: number) => 5 + (x - x0) * k + (W - 10 - (x1 - x0) * k) / 2;
    const pz = (z: number) => 5 + (z1 - z) * k + (H - 10 - (z1 - z0) * k) / 2; // (+z is "up" the screen, like the chase camera at the start)
    const pts = t.points.map(([x, z]) => [px(x), pz(z)] as const);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
    const at = (u: number) => pts[Math.min(pts.length - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * pts.length)))];
    return { d, at, start: pts[0], W, H };
  }, []);
}

export default function KartRace({ world, familyId, kid, onClose, onToast }: KartRaceProps) {
  const [stage, setStage] = useState<"lobby" | "race">("lobby");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [waitingFor, setWaitingFor] = useState<KartRacer | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<{ raceId: string; host: KartRacer } | null>(null);
  const [prefs, setPrefs] = useState<{ difficulty: Difficulty; assist: boolean }>({ difficulty: "medium", assist: true });
  const [bestLap, setBestLap] = useState<number | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "gold" | "cyan" | "good" } | null>(null);
  const [results, setResults] = useState<ResultEntry[] | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ kidId: string; name: string; animal: string; lapMs: number }[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [pressed, setPressed] = useState<{ left: boolean; right: boolean; brake: boolean }>({ left: false, right: false, brake: false });
  const [fact] = useState(() => FACTS[Math.floor(Math.random() * FACTS.length)]);

  const ctlRef = useRef<KartRaceControl>({ steer: 0, brake: false, assist: 1 });
  const storeRef = useRef(createKartStore());
  const net = useKartNet({ familyId, kidId: kid.kidId, racer: kid });
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // every racer we've heard of (peers at the track, or named in an invite) — so a "start" message's
  // grid can be turned back into names/animals for everyone in it
  const knownRacers = useRef(new Map<string, KartRacer>()).current;
  knownRacers.set(kid.kidId, kid);
  const pendingRaceId = useRef<string | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const map = useTrackMap();

  useEffect(() => {
    setPrefs(loadPrefs(kid.kidId));
    void storeRef.current
      .leaderboard(TRACK_ID)
      .then((rows) => {
        setLeaderboard(rows);
        setBestLap(rows.find((r) => r.kidId === kid.kidId)?.lapMs ?? null);
      })
      .catch(() => {});
  }, [kid.kidId]);
  const savePrefs = (next: { difficulty: Difficulty; assist: boolean }) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(prefKey(kid.kidId), JSON.stringify(next));
    } catch {}
  };

  const flash = useCallback((text: string, tone: "gold" | "cyan" | "good" = "gold", ms = 1700) => {
    setBanner({ text, tone });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), ms);
  }, []);

  const handleEvent = useCallback(
    (e: KartRaceEvent) => {
      if (e.type === "countdown") {
        setCountdown(e.n);
        setGo(false);
        playSfx("tap");
      } else if (e.type === "go") {
        setCountdown(null);
        setGo(true);
        playSfx("correct");
        window.setTimeout(() => setGo(false), 900);
      } else if (e.type === "hud") {
        setHud(e);
      } else if (e.type === "fx") {
        if (e.kind === "boost") playSfx("sparkle");
        else if (e.kind === "finalLap") {
          playSfx("coin");
          flash("🏁 Final lap!", "gold", 2000);
        } else if (e.kind === "overtake") playSfx("coin");
        else if (e.kind === "rescue") flash("🛟 Back on the track!", "cyan", 1300);
      } else if (e.type === "lap") {
        if (e.isBest) {
          flash(`✨ Best lap! ${fmtMs(e.lapMs)}`, "good", 2200);
          if (e.ghost) {
            void storeRef.current.saveLap(e.ghost as GhostLap);
            setBestLap((cur) => {
              if (cur === null || e.lapMs < cur) {
                setNewBest(true);
                return e.lapMs;
              }
              return cur;
            });
          }
        } else flash(`Lap ${fmtMs(e.lapMs)}`, "cyan", 1500);
      } else if (e.type === "finish") {
        setResults(e.results);
        const mine = e.results.find((r) => r.kind === "human" && r.racer.kidId === kid.kidId);
        playSfx(mine && mine.position <= 3 ? "win" : "coin");
        void storeRef.current
          .leaderboard(TRACK_ID)
          .then(setLeaderboard)
          .catch(() => {});
      } else if (e.type === "peerLeft") {
        onToast?.("A racer dropped out — the race goes on!");
      }
    },
    [onToast, flash, kid.kidId],
  );

  /** starts the ride — solo (ghosts + computer karts fill the grid) unless `live` is given, in which
   *  case the grid and the shared countdown came from an agreed "start" message */
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
      setBanner(null);
      setNewBest(false);
      setConfirmExit(false);
      ctlRef.current.steer = 0;
      ctlRef.current.brake = false;
      ctlRef.current.assist = prefsRef.current.assist ? 1 : 0;
      net?.setAtTrack(true);
      const ghosts = live ? [] : await storeRef.current.ghosts(TRACK_ID).catch(() => []);
      const familyGhosts = ghosts.filter((g) => g.kidId !== kid.kidId);
      world.enterRide((accent: string) =>
        buildKartRaceInterior(accent, handleEvent, ctlRef.current, {
          trackId: TRACK_ID,
          laps: LAPS,
          kid,
          ghosts: familyGhosts,
          net: net ?? null,
          liveGrid: live,
          fact,
          difficulty: prefsRef.current.difficulty,
        }),
      );
    },
    [world, kid, net, handleEvent, fact],
  );

  const racerFor = useCallback((id: string): KartRacer => knownRacers.get(id) ?? { kidId: id, name: "Racer", animal: "animal-fox", colour: "#ff7a59" }, [knownRacers]);

  const beginLiveRace = useCallback(
    (grid: string[], startAt: number) => {
      if (stageRef.current !== "lobby") return; // already racing — a late "start" can't join
      const live: KartGridEntry[] = grid.map((id) => ({ racer: racerFor(id), seat: id === kid.kidId ? { kind: "human" as const } : { kind: "remote" as const } }));
      void start({ grid: live, startAt });
    },
    [kid.kidId, racerFor, start],
  );

  // the start screen: who else is at the track right now, and the invite/accept handshake
  useEffect(() => {
    if (!net) return;
    net.setAtTrack(true);
    const offPeers = net.onPeers((p) => {
      setPeers(p);
      for (const peer of p) knownRacers.set(peer.kidId, peer);
    });
    const offMsg = net.onMessage((m: KartNetMsg) => {
      if (stageRef.current !== "lobby") return; // the ride itself handles messages once racing
      if (m.type === "invite") {
        if (!m.racers.some((r) => r.kidId === kid.kidId) || m.host === kid.kidId) return;
        for (const r of m.racers) knownRacers.set(r.kidId, r);
        setIncomingInvite({ raceId: m.raceId, host: racerFor(m.host) });
        playSfx("sparkle");
      } else if (m.type === "accept") {
        if (pendingRaceId.current !== m.raceId) return;
        const startAt = Date.now() + 4000;
        const grid = [kid.kidId, m.kidId];
        net.send({ type: "start", raceId: m.raceId, startAt, grid, laps: LAPS });
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

  useEffect(() => {
    return () => {
      net?.setAtTrack(false);
      world?.exitRide();
      if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
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
    // the host sends "start" once it sees our accept — we just wait for it
  };

  // ── driving controls: two big buttons (each keeps its own finger even if it slides off), the
  //    brake, and the keyboard (arrows / A D to steer, space or ↓ to brake) ──
  const held = useRef({ left: false, right: false, brake: false });
  const applyHeld = useCallback(() => {
    const h = held.current;
    ctlRef.current.steer = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    ctlRef.current.brake = h.brake;
    setPressed({ ...h });
  }, []);
  const hold = (key: "left" | "right" | "brake") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      held.current[key] = true;
      applyHeld();
    },
    onPointerUp: () => {
      held.current[key] = false;
      applyHeld();
    },
    onPointerCancel: () => {
      held.current[key] = false;
      applyHeld();
    },
    onLostPointerCapture: () => {
      held.current[key] = false;
      applyHeld();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  useEffect(() => {
    if (stage !== "race") return;
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      const key = k === "ArrowLeft" || k === "a" || k === "A" ? "left" : k === "ArrowRight" || k === "d" || k === "D" ? "right" : k === " " || k === "ArrowDown" || k === "s" || k === "S" ? "brake" : null;
      if (!key) return;
      e.preventDefault();
      held.current[key] = down;
      applyHeld();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      held.current = { left: false, right: false, brake: false };
    };
  }, [stage, applyHeld]);

  const atTrackPeers = peers.filter((p) => p.atTrack);
  const racing = stage === "race" && !results;
  const place = hud?.position ?? 0;

  return (
    <div style={root}>
      <style>{PARK_CSS + KART_CSS}</style>

      {/* ───────────── the start screen ───────────── */}
      {stage === "lobby" && (
        <div style={scrim}>
          <div style={{ ...glass({ edge: "gold", fill: C.panelDeep, blur: 14 }), ...card }}>
            <button type="button" onClick={onClose} style={closeBtn} aria-label="Leave the karts">
              ✕
            </button>
            <div style={{ fontSize: 46, lineHeight: 1 }}>🏎️</div>
            <div style={title}>Cucaino Karts</div>
            {incomingInvite ? (
              <>
                <div style={lead}>{incomingInvite.host.name} wants to race you!</div>
                <div style={row}>
                  <GameButton variant="primary" big onClick={acceptInvite}>
                    🏁 Let&apos;s race!
                  </GameButton>
                  <GameButton variant="secondary" onClick={() => setIncomingInvite(null)}>
                    Not now
                  </GameButton>
                </div>
              </>
            ) : waitingFor ? (
              <>
                <div style={lead}>Waiting for {waitingFor.name}… ⏳</div>
                <GameButton
                  variant="secondary"
                  onClick={() => {
                    pendingRaceId.current = null;
                    setWaitingFor(null);
                  }}
                >
                  Cancel
                </GameButton>
              </>
            ) : (
              <>
                <div style={lead}>{LAPS} laps round the track. Your kart goes by itself — you steer!</div>
                {bestLap !== null && <div style={chipLine}>⏱️ Your best lap: {fmtMs(bestLap)}</div>}

                <div style={label}>The other racers are…</div>
                <div style={row}>
                  {(
                    [
                      ["easy", "🐢 Gentle"],
                      ["medium", "🐇 Quick"],
                      ["hard", "🚀 Fast"],
                    ] as const
                  ).map(([d, text]) => (
                    <button key={d} type="button" onClick={() => savePrefs({ ...prefs, difficulty: d })} style={{ ...pick, ...(prefs.difficulty === d ? pickOn : null) }} aria-pressed={prefs.difficulty === d}>
                      {text}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => savePrefs({ ...prefs, assist: !prefs.assist })} style={{ ...pick, ...(prefs.assist ? pickOn : null), marginTop: 2 }} aria-pressed={prefs.assist}>
                  {prefs.assist ? "🛟 Steering helper: ON" : "🛟 Steering helper: off"}
                </button>

                {atTrackPeers.length > 0 && (
                  <>
                    <div style={label}>At the track right now</div>
                    <div style={{ ...row, flexDirection: "column" }}>
                      {atTrackPeers.map((p) => (
                        <GameButton key={p.kidId} variant="secondary" tint={C.cyan} block onClick={() => invitePeer(p)}>
                          🤝 Race {p.name}
                        </GameButton>
                      ))}
                    </div>
                  </>
                )}

                <GameButton variant="primary" big block onClick={() => void start()} style={{ marginTop: 6 }}>
                  🏁 Race!
                </GameButton>
                <div style={tip}>💡 {fact}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ───────────── countdown ───────────── */}
      {stage === "race" && countdown !== null && countdown > 0 && (
        <div style={centre}>
          <div key={countdown} style={bigNumber}>
            {countdown}
          </div>
        </div>
      )}
      {go && (
        <div style={centre}>
          <div style={{ ...bigNumber, color: C.success, fontSize: "min(30vw, 190px)" }}>GO!</div>
        </div>
      )}

      {/* ───────────── driving HUD ───────────── */}
      {racing && (
        <>
          <div style={topBar}>
            <div style={{ ...glass({ edge: "gold", fill: C.panel }), ...placeBox }}>
              <span style={{ ...placeText, color: PLACE_COLOUR[Math.max(0, Math.min(3, place - 1))] }}>{place ? ordinal(place) : "—"}</span>
              <span style={placeOf}>of {hud?.total ?? 4}</span>
            </div>
            <div style={{ ...glass({ edge: "cyan", fill: C.panel }), ...lapBox }}>
              <div style={lapText}>
                Lap {hud ? Math.min(hud.lap, hud.laps) : 1}/{hud?.laps ?? LAPS}
              </div>
              <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                {Array.from({ length: hud?.laps ?? LAPS }, (_, i) => (
                  <span key={i} style={{ ...pip, background: hud && i < hud.lap - 1 ? C.gold : hud && i === hud.lap - 1 ? C.cyan : alpha("#ffffff", 0.2) }} />
                ))}
              </div>
              <div style={timeText}>
                {fmtMs(hud?.lapMs ?? 0)}
                {hud?.bestLapMs != null && <span style={{ color: C.dim }}> · best {fmtMs(hud.bestLapMs)}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setConfirmExit(true)} style={exitBtn} aria-label="Leave the race">
                ✕
              </button>
              <div style={{ ...glass({ edge: "soft", fill: C.panel }), ...mapBox }}>
                <svg viewBox={`0 0 ${map.W} ${map.H}`} width="100%" height="100%" aria-hidden>
                  <path d={map.d} fill="none" stroke={alpha("#ffffff", 0.9)} strokeWidth={5} strokeLinejoin="round" />
                  <path d={map.d} fill="none" stroke="#3b3d55" strokeWidth={3} strokeLinejoin="round" />
                  <circle cx={map.start[0]} cy={map.start[1]} r={2.2} fill="#ffffff" />
                  {(hud?.dots ?? [])
                    .slice()
                    .sort((a, b) => Number(a.me) - Number(b.me))
                    .map((dot) => {
                      const p = map.at(dot.u);
                      return <circle key={dot.id} cx={p[0]} cy={p[1]} r={dot.me ? 4.2 : 3} fill={dot.colour} stroke={dot.me ? "#ffffff" : "#1a1a2e"} strokeWidth={dot.me ? 1.6 : 0.8} />;
                    })}
                </svg>
              </div>
            </div>
          </div>

          {banner && (
            <div style={bannerWrap}>
              <div key={banner.text} style={{ ...bannerBox, background: banner.tone === "good" ? C.success : banner.tone === "cyan" ? C.cyan : C.gold }}>
                {banner.text}
              </div>
            </div>
          )}
          {hud?.wrongWay && (
            <div style={centre}>
              <div style={wrongWay}>↩️ Wrong way! Turn around</div>
            </div>
          )}

          <div style={speedo}>
            <span style={{ ...speedNum, color: hud?.boost ? C.fire : C.text }}>{hud?.speed ?? 0}</span>
            <span style={speedUnit}>{hud?.boost ? "🔥 BOOST" : "km/h"}</span>
          </div>

          <button type="button" {...hold("left")} style={{ ...steerBtn, left: "max(14px, env(safe-area-inset-left))", ...(pressed.left ? steerOn : null) }} aria-label="Steer left">
            ◀
          </button>
          <button type="button" {...hold("right")} style={{ ...steerBtn, right: "max(14px, env(safe-area-inset-right))", ...(pressed.right ? steerOn : null) }} aria-label="Steer right">
            ▶
          </button>
          <button type="button" {...hold("brake")} style={{ ...brakeBtn, ...(pressed.brake ? brakeOn : null) }} aria-label="Brake">
            🛑 Brake
          </button>

          {confirmExit && (
            <div style={scrim}>
              <div style={{ ...glass({ edge: "cyan", fill: C.panelDeep }), ...card, maxWidth: 340 }}>
                <div style={title}>Leave the race?</div>
                <div style={row}>
                  <GameButton variant="primary" onClick={() => setConfirmExit(false)}>
                    Keep racing
                  </GameButton>
                  <GameButton variant="secondary" onClick={onClose}>
                    Leave
                  </GameButton>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────────── the podium ───────────── */}
      {results && (
        <div style={scrim}>
          <div style={{ ...glass({ edge: "gold", fill: C.panelDeep, blur: 14 }), ...card, maxWidth: 440 }}>
            {(() => {
              const mine = results.find((r) => r.racer.kidId === kid.kidId && r.kind === "human");
              const p = mine?.position ?? 4;
              return (
                <>
                  <div style={{ fontSize: 54, lineHeight: 1 }}>{p === 1 ? "🏆" : p === 2 ? "🥈" : p === 3 ? "🥉" : "🏁"}</div>
                  <div style={title}>{p === 1 ? "You won!" : p <= 3 ? `${ordinal(p)} place!` : "You finished!"}</div>
                  {newBest && bestLap !== null && <div style={{ ...chipLine, background: alpha(C.success, 0.22), color: C.success }}>✨ New best lap: {fmtMs(bestLap)}</div>}
                </>
              );
            })()}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r) => {
                const me = r.racer.kidId === kid.kidId && r.kind === "human";
                return (
                  <div key={r.id} style={{ ...resultRow, ...(me ? resultMe : null) }}>
                    <span style={{ width: 34, fontSize: 20 }}>{medal(r.position)}</span>
                    <span style={{ width: 12, height: 12, borderRadius: 99, background: r.racer.colour, flex: "0 0 auto" }} />
                    <span style={{ flex: 1, textAlign: "left", fontWeight: 900 }}>
                      {r.racer.name}
                      {r.kind === "ghost" ? " 👻" : ""}
                    </span>
                    <span style={{ color: C.dim, fontVariantNumeric: "tabular-nums" }}>{r.totalMs != null ? fmtMs(r.totalMs) : "…"}</span>
                  </div>
                );
              })}
            </div>
            {leaderboard.length > 0 && (
              <div style={{ width: "100%" }}>
                <div style={label}>🏆 Family best laps</div>
                {leaderboard.slice(0, 5).map((l, i) => (
                  <div key={l.kidId} style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", color: l.kidId === kid.kidId ? C.gold : C.text, fontWeight: 800, fontSize: 14 }}>
                    <span>
                      {i + 1}. {l.name}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMs(l.lapMs)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={row}>
              <GameButton variant="primary" big onClick={() => void start()}>
                🔁 Race again
              </GameButton>
              <GameButton variant="secondary" onClick={onClose}>
                Done
              </GameButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── styles (inline, like the rest of the park's HUD — no utility classes) ──
const root: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none", fontFamily: FONT.body, color: C.text, userSelect: "none", WebkitUserSelect: "none", touchAction: "none" };
const scrim: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.scrim, padding: 16, pointerEvents: "auto", overflowY: "auto" };
const card: CSSProperties = { position: "relative", width: "100%", maxWidth: 400, borderRadius: 26, padding: "22px 20px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const title: CSSProperties = { fontFamily: FONT.display, fontSize: 30, lineHeight: 1.05, color: C.goldHi, textShadow: "0 2px 0 rgba(0,0,0,0.35)" };
const lead: CSSProperties = { fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.3 };
const label: CSSProperties = { fontSize: 12, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: C.mute, marginTop: 4, alignSelf: "flex-start" };
const row: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "100%" };
const chipLine: CSSProperties = { fontSize: 14, fontWeight: 900, padding: "5px 12px", borderRadius: 99, background: alpha(C.gold, 0.16), color: C.gold };
const tip: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: C.dim, lineHeight: 1.3, marginTop: 2 };
const pick: CSSProperties = { flex: "1 1 0", minWidth: 92, minHeight: 46, borderRadius: 16, border: `1.5px solid ${C.line}`, background: C.card, color: C.text, fontFamily: FONT.body, fontWeight: 900, fontSize: 15, cursor: "pointer", padding: "8px 10px" };
const pickOn: CSSProperties = { background: alpha(C.gold, 0.22), border: `2px solid ${C.gold}`, color: C.goldHi, boxShadow: `0 0 16px ${alpha(C.gold, 0.35)}` };
const closeBtn: CSSProperties = { position: "absolute", top: 10, right: 10, width: 40, height: 40, borderRadius: 99, border: `1.5px solid ${C.line}`, background: C.card, color: C.text, fontSize: 18, fontWeight: 900, cursor: "pointer" };

const centre: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" };
const bigNumber: CSSProperties = { fontFamily: FONT.display, fontSize: "min(42vw, 240px)", lineHeight: 1, color: "#ffffff", textShadow: "0 6px 0 rgba(0,0,0,0.35), 0 0 40px rgba(255,255,255,0.35)", animation: "kart-pop 0.55s cubic-bezier(.2,1.4,.4,1)" };

const topBar: CSSProperties = { position: "absolute", top: "max(10px, env(safe-area-inset-top))", left: "max(10px, env(safe-area-inset-left))", right: "max(10px, env(safe-area-inset-right))", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 };
const placeBox: CSSProperties = { borderRadius: 20, padding: "6px 14px 8px", display: "flex", alignItems: "baseline", gap: 6 };
const placeText: CSSProperties = { fontFamily: FONT.display, fontSize: "clamp(34px, 9vw, 54px)", lineHeight: 1, textShadow: "0 3px 0 rgba(0,0,0,0.4)" };
const placeOf: CSSProperties = { fontSize: 13, fontWeight: 900, color: C.dim };
const lapBox: CSSProperties = { borderRadius: 18, padding: "6px 14px 7px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", minWidth: 124 };
const lapText: CSSProperties = { fontFamily: FONT.display, fontSize: 22, lineHeight: 1, color: C.text };
const pip: CSSProperties = { width: 22, height: 7, borderRadius: 99 };
const timeText: CSSProperties = { fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" };
const exitBtn: CSSProperties = { pointerEvents: "auto", width: 44, height: 44, borderRadius: 99, border: `1.5px solid ${C.line}`, background: C.panel, color: C.text, fontSize: 18, fontWeight: 900, cursor: "pointer" };
const mapBox: CSSProperties = { width: "clamp(96px, 22vw, 150px)", aspectRatio: "100 / 62", borderRadius: 14, padding: 4 };

const bannerWrap: CSSProperties = { position: "absolute", top: "calc(max(10px, env(safe-area-inset-top)) + 96px)", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" };
const bannerBox: CSSProperties = { fontFamily: FONT.display, fontSize: 24, color: C.ink, padding: "7px 20px", borderRadius: 99, boxShadow: "0 6px 20px rgba(0,0,0,0.35)", animation: "kart-pop 0.4s cubic-bezier(.2,1.4,.4,1)" };
const wrongWay: CSSProperties = { fontFamily: FONT.display, fontSize: "clamp(26px, 6vw, 44px)", color: "#ffffff", background: C.danger, padding: "10px 24px", borderRadius: 22, boxShadow: "0 8px 26px rgba(0,0,0,0.45)", animation: "kart-pulse 0.7s ease-in-out infinite" };

const speedo: CSSProperties = { position: "absolute", bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 74px)", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "baseline", gap: 5, pointerEvents: "none", textShadow: "0 2px 0 rgba(0,0,0,0.45)" };
const speedNum: CSSProperties = { fontFamily: FONT.display, fontSize: 34, lineHeight: 1 };
const speedUnit: CSSProperties = { fontSize: 12, fontWeight: 900, color: C.dim };

const steerBtn: CSSProperties = {
  position: "absolute",
  bottom: "max(16px, env(safe-area-inset-bottom))",
  width: "clamp(96px, 24vw, 148px)",
  height: "clamp(96px, 24vw, 148px)",
  borderRadius: "50%",
  border: `3px solid ${alpha("#ffffff", 0.85)}`,
  background: `radial-gradient(circle at 35% 30%, ${alpha("#ffffff", 0.34)}, ${alpha("#7d8cff", 0.3)} 70%)`,
  color: "#ffffff",
  fontSize: "clamp(40px, 10vw, 62px)",
  lineHeight: 1,
  fontWeight: 900,
  textShadow: "0 3px 0 rgba(0,0,0,0.35)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  pointerEvents: "auto",
  cursor: "pointer",
  touchAction: "none",
  WebkitTapHighlightColor: "transparent",
};
const steerOn: CSSProperties = { background: `radial-gradient(circle at 35% 30%, ${alpha(C.goldHi, 0.95)}, ${alpha(C.goldDeep, 0.85)} 75%)`, color: C.ink, transform: "scale(0.94)", textShadow: "none" };
const brakeBtn: CSSProperties = {
  position: "absolute",
  bottom: "max(18px, env(safe-area-inset-bottom))",
  left: "50%",
  transform: "translateX(-50%)",
  minWidth: 132,
  height: 56,
  padding: "0 18px",
  borderRadius: 99,
  border: `2.5px solid ${alpha("#ffffff", 0.8)}`,
  background: alpha(C.dangerDeep, 0.82),
  color: "#ffffff",
  fontFamily: FONT.display,
  fontSize: 20,
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
  pointerEvents: "auto",
  cursor: "pointer",
  touchAction: "none",
  WebkitTapHighlightColor: "transparent",
};
const brakeOn: CSSProperties = { background: C.danger, transform: "translateX(-50%) scale(0.95)" };

const resultRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 14, background: C.card, fontSize: 16 };
const resultMe: CSSProperties = { background: alpha(C.gold, 0.2), boxShadow: `inset 0 0 0 2px ${alpha(C.gold, 0.7)}` };

const KART_CSS = `
@keyframes kart-pop { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes kart-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
