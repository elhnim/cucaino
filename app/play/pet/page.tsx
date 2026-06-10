import { getKid, getKidPet } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import KidOverridesApplier from "@/components/kid/KidOverridesApplier";
import PetGame from "@/components/pet/PetGame";

export default async function PetPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;

  const kid = kidId ? await getKid(kidId) : null;
  const pet = kid ? await getKidPet(kid.id) : null;
  const theme = kid ? getTheme(kid.themeId) : null;
  const accent = theme?.accent ?? "#c026d3";

  return (
    <div className="h-dvh overflow-hidden flex flex-col font-fun" style={{ background: theme ? `linear-gradient(160deg, ${theme.accent}18 0%, white 60%)` : "#fdf4ff" }}>
      {kid && <KidOverridesApplier kid={kid} />}
      <PetGame
        kid={kid ? { id: kid.id, name: kid.name, pointsBalance: kid.pointsBalance } : null}
        initialPet={pet}
        accent={accent}
      />
    </div>
  );
}
