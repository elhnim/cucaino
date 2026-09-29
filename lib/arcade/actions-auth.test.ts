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

import {
  accuseMystery,
  askMystery,
  askStumpQuestion,
  continueEmojiStory,
  convertStarsToSparks,
  generateWhatAmI,
  lookAtDoodle,
  searchMystery,
  startDoodleRound,
  startMystery,
} from "@/lib/actions/arcade";
import { DOODLE_MAX_CALLS_PER_WORD } from "@/lib/arcade/doodle";

const PNG = "iVBORw0KGgo" + "A".repeat(200);

const CASE = JSON.stringify({
  title: "The Case of the Golden Ticket", emoji: "🎟️", intro: "The golden ticket vanished! Who took it?",
  item: "golden ticket", crime_scene: "prize-shop",
  suspects: [
    { id: "s1", name: "Otto Otter", emoji: "🦦", personality: "Nervous", alibi: "Counting tickets.", truth: "Counting tickets." },
    { id: "s2", name: "Penny Peacock", emoji: "🦚", personality: "Show-off", alibi: "On stage at 2pm.", truth: "Took the ticket for a magic trick." },
    { id: "s3", name: "Sid Sloth", emoji: "🦥", personality: "Sleepy", alibi: "Napping.", truth: "Napping." },
    { id: "s4", name: "Fifi Flamingo", emoji: "🦩", personality: "Bossy", alibi: "Baking.", truth: "Baking." },
  ],
  culprit: "s2", motive: "Wanted the best magic trick.", lie: "Says she was on stage at 2pm.",
  clues: [
    { location: "pet-meadow", title: "Blue feather", text: "A shiny blue feather.", kind: "implicates", suspect: "s2" },
    { location: "friends-cafe", title: "Empty stage", text: "No show until 4pm.", kind: "implicates", suspect: "s2" },
    { location: "quiz-coaster", title: "Camera", text: "Someone asleep all morning.", kind: "clears", suspect: "s3" },
  ],
  solution: "The feather and the empty stage prove it.",
});

const CLUES = JSON.stringify({
  answer: "penguin", aliases: [], emoji: "🐧", fun_fact: "They slide.",
  clues: ["I wear a suit", "I cannot fly", "I swim fast", "I live where it is icy", "I waddle on ice"],
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test";
  process.env.ARCADE_SECRET = "unit-test-arcade-secret-0123456789";
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

  it("doodle: dealing is free, the first good look charges once, later looks are free", async () => {
    const start = await startDoodleRound("mine", "easy");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(db.aiCalls).toBe(0);
    expect(db.kids.mine.sparks_balance).toBe(5);
    const word = start.data.words[0].word;
    db.reply = JSON.stringify({ guesses: ["potato", word], line: "Is it… a " + word + "?" });
    const a = await lookAtDoodle({ kidId: "mine", token: start.data.token, wordIndex: 0, imageBase64: PNG });
    expect(a.ok && a.data.matchIndex).toBe(1);
    expect(db.kids.mine.sparks_balance).toBe(3);
    if (!a.ok) return;
    const b = await lookAtDoodle({ kidId: "mine", token: a.data.token, wordIndex: 1, imageBase64: PNG });
    expect(b.ok).toBe(true);
    expect(db.kids.mine.sparks_balance).toBe(3);
  });

  it("doodle: a failed first look charges nothing", async () => {
    const start = await startDoodleRound("mine", "easy");
    if (!start.ok) throw new Error("no start");
    db.reply = "no idea";
    const a = await lookAtDoodle({ kidId: "mine", token: start.data.token, wordIndex: 0, imageBase64: PNG });
    expect(a.ok).toBe(false);
    expect(db.updates).toEqual([]);
  });

  it("doodle: caps AI looks per word, refuses replays, junk images and other kids", async () => {
    const start = await startDoodleRound("mine", "easy");
    if (!start.ok) throw new Error("no start");
    db.reply = JSON.stringify({ guesses: ["zzz"], line: "hmm" });
    let token = start.data.token;
    for (let i = 0; i < DOODLE_MAX_CALLS_PER_WORD; i++) {
      const r = await lookAtDoodle({ kidId: "mine", token, wordIndex: 0, imageBase64: PNG });
      expect(r.ok).toBe(true);
      if (r.ok) token = r.data.token;
    }
    const calls = db.aiCalls;
    expect((await lookAtDoodle({ kidId: "mine", token, wordIndex: 0, imageBase64: PNG })).ok).toBe(false);
    // replaying the very first token (0 looks used) is refused on this server
    expect((await lookAtDoodle({ kidId: "mine", token: start.data.token, wordIndex: 0, imageBase64: PNG })).ok).toBe(false);
    expect((await lookAtDoodle({ kidId: "mine", token, wordIndex: 1, imageBase64: "not a png" })).ok).toBe(false);
    expect((await lookAtDoodle({ kidId: "friend", token, wordIndex: 1, imageBase64: PNG })).ok).toBe(false);
    expect((await lookAtDoodle({ kidId: "mine", token: token + "x", wordIndex: 1, imageBase64: PNG })).ok).toBe(false);
    expect(db.aiCalls).toBe(calls);
  });

  it("mystery: one charge per case, the solution never reaches the client, accusation checked server-side", async () => {
    db.reply = CASE;
    const start = await startMystery("mine", "easy");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(db.kids.mine.sparks_balance).toBe(2);
    const wire = JSON.stringify(start.data);
    expect(wire).not.toContain("magic trick");
    expect(wire).not.toContain("Blue feather");
    expect(wire).not.toContain("culprit");

    const found = await searchMystery("mine", start.data.token, "pet-meadow");
    expect(found.ok && found.data.clue.title).toBe("Blue feather");
    expect(found.ok && found.data.searchesLeft).toBe(2);
    if (!found.ok) return;

    db.reply = JSON.stringify({ answer: "On stage, darling!", mood: "😎", note: "Says she was on stage." });
    const asked = await askMystery("mine", found.data.token, "s2", "Where were you?");
    expect(asked.ok && asked.data.questionsLeft).toBe(5);
    if (!asked.ok) return;
    // the same token can't be used for a second free question on this server
    expect((await askMystery("mine", found.data.token, "s2", "Again?")).ok).toBe(false);
    expect((await askMystery("friend", asked.data.token, "s2", "Where?")).ok).toBe(false);

    db.reply = JSON.stringify({ headline: "Unmasked!", reveal: ["It was Penny."], about_reason: "Nice!" });
    const wrong = await accuseMystery("mine", asked.data.token, "s1", "He looked shifty");
    expect(wrong.ok && wrong.data.correct).toBe(false);
    expect(wrong.ok && wrong.data.culprit.name).toBe("Penny Peacock");
    // one accusation per case
    expect((await accuseMystery("mine", asked.data.token, "s2", "")).ok).toBe(false);
    expect(db.kids.mine.sparks_balance).toBe(2);
  });

  it("mystery: a bad case costs nothing", async () => {
    db.reply = JSON.stringify({ title: "Half a case" });
    const res = await startMystery("mine", "easy");
    expect(res.ok).toBe(false);
    expect(db.updates).toEqual([]);
  });
});
