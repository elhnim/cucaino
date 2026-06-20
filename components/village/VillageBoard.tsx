"use client";

import { useEffect, useState } from "react";
import { type CardId, MERC_COST, META, RELIC_COST, WIN_RELICS } from "@/lib/village/config";
import { canShop, wealth, type VillageGame } from "@/lib/village/engine";
import type { GameRoom, RoomMember } from "@/lib/multiplayer/types";
import VillageCard from "./VillageCard";

const TURNIP = "🥔";

function Scoreboard({ members, game, meId }: { members: RoomMember[]; game: VillageGame; meId: string }) {
  const ordered = [...members].sort((a) => (a.id === meId ? -1 : 1));
  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {ordered.map((m) => {
        const p = game.players[m.id];
        if (!p) return null;
        return (
          <div key={m.id} className="bg-white rounded-2xl shadow-sm p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xl">{m.avatar}</span>
              <span className="font-black text-sm text-gray-900 truncate">{m.name}{m.id === meId ? " (you)" : ""}</span>
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
}

function Market({ market, onPick, affordable }: { market: CardId[]; onPick?: (c: CardId) => void; affordable?: (c: CardId) => boolean }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-gray-400 mb-1">Mercenary market</p>
      <div className="grid grid-cols-4 gap-1.5">
        {market.map((c, i) => (
          <VillageCard
            key={`${c}-${i}`}
            card={c}
            size="sm"
            showText={false}
            disabled={onPick ? !(affordable?.(c) ?? true) : true}
            onClick={onPick ? () => onPick(c) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export default function VillageBoard({
  room,
  memberId,
  busy,
  onSubmitPicks,
  onShopChoice,
  onNext,
  onRematch,
  onExit,
}: {
  room: GameRoom<VillageGame>;
  memberId: string;
  busy: boolean;
  onSubmitPicks: (l: CardId, r: CardId) => void;
  onShopChoice: (choice: string) => void;
  onNext: () => void;
  onRematch: () => void;
  onExit: () => void;
}) {
  const members = room.state.members;
  const game = room.state.game;
  const me = members.find((m) => m.id === memberId);
  const opp = members.find((m) => m.id !== memberId);
  const isHost = !!me?.isHost;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Player";

  const [slot, setSlot] = useState<"l" | "r">("l");
  const [picks, setPicks] = useState<{ l?: CardId; r?: CardId }>({});

  useEffect(() => {
    setPicks({});
    setSlot("l");
  }, [game?.round]);

  if (!game?.players?.[memberId]) return null;
  const meP = game.players[memberId];

  // ---- Winner -------------------------------------------------------------
  if (room.status === "finished" && game.winner) {
    const standings = members
      .map((m) => ({ m, p: game.players[m.id] }))
      .filter((x) => x.p)
      .sort((a, b) => b.p.relics - a.p.relics);
    return (
      <div className="text-center">
        <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(12deg)}}`}</style>
        <div className="flex flex-wrap justify-center gap-2 text-3xl mb-3">
          {["🎉", "🏆", "💎", "✨", "🎊", "🥳"].map((e, i) => (
            <span key={i} style={{ animation: `vp-float ${1.4 + (i % 4) * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }}>{e}</span>
          ))}
        </div>
        <h2 className="text-3xl font-black text-amber-900">{nameOf(game.winner)} wins!</h2>
        <p className="text-amber-700 font-bold mb-5">Reached {WIN_RELICS} relics 💎</p>
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 text-left">
          {standings.map(({ m, p }, i) => (
            <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="w-6 text-center font-black text-gray-400">{i + 1}</span>
              <span className="text-2xl">{m.avatar}</span>
              <span className="flex-1 font-bold text-gray-900">{m.name}</span>
              <span className="font-black text-violet-700">💎 {p.relics}</span>
            </div>
          ))}
        </div>
        {isHost ? (
          <button type="button" onClick={onRematch} disabled={busy} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 transition-colors mb-3">Rematch 🎮</button>
        ) : (
          <p className="text-sm font-bold text-gray-500 mb-3">Waiting for the host to start a rematch…</p>
        )}
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Leave game</button>
      </div>
    );
  }

  // ---- Reveal -------------------------------------------------------------
  if (game.reveal && game.resolved && game.resolution) {
    const myPicks = game.reveal[memberId];
    const oppPicks = opp ? game.reveal[opp.id] : null;
    const duels = oppPicks
      ? [
          { mine: myPicks.l, theirs: oppPicks.r },
          { mine: myPicks.r, theirs: oppPicks.l },
        ]
      : [];
    const shopPendingIds = Object.keys(game.shopPending ?? {});
    const iShop = !!game.shopPending?.[memberId];
    const iChose = game.shopChoice?.[memberId] != null;

    return (
      <div>
        <style>{`@keyframes vp-flip{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}`}</style>
        <Scoreboard members={members} game={game} meId={memberId} />

        <h2 className="text-center text-lg font-black text-gray-900 mb-2">Reveal — round {game.round}</h2>
        <div className="space-y-2 mb-3">
          {duels.map((d, i) => (
            <div key={i} className="flex items-center justify-center gap-2" style={{ animation: `vp-flip 0.4s ease ${i * 0.1}s both` }}>
              <div className="w-16"><VillageCard card={d.mine} size="sm" showText={false} /></div>
              <span className="text-xl">⚔️</span>
              <div className="w-16"><VillageCard card={d.theirs} size="sm" showText={false} /></div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-4 mb-4">
          {members.map((m) => {
            const dv = game.resolution!.delta[m.id] ?? 0;
            return (
              <span key={m.id} className="text-sm font-black">
                {m.avatar} <span className={dv > 0 ? "text-emerald-600" : dv < 0 ? "text-rose-600" : "text-gray-400"}>{dv > 0 ? `+${dv}` : dv} 🥔</span>
              </span>
            );
          })}
        </div>

        {/* Shop */}
        {iShop && !iChose && (
          <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4 mb-4">
            <p className="font-black text-violet-800 mb-2">🔮 Your Mystic opened the shop!</p>
            <button
              type="button"
              disabled={wealth(meP) < RELIC_COST || busy}
              onClick={() => onShopChoice("relic")}
              className="w-full py-3 mb-2 rounded-xl font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              Buy a Relic 💎 — {RELIC_COST} 🥔
            </button>
            <Market market={game.market} affordable={(c) => wealth(meP) >= (MERC_COST[c] ?? Infinity)} onPick={(c) => onShopChoice(c)} />
            <p className="text-[11px] text-gray-500 mt-1">Tap an affordable mercenary to hire it for the rest of the game.</p>
            <button type="button" onClick={() => onShopChoice("skip")} disabled={busy} className="w-full py-2.5 mt-2 rounded-xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Skip</button>
          </div>
        )}
        {iShop && iChose && <p className="text-center text-sm font-bold text-gray-500 mb-3">Purchase made — waiting…</p>}

        {/* Advance */}
        {shopPendingIds.length > 0 && !iShop && (
          <p className="text-center text-sm font-bold text-gray-500 mb-3">Waiting for {shopPendingIds.map(nameOf).join(" & ")} to shop…</p>
        )}
        {shopPendingIds.length === 0 && (
          isHost ? (
            <button type="button" onClick={onNext} disabled={busy} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 transition-colors">
              {game.winner ? "See result 🏆" : "Next round ▶"}
            </button>
          ) : (
            <p className="text-center text-sm font-bold text-gray-500">Waiting for the host to deal the next round…</p>
          )
        )}
      </div>
    );
  }

  if (game.reveal && !game.resolved) {
    return <p className="text-center text-gray-500 font-bold py-12">Revealing…</p>;
  }

  // ---- Waiting (I've submitted) ------------------------------------------
  if (game.submitted?.[memberId]) {
    return (
      <div>
        <Scoreboard members={members} game={game} meId={memberId} />
        <div className="text-center py-8">
          <div className="text-5xl animate-bounce mb-3">🤫</div>
          <h2 className="text-xl font-black text-gray-900 mb-1">Cards locked in!</h2>
          <p className="text-gray-500">
            {opp && game.submitted?.[opp.id] ? "Revealing…" : `Waiting for ${opp ? opp.name : "your opponent"}…`}
          </p>
        </div>
      </div>
    );
  }

  // ---- Pick (Left + Right) ------------------------------------------------
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
      <Scoreboard members={members} game={game} meId={memberId} />

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-black text-gray-500">Round {game.round}</span>
        {opp && <span className="text-xs font-bold text-gray-400">{game.submitted?.[opp.id] ? `${opp.name} locked in 🔒` : `${opp.name} choosing…`}</span>}
      </div>

      {/* Slots */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {(["l", "r"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={`rounded-2xl border-2 p-2 min-h-[112px] flex flex-col items-center justify-center transition-all ${
              slot === s ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
            }`}
          >
            <span className="text-[10px] font-black uppercase text-gray-400 mb-1">{s === "l" ? "◀ Left" : "Right ▶"}</span>
            {picks[s] ? (
              <div className="w-16"><VillageCard card={picks[s]!} size="sm" showText={false} /></div>
            ) : (
              <span className="text-gray-300 text-3xl">＋</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-gray-400 mb-3">Your Left fights their Right · your Right fights their Left.</p>

      {/* Hand */}
      <p className="text-xs font-black uppercase text-gray-400 mb-1">Your hand</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {meP.hand.map((c, i) => (
          <VillageCard
            key={`${c}-${i}`}
            card={c}
            size="sm"
            selected={picks.l === c || picks.r === c}
            corner={picks.l === c ? "L" : picks.r === c ? "R" : undefined}
            onClick={() => placeCard(c)}
          />
        ))}
      </div>

      <div className="mb-4"><Market market={game.market} /></div>

      <button
        type="button"
        disabled={!distinct || busy}
        onClick={() => distinct && onSubmitPicks(picks.l!, picks.r!)}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Sending…" : distinct ? "Lock in & reveal 🤫" : "Pick two different cards"}
      </button>
    </div>
  );
}
