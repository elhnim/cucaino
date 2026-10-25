"use client";

// Climb to the crater! — a short, guided walk up Parícutin from Dionisio's farm, walked on the REAL
// cone (registry/paricutinRoute.ts), not a separate scene — the same idea as Climb Everest!
// (EverestClimb.tsx) and the Wildlands Railway, just a much shorter hike up a much smaller mountain.
// This component is the 2D HUD laid over the 3D world while climbing — a progress meter, one big
// "Climb!" button and the volcano's own true story, told one stop at a time. All the progress logic
// lives in lib/park/climbing/volcanoLogic.ts (pure, tested): this component just reads it and feeds
// ParkWorld.setClimbProgress() so the kid's own animal eases smoothly up the real ground, with the
// volcanologist guide walking just ahead. There's no way to fail or lose, and leaving early always
// returns the kid safely to the farm.
import { useEffect, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import { getParkAnimal } from "@/lib/park/registry/animals";
import { currentStop, initialVolcanoClimbState, isAtRim, justArrivedStop, nextStop, volcanoProgress, volcanoStep, type VolcanoClimbState } from "@/lib/park/climbing/volcanoLogic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";
import { IconChip } from "./ui/IconChip";

export interface VolcanoClimbProps {
  open: boolean;
  onClose: () => void;
  world: ParkWorld | null;
  kidId: string;
  kidName?: string;
  animalId?: string | null;
}

export function VolcanoClimb({ open, onClose, world, kidId, kidName, animalId }: VolcanoClimbProps) {
  const [state, setState] = useState<VolcanoClimbState>(() => initialVolcanoClimbState());
  const [arrivedCard, setArrivedCard] = useState<{ icon: string; title: string; fact: string } | null>(null);
  const [descending, setDescending] = useState(false);
  const descendingRef = useRef(false);
  // a one-line "how to play" hint shown before the first climb tap
  const [showHint, setShowHint] = useState(true);
  const animal = getParkAnimal(animalId);

  // set off up the cone on open; a safe return to the farm on close/unmount
  useEffect(() => {
    if (!open || !world) return;
    const s = initialVolcanoClimbState();
    setState(s);
    setDescending(false);
    descendingRef.current = false;
    setShowHint(true);
    const arrived = justArrivedStop(s);
    setArrivedCard(arrived ? { icon: arrived.emoji, title: arrived.name, fact: arrived.fact } : null);
    world.boardClimb("paricutin");
    return () => {
      world.leaveClimb();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, world, kidId]);

  // once the hop back down lands (ParkWorld clears onClimb itself), close the overlay
  useEffect(() => {
    if (!open || !world || !descending) return;
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
  }, [open, world, descending, onClose]);

  if (!open) return null;

  const stop = currentStop(state);
  const upcoming = nextStop(state);
  const progress = volcanoProgress(state);
  const arrivedAtRim = isAtRim(state);

  const onClimbTap = () => {
    if (arrivedCard) return; // read the fact first
    setState((s) => {
      const before = s;
      const next = volcanoStep(s);
      playSfx(next.stopIndex !== before.stopIndex ? "win" : "tap");
      world?.setClimbProgress(volcanoProgress(next));
      const arrived = justArrivedStop(next);
      if (arrived && (next.stopIndex !== before.stopIndex || before.stepsIntoLeg !== 0)) setArrivedCard({ icon: arrived.emoji, title: arrived.name, fact: arrived.fact });
      return next;
    });
  };
  const onHeadDown = () => {
    playSfx("win");
    setDescending(true);
    descendingRef.current = true;
    world?.startClimbFlyDown();
  };
  /** leaving early (before the rim): return safely to the farm, then close */
  const onExitEarly = () => {
    if (!descendingRef.current) world?.leaveClimb();
    onClose();
  };

  return (
    <div style={wrap} className="vc-root">
      <style>{PARK_CSS}</style>

      <div style={topBar}>
        <div style={{ ...glass({ edge: "gold", fill: "rgba(38,20,12,0.82)" }), ...chip }}>
          <span style={display(15)}>🌋 Climbing to the crater</span>
        </div>
        <PanelClose onClose={onExitEarly} label="Back to the farm" />
      </div>

      {!descending && (
        <div style={meterWrap}>
          <div style={meterTrack}>
            <div style={{ ...meterFill, height: `${progress * 100}%` }} />
            <div style={meterFlag}>🚩</div>
          </div>
          <div style={meterLabel}>{stop.height.toLocaleString()} m</div>
          <div style={meterSub}>the real mountain's own height</div>
        </div>
      )}

      {!arrivedAtRim && !arrivedCard && !descending && !showHint && (
        <div style={bottomBar}>
          <div style={legLabel}>
            {stop.name} → {upcoming.name}
          </div>
          <GameButton variant="primary" onClick={onClimbTap}>
            🧗 Climb!
          </GameButton>
        </div>
      )}

      {descending && (
        <div style={bottomBar}>
          <div style={legLabel}>🦺 Heading back down to the farm…</div>
        </div>
      )}

      {showHint && !arrivedCard && !arrivedAtRim && !descending && (
        <WonderFactCard
          icon="🌋"
          title="How to climb"
          fact="Tap Climb! to walk up to the crater, one stop at a time."
          onClose={() => {
            playSfx("tap");
            setShowHint(false);
          }}
        />
      )}

      {arrivedCard && !arrivedAtRim && (
        <WonderFactCard
          icon={arrivedCard.icon}
          title={arrivedCard.title}
          subtitle={`${stop.height.toLocaleString()} m`}
          fact={arrivedCard.fact}
          onClose={() => {
            playSfx("tap");
            setArrivedCard(null);
          }}
        />
      )}

      {arrivedAtRim && !descending && (
        <div style={doneWrap}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(38,20,12,0.92)", blur: 12 }), ...doneCard }} className="gp-popin">
            <WonderBanner style={wonderBannerDone} />
            <div style={{ fontSize: 44 }}>🌋</div>
            <div style={display(22)}>You reached the crater rim!</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.gold }}>Look down — that glow is the crater, far below</div>
            <div style={photoCard} aria-hidden>
              <span style={{ fontSize: 64 }}>{animal.emoji}</span>
              <div style={{ fontWeight: 900, fontFamily: FONT.display, fontSize: 14, color: C.text }}>{kidName ?? "You"} at Parícutin's crater!</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, textAlign: "center" }}>{RIM_FACT}</div>
            <GameButton variant="primary" onClick={onHeadDown}>
              🦺 Head back down to the farm
            </GameButton>
          </div>
        </div>
      )}
    </div>
  );
}

