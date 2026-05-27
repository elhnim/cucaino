"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateKidProfile, setKidPin, clearKidPin } from "@/lib/actions/kids";
import { listFriendsAction, removeFriend } from "@/lib/actions/friends";
import type { Kid, FriendKid } from "@/lib/domain/types";


export default function ParentKidEditClient({ kid }: { kid: Kid }) {
  const router = useRouter();
  const [name, setName] = useState(kid.name);
  const [dateOfBirth, setDateOfBirth] = useState(kid.dateOfBirth ?? "");
  const [newPin, setNewPin] = useState("");
  const [isPending, startTransition] = useTransition();
  const [friendsPending, startFriendsTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pinCleared, setPinCleared] = useState(false);
  const [friends, setFriends] = useState<FriendKid[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);

  useEffect(() => {
    listFriendsAction(kid.id)
      .then((data) => {
        setFriends(data);
        setFriendsLoaded(true);
      })
      .catch(() => setFriendsLoaded(true));
  }, [kid.id]);

  const handleRemoveFriend = (friendId: string) => {
    startFriendsTransition(async () => {
      const result = await removeFriend(kid.id, friendId);
      if (result.ok) {
        setFriends((f) => f.filter((fr) => fr.id !== friendId));
      }
    });
  };

  const save = () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setError(null);
    startTransition(async () => {
      const result = await updateKidProfile(kid.id, {
        name: name.trim(),
        avatar: kid.avatar,
        themeId: kid.themeId,
        dateOfBirth: dateOfBirth || null,
      });
      if (!result.ok) { setError(result.error); return; }
      if (newPin.length === 4) {
        await setKidPin(kid.id, newPin);
      }
      router.push("/parent/settings");
    });
  };

  const removePin = () => {
    startTransition(async () => {
      await clearKidPin(kid.id);
      setPinCleared(true);
    });
  };

  return (
    <div className="p-4 space-y-5 max-w-md mx-auto">
      <h1 className="text-xl font-black text-gray-900">Edit {kid.name}</h1>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold">{error}</div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Date of birth */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Date of birth</label>
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* PIN */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">
          Kid PIN {(kid.pin && !pinCleared) ? "(currently set)" : "(not set)"}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="Enter new 4-digit PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {kid.pin && !pinCleared && (
            <button
              type="button"
              onClick={removePin}
              disabled={isPending}
              className="text-xs font-bold text-red-600 border border-red-200 rounded-xl px-3 py-2 hover:bg-red-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing PIN unchanged</p>
      </div>

      {/* Friends */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Friends</label>
        {!friendsLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="text-xs text-gray-400">No friends yet.</p>
        ) : (
          <div className="space-y-1">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-xl">{friend.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{friend.name}</div>
                  {friend.username && (
                    <div className="text-xs text-gray-400">@{friend.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFriend(friend.id)}
                  disabled={friendsPending}
                  className="text-xs font-bold text-red-600 border border-red-200 rounded-xl px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 border border-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
