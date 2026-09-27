// Smoke harness for the pre-game 3D meadow (kid-picker mode) — no auth/DB.
import { createAmbientScene } from "../../lib/game3d/ambient";
import { getAnimal } from "../../lib/game3d/registry/animals";

const host = document.getElementById("app")!;
(window as unknown as { __scene?: unknown }).__scene = createAmbientScene(host, "#6366f1", {
  characters: [
    { id: "a", label: "Mia 🔒", animal: getAnimal("bunny"), accent: "#c026d3" },
    { id: "b", label: "Leo", animal: getAnimal("lion"), accent: "#f97316" },
    { id: "c", label: "Ava", animal: getAnimal("unicorn"), accent: "#0ea5e9" },
  ],
  onPick: (id) => console.log("[smoke] picked", id),
});
