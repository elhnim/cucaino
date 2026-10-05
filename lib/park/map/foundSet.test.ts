import { describe, expect, it } from "vitest";
import { countFound, isFound, loadFoundIds, markFound } from "./foundSet";

function fakeStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("foundSet persistence", () => {
  it("starts empty for a kid who has found nothing", () => {
    const s = fakeStorage();
    expect(loadFoundIds("kid1", s)).toEqual([]);
  });

  it("markFound adds an id and loadFoundIds sees it afterwards", () => {
    const s = fakeStorage();
    markFound("kid1", "victoria-falls", s);
    expect(loadFoundIds("kid1", s)).toEqual(["victoria-falls"]);
    expect(isFound(loadFoundIds("kid1", s), "victoria-falls")).toBe(true);
  });

  it("is idempotent: finding the same place twice doesn't duplicate it", () => {
    const s = fakeStorage();
    markFound("kid1", "lakeside", s);
    markFound("kid1", "lakeside", s);
    expect(loadFoundIds("kid1", s)).toEqual(["lakeside"]);
  });

  it("keeps separate kids separate", () => {
    const s = fakeStorage();
    markFound("kid1", "lakeside", s);
    markFound("kid2", "everest", s);
    expect(loadFoundIds("kid1", s)).toEqual(["lakeside"]);
    expect(loadFoundIds("kid2", s)).toEqual(["everest"]);
  });

  it("never throws when storage.getItem/setItem throw (private window etc.)", () => {
    const angry = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => loadFoundIds("kid1", angry)).not.toThrow();
    expect(() => markFound("kid1", "x", angry)).not.toThrow();
    expect(loadFoundIds("kid1", angry)).toEqual([]);
  });

  it("recovers from corrupted JSON instead of throwing", () => {
    const s = fakeStorage();
    s.data["cucaino:found:kid1"] = "{not json";
    expect(loadFoundIds("kid1", s)).toEqual([]);
  });

  it("countFound counts only the ids that are actually found", () => {
    const s = fakeStorage();
    markFound("kid1", "a", s);
    markFound("kid1", "b", s);
    expect(countFound(loadFoundIds("kid1", s), ["a", "b", "c"])).toBe(2);
  });
});
