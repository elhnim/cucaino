/**
 * Doodle Guess — pure rules (tested in doodle.test.ts): the curated word list, round picking,
 * how an AI guess is matched to the target word, scoring and the per-word AI-call cap.
 *
 * The model is never told the target word: it guesses blind from the picture, like
 * Quick, Draw!. Matching is strict (no typo tolerance) because the model spells properly and
 * "horse" must never win a round for "house".
 */
import { cleanStr } from "./json";
import { normalizeGuess, wordForms } from "./match";

export type DoodleDifficulty = "easy" | "medium" | "hard";
export type DoodleCategory = "animal" | "food" | "object" | "park" | "action" | "nature";

export interface DoodleWord {
  word: string;
  emoji: string;
  category: DoodleCategory;
  /** other things the AI might call it that also count ("kitten" for cat) */
  aliases: string[];
}

export const DOODLE_WORDS_PER_ROUND = 5;
export const DOODLE_SECONDS = 60;
/** hard cap on AI looks per word, enforced server-side via the signed round token */
export const DOODLE_MAX_CALLS_PER_WORD = 8;
/** client pacing: at most one live look this often, and only after the pen lifts */
export const DOODLE_LOOK_EVERY_MS = 4_000;
export const DOODLE_SPARK_COST = 2;
/** max accepted PNG size (a 256px doodle is ~5–25 KB) */
export const DOODLE_MAX_PNG_BYTES = 300_000;

const w = (word: string, emoji: string, category: DoodleCategory, aliases: string[] = []): DoodleWord => ({ word, emoji, category, aliases });

export const DOODLE_WORDS: Record<DoodleDifficulty, readonly DoodleWord[]> = {
  easy: [
    w("cat", "🐱", "animal", ["kitten", "kitty", "cat face"]),
    w("fish", "🐟", "animal", ["goldfish"]),
    w("snake", "🐍", "animal", ["worm"]),
    w("snail", "🐌", "animal"),
    w("spider", "🕷️", "animal"),
    w("bird", "🐦", "animal", ["duck", "chick"]),
    w("apple", "🍎", "food", ["cherry"]),
    w("banana", "🍌", "food"),
    w("ice cream", "🍦", "food", ["ice cream cone", "icecream", "cone"]),
    w("pizza", "🍕", "food", ["pizza slice"]),
    w("carrot", "🥕", "food"),
    w("cupcake", "🧁", "food", ["muffin"]),
    w("sun", "☀️", "nature", ["sunshine"]),
    w("tree", "🌳", "nature"),
    w("flower", "🌸", "nature", ["daisy", "tulip", "sunflower"]),
    w("cloud", "☁️", "nature"),
    w("moon", "🌙", "nature", ["crescent moon", "crescent"]),
    w("star", "⭐", "nature"),
    w("house", "🏠", "object", ["home", "cottage"]),
    w("ball", "⚽", "object", ["football", "soccer ball", "beach ball"]),
    w("cup", "☕", "object", ["mug", "teacup"]),
    w("hat", "🎩", "object", ["top hat", "cap"]),
    w("balloon", "🎈", "park", ["balloons"]),
    w("umbrella", "☂️", "object"),
    w("heart", "❤️", "object"),
    w("key", "🔑", "object"),
    w("car", "🚗", "object"),
    w("boat", "⛵", "object", ["sailboat", "ship"]),
  ],
  medium: [
    w("turtle", "🐢", "animal", ["tortoise"]),
    w("octopus", "🐙", "animal", ["squid"]),
    w("giraffe", "🦒", "animal"),
    w("rabbit", "🐰", "animal", ["bunny", "hare"]),
    w("butterfly", "🦋", "animal", ["moth"]),
    w("elephant", "🐘", "animal"),
    w("penguin", "🐧", "animal"),
    w("crab", "🦀", "animal"),
    w("owl", "🦉", "animal"),
    w("dinosaur", "🦕", "animal", ["dino", "t rex", "brontosaurus", "diplodocus"]),
    w("donut", "🍩", "food", ["doughnut"]),
    w("watermelon", "🍉", "food", ["melon", "watermelon slice"]),
    w("hamburger", "🍔", "food", ["burger", "cheeseburger"]),
    w("birthday cake", "🎂", "food", ["cake"]),
    w("lollipop", "🍭", "park", ["lolly", "candy", "sucker"]),
    w("roller coaster", "🎢", "park", ["rollercoaster", "coaster"]),
    w("ferris wheel", "🎡", "park", ["ferriswheel", "observation wheel"]),
    w("tent", "⛺", "park", ["camping tent", "teepee"]),
    w("kite", "🪁", "park"),
    w("rainbow", "🌈", "nature"),
    w("mushroom", "🍄", "nature", ["toadstool"]),
    w("cactus", "🌵", "nature"),
    w("volcano", "🌋", "nature", ["mountain"]),
    w("rocket", "🚀", "object", ["spaceship", "rocket ship"]),
    w("bicycle", "🚲", "object", ["bike"]),
    w("guitar", "🎸", "object", ["ukulele"]),
    w("glasses", "👓", "object", ["spectacles", "sunglasses"]),
    w("crown", "👑", "object", ["tiara"]),
    w("robot", "🤖", "object"),
    w("scissors", "✂️", "object"),
  ],
  hard: [
    w("jellyfish", "🪼", "animal"),
    w("snowman", "⛄", "nature", ["snow man"]),
    w("lighthouse", "🗼", "object", ["light house", "tower"]),
    w("treasure chest", "🧰", "object", ["treasure", "chest"]),
    w("castle", "🏰", "object", ["palace", "fort"]),
    w("dragon", "🐉", "animal"),
    w("unicorn", "🦄", "animal"),
    w("hot air balloon", "🎈", "park", ["air balloon"]),
    w("carousel", "🎠", "park", ["merry go round", "merrygoround"]),
    w("slide", "🛝", "park", ["playground slide", "water slide"]),
    w("swing", "🪢", "park", ["swing set", "swings"]),
    w("popcorn", "🍿", "food"),
    w("pineapple", "🍍", "food"),
    w("spaghetti", "🍝", "food", ["pasta", "noodles"]),
    w("sandwich", "🥪", "food", ["toast"]),
    w("tornado", "🌪️", "nature", ["twister", "whirlwind"]),
    w("island", "🏝️", "nature", ["desert island"]),
    w("waterfall", "🏞️", "nature"),
    w("skateboard", "🛹", "object"),
    w("headphones", "🎧", "object", ["earphones"]),
    w("telescope", "🔭", "object"),
    w("backpack", "🎒", "object", ["school bag", "bag", "rucksack"]),
    w("jumping", "🤸", "action", ["jump", "person jumping", "trampoline"]),
    w("sleeping", "😴", "action", ["sleep", "bed", "person sleeping"]),
    w("swimming", "🏊", "action", ["swim", "swimmer", "person swimming"]),
    w("running", "🏃", "action", ["run", "runner", "person running"]),
    w("dancing", "💃", "action", ["dance", "dancer"]),
    w("fishing", "🎣", "action", ["fishing rod", "fisherman"]),
  ],
};

