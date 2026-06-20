import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import VillagePillage from "@/components/village/VillagePillage";

export default async function VillagePillagePage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;

  const content = <VillagePillage kidId={kid?.id ?? null} kidName={kid?.name ?? "Player"} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return content;
}