const RIM_FACT = "This whole mountain grew from nothing — just a crack in a cornfield — in less than ten years.";

// painted scene for this ride (components/park/VolcanoClimb.tsx owns this file; the art itself is
// prepacked at public/park-assets/games/wonders/volcano.webp by the art pipeline) — used as a top
// banner on the rim card and the fact cards below, never over the live 3D climb itself.
const WONDER_ART = "/park-assets/games/wonders/volcano.webp";

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
const meterTrack: React.CSSProperties = { position: "relative", flex: "1 1 auto", width: 18, borderRadius: 10, background: "rgba(30,10,6,0.35)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.4)", overflow: "visible" };
const meterFill: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: 10, background: "linear-gradient(180deg, #ffb870, #e8485f)" };
const meterFlag: React.CSSProperties = { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 16 };
const meterLabel: React.CSSProperties = { fontWeight: 900, fontFamily: FONT.display, fontSize: 13, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)" };
const meterSub: React.CSSProperties = { fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.75)", textAlign: "center", maxWidth: 70 };
const bottomBar: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(14px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 6 };
const legLabel: React.CSSProperties = { fontWeight: 800, fontSize: 13, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)", background: "rgba(30,10,6,0.4)", borderRadius: 12, padding: "4px 12px" };
const doneWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const doneCard: React.CSSProperties = { width: "min(380px, 100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: 24, padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const photoCard: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 18px", borderRadius: 16, background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))", border: `1px solid ${C.line}` };
// banner across the top of the rim card — negative margin cancels doneCard's own padding
// (22px 20px) so the picture runs edge to edge; doneCard's own flex gap spaces it from the emoji below
const wonderBannerDone: React.CSSProperties = { display: "block", width: "calc(100% + 40px)", height: 150, objectFit: "cover", margin: "-22px -20px 0" };
// same idea, sized for the narrower fact-card shell (ui/Hud.tsx's own factCard: 14px 16px padding)
const wonderBannerFact: React.CSSProperties = { display: "block", width: "calc(100% + 32px)", height: 140, objectFit: "cover", margin: "-14px -16px 12px" };
const wonderPromptWrap: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 150px)", zIndex: 33, display: "flex", justifyContent: "center", pointerEvents: "none" };
const wonderFactCard: React.CSSProperties = { pointerEvents: "auto", width: "min(420px, calc(100vw - 24px))", borderRadius: 20, padding: "14px 16px", overflow: "hidden" };

export default VolcanoClimb;
