"use client";

// Climb Everest! — a guided, roped climb from Base Camp to the summit, walked on the REAL mountain
// (registry/everestRoute.ts), not a separate scene — the same idea as riding the Wildlands Railway
// (ParkWorld's boardTrain/leaveTrain), just a hiking route instead of the rails. This component is
// the 2D HUD laid over the 3D world while climbing — the altitude meter, the breath meter, the two
// big buttons (Climb! / Breathe) and the fact cards. All the PROGRESS logic lives in
// lib/park/climbing/logic.ts (pure, tested): this component just reads it and feeds
// ParkWorld.setClimbProgress() so the kid's own animal eases smoothly towards wherever they've
// climbed to, with a Sherpa guide roped just ahead. Thin air is gentle on purpose — running low on
// breath only pauses the climb until the kid taps Breathe; there is no way to fail or lose, and
// leaving early always returns the kid safely to Base Camp.
import { useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { getParkAnimal } from "@/lib/park/registry/animals";
import {
  BREATH_MAX,
  breathe,
  climbStep,
  currentAltitude,
  currentCamp,
  initialClimbState,
  isSummited,
  justArrivedCamp,
  nextCamp,
  overallProgress,
  type ClimbState,
} from "@/lib/park/climbing/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";
import { IconChip } from "./ui/IconChip";

export interface EverestClimbProps {
  open: boolean;
  onClose: () => void;
  world: ParkWorld | null;
  kidId: string;
  kidName?: string;
  animalId?: string | null;
  night?: boolean;
}

export function EverestClimb({ open, onClose, world, kidId, kidName, animalId }: EverestClimbProps) {
  const [state, setState] = useState<ClimbState>(() => initialClimbState());
  const [arrivedCard, setArrivedCard] = useState<{ icon: string; title: string; fact: string } | null>(null);
  const [flying, setFlying] = useState(false);
  // a one-line "how to play" hint shown before the first climb tap
  const [showHint, setShowHint] = useState(true);
  const animal = getParkAnimal(animalId);
  const flyingRef = useRef(false);

  // set off up the mountain on open; a safe return to Base Camp on close/unmount (whatever phase
  // the climb is in — boardClimb/leaveClimb mirror the train's own boardTrain/leaveTrain lifecycle)
  useEffect(() => {
    if (!open || !world) return;
    const s = initialClimbState();
    setState(s);
    setFlying(false);
    flyingRef.current = false;
    setShowHint(true);
    const arrived = justArrivedCamp(s);
    setArrivedCard(arrived ? { icon: arrived.emoji, title: arrived.name, fact: arrived.fact } : null);
    world.boardClimb("everest");
    return () => {
      world.leaveClimb();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, world, kidId]);

  // once the helicopter swoop lands (ParkWorld clears onClimb itself), close the overlay
  useEffect(() => {
    if (!open || !world || !flying) return;
    let raf = 0;
    const poll = () => {
      if (!world.onClimb) {
        onClose();
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [open, world, flying, onClose]);

  if (!open) return null;

  const camp = currentCamp(state);
  const upcoming = nextCamp(state);
  const altitude = currentAltitude(state);
  const progress = overallProgress(state);
  const summited = isSummited(state);

  const onClimbTap = () => {
    if (arrivedCard) return; // read the fact first
    setState((s) => {
      const before = s;
      const next = climbStep(s);
      if (next.winded > before.winded) {
        playSfx("tap");
        return next; // too breathless right now — gentle no-op, no card
      }
      playSfx(next.campIndex !== before.campIndex ? "win" : "tap");
      world?.setClimbProgress(overallProgress(next));
      const arrived = justArrivedCamp(next);
      if (arrived && (next.campIndex !== before.campIndex || before.stepsIntoLeg !== 0)) setArrivedCard({ icon: arrived.emoji, title: arrived.name, fact: arrived.fact });
      return next;
    });
  };
  const onBreathe = () => {
    playSfx("sparkle");
    setState((s) => breathe(s));
  };
  const onFlyDown = () => {
    playSfx("win");
    setFlying(true);
    flyingRef.current = true;
    world?.startClimbFlyDown();
  };
  /** leaving early (before the summit): return safely to Base Camp, then close */
  const onExitEarly = () => {
    if (!flyingRef.current) world?.leaveClimb();
    onClose();
  };

  const windedHint = state.winded > 0 && !arrivedCard;

  return (
    <div style={wrap} className="ec-root">
      <style>{PARK_CSS + CSS}</style>

      <div style={topBar}>
        <div style={{ ...glass({ edge: "gold", fill: "rgba(14,12,38,0.82)" }), ...chip }}>
          <span style={display(15)}>🧗 Climbing Everest</span>
        </div>
        <PanelClose onClose={onExitEarly} label="Back to Base Camp" />
      </div>

      {!flying && (
        <>
          {/* altitude meter: a vertical bar climbing toward 8,849 m */}
          <div style={altMeterWrap}>
            <div style={altMeterTrack}>
              <div style={{ ...altMeterFill, height: `${progress * 100}%` }} />
              <div style={altFlag}>🚩</div>
            </div>
            <div style={altLabel}>{altitude.toLocaleString()} m</div>
            <div style={altSub}>of 8,849 m</div>
          </div>

          {/* breath meter */}
          <div style={breathWrap}>
            <div style={breathLabel}>{windedHint ? "😮‍💨 Catch your breath!" : "💨 Breath"}</div>
            <div style={breathTrack}>
              <div style={{ ...breathFill, width: `${(state.breath / BREATH_MAX) * 100}%`, background: state.breath < 30 ? "#e8485f" : "#4fb4e8" }} />
            </div>
          </div>
        </>
      )}

      {!summited && !arrivedCard && !flying && !showHint && (
        <div style={bottomBar}>
          <div style={legLabel}>
            {camp.name} → {upcoming.name}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <GameButton variant="secondary" onClick={onBreathe}>
              💨 Breathe
            </GameButton>
            <GameButton variant="primary" onClick={onClimbTap}>
              🧗 Climb!
            </GameButton>
          </div>
        </div>
      )}

      {flying && (
        <div style={bottomBar}>
          <div style={legLabel}>🚁 Flying back down to Base Camp…</div>
        </div>
      )}

      {showHint && !arrivedCard && !summited && !flying && (
        <WonderFactCard
          icon="🧗"
          title="How to climb"
          fact="Tap Climb! to take a roped step up. Running low on breath? Tap Breathe to rest — there's no rush."
          onClose={() => {
            playSfx("tap");
            setShowHint(false);
          }}
        />
      )}

      {arrivedCard && !summited && (
        <WonderFactCard
          icon={arrivedCard.icon}
          title={arrivedCard.title}
          subtitle={`${currentAltitude(state).toLocaleString()} m`}
          fact={arrivedCard.fact}
          onClose={() => {
            playSfx("tap");
            setArrivedCard(null);
          }}
        />
      )}

      {summited && !flying && (
        <div style={doneWrap}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.92)", blur: 12 }), ...doneCard }} className="gp-popin">
            <WonderBanner style={wonderBannerDone} />
            <div style={{ fontSize: 44 }}>🚩</div>
            <div style={display(22)}>You reached the Summit!</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.gold }}>8,849 m — the top of the world</div>
            <div style={photoCard} aria-hidden>
              <span style={{ fontSize: 64 }}>{animal.emoji}</span>
              <div style={{ fontWeight: 900, fontFamily: FONT.display, fontSize: 14, color: C.text }}>{kidName ?? "You"} on top of Everest!</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, textAlign: "center" }}>{EVEREST_CAMPS_SUMMIT_FACT}</div>
            <GameButton variant="primary" onClick={onFlyDown}>
              🚁 Fly back down to Base Camp
            </GameButton>
          </div>
        </div>
      )}
    </div>
  );
}

