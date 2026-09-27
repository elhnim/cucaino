"use client";

import { useEffect, useState } from "react";
import { WorldPanelShell } from "./WorldPanelShell";
import {
  getFriendsPanelData,
  getFriendChatData,
  type FriendsPanelData,
  type FriendChatData,
} from "@/lib/actions/world-panels";
import FriendsPage from "@/components/kid/FriendsPage";
import ChatView from "@/components/kid/ChatView";

export function FriendsPanel({ kidId, accentColor, onClose }: { kidId: string; accentColor: string; onClose: () => void }) {
  const [data, setData] = useState<FriendsPanelData | null | "loading">("loading");
  // chatting with one friend happens right here in the tower, not on a separate page
  const [chatFriendId, setChatFriendId] = useState<string | null>(null);
  const [chat, setChat] = useState<FriendChatData | null | "loading">(null);

  useEffect(() => {
    // re-fetch the list whenever we come back from a chat, so unread counts are fresh
    if (chatFriendId) return;
    let cancelled = false;
    getFriendsPanelData(kidId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kidId, chatFriendId]);

  useEffect(() => {
    if (!chatFriendId) return;
    let cancelled = false;
    setChat("loading");
    getFriendChatData(kidId, chatFriendId).then((d) => {
      if (!cancelled) setChat(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kidId, chatFriendId]);

  const closeChat = () => {
    setChatFriendId(null);
    setChat(null);
  };

  return (
    <WorldPanelShell title="💌 Friends" onClose={onClose}>
      {chatFriendId ? (
        chat === "loading" || chat === null ? (
          <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Opening chat…</p>
        ) : (
          <div style={{ height: "min(60vh, 520px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, overflow: "hidden" }}>
            <ChatView
              kidId={kidId}
              friendId={chatFriendId}
              friendName={chat.friendName}
              friendAvatar={chat.friendAvatar}
              initialMessages={chat.messages}
              accent={accentColor}
              onBack={closeChat}
            />
          </div>
        )
      ) : data === "loading" ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Loading…</p>
      ) : !data ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Couldn&apos;t load friends.</p>
      ) : (
        <FriendsPage
          kidId={kidId}
          conversations={data.conversations}
          pendingRequests={data.pendingRequests}
          accent={accentColor}
          onOpenChat={setChatFriendId}
        />
      )}
    </WorldPanelShell>
  );
}
