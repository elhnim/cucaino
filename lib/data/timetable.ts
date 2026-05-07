/**
 * Timetable storage — kid-editable, localStorage-backed in stub mode.
 *
 * Stub data ships an example timetable per kid. Once a kid edits it,
 * the kid-specific override is saved to localStorage and read in
 * preference to the seed. When Supabase is wired, swap localStorage for
 * a `school_classes` table query — this module's API stays identical.
 */

"use client";

import type { DayOfWeek, SchoolClass } from "@/lib/domain/types";

const KEY_PREFIX = "cucaino-timetable:";

function key(kidId: string): string {
  return KEY_PREFIX + kidId;
}

// ----- Seed timetables (replaced by Supabase queries later) -----

const SEED: Record<string, SchoolClass[]> = {
  "kid-liam": [
    cls(1, "math", "08:50", "09:50"),
    cls(1, "english", "10:00", "11:00"),
    cls(1, "recess", "11:00", "11:20"),
    cls(1, "science", "11:20", "12:20"),
    cls(1, "lunch", "12:20", "13:00"),
    cls(1, "pe", "13:00", "14:00"),
    cls(1, "art", "14:10", "15:00"),

    cls(2, "english", "08:50", "09:50"),
    cls(2, "math", "10:00", "11:00"),
    cls(2, "recess", "11:00", "11:20"),
    cls(2, "history", "11:20", "12:20"),
    cls(2, "lunch", "12:20", "13:00"),
    cls(2, "computing", "13:00", "14:00"),
    cls(2, "music", "14:10", "15:00"),

    cls(3, "library", "08:50", "09:50"),
    cls(3, "math", "10:00", "11:00"),
    cls(3, "recess", "11:00", "11:20"),
    cls(3, "english", "11:20", "12:20"),
    cls(3, "lunch", "12:20", "13:00"),
    cls(3, "geography", "13:00", "14:00"),
    cls(3, "science", "14:10", "15:00"),

    cls(4, "math", "08:50", "09:50"),
    cls(4, "language", "10:00", "11:00"),
    cls(4, "recess", "11:00", "11:20"),
    cls(4, "english", "11:20", "12:20"),
    cls(4, "lunch", "12:20", "13:00"),
    cls(4, "pe", "13:00", "14:00"),
    cls(4, "religion", "14:10", "15:00"),

    cls(5, "english", "08:50", "09:50"),
    cls(5, "science", "10:00", "11:00"),
    cls(5, "recess", "11:00", "11:20"),
    cls(5, "math", "11:20", "12:20"),
    cls(5, "lunch", "12:20", "13:00"),
    cls(5, "art", "13:00", "14:00"),
    cls(5, "music", "14:10", "15:00"),
  ],
  "kid-mia": [
    cls(1, "english", "08:50", "09:50"),
    cls(1, "math", "10:00", "11:00"),
    cls(1, "recess", "11:00", "11:20"),
    cls(1, "art", "11:20", "12:20"),
    cls(1, "lunch", "12:20", "13:00"),
    cls(1, "library", "13:00", "14:00"),
    cls(1, "pe", "14:10", "15:00"),

    cls(2, "math", "08:50", "09:50"),
    cls(2, "english", "10:00", "11:00"),
    cls(2, "recess", "11:00", "11:20"),
    cls(2, "music", "11:20", "12:20"),
    cls(2, "lunch", "12:20", "13:00"),
    cls(2, "science", "13:00", "14:00"),
    cls(2, "geography", "14:10", "15:00"),

    cls(3, "english", "08:50", "09:50"),
    cls(3, "math", "10:00", "11:00"),
    cls(3, "recess", "11:00", "11:20"),
    cls(3, "pe", "11:20", "12:20"),
    cls(3, "lunch", "12:20", "13:00"),
    cls(3, "computing", "13:00", "14:00"),
    cls(3, "art", "14:10", "15:00"),

    cls(4, "math", "08:50", "09:50"),
    cls(4, "english", "10:00", "11:00"),
    cls(4, "recess", "11:00", "11:20"),
    cls(4, "library", "11:20", "12:20"),
    cls(4, "lunch", "12:20", "13:00"),
    cls(4, "art", "13:00", "14:00"),
    cls(4, "history", "14:10", "15:00"),

    cls(5, "english", "08:50", "09:50"),
    cls(5, "math", "10:00", "11:00"),
    cls(5, "recess", "11:00", "11:20"),
    cls(5, "science", "11:20", "12:20"),
    cls(5, "lunch", "12:20", "13:00"),
    cls(5, "pe", "13:00", "14:00"),
    cls(5, "music", "14:10", "15:00"),
  ],
};

function cls(
  dow: number,
  subject: SchoolClass["subject"],
  startTime: string,
  endTime: string,
): SchoolClass {
  return {
    id: `seed-${dow}-${startTime}-${subject}-${Math.random().toString(36).slice(2, 7)}`,
    kidId: "", // filled in below
    dayOfWeek: dow as DayOfWeek,
    subject,
    customLabel: null,
    startTime,
    endTime,
    room: null,
    teacher: null,
  };
}

// ----- Public API -----

export function loadTimetable(kidId: string): SchoolClass[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(key(kidId));
      if (raw) return JSON.parse(raw) as SchoolClass[];
    } catch {
      // fall through to seed
    }
  }
  // Stamp kidId on a copy of seed
  const seed = SEED[kidId] ?? [];
  return seed.map((c) => ({ ...c, kidId }));
}

export function saveTimetable(kidId: string, classes: SchoolClass[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(kidId), JSON.stringify(classes));
  window.dispatchEvent(
    new CustomEvent("timetable-changed", { detail: { kidId } }),
  );
}

export function clearTimetable(kidId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(kidId));
  window.dispatchEvent(
    new CustomEvent("timetable-changed", { detail: { kidId } }),
  );
}

export function classesForDay(
  classes: SchoolClass[],
  dayOfWeek: DayOfWeek,
): SchoolClass[] {
  return classes
    .filter((c) => c.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
