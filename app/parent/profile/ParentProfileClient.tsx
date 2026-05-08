"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PinPad from "@/components/kid/PinPad";
import { setParentPinDb, clearParentPinDb, updateParentProfile } from "@/lib/actions/parent-settings";

const PARENT_AVATARS = [
  "🧙", "👩", "👨", "👩‍💼", "👨‍💼", "👩‍🍳", "👨‍🍳",
  "🦸‍♀️", "🦸‍♂️", "🧑‍🏫", "👩‍🔬", "👨‍🔬", "🧑‍🎨", "👩‍🎤", "👨‍🎤",
  "🐉", "🦁", "🐺", "🦊", "🐻",
];

type View = "main" | "set-pin" | "change-pin";

export default function ParentProfileClient({
  email,
  hasPin,
  displayName,
  avatar,
}: {
  email: string;
  hasPin: boolean;
  displayName: string;
  avatar: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("main");
  const [name, setName] = useState(displayName);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);
  const [pinExists, setPinExists] = useState(hasPin);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProfile = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateParentProfile({ displayName: name, avatar: selectedAvatar });
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const removePin = () => {
    setError(null);
    startTransition(async () => {
      const result = await clearParentPinDb();
      if (!result.ok) { setError(result.error); return; }
      setPinExists(false);
    });
  };

  if (view === "set-pin" || view === "change-pin") {
    return (
      <div className="p-4 max-w-sm mx-auto">
        <button
          type="button"
          onClick={() => setView("main")}
          className="text-sm text-gray-500 font-semibold mb-6 flex items-center gap-1"
        >
          ← Back
        </button>
        <PinPad
          mode="set"
          accent="#4f46e5"
          prompt={view === "change-pin" ? "Enter new PIN" : "Choose a 4-digit PIN"}
          onSet={(pin) => {
            setError(null);
            startTransition(async () => {
              const result = await setParentPinDb(pin);
              if (!result.ok) { setError(result.error); setView("main"); return; }
              setPinExists(true);
              setView("main");
            });
          }}
        />
        {isPending && <p className="text-center text-sm text-indigo-600 font-bold mt-3">Saving…</p>}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-black text-gray-900">My Profile</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* Avatar picker */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="font-bold text-gray-900 text-sm">Avatar</div>
        <div className="flex flex-wrap gap-2">
          {PARENT_AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setSelectedAvatar(a)}
              className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center transition-all ${
                selectedAvatar === a
                  ? "ring-2 ring-indigo-500 scale-110 bg-indigo-50"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Display name */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <label className="block text-sm font-bold text-gray-700">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mum, Dad, Guardian…"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <p className="text-xs text-gray-400">Shows as "Hi [Name]!" in the header</p>
        <button
          type="button"
          onClick={saveProfile}
          disabled={isPending}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
        >
          {isPending ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
        </button>
      </div>

      {/* Account */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-1">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Account</div>
        <div className="text-sm text-gray-600">{email}</div>
      </div>

      {/* PIN management */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="font-bold text-gray-900 text-sm">Parent PIN</div>
        {pinExists ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">🔒 PIN is active</span>
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">On</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("change-pin")}
                className="flex-1 border border-indigo-300 text-indigo-700 font-bold py-2.5 rounded-xl text-sm hover:bg-indigo-50"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={removePin}
                disabled={isPending}
                className="flex-1 border border-red-200 text-red-600 font-bold py-2.5 rounded-xl text-sm hover:bg-red-50 disabled:opacity-50"
              >
                Remove PIN
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">No PIN set — anyone can access the parent area.</p>
            <button
              type="button"
              onClick={() => setView("set-pin")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm"
            >
              Set a PIN
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.back()}
        className="w-full border border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm"
      >
        Done
      </button>
    </div>
  );
}
