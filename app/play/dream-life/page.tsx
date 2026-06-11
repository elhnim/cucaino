import { getKid, listKids } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import DreamLifeGame from "@/components/dream-life/DreamLifeGame";

export default async function DreamLifePage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const [kid, kids] = await Promise.all([
    kidId ? getKid(kidId) : Promise.resolve(null),
    listKids(),
  ]);

  const content = <DreamLifeGame kids={kids} activeKidId={kidId ?? null} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return <div className="h-dvh overflow-hidden">{content}</div>;
}
