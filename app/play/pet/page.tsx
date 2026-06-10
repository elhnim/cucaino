import { getKid, getKidPet } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import KidShell from "@/components/kid/KidShell";
import PetGame from "@/components/pet/PetGame";

export default async function PetPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;

  const kid = kidId ? await getKid(kidId) : null;
  const pet = kid ? await getKidPet(kid.id) : null;
  const accent = kid ? getTheme(kid.themeId).accent : "#c026d3";

  const content = (
    <PetGame
      kid={kid ? { id: kid.id, name: kid.name, pointsBalance: kid.pointsBalance } : null}
      initialPet={pet}
      accent={accent}
    />
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-amber-50">
      {content}
    </div>
  );
}
