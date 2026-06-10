import { getKid, listKids } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import MoneyTownGame from "@/components/money-town/MoneyTownGame";
import type { Kid } from "@/lib/domain/types";

export default async function MoneyTownPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const [kid, kids] = await Promise.all([
    kidId ? getKid(kidId) : Promise.resolve(null),
    listKids(),
  ]);

  const content = (
    <MoneyTownGame
      kids={kids}
      activeKidId={kidId ?? null}
    />
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="h-dvh overflow-hidden bg-sky-50">
      {content}
    </div>
  );
}
