import { listKids, getParentPinFromDb, getFamily, listTasksForKid, listCompletionsToday } from "@/lib/data/stub";
import { listThemes } from "@/lib/themes/presets";
import { ensureFamilySeeded } from "@/lib/actions/auth";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import SelectKidClient from "@/components/kid/SelectKidClient";

export default async function SelectKidPage() {
  await ensureFamilySeeded();

  const [kids, parentPin, family] = await Promise.all([
    listKids(),
    getParentPinFromDb(),
    getFamily(),
  ]);

  const dow = isoWeekday();
  const kidProgress = await Promise.all(
    kids.map(async (kid) => {
      const [tasks, completions] = await Promise.all([
        listTasksForKid(kid.id),
        listCompletionsToday(kid.id),
      ]);
      const todayTasks = tasksForDay(tasks, dow).filter((t) => t.requiresCompletion);
      return { kidId: kid.id, done: completions.length, total: todayTasks.length };
    })
  );

  const themes = listThemes();
  return (
    <SelectKidClient
      kids={kids}
      themes={themes}
      parentPin={parentPin}
      familyName={family?.name ?? null}
      parentDisplayName={family?.parentDisplayName ?? null}
      parentAvatar={family?.parentAvatar ?? "🧙"}
      kidProgress={kidProgress}
    />
  );
}
