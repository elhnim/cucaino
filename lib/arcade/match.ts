/**
 * Forgiving answer matching for the guessing games. Kids type "a Penguin!",
 * "penguins", "pengiun" — all of those should count. Pure (tested in match.test.ts).
 */

const ARTICLES = /^(?:a|an|the|some|my|it'?s|it is|is it|i think|i think it'?s)\s+/;

/** lowercase, no accents/punctuation, no leading articles, single spaces */
export function normalizeGuess(s: string): string {
  let t = (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/[-']/g, (m) => (m === "-" ? " " : ""))
    .replace(/\s+/g, " ")
    .trim();
  // strip stacked lead-ins ("i think it's a penguin")
  for (let i = 0; i < 4; i++) {
    const next = t.replace(ARTICLES, "");
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Possible singular forms of a word ("cookies" -> cookie/cooky, "boxes" -> box, "buses" -> bus). */
export function wordForms(word: string): string[] {
  const out = new Set([word]);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    out.add(word.slice(0, -1));
    if (word.endsWith("es")) out.add(word.slice(0, -2));
    if (word.endsWith("ies")) out.add(word.slice(0, -3) + "y");
  }
  return [...out];
}

/** Every spelling of a phrase we treat as the same (plural of the last word, spaces ignored). */
function forms(s: string): string[] {
  const words = normalizeGuess(s).split(" ").filter(Boolean);
  if (!words.length) return [];
  const head = words.slice(0, -1).join("");
  return wordForms(words[words.length - 1]).map((w) => head + w);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos we forgive for an answer of this length. */
export function typoAllowance(len: number): number {
  if (len >= 9) return 2;
  if (len >= 5) return 1;
  return 0;
}

export type GuessVerdict = "correct" | "close" | "wrong";

/**
 * Compare a kid's guess against the answer and its accepted aliases.
 * - correct: exact after normalising, plural/singular, or within the typo allowance
 * - close:   one more typo than allowed, or the guess is part of a multi-word answer
 * - wrong:   anything else
 */
export function matchGuess(guess: string, answer: string, aliases: readonly string[] = []): GuessVerdict {
  const gs = forms(guess);
  if (!gs.length) return "wrong";
  let close = false;
  for (const target of [answer, ...aliases]) {
    const ts = forms(target);
    if (!ts.length) continue;
    const allow = typoAllowance(ts[0].length);
    let best = Infinity;
    for (const g of gs) for (const t of ts) best = Math.min(best, levenshtein(g, t));
    if (best <= allow) return "correct";
    if (best <= allow + 1 && ts[0].length >= 4) close = true;
  }
  // "penguin" for "emperor penguin" is a strong near-miss, not a win
  const gWords = new Set(normalizeGuess(guess).split(" ").flatMap(wordForms));
  for (const t of [answer, ...aliases]) {
    const tWords = normalizeGuess(t).split(" ").filter(Boolean);
    if (tWords.length > 1 && tWords.some((w) => w.length >= 4 && wordForms(w).some((f) => gWords.has(f)))) close = true;
  }
  return close ? "close" : "wrong";
}

/** Does this clue give the answer away (contains the answer or an alias, singular or plural)? */
export function leaksAnswer(clue: string, answer: string, aliases: readonly string[] = []): boolean {
  const words = normalizeGuess(clue).split(" ").filter(Boolean);
  const hay = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      for (const f of forms(words.slice(i, i + n).join(" "))) hay.add(f);
    }
  }
  for (const t of [answer, ...aliases]) {
    const ts = forms(t);
    if (!ts.length || ts[0].length < 3) continue;
    if (ts.some((f) => hay.has(f))) return true;
  }
  return false;
}
