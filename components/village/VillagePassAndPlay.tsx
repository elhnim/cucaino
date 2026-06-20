"use client";

import { useState } from "react";
import { CARD_BY_ID, CARDS, type CardId, MAX_PLAYERS, MIN_PLAYERS, VILLAGE_AVATARS } from "@/lib/village/config";
import { initState, resolveRound, type Move, type VillagePlayer, type VillageState } from "@/lib/village/engine";
import VillageCard from "./VillageCard";

const TURNIP = "🥔";

type Phase = "setup" | "handoff" | "choose" | "reveal" | "winner";

function TurnipPill({ n, highlight }: { n: number; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums ${
        highlight ? "bg-amber-400 text-amber-950" : "bg-white/90 text-slate-800"
      }`}
    >
      <span>{TURNIP}</span>
      {n}
    </span>
  );
}

export default function VillagePassAndPlay({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [names, setNames] = useState<string[]>(["Player 1", "Player 2"]);
  const [game, setGame] = useState<VillageState | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [moves, setMoves] = useState<Record<string, Move>>({});

  // choose-screen local selection
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const players = game?.players ?? [];
  const picker = players[pickerIndex];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";

  const startGame = () => {
    const ps: VillagePlayer[] = names.map((n, i) => ({
      id: `p${i}`,
      name: n.trim() || `Player ${i + 1}`,
      avatar: VILLAGE_AVATARS[i % VILLAGE_AVATARS.length],
      turnips: 0,
    }));
    setGame(initState(ps));
    setMoves({});
    setPickerIndex(0);
    setPhase("handoff");
  };

  const confirmPick = () => {
    if (!picker || !selectedCard) return;
    const opponents = players.filter((p) => p.id !== picker.id);
    const needsTarget = CARD_BY_ID[selectedCard].needsTarget;
    const autoTarget = opponents.length === 1 ? opponents[0].id : null;
    const target = needsTarget ? autoTarget ?? selectedTarget : null;
    const nextMoves = { ...moves, [picker.id]: { card: selectedCard, targetId: target } };
    setMoves(nextMoves);
    setSelectedCard(null);
    setSelectedTarget(null);

    if (pickerIndex + 1 < players.length) {
      setPickerIndex(pickerIndex + 1);
      setPhase("handoff");
    } else if (game) {
      setGame(resolveRound(game, nextMoves));
      setPhase("reveal");
    }
  };

  const afterReveal = () => {
    if (!game) return;
    if (game.winnerIds) {
      setPhase("winner");
    } else {
      setMoves({});
      setPickerIndex(0);
      setPhase("handoff");
    }
  };

  // ---- Setup --------------------------------------------------------------
  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <div className="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm text-center">
          <div className="text-5xl mb-2">🎲</div>
          <p className="text-gray-700 font-semibold">Pass & play on one device</p>
          <p className="text-sm text-gray-500">Take turns picking secretly, then pass it on.</p>
        </div>

        <div className="space-y-2">
          {names.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-2xl w-8 text-center">{VILLAGE_AVATARS[i % VILLAGE_AVATARS.length]}</span>
              <input
                value={n}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value.slice(0, 16) : x)))}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2 font-bold text-gray-900 focus:outline-none focus:border-emerald-400"
                placeholder={`Player ${i + 1}`}
              />
              {names.length > MIN_PLAYERS && (
                <button
                  type="button"
                  onClick={() => setNames(names.filter((_, j) => j !== i))}
                  className="text-rose-400 font-black text-xl px-2"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {names.length < MAX_PLAYERS && (
          <button
            type="button"
            onClick={() => setNames([...names, `Player ${names.length + 1}`])}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 font-bold text-gray-500 hover:bg-gray-50"
          >
            + Add player
          </button>
        )}

        <button
          type="button"
          onClick={startGame}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"
        >
          Start game 🎴
        </button>
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">
          Back
        </button>
      </div>
    );
  }

  // ---- Hand-off (hide previous picks) -------------------------------------
  if (phase === "handoff" && picker) {
    return (
      <div className="text-center py-10">
        <div className="text-6xl mb-4">{picker.avatar}</div>
        <h2 className="text-2xl font-black text-gray-900 mb-1">Pass to {picker.name}</h2>
        <p className="text-gray-500 mb-6">No peeking, everyone else! 🙈</p>
        <button
          type="button"
          onClick={() => setPhase("choose")}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"
        >
          I&apos;m {picker.name} — pick my card
        </button>
      </div>
    );
  }

  // ---- Choose -------------------------------------------------------------
  if (phase === "choose" && picker && game) {
    const opponents = players.filter((p) => p.id !== picker.id);
    const needsTarget = selectedCard ? CARD_BY_ID[selectedCard].needsTarget : false;
    const autoTarget = opponents.length === 1 ? opponents[0].id : null;
    const effectiveTarget = autoTarget ?? selectedTarget;
    const canSubmit = !!selectedCard && (!needsTarget || !!effectiveTarget);

    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-black text-gray-500">Round {game.round}/{game.maxRounds}</span>
          <span className="text-sm font-black text-amber-700">First to {TURNIP} {game.goal} wins</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-3 mb-3 flex items-center gap-2">
          <span className="text-2xl">{picker.avatar}</span>
          <span className="font-black text-gray-900 flex-1">{picker.name}</span>
          <TurnipPill n={picker.turnips} />
        </div>

        {/* opponents / targets */}
        <div className="flex flex-wrap gap-2 mb-3">
          {opponents.map((m) => {
            const isTarget = effectiveTarget === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={!needsTarget || !!autoTarget}
                onClick={() => setSelectedTarget(m.id)}
                className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 transition-all ${
                  isTarget && needsTarget ? "border-rose-400 bg-rose-50" : "border-gray-200 bg-white"
                } ${needsTarget && !autoTarget ? "active:scale-95" : "cursor-default"}`}
              >
                <span className="text-2xl">{m.avatar}</span>
                <span className="text-left">
                  <span className="block text-sm font-bold text-gray-900 leading-tight">{m.name}</span>
                  <span className="block text-xs text-gray-500 leading-tight">{TURNIP} {m.turnips}</span>
                </span>
              </button>
            );
          })}
        </div>

        {needsTarget && !autoTarget && (
          <p className="text-center text-sm font-bold text-rose-600 mb-2">👆 Tap a rival to {selectedCard === "bandit" ? "rob" : "attack"}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          {CARDS.map((card) => (
            <VillageCard
              key={card.id}
              card={card}
              size="sm"
              selected={selectedCard === card.id}
              onClick={() => {
                setSelectedCard(card.id);
                if (!CARD_BY_ID[card.id].needsTarget) setSelectedTarget(null);
              }}
            />
          ))}
        </div>

        {selectedCard && <p className="text-center text-sm text-gray-600 mb-3 px-2">{CARD_BY_ID[selectedCard].blurb}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={confirmPick}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Lock it in & pass 🤫
        </button>
      </div>
    );
  }

  // ---- Reveal -------------------------------------------------------------
  if (phase === "reveal" && game?.lastResolution) {
    const resolution = game.lastResolution;
    return (
      <div>
        <style>{`@keyframes vp-flip{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}`}</style>
        <h2 className="text-center text-xl font-black text-gray-900 mb-1">Round {resolution.round} reveal!</h2>
        <p className="text-center text-sm text-gray-500 mb-4">Everyone flips at once…</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {players.map((p, i) => {
            const mv = resolution.moves[p.id];
            const card = mv ? CARD_BY_ID[mv.card] : null;
            const delta = resolution.deltas[p.id] ?? 0;
            return (
              <div key={p.id} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3" style={{ animation: `vp-flip 0.4s ease ${i * 0.08}s both` }}>
                <div className="w-12 shrink-0">{card ? <VillageCard card={card} size="sm" /> : <span className="text-3xl">❔</span>}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-lg">{p.avatar}</span>
                    <span className="font-bold text-gray-900 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <TurnipPill n={p.turnips} />
                    {delta !== 0 && (
                      <span className={`text-xs font-black ${delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 mb-5">
          <p className="text-xs font-black uppercase text-stone-400 mb-2">What happened</p>
          <ul className="flex flex-col gap-1.5">
            {resolution.events.map((ev, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                <span>{ev.emoji}</span>
                <span>{ev.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={afterReveal}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"
        >
          {game.winnerIds ? "See who won 🏆" : "Next round ▶"}
        </button>
      </div>
    );
  }

  // ---- Winner -------------------------------------------------------------
  if (phase === "winner" && game) {
    const winners = game.winnerIds ?? [];
    const standings = [...players].sort((a, b) => b.turnips - a.turnips);
    const tie = winners.length > 1;
    return (
      <div className="text-center">
        <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(12deg)}}`}</style>
        <div className="flex flex-wrap justify-center gap-2 text-3xl mb-3">
          {["🎉", "🏆", "🥔", "✨", "🎊", "🥳", "🌟", "🎈"].map((e, i) => (
            <span key={i} style={{ animation: `vp-float ${1.4 + (i % 4) * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }}>
              {e}
            </span>
          ))}
        </div>
        <h2 className="text-3xl font-black text-amber-900">{tie ? "It's a tie!" : `${nameOf(winners[0])} wins!`}</h2>
        <p className="text-amber-700 font-bold mb-5">Most turnips in the village 🥔</p>

        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 text-left">
          {standings.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="w-6 text-center font-black text-gray-400">{i + 1}</span>
              <span className="text-2xl">{p.avatar}</span>
              <span className="flex-1 font-bold text-gray-900">{p.name}</span>
              <TurnipPill n={p.turnips} highlight={winners.includes(p.id)} />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={startGame}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors mb-3"
        >
          Play Again 🎮
        </button>
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">
          Back to menu
        </button>
      </div>
    );
  }

  return null;
}
