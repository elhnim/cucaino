"use client";

import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "chore", label: "Chores" },
  { value: "exercise", label: "Exercise" },
  { value: "music", label: "Music" },
  { value: "activity", label: "Activity" },
  { value: "personal", label: "Personal" },
  { value: "school_subject", label: "School Subject" },
];

export default function TaskFilterBar({
  category,
  kidId,
  kids,
}: {
  category: string;
  kidId: string;
  kids: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  function push(newCategory: string, newKidId: string) {
    const params = new URLSearchParams();
    if (newCategory) params.set("category", newCategory);
    if (newKidId) params.set("kid", newKidId);
    router.push(`/parent/tasks?${params.toString()}`);
  }

  const selectClass =
    "flex-1 flex items-center border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-indigo-400";

  return (
    <div className="flex gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
      <div className="flex-1 relative">
        <select
          className={selectClass}
          value={category}
          onChange={(e) => push(e.target.value, kidId)}
          style={{ width: "100%" }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>

      <div className="flex-1 relative">
        <select
          className={selectClass}
          value={kidId}
          onChange={(e) => push(category, e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">All Kids</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
    </div>
  );
}
