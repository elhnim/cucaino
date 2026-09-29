// Server-action gate tests: ownership check + "charge only on success" (Supabase + Anthropic mocked).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  familyId: "fam-1" as string | null,
  kids: {} as Record<string, { family_id: string; sparks_balance: number }>,
  updates: [] as { id: string; to: number }[],
  aiCalls: 0,
  reply: "" as string,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => (name === "current_family_id" ? { data: db.familyId, error: null } : { data: null, error: null }),
    from: () => {
      const f: Record<string, unknown> = {};
      let mode: "select" | "update" = "select";
      let patch: { sparks_balance: number } | null = null;
      const q = f as {
        select: () => typeof q; update: (p: { sparks_balance: number }) => typeof q; eq: (c: string, v: unknown) => typeof q;
        maybeSingle: () => Promise<{ data: unknown }>; then: (r: (v: unknown) => void) => void;
      };
      const where: Record<string, unknown> = {};
      const rows = () => Object.entries(db.kids).filter(([id, k]) =>
        (where.id === undefined || where.id === id) &&
        (where.family_id === undefined || where.family_id === k.family_id) &&
        (where.sparks_balance === undefined || where.sparks_balance === k.sparks_balance));
      q.select = () => q;
      q.update = (p) => { mode = "update"; patch = p; return q; };
      q.eq = (c, v) => { where[c] = v; return q; };
      q.maybeSingle = async () => { const r = rows()[0]; return { data: r ? { sparks_balance: r[1].sparks_balance } : null }; };
      q.then = (resolve) => {
        // update ... select(): RLS only lets the caller's own family update
        const hit = rows().filter(([, k]) => k.family_id === db.familyId);
        if (mode === "update" && patch) for (const [id, k] of hit) { k.sparks_balance = patch.sparks_balance; db.updates.push({ id, to: patch.sparks_balance }); }
        resolve({ data: hit.map(([, k]) => ({ sparks_balance: k.sparks_balance })), error: null });
      };
      return q;
    },
  }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic {
    static AuthenticationError = class extends APIError {};
    static PermissionDeniedError = class extends APIError {};
    static NotFoundError = class extends APIError {};
    static BadRequestError = class extends APIError {};
    static APIConnectionTimeoutError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static InternalServerError = class extends APIError {};
    messages = { create: async () => { db.aiCalls++; return { content: [{ type: "text", text: db.reply }], stop_reason: "end_turn" }; } };
  }
  return { default: Anthropic };
});

import { askStumpQuestion, continueEmojiStory, convertStarsToSparks, generateWhatAmI } from "@/lib/actions/arcade";

const CLUES = JSON.stringify({
  answer: "penguin", aliases: [], emoji: "🐧", fun_fact: "They slide.",
  clues: ["I wear a suit", "I cannot fly", "I swim fast", "I live where it is icy", "I waddle on ice"],
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test";
  db.familyId = "fam-1";
  db.kids = { mine: { family_id: "fam-1", sparks_balance: 5 }, friend: { family_id: "fam-2", sparks_balance: 50 } };
  db.updates = [];
  db.aiCalls = 0;
  db.reply = CLUES;
});

describe("arcade server action gate", () => {
  it("charges the own kid once, after a good reply", async () => {
    const res = await generateWhatAmI("animal", "mine");
    expect(res.ok).toBe(true);
    expect(res.ok && res.sparks).toBe(4);
    expect(db.kids.mine.sparks_balance).toBe(4);
  });

  it("refuses a friend's kid (readable via friend RLS) without calling the AI", async () => {
    const res = await generateWhatAmI("animal", "friend");
    expect(res.ok).toBe(false);
    expect(db.aiCalls).toBe(0);
    expect(db.kids.friend.sparks_balance).toBe(50);
  });

  it("refuses signed-out callers on free follow-up calls", async () => {
    db.familyId = null;
    const a = await continueEmojiStory({ emojis: ["🐶"], title: "t", paragraphs: ["p"], choice: "c", kidId: "mine" });
    const b = await askStumpQuestion("Animals", [{ kind: "question", text: "Is it big?", answer: "Yes" }], "mine");
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(db.aiCalls).toBe(0);
  });

  it("stump follow-up turns are free but need the own kid", async () => {
    db.reply = JSON.stringify({ type: "question", text: "Does it swim?", reaction: "Ooh" });
    const turns = [{ kind: "question" as const, text: "Is it big?", answer: "Yes" as const }];
    expect((await askStumpQuestion("Animals", turns, "friend")).ok).toBe(false);
    const ok = await askStumpQuestion("Animals", turns, "mine");
    expect(ok.ok).toBe(true);
    expect(db.kids.mine.sparks_balance).toBe(5);
  });

  it("does not charge when the AI reply is unusable (after one retry)", async () => {
    db.reply = "sorry, no json";
    const res = await generateWhatAmI("animal", "mine");
    expect(res.ok).toBe(false);
    expect(db.aiCalls).toBe(2);
    expect(db.updates).toEqual([]);
  });

  it("does not charge when there are too few sparks", async () => {
    db.kids.mine.sparks_balance = 0;
    const res = await generateWhatAmI("animal", "mine");
    expect(res.ok).toBe(false);
    expect(db.aiCalls).toBe(0);
  });

  it("star swap rejects non-integers and friends' kids", async () => {
    expect((await convertStarsToSparks("mine", 1.5)).ok).toBe(false);
    expect((await convertStarsToSparks("mine", Number.NaN)).ok).toBe(false);
    expect((await convertStarsToSparks("friend", 1)).ok).toBe(false);
  });
});
