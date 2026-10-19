import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Harbour City Tycoon runs as a static page in an iframe (public/games/harbour-city).
 * The game was written against a small capability surface — `use("db" | "room" | "user")` —
 * and this host provides that surface on top of Cucaino's Supabase:
 *
 *  - db   → one `game_rooms` row per table (game_key 'harbour-city', room_code = table code),
 *           family-scoped by the existing RLS policy, live via postgres_changes.
 *  - room → a Supabase Realtime channel per table: broadcast for instant move sync, presence
 *           for "who's at the table".
 *  - user → the kid playing on this device (identity is the kid, not the parent login, so two
 *           tablets signed into the same family still count as different players).
 *
 * Anything the game stores under a table's sub-paths (turn locks, trade replies) is handled
 * in memory / over broadcast, since a family's devices only need the realtime path for those.
 */

const GAME_KEY = "harbour-city";

type Json = Record<string, unknown>;
type Snap = { id: string; exists: boolean; data: () => Json | undefined; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
type Peer = { peer: string; by: string | null; isMe: boolean; sameTab: boolean; kind: "viewer"; guest: false; presence: Json; updatedAt: number };

const snap = (id: string, d: Json | null | undefined): Snap => ({
  id,
  exists: d != null,
  data: () => (d == null ? undefined : (JSON.parse(JSON.stringify(d)) as Json)),
  metadata: { fromCache: false, hasPendingWrites: false },
});

const toRowStatus = (s: unknown) => (s === "playing" ? "playing" : s === "over" ? "finished" : "lobby");

export type TycoonHost = ReturnType<typeof createTycoonHost>;

export function createTycoonHost(opts: {
  supabase: SupabaseClient;
  familyId: string;
  kidId: string;
  kidName: string;
  onExit: () => void;
}) {
  const { supabase, familyId, kidId, kidName } = opts;
  const uid = `kid_${kidId}`;
  const channels = new Set<RealtimeChannel>();
  const rowIds = new Map<string, string>();

  async function readRow(code: string): Promise<Json | null> {
    const { data } = await supabase
      .from("game_rooms")
      .select("id, state")
      .eq("game_key", GAME_KEY)
      .eq("room_code", code)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = data?.[0] as { id: string; state: Json } | undefined;
    if (!row) return null;
    rowIds.set(code, row.id);
    return row.state ?? null;
  }

  async function writeRow(code: string, state: Json) {
    if (!rowIds.has(code)) await readRow(code);
    const id = rowIds.get(code);
    const status = toRowStatus(state.status);
    if (id) {
      const { error } = await supabase.from("game_rooms").update({ state, status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw { code: "unavailable", message: error.message };
      return;
    }
    const { data, error } = await supabase
      .from("game_rooms")
      .insert({ family_id: familyId, game_key: GAME_KEY, room_code: code, status, state })
      .select("id")
      .single();
    if (error || !data) throw { code: "invalid_argument", message: error?.message ?? "Could not create table" };
    rowIds.set(code, (data as { id: string }).id);
  }

  const noopDoc = (id: string) => ({
    id,
    get: async () => snap(id, null),
    set: async () => {},
    update: async () => {},
    delete: async () => {},
    acquire: async () => ({ acquired: true }),
    onSnapshot: () => () => {},
  });

  function doc(path: string) {
    const seg = path.split("/");
    if (seg[0] !== "games" || seg.length < 2) throw new TypeError(`Unsupported path ${path}`);
    const code = seg[1];
    if (seg.length > 2) return noopDoc(seg[seg.length - 1]);
    return {
      id: code,
      path,
      get: async () => snap(code, await readRow(code)),
      set: async (d: Json) => writeRow(code, d),
      update: async (d: Json) => writeRow(code, { ...((await readRow(code)) ?? {}), ...d }),
      delete: async () => {
        const id = rowIds.get(code);
        if (id) await supabase.from("game_rooms").delete().eq("id", id);
      },
      // Leases only guard against two tabs of one player acting at once; a family's tablets don't need it.
      acquire: async () => ({ acquired: true }),
      onSnapshot(next: (s: Snap) => void, error?: (e: { code: string; message: string }) => void) {
        let alive = true;
        readRow(code).then((d) => alive && next(snap(code, d)));
        const ch = supabase
          .channel(`hc-doc:${code}:${Math.random().toString(36).slice(2, 8)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `room_code=eq.${code}` }, (payload) => {
            if (!alive) return;
            const row = (payload.new ?? {}) as { id?: string; game_key?: string; state?: Json };
            if (payload.eventType === "DELETE") return next(snap(code, null));
            if (row.game_key !== GAME_KEY) return;
            if (row.id) rowIds.set(code, row.id);
            next(snap(code, row.state ?? null));
          })
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" && error) error({ code: "unavailable", message: "Realtime channel error" });
          });
        channels.add(ch);
        return () => {
          alive = false;
          channels.delete(ch);
          supabase.removeChannel(ch);
        };
      },
    };
  }

  function collection(path: string) {
    if (path !== "games") throw new TypeError(`Unsupported collection ${path}`);
    const q = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      onSnapshot(next: (s: { docs: Snap[]; size: number; empty: boolean; docChanges: () => never[]; metadata: object }) => void) {
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const run = async () => {
          const { data } = await supabase
            .from("game_rooms")
            .select("room_code, state")
            .eq("game_key", GAME_KEY)
            .order("updated_at", { ascending: false })
            .limit(20);
          if (!alive) return;
          const docs = ((data ?? []) as { room_code: string; state: Json }[]).map((r) => snap(r.room_code, r.state));
          next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} });
        };
        run();
        const ch = supabase
          .channel(`hc-list:${Math.random().toString(36).slice(2, 8)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `game_key=eq.${GAME_KEY}` }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(run, 400);
          })
          .subscribe();
        channels.add(ch);
        return () => {
          alive = false;
          channels.delete(ch);
          supabase.removeChannel(ch);
        };
      },
    };
    return q;
  }

  const TOPICS = ["sync", "reply"];
  function join(name: string) {
    const handlers: Record<string, Set<(m: Json) => void>> = Object.fromEntries(TOPICS.map((t) => [t, new Set()]));
    const peerHandlers = new Set<(c: { peers: Peer[]; joined: Peer[]; left: Peer[]; updated: Peer[] }) => void>();
    let peers: Peer[] = [];
    const ch = supabase.channel(`hc-room:${familyId}:${name}`, { config: { broadcast: { self: false }, presence: { key: `${uid}:${Math.random().toString(36).slice(2, 8)}` } } });
    TOPICS.forEach((t) =>
      ch.on("broadcast", { event: t }, ({ payload }) => {
        const p = (payload ?? {}) as { data?: unknown; by?: string };
        handlers[t].forEach((h) => h({ topic: t, data: p.data, by: typeof p.by === "string" ? p.by : null, isMe: false, sameTab: false, kind: "viewer", guest: false, peer: "" }));
      }),
    );
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Json[]>;
      peers = Object.entries(state).flatMap(([key, metas]) =>
        metas.map((m) => ({ peer: key, by: typeof m.uid === "string" ? m.uid : null, isMe: m.uid === uid, sameTab: false, kind: "viewer" as const, guest: false as const, presence: m, updatedAt: Date.now() })),
      );
      peerHandlers.forEach((h) => h({ peers, joined: [], left: [], updated: [] }));
    });
    channels.add(ch);
    const room = {
      name,
      emit: async (topic: string, data: unknown) => {
        await ch.send({ type: "broadcast", event: topic, payload: { data, by: uid } });
      },
      on(topic: string, fn: (m: Json) => void) {
        (handlers[topic] ??= new Set()).add(fn);
        return () => handlers[topic].delete(fn);
      },
      presence: async (patch: Json) => {
        await ch.track({ ...patch, uid });
      },
      peers: () => peers,
      onPeers(fn: (c: { peers: Peer[]; joined: Peer[]; left: Peer[]; updated: Peer[] }) => void) {
        peerHandlers.add(fn);
        queueMicrotask(() => fn({ peers, joined: peers, left: [], updated: [] }));
        return () => peerHandlers.delete(fn);
      },
      connected: () => true,
      leave: async () => {
        channels.delete(ch);
        await supabase.removeChannel(ch);
      },
    };
    return new Promise<typeof room>((resolve) => {
      const t = setTimeout(() => resolve(room), 5000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          ch.track({ uid });
          resolve(room);
        }
      });
    });
  }

  const db = { doc, collection };
  const room = { join };
  const user = {
    id: async () => uid,
    name: async () => kidName,
    isOwner: async () => false,
    canEdit: async () => false,
    can: async () => true,
  };

  return {
    use: async (name: string) => (name === "db" ? db : name === "room" ? room : name === "user" ? user : null),
    exit: opts.onExit,
    onlineNote: "Everyone plays on their own tablet in real time. Tables are shared with every device signed in to your family.",
    offlineNote: "Online play needs this tablet signed in to your family account.",
    joinHint: "On another tablet, open Harbour City from Play, choose Online with friends, and enter the code.",
    dispose() {
      channels.forEach((c) => supabase.removeChannel(c));
      channels.clear();
    },
  };
}
