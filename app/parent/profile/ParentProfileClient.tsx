"use client";

import { useState, useTransition } from "react";
import PinPad from "@/components/kid/PinPad";
import { setParentPinDb, clearParentPinDb, updateParentProfile } from "@/lib/actions/parent-settings";

const PARENT_AVATARS = [
  "🧙", "👩", "👨", "👩‍💼", "👨‍💼", "👩‍🍳", "👨‍🍳",
  "🦸‍♀️", "🦸‍♂️", "🧑‍🏫", "👩‍🔬", "👨‍🔬", "🧑‍🎨", "👩‍🎤", "👨‍🎤",
  "🐉", "🦁", "🐺", "🦊", "🐻",
];

type View = "main" | "set-pin" | "change-pin" | "edit-avatar";

export default function ParentProfileClient({
  email,
  hasPin,
  displayName,
  avatar,
  isFounder,
}: {
  email: string;
  hasPin: boolean;
  displayName: string;
  avatar: string;
  isFounder: boolean;
}) {
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
    <div className="max-w-md mx-auto pb-10">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 px-6 pt-8 pb-6 flex flex-col items-center text-center">
        <div className="relative mb-3">
          <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-5xl border-4 border-white shadow-lg">
            {selectedAvatar}
          </div>
          <button
            type="button"
            onClick={() => setView(view === "edit-avatar" ? "main" : "edit-avatar")}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm flex items-center justify-center shadow"
          >
            ✏️
          </button>
        </div>
        <div className="text-xl font-black text-gray-900">{name || "Parent"}</div>
        <div className="text-sm text-gray-500 mt-0.5">{email}</div>
        {isFounder && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-3 py-1 text-xs font-black tracking-wide">
            ⚡ Founding Family · Free Forever
          </div>
        )}
      </div>

      {/* Avatar picker (expandable) */}
      {view === "edit-avatar" && (
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Choose avatar</div>
          <div className="grid grid-cols-5 gap-2">
            {PARENT_AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => { setSelectedAvatar(a); saveProfile(); setView("main"); }}
                className={`w-12 h-12 rounded-full text-2xl flex items-center justify-center transition-all ${
                  selectedAvatar === a
                    ? "ring-2 ring-indigo-500 bg-indigo-50 scale-110"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      <div className="px-4 pt-5 space-y-4">
        {/* Account section */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Account</div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
              <div>
                <div className="text-xs text-gray-400 font-semibold">Display name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveProfile}
                  placeholder="e.g. Mum, Dad…"
                  className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none w-full mt-0.5"
                />
              </div>
              <span className="text-gray-300 text-xl">›</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <div className="text-xs text-gray-400 font-semibold">Email</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{email}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Security section */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Security</div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setView(pinExists ? "change-pin" : "set-pin")}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-base">🔒</div>
                <span className="text-sm font-bold text-gray-800">
                  {pinExists ? "Change PIN" : "Set a PIN"}
                </span>
              </div>
              <span className="text-gray-300 text-xl">›</span>
            </button>
            {pinExists && (
              <div className="border-t border-gray-50">
                <button
                  type="button"
                  onClick={removePin}
                  disabled={isPending}
                  className="w-full flex items-center justify-between px-4 py-3.5 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-base">🗑️</div>
                    <span className="text-sm font-bold text-red-600">Remove PIN</span>
                  </div>
                  <span className="text-gray-300 text-xl">›</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {saved && (
          <div className="text-center text-sm font-bold text-green-600 bg-green-50 rounded-xl py-2">
            ✓ Profile saved
          </div>
        )}
      </div>
    </div>
  );
}
