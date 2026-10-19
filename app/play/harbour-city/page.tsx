import { redirect } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import HarbourCity from "@/components/games/HarbourCity";

export const metadata = { title: "Harbour City Tycoon" };

export default async function HarbourCityPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;
  if (!kid) redirect("/select-kid");

  return <HarbourCity kidId={kid.id} kidName={kid.name} familyId={kid.familyId} />;
}
