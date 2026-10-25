import { redirect } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import ArcadeHub from "@/components/arcade/ArcadeHub";

export default async function ArcadeHubPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  // kids play this inside Cucaino Park now — send them to the park version
  if (kidId) redirect(`/park/${kidId}?enter=arcade`);
  const kid = kidId ? await getKid(kidId) : null;

  const content = <ArcadeHub kid={kid} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-sky-100">
      {content}
    </div>
  );
}
