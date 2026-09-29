/**
 * AI Arcade play-test endpoint — run one game step against the REAL model with synthetic
 * input, so prompts can be judged without anyone handling the API key.
 *
 * Off unless process.env.ARCADE_PLAYTEST_TOKEN is set; every request must send the same
 * value in the `x-playtest-token` header (constant-time compare). Anything else is a 404.
 * It never touches Supabase or sparks — it calls the exact prompt/parse/validate steps the
 * server actions use (lib/arcade/engine.ts).
 *
 * Body: { game, ... }
 *   { game: "whatami", category? }
 *   { game: "emoji", emojis, step?: "start" | "end", title?, paragraphs?, choice? }
 *   { game: "stump", category?, history? }
 *   { game: "doodle", imageBase64, word?, previous?, final? }
 *   { game: "mystery", step: "new", difficulty? }
 *   { game: "mystery", step: "ask", caseFile, suspectId, question, log? }
 *   { game: "mystery", step: "accuse", caseFile, suspectId, reason?, found? }
 * Reply: { ok, game, step, model, ms, raw: string[], parsed, error?, ...extras }
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ArcadeFail, type CallTrace } from "@/lib/arcade/ai";
import {
  runDoodleLook,
  runMysteryAsk,
  runMysteryNew,
  runMysteryReveal,
  runStoryEnd,
  runStoryStart,
  runStump,
  runWhatAmI,
} from "@/lib/arcade/engine";
import { findDoodleMatch, findDoodleWord } from "@/lib/arcade/doodle";
import { checkAccusation, coerceMysteryDifficulty, publicCase, type CaseFile, type Statement } from "@/lib/arcade/mystery";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}

function authorised(req: NextRequest): boolean {
  const expected = process.env.ARCADE_PLAYTEST_TOKEN;
  if (!expected || expected.length < 16) return false;
  const got = req.headers.get("x-playtest-token") ?? "";
  // hash both so the compare is constant-time regardless of length
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

/** A case passed back in from a previous "new" step must still be a valid case. */
function caseFrom(v: unknown): CaseFile | null {
  if (!v || typeof v !== "object") return null;
  const c = v as CaseFile;
  if (!Array.isArray(c.suspects) || !Array.isArray(c.clues) || typeof c.culpritId !== "string" || !c.truths) return null;
  return c;
}

export async function GET() {
  return notFound();
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return notFound();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const game = String(body.game ?? "");
  const step = String(body.step ?? "");
  const trace: CallTrace = { model: "", raw: [], ms: 0 };
  const extras: Record<string, unknown> = {};

  try {
    let parsed: unknown;
    switch (game) {
      case "whatami":
        parsed = await runWhatAmI(body.category ?? "animal", body.avoid, trace);
        break;
      case "emoji":
        parsed = step === "end"
          ? await runStoryEnd({ emojis: body.emojis, title: body.title, paragraphs: body.paragraphs, choice: body.choice, hero: body.hero }, trace)
          : await runStoryStart({ emojis: body.emojis, style: body.style, hero: body.hero }, trace);
        break;
      case "stump":
        parsed = await runStump(body.category ?? "Animals", body.history ?? [], trace);
        break;
      case "doodle": {
        const look = await runDoodleLook({ imageBase64: body.imageBase64, previous: body.previous, final: body.final === true, look: body.look }, trace);
        parsed = look;
        const target = typeof body.word === "string" ? findDoodleWord(body.word) ?? { word: body.word, aliases: [] } : null;
        if (target) {
          const i = findDoodleMatch(look.guesses, target);
          extras.word = target.word;
          extras.matchIndex = i;
          extras.matched = i >= 0 ? look.guesses[i] : null;
        }
        break;
      }
      case "mystery": {
        if (step === "new" || !step) {
          const c = await runMysteryNew(coerceMysteryDifficulty(body.difficulty), trace);
          parsed = c;
          extras.publicView = publicCase(c);
          break;
        }
        const c = caseFrom(body.caseFile);
        if (!c) return NextResponse.json({ ok: false, error: "caseFile (from a step:new reply's parsed field) is required" }, { status: 400 });
        const suspectId = String(body.suspectId ?? "");
        if (!c.suspects.some((s) => s.id === suspectId)) return NextResponse.json({ ok: false, error: "unknown suspectId" }, { status: 400 });
        if (step === "ask") {
          const log = (Array.isArray(body.log) ? body.log : []) as Statement[];
          parsed = await runMysteryAsk({ caseFile: c, suspectId, question: body.question, log }, trace);
          extras.isCulprit = suspectId === c.culpritId;
        } else if (step === "accuse") {
          const correct = checkAccusation(c, suspectId);
          extras.correct = correct;
          parsed = await runMysteryReveal(
            { caseFile: c, accusedId: suspectId, correct, reason: body.reason, found: Array.isArray(body.found) ? body.found.map(String) : [] },
            trace,
          );
        } else {
          return NextResponse.json({ ok: false, error: "mystery step must be new | ask | accuse" }, { status: 400 });
        }
        break;
      }
      default:
        return NextResponse.json({ ok: false, error: "game must be whatami | emoji | stump | doodle | mystery" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, game, step: step || null, model: trace.model, ms: trace.ms, raw: trace.raw, parsed, ...extras });
  } catch (err) {
    const error = err instanceof ArcadeFail ? `${err.kidMessage} (${err.message})` : err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, game, step: step || null, model: trace.model, ms: trace.ms, raw: trace.raw, error, ...extras });
  }
}
