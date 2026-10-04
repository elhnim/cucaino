"use client";

// Run a market stall in Sunnybrook's cobbled town square: a 2D overlay (same shape as
// FishingGame.tsx/DrumGame.tsx — the 3D park keeps running behind it). A customer arrives with a
// speech-bubble order shown in pictures + words; the kid taps goods off the shelf into the basket,
// taps "Serve customer", then the customer pays — exact coins at first, later a bigger bill that
// needs change given back by tapping 1/2/5/10 coins. Every sale is a star and coins in the jar; a
// fact card about money and markets shows up between customers. Mistakes are always a gentle hint
// on the very same order, never a fail. A free "Open shop" mode serves endless mixed customers.
//
// The square itself is deliberately busy — cobbles, colourful two-storey shopfronts, a café, a
// fountain, pigeons, passers-by — but everything in the background is muted/small next to the
// customer's bright white speech bubble, which stays the one thing your eye lands on.
import { useEffect, useMemo, useRef, useState } from "react";
import { MARKET_FACTS } from "@/lib/park/registry/marketFacts";
import { GOODS, getGood, type GoodId } from "@/lib/park/market/goods";
import {
  addToBasket,
  beginLevels,
  collectPayment,
  confirmBasket,
  enterJam,
  exitJam,
  extractProgress,
  giveCoin,
  initialMarketState,
  nextCustomer,
  orderSentence,
  removeFromBasket,
  removeLastCoin,
  resumeLevels,
  seedFromProgress,
  startLevel,
  COIN_VALUES,
  type CoinValue,
  type MarketProgress,
  type MarketState,
} from "@/lib/park/market/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";

export interface MarketGameProps {
  /** render the overlay (it renders nothing when false) */
  open: boolean;
  onClose: () => void;
  kidId: string;
  /** the trader who runs the stall, if any — shown as a little host line */
  villagerName?: string;
  /** force day/night art; defaults to the device clock (night 19:00-06:00) */
  night?: boolean;
}

function progressKey(kidId: string): string {
  return `cucaino:market:${kidId}`;
}

