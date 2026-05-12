"use client";

import { useRouter } from "next/navigation";
import { PARENT_CATEGORIES } from "@/lib/registry/category-registry";

export default function TaskFilterBar({
  categories,
  kidIds,
  kids,
}: {
  categories: string[];
  kidIds: string[];
  kids: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  function push(cats: string[], kIds: string[]) {
    const params = new URLSearchParams();
    if (cats.length) params.set("category", cats.join(","));
    if (kIds.length) params.set("kid", kIds.join(","));
    const qs = params.toString();
    router.push(`/parent/tasks${qs ? `?${qs}` : ""}`);
  }

  const toggleCategory = (value: string) => {
    const next = categories.includes(value)
      ? categories.filter((c) => c !== value)
      : [...categories, value];
    push(next, kidIds);
  };

  const toggleKid = (id: string) => {
    const next = kidIds.includes(id)
      ? kidIds.filter((k) => k !== id)
      : [...kidIds, id];
    push(categories, next);
  };

  return (
    <div className="px-4 py-2.5 bg-white border-b border-gray-100">
      <div className="flex gap-1.5 flex-wrap">
        {PARENT_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggleCategory(c.id)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              categories.includes(c.id)
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.emoji} {c.label}
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
