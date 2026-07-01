"use client";

import { useState } from "react";
import { type CardId, MERC_COST, RELIC_COST, VILLAGE_AVATARS, WIN_RELICS } from "@/lib/village/config";
import { applyPurchase, initGame, nextRound, type Picks, resolveRound, type VillageGame, wealth } from "@/lib/village/engine";
import VillageCard from "./VillageCard";

const TURNIP = "🥔";
const IDS = ["p0", "p1"] as const;

type Phase = "setup" | "handoff" | "pick" | "reveal" | "shopHandoff" | "shop" | "winner";

export default function VillagePassAndPlay({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [names, setNames] = useState<[string, string]>(["Player 1", "Player 2"]);
  const [game, setGame] = useState<VillageGame | null>(null);
  const [active, setActive] = useState(0);
  const [roundPicks, setRoundPicks] = useState<Record<string, Picks>>({});
  const [shopQueue, setShopQueue] = useState<string[]>([]);
  const [slot, setSlot] = useState<"l" | "r">("l");
  const [picks, setPicks] = useState<{ l?: CardId; r?: CardId }>({});

  const nameOf = (id: string) => names[IDS.indexOf(id as (typeof IDS)[number])] || "Player";
  const avatarOf = (id: string) => VILLAGE_AVATARS[IDS.indexOf(id as (typeof IDS)[number]) % VILLAGE_AVATARS.length];

  const start = () => {
    setGame(initGame("p0", "p1"));
    setActive(0);
    setRoundPicks({});
    setShopQueue([]);
    setPicks({});
    setSlot("l");
    setPhase("handoff");
  };

  const confirmPick = () => {
    if (!game || !picks.l || !picks.r || picks.l === picks.r) return;
    const id = IDS[active];
    const np = { ...roundPicks, [id]: { l: picks.l, r: picks.r } };
    setPicks({});
    setSlot("l");
    if (active === 0) {
      setRoundPicks(np);
      setActive(1);
      setPhase("handoff");
    } else {
      const ng = resolveRound({ ...game, reveal: np, resolved: false });
      setGame(ng);
      setRoundPicks({});
      setActive(0);
      setPhase("reveal");
    }
  };

  const afterReveal = () => {
    if (!game) return;
    const pend = Object.keys(game.shopPending ?? {});
    if (pend.length > 0) {
      setShopQueue(pend);
      setActive(IDS.indexOf(pend[0] as (typeof IDS)[number]));
      setPhase("shopHandoff");
    } else if (game.winner) {
      setPhase("winner");
    } else {
      setGame(nextRound(game));
      setActive(0);
      setPhase("handoff");
    }
  };

  const chooseShop = (choice: string) => {
    if (!game) return;
    const id = shopQueue[0];
    const ng = applyPurchase(game, id, choice);
    setGame(ng);
    const rest = shopQueue.slice(1);
    setShopQueue(rest);
    if (ng.winner) {
      setPhase("winner");
    } else if (rest.length > 0) {
      setActive(IDS.indexOf(rest[0] as (typeof IDS)[number]));
      setPhase("shopHandoff");
    } else {
      setGame(nextRound(ng));
      setActive(0);
      setPhase("handoff");
    }
  };

  // ---- Setup --------------------------------------------------------------
  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <div className="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm text-center">
          <div className="text-5xl mb-2">🎲</div>
          <p className="text-gray-700 font-semibold">Pass &amp; play on one device</p>
          <p className="text-sm text-gray-500">Each turn, pick in secret then hand the device over.</p>
        </div>
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-2xl w-8 text-center">{VILLAGE_AVATARS[i % VILLAGE_AVATARS.length]}</span>
            <input
              value={n}
              onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value.slice(0, 16) : x)) as [string, string])}
              className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2 font-bold text-gray-900 focus:outline-none focus:border-emerald-400"
              placeholder={`Player ${i + 1}`}
            />
          </div>
        ))}
        <button type="button" onClick={start} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors">Start game 🎴</button>
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Back</button>
      </div>
    );
  }

  if (!game) return null;
  const activeId = IDS[active];

  const Scoreboard = () => (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {IDS.map((id) => {
        const p = game.players[id];
        return (
          <div key={id} className="bg-white rounded-2xl shadow-sm p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xl">{avatarOf(id)}</span>
              <span className="font-black text-sm text-gray-900 truncate">{nameOf(id)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-black tabular-nums">
              <span className="text-amber-700">{TURNIP} {p.turnips}</span>
              <span className="text-sky-700">🏦 {p.bank}</span>
              <span className="text-violet-700">💎 {p.relics}/{WIN_RELICS}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ---- Hand-off -----------------------------------------------------------
  if (phase === "handoff" || phase === "shopHandoff") {
    return (
      <div className="text-center py-10">
        <div className="text-6xl mb-4">{avatarOf(activeId)}</div>
        <h2 className="text-2xl font-black text-gray-900 mb-1">Pass to {nameOf(activeId)}</h2>
        <p className="text-gray-500 mb-6">No peeking, {nameOf(IDS[1 - active])}! 🙈</p>
        <button
          type="button"
          onClick={() => setPhase(phase === "handoff" ? "pick" : "shop")}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"
        >
          I&apos;m {nameOf(activeId)} {phase === "handoff" ? "— pick my cards" : "— open my shop"}
        </button>
      </div>
    );
  }

  // ---- Reveal -------------------------------------------------------------
  if (phase === "reveal" && game.reveal && game.resolution) {
    const a = game.reveal[IDS[0]];
    const b = game.reveal[IDS[1]];
    const duels = [
      { left: a.l, right: b.r },
      { left: a.r, right: b.l },
    ];
    return (
      <div>
        <style>{`@keyframes vp-flip{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}`}</style>
        <Scoreboard />
        <h2 className="text-center text-lg font-black text-gray-900 mb-2">Reveal — round {game.round}</h2>
        <div className="space-y-2 mb-3">
          {duels.map((d, i) => (
            <div key={i} className="flex items-center justify-center gap-2" style={{ animation: `vp-flip 0.4s ease ${i * 0.1}s both` }}>
              <div className="w-16"><VillageCard card={d.left} size="sm" showText={false} /></div>
              <span className="text-xl">⚔️</span>
              <div className="w-16"><VillageCard card={d.right} size="sm" showText={false} /></div>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-4 mb-4">
          {IDS.map((id) => {
            const dv = game.resolution!.delta[id] ?? 0;
            return (
              <span key={id} className="text-sm font-black">
                {avatarOf(id)} <span className={dv > 0 ? "text-emerald-600" : dv < 0 ? "text-rose-600" : "text-gray-400"}>{dv > 0 ? `+${dv}` : dv} 🥔</span>
              </span>
            );
          })}
        </div>
        <button type="button" onClick={afterReveal} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors">
          {Object.keys(game.shopPending ?? {}).length > 0 ? "Continue to shop 🔮" : game.winner ? "See result 🏆" : "Next round ▶"}
        </button>
      </div>
    );
  }

  // ---- Shop ---------------------------------------------------------------
  if (phase === "shop") {
    const p = game.players[activeId];
    return (
      <div>
        <Scoreboard />
        <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4">
          <p className="font-black text-violet-800 mb-1">🔮 {nameOf(activeId)}&apos;s Mystic shop</p>
          <p className="text-xs text-gray-500 mb-2">Wealth: {TURNIP} {wealth(p)}</p>
          <button type="button" disabled={wealth(p) < RELIC_COST} onClick={() => chooseShop("relic")} className="w-full py-3 mb-2 rounded-xl font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 transition-colors">Buy a Relic 💎 — {RELIC_COST} 🥔</button>
          <p className="text-xs font-black uppercase text-gray-400 mb-1">Mercenary market</p>
          <div className="grid grid-cols-4 gap-1.5">
            {game.market.map((c, i) => (
              <VillageCard key={`${c}-${i}`} card={c} size="sm" showText={false} disabled={wealth(p) < (MERC_COST[c] ?? Infinity)} onClick={() => chooseShop(c)} />
            ))}
          </div>
          <button type="button" onClick={() => chooseShop("skip")} className="w-full py-2.5 mt-2 rounded-xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Skip</button>
        </div>
      </div>
    );
  }

  // ---- Winner -------------------------------------------------------------
  if (phase === "winner") {
    const standings = IDS.map((id) => ({ id, p: game.players[id] })).sort((x, y) => y.p.relics - x.p.relics);
    return (
      <div className="text-center">
        <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(12deg)}}`}</style>
        <div className="flex flex-wrap justify-center gap-2 text-3xl mb-3">
          {["🎉", "🏆", "💎", "✨", "🎊", "🥳"].map((e, i) => (
            <span key={i} style={{ animation: `vp-float ${1.4 + (i % 4) * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }}>{e}</span>
          ))}
        </div>
        <h2 className="text-3xl font-black text-amber-900">{game.winner ? nameOf(game.winner) : ""} wins!</h2>
        <p className="text-amber-700 font-bold mb-5">Reached {WIN_RELICS} relics 💎</p>
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 text-left">
          {standings.map(({ id, p }, i) => (
            <div key={id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="w-6 text-center font-black text-gray-400">{i + 1}</span>
              <span className="text-2xl">{avatarOf(id)}</span>
              <span className="flex-1 font-bold text-gray-900">{nameOf(id)}</span>
              <span className="font-black text-violet-700">💎 {p.relics}</span>
            </div>
          ))}
        </div>
        <button type="button" onClick={start} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors mb-3">Play Again 🎮</button>
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Back to menu</button>
      </div>
    );
  }

  // ---- Pick (Left + Right) ------------------------------------------------
  const meP = game.players[activeId];
  const distinct = picks.l && picks.r && picks.l !== picks.r;
  const placeCard = (c: CardId) => {
    setPicks((prev) => {
      const other = slot === "l" ? prev.r : prev.l;
      const np: { l?: CardId; r?: CardId } = { ...prev, [slot]: c };
      if (other === c) np[slot === "l" ? "r" : "l"] = undefined;
      return np;
    });
    setSlot((s) => (s === "l" ? "r" : "l"));
  };

  return (
    <div>
      <Scoreboard />
      <p className="text-center text-sm font-black text-gray-700 mb-2">{avatarOf(activeId)} {nameOf(activeId)} — round {game.round}</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {(["l", "r"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSlot(s)} className={`rounded-2xl border-2 p-2 min-h-[112px] flex flex-col items-center justify-center transition-all ${slot === s ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"}`}>
            <span className="text-[10px] font-black uppercase text-gray-400 mb-1">{s === "l" ? "◀ Left" : "Right ▶"}</span>
            {picks[s] ? <div className="w-16"><VillageCard card={picks[s]!} size="sm" showText={false} /></div> : <span className="text-gray-300 text-3xl">＋</span>}
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-gray-400 mb-3">Your Left fights their Right · your Right fights their Left.</p>
      <p className="text-xs font-black uppercase text-gray-400 mb-1">Your hand</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {meP.hand.map((c, i) => (
          <VillageCard key={`${c}-${i}`} card={c} size="sm" selected={picks.l === c || picks.r === c} corner={picks.l === c ? "L" : picks.r === c ? "R" : undefined} onClick={() => placeCard(c)} />
        ))}
      </div>
      <div className="mb-4">
        <p className="text-xs font-black uppercase text-gray-400 mb-1">Mercenary market</p>
        <div className="grid grid-cols-4 gap-1.5">
          {game.market.map((c, i) => (
            <VillageCard key={`${c}-${i}`} card={c} size="sm" showText={false} />
          ))}
        </div>
      </div>
      <button type="button" disabled={!distinct} onClick={confirmPick} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {distinct ? "Lock it in & pass 🤫" : "Pick two different cards"}
      </button>
    </div>
  );
}
