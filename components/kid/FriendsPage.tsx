"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/lib/actions/friends";
import type { ConversationSummary, FriendRequest } from "@/lib/domain/types";

export default function FriendsPage({
  kidId,
  conversations: initialConversations,
  pendingRequests: initialPending,
  accent,
}: {
  kidId: string;
  conversations: ConversationSummary[];
  pendingRequests: FriendRequest[];
  accent: string;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [pending, setPending] = useState<FriendRequest[]>(initialPending);
  const [searchValue, setSearchValue] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inflightIds, setInflightIds] = useState<Set<string>>(new Set());
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setInflight = (id: string, active: boolean) => {
    setInflightIds((prev) => {
      const next = new Set(prev);
      active ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSend = () => {
    if (!searchValue.trim()) return;
    setSearchMsg(null);
    setInflight("send", true);
    startTransition(async () => {
      const result = await sendFriendRequest(kidId, searchValue.trim());
      setInflight("send", false);
      if (result.ok) {
        setSearchMsg({ ok: true, text: "Request sent! ✓" });
        setSearchValue("");
      } else {
        setSearchMsg({ ok: false, text: result.error });
      }
    });
  };

  const handleAccept = (requesterId: string) => {
    setInflight(requesterId, true);
    startTransition(async () => {
      const result = await acceptFriendRequest(kidId, requesterId);
      setInflight(requesterId, false);
      if (result.ok) {
        const req = pending.find((r) => r.requesterId === requesterId);
        if (req) {
          setPending((p) => p.filter((r) => r.requesterId !== requesterId));
          setConversations((c) => [
            ...c,
            {
              friendId: requesterId,
              friendName: req.name,
              friendAvatar: req.avatar,
              friendUsername: req.username,
              unreadCount: 0,
              lastMessageAt: null,
            },
          ]);
        }
      }
    });
  };

  const handleDecline = (requesterId: string) => {
    setInflight(requesterId, true);
    startTransition(async () => {
      const result = await declineFriendRequest(kidId, requesterId);
      setInflight(requesterId, false);
      if (result.ok) {
        setPending((p) => p.filter((r) => r.requesterId !== requesterId));
      }
    });
  };

  const handleRemove = (friendId: string) => {
    setInflight(friendId, true);
    startTransition(async () => {
      const result = await removeFriend(kidId, friendId);
      setInflight(friendId, false);
      if (result.ok) {
        setConversations((c) => c.filter((conv) => conv.friendId !== friendId));
      }
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">👫 Friends</h1>

      {/* Pending requests */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">Friend Requests</h2>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.requesterId} className="bg-white rounded-2xl shadow p-3 flex items-center gap-3">
                <span className="text-3xl">{req.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{req.name}</div>
                  {req.username && (
                    <div className="text-xs text-gray-400">@{req.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleAccept(req.requesterId)}
                  disabled={inflightIds.has(req.requesterId)}
                  className="text-xs font-bold text-white px-3 py-1.5 rounded-xl disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleDecline(req.requesterId)}
                  disabled={inflightIds.has(req.requesterId)}
                  className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add a friend */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">Add a Friend</h2>
        <div className="bg-white rounded-2xl shadow p-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setSearchMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder="Enter @username"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-current"
              style={{ caretColor: accent }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={inflightIds.has("send") || !searchValue.trim()}
              className="text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
              style={{ background: accent }}
            >
              Add
            </button>
          </div>
          {searchMsg && (
            <p className={`text-xs font-bold ${searchMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {searchMsg.text}
            </p>
          )}
        </div>
      </section>

      {/* Friends list */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">
          Friends {conversations.length > 0 && `(${conversations.length})`}
        </h2>
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No friends yet — search for a username above
          </p>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.friendId}
                className={`bg-white rounded-2xl shadow p-3 flex items-center gap-3 cursor-pointer transition-opacity ${navigatingId === conv.friendId ? "opacity-50" : "active:opacity-70"}`}
                style={{ touchAction: "manipulation" }}
                onClick={() => {
                  if (navigatingId) return;
                  setNavigatingId(conv.friendId);
                  router.push(`/kid/${kidId}/friends/${conv.friendId}`);
                }}
              >
                <span className="text-3xl">{conv.friendAvatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{conv.friendName}</div>
                  {conv.friendUsername && (
                    <div className="text-xs text-gray-400">@{conv.friendUsername}</div>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-white text-[10px] font-black px-1"
                    style={{ background: accent }}
                  >
                    {conv.unreadCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(conv.friendId); }}
                  disabled={inflightIds.has(conv.friendId)}
                  className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
