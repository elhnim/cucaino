/**
 * Defensive parsing of model output. Models sometimes wrap JSON in code fences,
 * add a sentence before/after it, or get cut off — so never trust `JSON.parse(text)`.
 * Pure functions only (unit tested in json.test.ts).
 */

/** Index of the `}` that closes the `{` at `start`, or -1 if it never closes. String-aware. */
function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Pull the first JSON object out of a model reply. Returns null when there is no
 * parseable object (the caller then retries or shows a friendly error).
 */
export function extractJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const s = text.replace(/```(?:json)?/gi, "").trim();
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    const end = balancedEnd(s, start);
    if (end === -1) return null; // truncated — nothing later can close either
    try {
      const v: unknown = JSON.parse(s.slice(start, end + 1));
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // try the next "{"
    }
  }
  return null;
}

/** A trimmed, non-empty string no longer than `max` chars, else null. */
export function cleanStr(v: unknown, max = 400): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

/** An array of clean strings (invalid items dropped). */
export function cleanStrArray(v: unknown, max = 400): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanStr(x, max)).filter((x): x is string => x !== null);
}

/** A short emoji-ish token, or the fallback. */
export function cleanEmoji(v: unknown, fallback: string): string {
  const t = cleanStr(v, 16);
  if (!t || t.length > 12 || /[a-z0-9]{3,}/i.test(t)) return fallback;
  return t;
}

/** Kid-typed text going INTO a prompt: one line, capped, no quote marks that could break framing. */
export function sanitizeKidText(v: unknown, max = 120): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\r\n\t]+/g, " ")
    .replace(/["`<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
