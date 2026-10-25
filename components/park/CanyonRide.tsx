"use client";

// Ride the Mule Trail! — a short, guided mule ride down into the Grand Canyon from the rim
// trailhead, walked on the REAL canyon wall (registry/grandCanyon.ts's mule trail), not a separate
// scene — the same idea as Climb Everest! (EverestClimb.tsx) and Climb to the Crater!
// (VolcanoClimb.tsx), just heading DOWN instead of up. This component is the 2D HUD laid over the
// 3D world while riding — a progress meter and the canyon's own rock layers, told one at a time as
// the mule passes each one. All the progress logic lives in lib/park/climbing/canyonRideLogic.ts
// (pure, tested): this component just reads it and feeds ParkWorld.setClimbProgress() so the kid's
// own animal eases smoothly down the real ground, with the trail wrangler riding just ahead.
// There's no way to fail or lose, and leaving early always returns the kid safely to the rim.
import { useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { getParkAnimal } from "@/lib/park/registry/animals";
import { currentLayer, initialCanyonRideState, isAtRiver, justArrivedLayer, nextLayer, rideProgress, rideStep, type CanyonRideState } from "@/lib/park/climbing/canyonRideLogic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";
import { IconChip } from "./ui/IconChip";

export interface CanyonRideProps {
  open: boolean;
  onClose: () => void;
  world: ParkWorld | null;
  kidId: string;
  kidName?: string;
  animalId?: string | null;
}

export function CanyonRide({ open, onClose, world, kidId, kidName, animalId }: CanyonRideProps) {
  const [state, setState] = useState<CanyonRideState>(() => initialCanyonRideState());
  const [arrivedCard, setArrivedCard] = useState<{ icon: string; title: string; age: string; fact: string } | null>(null);
  const [ridingUp, setRidingUp] = useState(false);
  const ridingUpRef = useRef(false);
  // a one-line "how to play" hint shown before the first ride-on tap, same idea as EverestClimb/VolcanoClimb
  const [showHint, setShowHint] = useState(true);
  const animal = getParkAnimal(animalId);

  // set off down the trail on open; a safe return to the rim on close/unmount
  useEffect(() => {
    if (!open || !world) return;
    const s = initialCanyonRideState();
    setState(s);
    setRidingUp(false);
    ridingUpRef.current = false;
    setShowHint(true);
    const arrived = justArrivedLayer(s);
    setArrivedCard(arrived ? { icon: arrived.emoji, title: arrived.name, age: arrived.age, fact: arrived.fact } : null);
    world.boardClimb("grand-canyon");
    return () => {
      world.leaveClimb();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, world, kidId]);

  // once the ride back up lands (ParkWorld clears onClimb itself), close the overlay
  useEffect(() => {
    if (!open || !world || !ridingUp) return;
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
  }, [open, world, ridingUp, onClose]);

  if (!open) return null;

  const layer = currentLayer(state);
  const upcoming = nextLayer(state);
  const progress = rideProgress(state);
  const atRiver = isAtRiver(state);

  const onRideTap = () => {
    if (arrivedCard) return; // read the fact first
    setState((s) => {
      const before = s;
      const next = rideStep(s);
      playSfx(next.layerIndex !== before.layerIndex ? "win" : "tap");
      world?.setClimbProgress(rideProgress(next));
      const arrived = justArrivedLayer(next);
      if (arrived && (next.layerIndex !== before.layerIndex || before.stepsIntoLeg !== 0)) setArrivedCard({ icon: arrived.emoji, title: arrived.name, age: arrived.age, fact: arrived.fact });
      return next;
    });
  };
  const onRideUp = () => {
    playSfx("win");
    setRidingUp(true);
    ridingUpRef.current = true;
    world?.startClimbFlyDown();
  };
  /** leaving early (before the river): return safely to the rim, then close */
  const onExitEarly = () => {
    if (!ridingUpRef.current) world?.leaveClimb();
    onClose();
  };

  return (
    <div style={wrap} className="cr-root">
      <style>{PARK_CSS}</style>

      <div style={topBar}>
        <div style={{ ...glass({ edge: "gold", fill: "rgba(42,24,14,0.82)" }), ...chip }}>
          <span style={display(15)}>🐴 Riding the Mule Trail</span>
        </div>
        <PanelClose onClose={onExitEarly} label="Back to the rim" />
      </div>

      {!ridingUp && (
        <div style={meterWrap}>
          <div style={meterTrack}>
            {/* the mule's own position on the trail: 0% (rim, top) to 100% (river, bottom) as the
                ride progresses — track the SAME anchor the fill grows from, so the icon moves. */}
            <div style={{ ...meterFill, height: `${progress * 100}%` }} />
            <div style={{ ...meterFlag, top: `calc(${progress * 100}% - 14px)` }}>🐴</div>
          </div>
          <div style={meterLabel}>{layer.name}</div>
          <div style={meterSub}>{layer.age}</div>
        </div>
      )}

      {!atRiver && !arrivedCard && !ridingUp && !showHint && (
        <div style={bottomBar}>
          <div style={legLabel}>
            {layer.name} → {upcoming.name}
          </div>
          <GameButton variant="primary" onClick={onRideTap}>
            🐴 Ride on!
          </GameButton>
        </div>
      )}

      {ridingUp && (
        <div style={bottomBar}>
          <div style={legLabel}>🐴 Riding back up to the rim…</div>
        </div>
      )}

      {showHint && !arrivedCard && !atRiver && !ridingUp && (
        <WonderFactCard
          icon="🐴"
          title="How to ride"
          fact="Tap Ride on! to head down into the canyon on muleback, one rock layer at a time."
          onClose={() => {
            playSfx("tap");
            setShowHint(false);
          }}
        />
      )}

      {arrivedCard && !atRiver && (
        <WonderFactCard icon={arrivedCard.icon} title={arrivedCard.title} subtitle={arrivedCard.age} fact={arrivedCard.fact} onClose={() => {
          playSfx("tap");
          setArrivedCard(null);
        }} />
      )}

      {atRiver && !ridingUp && (
        <div style={doneWrap}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(42,24,14,0.92)", blur: 12 }), ...doneCard }} className="gp-popin">
            <WonderBanner style={wonderBannerDone} />
            <div style={{ fontSize: 44 }}>💧</div>
            <div style={display(22)}>You made it to the Colorado River!</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.gold }}>Nearly two billion years of rock stacked up above you</div>
            <div style={photoCard} aria-hidden>
              <span style={{ fontSize: 64 }}>{animal.emoji}</span>
              <div style={{ fontWeight: 900, fontFamily: FONT.display, fontSize: 14, color: C.text }}>{kidName ?? "You"} at the bottom of the Grand Canyon!</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, textAlign: "center" }}>{RIVER_FACT}</div>
            <GameButton variant="primary" onClick={onRideUp}>
              🐴 Ride back up to the rim
            </GameButton>
          </div>
        </div>
      )}
    </div>
  );
}

