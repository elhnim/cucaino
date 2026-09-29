// The real park screen with mock data (see app-build.mjs). ?quests=4&done=1 to vary the HUD.
import { createRoot } from "react-dom/client";
import ParkApp from "../../components/park/ParkApp";
import type { ParkInitialData } from "../../lib/park/types";

const q = new URLSearchParams(location.search);
const data: ParkInitialData = {
  kid: { id: "smoke-kid", name: "Maymay", avatar: "🦌", themeId: "garden", pointsBalance: 5, currentStreak: 2, tourSeen: true },
  pet: null,
  tasksToday: { total: Number(q.get("quests") ?? 4), done: Number(q.get("done") ?? 0) },
};
try {
  // skip the once-a-day mood check-in so it doesn't cover the screenshot
  window.localStorage.setItem(`cucaino.park.mood.smoke-kid.${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`, "1");
} catch {}
createRoot(document.getElementById("app")!).render(<ParkApp data={data} />);
