"use client";

// Cucaino Karts: the race screen — the start screen (pick how fast the others are, invite a sibling
// who's at the track, or just Race!), the driving HUD (slide a finger anywhere to steer, tap to use
// an item; place, laps, coins, a little track map, "wrong way!") and the podium. Mounted by ParkApp.tsx when the kid taps
// "🏎️ Race!" at the go-karts door; the race itself runs as a ride (lib/game3d/interiors/karts.ts)
// through ParkWorld.enterRide, like mini golf. Styled with the park's own UI tokens (ui/theme.ts).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { buildKartRaceInterior, type KartGridEntry, type KartRaceControl, type KartRaceEvent } from "@/lib/game3d/interiors/karts";
import { createKartStore } from "@/lib/park/karts/store";
import { useKartNet } from "@/lib/park/karts/net";
import { buildKartTrackShape } from "@/lib/park/karts/track";
import type { GhostLap, KartNetMsg, KartRacer } from "@/lib/park/karts/types";
import { ITEM_EMOJI, ITEM_NAME, KART_ITEMS, MAX_COINS } from "@/lib/park/karts/items";
import { createKartAudio, type KartAudio } from "@/lib/park/karts/sound";
import { MAX_SPEED } from "@/lib/park/karts/physics";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";

type Peer = KartRacer & { atTrack: boolean };
type Difficulty = "easy" | "medium" | "hard";

/** (a new id whenever the circuit's shape changes: old best laps and ghosts belong to the old road) */
const TRACK_ID = "cucaino-karts-3";
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

