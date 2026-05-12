"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKid } from "@/lib/actions/kids";
import { THEMES } from "@/lib/themes/presets";
import type { ThemeId } from "@/lib/domain/types";

const AVATARS = ["🦊", "🐻", "🐼", "🦁", "🐯", "🐨", "🐸", "🐧", "🦄", "🐲", "🐙", "🦋", "🐬", "🦝", "🐺", "🐮"];
const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export default function NewKidPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [themeId, setThemeId] = useState<ThemeId>("adventure");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const save = () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setError(null);
    startTransition(async () => {
      const result = await createKid({
        name: name.trim(),
        avatar,
        themeId,
        dateOfBirth: dateOfBirth || null,
      });
      if (!result.ok) { setError(result.error); return; }
      router.push("/parent/settings");
    });
  };

  return (
    <div className="p-4 space-y-5 max-w-md mx-auto pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h1 className="text-xl font-black text-gray-900 flex-1">Add a kid</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold">⚠️ {error}</div>
      )}

      {/* Avatar */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Avatar</div>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center transition-transform ${
                avatar === a ? "ring-2 ring-indigo-500 bg-indigo-50 scale-110" : "bg-gray-100"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Name + DOB */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
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
      </div>

      {/* Theme */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Theme</div>
        <div className="grid grid-cols-2 gap-2">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setThemeId(id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                  themeId === id ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"
                }`}
              >
                <span>{t.decoration}</span>
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

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
          {isPending ? "Creating…" : "Add kid"}
        </button>
      </div>
    </div>
  );
}
