import { listKids, getParentPinFromDb } from "@/lib/data/stub";
import { listThemes } from "@/lib/themes/presets";
import { ensureFamilySeeded } from "@/lib/actions/auth";
import SelectKidClient from "@/components/kid/SelectKidClient";

export default async function SelectKidPage() {
  await ensureFamilySeeded();

  const [kids, parentPin] = await Promise.all([
    listKids(),
    getParentPinFromDb(),
  ]);
  const themes = listThemes();
  return <SelectKidClient kids={kids} themes={themes} parentPin={parentPin} />;
}
