"use client";

/**
 * Live link between family kids at the go-kart track.
 *
 * One Supabase Realtime channel per family, topic `karts:<familyId>`:
 *  - Presence carries who's in the park and whether they're at the track (keyed by kidId, so
 *    `channel.presenceState()` is naturally "one entry per kid").
 *  - Broadcast carries every KartNetMsg (invite/accept/start/pose/finish/leave) — pose messages
 *    go out at ~15 Hz from lib/park/karts/race.ts, so payloads are kept tiny (numbers are
 *    rounded before they ever reach here; see lib/park/karts/laps.ts for the lap-report side).
 *
 * No database row is read or written for any of this — see lib/park/karts/store.ts for the
 * (separate) best-lap persistence. Auth: every device in a family already shares the same
 * parent Supabase Auth session (lib/supabase/client.ts, middleware.ts — this app has no
 * separate per-kid auth), so the channel is opened as a *private* channel and authorized by the
 * `realtime.messages` RLS policies in supabase/migrations/0052_kart_laps.sql, scoped to
 * `current_family_id()` the same way every other family table is. See that migration's comment
 * for the one thing to verify before relying on this live (it hasn't been applied or exercised
 * against a real project from this change).
 */
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { KartNet, KartNetMsg, KartRacer } from "./types";

type PresenceEntry = { racer: KartRacer; atTrack: boolean };
type Peer = KartRacer & { atTrack: boolean };

const BROADCAST_EVENT = "kart";
/** reconnect backoff in ms, capped */
const RETRY_MS = [1000, 2000, 5000, 10000];

export interface CreateKartNetArgs {
  familyId: string;
  kidId: string;
  racer: KartRacer;
}

export function createKartNet({ familyId, kidId, racer }: CreateKartNetArgs): KartNet {
  const supabase = createClient();
  const topic = `karts:${familyId}`;

  let channel: RealtimeChannel | null = null;
  let disposed = false;
  let atTrack = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;

  const peerListeners = new Set<(peers: Peer[]) => void>();
  const msgListeners = new Set<(m: KartNetMsg) => void>();

  function emitPeers() {
    if (!channel) return;
    let state: Record<string, PresenceEntry[]>;
    try {
      state = channel.presenceState<PresenceEntry>();
    } catch {
      return;
    }
    const peers: Peer[] = [];
    for (const key of Object.keys(state)) {
      if (key === kidId) continue;
      const entries = state[key];
      const latest = entries?.[entries.length - 1];
      if (latest?.racer) peers.push({ ...latest.racer, atTrack: !!latest.atTrack });
    }
    peerListeners.forEach((cb) => cb(peers));
  }

  function track() {
    try {
      channel?.track({ racer, atTrack } satisfies PresenceEntry);
    } catch {
      // not joined yet — the next SUBSCRIBED callback will track the current atTrack value
    }
  }

  function teardownChannel() {
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore — channel may already be gone
      }
      channel = null;
    }
  }

  function scheduleReconnect() {
    if (disposed || retryTimer) return;
    const delay = RETRY_MS[Math.min(retryIndex, RETRY_MS.length - 1)];
    retryIndex++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      teardownChannel();
      connect();
    }, delay);
  }

  function connect() {
    if (disposed) return;
    channel = supabase.channel(topic, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: kidId },
        private: true,
      },
    });
    channel
      .on("presence", { event: "sync" }, emitPeers)
      .on("presence", { event: "join" }, emitPeers)
      .on("presence", { event: "leave" }, emitPeers)
      .on("broadcast", { event: BROADCAST_EVENT }, ({ payload }: { payload: KartNetMsg }) => {
        msgListeners.forEach((cb) => cb(payload));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          retryIndex = 0;
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          track();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });
  }

  connect();

  return {
    onPeers(cb) {
      peerListeners.add(cb);
      emitPeers();
      return () => {
        peerListeners.delete(cb);
      };
    },
    onMessage(cb) {
      msgListeners.add(cb);
      return () => {
        msgListeners.delete(cb);
      };
    },
    send(m: KartNetMsg) {
      channel?.send({ type: "broadcast", event: BROADCAST_EVENT, payload: m });
    },
    setAtTrack(at: boolean) {
      atTrack = at;
      track();
    },
    dispose() {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      teardownChannel();
      peerListeners.clear();
      msgListeners.clear();
    },
  };
}

/**
 * React hook for KartRace: creates a KartNet once familyId/kidId/racer are known, and disposes
 * it on unmount or when the racer identity actually changes (not on every render).
 */
export function useKartNet(args: { familyId: string | null; kidId: string | null; racer: KartRacer | null }): KartNet | null {
  const [net, setNet] = useState<KartNet | null>(null);
  const latest = useRef(args);
  latest.current = args;

  const { familyId, kidId } = args;
  const racerKey = args.racer ? `${args.racer.kidId}|${args.racer.name}|${args.racer.animal}|${args.racer.colour}` : null;

  useEffect(() => {
    const { familyId: fid, kidId: kid, racer } = latest.current;
    if (!fid || !kid || !racer) {
      setNet(null);
      return;
    }
    const created = createKartNet({ familyId: fid, kidId: kid, racer });
    setNet(created);
    return () => {
      created.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, kidId, racerKey]);

  return net;
}
