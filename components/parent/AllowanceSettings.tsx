"use client";

import { useState, useTransition } from "react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  payDayOfWeek: number | null;
  weeklyAllowanceCents: number;
}

export default function AllowanceSettings({ payDayOfWeek, weeklyAllowanceCents }: Props) {
  const [day, setDay] = useState<number | null>(payDayOfWeek);
  const [amountDollars, setAmountDollars] = useState(
    weeklyAllowanceCents > 0 ? (weeklyAllowanceCents / 100).toFixed(2) : ""
  );
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const cents = Math.round(parseFloat(amountDollars || "0") * 100);
    startTransition(async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.from("families").update({
        pay_day_of_week: day,
        weekly_allowance_cents: cents,
      }).eq("id", (await supabase.from("families").select("id").maybeSingle()).data?.id ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-black text-gray-800">💰 Allowance & Payday</p>
        <p className="text-xs text-gray-500 mt-0.5">Weekly pocket money paid automatically on the chosen day. Strikes reduce the amount.</p>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-2">Pay day</label>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDay(day === i ? null : i)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  day === i
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Weekly amount (per kid)</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-bold">$</span>
            <input
              type="number"
              min={0}
              step={0.50}
              value={amountDollars}
              placeholder="0.00"
              onChange={(e) => setAmountDollars(e.target.value)}
              className="w-32 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-green-400"
            />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
          <p className="font-bold mb-1">Strike penalties</p>
          <p>1 strike → 75% · 2 strikes → 50% · 3+ strikes → $0</p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white disabled:opacity-50"
        >
          {saved ? "Saved ✓" : isPending ? "Saving…" : "Save allowance settings"}
        </button>
      </div>
    </div>
  );
}
