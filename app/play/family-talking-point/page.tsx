import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import FamilyTalkingPoint from "@/components/talking-point/FamilyTalkingPoint";

export default async function FamilyTalkingPointPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;

  const content = <FamilyTalkingPoint kidId={kid?.id ?? null} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return content;
}
