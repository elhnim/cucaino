import { redirect } from "next/navigation";

export default async function WeekRedirectPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  redirect(`/kid/${kidId}/todo`);
}