export const DOODLE_DIFFICULTIES: readonly DoodleDifficulty[] = ["easy", "medium", "hard"];

export function coerceDifficulty(v: unknown): DoodleDifficulty {
  return v === "medium" || v === "hard" ? v : "easy";
}

/** Look a word up in the curated list (the server trusts nothing else). */
export function findDoodleWord(word: string): DoodleWord | null {
  const n = normalizeGuess(word);
  for (const d of DOODLE_DIFFICULTIES) for (const e of DOODLE_WORDS[d]) if (normalizeGuess(e.word) === n) return e;
  return null;
}

/**
 * Pick `count` distinct words for a round, skipping recently drawn ones when possible, and
 * never two from the same category in a row (keeps rounds varied).
 */
export function pickDoodleRound(
  difficulty: DoodleDifficulty,
  avoid: readonly string[] = [],
  rand: () => number = Math.random,
  count = DOODLE_WORDS_PER_ROUND,
): DoodleWord[] {
  const avoidSet = new Set(avoid.map((a) => normalizeGuess(a)));
  const all = [...DOODLE_WORDS[difficulty]];
  const fresh = all.filter((e) => !avoidSet.has(normalizeGuess(e.word)));
  const pool = fresh.length >= count ? fresh : all;
  // Fisher–Yates with the injected rand
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: DoodleWord[] = [];
  const rest = [...pool];
  while (out.length < count && rest.length) {
    const prev = out[out.length - 1]?.category;
    let idx = rest.findIndex((e) => e.category !== prev);
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

/** Filler words the model adds that don't change what the thing is ("a cute little cat"). */
const MODIFIERS = new Set([
  "a", "an", "the", "some", "cute", "little", "small", "big", "giant", "tiny", "happy", "smiling", "funny", "cartoon",
  "simple", "baby", "fat", "round", "red", "blue", "green", "yellow", "orange", "pink", "purple", "black", "white",
  "brown", "drawing", "doodle", "sketch", "of", "picture", "scribble", "shaped", "like", "maybe", "probably",
  "person", "kid", "child", "boy", "girl", "someone", "stick", "figure",
]);
const TRAILING = new Set(["drawing", "doodle", "sketch", "picture", "shape", "outline"]);

/** Singular spellings of a phrase with filler words removed and spaces ignored. */
function thingForms(s: string): string[] {
  const words = normalizeGuess(s).split(" ").filter(Boolean);
  while (words.length > 1 && TRAILING.has(words[words.length - 1])) words.pop();
  let i = 0;
  while (i < words.length - 1 && MODIFIERS.has(words[i])) i++;
  const core = words.slice(i);
  if (!core.length) return [];
  const head = core.slice(0, -1).join("");
  return wordForms(core[core.length - 1]).map((f) => head + f);
}

/** Does one AI guess name the target (or an accepted alias)? Exact after normalising. */
export function doodleGuessMatches(guess: string, target: Pick<DoodleWord, "word" | "aliases">): boolean {
  const g = new Set(thingForms(guess));
  if (!g.size) return false;
  for (const t of [target.word, ...target.aliases]) {
    if (thingForms(t).some((f) => g.has(f))) return true;
  }
  return false;
}

/** Index of the first guess that names the target, or -1. */
export function findDoodleMatch(guesses: readonly string[], target: Pick<DoodleWord, "word" | "aliases">): number {
  return guesses.findIndex((g) => doodleGuessMatches(g, target));
}

/**
 * Points for a solved word: 50 for getting it, up to +100 for speed, and a streak bonus
 * (+25 for every solved word in a row before this one, capped at +100).
 */
export function doodlePoints(secondsLeft: number, streakBefore: number): number {
  const s = Math.max(0, Math.min(DOODLE_SECONDS, Math.floor(secondsLeft)));
  const speed = Math.round((s / DOODLE_SECONDS) * 100);
  const streak = Math.min(100, Math.max(0, streakBefore) * 25);
  return 50 + speed + streak;
}

export function doodleRank(score: number, solved: number): { title: string; emoji: string } {
  if (solved >= DOODLE_WORDS_PER_ROUND && score >= 700) return { title: "Legendary Artist", emoji: "🏆" };
  if (solved >= 4) return { title: "Master Doodler", emoji: "🎨" };
  if (solved >= 3) return { title: "Speedy Sketcher", emoji: "✏️" };
  if (solved >= 1) return { title: "Rising Artist", emoji: "🖍️" };
  return { title: "Mystery Painter", emoji: "🤔" };
}

/** Is this base64 string a plausible, not-too-big PNG? (checked server-side before any AI call) */
export function isPngBase64(b64: unknown): b64 is string {
  if (typeof b64 !== "string" || b64.length < 80) return false;
  // size first, so a huge payload is rejected before the regex scans it
  if ((b64.length * 3) / 4 > DOODLE_MAX_PNG_BYTES) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
  // "\x89PNG\r\n\x1a\n" base64-encodes to "iVBORw0KGgo"
  return b64.startsWith("iVBORw0KGgo");
}

export interface DoodleLook {
  /** most likely first, lowercase, deduped */
  guesses: string[];
  /** the AI's live commentary line */
  line: string;
}

/** Validate the model's reply to one look at the drawing. */
export function validateDoodleLook(j: Record<string, unknown> | null): DoodleLook | null {
  if (!j) return null;
  const raw = Array.isArray(j.guesses) ? j.guesses : typeof j.guess === "string" ? [j.guess] : [];
  const seen = new Set<string>();
  const guesses: string[] = [];
  for (const g of raw) {
    const t = cleanStr(typeof g === "object" && g ? (g as Record<string, unknown>).name ?? (g as Record<string, unknown>).guess : g, 40);
    if (!t) continue;
    const clean = t.toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/[.!?]+$/, "").trim();
    const key = normalizeGuess(clean);
    if (!key || key.split(" ").length > 4 || seen.has(key)) continue;
    seen.add(key);
    guesses.push(clean);
  }
  if (!guesses.length) return null;
  return { guesses: guesses.slice(0, 6), line: cleanStr(j.line ?? j.commentary ?? j.comment, 160) ?? "Hmm… let me look closer! 🤔" };
}

// ---- Drawing geometry (shared by the canvas; pure) --------------------------

export interface DoodleStroke {
  color: string;
  /** brush width as a fraction of the canvas width */
  width: number;
  /** points in 0..1 canvas space */
  pts: [number, number][];
  eraser?: boolean;
}

/**
 * The square (0..1 space) to send to the AI: the drawing's bounding box plus padding, so a
 * small doodle in a corner fills the picture. Never smaller than `minSize`; falls back to
 * the whole canvas when there is nothing drawn.
 */
export function doodleCropBox(strokes: readonly DoodleStroke[], pad = 0.12, minSize = 0.3): { x: number; y: number; size: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    if (s.eraser) continue;
    const r = s.width / 2;
    for (const [x, y] of s.pts) {
      x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r);
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, size: 1 };
  const side = Math.min(1, Math.max(minSize, Math.max(x1 - x0, y1 - y0) * (1 + pad * 2)));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const clamp = (v: number) => Math.min(1 - side, Math.max(0, v));
  return { x: clamp(cx - side / 2), y: clamp(cy - side / 2), size: side };
}

/** Does the drawing have any visible ink? */
export function hasInk(strokes: readonly DoodleStroke[]): boolean {
  return strokes.some((s) => !s.eraser && s.pts.length > 0);
}
