import { notFound } from "next/navigation";
import { getKid, listFriends, listMessages } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import ChatView from "@/components/kid/ChatView";

export default async function ChatRoute({
  params,
}: {
  params: Promise<{ kidId: string; friendId: string }>;
}) {
  const { kidId, friendId } = await params;

  const [kid, friends] = await Promise.all([
    getKid(kidId),
    listFriends(kidId),
  ]);
  if (!kid) notFound();

  const friend = friends.find((f) => f.id === friendId);
  if (!friend) notFound();

  const messages = await listMessages(kidId, friendId);

  const theme = getTheme(kid.themeId);

  return (
    <div className="h-full flex flex-col">
      <ChatView
        kidId={kidId}
        friendId={friendId}
        friendName={friend.name}
        friendAvatar={friend.avatar}
        initialMessages={messages}
        accent={theme.accent}
      />
    </div>
  );
}
