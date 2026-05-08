"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateFamilyName } from "@/lib/actions/parent-settings";

export default function FamilyNameEditor({ initialName }: { initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = () => {
    if (!value.trim() || value.trim() === saved) { setEditing(false); return; }
    startTransition(async () => {
      const result = await updateFamilyName(value.trim());
      if (result.ok) { setSaved(value.trim()); }
      else { setValue(saved); }
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(saved); setEditing(false); } }}
          className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          disabled={isPending}
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-sm font-bold text-white bg-indigo-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => { setValue(saved); setEditing(false); }}
          className="text-sm font-bold text-gray-500 px-2 py-1.5"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="font-bold text-gray-900">{saved}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-base text-gray-400 hover:text-indigo-600 transition-colors px-1"
        aria-label="Edit family name"
      >
        ✏️
      </button>
    </div>
  );
}
