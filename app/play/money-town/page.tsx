import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import MoneyTownGame from "@/components/money-town/MoneyTownGame";

export default async function MoneyTownPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;

  const content = <MoneyTownGame kidName={kid?.name ?? null} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50">
      {content}
    </div>
  );
}
