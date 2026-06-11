// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildNewGame } from "./engine"
import { clearSave, isStorageAvailable, loadGame, saveGame } from "./save"

// minimal localStorage stub on globalThis.window
function stubStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    ...overrides,
  } as Storage
  vi.stubGlobal("window", { localStorage: storage })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe("save/load", () => {
  it("round-trips a GameState", () => {
    stubStorage()
    const state = buildNewGame([{ id: "p1", name: "Mia", emoji: "🦄" }], 5)
    expect(saveGame(state)).toBe(true)
    expect(loadGame()).toEqual(state)
  })

  it("returns null and clears on corrupt JSON", () => {
    const store = stubStorage()
    store.set("dream-life:save:v1", "{not json")
    expect(loadGame()).toBeNull()
    expect(store.has("dream-life:save:v1")).toBe(false)
  })

  it("rejects wrong schemaVersion", () => {
    const store = stubStorage()
    store.set("dream-life:save:v1", JSON.stringify({ schemaVersion: 99, state: {} }))
    expect(loadGame()).toBeNull()
  })

  it("storage unavailable: saveGame false, loadGame null, no throw", () => {
    stubStorage({
      setItem: () => {
        throw new Error("quota")
      },
      getItem: () => {
        throw new Error("blocked")
      },
    })
    const state = buildNewGame([{ id: "p1", name: "Mia", emoji: "🦄" }], 5)
    expect(saveGame(state)).toBe(false)
    expect(loadGame()).toBeNull()
    expect(isStorageAvailable()).toBe(false)
    expect(() => clearSave()).not.toThrow()
  })
})
