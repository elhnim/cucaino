"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type CardId, PLAYERS, VILLAGE_AVATARS } from "@/lib/village/config";
import { applyPurchase, initGame, nextRound, resolveRound, type VillageGame } from "@/lib/village/engine";
import { createRoom, joinRoom, leaveRoom, patchRoom, setRoomStatePath, submitRoomSecret } from "@/lib/multiplayer/rooms";
import { clearSession, loadSession, saveSession, type RoomSession } from "@/lib/multiplayer/session";
import { useRoom } from "@/lib/multiplayer/useRoom";
import type { GameRoom } from "@/lib/multiplayer/types";
import VillageBoard from "./VillageBoard";
import VillagePassAndPlay from "./VillagePassAndPlay";

const GAME_KEY = "village-pillage";

export default function VillagePillage({ kidId, kidName }: { kidId: string | null; kidName: string }) {
  const backHref = kidId ? `/kid/${kidId}/play` : "/select-kid";
  const [session, setSession] = useState<RoomSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState(kidName || "Player");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const hostBusyRef = useRef(false);

  const { room, loading, loaded } = useRoom<VillageGame>(session?.roomId ?? null);

  useEffect(() => {
    setSession(loadSession(GAME_KEY));
    setHydrated(true);
  }, []);

  // Drop a stale session only once its room is confirmed gone.
  useEffect(() => {
    if (hydrated && session && loaded && !room) {
      clearSession(GAME_KEY);
      setSession(null);
    }
  }, [hydrated, session, loaded, room]);

  // Host is the single authority: it resolves the round and applies shop buys.
  useEffect(() => {
    if (!room || !session || room.status !== "playing") return;
    const me = room.state.members.find((m) => m.id === session.memberId);
    if (!me?.isHost) return;
    const g = room.state.game;
    if (!g || hostBusyRef.current) return;

    const commit = (game: VillageGame, status: "playing" | "finished") => {
      hostBusyRef.current = true;
      patchRoom(room.id, { state: { ...room.state, game }, status }).finally(() => {
        hostBusyRef.current = false;
      });
    };

    if (g.reveal && !g.resolved) {
      commit(resolveRound(g), "playing");
      return;
    }
    if (g.resolved) {
      const choices = Object.keys(g.shopChoice ?? {}).filter((id) => g.shopPending?.[id]);
      if (choices.length > 0) {
        let ng = g;
        for (const id of choices) ng = applyPurchase(ng, id, g.shopChoice[id]);
        commit(ng, ng.winner ? "finished" : "playing");
      }
    }
  }, [room, session]);

  const enterRoom = (s: RoomSession) => {
    saveSession(GAME_KEY, s);
    setSession(s);
  };

  const handleCreate = useCallback(async () => {
    setError(null);
    setBusy(true);
    const res = await createRoom({ gameKey: GAME_KEY, kidId, hostName: name, avatarPool: VILLAGE_AVATARS });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    enterRoom({ roomId: res.data.roomId, memberId: res.data.memberId });
  }, [kidId, name]);

  const handleJoin = useCallback(async () => {
    setError(null);
    if (code.trim().length < 4) return setError("Enter the 4-letter room code.");
    setBusy(true);
    const res = await joinRoom({ gameKey: GAME_KEY, code, name, kidId, avatarPool: VILLAGE_AVATARS, maxMembers: PLAYERS });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    enterRoom({ roomId: res.data.roomId, memberId: res.data.memberId });
  }, [code, name, kidId]);

  const handleStart = useCallback(async () => {
    if (!room) return;
    const ids = room.state.members.map((m) => m.id);
    if (ids.length !== PLAYERS) return;
    const hostId = room.state.members.find((m) => m.isHost)?.id ?? ids[0];
    const guestId = ids.find((id) => id !== hostId)!;
    setBusy(true);
    await patchRoom(room.id, { state: { ...room.state, game: initGame(hostId, guestId) }, status: "playing" });
    setBusy(false);
  }, [room]);

  const handleSubmitPicks = useCallback(
    async (l: CardId, r: CardId) => {
      if (!room || !session) return;
      setBusy(true);
      const res = await submitRoomSecret(room.id, session.memberId, { l, r });
      setBusy(false);
      if (!res.ok) setError(res.error);
    },
    [room, session],
  );

  const handleShopChoice = useCallback(
    async (choice: string) => {
      if (!room || !session) return;
      setBusy(true);
      await setRoomStatePath(room.id, ["game", "shopChoice", session.memberId], choice);
      setBusy(false);
    },
    [room, session],
  );

  const handleNext = useCallback(async () => {
    if (!room) return;
    const g = room.state.game;
    setBusy(true);
    await patchRoom(room.id, { state: { ...room.state, game: nextRound(g) }, status: "playing" });
    setBusy(false);
  }, [room]);

  const handleRematch = useCallback(async () => {
    if (!room) return;
    const ids = room.state.members.map((m) => m.id);
    const hostId = room.state.members.find((m) => m.isHost)?.id ?? ids[0];
    const guestId = ids.find((id) => id !== hostId)!;
    setBusy(true);
    await patchRoom(room.id, { state: { ...room.state, game: initGame(hostId, guestId) }, status: "playing" });
    setBusy(false);
  }, [room]);

  const handleExit = useCallback(async () => {
    if (room && session) await leaveRoom(room.id, session.memberId);
    clearSession(GAME_KEY);
    setSession(null);
    setCode("");
  }, [room, session]);

  const showEntry = !localMode && (!session || (hydrated && loaded && !room));

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 via-emerald-50 to-amber-100">
      <div className="max-w-lg mx-auto p-4 pt-5">
        <div className="flex items-center gap-3 mb-5">
          <Link href={backHref} className="text-sm font-bold text-gray-600 hover:text-gray-800 flex items-center gap-1 shrink-0">← Play</Link>
          <h1 className="text-2xl font-black text-emerald-900 flex-1">🏰 Village Pillage</h1>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">{error}</div>}

        {showEntry && (
          <div className="space-y-5">
            <div className="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm text-center">
              <div className="text-5xl mb-2">🥔</div>
              <p className="text-gray-700 font-semibold mb-1">Grow turnips, raid, bank, and buy relics.</p>
              <p className="text-sm text-gray-500">2 players, each on their own device. First to 5 relics wins.</p>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-gray-400">Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-emerald-400" placeholder="Your name" />
            </div>

            <button type="button" onClick={handleCreate} disabled={busy} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 transition-colors">Create a room 🏰</button>

            <div className="flex items-center gap-3 text-gray-400 text-xs font-black">
              <div className="flex-1 h-px bg-gray-200" /> OR <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 font-black text-xl tracking-[0.3em] text-center text-gray-900 uppercase focus:outline-none focus:border-emerald-400" placeholder="CODE" />
              <button type="button" onClick={handleJoin} disabled={busy} className="px-6 rounded-xl font-black text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 transition-colors">Join</button>
            </div>

            <div className="flex items-center gap-3 text-gray-400 text-xs font-black">
              <div className="flex-1 h-px bg-gray-200" /> OR <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button type="button" onClick={() => { setError(null); setLocalMode(true); }} className="w-full py-4 rounded-2xl font-black text-emerald-800 text-lg bg-white border-2 border-emerald-300 hover:bg-emerald-50 active:scale-95 transition-all">Pass &amp; play on one device 🎲</button>
          </div>
        )}

        {localMode && <VillagePassAndPlay onExit={() => setLocalMode(false)} />}

        {!localMode && !showEntry && session && room && room.status === "lobby" && (
          <VillageLobby room={room} memberId={session.memberId} busy={busy} onStart={handleStart} onExit={handleExit} />
        )}

        {!localMode && !showEntry && session && room && room.status !== "lobby" && room.state.game?.players && (
          <VillageBoard
            room={room}
            memberId={session.memberId}
            busy={busy}
            onSubmitPicks={handleSubmitPicks}
            onShopChoice={handleShopChoice}
            onNext={handleNext}
            onRematch={handleRematch}
            onExit={handleExit}
          />
        )}

        {session && loading && !room && <p className="text-center text-gray-500 font-bold py-10">Connecting to the village…</p>}
      </div>
    </div>
  );
}

