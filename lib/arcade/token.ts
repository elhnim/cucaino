/**
 * Sealed game tokens (server only). The mystery solution and the doodle round state travel
 * to the browser and back inside an AES-256-GCM token: the kid can't READ it (no peeking at
 * the culprit in devtools) and can't CHANGE it (GCM authenticates every byte). Tested in
 * token.test.ts.
 *
 * Key: process.env.ARCADE_SECRET (set it — any long random string). If it is missing we
 * derive a key from another server-only secret (SUPABASE_SERVICE_ROLE_KEY, else
 * ANTHROPIC_API_KEY) so the games still work, but rotating that secret then invalidates
 * games in progress.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function keyFrom(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`cucaino-arcade:${purpose}:`).update(secret).digest();
}

/** The server secret for sealing, or null when the server has none at all. */
export function arcadeSecret(): string | null {
  const s = process.env.ARCADE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ANTHROPIC_API_KEY;
  return s && s.length >= 16 ? s : null;
}

/**
 * Seal `payload` for `purpose` ("mystery", "doodle" …). A token sealed for one purpose never
 * opens as another. `ttlMs` sets an expiry checked by openToken.
 */
export function sealToken(payload: unknown, secret: string, purpose: string, ttlMs: number, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret, purpose), iv);
  cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
  const body = JSON.stringify({ exp: now + ttlMs, p: payload });
  const enc = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return `${VERSION}.${b64url(Buffer.concat([iv, cipher.getAuthTag(), enc]))}`;
}

/** The payload, or null if the token is forged, tampered, for another purpose, or expired. */
export function openToken<T = unknown>(token: unknown, secret: string, purpose: string, now = Date.now()): T | null {
  if (typeof token !== "string" || token.length > 60_000 || !token.startsWith(`${VERSION}.`)) return null;
  try {
    const raw = fromB64url(token.slice(VERSION.length + 1));
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret, purpose), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(body) as { exp?: unknown; p?: unknown };
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return (parsed.p ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Best-effort replay guard for single-use steps (per server instance — Netlify may run
 * several, so this narrows replays rather than making them impossible). Returns false when
 * `id` was already used.
 */
const used = new Map<string, number>();
export function markUsedOnce(id: string, ttlMs = 3 * 60 * 60 * 1000, now = Date.now()): boolean {
  if (used.size > 5_000) {
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    if (used.size > 5_000) used.clear();
  }
  const exp = used.get(id);
  if (exp !== undefined && exp >= now) return false;
  used.set(id, now + ttlMs);
  return true;
}

/** Undo markUsedOnce (the step failed, so the kid may retry with the same token). */
export function releaseUsed(id: string): void {
  used.delete(id);
}
