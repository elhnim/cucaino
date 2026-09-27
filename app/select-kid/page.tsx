import { listKids, getParentPinFromDb, getFamily } from "@/lib/data/stub";
import { listThemes } from "@/lib/themes/presets";
import { ensureFamilySeeded } from "@/lib/actions/auth";
import SelectKidClient from "@/components/kid/SelectKidClient";

export default async function SelectKidPage() {
  // Seeding only matters for brand-new accounts — run it alongside the main
  // queries instead of blocking them (saves two sequential round trips), and
  // refetch once in the rare case a family really was just created.
  let [, kids, parentPin, family] = await Promise.all([
    ensureFamilySeeded(),
    listKids(),
    getParentPinFromDb(),
    getFamily(),
  ]);
  if (kids.length === 0) {
    [kids, family] = await Promise.all([listKids(), getFamily()]);
  }

  // Per-kid progress (2 queries per kid) loads client-side after the picker is on screen,
  // so it never delays the first paint.
  const themes = listThemes();
  return (
    <SelectKidClient
      // never ship kid PINs to the browser: keep only a "has a PIN" marker (checked server-side)
      kids={kids.map((k) => ({ ...k, pin: k.pin ? "set" : null }))}
      themes={themes}
      hasParentPin={!!parentPin}
      familyName={family?.name ?? null}
      parentDisplayName={family?.parentDisplayName ?? null}
      parentAvatar={family?.parentAvatar ?? "🧙"}
    />
  );
}
