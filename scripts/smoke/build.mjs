// Bundles the Phaser smoke harness (mock data, no auth/DB) into canvas-smoke.js.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const r = (p) => resolve(root, p);

await build({
  entryPoints: [r("scripts/smoke/harness.ts")],
  bundle: true,
  outfile: r("mockups/2026-06-12-game-world/canvas-smoke.js"),
  format: "iife",
  loader: { ".png": "dataurl", ".webp": "dataurl", ".mp3": "empty", ".wav": "empty" },
  alias: {
    "@/lib/actions/pet": r("scripts/smoke/mockActions.ts"),
    "@/lib/actions/completions": r("scripts/smoke/mockCompletions.ts"),
    "@/lib/pet/logic": r("scripts/smoke/empty.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
