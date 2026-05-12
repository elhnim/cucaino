"use client";

import { useRouter } from "next/navigation";
import { REWARD_TYPES } from "@/lib/registry/reward-type-registry";

export default function RewardFilterBar({
  types,
  kidIds,
  kids,
}: {
  types: string[];
  kidIds: string[];
  kids: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  function push(t: string[], k: string[]) {
    const params = new URLSearchParams();
    if (t.length) params.set("type", t.join(","));
    if (k.length) params.set("kid", k.join(","));
    const qs = params.toString();
    router.push(`/parent/rewards${qs ? `?${qs}` : ""}`);
  }

  const toggleType = (v: string) => {
    const next = types.includes(v) ? types.filter((t) => t !== v) : [...types, v];
    push(next, kidIds);
  };

  const toggleKid = (id: string) => {
    const next = kidIds.includes(id) ? kidIds.filter((k) => k !== id) : [...kidIds, id];
    push(types, next);
  };

  return (
    <div className="px-4 py-2.5 bg-white border-b border-gray-100">
      <div className="flex gap-1.5 flex-wrap">
        {REWARD_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleType(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              types.includes(t.id)
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
        {kids.length > 1 && kids.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => toggleKid(k.id)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              kidIds.includes(k.id)
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {k.name}
          </button>
        ))}
      </div>
    </div>
  );
}
