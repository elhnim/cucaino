import { redirect } from "next/navigation";

// Chores are quests on the Quest Board in Cucaino Park now.
export default async function QuestsRedirect({ params }: { params: Promise<{ kidId: string }> }) {
  const { kidId } = await params;
  redirect(`/park/${kidId}?enter=quests`);
}
