// No-auth smoke harness for the Retro Arcade. Bundle with:
//   npx esbuild scripts/smoke/retro-harness.tsx --bundle --format=iife --jsx=automatic --outfile=<dir>/retro-smoke.js
// ?game=<id> opens a game straight away.
import { createRoot } from "react-dom/client";
import { RetroArcade } from "../../components/park/retro/RetroArcade";

createRoot(document.getElementById("app")!).render(<RetroArcade kidId="smoke" onClose={() => console.log("[retro] close")} />);
