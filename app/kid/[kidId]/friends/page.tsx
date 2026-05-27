import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import { listFriends, listPendingFriendRequests } from "@/lib/data/stub";
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

  const [friends, pendingRequests] = await Promise.all([
    listFriends(kidId),
    listPendingFriendRequests(kidId),
  ]);

  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <FriendsPage
        kidId={kidId}
        friends={friends}
        pendingRequests={pendingRequests}
        accent={theme.accent}
      />
    </div>
  );
}