const EVEREST_CAMPS_SUMMIT_FACT = "Tenzing Norgay and Edmund Hillary were the first to stand here, back in 1953.";

// painted scene for this ride (components/park/EverestClimb.tsx owns this file; the art itself is
// prepacked at public/park-assets/games/wonders/everest.webp by the art pipeline) — used as a top
// banner on the summit card and the fact cards below, never over the live 3D climb itself.
const WONDER_ART = "/park-assets/games/wonders/everest.webp";

/** The painted banner strip: plain <img>, lazy off-screen, sized so it never jumps the layout.
 *  If the picture can't load, it just disappears and the card looks exactly as it did before. */
function WonderBanner({ style }: { style: React.CSSProperties }) {
  return (
    <img
      src={WONDER_ART}
      alt=""
      width={1280}
      height={640}
      loading="lazy"
      draggable={false}
      style={style}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

/** Same look as the shared FactCard (ui/Hud.tsx), plus the painted banner on top — kept local to
 *  this file so fitting the art never touches the shared Hud component other games also use. */
function WonderFactCard({ icon, title, subtitle, fact, onClose }: { icon: string; title: string; subtitle?: string; fact: string; onClose: () => void }) {
  return (
    <div style={wonderPromptWrap}>
      <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.9)", width: 1.5 }), ...wonderFactCard }} className="gp-popin">
        <WonderBanner style={wonderBannerFact} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconChip color={C.gold} size={54} style={{ fontSize: 30 }}>
            {icon}
          </IconChip>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ ...display(19, C.text), textShadow: "0 2px 0 rgba(0,0,0,0.35)" }}>{title}</div>
            {subtitle && <div style={{ fontWeight: 800, fontSize: 12, color: C.dim, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.4, color: C.text, marginTop: 10 }}>{fact}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <GameButton variant="primary" small onClick={onClose}>
            Got it!
          </GameButton>
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, overflow: "hidden", fontFamily: FONT.body };
const topBar: React.CSSProperties = { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 8 };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "8px 14px", fontWeight: 900 };
const altMeterWrap: React.CSSProperties = { position: "fixed", right: "max(14px, env(safe-area-inset-right))", top: "18%", bottom: "26%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 5 };
const altMeterTrack: React.CSSProperties = { position: "relative", flex: "1 1 auto", width: 18, borderRadius: 10, background: "rgba(10,10,30,0.35)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.4)", overflow: "visible" };
const altMeterFill: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: 10, background: "linear-gradient(180deg, #ffe9a8, #4fb4e8)" };
const altFlag: React.CSSProperties = { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 16 };
const altLabel: React.CSSProperties = { fontWeight: 900, fontFamily: FONT.display, fontSize: 13, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)" };
const altSub: React.CSSProperties = { fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.75)" };
const breathWrap: React.CSSProperties = { position: "fixed", left: "max(14px, env(safe-area-inset-left))", top: "18%", width: 150, zIndex: 5 };
const breathLabel: React.CSSProperties = { fontWeight: 800, fontSize: 12.5, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)", marginBottom: 4 };
const breathTrack: React.CSSProperties = { height: 14, borderRadius: 8, background: "rgba(10,10,30,0.35)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.4)", overflow: "hidden" };
const breathFill: React.CSSProperties = { height: "100%", borderRadius: 8, transition: "width 200ms ease" };
const bottomBar: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(14px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 6 };
const legLabel: React.CSSProperties = { fontWeight: 800, fontSize: 13, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)", background: "rgba(10,10,30,0.4)", borderRadius: 12, padding: "4px 12px" };
const doneWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const doneCard: React.CSSProperties = { width: "min(380px, 100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: 24, padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const photoCard: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 18px", borderRadius: 16, background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))", border: `1px solid ${C.line}` };
// banner across the top of the summit card — negative margin cancels doneCard's own padding
// (22px 20px) so the picture runs edge to edge; doneCard's own flex gap spaces it from the emoji below
const wonderBannerDone: React.CSSProperties = { display: "block", width: "calc(100% + 40px)", height: 150, objectFit: "cover", margin: "-22px -20px 0" };
// same idea, sized for the narrower fact-card shell (ui/Hud.tsx's own factCard: 14px 16px padding)
const wonderBannerFact: React.CSSProperties = { display: "block", width: "calc(100% + 32px)", height: 140, objectFit: "cover", margin: "-14px -16px 12px" };
const wonderPromptWrap: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 150px)", zIndex: 33, display: "flex", justifyContent: "center", pointerEvents: "none" };
const wonderFactCard: React.CSSProperties = { pointerEvents: "auto", width: "min(420px, calc(100vw - 24px))", borderRadius: 20, padding: "14px 16px", overflow: "hidden" };

const CSS = "";

export default EverestClimb;
