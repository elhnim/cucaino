import type { Lesson, WizardDef, WizardId } from "./types";
import { WIZARD_DEFS, WIZARD_IDS } from "./wizards";
import { LESSONS_SAGE } from "./lessons/sage";
import { LESSONS_TWINKLE } from "./lessons/twinkle";
import { LESSONS_TINKER } from "./lessons/tinker";
import { LESSONS_MARIGOLD } from "./lessons/marigold";
import { LESSONS_NOVA } from "./lessons/nova";
import { LESSONS_CORAL } from "./lessons/coral";

export type { Lesson, LessonQuiz, WizardDef, WizardId } from "./types";
export { WIZARD_IDS } from "./wizards";

/** The six wizards, in park order. */
export const WIZARDS: WizardDef[] = WIZARD_IDS.map((id) => WIZARD_DEFS[id]);

const BY_WIZARD: Record<WizardId, Lesson[]> = {
  sage: LESSONS_SAGE,
  twinkle: LESSONS_TWINKLE,
  tinker: LESSONS_TINKER,
  marigold: LESSONS_MARIGOLD,
  nova: LESSONS_NOVA,
  coral: LESSONS_CORAL,
};

export const ALL_LESSONS: Lesson[] = WIZARD_IDS.flatMap((id) => BY_WIZARD[id]);

export function wizardDef(id: WizardId): WizardDef {
  return WIZARD_DEFS[id];
}

export function lessonsFor(wizard: WizardId): Lesson[] {
  return BY_WIZARD[wizard];
}

export function lessonById(id: string): Lesson | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

// ---- deterministic daily pick ----

/** FNV-1a 32-bit string hash. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: small, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const orderCache = new Map<WizardId, number[]>();

/** Stable shuffled order of lesson indexes for a wizard (seeded by the wizard id). */
function lessonOrder(wizard: WizardId): number[] {
  const cached = orderCache.get(wizard);
  if (cached) return cached;
  const n = BY_WIZARD[wizard].length;
  const order = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(hashString(`cucaino-wizard:${wizard}`));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  orderCache.set(wizard, order);
  return order;
}

/**
 * The one lesson a wizard teaches on a given day. Walks a fixed shuffled order,
 * so every lesson is used once before any repeats and consecutive days differ.
 */
export function todaysLesson(wizard: WizardId, day: number): Lesson {
  const list = BY_WIZARD[wizard];
  const order = lessonOrder(wizard);
  const d = Math.floor(day);
  const pos = ((d % order.length) + order.length) % order.length;
  return list[order[pos]];
}

const EPOCH_UTC = Date.UTC(2026, 0, 1);

/** Whole days since 2026-01-01 for the calendar date of `date` in timezone `tz`. */
export function dayNumber(date: Date, tz = "Australia/Sydney"): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: "year" | "month" | "day") => Number(parts.find((p) => p.type === type)?.value);
  const utc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return Math.round((utc - EPOCH_UTC) / 86_400_000);
}
