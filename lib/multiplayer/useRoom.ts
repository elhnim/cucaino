"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoom } from "./rooms";
import type { GameRoom } from "./types";

/**
 * Subscribe to a game room and keep its state live across devices.
 * Loads the row once, then applies realtime row changes (the whole row,
 * including the jsonb state, arrives in the payload — no refetch needed).
 *
 * `loaded` only flips true once the initial fetch for the CURRENT roomId has
 * resolved, so callers can tell "still loading" apart from "confirmed gone"
 * without a race when roomId first changes.
 */
export function useRoom<G = unknown>(roomId: string | null) {
  const [room, setRoom] = useState<GameRoom<G> | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Track the roomId this hook render is responsible for so the stale check
  // never reads a `loaded` value left over from a previous room.
  const currentId = useRef<string | null>(roomId);
  currentId.current = roomId;

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoaded(true);
      return;
    }

    let active = true;
    setRoom(null);
    setLoaded(false);
    getRoom(roomId).then((r) => {
      if (!active) return;
      if (r.ok) setRoom(r.data as GameRoom<G>);
      setLoaded(true);
    });

    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (!row?.id) return;
          setRoom({
            id: row.id,
            gameKey: row.game_key,
            roomCode: row.room_code,
            status: row.status,
            state: row.state ?? { members: [], game: {} },
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // `loaded` is only meaningful for the roomId currently requested.
  const loadedForCurrent = loaded && currentId.current === roomId;
  return { room, loading: !loadedForCurrent, loaded: loadedForCurrent };
}
