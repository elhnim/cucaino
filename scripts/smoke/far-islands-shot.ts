// Screenshot harness for the far islands on the big map: paints the map (no React, no WebGL)
// centred on each far island at a close and a wide zoom, plus the World view, side by side.
// Bundle: npx esbuild scripts/smoke/far-islands-shot.ts --bundle --format=iife --outfile=<dir>/far.js
import { paintMap } from "../../components/park/map/MapCanvas";
import { WORLD_PLACES } from "../../lib/park/registry/worldMap";

const W = 360;
const H = 360;
const shots: { cx: number; cz: number; view: number; night?: number }[] = [];
for (const p of WORLD_PLACES.filter((p) => p.kind === "island")) {
  shots.push({ cx: p.x, cz: p.z, view: p.r * 1.6 });
  shots.push({ cx: p.x, cz: p.z, view: p.r * 4 });
}
shots.push({ cx: 0, cz: 0, view: 1700 });
shots.push({ cx: 330, cz: 640, view: 260, night: 1 });
for (const s of shots) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.style.margin = "4px";
  document.body.appendChild(c);
  paintMap(c.getContext("2d")!, { mode: "big", width: W, height: H, camera: s, yaw: 0, pose: null, markers: [], night: s.night ?? 0 });
}
(window as unknown as { __done: boolean }).__done = true;
