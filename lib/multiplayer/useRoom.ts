"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoom } from "./rooms";
import type { GameRoom } from "./types";

/**
 * Subscribe to a game room and keep its state live across devices.
 * Loads the row once, then applies realtime row changes (the whole row,
 * including the jsonb state, arrives in the payload — no refetch needed).
 */
export function useRoom<G = unknown>(roomId: string | null) {
  const [room, setRoom] = useState<GameRoom<G> | null>(null);
  const [loading, setLoading] = useState<boolean>(!!roomId);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    getRoom(roomId).then((r) => {
      if (!active) return;
      if (r.ok) setRoom(r.data as GameRoom<G>);
      setLoading(false);
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

  return { room, loading };
}
