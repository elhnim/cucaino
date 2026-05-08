"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateKidProfile, setKidPin, clearKidPin } from "@/lib/actions/kids";
import type { Kid } from "@/lib/domain/types";


export default function ParentKidEditClient({ kid }: { kid: Kid }) {
  const router = useRouter();
  const [name, setName] = useState(kid.name);
  const [dateOfBirth, setDateOfBirth] = useState(kid.dateOfBirth ?? "");
  const [newPin, setNewPin] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
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
          Kid PIN {kid.pin ? "(currently set)" : "(not set)"}
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
          {kid.pin && (
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
