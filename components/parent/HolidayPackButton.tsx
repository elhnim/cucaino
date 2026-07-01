"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importHolidayPack } from "@/lib/actions/holiday";

export default function HolidayPackButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await importHolidayPack();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setMsg(
        res.imported > 0
          ? `Added ${res.imported} holiday activities!${res.skipped > 0 ? ` (${res.skipped} already there)` : ""}`
          : "All holiday activities are already in your list ✅",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="bg-amber-500 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "Adding…" : "🏖️ Holiday pack"}
      </button>
      {msg && <span className="text-[11px] font-semibold text-gray-500 max-w-[180px] text-right">{msg}</span>}
    </div>
  );
}
