import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { KartNetMsg, KartRacer } from "./types";

type Handler = (payload: { payload?: unknown }) => void;

class FakeChannel {
  topic: string;
  opts: Record<string, unknown>;
  handlers = new Map<string, Handler[]>();
  subscribeCb: ((status: string) => void) | null = null;
  tracked: unknown[] = [];
  sent: unknown[] = [];
  presence: Record<string, { racer: KartRacer; atTrack: boolean }[]> = {};

  constructor(topic: string, opts: Record<string, unknown>) {
    this.topic = topic;
    this.opts = opts;
  }

  on(type: string, filter: { event: string }, cb: Handler) {
    const key = `${type}:${filter.event}`;
    const list = this.handlers.get(key) ?? [];
    list.push(cb);
    this.handlers.set(key, list);
    return this;
  }

  subscribe(cb: (status: string) => void) {
    this.subscribeCb = cb;
    return this;
  }

  track(payload: unknown) {
    this.tracked.push(payload);
    return Promise.resolve("ok");
  }

  send(payload: unknown) {
    this.sent.push(payload);
    return Promise.resolve("ok");
  }

  presenceState() {
    return this.presence;
  }

  // test helpers
  status(s: string) {
    this.subscribeCb?.(s);
  }
  firePresence(event: "sync" | "join" | "leave") {
    this.handlers.get(`presence:${event}`)?.forEach((cb) => cb({}));
  }
  fireBroadcast(event: string, payload: unknown) {
    this.handlers.get(`broadcast:${event}`)?.forEach((cb) => cb({ payload }));
  }
}

const removeChannel = vi.fn();
let lastChannel: FakeChannel | null = null;
const channels: FakeChannel[] = [];

const fakeSupabase = {
  channel: vi.fn((topic: string, opts: Record<string, unknown>) => {
    const ch = new FakeChannel(topic, opts);
    lastChannel = ch;
    channels.push(ch);
    return ch;
  }),
  removeChannel,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => fakeSupabase,
}));

const { createKartNet } = await import("./net");

const racer: KartRacer = { kidId: "kid-1", name: "Mia", animal: "animal-fox", colour: "#ff0099" };
const sibling: KartRacer = { kidId: "kid-2", name: "Leo", animal: "animal-dog", colour: "#00aaff" };

beforeEach(() => {
  channels.length = 0;
  lastChannel = null;
  fakeSupabase.channel.mockClear();
  removeChannel.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createKartNet", () => {
  it("opens a private channel named karts:<familyId> and tracks presence once subscribed", () => {
    createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    expect(fakeSupabase.channel).toHaveBeenCalledWith(
      "karts:fam-1",
      expect.objectContaining({ config: expect.objectContaining({ private: true, presence: { key: "kid-1" } }) }),
    );
    const ch = lastChannel!;
    expect(ch.tracked).toHaveLength(0);
    ch.status("SUBSCRIBED");
    expect(ch.tracked).toEqual([{ racer, atTrack: false }]);
  });

  it("maps presence state to peers, excluding the local kid", () => {
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    ch.presence = {
      [racer.kidId]: [{ racer, atTrack: true }],
      [sibling.kidId]: [{ racer: sibling, atTrack: false }],
    };
    const cb = vi.fn();
    net.onPeers(cb);
    cb.mockClear();
    ch.firePresence("sync");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([{ ...sibling, atTrack: false }]);
  });

  it("setAtTrack re-tracks presence with the new flag", () => {
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    ch.status("SUBSCRIBED");
    net.setAtTrack(true);
    expect(ch.tracked.at(-1)).toEqual({ racer, atTrack: true });
  });

  it("send() broadcasts a kart message, and a tiny pose payload stays small on the wire", () => {
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    const msg: KartNetMsg = {
      type: "pose",
      raceId: "race-1",
      kidId: racer.kidId,
      pose: { t: 1.2, x: 10.25, z: -5.5, yaw: 1.57, speed: 8.3, lap: 1, progress: 0.42 },
    };
    net.send(msg);
    expect(ch.sent).toEqual([{ type: "broadcast", event: "kart", payload: msg }]);
    // pose messages go out at ~15 Hz over the wire — keep them small
    expect(JSON.stringify(msg).length).toBeLessThan(200);
  });

  it("onMessage receives broadcast kart messages", () => {
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    const cb = vi.fn();
    const unsub = net.onMessage(cb);
    const msg: KartNetMsg = { type: "leave", kidId: sibling.kidId };
    ch.fireBroadcast("kart", msg);
    expect(cb).toHaveBeenCalledWith(msg);
    unsub();
    ch.fireBroadcast("kart", msg);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("reconnects on CHANNEL_ERROR, tearing down the old channel and re-subscribing", () => {
    vi.useFakeTimers();
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const first = lastChannel!;
    first.status("SUBSCRIBED");
    first.status("CHANNEL_ERROR");
    expect(channels).toHaveLength(1); // not yet reconnected
    vi.advanceTimersByTime(1000);
    expect(removeChannel).toHaveBeenCalledWith(first);
    expect(channels).toHaveLength(2);
    const second = lastChannel!;
    second.status("SUBSCRIBED");
    expect(second.tracked).toEqual([{ racer, atTrack: false }]);
    net.dispose();
  });

  it("dispose() removes the channel and stops delivering events", () => {
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    const cb = vi.fn();
    net.onMessage(cb);
    net.dispose();
    expect(removeChannel).toHaveBeenCalledWith(ch);
    ch.fireBroadcast("kart", { type: "leave", kidId: sibling.kidId });
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not schedule a reconnect after dispose", () => {
    vi.useFakeTimers();
    const net = createKartNet({ familyId: "fam-1", kidId: racer.kidId, racer });
    const ch = lastChannel!;
    ch.status("SUBSCRIBED");
    net.dispose();
    ch.status("CHANNEL_ERROR");
    vi.advanceTimersByTime(20_000);
    expect(channels).toHaveLength(1); // never reconnected
  });
});
