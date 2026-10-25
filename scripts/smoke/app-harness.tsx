// The real park screen with mock data (see app-build.mjs). ?quests=4&done=1 to vary the HUD.
// Extras for screenshots: ?enter=shop|quests|pet|rides|golf|market|retro (ParkApp's own deep
// links), ?tour=1 (welcome tour), ?stars=140 (lifetime stars -> level/XP), ?paid=1 (today's
// free plays used, so plays ask for a ticket), ?gallery=wizard|book|ask (render one panel on top).
import { createRoot } from "react-dom/client";
import ParkApp from "../../components/park/ParkApp";
import type { ParkInitialData } from "../../lib/park/types";
import { WizardSheet } from "../../components/park/wizards/WizardSheet";
import { BookOfWisdom } from "../../components/park/wizards/BookOfWisdom";
import { PromptCard } from "../../components/park/ui/Hud";
import { WIZARDS, todaysLesson, dayNumber } from "../../lib/park/wizards";

const q = new URLSearchParams(location.search);
const data: ParkInitialData = {
  kid: { id: "smoke-kid", familyId: "smoke-family", name: "Maymay", avatar: "🦌", themeId: "garden", pointsBalance: 5, currentStreak: 2, tourSeen: q.get("tour") !== "1", totalStarsEarned: Number(q.get("stars") ?? 140) },
  pet: null,
  tasksToday: { total: Number(q.get("quests") ?? 4), done: Number(q.get("done") ?? 0) },
};
const d = new Date();
const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
try {
  // skip the once-a-day mood check-in so it doesn't cover the screenshot
  window.localStorage.setItem(`cucaino.park.mood.smoke-kid.${day}`, "1");
  if (q.get("paid") === "1") for (const g of ["golf", "coaster"]) window.localStorage.setItem(`cucaino.freeplay.smoke-kid.${day}.${g}`, "1");
} catch {}

function Gallery() {
  const g = q.get("gallery");
  const w = WIZARDS[0];
  if (g === "wizard") return <WizardSheet wizard={w} lesson={todaysLesson(w.id, dayNumber(new Date()))} learned={false} onLearned={() => {}} onClose={() => {}} />;
  if (g === "book") return <BookOfWisdom kidId="smoke-kid" onClose={() => {}} />;
  if (g === "ask") return <PromptCard icon="🏪" title="Visit the Prize Shop?" hint="Spend your stars on prizes" no="Not now" yes="Let's shop! 🛍️" onNo={() => {}} onYes={() => {}} />;
  return null;
}

createRoot(document.getElementById("app")!).render(
  <>
    <ParkApp data={data} />
    <Gallery />
  </>,
);
