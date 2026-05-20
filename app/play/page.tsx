import { redirect } from "next/navigation";

export default async function PlayHubPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  if (kidId) redirect(`/kid/${kidId}/play`);
  redirect("/select-kid");
}