function VillageLobby({
  room,
  memberId,
  busy,
  onStart,
  onExit,
}: {
  room: GameRoom<VillageGame>;
  memberId: string;
  busy: boolean;
  onStart: () => void;
  onExit: () => void;
}) {
  const members = room.state.members;
  const isHost = members.find((m) => m.id === memberId)?.isHost;
  const canStart = members.length === PLAYERS;

  return (
    <div className="space-y-5">
      <div className="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm text-center">
        <p className="text-xs font-black uppercase text-gray-400">Room code — share it!</p>
        <p className="text-5xl font-black tracking-[0.3em] text-emerald-700 mt-1">{room.roomCode}</p>
        <p className="text-sm text-gray-500 mt-2">Your opponent opens Village Pillage and taps Join with this code.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <p className="text-xs font-black uppercase text-gray-400 mb-3">Players ({members.length}/{PLAYERS})</p>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-2xl">{m.avatar}</span>
              <span className="flex-1 font-bold text-gray-900">{m.name}{m.id === memberId ? " (you)" : ""}</span>
              {m.isHost && <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">HOST</span>}
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button type="button" onClick={onStart} disabled={!canStart || busy} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {canStart ? "Start game 🎴" : "Waiting for an opponent…"}
        </button>
      ) : (
        <p className="text-center text-gray-500 font-bold py-2">Waiting for the host to start…</p>
      )}

      <button type="button" onClick={onExit} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Leave room</button>
    </div>
  );
}
