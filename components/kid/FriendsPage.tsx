"use client";

import { useState, useTransition } from "react";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/lib/actions/friends";
import type { FriendKid, FriendRequest } from "@/lib/domain/types";

export default function FriendsPage({
  kidId,
  friends: initialFriends,
  pendingRequests: initialPending,
  accent,
}: {
  kidId: string;
  friends: FriendKid[];
  pendingRequests: FriendRequest[];
  accent: string;
}) {
  const [friends, setFriends] = useState<FriendKid[]>(initialFriends);
  const [pending, setPending] = useState<FriendRequest[]>(initialPending);
  const [searchValue, setSearchValue] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    if (!searchValue.trim()) return;
    setSearchMsg(null);
    startTransition(async () => {
      const result = await sendFriendRequest(kidId, searchValue.trim());
      if (result.ok) {
        setSearchMsg({ ok: true, text: "Request sent! ✓" });
        setSearchValue("");
      } else {
        setSearchMsg({ ok: false, text: result.error });
      }
    });
  };

  const handleAccept = (requesterId: string) => {
    startTransition(async () => {
      const result = await acceptFriendRequest(kidId, requesterId);
      if (result.ok) {
        const req = pending.find((r) => r.requesterId === requesterId);
        if (req) {
          setPending((p) => p.filter((r) => r.requesterId !== requesterId));
          setFriends((f) => [...f, { id: requesterId, name: req.name, avatar: req.avatar, username: req.username }]);
        }
      }
    });
  };

  const handleDecline = (requesterId: string) => {
    startTransition(async () => {
      const result = await declineFriendRequest(kidId, requesterId);
      if (result.ok) {
        setPending((p) => p.filter((r) => r.requesterId !== requesterId));
      }
    });
  };

  const handleRemove = (friendId: string) => {
    startTransition(async () => {
      const result = await removeFriend(kidId, friendId);
      if (result.ok) {
        setFriends((f) => f.filter((fr) => fr.id !== friendId));
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
                  disabled={isPending}
                  className="text-xs font-bold text-white px-3 py-1.5 rounded-xl disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleDecline(req.requesterId)}
                  disabled={isPending}
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
              disabled={isPending || !searchValue.trim()}
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
          Friends {friends.length > 0 && `(${friends.length})`}
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No friends yet — search for a username above
          </p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white rounded-2xl shadow p-3 flex items-center gap-3">
                <span className="text-3xl">{friend.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{friend.name}</div>
                  {friend.username && (
                    <div className="text-xs text-gray-400">@{friend.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(friend.id)}
                  disabled={isPending}
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
