// No-auth smoke harness for the candy kid-picker meadow (lib/park/world/pickerScene).
import { createPickerScene } from "../../lib/park/world/pickerScene";

const q = new URLSearchParams(location.search);
const host = document.getElementById("app")!;
if (q.get("w")) {
  host.style.width = `${q.get("w")}px`;
  host.style.height = `${q.get("h") ?? 844}px`;
}
const n = Number(q.get("n") ?? 4);
const cast = [
  { id: "a", label: "Nơ 🔒", animal: "animal-panda", accent: "#e5484d" },
  { id: "b", label: "Cucai 🔒", animal: "animal-caterpillar", accent: "#4f46e5" },
  { id: "c", label: "Maymay", animal: "animal-dog", accent: "#e5484d" },
  { id: "d", label: "Leo", animal: "animal-lion", accent: "#f97316" },
  { id: "e", label: "Ava", animal: "animal-bunny", accent: "#0ea5e9" },
].slice(0, n);
(window as unknown as Record<string, unknown>).__picker = createPickerScene(host, {
  characters: cast as never,
  onPick: (id) => console.log("[picker] picked", id),
});
