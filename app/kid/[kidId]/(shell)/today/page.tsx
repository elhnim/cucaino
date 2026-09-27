import { redirect } from "next/navigation";

export default async function TodayRedirectPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  redirect(`/kid/${kidId}/home`);
}
