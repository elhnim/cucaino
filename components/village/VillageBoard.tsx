"use client";

import { useMemo, useState } from "react";
import { CARD_BY_ID, CARDS, type CardId } from "@/lib/village/config";
import type { VillageState } from "@/lib/village/engine";
import type { GameRoom } from "@/lib/multiplayer/types";
import VillageCard from "./VillageCard";

const TURNIP = "🥔";

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

export default function VillageBoard({
  room,
  memberId,
  onSubmit,
  onPlayAgain,
  onExit,
  busy,
}: {
  room: GameRoom<VillageState>;
  memberId: string;
  onSubmit: (card: CardId, targetId: string | null) => void;
  onPlayAgain: () => void;
  onExit: () => void;
  busy: boolean;
}) {
  const members = room.state.members;
  const game = room.state.game;
  const me = members.find((m) => m.id === memberId);
  const isHost = !!me?.isHost;

  const [selectedCard, setSelectedCard] = useState<CardId | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [dismissedRound, setDismissedRound] = useState(0);

  const opponents = useMemo(() => members.filter((m) => m.id !== memberId), [members, memberId]);
  const playerTurnips = (id: string) => game.players.find((p) => p.id === id)?.turnips ?? 0;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Player";

  const myPending = game.pending?.[memberId];
  const resolution = game.lastResolution;
  const finished = room.status === "finished";
  const showResolution = !finished && resolution && resolution.round > dismissedRound;

  // ---- Winner screen ------------------------------------------------------
  if (finished) {
    const winners = game.winnerIds ?? [];
    const standings = [...game.players].sort((a, b) => b.turnips - a.turnips);
    const tie = winners.length > 1;
    return (
      <div className="relative max-w-lg mx-auto text-center">
        <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(12deg)}}`}</style>
        <div className="flex flex-wrap justify-center gap-2 text-3xl mb-3">
          {["🎉", "🏆", "🥔", "✨", "🎊", "🥳", "🌟", "🎈"].map((e, i) => (
            <span key={i} style={{ animation: `vp-float ${1.4 + (i % 4) * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }}>
              {e}
            </span>
          ))}
        </div>
        <h2 className="text-3xl font-black text-amber-900">
          {tie ? "It's a tie!" : `${nameOf(winners[0])} wins!`}
        </h2>
        <p className="text-amber-700 font-bold mb-5">Most turnips in the village 🥔</p>

        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 text-left">
          {standings.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="w-6 text-center font-black text-gray-400">{i + 1}</span>
              <span className="text-2xl">{members.find((m) => m.id === p.id)?.avatar ?? "🙂"}</span>
              <span className="flex-1 font-bold text-gray-900">{p.name}</span>
              <TurnipPill n={p.turnips} highlight={winners.includes(p.id)} />
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={onPlayAgain}
            disabled={busy}
            className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 transition-colors mb-3"
          >
            Play Again 🎮
          </button>
        ) : (
          <p className="text-sm font-bold text-gray-500 mb-3">Waiting for the host to start a new game…</p>
        )}
        <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">
          Leave game
        </button>
      </div>
    );
  }

  // ---- Reveal screen ------------------------------------------------------
  if (showResolution && resolution) {
    return (
      <div className="max-w-lg mx-auto">
        <style>{`@keyframes vp-flip{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}`}</style>
        <h2 className="text-center text-xl font-black text-gray-900 mb-1">Round {resolution.round} reveal!</h2>
        <p className="text-center text-sm text-gray-500 mb-4">Everyone flips at once…</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {members.map((m, i) => {
            const mv = resolution.moves[m.id];
            const card = mv ? CARD_BY_ID[mv.card] : null;
            const delta = resolution.deltas[m.id] ?? 0;
            return (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3" style={{ animation: `vp-flip 0.4s ease ${i * 0.08}s both` }}>
                <div className="w-12 shrink-0">
                  {card ? <VillageCard card={card} size="sm" /> : <span className="text-3xl">❔</span>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-lg">{m.avatar}</span>
                    <span className="font-bold text-gray-900 truncate">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <TurnipPill n={playerTurnips(m.id)} />
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
          onClick={() => setDismissedRound(resolution.round)}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"
        >
          Next round ▶
        </button>
      </div>
    );
  }

  // ---- Waiting for others -------------------------------------------------
  if (myPending) {
    const waiting = members.filter((m) => !game.pending?.[m.id]);
    const submitted = members.length - waiting.length;
    return (
      <div className="max-w-lg mx-auto text-center py-8">
        <div className="text-5xl animate-bounce mb-3">{CARD_BY_ID[myPending.card].emoji}</div>
        <h2 className="text-xl font-black text-gray-900 mb-1">Card locked in!</h2>
        <p className="text-gray-500 mb-5">
          {submitted}/{members.length} villagers ready
        </p>
        <div className="bg-white rounded-2xl shadow-sm p-4 inline-block">
          <p className="text-xs font-black uppercase text-gray-400 mb-2">Waiting for</p>
          {waiting.length === 0 ? (
            <p className="text-sm font-bold text-gray-500">Resolving…</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              {waiting.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-sm font-bold text-gray-700">
                  <span>{m.avatar}</span>
                  {m.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Choosing -----------------------------------------------------------
  const needsTarget = selectedCard ? CARD_BY_ID[selectedCard].needsTarget : false;
  const autoTarget = opponents.length === 1 ? opponents[0].id : null;
  const effectiveTarget = autoTarget ?? selectedTarget;
  const canSubmit = !!selectedCard && (!needsTarget || !!effectiveTarget);

  return (
    <div className="max-w-lg mx-auto">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-black text-gray-500">
          Round {game.round}/{game.maxRounds}
        </span>
        <span className="text-sm font-black text-amber-700">First to {TURNIP} {game.goal} wins</span>
      </div>

      {/* Opponents */}
      <div className="flex flex-wrap gap-2 mb-4">
        {opponents.map((m) => {
          const ready = !!game.pending?.[m.id];
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
                <span className="block text-xs text-gray-500 leading-tight">
                  {TURNIP} {playerTurnips(m.id)} {ready ? "· ready ✅" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {needsTarget && !autoTarget && (
        <p className="text-center text-sm font-bold text-rose-600 mb-2">👆 Tap a rival to {selectedCard === "bandit" ? "rob" : "attack"}</p>
      )}

      {/* Your hand */}
      <p className="text-xs font-black uppercase text-gray-400 mb-2">
        Your cards {me ? `· ${me.avatar} ${me.name}` : ""} · {TURNIP} {playerTurnips(memberId)}
      </p>
      <div className="grid grid-cols-3 gap-2 mb-5">
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

      {selectedCard && (
        <p className="text-center text-sm text-gray-600 mb-3 px-2">{CARD_BY_ID[selectedCard].blurb}</p>
      )}

      <button
        type="button"
        disabled={!canSubmit || busy}
        onClick={() => selectedCard && onSubmit(selectedCard, needsTarget ? effectiveTarget : null)}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Sending…" : "Play card 🎴"}
      </button>
    </div>
  );
}