type RankRow = { kidId: string; name: string; animal: string; lapMs: number; friend?: boolean };
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
  const [leaderboard, setLeaderboard] = useState<RankRow[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [hint, setHint] = useState(false);
  const audioRef = useRef<KartAudio | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
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
        audioRef.current?.setEngine(e.speed / (MAX_SPEED * 2.4), e.boost);
      } else if (e.type === "fx") {
        const a = audioRef.current;
        if (e.kind === "boost") a?.play("boost");
        else if (e.kind === "finalLap") {
          playSfx("coin");
          flash("🏁 Final lap!", "gold", 2000);
        } else if (e.kind === "overtake") playSfx("coin");
        else if (e.kind === "rescue") flash("🛟 Back on the track!", "cyan", 1300);
        else if (e.kind === "wall") a?.play("wall");
        else if (e.kind === "coin") a?.play("coin");
        else if (e.kind === "itemGet") a?.play("itemGet");
        else if (e.kind === "use" && e.item) {
          a?.play(e.item);
          flash(e.item === "rocket" ? "🚀 Whoosh!" : e.item === "banana" ? "🍌 Banana away!" : e.item === "shield" ? "🫧 Bubble on!" : "⭐ Star power!", e.item === "star" ? "gold" : "cyan", 1200);
        } else if (e.kind === "spin") {
          a?.play("spin");
          flash("🌀 Whoa — slipped!", "gold", 1300);
        } else if (e.kind === "shieldPop") {
          a?.play("pop");
          flash("🫧 Pop! Saved by the bubble", "good", 1300);
        } else if (e.kind === "gotcha") {
          a?.play("gotcha");
          flash(`🎯 Got ${e.name ?? "them"}!`, "good", 1300);
        } else if (e.kind === "jump") {
          a?.play("jump");
          flash("🤸 Wheee!", "cyan", 900);
        } else if (e.kind === "land") a?.play("land");
        else if (e.kind === "drift1") a?.play("drift1");
        else if (e.kind === "drift2") a?.play("drift2");
        else if (e.kind === "miniBoost") {
          a?.play("miniBoost");
          flash("⚡ Drift boost!", "gold", 900);
        }
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
        audioRef.current?.quiet();
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
    async (live?: { grid: KartGridEntry[]; startAt: number; raceId: string }) => {
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
      ctlRef.current.useItem = false;
      ctlRef.current.assist = prefsRef.current.assist ? 1 : 0;
      // (made here, inside the Race! tap, so the browser lets it play)
      audioRef.current?.dispose();
      audioRef.current = createKartAudio();
      setHint(true);
      window.setTimeout(() => setHint(false), 9000);
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
          // (smoke harness only: lets an automated run drive a whole race)
          autopilot: typeof window !== "undefined" && !!(window as unknown as { __kartAuto?: boolean }).__kartAuto,
        }),
      );
    },
    [world, kid, net, handleEvent, fact],
  );

  const racerFor = useCallback((id: string): KartRacer => knownRacers.get(id) ?? { kidId: id, name: "Racer", animal: "animal-fox", colour: "#ff7a59" }, [knownRacers]);

  const beginLiveRace = useCallback(
    (grid: string[], startAt: number, raceId: string) => {
      if (stageRef.current !== "lobby") return; // already racing — a late "start" can't join
      const live: KartGridEntry[] = grid.map((id) => ({ racer: racerFor(id), seat: id === kid.kidId ? { kind: "human" as const } : { kind: "remote" as const } }));
      void start({ grid: live, startAt, raceId });
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
        beginLiveRace(grid, startAt, m.raceId);
      } else if (m.type === "start") {
        if (!m.grid.includes(kid.kidId)) return;
        beginLiveRace(m.grid, m.startAt, m.raceId);
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
      audioRef.current?.dispose();
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

  // ── driving controls: ONE finger. Put it down anywhere and slide left or right to steer (the
  //    further, the harder; lift it to go straight); a quick tap uses the item. The keyboard works
  //    too (arrows / A D steer, space or ↓ brakes, ↑ / Enter uses the item). ──
  const held = useRef({ left: false, right: false, brake: false });
  const swipe = useRef<{ id: number | null; anchor: number; x0: number; t0: number; moved: number }>({ id: null, anchor: 0, x0: 0, t0: 0, moved: 0 });
  const showSteer = (v: number) => {
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${(v * 75).toFixed(1)}deg)`;
  };
  const applyHeld = useCallback(() => {
    const h = held.current;
    ctlRef.current.steer = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    ctlRef.current.brake = h.brake;
    showSteer(ctlRef.current.steer);
  }, []);
  const fireItem = useCallback(() => {
    ctlRef.current.useItem = true;
  }, []);
  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const sw = swipe.current;
      if (sw.id !== null) {
        fireItem(); // a second finger: that's a tap
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      swipe.current = { id: e.pointerId, anchor: e.clientX, x0: e.clientX, t0: performance.now(), moved: 0 };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const sw = swipe.current;
      if (sw.id !== e.pointerId) return;
      // full lock is a short slide; slide further and the anchor comes with the finger, so
      // sliding back the other way answers straight away
      // (a long, gentle slide: full lock used to be 44-84 px, so a small hand movement threw the
      // kart from side to side)
      const full = Math.max(110, Math.min(190, window.innerWidth * 0.17));
      let dx = e.clientX - sw.anchor;
      if (dx > full) sw.anchor = e.clientX - full;
      else if (dx < -full) sw.anchor = e.clientX + full;
      dx = e.clientX - sw.anchor;
      sw.moved = Math.max(sw.moved, Math.abs(e.clientX - sw.x0));
      const raw = Math.max(-1, Math.min(1, dx / full));
      // fine near the middle, firm at the ends: small corrections stay small
      const v = Math.abs(raw) < 0.08 ? 0 : Math.sign(raw) * Math.pow(Math.abs(raw), 1.5);
      ctlRef.current.steer = v;
      showSteer(v);
      if (sw.moved > 24) setHint(false);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const sw = swipe.current;
      if (sw.id !== e.pointerId) return;
      if (sw.moved < 14 && performance.now() - sw.t0 < 340) fireItem();
      swipe.current = { id: null, anchor: 0, x0: 0, t0: 0, moved: 0 };
      applyHeld();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      if (swipe.current.id !== e.pointerId) return;
      swipe.current = { id: null, anchor: 0, x0: 0, t0: 0, moved: 0 };
      applyHeld();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  useEffect(() => {
    if (stage !== "race") return;
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (down && !e.repeat && (k === "ArrowUp" || k === "w" || k === "W" || k === "Enter")) {
        e.preventDefault();
        fireItem();
        return;
      }
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
  }, [stage, applyHeld, fireItem]);

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
                <div style={lead}>{LAPS} laps round the track. Your kart goes by itself — slide your finger left or right to steer!</div>
                <div style={legend}>
                  <span>🎁 Drive through a box, then tap to use it</span>
                  <span>
                    {KART_ITEMS.map((it) => `${ITEM_EMOJI[it]} ${ITEM_NAME[it]}`).join("  ")}
                  </span>
                  <span>🪙 Coins make you faster · ⚡ hold a turn for a drift boost</span>
                </div>
                {bestLap !== null && <div style={chipLine}>⏱️ Your best lap: {fmtMs(bestLap)}</div>}
                <Ranking rows={leaderboard} me={kid.kidId} />

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
          <div style={swipeLayer} {...swipeHandlers} aria-label="Slide left or right to steer, tap to use your item" />
          {hud?.star && <div style={starFrame} />}
          <div style={topBar}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <div style={{ ...glass({ edge: "gold", fill: C.panel }), ...placeBox }}>
                <span style={{ ...placeText, color: PLACE_COLOUR[Math.max(0, Math.min(3, place - 1))] }}>{place ? ordinal(place) : "—"}</span>
                <span style={placeOf}>of {hud?.total ?? 4}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span key={hud?.coins ?? 0} style={{ ...glass({ edge: "soft", fill: C.panel }), ...chip, color: C.goldHi }}>
                  🪙 {hud?.coins ?? 0}
                  <span style={{ color: C.dim, fontSize: 12 }}>/{MAX_COINS}</span>
                </span>
                {hud?.shield && <span style={{ ...glass({ edge: "cyan", fill: C.panel }), ...chip }}>🫧</span>}
                {hud?.star && <span style={{ ...glass({ edge: "gold", fill: C.panel }), ...chip, animation: "kart-pulse 0.5s ease-in-out infinite" }}>⭐</span>}
              </div>
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

          {hint && !hud?.wrongWay && (
            <div style={hintWrap}>
              <div style={hintBox}>
                <span style={{ display: "inline-block", animation: "kart-slide 1.3s ease-in-out infinite" }}>👆</span> Slide left or right to steer
              </div>
            </div>
          )}

          <div style={wheelWrap} aria-hidden>
            <div ref={wheelRef} style={{ ...wheel, boxShadow: hud?.drift === 2 ? `0 0 26px 6px ${alpha("#ffa23c", 0.9)}` : hud?.drift === 1 ? `0 0 22px 5px ${alpha("#6fd0ff", 0.9)}` : wheel.boxShadow }}>
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff" strokeWidth="11" opacity="0.92" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2c44" strokeWidth="5" />
                <path d="M50 50 L14 42 M50 50 L86 42 M50 50 L50 90" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity="0.92" />
                <circle cx="50" cy="50" r="11" fill={C.gold} stroke="#ffffff" strokeWidth="3" />
                <rect x="46" y="4" width="8" height="10" rx="2" fill={C.danger} />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              fireItem();
            }}
            style={{ ...itemBtn, ...(hud?.item && !hud.rolling ? itemReady : null), opacity: hud?.item ? 1 : 0.55 }}
            aria-label={hud?.item ? `Use your ${ITEM_NAME[hud.item]}` : "No item yet"}
          >
            <span style={{ fontSize: "clamp(40px, 10vw, 58px)", lineHeight: 1 }}>{hud?.item ? (hud.rolling ? ITEM_EMOJI[KART_ITEMS[Math.floor((hud.lapMs ?? 0) / 90) % KART_ITEMS.length]] : ITEM_EMOJI[hud.item]) : "🎁"}</span>
            <span style={itemLabel}>{hud?.item ? (hud.rolling ? "…" : "TAP!") : "item"}</span>
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
                  {!!hud?.coins && <div style={chipLine}>🪙 {hud.coins} coins collected</div>}
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
            <Ranking rows={leaderboard} me={kid.kidId} />
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

/** the high-score table: every kid in the family and their friends, fastest lap first — the top
 *  few, and always the kid's own row (with its real rank) even when it's further down */
function Ranking({ rows, me }: { rows: RankRow[]; me: string }) {
  if (rows.length === 0) return null;
  const TOP = 6;
  const mine = rows.findIndex((r) => r.kidId === me);
  const shown = rows.slice(0, TOP).map((r, i) => ({ r, rank: i + 1 }));
  if (mine >= TOP) shown.push({ r: rows[mine], rank: mine + 1 });
  const anyFriend = rows.some((r) => r.friend);
  return (
    <div style={{ width: "100%" }}>
      <div style={label}>🏆 Fastest laps{anyFriend ? " — family & friends" : ""}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {shown.map(({ r, rank }, i) => (
          <div key={r.kidId}>
            {i === TOP && <div style={{ textAlign: "center", color: C.mute, lineHeight: 0.6 }}>⋮</div>}
            <div style={{ ...rankRow, ...(r.kidId === me ? rankMe : null) }}>
              <span style={{ width: 30, textAlign: "left" }}>{rank <= 3 ? medal(rank) : `${rank}.`}</span>
              <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
                {r.kidId === me ? " (you)" : r.friend ? " 🤝" : ""}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMs(r.lapMs)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── styles (inline, like the rest of the park's HUD — no utility classes) ──
const rankRow: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 10, background: C.card, color: C.text, fontWeight: 800, fontSize: 14 };
const rankMe: CSSProperties = { background: alpha(C.gold, 0.2), color: C.goldHi, boxShadow: `inset 0 0 0 1.5px ${alpha(C.gold, 0.6)}` };
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

const speedo: CSSProperties = { position: "absolute", bottom: "calc(max(16px, env(safe-area-inset-bottom)) + clamp(120px, 22vw, 166px))", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "baseline", gap: 5, pointerEvents: "none", textShadow: "0 2px 0 rgba(0,0,0,0.45)" };
const speedNum: CSSProperties = { fontFamily: FONT.display, fontSize: 34, lineHeight: 1 };
const speedUnit: CSSProperties = { fontSize: 12, fontWeight: 900, color: C.dim };

const swipeLayer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "auto", touchAction: "none", WebkitTapHighlightColor: "transparent", cursor: "grab" };
const starFrame: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 60px 18px rgba(255, 225, 77, 0.55)", animation: "kart-rainbow 1.2s linear infinite" };
const chip: CSSProperties = { borderRadius: 99, padding: "3px 11px", fontFamily: FONT.display, fontSize: 19, lineHeight: 1.2, display: "inline-flex", alignItems: "baseline", gap: 3, animation: "kart-pop 0.3s cubic-bezier(.2,1.4,.4,1)" };
const legend: CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: 13, fontWeight: 800, color: C.dim, lineHeight: 1.3, background: C.card, borderRadius: 14, padding: "8px 12px", width: "100%" };
const hintWrap: CSSProperties = { position: "absolute", left: 0, right: 0, top: "24%", display: "flex", justifyContent: "center", pointerEvents: "none" };
const hintBox: CSSProperties = { fontFamily: FONT.display, fontSize: "clamp(20px, 4.6vw, 30px)", color: "#ffffff", background: alpha("#1a1a2e", 0.72), padding: "9px 22px", borderRadius: 99, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" };
const wheelWrap: CSSProperties = { position: "absolute", left: "50%", bottom: "max(12px, env(safe-area-inset-bottom))", transform: "translateX(-50%)", pointerEvents: "none" };
const wheel: CSSProperties = { width: "clamp(112px, 21vw, 156px)", height: "clamp(112px, 21vw, 156px)", borderRadius: "50%", transition: "transform 0.06s linear, box-shadow 0.15s", boxShadow: "0 6px 16px rgba(0,0,0,0.35)" };
const itemBtn: CSSProperties = {
  position: "absolute",
  // (on the LEFT: the left thumb fires the item while the right hand steers)
  left: "max(14px, env(safe-area-inset-left))",
  bottom: "max(16px, env(safe-area-inset-bottom))",
  width: "clamp(92px, 22vw, 132px)",
  height: "clamp(92px, 22vw, 132px)",
  borderRadius: 28,
  border: `3px solid ${alpha("#ffffff", 0.85)}`,
  background: `radial-gradient(circle at 35% 30%, ${alpha("#ffffff", 0.3)}, ${alpha("#7d8cff", 0.3)} 70%)`,
  color: "#ffffff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  pointerEvents: "auto",
  cursor: "pointer",
  touchAction: "none",
  WebkitTapHighlightColor: "transparent",
};
const itemReady: CSSProperties = { background: `radial-gradient(circle at 35% 30%, ${alpha(C.goldHi, 0.95)}, ${alpha(C.goldDeep, 0.85)} 75%)`, animation: "kart-pulse 0.6s ease-in-out infinite", boxShadow: `0 0 26px ${alpha(C.gold, 0.8)}` };
const itemLabel: CSSProperties = { fontFamily: FONT.display, fontSize: 15, letterSpacing: 0.5, textShadow: "0 2px 0 rgba(0,0,0,0.4)" };

const resultRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 14, background: C.card, fontSize: 16 };
const resultMe: CSSProperties = { background: alpha(C.gold, 0.2), boxShadow: `inset 0 0 0 2px ${alpha(C.gold, 0.7)}` };

const KART_CSS = `
@keyframes kart-pop { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes kart-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes kart-slide { 0%,100% { transform: translateX(-16px); } 50% { transform: translateX(16px); } }
@keyframes kart-rainbow { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
