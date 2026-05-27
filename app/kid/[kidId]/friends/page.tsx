import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import { listConversationSummaries, listPendingFriendRequests } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import FriendsPage from "@/components/kid/FriendsPage";

export default async function FriendsRoute({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const [conversations, pendingRequests] = await Promise.all([
    listConversationSummaries(kidId),
    listPendingFriendRequests(kidId),
  ]);

  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <FriendsPage
        kidId={kidId}
        conversations={conversations}
        pendingRequests={pendingRequests}
        accent={theme.accent}
      />
    </div>
  );
}
