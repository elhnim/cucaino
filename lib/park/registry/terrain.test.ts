import { describe, expect, it } from "vitest";

// Ground is streamed lazily (CLAUDE.md: "registry/terrain.ts bakes the height field lazily per
// tile") — nothing here should do heavy work just from being imported, and groundY() itself must
// stay fast (CLAUDE.md: "the first groundY(0,20) after import must stay ~30-50 ms"). Module
// transform/compile time is excluded on purpose — that's a one-off bundler cost paid once in the
// real app, not a per-call runtime one, and vitest's on-demand TS transform of the whole registry
// graph dwarfs it here, which would make a total-time assertion flaky and meaningless.
describe("terrain perf", () => {
  it("groundY(0, 20) stays fast once terrain.ts is loaded", async () => {
    const { groundY } = await import("./terrain");
    const t0 = performance.now();
    groundY(0, 20);
    const dt = performance.now() - t0;
    // CLAUDE.md's own number is ~30-50 ms; this ceiling is deliberately looser (CI workers run many
    // test files in parallel, and scheduler jitter alone can cost tens of ms) so this only trips on
    // a real regression (e.g. an O(places) search creeping into groundY's hot path), not noise.
    expect(dt).toBeLessThan(120);
  });
});