function readProgress(kidId: string): Partial<MarketProgress> {
  try {
    const raw = window.localStorage.getItem(progressKey(kidId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === "object") {
      const p = v as Partial<MarketProgress>;
      return {
        level: typeof p.level === "number" ? p.level : 0,
        stars: typeof p.stars === "number" ? p.stars : 0,
        totalCoins: typeof p.totalCoins === "number" ? p.totalCoins : 0,
        bestDay: typeof p.bestDay === "number" ? p.bestDay : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeProgress(kidId: string, p: MarketProgress) {
  try {
    window.localStorage.setItem(progressKey(kidId), JSON.stringify(p));
  } catch {
    /* private mode: today's takings just won't be remembered next time */
  }
}

function defaultNight(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

const rng = () => Math.random();

// Sunnybrook's regulars — village kids (with a hat or a little bag, for variety) and animal
// friends who drop by the stall. Picked at random for each new customer; purely cosmetic (not
// part of the tested game state).
const CUSTOMERS: { name: string; kind: "villager" | "animal"; skin?: string; hair?: string; shirt?: string; hat?: string; bag?: string; emoji?: string }[] = [
  { name: "Pip", kind: "villager", skin: "#f0c49a", hair: "#5a3a24", shirt: "#ff7fbd", bag: "#5ef2ff" },
  { name: "Juno", kind: "villager", skin: "#c98a4a", hair: "#2a1a12", shirt: "#5ef2ff", hat: "#8a4a2a" },
  { name: "Otis", kind: "animal", emoji: "🦊" },
  { name: "Mossy", kind: "animal", emoji: "🐢" },
  { name: "Daisy", kind: "villager", skin: "#e8b48a", hair: "#caa25a", shirt: "#4fe3a0", hat: "#ff7fbd" },
  { name: "Bramble", kind: "animal", emoji: "🐿️" },
  { name: "Lola", kind: "villager", skin: "#8a5a32", hair: "#171717", shirt: "#ffd36b", bag: "#b06bff" },
  { name: "Puddle", kind: "animal", emoji: "🦆" },
  { name: "Clover", kind: "animal", emoji: "🐰" },
  { name: "Biscuit", kind: "animal", emoji: "🐥" },
  { name: "Marlow", kind: "villager", skin: "#f3d1ad", hair: "#8a5a2a", shirt: "#ff9a3d", hat: "#5ef2ff" },
];

/** A round-headed village kid, front-on, waiting patiently at the counter — a cap or a little
 * satchel for personality. */
function VillagerSprite({ skin, hair, shirt, hat, bag }: { skin: string; hair: string; shirt: string; hat?: string; bag?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 60 78" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <ellipse cx="30" cy="74" rx="17" ry="4.4" fill="rgba(0,0,0,0.22)" />
      {bag && (
        <>
          <line x1="39" y1="48" x2="20" y2="62" stroke="#6b4a2f" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="19" cy="63" rx="8" ry="7" fill={bag} stroke="rgba(0,0,0,0.2)" />
          <path d="M13 60 Q19 56 25 60" stroke="rgba(0,0,0,0.2)" strokeWidth="1.4" fill="none" />
        </>
      )}
      <path d="M13 72 Q13 42 30 42 Q47 42 47 72 Z" fill={shirt} />
      <circle cx="30" cy="26" r="18" fill={skin} />
      <path d="M12 24 Q14 7 30 7 Q46 7 48 24 Q46 15 30 15 Q14 15 12 24 Z" fill={hair} />
      <circle cx="23" cy="27" r="2.6" fill="#2a1a12" />
      <circle cx="37" cy="27" r="2.6" fill="#2a1a12" />
      <circle cx="23.8" cy="26.2" r="0.9" fill="#fff" opacity={0.85} />
      <circle cx="37.8" cy="26.2" r="0.9" fill="#fff" opacity={0.85} />
      <circle cx="18" cy="33" r="3" fill="#ff8fa8" opacity={0.5} />
      <circle cx="42" cy="33" r="3" fill="#ff8fa8" opacity={0.5} />
      <path d="M22 35 Q30 40 38 35" stroke="#2a1a12" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {hat && (
        <>
          <path d="M11 13 Q30 -5 49 13 Q45 8 30 8 Q15 8 11 13 Z" fill={hat} />
          <ellipse cx="30" cy="13.5" rx="20" ry="3" fill={hat} />
          <circle cx="30" cy="-3" r="2.6" fill={hat} opacity={0.9} />
        </>
      )}
    </svg>
  );
}

function CustomerSprite({ cust, dancing }: { cust: (typeof CUSTOMERS)[number]; dancing: boolean }) {
  return (
    <div className={dancing ? "mg-dance" : "mg-idlebob"} style={{ width: "100%", height: "100%" }}>
      {cust.kind === "animal" ? (
        <div style={{ fontSize: "min(9vw, 72px)", lineHeight: 1, textAlign: "center" }}>{cust.emoji}</div>
      ) : (
        <VillagerSprite skin={cust.skin!} hair={cust.hair!} shirt={cust.shirt!} hat={cust.hat} bag={cust.bag} />
      )}
    </div>
  );
}

// ---- Goods piled in crates, baskets, boards and an ice tray on the stall shelf -------------

type ContainerKind = "basket" | "board" | "ice" | "crate";
const CONTAINER_KIND: Record<GoodId, ContainerKind> = {
  apple: "basket",
  shell: "basket",
  wool: "basket",
  bread: "board",
  cheese: "board",
  fish: "ice",
  toy: "crate",
};
/** three jittered spots so a handful of the same emoji read as "a little pile", not one icon */
const PILE_SPOTS: { x: number; y: number; r: number; s: number }[] = [
  { x: 32, y: 44, r: -16, s: 1 },
  { x: 62, y: 36, r: 12, s: 0.88 },
  { x: 48, y: 60, r: -5, s: 0.94 },
];
const GOOD_SIZE = "min(14vw, 86px)";

function Container({ kind }: { kind: ContainerKind }) {
  const look = CONTAINER_LOOK[kind];
  return (
    <div style={{ position: "absolute", inset: 0, ...look }} aria-hidden>
      {kind === "basket" && <div style={basketRim} />}
      {kind === "crate" && (
        <svg width="100%" height="100%" viewBox="0 0 10 10" style={{ position: "absolute", inset: 0 }} preserveAspectRatio="none">
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="#4a2f1a" strokeWidth="0.7" opacity={0.55} />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="#4a2f1a" strokeWidth="0.7" opacity={0.55} />
          <rect x="0.4" y="0.4" width="9.2" height="9.2" fill="none" stroke="#4a2f1a" strokeWidth="0.6" opacity={0.6} />
        </svg>
      )}
      {kind === "ice" && <div style={iceShine} />}
      {kind === "board" && <div style={boardKnot} />}
    </div>
  );
}

/** A little heap of one good on its shelf container — a basket of apples, a board of bread... */
function GoodPile({ id }: { id: GoodId }) {
  const good = getGood(id)!;
  const kind = CONTAINER_KIND[id];
  return (
    <div style={{ position: "relative", width: GOOD_SIZE, height: `calc(${GOOD_SIZE} * 0.86)` }}>
      <Container kind={kind} />
      {PILE_SPOTS.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: `calc(${GOOD_SIZE} * ${(0.3 * p.s).toFixed(3)})`,
            transform: `translate(-50%,-50%) rotate(${p.r}deg)`,
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
          }}
        >
          {good.emoji}
        </span>
      ))}
    </div>
  );
}

/** One shelf good: a crate/basket/board/ice-bed piled with 3 of the thing, a price tag, and (if
 * any are in the basket) a little count badge — tap adds one to the basket. */
function ShelfButton({ id, count, onAdd }: { id: GoodId; count: number; onAdd: () => void }) {
  const good = getGood(id)!;
  return (
    <button type="button" className="gp-press mg-shelfbtn" onClick={onAdd} aria-label={`Add ${good.name} to the basket`} style={shelfBtn}>
      <div key={count} className={count > 0 ? "mg-pop" : undefined} style={{ position: "relative" }}>
        <GoodPile id={id} />
        {count > 0 && (
          <span style={countBadge}>
            ×{count}
          </span>
        )}
      </div>
      <span style={priceTag}>🪙{good.price}</span>
    </button>
  );
}

/** A basket-tray chip for one good already added — tap to put one back on the shelf. */
function BasketChip({ id, count, onRemove }: { id: GoodId; count: number; onRemove: () => void }) {
  const good = getGood(id)!;
  return (
    <button type="button" className="gp-press mg-popin" onClick={onRemove} aria-label={`Take a ${good.name} back out of the basket`} style={basketChip}>
      <span style={{ fontSize: 22 }}>{good.emoji}</span>
      <span style={{ fontWeight: 900 }}>×{count}</span>
    </button>
  );
}

/** A big, shiny gold coin, tapped to give back one coin of change. */
function CoinButton({ value, onClick, disabled }: { value: CoinValue; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="gp-press" onClick={onClick} disabled={disabled} aria-label={`Give a ${value}-coin`} style={coinBtn}>
      <span aria-hidden style={coinShine} />
      <span style={coinValueText}>{value}</span>
    </button>
  );
}

/** "2 + 1 = 3 of 5" — a friendly running total while the kid taps out change. */
function ChangeEquation({ coins, target }: { coins: readonly CoinValue[]; target: number }) {
  if (coins.length === 0) return null;
  const sum = coins.reduce((a, b) => a + b, 0);
  return (
    <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.85)" }), ...equationRow }} className="gp-popin">
      <span style={equationText}>
        {coins.join(" + ")} = {sum}
      </span>
      <span style={equationOf}>of {target}</span>
    </div>
  );
}

/** A little money jar in the top bar that visibly fills up as coins come in (cycling every 20). */
function MoneyJar({ coins, size = 22 }: { coins: number; size?: number }) {
  const fill = coins <= 0 ? 0 : (coins % 20 === 0 ? 20 : coins % 20) / 20;
  return (
    <div aria-hidden style={{ position: "relative", width: size * 0.8, height: size, flexShrink: 0 }}>
      <div style={{ position: "absolute", left: "22%", top: -3, width: "56%", height: 4, borderRadius: 1.5, background: "#8a5a2a" }} />
      <div
        style={{
          position: "absolute",
          inset: "4px 0 0 0",
          borderRadius: "4px 4px 9px 9px",
          border: `1.6px solid ${alpha(C.gold, 0.85)}`,
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.25)",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.max(6, fill * 100)}%`, background: `linear-gradient(180deg, ${C.goldHi}, ${C.goldDeep})`, transition: "height 200ms ease" }} />
      </div>
    </div>
  );
}

/** The customer's money, laid on the counter between "Serve" and "Collect" — just for charm. */
function PaymentOnCounter({ amount }: { amount: number }) {
  return (
    <div className="gp-popin" style={paymentNote} aria-hidden>
      <span style={{ fontSize: 17 }}>💵</span>
      <span style={{ fontWeight: 900, fontSize: 15 }}>{amount}</span>
    </div>
  );
}

const BUNTING_COLORS = [C.gold, C.cyan, "#ff7fbd", C.success, C.violet];

export function MarketGame({ open, onClose, kidId, villagerName, night: nightProp }: MarketGameProps) {
  const [state, setState] = useState<MarketState>(() => initialMarketState());
  const [autoNight] = useState(defaultNight);
  const night = nightProp ?? autoNight;
  const [custIdx, setCustIdx] = useState(0);
  const factIndexRef = useRef(0);
  const prevHintRef = useRef<string | null>(null);
  const prevOrderRef = useRef<MarketState["order"]>(null);
  const bestDayRef = useRef(0);
  // the customer + speech bubble stay on screen through the "fact" phase (a happy customer
  // dancing, not vanishing) even though the order itself is cleared the moment the sale lands
  const lastOrderRef = useRef<MarketState["order"]>(null);

  // fresh state + this kid's saved progress every time the stall opens
  useEffect(() => {
    if (!open) return;
    const p = readProgress(kidId);
    bestDayRef.current = p.bestDay ?? 0;
    setState(seedFromProgress(p));
    setCustIdx(Math.floor(Math.random() * CUSTOMERS.length));
    prevHintRef.current = null;
    prevOrderRef.current = null;
    lastOrderRef.current = null;
  }, [open, kidId]);

  // a new customer's order appeared — pick a fresh face for them
  useEffect(() => {
    if (state.order && state.order !== prevOrderRef.current) {
      setCustIdx(Math.floor(Math.random() * CUSTOMERS.length));
    }
    prevOrderRef.current = state.order;
  }, [state.order]);

  // a sale just finished: save progress, celebrate, line up the next fact
  useEffect(() => {
    if (state.phase !== "fact") return;
    writeProgress(kidId, extractProgress(state));
    factIndexRef.current = (factIndexRef.current + 1) % MARKET_FACTS.length;
    playSfx(state.pendingLevelUp ? "win" : "coin");
  }, [state.phase, state.pendingLevelUp, kidId, state]);

  // a gentle hint just appeared (wrong basket, or too much change) — one soft "try again" cue
  useEffect(() => {
    if (state.hint && state.hint !== prevHintRef.current) playSfx("wrong");
    prevHintRef.current = state.hint;
  }, [state.hint]);

  const fact = useMemo(() => MARKET_FACTS[factIndexRef.current] ?? MARKET_FACTS[0], [state.phase]);
  const cust = CUSTOMERS[custIdx] ?? CUSTOMERS[0];

  if (!open) return null;

  const order = state.order;
  if (order) lastOrderRef.current = order;
  const displayOrder = order ?? lastOrderRef.current;
  const target = order ? state.payment - order.total : 0;
  const changeLeft = Math.max(0, target - state.changeGiven);
  const waitingCount = state.mode === "levels" ? Math.max(0, state.queue - 1) : 0;

  return (
    <div style={wrap} className="mg-root">
      <style>{PARK_CSS + CSS}</style>

      <div style={scene}>
        <div style={night ? skyNight : sky} />
        {night ? (
          <>
            {STARS.map((s, i) => (
              <div key={i} aria-hidden className="mg-twinkle" style={{ ...star, left: `${s.x}%`, top: `${s.y}%`, width: 5 * s.r + 2, height: 5 * s.r + 2, animationDelay: `${s.d}s` }} />
            ))}
            <div aria-hidden style={moon} />
          </>
        ) : (
          <>
            <div aria-hidden className="mg-glow" style={sunHalo} />
            <div aria-hidden style={sun} />
          </>
        )}
        {CLOUDS.map((cl, i) => (
          <div key={i} aria-hidden style={{ position: "absolute", left: `${cl.x}%`, top: `${cl.y}%`, fontSize: cl.s, opacity: night ? 0.18 : 0.8 }}>
            ☁️
          </div>
        ))}

        {/* town square skyline: a row of colourful two-storey shopfronts either side of the
            clock tower (which flies a little flag), bunting strung across the rooftops */}
        <svg style={skyline} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
          {TOWNHOUSES.map((b, i) => (
            <Townhouse key={i} b={b} night={night} />
          ))}
          {/* clock tower, centre */}
          <rect x="43" y="4" width="14" height="36" fill={night ? "#2c2650" : "#b86b4a"} />
          <polygon points="41,4 50,-6 59,4" fill={night ? "#1c1838" : "#7a3a24"} />
          <line x1="50" y1="-6" x2="50" y2="-15" stroke={night ? "#d8d0f0" : "#5a3a24"} strokeWidth="1" />
          <polygon className="mg-flagwave" points="50,-15 59,-12 50,-9" fill={BUNTING_COLORS[1]} />
          <circle cx="50" cy="14" r="7" fill={night ? "#241d3a" : "#fdf6e3"} stroke={night ? C.gold : "#7a3a24"} strokeWidth="1.4" />
          <line x1="50" y1="14" x2="50" y2="9.5" stroke={night ? C.gold : "#2a1a0c"} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="50" y1="14" x2="53.6" y2="15.6" stroke={night ? C.gold : "#2a1a0c"} strokeWidth="1.2" strokeLinecap="round" />
          <rect x="47" y="25" width="6" height="15" fill={night ? "#ffd36b" : "#f4f0e0"} opacity={night ? 0.95 : 0.8} className={night ? "mg-winglow" : undefined} />
        </svg>
        <svg style={{ ...skyline, top: "1%", height: "10%" }} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
          <path d={`M4 2 ${BUNTING_SAG.map((p) => `L${p.x} ${p.y}`).join(" ")}`} stroke={night ? "#4a3a24" : "#6b4a2f"} strokeWidth="0.4" fill="none" />
          {BUNTING_SAG.map((p, i) => (
            <polygon key={i} points={`${p.x - 2},${p.y} ${p.x + 2},${p.y} ${p.x},${p.y + 4.2}`} fill={BUNTING_COLORS[i % BUNTING_COLORS.length]} opacity={night ? 0.85 : 0.95} />
          ))}
        </svg>

        <div style={night ? groundNight : ground} />

        {/* the square filling with life — drawn after the ground so everyone stands ON the
            cobbles, not hidden beneath them. Townsfolk + pigeons wander behind the stalls; the
            customer (below) stays the bright, focal thing on top of all of it. */}
        {WALKERS.map((w, i) => (
          <Walker key={i} color={w.color} top={w.top} delay={w.delay} duration={w.duration} flip={w.flip} />
        ))}
        <div aria-hidden style={{ position: "absolute", left: "2%", top: "47%", width: "13%", maxWidth: 110 }}>
          <Fountain night={night} />
        </div>
        {PIGEONS.map((p, i) => (
          <div key={i} aria-hidden className="mg-peck" style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: 22, height: 16, animationDelay: `${p.d}s` }}>
            <Pigeon />
          </div>
        ))}
        <div aria-hidden style={{ position: "absolute", left: "17%", top: "51%", width: "12%", maxWidth: 100, opacity: 0.85 }}>
          <NeighbourStall color="#7fbf6a" goods="🥕🥬🍅" night={night} />
        </div>
        <div aria-hidden style={{ position: "absolute", left: "34%", top: "48%", width: "15%", maxWidth: 120, opacity: 0.88 }}>
          <Cafe night={night} />
        </div>
        <div aria-hidden style={{ position: "absolute", right: "17%", top: "51%", width: "12%", maxWidth: 100, opacity: 0.85 }}>
          <NeighbourStall color="#e0893a" goods="🍯🧵" night={night} />
        </div>
        <div aria-hidden style={{ position: "absolute", right: "2%", top: "46%", width: "5%", maxWidth: 34 }}>
          <LampPost night={night} />
        </div>
        {FLOWER_PLANTERS.map((f, i) => (
          <div key={i} aria-hidden style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: "6%", maxWidth: 44 }}>
            <FlowerPlanter />
          </div>
        ))}

        {/* the customer, waiting at the counter with their order — stays put (dancing, happy)
            through the "fact" phase, using the order they just placed */}
        {displayOrder && (
          <div style={customerWrap}>
            {waitingCount > 0 && (
              <div style={queueChip} className="gp-popin">
                🧍 +{waitingCount} more today
              </div>
            )}
            <div style={speechBubble} className="gp-popin">
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 4 }}>
                {displayOrder.lines.map((l) => (
                  <span key={l.good} style={speechPic}>
                    {l.qty}×{getGood(l.good)?.emoji}
                  </span>
                ))}
              </div>
              <div style={speechWords}>{orderSentence(displayOrder)}</div>
              <div style={speechTail} />
            </div>
            <div style={customerSprite}>
              <CustomerSprite cust={cust} dancing={state.phase === "fact"} />
            </div>
            {state.phase === "fact" && (
              <>
                {["💖", "✨", "💖"].map((e, i) => (
                  <div key={i} aria-hidden className="mg-twinkle" style={{ ...sparkle, left: `${30 + i * 18}%`, animationDelay: `${i * 0.2}s` }}>
                    {e}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* the kid's own stall: wooden posts, a striped awning roof, basket + "Serve" while
            filling it, crates/baskets of goods, a wooden counter — the basket/hint/button live in
            this same normal flow (not a fixed overlay) so they can never cover up the shelf */}
        <div style={stallWrap}>
          <div style={postLeft} aria-hidden />
          <div style={postRight} aria-hidden />
          <svg style={awning} viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <polygon key={i} points={`${i * 11.2},0 ${i * 11.2 + 11.2},0 ${i * 11.2 + 11.2},10 ${i * 11.2 + 5.6},16 ${i * 11.2},10`} fill={i % 2 === 0 ? C.gold : "#ff7fbd"} />
            ))}
          </svg>
          {state.phase === "serving" && (
            <div style={servingPanel}>
              {state.hint && (
                <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.9)" }), ...hintChip }} className="gp-popin">
                  {state.hint}
                </div>
              )}
              <div style={basketRow}>
                {Object.entries(state.basket).filter(([, n]) => (n ?? 0) > 0).length === 0 ? (
                  <span style={basketHint}>Tap goods from the shelf to fill the basket 🧺</span>
                ) : (
                  (Object.entries(state.basket) as [GoodId, number | undefined][])
                    .filter(([, n]) => (n ?? 0) > 0)
                    .map(([id, n]) => (
                      <BasketChip
                        key={id}
                        id={id}
                        count={n ?? 0}
                        onRemove={() => {
                          playSfx("tap");
                          setState((s) => removeFromBasket(s, id));
                        }}
                      />
                    ))
                )}
              </div>
              <GameButton variant="primary" onClick={() => { playSfx("tap"); setState((s) => confirmBasket(s)); }}>
                🛎️ Serve customer
              </GameButton>
            </div>
          )}
          {/* the shelf only takes up room while actually serving — otherwise the stall stays
              short, so the fixed dock above (ready stats, pay/fact cards) always has plenty of
              clearance no matter how tall its own content stacks on a narrow phone */}
          {state.phase === "serving" ? (
            <div style={shelfRow}>
              {GOODS.map((g) => (
                <ShelfButton
                  key={g.id}
                  id={g.id}
                  count={state.basket[g.id] ?? 0}
                  onAdd={() => {
                    playSfx("tap");
                    setState((s) => addToBasket(s, g.id));
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={nonServingSlot}>
              {state.phase === "pay" ? <PaymentOnCounter amount={state.payment} /> : <div style={shutterStrip} aria-hidden />}
            </div>
          )}
          <div style={counter} />
        </div>
      </div>

      {/* top bar */}
      <div style={topBar}>
        <div style={{ ...glass({ edge: "gold", fill: "rgba(14,12,38,0.82)" }), ...chip }}>
          <span style={display(16)}>
            🧺 {state.mode === "jam" ? "Open shop" : "Market Stall"}
            {villagerName ? ` with ${villagerName}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ ...glass({ edge: "cyan", fill: "rgba(16,14,40,0.82)" }), ...statChip }}>⭐ {state.stars}</div>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.82)" }), ...statChip, display: "flex", alignItems: "center", gap: 5 }}>
            <MoneyJar coins={state.coins} size={18} />
            {state.coins}
          </div>
          {state.mode === "jam" && state.phase !== "ready" && (
            <button type="button" className="gp-press" style={closeShopBtn} onClick={() => setState((s) => exitJam(s))}>
              🏁 Close shop
            </button>
          )}
          <PanelClose onClose={onClose} label="Leave the market" />
        </div>
      </div>

      {/* prompt / action dock — ready / pay / fact only; "serving" lives in the stall itself
          above, so its basket/hint/button can never cover the shelf */}
      <div style={dock}>
        {state.phase === "ready" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ ...glass({ edge: "soft", fill: "rgba(16,14,40,0.8)" }), ...readyStats }}>
              Best level {Math.max(1, state.bestLevel)} · ⭐ {state.stars} · Best day 🪙{state.bestDay}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <GameButton
                big
                variant="primary"
                onClick={() => {
                  playSfx("tap");
                  setState((s) => (s.level > 0 ? resumeLevels(s, rng) : beginLevels(s, rng)));
                }}
              >
                🧺 {state.level > 0 ? `Keep selling (Lvl ${state.level})` : "Start!"}
              </GameButton>
              <GameButton
                variant="secondary"
                onClick={() => {
                  playSfx("tap");
                  setState((s) => enterJam(s, rng));
                }}
              >
                🏪 Open shop
              </GameButton>
            </div>
          </div>
        )}

        {state.phase === "pay" && order && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {state.hint && (
              <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.9)" }), ...hintChip }} className="gp-popin">
                {state.hint}
              </div>
            )}
            <div style={{ ...glass({ edge: "cyan", fill: "rgba(16,14,40,0.85)" }), ...payChip }}>
              Total 🪙{order.total} · Paid with 🪙{state.payment}
              {target > 0 && <> · Give back 🪙{changeLeft}</>}
            </div>
            {target > 0 ? (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                  {COIN_VALUES.map((v) => (
                    <CoinButton key={v} value={v} disabled={v > changeLeft} onClick={() => { playSfx("tap"); setState((s) => giveCoin(s, v)); }} />
                  ))}
                  <GameButton small variant="ghost" disabled={state.changeCoins.length === 0} onClick={() => { playSfx("tap"); setState((s) => removeLastCoin(s)); }}>
                    ↩ Undo
                  </GameButton>
                </div>
                <ChangeEquation coins={state.changeCoins} target={target} />
              </>
            ) : (
              <GameButton big variant="primary" onClick={() => { playSfx("tap"); setState((s) => collectPayment(s)); }}>
                🪙 Collect payment
              </GameButton>
            )}
          </div>
        )}

        {state.phase === "fact" && (
          <div style={{ ...glass({ edge: "gold", fill: "rgba(18,16,44,0.92)", blur: 12 }), ...factCard }} className="gp-popin">
            <div style={display(17, C.gold)}>
              {state.pendingLevelUp ? `Level ${state.level} done! 🎉` : "Happy customer! 🎉"}
            </div>
            <div style={factText}>{fact.text}</div>
            <GameButton
              variant="primary"
              onClick={() => {
                playSfx("tap");
                setState((s) => nextCustomer(s, rng));
              }}
            >
              {state.pendingLevelUp ? "Next level ▶" : "Next customer ▶"}
            </GameButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** a two-storey shopfront: gabled roof, two upstairs windows with shutters + a flower box, and
 * either a signed, awninged shop door or a plain front door downstairs */
function Townhouse({ b, night }: { b: ThDef; night: boolean }) {
  const wall = night ? b.wallNight : b.wall;
  const top = 4;
  const bodyH = 30;
  const winW = b.w * 0.22;
  const winX = [b.x + b.w * 0.16, b.x + b.w * 0.62];
  const winY = top + 5;
  return (
    <g>
      <polygon points={`${b.x - 1.2},${top + 0.6} ${b.x + b.w / 2},${top - 7} ${b.x + b.w + 1.2},${top + 0.6}`} fill={b.roof} />
      <rect x={b.x} y={top} width={b.w} height={bodyH} fill={wall} />
      <rect x={b.x} y={top + bodyH - 1.2} width={b.w} height={1.2} fill="rgba(0,0,0,0.18)" />
      {winX.map((wx, i) => (
        <g key={i}>
          <rect x={wx - winW * 0.42} y={winY} width={winW * 0.42} height={winW} fill={b.roof} opacity={0.9} />
          <rect x={wx + winW} y={winY} width={winW * 0.42} height={winW} fill={b.roof} opacity={0.9} />
          <rect x={wx} y={winY} width={winW} height={winW} fill={night ? "#ffd36b" : "#eaf3ff"} opacity={night ? 0.95 : 0.9} className={night ? "mg-winglow" : undefined} />
          <line x1={wx + winW / 2} y1={winY} x2={wx + winW / 2} y2={winY + winW} stroke={night ? "#2a2440" : "#7a3a24"} strokeWidth={0.4} />
          <line x1={wx} y1={winY + winW / 2} x2={wx + winW} y2={winY + winW / 2} stroke={night ? "#2a2440" : "#7a3a24"} strokeWidth={0.35} />
          <rect x={wx - winW * 0.1} y={winY + winW} width={winW * 1.2} height={1.4} fill="#5a3a24" />
          {[0.18, 0.55, 0.92].map((t, j) => (
            <circle key={j} cx={wx + winW * t} cy={winY + winW + 0.6} r={1} fill={["#ff7fbd", C.gold, "#4fe3a0"][j]} />
          ))}
        </g>
      ))}
      {b.shop ? (
        <>
          <rect x={b.x + 1} y={top + bodyH - 9} width={b.w - 2} height={9} fill={night ? "#1c1738" : "#fff8e8"} />
          <text x={b.x + b.w / 2} y={top + bodyH - 2.6} fontSize={5.6} textAnchor="middle">
            {b.shop.icon}
          </text>
          {Array.from({ length: 5 }).map((_, i) => {
            const awningColor = b.shop!.awning;
            return (
              <polygon
                key={i}
                points={`${b.x + i * (b.w / 5)},${top + bodyH - 12} ${b.x + (i + 1) * (b.w / 5)},${top + bodyH - 12} ${b.x + (i + 0.5) * (b.w / 5)},${top + bodyH - 9}`}
                fill={i % 2 === 0 ? awningColor : "#fff8e8"}
              />
            );
          })}
        </>
      ) : (
        <rect x={b.x + b.w * 0.38} y={top + bodyH - 8} width={b.w * 0.24} height={8} rx={1} fill={night ? "#241d3a" : "#6b4a2f"} />
      )}
    </g>
  );
}

interface ShopInfo {
  icon: string;
  awning: string;
}
interface ThDef {
  x: number;
  w: number;
  wall: string;
  wallNight: string;
  roof: string;
  shop?: ShopInfo;
}
const TOWNHOUSES: ThDef[] = [
  { x: 0, w: 13, wall: "#f3c38a", wallNight: "#352a4a", roof: "#c0524a", shop: { icon: "🥨", awning: C.gold } },
  { x: 14, w: 12, wall: "#bfe3d6", wallNight: "#243344", roof: "#3a7a7f" },
  { x: 28, w: 13, wall: "#f3c9e4", wallNight: "#3a2a4a", roof: "#b06bff", shop: { icon: "🧸", awning: "#ff7fbd" } },
  { x: 58, w: 12, wall: "#cfe3f5", wallNight: "#28304a", roof: "#2f6f9f" },
  { x: 71, w: 13, wall: "#f7dca0", wallNight: "#3a3050", roof: "#e0893a", shop: { icon: "🍭", awning: C.cyan } },
  { x: 85, w: 14, wall: "#dfd3ee", wallNight: "#241f3a", roof: "#6d3df0" },
];

/** a bigger two-tier fountain with real splashing jets, lit at night */
function Fountain({ night }: { night: boolean }) {
  return (
    <svg viewBox="0 0 70 70" width="100%" aria-hidden style={{ display: "block" }}>
      <ellipse cx="35" cy="63" rx="30" ry="7" fill={night ? "#15283e" : "#7fb0c9"} opacity={0.85} />
      <ellipse cx="35" cy="63" rx="30" ry="7" fill="none" stroke={night ? "#2a4a68" : "#4a7f9a"} strokeWidth="2.2" />
      <ellipse cx="35" cy="60" rx="26" ry="5.6" fill={night ? "#0c1a2c" : "#bfe3f0"} opacity={0.9} />
      <ellipse className="mg-ripple-a" cx="35" cy="60" rx="15" ry="3.4" fill="none" stroke={night ? "#9fc7ff" : "#eaf6ff"} strokeWidth="1.1" opacity={0.6} />
      <rect x="24" y="34" width="22" height="22" rx="4" fill={night ? "#3a3350" : "#c9a97a"} />
      <ellipse cx="35" cy="34" rx="13" ry="4.4" fill={night ? "#16283e" : "#8fc0d6"} />
      <rect x="31" y="16" width="8" height="20" rx="2.4" fill={night ? "#3a3350" : "#c9a97a"} />
      <ellipse cx="35" cy="16" rx="6" ry="2.6" fill={night ? "#16283e" : "#8fc0d6"} />
      <path className="mg-fountain" d="M35 9 Q39 2 35 -5 Q31 2 35 9" fill={night ? "#bcd9ff" : "#eaf6ff"} opacity={0.85} />
      <path className="mg-fountain mg-fountain-b" d="M35 20 Q43 13 45 4" fill="none" stroke={night ? "#9fc7ff" : "#dff0ff"} strokeWidth="2" opacity={0.75} strokeLinecap="round" />
      <path className="mg-fountain mg-fountain-c" d="M35 20 Q27 13 25 4" fill="none" stroke={night ? "#9fc7ff" : "#dff0ff"} strokeWidth="2" opacity={0.75} strokeLinecap="round" />
    </svg>
  );
}

/** a background stall with its goods piled up where you can see them from across the square */
function NeighbourStall({ color, goods, night }: { color: string; goods: string; night: boolean }) {
  return (
    <svg viewBox="0 0 60 46" width="100%" aria-hidden style={{ display: "block" }}>
      <ellipse cx="30" cy="44" rx="26" ry="3" fill="rgba(0,0,0,0.18)" />
      <rect x="4" y="20" width="52" height="16" fill={night ? "#2a2440" : "#9a7a52"} />
      <polygon points="0,20 30,4 60,20" fill={color} opacity={night ? 0.55 : 0.9} />
      <text x="30" y="17" fontSize="9" textAnchor="middle">
        {goods}
      </text>
      <rect x="10" y="24" width="6" height="6" rx="1" fill={night ? C.gold : "#ffd766"} opacity={night ? 0.8 : 0.9} />
      <rect x="22" y="24" width="6" height="6" rx="1" fill={night ? "#ff7fbd" : "#ff6161"} opacity={night ? 0.8 : 0.9} />
      <rect x="34" y="24" width="6" height="6" rx="1" fill={night ? C.cyan : "#6fb8e0"} opacity={night ? 0.8 : 0.9} />
    </svg>
  );
}

/** two little café tables under a striped umbrella */
function Cafe({ night }: { night: boolean }) {
  return (
    <svg viewBox="0 0 70 56" width="100%" aria-hidden style={{ display: "block" }}>
      <ellipse cx="35" cy="54" rx="28" ry="3.4" fill="rgba(0,0,0,0.16)" />
      {[15, 55].map((cx, i) => (
        <g key={i}>
          <rect x={cx - 1} y="36" width="2" height="14" fill="#6b4a2f" />
          <ellipse cx={cx} cy="36" rx="7" ry="2.2" fill="#caa25a" />
          <rect x={cx - 6} y="45" width="1.6" height="7" fill="#3a2a1a" />
          <rect x={cx + 4.4} y="45" width="1.6" height="7" fill="#3a2a1a" />
        </g>
      ))}
      <rect x="34" y="14" width="2" height="28" fill="#6b4a2f" />
      <path d="M8 18 Q35 -6 62 18 Z" fill={night ? "#8a3a4a" : "#ff5d73"} />
      <path d="M8 18 Q35 -6 62 18 Z" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="8 8" opacity={0.55} />
      <circle cx="35" cy="13" r="1.6" fill="#6b4a2f" />
    </svg>
  );
}

/** a warm lamp post, glowing after dark */
function LampPost({ night }: { night: boolean }) {
  return (
    <svg viewBox="0 0 20 60" width="100%" aria-hidden style={{ display: "block" }}>
      <ellipse cx="10" cy="58" rx="7" ry="2" fill="rgba(0,0,0,0.22)" />
      <rect x="9" y="18" width="2.2" height="38" fill="#2a2a2a" />
      <path d="M4 18 Q10 8 16 18 Z" fill="#2a2a2a" />
      <rect x="6" y="8" width="8" height="11" rx="2" fill={night ? "#ffe9a8" : "#dfe7ef"} className={night ? "mg-winglow" : undefined} opacity={night ? 1 : 0.85} />
      <circle cx="10" cy="6" r="2" fill="#2a2a2a" />
      {night && <ellipse cx="10" cy="14" rx="12" ry="12" fill="rgba(255,230,160,0.18)" />}
    </svg>
  );
}

/** a little wooden planter with four flowers */
function FlowerPlanter() {
  return (
    <svg viewBox="0 0 26 18" width="100%" aria-hidden style={{ display: "block" }}>
      <ellipse cx="13" cy="16.5" rx="11" ry="1.6" fill="rgba(0,0,0,0.15)" />
      <rect x="2" y="9" width="22" height="7" rx="1.5" fill="#8a5a2a" />
      {[4, 9, 14, 19].map((x, i) => (
        <g key={i}>
          <circle cx={x + 2} cy="6" r="3" fill={["#ff7fbd", C.gold, "#5ef2ff", "#ff5d6e"][i % 4]} />
          <circle cx={x + 2} cy="6" r="1.1" fill="#fff6d6" />
        </g>
      ))}
    </svg>
  );
}

/** a pigeon, bobbing its head as it pecks at the cobbles */
function Pigeon() {
  return (
    <svg viewBox="0 0 22 16" width="100%" height="100%" aria-hidden>
      <ellipse cx="12" cy="11" rx="8" ry="5.2" fill="#aab0bd" />
      <circle cx="5.5" cy="6.5" r="3.6" fill="#aab0bd" />
      <circle cx="4" cy="5.8" r="0.7" fill="#201c1c" />
      <polygon points="1.6,6.5 -1,7 1.6,7.8" fill="#e0893a" />
      <ellipse cx="17" cy="11.5" rx="3" ry="1.4" fill="#8a8f9c" />
    </svg>
  );
}

/** a small passer-by, strolling across the square in the middle distance */
function Walker({ color, top, delay, duration, flip }: { color: string; top: string; delay: number; duration: number; flip?: boolean }) {
  return (
    <div aria-hidden className="mg-walk" style={{ position: "absolute", top, animationDelay: `${delay}s`, animationDuration: `${duration}s`, opacity: 0.8 }}>
      <svg width="16" height="28" viewBox="0 0 16 28" style={{ transform: flip ? "scaleX(-1)" : undefined, display: "block" }}>
        <ellipse cx="8" cy="27" rx="6" ry="1.3" fill="rgba(0,0,0,0.18)" />
        <rect x="4" y="11" width="8" height="13" rx="3.5" fill={color} />
        <circle cx="8" cy="6" r="5" fill="#e8b48a" />
      </svg>
    </div>
  );
}

const STARS: { x: number; y: number; r: number; d: number }[] = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 41.3) % 97,
  y: (i * 11.7) % 26,
  r: 0.5 + ((i * 7) % 5) / 10,
  d: (i % 6) * 0.35,
}));
const CLOUDS: { x: number; y: number; s: number }[] = [
  { x: 8, y: 6, s: 30 },
  { x: 62, y: 3, s: 26 },
  { x: 36, y: 9, s: 20 },
];
/** bunting flag anchor points, sagging gently between the two rooftops */
const BUNTING_SAG: { x: number; y: number }[] = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return { x: 4 + t * 92, y: 2 + Math.sin(t * Math.PI) * 4.4 };
});
const PIGEONS: { x: number; y: number; d: number }[] = [
  { x: 10, y: 60, d: 0 },
  { x: 24, y: 63, d: 0.8 },
  { x: 72, y: 61, d: 1.4 },
];
const FLOWER_PLANTERS: { x: number; y: number }[] = [
  { x: 11, y: 57 },
  { x: 48, y: 59 },
  { x: 88, y: 56 },
];
const WALKERS: { color: string; top: string; delay: number; duration: number; flip?: boolean }[] = [
  { color: "#5a8f6a", top: "44%", delay: 0, duration: 26, flip: false },
  { color: "#8a5ac9", top: "43%", delay: 9, duration: 30, flip: true },
];

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, overflow: "hidden", fontFamily: FONT.body, touchAction: "none" };
const scene: React.CSSProperties = { position: "absolute", inset: 0, overflow: "hidden" };
const sky: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #bfe6ff 0%, #d6edc7 55%, #e8dba0 100%)" };
const skyNight: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #0a1428 0%, #171338 55%, #241d3a 100%)" };
const sun: React.CSSProperties = { position: "absolute", left: "80%", top: "6%", width: 54, height: 54, borderRadius: "50%", background: "radial-gradient(circle at 35% 32%, #fff6cf, #ffd36b 55%, #f5b400 100%)", boxShadow: "0 0 24px rgba(255,211,107,0.7)" };
const sunHalo: React.CSSProperties = { position: "absolute", left: "80%", top: "6%", width: 54, height: 54, borderRadius: "50%", transform: "translate(-18%,-18%) scale(2.2)", background: "radial-gradient(circle, rgba(255,230,160,0.5), transparent 70%)", pointerEvents: "none" };
const moon: React.CSSProperties = { position: "absolute", left: "80%", top: "6%", width: 42, height: 42, borderRadius: "50%", background: "radial-gradient(circle at 35% 32%, #f3f6ff, #cfd9ef 60%, #aab6d6 100%)", boxShadow: "0 0 18px rgba(200,215,255,0.5)" };
const star: React.CSSProperties = { position: "absolute", borderRadius: "50%", background: "#fff", pointerEvents: "none" };
const skyline: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: "6%", height: "34%", width: "100%", pointerEvents: "none" };
const ground: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  top: "46%",
  backgroundImage: [
    "radial-gradient(circle at 8px 8px, rgba(0,0,0,0.13) 0 3px, transparent 3.4px)",
    "radial-gradient(circle at 24px 20px, rgba(0,0,0,0.11) 0 3px, transparent 3.4px)",
    "radial-gradient(circle at 16px 29px, rgba(255,255,255,0.12) 0 2.4px, transparent 2.8px)",
    "linear-gradient(180deg, #e2d1a3 0%, #cdb985 100%)",
  ].join(","),
  backgroundSize: "32px 32px, 32px 32px, 32px 32px, 100% 100%",
};
const groundNight: React.CSSProperties = {
  ...ground,
  backgroundImage: [
    "radial-gradient(circle at 8px 8px, rgba(0,0,0,0.25) 0 3px, transparent 3.4px)",
    "radial-gradient(circle at 24px 20px, rgba(0,0,0,0.22) 0 3px, transparent 3.4px)",
    "radial-gradient(circle at 16px 29px, rgba(170,190,255,0.08) 0 2.4px, transparent 2.8px)",
    "linear-gradient(180deg, #3a3153 0%, #251f3a 100%)",
  ].join(","),
};
const customerWrap: React.CSSProperties = { position: "absolute", left: "50%", top: "25%", transform: "translateX(-50%)", width: "min(46vw, 230px)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none", zIndex: 2 };
const queueChip: React.CSSProperties = { ...glass({ edge: "soft", fill: "rgba(16,14,40,0.75)" }), borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 800, color: C.dim, marginBottom: 6 };
const speechBubble: React.CSSProperties = { position: "relative", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: "8px 14px 10px", boxShadow: "0 6px 16px rgba(0,0,0,0.3)", maxWidth: "100%" };
const speechTail: React.CSSProperties = { position: "absolute", left: "50%", bottom: -8, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid rgba(255,255,255,0.96)" };
const speechPic: React.CSSProperties = { fontSize: 15, fontWeight: 900, color: "#2a1a0c" };
const speechWords: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "#2a1a0c", textAlign: "center", lineHeight: 1.25 };
const customerSprite: React.CSSProperties = { width: "min(22vw, 100px)", height: "min(28vw, 128px)", marginTop: 10 };
const sparkle: React.CSSProperties = { position: "absolute", top: "6%", fontSize: 20, pointerEvents: "none" };
const stallWrap: React.CSSProperties = { position: "absolute", left: "4%", right: "4%", bottom: 0, display: "flex", flexDirection: "column", alignItems: "stretch", zIndex: 1 };
const postLeft: React.CSSProperties = { position: "absolute", left: -8, top: -14, bottom: 0, width: 9, background: "linear-gradient(90deg, #6b4a2f, #8a5a32 45%, #6b4a2f)", borderRadius: 3, boxShadow: "1px 0 3px rgba(0,0,0,0.3)" };
const postRight: React.CSSProperties = { position: "absolute", right: -8, top: -14, bottom: 0, width: 9, background: "linear-gradient(90deg, #6b4a2f, #8a5a32 45%, #6b4a2f)", borderRadius: 3, boxShadow: "-1px 0 3px rgba(0,0,0,0.3)" };
const awning: React.CSSProperties = { width: "100%", height: "9vh", maxHeight: 64, display: "block", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))" };
const shelfRow: React.CSSProperties = { display: "flex", justifyContent: "center", alignItems: "flex-end", gap: "2vw", flexWrap: "wrap", padding: "10px 6px", background: "linear-gradient(180deg, rgba(138,74,42,0.0), rgba(90,58,30,0.35))" };
const counter: React.CSSProperties = { height: "min(9vh, 58px)", background: "linear-gradient(180deg, #a9754a, #7a4e2a), repeating-linear-gradient(90deg, rgba(0,0,0,0.08) 0 2px, transparent 2px 22px)", backgroundBlendMode: "normal, multiply", borderTop: "4px solid #5c3d1e", boxShadow: "0 -4px 10px rgba(0,0,0,0.25)" };
/** the stall between customers: no goods out, just a tidy striped strip (or, mid-sale, the
 * customer's money laid out) under the awning */
const nonServingSlot: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 26, padding: "6px 0" };
const shutterStrip: React.CSSProperties = { width: "100%", height: 16, background: "repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0 14px, transparent 14px 28px)" };
const paymentNote: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "linear-gradient(180deg, #fff8e8, #f3e2b8)",
  border: "2px dashed #c79a5e",
  borderRadius: 8,
  padding: "6px 12px",
  color: "#5a3a1f",
  transform: "rotate(-2.5deg)",
  boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
};
const shelfBtn: React.CSSProperties = { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", padding: 4, cursor: "pointer", touchAction: "manipulation", minWidth: 64 };
const basketRim: React.CSSProperties = { position: "absolute", left: "5%", right: "5%", top: "7%", height: "14%", borderRadius: 999, border: "2px solid #7a4e2a", opacity: 0.5 };
const iceShine: React.CSSProperties = { position: "absolute", left: "10%", top: "16%", width: "32%", height: "14%", background: "rgba(255,255,255,0.65)", borderRadius: 999, transform: "rotate(-18deg)" };
const boardKnot: React.CSSProperties = { position: "absolute", left: "72%", top: "66%", width: "14%", height: "14%", borderRadius: "50%", background: "rgba(0,0,0,0.12)" };
const CONTAINER_LOOK: Record<ContainerKind, React.CSSProperties> = {
  basket: {
    backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.14) 0 4px, transparent 4px 8px), linear-gradient(180deg, #e2b377, #a9754a)",
    backgroundBlendMode: "multiply, normal",
    borderRadius: "16% 16% 46% 46% / 20% 20% 60% 60%",
    border: "2px solid #7a4e2a",
    boxShadow: "inset 0 3px 5px rgba(255,255,255,0.3), 0 3px 8px rgba(0,0,0,0.3)",
  },
  board: {
    backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.07) 0 3px, transparent 3px 14px), linear-gradient(90deg, #e3c08e, #c79a5e)",
    backgroundBlendMode: "multiply, normal",
    borderRadius: 10,
    border: "2px solid #9a6a34",
    boxShadow: "0 3px 8px rgba(0,0,0,0.3)",
  },
  ice: {
    background: "linear-gradient(180deg, #d6ecf4, #a9cfe0)",
    borderRadius: 12,
    border: "2px solid #6fa8c2",
    boxShadow: "inset 0 2px 4px rgba(255,255,255,0.4), 0 3px 8px rgba(0,0,0,0.3)",
  },
  crate: {
    background: "linear-gradient(180deg, #d7a568, #9a6a34)",
    borderRadius: 6,
    border: "2px solid #6b4a2f",
    boxShadow: "inset 0 2px 4px rgba(255,255,255,0.25), 0 3px 8px rgba(0,0,0,0.3)",
  },
};
const priceTag: React.CSSProperties = { fontSize: 13, fontWeight: 900, color: C.ink, background: C.gold, borderRadius: 999, padding: "2px 9px", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" };
const countBadge: React.CSSProperties = { position: "absolute", top: -4, right: -4, background: C.success, color: "#062a19", fontWeight: 900, fontSize: 13, borderRadius: 999, padding: "1px 7px", boxShadow: "0 2px 5px rgba(0,0,0,0.35)" };
const topBar: React.CSSProperties = { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 8, flexWrap: "wrap" };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "8px 14px", fontWeight: 900 };
const statChip: React.CSSProperties = { borderRadius: 14, padding: "8px 12px", fontWeight: 900, fontFamily: FONT.display, fontSize: 14.5 };
const closeShopBtn: React.CSSProperties = { ...glass({ edge: "soft", fill: "rgba(16,14,40,0.82)" }), borderRadius: 14, padding: "8px 12px", fontWeight: 900, fontSize: 13, fontFamily: FONT.display, cursor: "pointer", touchAction: "manipulation" };
// lives in the stall's own normal flow (not a fixed overlay) — see the "serving" branch above —
// so the hint/basket/button can never cover the shelf buttons beneath them.
const servingPanel: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 12px" };
const basketRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" };
const basketHint: React.CSSProperties = { ...glass({ edge: "soft", fill: "rgba(16,14,40,0.75)" }), borderRadius: 14, padding: "7px 14px", fontSize: 13, fontWeight: 700, color: C.dim };
const basketChip: React.CSSProperties = { ...glass({ edge: "gold", fill: "rgba(16,14,40,0.85)" }), display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "7px 12px", minHeight: 44, cursor: "pointer", touchAction: "manipulation", color: C.text };
// cleared well above the shelf + counter band (ready/pay/fact only — "serving"'s own controls
// live in the stall's normal flow instead, see `servingPanel` above) so cards never sit on goods.
// 300px/30% is generous enough to clear the shelf even wrapped onto two rows on a narrow phone,
// now that the goods are drawn bigger (crates/baskets, not little discs).
const dock: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(300px, 30%, calc(18px + env(safe-area-inset-bottom)))", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 5, padding: "0 16px" };
const hintChip: React.CSSProperties = { borderRadius: 14, padding: "8px 16px", fontWeight: 800, fontFamily: FONT.body, fontSize: 13.5, textAlign: "center", maxWidth: "92vw" };
const readyStats: React.CSSProperties = { borderRadius: 14, padding: "7px 14px", fontWeight: 800, fontFamily: FONT.body, fontSize: 13.5, color: C.dim, textAlign: "center" };
const payChip: React.CSSProperties = { borderRadius: 14, padding: "8px 16px", fontWeight: 800, fontFamily: FONT.body, fontSize: 14, textAlign: "center" };
const coinBtn: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: 72,
  height: 72,
  borderRadius: "50%",
  border: "2.5px solid #9a5c00",
  background: `linear-gradient(180deg, ${C.goldHi}, ${C.gold} 55%, ${C.goldDeep})`,
  color: C.ink,
  fontFamily: FONT.display,
  fontWeight: 400,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 10px rgba(0,0,0,0.4)",
  cursor: "pointer",
  touchAction: "manipulation",
};
const coinShine: React.CSSProperties = { position: "absolute", left: "16%", top: "12%", width: "42%", height: "28%", borderRadius: 999, background: "rgba(255,255,255,0.55)", transform: "rotate(-20deg)", pointerEvents: "none" };
const coinValueText: React.CSSProperties = { fontSize: 24, lineHeight: 1, textShadow: "0 1px 0 rgba(255,255,255,0.5)" };
const equationRow: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, borderRadius: 14, padding: "6px 16px" };
const equationText: React.CSSProperties = { fontFamily: FONT.display, fontWeight: 400, fontSize: 20, color: C.gold, textShadow: "0 2px 0 rgba(0,0,0,0.4)" };
const equationOf: React.CSSProperties = { fontWeight: 700, fontFamily: FONT.body, fontSize: 13, color: C.dim };
const factCard: React.CSSProperties = { width: "min(380px, 92vw)", borderRadius: 20, padding: "18px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" };
const factText: React.CSSProperties = { fontWeight: 700, fontFamily: FONT.body, fontSize: 14, color: C.text, lineHeight: 1.35 };

const CSS =
  "@keyframes mg-twinkle-kf { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }" +
  "@keyframes mg-idlebob-kf { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }" +
  "@keyframes mg-dance-kf { 0%,100% { transform: translateY(0) rotate(0deg) scale(1); } 25% { transform: translateY(-10px) rotate(-6deg) scale(1.03); } 50% { transform: translateY(0) rotate(0deg) scale(1.05); } 75% { transform: translateY(-10px) rotate(6deg) scale(1.03); } }" +
  "@keyframes mg-pop-kf { 0% { transform: scale(0.6); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }" +
  "@keyframes mg-fountain-kf { 0%,100% { opacity: 0.7; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }" +
  "@keyframes mg-ripple-kf { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(1.6); opacity: 0; } }" +
  "@keyframes mg-winglow-kf { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }" +
  "@keyframes mg-flagwave-kf { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.82); } }" +
  "@keyframes mg-peck-kf { 0%,80%,100% { transform: translateY(0) rotate(0deg); } 90% { transform: translateY(2px) rotate(-8deg); } }" +
  "@keyframes mg-walk-kf { from { left: -8%; } to { left: 108%; } }" +
  "@keyframes mg-shelfpress-kf { 0% { transform: scale(1); } 50% { transform: scale(0.9); } 100% { transform: scale(1); } }" +
  ".mg-twinkle { animation: mg-twinkle-kf 2.2s ease-in-out infinite; }" +
  ".mg-idlebob { animation: mg-idlebob-kf 2.4s ease-in-out infinite; }" +
  ".mg-dance { animation: mg-dance-kf 0.7s ease-in-out infinite; }" +
  ".mg-pop { animation: mg-pop-kf 320ms cubic-bezier(.2,1.6,.4,1); display: inline-block; }" +
  ".mg-fountain { animation: mg-fountain-kf 1.6s ease-in-out infinite; }" +
  ".mg-ripple-a { animation: mg-ripple-kf 2.4s ease-out infinite; transform-origin: center; }" +
  ".mg-winglow { animation: mg-winglow-kf 2.4s ease-in-out infinite; }" +
  ".mg-flagwave { animation: mg-flagwave-kf 1.4s ease-in-out infinite; transform-origin: 50px -15px; }" +
  ".mg-peck { animation: mg-peck-kf 2.8s ease-in-out infinite; }" +
  ".mg-walk { animation: mg-walk-kf linear infinite; }" +
  ".mg-shelfbtn:active:not(:disabled) .mg-pop { animation: mg-shelfpress-kf 180ms ease-out; }" +
  "@media (prefers-reduced-motion: reduce) { .mg-twinkle, .mg-idlebob, .mg-dance, .mg-pop, .mg-fountain, .mg-ripple-a, .mg-winglow, .mg-flagwave, .mg-peck, .mg-walk { animation: none !important; opacity: 1; } }";

export default MarketGame;
