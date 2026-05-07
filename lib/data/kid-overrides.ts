/**
 * Kid overrides — localStorage-backed personalisation in stub mode.
 *
 * Server pages render with seed data from `lib/data/stub.ts`. Once a kid
 * (or parent) edits a profile, the change lives in the browser via this
 * module. A small client component (`KidOverridesApplier`) reads it and
 * patches what the user sees after hydration.
 *
 * When Supabase is wired, this module is removed: server components
 * render the real values from the database directly.
 */

"use client";

import type { Kid, ThemeId } from "@/lib/domain/types";

export interface KidOverride {
  name?: string;
  avatar?: string;
  themeId?: ThemeId;
  dateOfBirth?: string | null;
  pin?: string | null;
}

const KEY_PREFIX = "cucaino-kid-override:";

function key(kidId: string): string {
  return KEY_PREFIX + kidId;
}

export function getKidOverride(kidId: string): KidOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key(kidId));
    return raw ? (JSON.parse(raw) as KidOverride) : {};
  } catch {
    return {};
  }
}

export function setKidOverride(kidId: string, partial: KidOverride): void {
  if (typeof window === "undefined") return;
  const current = getKidOverride(kidId);
  const next = { ...current, ...partial };
  window.localStorage.setItem(key(kidId), JSON.stringify(next));
  // Notify other components in the same tab
  window.dispatchEvent(new CustomEvent("kid-override-changed", { detail: { kidId } }));
}

export function applyOverride(kid: Kid): Kid {
  const ov = getKidOverride(kid.id);
  return {
    ...kid,
    name: ov.name ?? kid.name,
    avatar: ov.avatar ?? kid.avatar,
    themeId: ov.themeId ?? kid.themeId,
    dateOfBirth:
      ov.dateOfBirth !== undefined ? ov.dateOfBirth : kid.dateOfBirth,
    pin: ov.pin !== undefined ? ov.pin : kid.pin,
  };
}

export function clearKidOverride(kidId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(kidId));
  window.dispatchEvent(new CustomEvent("kid-override-changed", { detail: { kidId } }));
}
