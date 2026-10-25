import { describe, expect, it } from "vitest";
import { SAVANNA, savannaK } from "./habitats";
import { seaDist } from "./island";
import { groundYFar } from "./terrain";
import { inSettlement } from "./settlements";
import { WONDERS } from "./wonders";
import { herdCell, HERD_CELL } from "../world/wildlife/placement";
import { WS_ANTELOPE, WS_DEER, WS_ELEPHANT, WS_GIRAFFE, WS_GOAT, WS_KANGAROO, WS_ZEBRA } from "../world/wildlife/types";

describe("the Savanna", () => {
  it("lies on dry, gentle ground, clear of the villages and the Natural Wonders", () => {
    let n = 0;
    let dry = 0;
    let gentle = 0;
    for (let x = SAVANNA.x - SAVANNA.rx; x <= SAVANNA.x + SAVANNA.rx; x += 20)
      for (let z = SAVANNA.z - SAVANNA.rz; z <= SAVANNA.z + SAVANNA.rz; z += 20) {
        if (savannaK(x, z) < 0.5) continue;
        n++;
        if (seaDist(x, z) < 0 && groundYFar(x, z) > 0.5) dry++;
        const slope = Math.hypot(groundYFar(x + 6, z) - groundYFar(x - 6, z), groundYFar(x, z + 6) - groundYFar(x, z - 6)) / 12;
        if (slope < 0.3) gentle++;
        expect(inSettlement(x, z, 0), `${x},${z}`).toBe(false);
        for (const w of WONDERS) expect(Math.hypot(x - w.x, z - w.z), w.id).toBeGreaterThan(120);
      }
    expect(n).toBeGreaterThan(300);
    expect(dry / n).toBeGreaterThan(0.97);
    expect(gentle / n).toBeGreaterThan(0.9);
  });

  it("is where the safari lives — in plenty — and nowhere else", () => {
    const safari = new Set([WS_ZEBRA, WS_ANTELOPE, WS_GIRAFFE, WS_ELEPHANT]);
    const green = new Set([WS_DEER, WS_KANGAROO, WS_GOAT]);
    let inSavanna = 0;
    const kinds = new Set<number>();
    for (let ci = -4; ci < 14; ci++)
      for (let cj = -10; cj < 5; cj++)
        for (const h of herdCell(ci, cj)) {
          if (safari.has(h.species)) {
            expect(savannaK(h.hx, h.hz), "a safari herd outside the Savanna").toBeGreaterThanOrEqual(0.5);
            inSavanna++;
            kinds.add(h.species);
          } else if (green.has(h.species)) {
            expect(savannaK(h.hx, h.hz), "a deer or kangaroo herd on the Savanna").toBeLessThan(0.5);
          }
        }
    expect(HERD_CELL).toBe(200);
    expect(inSavanna).toBeGreaterThanOrEqual(8);
    expect(kinds.size).toBe(4);
  });
});