const RIVER_FACT = "This whole canyon was carved by the river right beside you — one tiny grain of sand at a time.";

// painted scene for this ride (components/park/CanyonRide.tsx owns this file; the art itself is
// prepacked at public/park-assets/games/wonders/canyon.webp by the art pipeline) — used as a top
// banner on the river card and the fact cards below, never over the live 3D ride itself.
const WONDER_ART = "/park-assets/games/wonders/canyon.webp";

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
const meterWrap: React.CSSProperties = { position: "fixed", right: "max(14px, env(safe-area-inset-right))", top: "20%", bottom: "28%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 5 };
const meterTrack: React.CSSProperties = { position: "relative", flex: "1 1 auto", width: 18, borderRadius: 10, background: "rgba(30,16,6,0.35)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.4)", overflow: "visible" };
const meterFill: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: 0, borderRadius: 10, background: "linear-gradient(180deg, #c97f3e, #4fb4e8)" };
const meterFlag: React.CSSProperties = { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 16 };
const meterLabel: React.CSSProperties = { fontWeight: 900, fontFamily: FONT.display, fontSize: 12.5, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)", textAlign: "center", maxWidth: 84 };
const meterSub: React.CSSProperties = { fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.75)", textAlign: "center", maxWidth: 84 };
const bottomBar: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(14px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 6 };
const legLabel: React.CSSProperties = { fontWeight: 800, fontSize: 13, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)", background: "rgba(30,16,6,0.4)", borderRadius: 12, padding: "4px 12px" };
const doneWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const doneCard: React.CSSProperties = { width: "min(380px, 100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: 24, padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const photoCard: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 18px", borderRadius: 16, background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))", border: `1px solid ${C.line}` };
// banner across the top of the river card — negative margin cancels doneCard's own padding
// (22px 20px) so the picture runs edge to edge; doneCard's own flex gap spaces it from the emoji below
const wonderBannerDone: React.CSSProperties = { display: "block", width: "calc(100% + 40px)", height: 150, objectFit: "cover", margin: "-22px -20px 0" };
// same idea, sized for the narrower fact-card shell (ui/Hud.tsx's own factCard: 14px 16px padding)
const wonderBannerFact: React.CSSProperties = { display: "block", width: "calc(100% + 32px)", height: 140, objectFit: "cover", margin: "-14px -16px 12px" };
const wonderPromptWrap: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 150px)", zIndex: 33, display: "flex", justifyContent: "center", pointerEvents: "none" };
const wonderFactCard: React.CSSProperties = { pointerEvents: "auto", width: "min(420px, calc(100vw - 24px))", borderRadius: 20, padding: "14px 16px", overflow: "hidden" };

export default CanyonRide;
