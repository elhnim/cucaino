// No-auth smoke harness for Cucaino Karts: the real ParkWorld + the real race screen (lobby, HUD,
// results) with the kart store/network stubbed. Bundle with esbuild (see scripts/smoke/README-ish
// notes in park-harness.ts) aliasing "@/lib/actions/karts" to scripts/smoke/kart-actions-stub.ts.
import "./park-harness";
import { createRoot } from "react-dom/client";
import KartRace from "../../components/park/KartRace";
import type { ParkWorld } from "../../lib/park/engine/ParkWorld";

const host = document.createElement("div");
document.body.appendChild(host);
const world = (window as unknown as { __park: ParkWorld }).__park;
function App() {
  return <KartRace world={world} familyId="smoke-family" kid={{ kidId: "smoke-kid", name: "Maymay", animal: "animal-fox", colour: "#ff5fa8" }} onClose={() => console.log("[kart] closed")} onToast={(t) => console.log("[kart] toast", t)} />;
}
// (the park must be built before a ride can start)
const wait = window.setInterval(() => {
  if ((world as unknown as { park: unknown }).park) {
    window.clearInterval(wait);
    createRoot(host).render(<App />);
  }
}, 300);
