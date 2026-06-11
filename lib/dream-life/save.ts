// Dream Life — localStorage persistence (spec §9).
// One slot, versioned schema; corrupt/old saves are discarded silently.

import type { GameState } from "./types"

const KEY = "dream-life:save:v1"

interface SaveBlob {
  schemaVersion: 1
  savedAt: string
  state: GameState
}

export function isStorageAvailable(): boolean {
  try {
    const probe = "__dl_probe__"
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** false on quota/unavailable — game keeps running in memory (spec §9 failure states). */
export function saveGame(state: GameState): boolean {
  try {
    const blob: SaveBlob = { schemaVersion: 1, savedAt: new Date().toISOString(), state }
    window.localStorage.setItem(KEY, JSON.stringify(blob))
    return true
  } catch {
    return false
  }
}

/** null on missing / corrupt / version-mismatch (bad blob is cleared). */
export function loadGame(): GameState | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const blob = JSON.parse(raw) as Partial<SaveBlob>
    if (blob?.schemaVersion !== 1 || !blob.state || blob.state.schemaVersion !== 1) {
      clearSave()
      return null
    }
    return blob.state
  } catch {
    clearSave()
    return null
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // unavailable storage: nothing to clear
  }
}
