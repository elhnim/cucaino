"use client";

// Remembers which room/member this device is, per game, so a refresh rejoins
// the same seat. localStorage-only; no-ops on the server.

export interface RoomSession {
  roomId: string;
  memberId: string;
}

const key = (gameKey: string) => `room:${gameKey}`;

export function loadSession(gameKey: string): RoomSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(gameKey));
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(gameKey: string, session: RoomSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(gameKey), JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(gameKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(gameKey));
  } catch {
    // ignore
  }
}
