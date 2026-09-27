// No-auth smoke harness for the park + HUD mini map. Bundle with:
//   npx esbuild scripts/smoke/minimap-harness.tsx --bundle --format=iife --jsx=automatic --outfile=<dir>/park-smoke.js
// (same page/assets as park-harness.ts). __park is the ParkWorld.
import "./park-harness";
import { createRoot } from "react-dom/client";
import { MiniMap } from "../../components/park/MiniMap";
import type { ParkWorld } from "../../lib/park/engine/ParkWorld";

const host = document.createElement("div");
document.body.appendChild(host);
const ref = { get current() { return (window as unknown as { __park: ParkWorld }).__park; } };
createRoot(host).render(<MiniMap world={ref} />);
